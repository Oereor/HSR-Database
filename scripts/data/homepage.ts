import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { HomepageVersionData } from '../../src/lib/domain/types.js';
import { canonicalJsonDigest, parseGameVersion } from './source-metadata.js';
import { siteRoot } from './paths.js';

export const homepageCategories = ['characters', 'light-cones', 'relics', 'enemies'] as const;
export type HomepageCategory = (typeof homepageCategories)[number];
export type EntityIds = Record<HomepageCategory, string[]>;
export interface HistoryCommit {
  sha: string;
  subject: string;
  parent: string | null;
}
export interface HomepageBaseline {
  schemaVersion: 1;
  repository: string;
  gameVersion: string;
  baselineVersion: string;
  baselineCommit: string;
  evidence: HistoryCommit[];
  ids: EntityIds;
  digest: string;
}
export const compareEntityIds = (a: string, b: string) =>
  a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
export function sortedIds(ids: string[]): string[] {
  if (ids.some((id) => !/^[1-9]\d*$/.test(id)))
    throw new Error('Homepage contains invalid entity ID');
  return [...new Set(ids)].sort(compareEntityIds);
}

/** Same identity inventory as the domain builders; LD supplements regular avatars. */
export function extractHomepageIds(
  tables: Record<string, Array<Record<string, unknown>>>
): EntityIds {
  const take = (name: string, key: string) => {
    if (!Array.isArray(tables[name])) throw new Error(`Homepage missing identity table ${name}`);
    return tables[name].map((row) => String(row[key]));
  };
  return {
    characters: sortedIds([
      ...take('AvatarConfig', 'AvatarID'),
      ...take('AvatarConfigLD', 'AvatarID')
    ]),
    'light-cones': sortedIds(take('EquipmentConfig', 'EquipmentID')),
    relics: sortedIds(take('RelicSetConfig', 'SetID')),
    enemies: sortedIds(take('MonsterTemplateConfig', 'MonsterTemplateID'))
  };
}

export function selectPreviousVersion(evidence: HistoryCommit[]) {
  const current = parseGameVersion(evidence[0]?.subject ?? '').gameVersion;
  if (!current) throw new Error('Homepage pin has no production game version');
  for (let i = 0; i < evidence.length; i++) {
    const entry = evidence[i];
    if (
      !/^[a-f0-9]{40}$/.test(entry.sha) ||
      (entry.parent !== null && !/^[a-f0-9]{40}$/.test(entry.parent))
    )
      throw new Error('Homepage invalid commit identity');
    if (i && evidence[i - 1].parent !== entry.sha)
      throw new Error('Homepage disconnected history evidence');
    const version = parseGameVersion(entry.subject).gameVersion;
    if (!version) throw new Error(`Homepage unrecognized version in history: ${entry.sha}`);
    if (version !== current) {
      const [a, b] = current.split('.').map(Number);
      const [x, y] = version.split('.').map(Number);
      if (x > a || (x === a && y >= b)) throw new Error('Homepage history version regression');
      if (i !== evidence.length - 1) throw new Error('Homepage extraneous baseline evidence');
      return { gameVersion: current, baselineVersion: version, baselineCommit: entry.sha };
    }
  }
  throw new Error('Homepage missing previous game-version baseline; run pnpm upstreams:update');
}

export function assertBaseline(data: HomepageBaseline): void {
  if (
    data.schemaVersion !== 1 ||
    !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/.test(data.repository)
  )
    throw new Error('Homepage unsupported baseline schema/repository');
  const selected = selectPreviousVersion(data.evidence);
  if (Object.entries(selected).some(([key, value]) => data[key as keyof typeof selected] !== value))
    throw new Error('Homepage baseline metadata differs from history');
  for (const category of homepageCategories)
    if (JSON.stringify(data.ids[category]) !== JSON.stringify(sortedIds(data.ids[category])))
      throw new Error('Homepage baseline IDs must be sorted and unique');
  const { digest, ...contents } = data;
  if (canonicalJsonDigest(contents) !== digest)
    throw new Error('Homepage baseline digest mismatch');
}

export async function loadHomepageBaseline(
  sourceCommit: string,
  root = siteRoot
): Promise<HomepageBaseline> {
  try {
    const lock = JSON.parse(await readFile(path.join(root, 'upstream.lock.json'), 'utf8'));
    const data: HomepageBaseline = JSON.parse(
      await readFile(path.join(root, 'data/homepage', `${sourceCommit}.json`), 'utf8')
    );
    assertBaseline(data);
    if (
      data.evidence[0].sha !== sourceCommit ||
      data.repository !== lock.turnBasedGameData.repository
    )
      throw new Error('Homepage baseline source mismatch');
    return data;
  } catch (cause) {
    throw new Error(
      'Homepage trusted baseline unavailable; run pnpm upstreams:update and commit data/homepage/',
      { cause }
    );
  }
}

export function buildHomepageVersionData(
  baseline: HomepageBaseline,
  current: EntityIds,
  gameVersion: string | null
): HomepageVersionData {
  assertBaseline(baseline);
  if (gameVersion !== baseline.gameVersion)
    throw new Error('Homepage current game version mismatch');
  const additions = Object.fromEntries(
    homepageCategories.map((category) => {
      const previous = new Set(baseline.ids[category]);
      return [category, sortedIds(current[category]).filter((id) => !previous.has(id))];
    })
  ) as EntityIds;
  return {
    schemaVersion: 2,
    gameVersion,
    baseline: {
      version: baseline.baselineVersion,
      repository: baseline.repository,
      commit: baseline.baselineCommit,
      digest: baseline.digest
    },
    additions
  };
}

export function assertHomepageVersionData(
  data: HomepageVersionData,
  catalogs: Record<HomepageCategory, Array<{ id: string }>>
): void {
  if (
    data.schemaVersion !== 2 ||
    !/^\d+\.\d+$/.test(data.gameVersion) ||
    !/^\d+\.\d+$/.test(data.baseline.version) ||
    !/^[a-f0-9]{64}$/.test(data.baseline.digest) ||
    !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/.test(data.baseline.repository) ||
    !/^[a-f0-9]{40}$/.test(data.baseline.commit)
  )
    throw new Error('Homepage invalid version data');
  for (const category of homepageCategories) {
    const ids = data.additions[category];
    const available = new Set(catalogs[category].map(({ id }) => id));
    if (
      JSON.stringify(ids) !== JSON.stringify(sortedIds(ids)) ||
      ids.some((id) => !available.has(id))
    )
      throw new Error(`Homepage invalid catalog selection: ${category}`);
  }
}
