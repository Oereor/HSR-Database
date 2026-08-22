import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getEnemyPortraitUrl } from '$lib/server/enemy-assets';
import type { EndgameDatasetByMode, EndgameMode, EndgameModeDataset } from '$lib/domain/endgame';
import {
  buildGroupView,
  buildModeView,
  buildPeriodView,
  endgameEnemyReferenceKey,
  ENDGAME_MODES,
  resolveEndgameEnemyReference,
  type EndgameEnemyDetailSource,
  type EndgameEnemyReference,
  type EndgameGroupView,
  type EndgameModeView
} from '$lib/domain/endgame-view';

const generatedRoot = path.resolve('src', 'lib', 'generated');
const datasetCache = new Map<EndgameMode, Promise<EndgameModeDataset>>();
const enemyCache = new Map<string, Promise<EndgameEnemyReference>>();

async function readJson<T>(...segments: string[]): Promise<T> {
  return JSON.parse(await readFile(path.join(generatedRoot, ...segments), 'utf8')) as T;
}

export function getEndgameDataset<TMode extends EndgameMode>(
  mode: TMode
): Promise<EndgameDatasetByMode[TMode]> {
  const cached = datasetCache.get(mode);
  if (cached) return cached as Promise<EndgameDatasetByMode[TMode]>;
  const pending = readJson<EndgameModeDataset>('endgame', `${mode}.json`).then((dataset) => {
    if (dataset.schemaVersion !== 20 || dataset.mode !== mode)
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

export async function getEndgameGroup(
  mode: EndgameMode,
  groupId: number
): Promise<EndgameGroupView | undefined> {
  const dataset = await getEndgameDataset(mode);
  const group = dataset.groups.find((candidate) => candidate.groupId === groupId);
  if (!group) return undefined;
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
  return buildGroupView(
    group,
    [...dataset.groups]
      .sort((a, b) => b.groupId - a.groupId)
      .map((candidate) => buildPeriodView(candidate)),
    references
  );
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
