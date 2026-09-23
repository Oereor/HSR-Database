import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AvatarEquipmentRecommendation } from '../../src/lib/domain/types.js';
import { PLAYER_PROPERTY_SEMANTICS } from '../../src/lib/player/property-semantics.js';
import { assertPlayerRuntimeData } from '../../src/lib/player/runtime-data.js';
import type { CharacterProfileArtifact } from '../../src/lib/relic-score/profile-types.js';
import { buildRelicScoreReferenceData } from '../../src/lib/relic-score/reference.js';
import { isRelicStatKey, relicStatSemantics } from '../../src/lib/relic-score/stat-registry.js';
import { readDataManifest } from '../data/generated-artifacts.js';
import { generatedRoot, siteRoot } from '../data/paths.js';
import {
  ALLOWED_WEIGHTS,
  TEMPLATE_IDS,
  generateCharacterProfile,
  generateProfiles,
  profileInputDigest,
  stableSerialize,
  type ProfileCharacterSource,
  type ProfileOverride,
  type ProfileOverrideConfig,
  type ProfileTemplateConfig
} from './profiles.js';

const templatesPath = path.join(siteRoot, 'data/relic-score/profile-templates.json');
const overridesPath = path.join(siteRoot, 'data/relic-score/profile-overrides.json');
export const profilesPath = path.join(
  siteRoot,
  'src/lib/relic-score/generated/character-profiles.json'
);
const PANEL_TARGETS = new Set(Object.values(PLAYER_PROPERTY_SEMANTICS).map(({ target }) => target));

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`[relic-score/validate] ${label} must be an object`);
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`[relic-score/validate] ${label} must be an array`);
  return value;
}

function finite(value: unknown, label: string, positive = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (positive && value <= 0))
    throw new Error(
      `[relic-score/validate] ${label} must be finite${positive ? ' and positive' : ''}`
    );
  return value;
}

function validatePanelItems(items: unknown, label: string, curve = false): void {
  const seen = new Set<string>();
  for (const [index, item] of array(items, label).entries()) {
    const entry = record(item, `${label}[${index}]`);
    if (typeof entry.stat !== 'string' || !PANEL_TARGETS.has(entry.stat as never))
      throw new Error(`[relic-score/validate] invalid panel stat ${label}[${index}]`);
    if (seen.has(entry.stat))
      throw new Error(`[relic-score/validate] duplicate panel stat ${label}`);
    seen.add(entry.stat);
    if (!curve) {
      finite(entry.value, `${label}[${index}].value`, true);
      continue;
    }
    const points = array(entry.points, `${label}[${index}].points`);
    if (points.length < 2) throw new Error(`[relic-score/validate] curve too short ${label}`);
    let lastValue = -Infinity;
    let lastUtility = -Infinity;
    for (const [pointIndex, point] of points.entries()) {
      const p = record(point, `${label}[${index}].points[${pointIndex}]`);
      const value = finite(p.value, `${label}.value`);
      const utility = finite(p.utility, `${label}.utility`);
      if (value <= lastValue || utility < lastUtility)
        throw new Error(`[relic-score/validate] nonmonotone curve ${label}`);
      lastValue = value;
      lastUtility = utility;
    }
  }
}

