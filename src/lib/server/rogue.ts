import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  RogueDuDataset,
  RogueDuPageView,
  RogueMode,
  RoguePageView,
  RogueSuDataset,
  RogueSuMode,
  RogueSuPageView
} from '$lib/domain/rogue';
import { ROGUE_MODES, ROGUE_MODE_LABELS } from '$lib/domain/rogue';

const root = path.resolve('src', 'lib', 'generated', 'rogue');

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(path.join(root, file), 'utf8')) as T;
}

async function getSuMode(mode: RogueSuMode): Promise<RogueSuPageView> {
  const dataset = await readJson<RogueSuDataset>('su.json');
  if (dataset.schemaVersion !== 1 || dataset.kind !== 'su')
    throw new Error('Rogue SU 生成数据 schema 不匹配');
  const aeonIds = new Set(dataset.overlays[mode].aeonIds);
  return {
    kind: 'su',
    mode,
    label: ROGUE_MODE_LABELS[mode],
    paths: dataset.paths,
    blessings: dataset.blessings,
    baseResonances: dataset.baseResonances.filter((item) => aeonIds.has(item.aeonId)),
    enhancementGroups: dataset.enhancementGroups.filter((item) => aeonIds.has(item.aeonId)),
    crossResonances: dataset.crossResonances.filter((item) => item.availableIn === mode)
  };
}

async function getDuMode(): Promise<RogueDuPageView> {
  const dataset = await readJson<RogueDuDataset>('du-tourn3.json');
  if (dataset.schemaVersion !== 1 || dataset.kind !== 'du' || dataset.revision !== 'Tourn3')
    throw new Error('Rogue DU 生成数据不是受支持的 Tourn3 dataset');
  return {
    kind: 'du',
    mode: 'du',
    label: '差分宇宙',
    revisionLabel: dataset.revisionLabel,
    paths: dataset.paths,
    blessings: dataset.blessings,
    equations: dataset.equations
  };
}

export async function getRoguePage(mode: RogueMode): Promise<RoguePageView> {
  return mode === 'du' ? getDuMode() : getSuMode(mode);
}

export function getRogueRoutePaths(): string[] {
  return ['/rogue', ...ROGUE_MODES.map((mode) => `/rogue/${mode}`)];
}
