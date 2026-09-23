import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  generateCharacterProfile,
  generateProfiles,
  profileInputDigest,
  type ProfileCharacterSource,
  type ProfileOverrideConfig,
  type ProfilePolicyConfig,
  type ProfileTemplateConfig
} from '../../scripts/relic-score/profiles';
import { validateConfig, validateProfiles } from '../../scripts/relic-score/validate';

const templates = JSON.parse(
  readFileSync('data/relic-score/profile-templates.json', 'utf8')
) as ProfileTemplateConfig;
const policy = JSON.parse(
  readFileSync('data/relic-score/profile-policy.json', 'utf8')
) as ProfilePolicyConfig;
const noOverrides: ProfileOverrideConfig = { schemaVersion: 2, overrides: {} };
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
    const generated = generateProfiles(samples, templates, noOverrides, commit, policy).profiles;
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
    const generated = generateCharacterProfile(samples[0], templates, undefined, commit, policy);
    expect(generated.substatWeights).toEqual({
      AttackAddedRatio: 1,
      CriticalChanceBase: 1.25,
      CriticalDamageBase: 1.25,
      SpeedDelta: 0.75
    });
    expect(generated.substatWeights).not.toHaveProperty('scaling-stat');
    expect(generated.substatWeights).not.toHaveProperty('StatusProbabilityBase');
    const unresolved = generateCharacterProfile(samples[7], templates, undefined, commit, policy);
    expect(unresolved.metadata.reviewReasons).toContain('AMBIGUOUS_SCALING');
  });

  it('applies only changed override fields and recognizes a current manual review', () => {
    const override = {
      templateId: 'direct-support' as const,
      statWeights: { SpeedDelta: 1 as const }
    };
    const changed = generateCharacterProfile(samples[0], templates, override, commit, policy);
    expect(changed.templateId).toBe('direct-support');
    expect(changed.substatWeights.SpeedDelta).toBe(1);
    const digest = profileInputDigest(samples[0], templates, override, policy);
    const reviewed = generateCharacterProfile(
      samples[0],
      templates,
      { ...override, reviewedInputDigest: digest },
      commit,
      policy
    );
    expect(reviewed.metadata.reviewStatus).toBe('reviewed');
    expect(reviewed.metadata.inputDigest).toBe(digest);
  });

  it('keeps digest stable across object key order and localized text changes', () => {
    const source = samples[0];
    const digest = profileInputDigest(source, templates, undefined, policy);
    const withDisplay = { ...source, name: 'Localized name', pathName: 'Localized path' };
    expect(profileInputDigest(withDisplay, templates, undefined, policy)).toBe(digest);
    const changed = structuredClone(source);
    changed.equipmentRecommendation.subStatPropertyTypes.reverse();
    expect(profileInputDigest(changed, templates, undefined, policy)).not.toBe(digest);
    const changedSet = structuredClone(source);
    changedSet.equipmentRecommendation.cavernSetIds.push('102');
    expect(profileInputDigest(changedSet, templates, undefined, policy)).not.toBe(digest);
  });

  it('applies the crit-rate default only when weighted and keeps unrelated digests stable', () => {
    const ordinary = generateCharacterProfile(samples[0], templates, undefined, commit, policy);
    expect(ordinary.statTargets).toEqual([
      { stat: 'CriticalChanceBase', panelTarget: 'crit_rate', value: 1, postTargetWeight: 0 }
    ]);
    const withoutCrit = generateCharacterProfile(samples[2], templates, undefined, commit, policy);
    expect(withoutCrit.statTargets).toEqual([]);
    const changedPolicy: ProfilePolicyConfig = {
      ...policy,
      critRateDefault: { ...policy.critRateDefault, value: 0.9 }
    };
    expect(profileInputDigest(samples[0], templates, undefined, changedPolicy)).not.toBe(
      ordinary.metadata.inputDigest
    );
    const stale = generateCharacterProfile(
      samples[0],
      templates,
      { reviewedInputDigest: ordinary.metadata.inputDigest },
      commit,
      changedPolicy
    );
    expect(stale.metadata.reviewStatus).toBe('needs-review');
    expect(profileInputDigest(samples[2], templates, undefined, changedPolicy)).toBe(
      withoutCrit.metadata.inputDigest
    );
    const exception = {
      statTargets: [{ stat: 'CriticalChanceBase' as const, value: 0.65, postTargetWeight: 0 }]
    };
    const exceptional = generateCharacterProfile(samples[0], templates, exception, commit, policy);
    expect(exceptional.statTargets[0]).toMatchObject({ value: 0.65, postTargetWeight: 0 });
    expect(profileInputDigest(samples[0], templates, exception, changedPolicy)).toBe(
      exceptional.metadata.inputDigest
    );
    const unrelatedTemplate = structuredClone(templates);
    unrelatedTemplate.templates.break.SpeedDelta = 0.5;
    expect(profileInputDigest(samples[0], unrelatedTemplate, undefined, policy)).toBe(
      ordinary.metadata.inputDigest
    );
  });

  it('records deliberate no-scaling without adding an unrecommended stat', () => {
    const unresolved = generateCharacterProfile(samples[7], templates, undefined, commit, policy);
    const resolved = generateCharacterProfile(
      samples[7],
      templates,
      { scalingStat: null },
      commit,
      policy
    );
    expect(unresolved.metadata.reviewReasons).toContain('AMBIGUOUS_SCALING');
    expect(resolved.metadata.reviewReasons).not.toContain('AMBIGUOUS_SCALING');
    expect(resolved.substatWeights).toEqual(unresolved.substatWeights);
  });
});