export function validateConfig(
  characters: ProfileCharacterSource[],
  templates: ProfileTemplateConfig,
  overrides: ProfileOverrideConfig
): void {
  if (templates.schemaVersion !== 1 || overrides.schemaVersion !== 1)
    throw new Error('[relic-score/validate] config schema version');
  const templateEntries = record(templates.templates, 'templates');
  if (
    stableSerialize(Object.keys(templateEntries).sort()) !==
    stableSerialize([...TEMPLATE_IDS].sort())
  )
    throw new Error('[relic-score/validate] template inventory');
  for (const [id, raw] of Object.entries(templateEntries)) {
    const template = record(raw, `template ${id}`);
    for (const [key, weight] of Object.entries(template)) {
      if (key !== 'scaling-stat' && key !== 'other-recommended' && !isRelicStatKey(key))
        throw new Error(`[relic-score/validate] unknown template stat ${id}:${key}`);
      if (!ALLOWED_WEIGHTS.includes(weight as never))
        throw new Error(`[relic-score/validate] invalid weight ${id}:${key}`);
    }
    if (!('other-recommended' in template))
      throw new Error(`[relic-score/validate] missing template fallback ${id}`);
  }
  const byId = new Map(characters.map((character) => [character.id, character]));
  if (byId.size !== characters.length)
    throw new Error('[relic-score/validate] duplicate source character');
  for (const [id, raw] of Object.entries(record(overrides.overrides, 'overrides'))) {
    const character = byId.get(id);
    if (!character) throw new Error(`[relic-score/validate] orphan override ${id}`);
    const entry = record(raw, `override ${id}`) as ProfileOverride;
    const allowedFields = new Set([
      'templateId',
      'statWeights',
      'hardBreakpoints',
      'statTargets',
      'statCurves',
      'reviewedInputDigest',
      'note'
    ]);
    if (Object.keys(entry).some((key) => !allowedFields.has(key)))
      throw new Error(`[relic-score/validate] unknown override field ${id}`);
    if (entry.templateId !== undefined && !TEMPLATE_IDS.includes(entry.templateId))
      throw new Error(`[relic-score/validate] unknown template ${id}`);
    const automatic = generateCharacterProfile(character, templates, undefined, '0'.repeat(40));
    if (entry.templateId === automatic.templateId)
      throw new Error(`[relic-score/validate] redundant template override ${id}`);
    const baseline = generateCharacterProfile(
      character,
      templates,
      entry.templateId ? { templateId: entry.templateId } : undefined,
      '0'.repeat(40)
    );
    for (const [key, weight] of Object.entries(entry.statWeights ?? {})) {
      if (!isRelicStatKey(key) || !relicStatSemantics(key).canBeSubstat)
        throw new Error(`[relic-score/validate] invalid override stat ${id}:${key}`);
      if (!character.equipmentRecommendation.subStatPropertyTypes.includes(key))
        throw new Error(`[relic-score/validate] unrecommended override stat ${id}:${key}`);
      if (!ALLOWED_WEIGHTS.includes(weight as never))
        throw new Error(`[relic-score/validate] invalid override weight ${id}:${key}`);
      if ((baseline.substatWeights[key as keyof typeof baseline.substatWeights] ?? 0) === weight)
        throw new Error(`[relic-score/validate] redundant weight override ${id}:${key}`);
    }
    for (const field of ['hardBreakpoints', 'statTargets', 'statCurves'] as const)
      if (entry[field] !== undefined && entry[field].length === 0)
        throw new Error(`[relic-score/validate] redundant empty override ${id}:${field}`);
    validatePanelItems(entry.hardBreakpoints ?? [], `${id}.hardBreakpoints`);
    validatePanelItems(entry.statTargets ?? [], `${id}.statTargets`);
    validatePanelItems(entry.statCurves ?? [], `${id}.statCurves`, true);
    if (
      entry.reviewedInputDigest !== undefined &&
      !/^[0-9a-f]{64}$/.test(entry.reviewedInputDigest)
    )
      throw new Error(`[relic-score/validate] invalid reviewed digest ${id}`);
    if (entry.note !== undefined && (typeof entry.note !== 'string' || !entry.note.trim()))
      throw new Error(`[relic-score/validate] invalid note ${id}`);
  }
  for (const character of characters) {
    const recommendation = character.equipmentRecommendation;
    const mainSlots = recommendation.mainStatOptions.map((option) => option.slot).sort();
    if (
      recommendation.avatarId !== character.id ||
      recommendation.cavernSetIds.length === 0 ||
      recommendation.planarSetIds.length === 0 ||
      recommendation.mainStatOptions.length !== 4 ||
      stableSerialize(mainSlots) !== stableSerialize(['BODY', 'FOOT', 'NECK', 'OBJECT'].sort()) ||
      recommendation.mainStatOptions.some(
        ({ slot, propertyTypes }) =>
          propertyTypes.length === 0 ||
          new Set(propertyTypes).size !== propertyTypes.length ||
          propertyTypes.some(
            (key) => !isRelicStatKey(key) || !relicStatSemantics(key).mainSlots.includes(slot)
          )
      ) ||
      recommendation.subStatPropertyTypes.length === 0 ||
      new Set(recommendation.subStatPropertyTypes).size !==
        recommendation.subStatPropertyTypes.length ||
      recommendation.subStatPropertyTypes.some(
        (key) => !isRelicStatKey(key) || !relicStatSemantics(key).canBeSubstat
      )
    )
      throw new Error(`[relic-score/validate] incomplete recommendation ${character.id}`);
  }
}

