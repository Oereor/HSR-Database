import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  assertRelicScoreRecommendations,
  type RelicScoreRecommendation
} from '../../src/lib/relic-score/recommendations.js';
import {
  benchmarkSha256,
  stableBenchmarkSerialize
} from '../../src/lib/relic-score/benchmark/identity.js';
import {
  deriveRatingV2Profile,
  validateRatingV2Profile,
  MAIN_MAPPING_VERSION,
  SUB_MAPPING_VERSION,
  UTILITY_VERSION,
  STAT_CATEGORY,
  WEIGHT_CATEGORIES,
  type PreferenceRow,
  type RatingV2Profiles
} from '../../src/lib/relic-score/v2/profile.js';
import { isRelicStatKey } from '../../src/lib/relic-score/stat-registry.js';
import { mergeConfigSources, readTable } from './raw.js';
import {
  assertRatingV2Overrides,
  exceptionsFor,
  type RatingV2Overrides
} from '../../src/lib/relic-score/v2/overrides.js';

export const ratingV2PolicyFile = path.resolve(
  import.meta.dirname,
  '../../data/relic-score/v2/profile-overrides.json'
);
export async function readRatingV2PolicyInput(file = ratingV2PolicyFile) {
  const bytes = await readFile(file);
  return {
    value: JSON.parse(bytes.toString('utf8')) as unknown,
    metadata: {
      schemaVersion: 1 as const,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex')
    }
  };
}

export async function readRatingV2BenchmarkInput() {
  const root = path.resolve(import.meta.dirname, '../../data/relic-score/v2');
  const [benchmark, audit] = await Promise.all([
    readFile(path.join(root, 'farming-benchmarks.json')),
    readFile(path.join(root, 'benchmark-generation-audit.json'))
  ]);
  return {
    schemaVersion: 4 as const,
    bytes: benchmark.length,
    sha256: createHash('sha256').update(benchmark).digest('hex'),
    auditSha256: createHash('sha256').update(audit).digest('hex')
  };
}

