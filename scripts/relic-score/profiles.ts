import { createHash } from 'node:crypto';
import type { AvatarEquipmentRecommendation } from '../../src/lib/domain/types.js';
import type {
  CharacterProfileArtifact,
  CharacterRelicScoreProfile,
  ProfileCurve,
  TemplateId
} from '../../src/lib/relic-score/profile-types.js';
import {
  isRelicStatKey,
  relicStatSemantics,
  type RelicStatKey
} from '../../src/lib/relic-score/stat-registry.js';

export const PROFILE_GENERATOR_VERSION = 2;
export const ALLOWED_WEIGHTS = [0, 0.25, 0.5, 0.75, 1, 1.25] as const;
export const TEMPLATE_IDS: TemplateId[] = [
  'direct-dps',
  'direct-support',
  'break',
  'dot-dps',
  'debuff-support',
  'sustain',
  'hybrid-direct-break'
];
export type TemplateStatKey = RelicStatKey | 'scaling-stat' | 'other-recommended';

export interface ProfileTemplateConfig {
  schemaVersion: 1;
  templates: Record<TemplateId, Partial<Record<TemplateStatKey, number>>>;
}

export interface ProfilePolicyConfig {
  schemaVersion: 1;
  critRateDefault: {
    stat: 'CriticalChanceBase';
    value: number;
    postTargetWeight: number;
  };
}

export interface SourceBreakpoint {
  stat: RelicStatKey;
  value: number;
}

export interface SourceTarget extends SourceBreakpoint {
  postTargetWeight: number;
}

export interface ProfileOverride {
  templateId?: TemplateId;
  /** null records a deliberate decision that no scaling stat is needed. */
  scalingStat?: RelicStatKey | null;
  statWeights?: Partial<Record<RelicStatKey, number>>;
  hardBreakpoints?: SourceBreakpoint[];
  statTargets?: SourceTarget[];
  statCurves?: ProfileCurve[];
  reviewedInputDigest?: string;
  note?: string;
}

export interface ProfileOverrideConfig {
  schemaVersion: 2;
  overrides: Record<string, ProfileOverride>;
}

export interface ProfileCharacterSource {
  id: string;
  path?: string;
  equipmentRecommendation: AvatarEquipmentRecommendation;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, stableValue(item)])
    );
  return value;
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function profileInputDigest(
  character: ProfileCharacterSource,
  templates: ProfileTemplateConfig,
  override: ProfileOverride | undefined,
  policy: ProfilePolicyConfig
): string {
  const recommendation = character.equipmentRecommendation;
  const templateId = override?.templateId ?? inferTemplate(character).templateId;
  const template = templates.templates[templateId];
  const weights = resolveWeights(character, template, override);
  const defaultCritApplies =
    (weights.CriticalChanceBase ?? 0) > 0 &&
    !override?.statTargets?.some(({ stat }) => stat === 'CriticalChanceBase');
  const semanticFields = {
    templateId: override?.templateId,
    scalingStat: override?.scalingStat,
    statWeights: override?.statWeights,
    hardBreakpoints: override?.hardBreakpoints,
    statTargets: override?.statTargets,
    statCurves: override?.statCurves
  };
  const semanticOverride = Object.values(semanticFields).some((value) => value !== undefined)
    ? semanticFields
    : null;
  return createHash('sha256')
    .update(
      stableSerialize({
        schemaVersion: 2,
        generatorVersion: PROFILE_GENERATOR_VERSION,
        characterId: character.id,
        path: character.path ?? null,
        recommendation: {
          cavernSetIds: recommendation.cavernSetIds,
          planarSetIds: recommendation.planarSetIds,
          mainStatOptions: recommendation.mainStatOptions,
          subStatPropertyTypes: recommendation.subStatPropertyTypes
        },
        templateId,
        template,
        critRateDefault: defaultCritApplies ? policy.critRateDefault : null,
        override: semanticOverride
      })
    )
    .digest('hex');
}

function inferTemplate(character: ProfileCharacterSource): {
  templateId: TemplateId;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
} {
  const recommended = new Set(character.equipmentRecommendation.subStatPropertyTypes);
  const critRate = recommended.has('CriticalChanceBase');
  const critDamage = recommended.has('CriticalDamageBase');
  const critPair = critRate && critDamage;
  const breakEffect = recommended.has('BreakDamageAddedRatioBase');
  const effectHit = recommended.has('StatusProbabilityBase');
  const speed = recommended.has('SpeedDelta');
  const attack = recommended.has('AttackAddedRatio');
  const path = character.path;
  let templateId: TemplateId;
  if (critPair && breakEffect) templateId = 'hybrid-direct-break';
  else if (critPair) templateId = 'direct-dps';
  else if (breakEffect && !critRate && !critDamage) templateId = 'break';
  else if (effectHit && attack) templateId = 'dot-dps';
  else if (effectHit && speed) templateId = 'debuff-support';
  else if (path === 'Knight' || path === 'Priest') templateId = 'sustain';
  else if (path === 'Shaman') templateId = 'direct-support';
  else templateId = 'direct-dps';

  const reasons: string[] = [];
  if (path === 'Memory' || path === 'Elation') reasons.push('SPECIAL_PATH');
  if (critRate !== critDamage || (breakEffect && effectHit)) reasons.push('MIXED_STAT_SIGNALS');
  const matchesPrior =
    (['Warrior', 'Rogue', 'Mage'].includes(path ?? '') &&
      ['direct-dps', 'hybrid-direct-break', 'break'].includes(templateId)) ||
    (path === 'Warlock' &&
      ['dot-dps', 'debuff-support', 'break', 'direct-dps'].includes(templateId)) ||
    (path === 'Shaman' && templateId === 'direct-support') ||
    (['Knight', 'Priest'].includes(path ?? '') && templateId === 'sustain');
  if (!matchesPrior) reasons.push('PATH_TEMPLATE_MISMATCH');
  const confidence = reasons.includes('SPECIAL_PATH') ? 'low' : reasons.length ? 'medium' : 'high';
  return { templateId, confidence, reasons };
}