export async function loadProfileInputs(): Promise<{
  characters: ProfileCharacterSource[];
  templates: ProfileTemplateConfig;
  overrides: ProfileOverrideConfig;
  sourceCommit: string;
}> {
  const manifest = await readDataManifest(generatedRoot);
  const characters = await Promise.all(
    manifest.routes.characters.map(async (id) => {
      const value = JSON.parse(
        await readFile(
          path.join(generatedRoot, `views/zh-CN/details/characters/${id}.json`),
          'utf8'
        )
      ) as ProfileCharacterSource;
      if (value.id !== id || !value.equipmentRecommendation)
        throw new Error(`[relic-score/validate] invalid generated character ${id}`);
      return {
        id: value.id,
        path: value.path,
        equipmentRecommendation: value.equipmentRecommendation as AvatarEquipmentRecommendation
      };
    })
  );
  const templates = JSON.parse(await readFile(templatesPath, 'utf8')) as ProfileTemplateConfig;
  const overrides = JSON.parse(await readFile(overridesPath, 'utf8')) as ProfileOverrideConfig;
  validateConfig(characters, templates, overrides);
  return { characters, templates, overrides, sourceCommit: manifest.sourceCommit };
}

export function validateProfiles(
  artifact: CharacterProfileArtifact,
  inputs: Awaited<ReturnType<typeof loadProfileInputs>>
): void {
  const { characters, templates, overrides } = inputs;
  validateConfig(characters, templates, overrides);
  if (artifact.schemaVersion !== 1 || !Array.isArray(artifact.profiles))
    throw new Error('[relic-score/validate] artifact schema version');
  const byId = new Map(characters.map((character) => [character.id, character]));
  const seen = new Set<string>();
  for (const profile of artifact.profiles) {
    if (!profile || typeof profile.characterId !== 'string' || !byId.has(profile.characterId))
      throw new Error('[relic-score/validate] unknown profile character');
    if (seen.has(profile.characterId))
      throw new Error(`[relic-score/validate] duplicate profile ${profile.characterId}`);
    seen.add(profile.characterId);
    if (!TEMPLATE_IDS.includes(profile.templateId))
      throw new Error(`[relic-score/validate] unknown profile template ${profile.characterId}`);
    const recommended = new Set(
      byId.get(profile.characterId)!.equipmentRecommendation.subStatPropertyTypes
    );
    let weighted = 0;
    for (const [key, weight] of Object.entries(profile.substatWeights ?? {})) {
      if (
        !isRelicStatKey(key) ||
        !recommended.has(key) ||
        !ALLOWED_WEIGHTS.includes(weight as never)
      )
        throw new Error(
          `[relic-score/validate] invalid profile weight ${profile.characterId}:${key}`
        );
      if (weight > 0) weighted += 1;
    }
    if (!weighted)
      throw new Error(`[relic-score/validate] no weighted substat ${profile.characterId}`);
    validatePanelItems(profile.hardBreakpoints, `${profile.characterId}.hardBreakpoints`);
    validatePanelItems(profile.statTargets, `${profile.characterId}.statTargets`);
    validatePanelItems(profile.statCurves, `${profile.characterId}.statCurves`, true);
    if (!/^[0-9a-f]{40}$/.test(profile.metadata?.sourceCommit ?? ''))
      throw new Error(`[relic-score/validate] invalid provenance ${profile.characterId}`);
    const override = overrides.overrides[profile.characterId];
    const digest = profileInputDigest(byId.get(profile.characterId)!, templates, override);
    if (profile.metadata.inputDigest !== digest)
      throw new Error(`[relic-score/validate] stale profile digest ${profile.characterId}`);
    if (override?.reviewedInputDigest && override.reviewedInputDigest !== digest)
      throw new Error(`[relic-score/validate] stale review ${profile.characterId}`);
  }
  if (seen.size !== characters.length)
    throw new Error('[relic-score/validate] profile coverage incomplete');
  const expected = generateProfiles(characters, templates, overrides, inputs.sourceCommit);
  if (
    stableSerialize(artifact.profiles.map((profile) => profile.characterId)) !==
    stableSerialize(expected.profiles.map((profile) => profile.characterId))
  )
    throw new Error('[relic-score/validate] profile order differs');
  for (const profile of expected.profiles) {
    const actual = artifact.profiles.find((item) => item.characterId === profile.characterId)!;
    if (
      stableSerialize({ ...profile, metadata: { ...profile.metadata, sourceCommit: null } }) !==
      stableSerialize({ ...actual, metadata: { ...actual.metadata, sourceCommit: null } })
    )
      throw new Error(`[relic-score/validate] generated profile differs ${profile.characterId}`);
  }
}

export async function validateCurrentProfiles(): Promise<CharacterProfileArtifact> {
  const runtime: unknown = JSON.parse(
    await readFile(path.join(generatedRoot, 'runtime/player.json'), 'utf8')
  );
  assertPlayerRuntimeData(runtime);
  buildRelicScoreReferenceData(runtime);
  const inputs = await loadProfileInputs();
  const artifact = JSON.parse(await readFile(profilesPath, 'utf8')) as CharacterProfileArtifact;
  validateProfiles(artifact, inputs);
  return artifact;
}