export const RATING_V2_TABLE_NAMES = [
  'RelicMainAffixAvatarValue',
  'RelicSubAffixAvatarValue',
  'RelicMainAffixBaseValue',
  'RelicSubAffixBaseValue'
] as const;
export const RATING_V2_SOURCE_NAMES = [
  ...RATING_V2_TABLE_NAMES,
  'AvatarConfig',
  'AvatarConfigLD',
  'AvatarRelicRecommend',
  'AvatarRelicRecommendLD'
] as const;
type Raw = Record<string, unknown>;
function record(value: unknown): Raw {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid Rating V2 source row');
  return value as Raw;
}
function unique(rows: unknown[], field: string, label: string): Map<string, Raw> {
  const result = new Map<string, Raw>();
  for (const value of rows) {
    const row = record(value);
    const id = row[field];
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || result.has(String(id)))
      throw new Error(`Invalid or duplicate ${label} ${String(id)}`);
    result.set(String(id), row);
  }
  return result;
}
export function parsePreferenceRows(
  rows: unknown[],
  kind: 'main' | 'sub'
): Map<string, PreferenceRow> {
  return new Map(
    [...unique(rows, 'AvatarID', `${kind} AvatarID`)].map(([id, row]) => {
      const parsed: PreferenceRow = { AvatarID: Number(id) };
      for (const [field, raw] of Object.entries(row)) {
        if (field === 'AvatarID') continue;
        if (
          !WEIGHT_CATEGORIES.includes(field as (typeof WEIGHT_CATEGORIES)[number]) ||
          (kind === 'main' && field === 'StatusResistance') ||
          (kind === 'sub' && ['DamageAddedRatio', 'SPRatio', 'HealRatio'].includes(field)) ||
          !(
            typeof raw === 'number' ||
            (typeof raw === 'string' && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw))
          )
        )
          throw new Error(`Invalid ${kind} field ${id}:${field}`);
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0 || value > 1)
          throw new Error(`Invalid preference ${id}:${field}`);
        parsed[field as (typeof WEIGHT_CATEGORIES)[number]] = value;
      }
      return [id, parsed];
    })
  );
}
function validateBaseMapping(rows: unknown[], kind: 'Main' | 'Sub'): void {
  const seen = new Set<string>();
  for (const value of rows) {
    const row = record(value);
    const key = row[`Relic${kind}Affix`];
    if (
      typeof key !== 'string' ||
      !isRelicStatKey(key) ||
      STAT_CATEGORY[key] !== row.Type ||
      seen.has(key)
    )
      throw new Error(`Unknown/conflicting ${kind} BaseValue mapping ${String(key)}`);
    seen.add(key);
    // BaseValue magnitudes are evidence only. They never multiply V2 utility.
    const allowed =
      kind === 'Main'
        ? [`Relic${kind}Affix`, 'Type', 'BaseValue', 'ValuePerLevel']
        : [`Relic${kind}Affix`, 'Type', 'BaseValue'];
    if (Object.keys(row).some((field) => !allowed.includes(field)))
      throw new Error(`Unknown ${kind} BaseValue field`);
    for (const field of allowed.filter(
      (field) => field === 'BaseValue' || field === 'ValuePerLevel'
    ))
      if (
        row[field] === undefined ||
        !Number.isFinite(Number(row[field])) ||
        Number(row[field]) <= 0
      )
        throw new Error(`Invalid ${kind} BaseValue ${String(key)}:${field}`);
  }
  const expected = Object.keys(STAT_CATEGORY).filter((key) =>
    kind === 'Main'
      ? STAT_CATEGORY[key as keyof typeof STAT_CATEGORY] !== 'StatusResistance'
      : !['DamageAddedRatio', 'SPRatio', 'HealRatio'].includes(
          STAT_CATEGORY[key as keyof typeof STAT_CATEGORY]
        )
  );
  if ([...seen].sort().join() !== expected.sort().join())
    throw new Error(`Incomplete ${kind} BaseValue mapping`);
}
function rawRecommendation(id: string, row: Raw): RelicScoreRecommendation {
  const strings = (value: unknown): string[] => {
    if (!Array.isArray(value) || value.some((item) => !['string', 'number'].includes(typeof item)))
      throw new Error(`Invalid recommendations ${id}`);
    return value.map(String);
  };
  return {
    avatarId: id,
    cavernSetIds: strings(row.Set4IDList),
    planarSetIds: strings(row.Set2IDList),
    mainStatOptions: (['BODY', 'FOOT', 'NECK', 'OBJECT'] as const).map((slot, index) => ({
      slot,
      propertyTypes: strings(row[`PropertyList${index + 3}`])
    })),
    subStatPropertyTypes: strings(row.SubAffixPropertyList)
  };
}
export async function buildRatingV2Profiles(
  root: string,
  tables: Record<string, unknown[]>,
  sourceCommit: string,
  policyFile = ratingV2PolicyFile
): Promise<RatingV2Profiles> {
  const sourceFiles = await readdir(path.join(root, 'ExcelOutput'));
  if (sourceFiles.some((file) => /^Relic(?:Main|Sub)AffixAvatarValue.+\.json$/.test(file)))
    throw new Error('Unknown additional AvatarValue source; explicit LD source review required');
  const main = parsePreferenceRows(tables.RelicMainAffixAvatarValue, 'main');
  const sub = parsePreferenceRows(tables.RelicSubAffixAvatarValue, 'sub');
  validateBaseMapping(tables.RelicMainAffixBaseValue, 'Main');
  validateBaseMapping(tables.RelicSubAffixBaseValue, 'Sub');
  const avatars = unique(tables.AvatarConfig, 'AvatarID', 'AvatarConfig');
  const recommendations = unique(tables.AvatarRelicRecommend, 'AvatarID', 'AvatarRelicRecommend');
  const ids = [...avatars.keys()].sort();
  const policyInput = await readRatingV2PolicyInput(policyFile);
  const policy = policyInput.value;
  assertRatingV2Overrides(policy, ids, sourceCommit);
  for (const [label, index] of [
    ['main', main],
    ['sub', sub],
    ['recommendations', recommendations]
  ] as const)
    if (JSON.stringify([...index.keys()].sort()) !== JSON.stringify(ids))
      throw new Error(`Rating V2 ${label} coverage mismatch`);
  const profiles = ids.map((id) => {
    const recommendation = rawRecommendation(id, recommendations.get(id)!);
    assertRelicScoreRecommendations({ [id]: recommendation });
    const element = avatars.get(id)!.DamageType;
    if (typeof element !== 'string') throw new Error(`Missing DamageType ${id}`);
    return deriveRatingV2Profile({
      characterId: id,
      element,
      main: main.get(id)!,
      sub: sub.get(id)!,
      recommendation,
      exceptions: exceptionsFor(policy, id)
    });
  });
  const sourceDigests = await ratingV2SourceDigests(root);
  return {
    schemaVersion: 5,
    algorithmVersion: 2,
    sourceCommit,
    sourceDigests,
    overrideDigest: benchmarkSha256(policy),
    mainMappingVersion: MAIN_MAPPING_VERSION,
    subMappingVersion: SUB_MAPPING_VERSION,
    utilityVersion: UTILITY_VERSION,
    semanticDigest: benchmarkSha256(profiles),
    profiles
  };
}
export async function ratingV2SourceDigests(root: string): Promise<Record<string, string>> {
  return Object.fromEntries(
    await Promise.all(
      RATING_V2_SOURCE_NAMES.map(
        async (name) =>
          [
            name,
            createHash('sha256')
              .update(await readFile(path.join(root, 'ExcelOutput', `${name}.json`)))
              .digest('hex')
          ] as const
      )
    )
  );
}
export async function loadRatingV2Tables(root: string): Promise<Record<string, unknown[]>> {
  const tables: Record<string, unknown[]> = Object.fromEntries(
    await Promise.all(
      RATING_V2_SOURCE_NAMES.map(async (name) => [name, await readTable(root, name)])
    )
  );
  for (const name of ['AvatarConfig', 'AvatarRelicRecommend'])
    tables[name] = mergeConfigSources(
      name,
      [
        { name, rows: tables[name] },
        { name: `${name}LD`, rows: tables[`${name}LD`] }
      ],
      (value) => String(record(value).AvatarID)
    );
  return tables;
}
export function assertRatingV2Profiles(
  value: unknown,
  expectedIds: readonly string[],
  sourceCommit: string,
  policy: RatingV2Overrides
): asserts value is RatingV2Profiles {
  const artifact = record(value);
  if (
    artifact.schemaVersion !== 5 ||
    artifact.algorithmVersion !== 2 ||
    artifact.sourceCommit !== sourceCommit ||
    artifact.mainMappingVersion !== MAIN_MAPPING_VERSION ||
    artifact.subMappingVersion !== SUB_MAPPING_VERSION ||
    artifact.utilityVersion !== UTILITY_VERSION ||
    artifact.overrideDigest !== benchmarkSha256(policy) ||
    !Array.isArray(artifact.profiles) ||
    benchmarkSha256(artifact.profiles) !== artifact.semanticDigest
  )
    throw new Error('Invalid/stale Rating V2 profile artifact');
  const profiles = artifact.profiles as RatingV2Profiles['profiles'];
  assertRatingV2Overrides(policy, expectedIds, sourceCommit);
  if (
    stableBenchmarkSerialize(profiles.map((profile) => profile.characterId).sort()) !==
    stableBenchmarkSerialize([...expectedIds].sort())
  )
    throw new Error('Rating V2 profile closure mismatch');
  const digests = record(artifact.sourceDigests);
  if (
    Object.keys(digests).sort().join() !== [...RATING_V2_SOURCE_NAMES].sort().join() ||
    Object.values(digests).some(
      (digest) => typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)
    )
  )
    throw new Error('Invalid Rating V2 source digests');
  for (const profile of profiles) {
    validateRatingV2Profile(profile, exceptionsFor(policy, profile.characterId));
    if (
      !['ready', 'needs-review'].includes(profile.status) ||
      !Array.isArray(profile.anomalies) ||
      (profile.status === 'ready') !== (profile.anomalies.length === 0)
    )
      throw new Error('Invalid Rating V2 review status');
    assertRelicScoreRecommendations({ [profile.characterId]: profile.recommendation });
    for (const value of Object.values(profile.effectiveSubWeights))
      if (!Number.isFinite(value) || value < 0 || value > 1)
        throw new Error('Invalid Rating V2 effective weight');
  }
}
