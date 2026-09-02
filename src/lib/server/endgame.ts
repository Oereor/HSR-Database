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
  type EndgameOccurrenceShard
} from '$lib/domain/search-index';
import { getSearchIndex } from '$lib/server/generated';

const generatedRoot = path.resolve('src', 'lib', 'generated');
const datasetCache = new Map<EndgameMode, Promise<EndgameModeDataset>>();
const enemyCache = new Map<string, Promise<EndgameEnemyReference>>();
const groupViewCache = new Map<string, Promise<EndgameGroupView | undefined>>();

async function readJson<T>(...segments: string[]): Promise<T> {
  return JSON.parse(await readFile(path.join(generatedRoot, ...segments), 'utf8')) as T;
}

export function getEndgameDataset<TMode extends EndgameMode>(
  mode: TMode
): Promise<EndgameDatasetByMode[TMode]> {
  const cached = datasetCache.get(mode);
  if (cached) return cached as Promise<EndgameDatasetByMode[TMode]>;
  const pending = readJson<EndgameModeDataset>('endgame', `${mode}.json`).then((dataset) => {
    if (dataset.schemaVersion !== 22 || dataset.mode !== mode)
      throw new Error(`${mode} Endgame 数据 schema 或模式不匹配`);
    return dataset;
  });
  datasetCache.set(mode, pending);
  return pending as Promise<EndgameDatasetByMode[TMode]>;
}

function isFileNotFound(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

async function getEnemyReference(
  monsterId: number,
  templateId: number
): Promise<EndgameEnemyReference> {
  const key = endgameEnemyReferenceKey(monsterId, templateId);
  const cached = enemyCache.get(key);
  if (cached) return cached;
  const pending = Promise.all([
    readJson<EndgameEnemyDetailSource>('details', 'enemies', `${templateId}.json`)
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

export async function getEndgameLanding(): Promise<EndgameModeView[]> {
  return Promise.all(
    ENDGAME_MODES.map(async (mode) => buildModeView(mode, (await getEndgameDataset(mode)).groups))
  );
}

export async function getEndgameMode(mode: EndgameMode): Promise<EndgameModeView> {
  return buildModeView(mode, (await getEndgameDataset(mode)).groups);
}

async function buildResolvedGroupView(
  group: EndgameGroup,
  periods: EndgamePeriodView[]
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
      references.set(key, await getEnemyReference(monsterId, templateId))
    )
  );
  return buildGroupView(group, periods, references);
}

export async function getEndgameGroup(
  mode: EndgameMode,
  groupId: number
): Promise<EndgameGroupView | undefined> {
  const key = `${mode}:${groupId}`;
  const cached = groupViewCache.get(key);
  if (cached) return cached;
  const pending = getEndgameDataset(mode).then(async (dataset) => {
    const group = dataset.groups.find((candidate) => candidate.groupId === groupId);
    if (!group) return undefined;
    const periods = [...dataset.groups]
      .sort((a, b) => b.groupId - a.groupId)
      .map((candidate) => buildPeriodView(candidate));
    return buildResolvedGroupView(group, periods);
  });
  groupViewCache.set(key, pending);
  return pending;
}

function resolveEndgameGridItem(
  group: EndgameGroupView,
  locator: EndgameOccurrenceLocator
): EndgameEnemyGridItem | undefined {
  const stage =
    group.encounters[locator.encounterIndex]?.battles[locator.battleIndex]?.stages[
      locator.stageIndex
    ];
  const occurrence = stage?.waves[locator.waveIndex]?.enemies[locator.occurrenceIndex];
  if (!stage || !occurrence) return undefined;
  return { key: endgameOccurrenceLocatorKey(locator), occurrence, level: stage.level };
}

export async function getEndgameOccurrenceEntryIds(): Promise<Array<{ entryId: string }>> {
  return (await getSearchIndex()).endgameEnemies.map(({ entryId }) => ({ entryId }));
}

export async function getEndgameOccurrenceShard(
  entryId: string
): Promise<EndgameOccurrenceShard | undefined> {
  const entry = (await getSearchIndex()).endgameEnemies.find(
    (candidate) => candidate.entryId === entryId
  );
  if (!entry) return undefined;
  const groupKeys = [...new Set(entry.locators.map(({ mode, groupId }) => `${mode}:${groupId}`))];
  const groups = new Map<string, EndgameGroupView>();
  await Promise.all(
    groupKeys.map(async (key) => {
      const [mode, groupId] = key.split(':') as [EndgameMode, string];
      const group = await getEndgameGroup(mode, Number(groupId));
      if (!group) throw new Error(`Endgame locator 缺少赛期：${key}`);
      groups.set(key, group);
    })
  );
  const occurrences: Record<string, EndgameEnemyGridItem> = {};
  for (const locator of entry.locators) {
    const group = groups.get(`${locator.mode}:${locator.groupId}`)!;
    const item = resolveEndgameGridItem(group, locator);
    if (!item) throw new Error(`Endgame locator 无法解析：${endgameOccurrenceLocatorKey(locator)}`);
    occurrences[item.key] = item;
  }
  return {
    schemaVersion: 1,
    entryId,
    periods: groupKeys.map((key) => {
      const group = groups.get(key)!;
      return { mode: group.mode, period: group.period };
    }),
    occurrences
  };
}

export async function getEndgameGroupEntries(): Promise<
  Array<{ mode: EndgameMode; groupId: string }>
> {
  const datasets = await Promise.all(ENDGAME_MODES.map(getEndgameDataset));
  return datasets.flatMap((dataset) =>
    dataset.groups.map((group) => ({ mode: dataset.mode, groupId: String(group.groupId) }))
  );
}

export async function getEndgameRoutePaths(): Promise<string[]> {
  const entries = await getEndgameGroupEntries();
  return [
    '/endgame',
    ...ENDGAME_MODES.map((mode) => `/endgame/${mode}`),
    ...entries.map(({ mode, groupId }) => `/endgame/${mode}/${groupId}`)
  ];
}
