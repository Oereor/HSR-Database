import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getEnemyPortraitUrl } from '$lib/server/enemy-assets';
import type {
  EndgameDatasetByMode,
  EndgameGroup,
  EndgameMode,
  EndgameModeDataset
} from '$lib/domain/endgame';
import {
  buildGroupView,
  buildModeView,
  buildPeriodView,
  endgameEnemyReferenceKey,
  ENDGAME_MODES,
  resolveEndgameEnemyReference,
  type EndgameEnemyDetailSource,
  type EndgameEnemyGridItem,
  type EndgameEnemyReference,
  type EndgameGroupView,
  type EndgameModeView,
  type EndgamePeriodView
} from '$lib/domain/endgame-view';
import {
  endgameOccurrenceLocatorKey,
  type EndgameOccurrenceLocator,
  type EndgameOccurrenceShard,
  type SearchLocale
} from '$lib/domain/search-index';
import { getManifest, getSearchIndex } from '$lib/server/generated';
import { getEndgameModeCopy } from '$lib/i18n/endgame';

const generatedRoot = path.resolve('src', 'lib', 'generated', 'views');
const datasetCache = new Map<string, Promise<EndgameModeDataset>>();
const enemyCache = new Map<string, Promise<EndgameEnemyReference>>();
const groupViewCache = new Map<string, Promise<EndgameGroupView | undefined>>();

async function readJson<T>(locale: SearchLocale, ...segments: string[]): Promise<T> {
  return JSON.parse(await readFile(path.join(generatedRoot, locale, ...segments), 'utf8')) as T;
}

export function getEndgameDataset<TMode extends EndgameMode>(
  mode: TMode,
  locale: SearchLocale
): Promise<EndgameDatasetByMode[TMode]> {
  const key = `${locale}:${mode}`;
  const cached = datasetCache.get(key);
  if (cached) return cached as Promise<EndgameDatasetByMode[TMode]>;
  const pending = readJson<EndgameModeDataset>(locale, 'endgame', `${mode}.json`).then(
    (dataset) => {
      if (dataset.schemaVersion !== 23 || dataset.mode !== mode)
        throw new Error(`${mode} Endgame 数据 schema 或模式不匹配`);
      return dataset;
    }
  );
  datasetCache.set(key, pending);
  return pending as Promise<EndgameDatasetByMode[TMode]>;
}