describe('character relic score profile validation', () => {
  const inputs = {
    characters: samples,
    templates,
    overrides: noOverrides,
    policy,
    sourceCommit: commit
  };

  it('accepts complete machine candidates and rejects coverage or digest drift', () => {
    const artifact = generateProfiles(samples, templates, noOverrides, commit, policy);
    expect(
      generateProfiles([...samples].reverse(), templates, noOverrides, commit, policy)
    ).toEqual(artifact);
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
    expect(() => validateConfig(samples, invalidWeight, noOverrides, policy)).toThrow(
      'invalid weight'
    );
    const unknownTemplate = structuredClone(templates) as unknown as Record<string, unknown>;
    (unknownTemplate.templates as Record<string, unknown>).other = {};
    expect(() =>
      validateConfig(
        samples,
        unknownTemplate as unknown as ProfileTemplateConfig,
        noOverrides,
        policy
      )
    ).toThrow('template inventory');
    const orphan: ProfileOverrideConfig = {
      schemaVersion: 2,
      overrides: { orphan: { statWeights: { SpeedDelta: 1 } } }
    };
    expect(() => validateConfig(samples, templates, orphan, policy)).toThrow('orphan override');
    expect(() =>
      validateConfig(
        samples,
        templates,
        {
          schemaVersion: 2,
          overrides: { '1': { templateId: 'direct-dps' } }
        },
        policy
      )
    ).toThrow('redundant template override');
    const staleReview: ProfileOverrideConfig = {
      schemaVersion: 2,
      overrides: { '1': { reviewedInputDigest: '0'.repeat(64) } }
    };
    const artifact = generateProfiles(samples, templates, staleReview, commit, policy);
    expect(() => validateProfiles(artifact, { ...inputs, overrides: staleReview })).toThrow(
      'stale review'
    );
    expect(() =>
      validateProfiles(artifact, { ...inputs, overrides: staleReview }, { allowStaleReviews: true })
    ).not.toThrow();
  });

  it('rejects unlisted weights and nonmonotone curves', () => {
    const artifact = generateProfiles(samples, templates, noOverrides, commit, policy);
    artifact.profiles[0].substatWeights.StatusResistanceBase = 1;
    expect(() => validateProfiles(artifact, inputs)).toThrow('invalid profile weight');
    const overrides: ProfileOverrideConfig = {
      schemaVersion: 2,
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
    expect(() => validateConfig(samples, templates, overrides, policy)).toThrow(
      'nonmonotone curve'
    );
  });

  it('validates canonical targets, finite thresholds and marginal weights', () => {
    const source = samples[0];
    const overrides: ProfileOverrideConfig = {
      schemaVersion: 2,
      overrides: {
        '1': {
          hardBreakpoints: [{ stat: 'SpeedDelta', value: 160 }],
          statTargets: [{ stat: 'CriticalChanceBase', value: 0.65, postTargetWeight: 0 }]
        }
      }
    };
    expect(() => validateConfig([source], templates, overrides, policy)).not.toThrow();
    const profile = generateCharacterProfile(
      source,
      templates,
      overrides.overrides['1'],
      commit,
      policy
    );
    expect(profile.hardBreakpoints).toEqual([
      { stat: 'SpeedDelta', panelTarget: 'spd', value: 160 }
    ]);
    expect(profile.statTargets[0]).toEqual({
      stat: 'CriticalChanceBase',
      panelTarget: 'crit_rate',
      value: 0.65,
      postTargetWeight: 0
    });
    const marginalUtility = (x: number) =>
      profile.substatWeights.CriticalChanceBase! * Math.min(x, 0.65) +
      profile.statTargets[0].postTargetWeight * Math.max(0, x - 0.65);
    expect(marginalUtility(0.7)).toBe(marginalUtility(0.65));
    const invalid = structuredClone(overrides);
    invalid.overrides['1'].statTargets![0].postTargetWeight = 0.3;
    expect(() => validateConfig([source], templates, invalid, policy)).toThrow(
      'invalid post-target weight'
    );
    invalid.overrides['1'].statTargets![0].postTargetWeight = 0;
    invalid.overrides['1'].statTargets![0].value = Infinity;
    expect(() => validateConfig([source], templates, invalid, policy)).toThrow('must be finite');
    invalid.overrides['1'].statTargets![0].value = 0.65;
    invalid.overrides['1'].statTargets![0].postTargetWeight = 1.25;
    invalid.overrides['1'].statTargets![0].stat = 'SpeedDelta';
    expect(() => validateConfig([source], templates, invalid, policy)).toThrow(
      'nonmonotone target'
    );
  });
});

describe('applied profile review', () => {
  const artifact = JSON.parse(
    readFileSync('src/lib/relic-score/generated/character-profiles.json', 'utf8')
  ) as ReturnType<typeof generateProfiles>;
  const overrides = JSON.parse(
    readFileSync('data/relic-score/profile-overrides.json', 'utf8')
  ) as ProfileOverrideConfig;
  const byId = new Map(artifact.profiles.map((profile) => [profile.characterId, profile]));

  it('records 97 independent current reviews without recommendation duplication', () => {
    expect(artifact.profiles).toHaveLength(97);
    expect(Object.keys(overrides.overrides)).toHaveLength(97);
    for (const profile of artifact.profiles) {
      expect(profile.metadata.reviewStatus).toBe('reviewed');
      expect(profile.metadata.reviewedInputDigest).toBe(profile.metadata.inputDigest);
      expect(overrides.overrides[profile.characterId].reviewedInputDigest).toBe(
        profile.metadata.inputDigest
      );
    }
    for (const override of Object.values(overrides.overrides)) {
      expect(override).not.toHaveProperty('cavernSetIds');
      expect(override).not.toHaveProperty('planarSetIds');
      expect(override).not.toHaveProperty('mainStatOptions');
      expect(override).not.toHaveProperty('subStatPropertyTypes');
    }
  });

  it('preserves template exceptions, breakpoint and target decisions for both Trailblazer IDs', () => {
    expect(byId.get('1001')?.templateId).toBe('sustain');
    expect(byId.get('1222')?.templateId).toBe('break');
    expect(byId.get('1415')?.templateId).toBe('direct-dps');
    expect(byId.get('1409')?.hardBreakpoints).toEqual([
      { stat: 'SpeedDelta', panelTarget: 'spd', value: 200 }
    ]);
    expect(byId.get('1303')?.statTargets).toContainEqual({
      stat: 'BreakDamageAddedRatioBase',
      panelTarget: 'break_dmg',
      value: 1.8,
      postTargetWeight: 0.25
    });
    for (const id of ['8005', '8006']) {
      expect(overrides.overrides[id].scalingStat).toBeNull();
      expect(byId.get(id)?.metadata.reviewReasons).not.toContain('AMBIGUOUS_SCALING');
    }
    for (const id of ['8007', '8008']) expect(byId.get(id)?.templateId).toBe('direct-support');
    for (const id of ['8009', '8010']) {
      expect(byId.get(id)?.templateId).toBe('direct-dps');
      expect(byId.get(id)?.statTargets).toContainEqual({
        stat: 'CriticalChanceBase',
        panelTarget: 'crit_rate',
        value: 0.85,
        postTargetWeight: 0
      });
    }
  });
});
