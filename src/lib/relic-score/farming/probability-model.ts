import type { RelicSlot } from '../../domain/types.js';
import type { PlayerRuntimeAffix, PlayerRuntimeData } from '../../player/runtime-data.js';
import { buildRelicScoreReferenceData, relicSlotFromNumber } from '../reference.js';
import { RELIC_STAT_REGISTRY, isRelicStatKey, type RelicStatKey } from '../stat-registry.js';

export type ProvenanceClass =
  'upstream-derived' | 'maintainer-approved-probability-fact' | 'v1-simulation-assumption';

export interface ProbabilityModelConfig {
  schemaVersion: 1;
  modelVersion: string;
  mainStatProbabilities: Record<
    'BODY' | 'FOOT' | 'NECK' | 'OBJECT',
    Array<{ stat: RelicStatKey; probability: number }>
  >;
  substatSelectionWeights: Array<{ stat: RelicStatKey; weight: number }>;
  initialSubstatModel: { threeProbability: number; fourProbability: number };
  rollGradeModel: { policy: 'uniform-step-num-inclusive' };
  enhancementModel: {
    maxLevel: 15;
    nodes: [3, 6, 9, 12, 15];
    threeInitialFirstNode: 'reveal-fourth';
    targetPolicy: 'uniform-existing';
  };
  metadata: Record<
    | 'mainStatProbabilities'
    | 'substatSelectionWeights'
    | 'affixValuesAndLegality'
    | 'initialSubstatModel'
    | 'rollGradeModel'
    | 'enhancementModel',
    { class: ProvenanceClass; source: string }
  >;
}

export interface CompiledMainStat {
  key: RelicStatKey;
  probability: number;
  value: number;
}

export interface CompiledSubstat {
  key: RelicStatKey;
  weight: number;
  affix: PlayerRuntimeAffix;
  highRoll: number;
}

export interface CompiledProbabilityModel {
  config: ProbabilityModelConfig;
  mainBySlot: Record<RelicSlot, readonly CompiledMainStat[]>;
  substats: readonly CompiledSubstat[];
  subByKey: Partial<Record<RelicStatKey, CompiledSubstat>>;
}

const SLOTS: RelicSlot[] = ['HEAD', 'HAND', 'BODY', 'FOOT', 'NECK', 'OBJECT'];
const VARIABLE_SLOTS = ['BODY', 'FOOT', 'NECK', 'OBJECT'] as const;
const PROVENANCE: ProbabilityModelConfig['metadata'] = {
  mainStatProbabilities: { class: 'maintainer-approved-probability-fact', source: '' },
  substatSelectionWeights: { class: 'maintainer-approved-probability-fact', source: '' },
  affixValuesAndLegality: { class: 'upstream-derived', source: '' },
  initialSubstatModel: { class: 'v1-simulation-assumption', source: '' },
  rollGradeModel: { class: 'v1-simulation-assumption', source: '' },
  enhancementModel: { class: 'v1-simulation-assumption', source: '' }
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`[relic-score/farming] ${label} must be an object`);
  return value as Record<string, unknown>;
}

function positive(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    throw new Error(`[relic-score/farming] ${label} must be finite and positive`);
  return value;
}

function sameKeys(actual: Iterable<string>, expected: Iterable<string>, label: string): void {
  if (JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort()))
    throw new Error(`[relic-score/farming] ${label} closure mismatch`);
}

function entries(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.length)
    throw new Error(`[relic-score/farming] ${label} must be a nonempty array`);
  return value.map((entry, index) => object(entry, `${label}[${index}]`));
}