function isFileNotFound(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

async function getEnemyReference(
  monsterId: number,
  templateId: number,
  locale: SearchLocale
): Promise<EndgameEnemyReference> {
  const key = `${locale}:${endgameEnemyReferenceKey(monsterId, templateId)}`;
  const cached = enemyCache.get(key);
  if (cached) return cached;
  const pending = Promise.all([
    readJson<EndgameEnemyDetailSource>(locale, 'details', 'enemies', `${templateId}.json`)
      .then((detail) => resolveEndgameEnemyReference(detail, monsterId))
      .catch((error: unknown) => {
        if (isFileNotFound(error)) return { weaknesses: [], exists: false };
        throw error;
      }),
    getEnemyPortraitUrl(templateId)
  ]).then(([reference, portraitUrl]) => ({
    ...reference,
    ...(portraitUrl ? { portraitUrl } : {})
  }));
  enemyCache.set(key, pending);
  return pending;
}

export async function getEndgameLanding(locale: SearchLocale): Promise<EndgameModeView[]> {
  return Promise.all(
    ENDGAME_MODES.map(async (mode) =>
      Object.assign(
        buildModeView(mode, (await getEndgameDataset(mode, locale)).groups),
        getEndgameModeCopy(mode)
      )
    )
  );
}

export async function getEndgameMode(
  mode: EndgameMode,
  locale: SearchLocale
): Promise<EndgameModeView> {
  return Object.assign(
    buildModeView(mode, (await getEndgameDataset(mode, locale)).groups),
    getEndgameModeCopy(mode)
  );
}

async function buildResolvedGroupView(
  group: EndgameGroup,
  periods: EndgamePeriodView[],
  locale: SearchLocale
): Promise<EndgameGroupView> {
  const referencedEnemies = new Map<string, { monsterId: number; templateId: number }>();
  for (const encounter of group.encounters)
    for (const battle of encounter.battles)
      for (const stage of battle.stages) {
        const occurrences =
          stage.waveModel.kind === 'fixed'
            ? stage.waveModel.waves.flatMap((wave) => wave.enemies)
            : stage.waveModel.waves.flatMap((wave) =>
                wave.monsterGroups.flatMap((monsterGroup) => monsterGroup.orderedEnemies)
              );
        for (const occurrence of occurrences) {
          const key = endgameEnemyReferenceKey(occurrence.monsterId, occurrence.monsterTemplateId);
          referencedEnemies.set(key, {
            monsterId: occurrence.monsterId,
            templateId: occurrence.monsterTemplateId
          });
        }
      }
  const references = new Map<string, EndgameEnemyReference>();
  await Promise.all(
    [...referencedEnemies.entries()].map(async ([key, { monsterId, templateId }]) =>
      references.set(key, await getEnemyReference(monsterId, templateId, locale))
    )
  );
  return Object.assign(buildGroupView(group, periods, references), {
    modeLabel: getEndgameModeCopy(group.mode).label
  });
}

export async function getEndgameGroup(
  mode: EndgameMode,
  groupId: number,
  locale: SearchLocale
): Promise<EndgameGroupView | undefined> {
  const key = `${locale}:${mode}:${groupId}`;
  const cached = groupViewCache.get(key);
  if (cached) return cached;
  const pending = getEndgameDataset(mode, locale).then(async (dataset) => {
    const group = dataset.groups.find((candidate) => candidate.groupId === groupId);
    if (!group) return undefined;
    const periods = [...dataset.groups]
      .sort((a, b) => b.groupId - a.groupId)
      .map((candidate) => buildPeriodView(candidate));
    return buildResolvedGroupView(group, periods, locale);
  });
  groupViewCache.set(key, pending);
  return pending;
}

function resolveEndgameGridItem(
  sourceGroup: EndgameGroup,
  group: EndgameGroupView,
  locator: EndgameOccurrenceLocator
): EndgameEnemyGridItem | undefined {
  const sourceEncounter = sourceGroup.encounters.find(({ id }) => id === locator.encounterId);
  const encounter = group.encounters.find(({ id }) => id === locator.encounterId);
  const sourceBattle = sourceEncounter?.battles.find(({ slot }) => slot === locator.battleSlot);
  const battle = encounter?.battles.find(({ slot }) => slot === locator.battleSlot);
  const stageIndex =
    sourceBattle?.stages.findIndex(({ stageId }) => stageId === locator.stageId) ?? -1;
  const sourceStage = stageIndex >= 0 ? sourceBattle?.stages[stageIndex] : undefined;
  const stage = stageIndex >= 0 ? battle?.stages[stageIndex] : undefined;
  if (!sourceStage || !stage || sourceStage.waveModel.kind !== locator.wave.kind) return undefined;
  const waveIndex = sourceStage.waveModel.waves.findIndex((wave) =>
    locator.wave.kind === 'fixed'
      ? 'wave' in wave && wave.wave === locator.wave.number
      : 'waveId' in wave && wave.waveId === locator.wave.infiniteWaveId
  );
  const occurrence =
    waveIndex >= 0
      ? stage.waves[waveIndex]?.enemies.find(({ monsterId }) => monsterId === locator.monsterId)
      : undefined;
  if (!occurrence) return undefined;
  return { key: endgameOccurrenceLocatorKey(locator), occurrence, level: stage.level };
}

export async function getEndgameOccurrenceTargetIds(): Promise<
  Array<{ locale: SearchLocale; targetId: string }>
> {
  const { publicLocales } = await getManifest();
  return (
    await Promise.all(
      publicLocales.map(async (locale) =>
        (await getSearchIndex(locale)).endgameTargets.map(({ id }) => ({ locale, targetId: id }))
      )
    )
  ).flat();
}

export async function getEndgameOccurrenceShard(
  targetId: string,
  locale: SearchLocale
): Promise<EndgameOccurrenceShard | undefined> {
  const entry = (await getSearchIndex(locale)).endgameTargets.find(
    (candidate) => candidate.id === targetId
  );
  if (!entry) return undefined;
  // Projected shards already own their localized text and period presentation.
  // Enrich them at the same asset boundary used by detail cards, without rebuilding
  // those fields with the server view's default presentation policy.
  const projected = await readFile(
    path.join(generatedRoot, locale, 'endgame-occurrences', entry.id),
    'utf8'
  )
    .then((text) => JSON.parse(text) as EndgameOccurrenceShard)
    .catch((error: unknown) => {
      if (isFileNotFound(error)) return undefined;
      throw error;
    });
  if (projected) {
    if (
      projected.schemaVersion !== 2 ||
      projected.locale !== locale ||
      projected.target.kind !== 'endgame' ||
      projected.target.id !== entry.id
    )
      throw new Error(`Endgame shard identity mismatch: ${locale}:${entry.id}`);
    await Promise.all(
      Object.values(projected.occurrences).map(async ({ occurrence }) => {
        const portraitUrl = await getEnemyPortraitUrl(occurrence.monsterTemplateId);
        if (portraitUrl) occurrence.portraitUrl = portraitUrl;
        else delete occurrence.portraitUrl;
      })
    );
    return projected;
  }
  // Locales without serialized occurrence artifacts retain the resolved view path.
  const groupKeys = [
    ...new Set(entry.occurrences.map(({ locator }) => `${locator.mode}:${locator.groupId}`))
  ];
  const groups = new Map<string, EndgameGroupView>();
  const sourceGroups = new Map<string, EndgameGroup>();
  await Promise.all(
    groupKeys.map(async (key) => {
      const [mode, groupId] = key.split(':') as [EndgameMode, string];
      const [group, dataset] = await Promise.all([
        getEndgameGroup(mode, Number(groupId), locale),
        getEndgameDataset(mode, locale)
      ]);
      if (!group) throw new Error(`Endgame locator 缺少赛期：${key}`);
      const sourceGroup = dataset.groups.find((candidate) => candidate.groupId === Number(groupId));
      if (!sourceGroup) throw new Error(`Endgame locator 缺少源赛期：${key}`);
      groups.set(key, group);
      sourceGroups.set(key, sourceGroup);
    })
  );
  const occurrences: Record<string, EndgameEnemyGridItem> = {};
  for (const { locator } of entry.occurrences) {
    const groupKey = `${locator.mode}:${locator.groupId}`;
    const group = groups.get(groupKey)!;
    const item = resolveEndgameGridItem(sourceGroups.get(groupKey)!, group, locator);
    if (!item) throw new Error(`Endgame locator 无法解析：${endgameOccurrenceLocatorKey(locator)}`);
    occurrences[item.key] = item;
  }
  return {
    schemaVersion: 2,
    locale,
    target: { kind: 'endgame', id: targetId },
    periods: groupKeys.map((key) => {
      const group = groups.get(key)!;
      return { mode: group.mode, period: group.period };
    }),
    occurrences
  };
}

export async function getEndgameGroupEntries(
  locale: SearchLocale
): Promise<Array<{ mode: EndgameMode; groupId: string }>> {
  const datasets = await Promise.all(ENDGAME_MODES.map((mode) => getEndgameDataset(mode, locale)));
  return datasets.flatMap((dataset) =>
    dataset.groups.map((group) => ({ mode: dataset.mode, groupId: String(group.groupId) }))
  );
}

export async function getEndgameRoutePaths(locale: SearchLocale): Promise<string[]> {
  const entries = await getEndgameGroupEntries(locale);
  return [
    '/endgame',
    ...ENDGAME_MODES.map((mode) => `/endgame/${mode}`),
    ...entries.map(({ mode, groupId }) => `/endgame/${mode}/${groupId}`)
  ];
}
