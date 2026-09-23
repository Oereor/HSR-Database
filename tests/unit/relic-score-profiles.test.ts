import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  generateCharacterProfile,
  generateProfiles,
  profileInputDigest,
  type ProfileCharacterSource,
  type ProfileOverrideConfig,
  type ProfileTemplateConfig
} from '../../scripts/relic-score/profiles';
import { validateConfig, validateProfiles } from '../../scripts/relic-score/validate';

const templates = JSON.parse(
  readFileSync('data/relic-score/profile-templates.json', 'utf8')
) as ProfileTemplateConfig;
const noOverrides: ProfileOverrideConfig = { schemaVersion: 1, overrides: {} };
const commit = 'a'.repeat(40);

function character(id: string, path: string, substats: string[]): ProfileCharacterSource {
  return {
    id,
    path,
    equipmentRecommendation: {
      avatarId: id,
      lightConeIds: [],
      cavernSetIds: ['101'],
      planarSetIds: ['301'],
      mainStatOptions: [
        { slot: 'BODY', propertyTypes: ['CriticalChanceBase'] },
        { slot: 'FOOT', propertyTypes: ['SpeedDelta'] },
        { slot: 'NECK', propertyTypes: ['AttackAddedRatio'] },
        { slot: 'OBJECT', propertyTypes: ['AttackAddedRatio'] }
      ],
      subStatPropertyTypes: substats
    }
  };
}

const samples = [
  character('1', 'Rogue', [
    'CriticalChanceBase',
    'CriticalDamageBase',
    'AttackAddedRatio',
    'SpeedDelta'
  ]),
  character('2', 'Shaman', ['SpeedDelta', 'CriticalDamageBase', 'AttackAddedRatio']),
  character('3', 'Warrior', ['BreakDamageAddedRatioBase', 'SpeedDelta', 'AttackAddedRatio']),
  character('4', 'Warlock', ['StatusProbabilityBase', 'AttackAddedRatio', 'SpeedDelta']),
  character('5', 'Knight', ['HPAddedRatio', 'SpeedDelta', 'StatusResistanceBase']),
  character('6', 'Warrior', [
    'CriticalChanceBase',
    'CriticalDamageBase',
    'BreakDamageAddedRatioBase',
    'AttackAddedRatio'
  ]),
  character('7', 'Warlock', ['StatusProbabilityBase', 'SpeedDelta', 'StatusResistanceBase']),
  character('8', 'Memory', ['CriticalChanceBase', 'CriticalDamageBase', 'SpeedDelta'])
];

describe('character relic score profile generation', () => {
  it('selects all seven templates and lowers special-path confidence', () => {
    const generated = generateProfiles(samples, templates, noOverrides, commit).profiles;
    expect(generated.map((profile) => profile.templateId)).toEqual([
      'direct-dps',
      'direct-support',
      'break',
      'dot-dps',
      'sustain',
      'hybrid-direct-break',
      'debuff-support',
      'direct-dps'
    ]);
    expect(generated[7].metadata).toMatchObject({
      inferenceConfidence: 'low',
      reviewStatus: 'needs-review'
    });
    expect(generated[0].metadata.reviewStatus).toBe('unreviewed');
  });

  it('weights only recommended stats and resolves scaling when unambiguous', () => {
    const generated = generateCharacterProfile(samples[0], templates, undefined, commit);
    expect(generated.substatWeights).toEqual({
      AttackAddedRatio: 1,
      CriticalChanceBase: 1.25,
      CriticalDamageBase: 1.25,
      SpeedDelta: 0.75
    });
    expect(generated.substatWeights).not.toHaveProperty('scaling-stat');
    expect(generated.substatWeights).not.toHaveProperty('StatusProbabilityBase');
    const unresolved = generateCharacterProfile(samples[7], templates, undefined, commit);
    expect(unresolved.metadata.reviewReasons).toContain('AMBIGUOUS_SCALING');
  });

  it('applies only changed override fields and recognizes a current manual review', () => {
    const override = {
      templateId: 'direct-support' as const,
      statWeights: { SpeedDelta: 1 as const }
    };
    const changed = generateCharacterProfile(samples[0], templates, override, commit);
    expect(changed.templateId).toBe('direct-support');
    expect(changed.substatWeights.SpeedDelta).toBe(1);
    const digest = profileInputDigest(samples[0], templates, override);
    const reviewed = generateCharacterProfile(
      samples[0],
      templates,
      { ...override, reviewedInputDigest: digest },
      commit
    );
    expect(reviewed.metadata.reviewStatus).toBe('reviewed');
    expect(reviewed.metadata.inputDigest).toBe(digest);
  });

  it('keeps digest stable across object key order and localized text changes', () => {
    const source = samples[0];
    const digest = profileInputDigest(source, templates, undefined);
    const withDisplay = { ...source, name: 'Localized name', pathName: 'Localized path' };
    expect(profileInputDigest(withDisplay, templates, undefined)).toBe(digest);
    const changed = structuredClone(source);
    changed.equipmentRecommendation.subStatPropertyTypes.reverse();
    expect(profileInputDigest(changed, templates, undefined)).not.toBe(digest);
    const changedSet = structuredClone(source);
    changedSet.equipmentRecommendation.cavernSetIds.push('102');
    expect(profileInputDigest(changedSet, templates, undefined)).not.toBe(digest);
  });
});