export function resolveScalingStat(character: ProfileCharacterSource): RelicStatKey | undefined {
  const candidates = character.equipmentRecommendation.subStatPropertyTypes.filter((key) =>
    ['AttackAddedRatio', 'HPAddedRatio', 'DefenceAddedRatio'].includes(key)
  );
  if (candidates.length === 1) return candidates[0] as RelicStatKey;
  if (candidates.length > 1) {
    const main = new Set(
      character.equipmentRecommendation.mainStatOptions.flatMap((option) => option.propertyTypes)
    );
    const supported = candidates.filter((key) => main.has(key));
    if (supported.length === 1) return supported[0] as RelicStatKey;
  }
  return undefined;
}

function resolveWeights(
  character: ProfileCharacterSource,
  template: ProfileTemplateConfig['templates'][TemplateId],
  override: ProfileOverride | undefined
): CharacterRelicScoreProfile['substatWeights'] {
  const recommended = character.equipmentRecommendation.subStatPropertyTypes;
  const scaling =
    override?.scalingStat === null
      ? undefined
      : (override?.scalingStat ?? resolveScalingStat(character));
  const weights: CharacterRelicScoreProfile['substatWeights'] = {};
  for (const key of [...recommended].sort()) {
    if (!isRelicStatKey(key) || !relicStatSemantics(key).canBeSubstat)
      throw new Error(
        `[relic-score/profile] unsupported recommended substat ${character.id}:${key}`
      );
    const weight =
      template[key] ??
      (key === scaling ? template['scaling-stat'] : undefined) ??
      template['other-recommended'] ??
      0;
    if (weight > 0) weights[key] = weight;
  }
  for (const [key, weight] of Object.entries(override?.statWeights ?? {})) {
    if (!recommended.includes(key))
      throw new Error(`[relic-score/profile] override stat not recommended ${character.id}:${key}`);
    if (weight === 0) delete weights[key as RelicStatKey];
    else weights[key as RelicStatKey] = weight;
  }
  return weights;
}

export function generateCharacterProfile(
  character: ProfileCharacterSource,
  templates: ProfileTemplateConfig,
  override: ProfileOverride | undefined,
  sourceCommit: string,
  policy: ProfilePolicyConfig
): CharacterRelicScoreProfile {
  const inferred = inferTemplate(character);
  const templateId = override?.templateId ?? inferred.templateId;
  const template = templates.templates[templateId];
  if (!template) throw new Error(`[relic-score/profile] unknown template ${templateId}`);
  const weights = resolveWeights(character, template, override);
  const reasons = [...inferred.reasons];
  if (
    template['scaling-stat'] !== undefined &&
    !resolveScalingStat(character) &&
    override?.scalingStat === undefined
  )
    reasons.push('AMBIGUOUS_SCALING');
  const digest = profileInputDigest(character, templates, override, policy);
  const reviewedInputDigest = override?.reviewedInputDigest ?? null;
  const reviewStatus = reviewedInputDigest
    ? reviewedInputDigest === digest
      ? 'reviewed'
      : 'needs-review'
    : inferred.confidence === 'high' && reasons.length === 0
      ? 'unreviewed'
      : 'needs-review';
  return {
    characterId: character.id,
    templateId,
    substatWeights: weights,
    hardBreakpoints: (override?.hardBreakpoints ?? []).map(({ stat, value }) => ({
      stat,
      panelTarget: relicStatSemantics(stat).panelTarget,
      value
    })),
    statTargets: [
      ...(override?.statTargets ?? []),
      ...((weights.CriticalChanceBase ?? 0) > 0 &&
      !override?.statTargets?.some(({ stat }) => stat === 'CriticalChanceBase')
        ? [policy.critRateDefault]
        : [])
    ]
      .map(({ stat, value, postTargetWeight }) => ({
        stat,
        panelTarget: relicStatSemantics(stat).panelTarget,
        value,
        postTargetWeight
      }))
      .sort((left, right) => left.stat.localeCompare(right.stat, 'en')),
    statCurves: override?.statCurves ?? [],
    metadata: {
      inferenceConfidence: inferred.confidence,
      reviewStatus,
      reviewReasons: reasons,
      inputDigest: digest,
      reviewedInputDigest,
      generatorVersion: PROFILE_GENERATOR_VERSION,
      sourceCommit
    }
  };
}

export function generateProfiles(
  characters: ProfileCharacterSource[],
  templates: ProfileTemplateConfig,
  overrides: ProfileOverrideConfig,
  sourceCommit: string,
  policy: ProfilePolicyConfig
): CharacterProfileArtifact {
  const sorted = [...characters].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  );
  return {
    schemaVersion: 2,
    profiles: sorted.map((character) =>
      generateCharacterProfile(
        character,
        templates,
        overrides.overrides[character.id],
        sourceCommit,
        policy
      )
    )
  };
}