/** Validate once and compile small sampling tables; never mutates the supplied runtime or config. */
export function compileProbabilityModel(
  raw: unknown,
  runtime: PlayerRuntimeData
): CompiledProbabilityModel {
  const root = object(raw, 'model');
  if (root.schemaVersion !== 1 || root.modelVersion !== 'natural-5star-v1')
    throw new Error('[relic-score/farming] model version');
  const reference = buildRelicScoreReferenceData(runtime);
  const fiveStar = Object.values(runtime.relics).filter((relic) => relic.rarity === 5);
  if (fiveStar.some((relic) => relic.maxLevel !== 15))
    throw new Error('[relic-score/farming] 5-star max level');
  const mainConfig = object(root.mainStatProbabilities, 'mainStatProbabilities');
  sameKeys(Object.keys(mainConfig), VARIABLE_SLOTS, 'main slot');
  const mainBySlot = {} as Record<RelicSlot, CompiledMainStat[]>;
  for (const slot of SLOTS) {
    const allowed = reference.mainAt15[slot];
    if (slot === 'HEAD' || slot === 'HAND') {
      const fixed = Object.entries(allowed);
      if (fixed.length !== 1) throw new Error(`[relic-score/farming] ${slot} fixed main`);
      mainBySlot[slot] = [
        { key: fixed[0][0] as RelicStatKey, probability: 1, value: fixed[0][1]! }
      ];
      continue;
    }
    const seen = new Set<string>();
    const compiled = entries(mainConfig[slot], `${slot} main`).map((entry) => {
      const key = entry.stat;
      if (typeof key !== 'string' || !isRelicStatKey(key) || allowed[key] === undefined)
        throw new Error(`[relic-score/farming] illegal main ${slot}:${String(key)}`);
      if (seen.has(key)) throw new Error(`[relic-score/farming] duplicate main ${slot}:${key}`);
      seen.add(key);
      return {
        key,
        probability: positive(entry.probability, `${slot}:${key} probability`),
        value: allowed[key]
      };
    });
    sameKeys(seen, Object.keys(allowed), `${slot} main`);
    if (Math.abs(compiled.reduce((sum, item) => sum + item.probability, 0) - 1) > 1e-9)
      throw new Error(`[relic-score/farming] ${slot} main probability total`);
    mainBySlot[slot] = compiled;
  }

  const groups = new Set(fiveStar.map((relic) => relic.subAffixGroup));
  if (groups.size !== 1) throw new Error('[relic-score/farming] 5-star sub group');
  const subGroup = [...groups][0];
  const affixes = new Map<RelicStatKey, PlayerRuntimeAffix>();
  for (const [identity, affix] of Object.entries(runtime.relicSubAffixes)) {
    if (!identity.startsWith(`${subGroup}:`)) continue;
    if (!isRelicStatKey(affix.propertyType) || !RELIC_STAT_REGISTRY[affix.propertyType].sub)
      throw new Error(`[relic-score/farming] illegal runtime sub ${identity}`);
    if (affixes.has(affix.propertyType))
      throw new Error(`[relic-score/farming] duplicate runtime sub ${affix.propertyType}`);
    positive(affix.baseValue, `${identity} BaseValue`);
    positive(affix.stepValue, `${identity} StepValue`);
    if (!Number.isSafeInteger(affix.stepNum) || (affix.stepNum ?? 0) < 1)
      throw new Error(`[relic-score/farming] invalid StepNum ${identity}`);
    affixes.set(affix.propertyType, affix);
  }
  const seen = new Set<string>();
  const substats = entries(root.substatSelectionWeights, 'substatSelectionWeights').map((entry) => {
    const key = entry.stat;
    if (typeof key !== 'string' || !isRelicStatKey(key) || !affixes.has(key))
      throw new Error(`[relic-score/farming] illegal sub weight ${String(key)}`);
    if (seen.has(key)) throw new Error(`[relic-score/farming] duplicate sub weight ${key}`);
    seen.add(key);
    return {
      key,
      weight: positive(entry.weight, `${key} weight`),
      affix: affixes.get(key)!,
      highRoll: reference.subHighRoll[key]!
    };
  });
  sameKeys(seen, affixes.keys(), 'substat weight');

  const initial = object(root.initialSubstatModel, 'initialSubstatModel');
  const three = positive(initial.threeProbability, 'threeProbability');
  const four = positive(initial.fourProbability, 'fourProbability');
  if (Math.abs(three + four - 1) > 1e-9)
    throw new Error('[relic-score/farming] initial probability total');
  const grade = object(root.rollGradeModel, 'rollGradeModel');
  if (grade.policy !== 'uniform-step-num-inclusive')
    throw new Error('[relic-score/farming] unsupported grade policy');
  const enhancement = object(root.enhancementModel, 'enhancementModel');
  if (
    enhancement.maxLevel !== 15 ||
    JSON.stringify(enhancement.nodes) !== '[3,6,9,12,15]' ||
    enhancement.threeInitialFirstNode !== 'reveal-fourth' ||
    enhancement.targetPolicy !== 'uniform-existing'
  )
    throw new Error('[relic-score/farming] unsupported enhancement policy');
  const metadata = object(root.metadata, 'metadata');
  sameKeys(Object.keys(metadata), Object.keys(PROVENANCE), 'provenance');
  for (const [key, expected] of Object.entries(PROVENANCE)) {
    const entry = object(metadata[key], `metadata.${key}`);
    if (entry.class !== expected.class || typeof entry.source !== 'string' || !entry.source.trim())
      throw new Error(`[relic-score/farming] invalid provenance ${key}`);
  }
  // This mapping must continue to match the current runtime slot inventory.
  sameKeys(new Set(fiveStar.map((relic) => relicSlotFromNumber(relic.slot))), SLOTS, '5-star slot');
  return {
    config: raw as ProbabilityModelConfig,
    mainBySlot,
    substats,
    subByKey: Object.fromEntries(substats.map((entry) => [entry.key, entry]))
  };
}