describe('character relic score profile validation', () => {
  const inputs = { characters: samples, templates, overrides: noOverrides, sourceCommit: commit };

  it('accepts complete machine candidates and rejects coverage or digest drift', () => {
    const artifact = generateProfiles(samples, templates, noOverrides, commit);
    expect(generateProfiles([...samples].reverse(), templates, noOverrides, commit)).toEqual(
      artifact
    );
    expect(() => validateProfiles(artifact, inputs)).not.toThrow();
    const reordered = structuredClone(artifact);
    reordered.profiles.reverse();
    expect(() => validateProfiles(reordered, inputs)).toThrow('profile order differs');
    const duplicate = structuredClone(artifact);
    duplicate.profiles.push(structuredClone(duplicate.profiles[0]));
    expect(() => validateProfiles(duplicate, inputs)).toThrow('duplicate profile');
    const unknown = structuredClone(artifact);
    unknown.profiles[0].characterId = 'unknown';
    expect(() => validateProfiles(unknown, inputs)).toThrow('unknown profile character');
    const stale = structuredClone(artifact);
    stale.profiles[0].metadata.inputDigest = '0'.repeat(64);
    expect(() => validateProfiles(stale, inputs)).toThrow('stale profile digest');
  });

  it('rejects invalid config, orphan override and stale manual review', () => {
    const invalidWeight = structuredClone(templates);
    invalidWeight.templates['direct-dps'].CriticalChanceBase = 0.3;
    expect(() => validateConfig(samples, invalidWeight, noOverrides)).toThrow('invalid weight');
    const unknownTemplate = structuredClone(templates) as unknown as Record<string, unknown>;
    (unknownTemplate.templates as Record<string, unknown>).other = {};
    expect(() =>
      validateConfig(samples, unknownTemplate as unknown as ProfileTemplateConfig, noOverrides)
    ).toThrow('template inventory');
    const orphan: ProfileOverrideConfig = {
      schemaVersion: 1,
      overrides: { orphan: { statWeights: { SpeedDelta: 1 } } }
    };
    expect(() => validateConfig(samples, templates, orphan)).toThrow('orphan override');
    expect(() =>
      validateConfig(samples, templates, {
        schemaVersion: 1,
        overrides: { '1': { templateId: 'direct-dps' } }
      })
    ).toThrow('redundant template override');
    const staleReview: ProfileOverrideConfig = {
      schemaVersion: 1,
      overrides: { '1': { reviewedInputDigest: '0'.repeat(64) } }
    };
    const artifact = generateProfiles(samples, templates, staleReview, commit);
    expect(() => validateProfiles(artifact, { ...inputs, overrides: staleReview })).toThrow(
      'stale review'
    );
  });

  it('rejects unlisted weights and nonmonotone curves', () => {
    const artifact = generateProfiles(samples, templates, noOverrides, commit);
    artifact.profiles[0].substatWeights.StatusResistanceBase = 1;
    expect(() => validateProfiles(artifact, inputs)).toThrow('invalid profile weight');
    const overrides: ProfileOverrideConfig = {
      schemaVersion: 1,
      overrides: {
        '1': {
          statCurves: [
            {
              stat: 'spd',
              points: [
                { value: 100, utility: 1 },
                { value: 110, utility: 0.5 }
              ]
            }
          ]
        }
      }
    };
    expect(() => validateConfig(samples, templates, overrides)).toThrow('nonmonotone curve');
  });
});
