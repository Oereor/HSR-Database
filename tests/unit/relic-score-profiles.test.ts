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
import { approveCurrentReview, currentReviewSummary } from '../../scripts/relic-score/review-core';
import { validateConfig, validateProfiles } from '../../scripts/relic-score/validate';

const templates = JSON.parse(
  readFileSync('data/relic-score/profile-templates.json', 'utf8')
) as ProfileTemplateConfig;
const noOverrides: ProfileOverrideConfig = { schemaVersion: 3, overrides: {} };
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
  it('infers templates and generates a complete, valid artifact', () => {
    const artifact = generateProfiles(samples, templates, noOverrides, commit);
    const generated = artifact.profiles;
    expect(artifact.schemaVersion).toBe(3);
    expect(generated).toHaveLength(samples.length);
    expect(() =>
      validateProfiles(artifact, {
        characters: samples,
        templates,
        overrides: noOverrides,
        sourceCommit: commit
      })
    ).not.toThrow();
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
    expect(generated[0].softTargets).toEqual([]);
    expect(generated[7].metadata.reviewStatus).toBe('needs-review');
  });

  it('applies manual overrides and preserves review staleness', () => {
    const localTemplates = structuredClone(templates);
    localTemplates.templates['direct-dps'].CriticalChanceBase = 0.75;
    const override = {
      statWeights: { CriticalChanceBase: 0.5 },
      softTargets: [{ stat: 'SpeedDelta' as const, minimumThreshold: 120, maximumThreshold: 160 }],
      hardBreakpoints: [{ stat: 'SpeedDelta' as const, threshold: 200 }]
    };
    const profile = generateCharacterProfile(samples[0], localTemplates, override, commit);
    expect(profile.substatWeights.CriticalChanceBase).toBe(override.statWeights.CriticalChanceBase);
    expect(profile.softTargets).toEqual(override.softTargets);
    expect(profile.hardBreakpoints).toEqual(override.hardBreakpoints);
    const reviewed = { ...override, reviewedInputDigest: profile.metadata.inputDigest };
    expect(
      generateCharacterProfile(samples[0], localTemplates, reviewed, commit).metadata.reviewStatus
    ).toBe('reviewed');
    reviewed.softTargets[0].minimumThreshold = 130;
    expect(
      generateCharacterProfile(samples[0], localTemplates, reviewed, commit).metadata.reviewStatus
    ).toBe('needs-review');
    expect(profileInputDigest(samples[0], localTemplates, reviewed)).not.toBe(
      profile.metadata.inputDigest
    );
  });

  it('has deterministic ordering and ignores display text and unrelated templates', () => {
    const artifact = generateProfiles(samples, templates, noOverrides, commit);
    expect(generateProfiles([...samples].reverse(), templates, noOverrides, commit)).toEqual(
      artifact
    );
    const source = samples[0];
    const digest = profileInputDigest(source, templates, undefined);
    const withDisplay = { ...source, name: 'display only' };
    expect(profileInputDigest(withDisplay, templates, undefined)).toBe(digest);
    const unrelated = structuredClone(templates);
    unrelated.templates.break.SpeedDelta =
      templates.templates.break.SpeedDelta === 0.25 ? 0.5 : 0.25;
    expect(profileInputDigest(source, unrelated, undefined)).toBe(digest);
  });
});

describe('profile configuration validation', () => {
  it('rejects incomplete, duplicate, nonfinite and Crit Rate soft targets', () => {
    const source = [samples[0]];
    const entry = { stat: 'SpeedDelta' as const, minimumThreshold: 120, maximumThreshold: 160 };
    const config: ProfileOverrideConfig = {
      schemaVersion: 3,
      overrides: { '1': { softTargets: [entry] } }
    };
    expect(() => validateConfig(source, templates, config)).not.toThrow();
    const invalid = structuredClone(config);
    invalid.overrides['1'].softTargets![0].maximumThreshold = 120;
    expect(() => validateConfig(source, templates, invalid)).toThrow(
      'invalid soft target interval'
    );
    invalid.overrides['1'].softTargets![0].maximumThreshold = Infinity;
    expect(() => validateConfig(source, templates, invalid)).toThrow('must be finite');
    invalid.overrides['1'].softTargets![0].maximumThreshold = 160;
    invalid.overrides['1'].softTargets!.push({ ...entry });
    expect(() => validateConfig(source, templates, invalid)).toThrow('duplicate threshold');
    invalid.overrides['1'].softTargets = [
      { stat: 'CriticalChanceBase', minimumThreshold: 0.5, maximumThreshold: 1 }
    ];
    expect(() => validateConfig(source, templates, invalid)).toThrow(
      'crit rate soft target forbidden'
    );
    invalid.overrides['1'].softTargets = [{ ...entry, minimumThreshold: null as never }];
    expect(() => validateConfig(source, templates, invalid)).toThrow('must be finite');
    invalid.overrides['1'].softTargets = [{ ...entry, stat: 'not-a-stat' as never }];
    expect(() => validateConfig(source, templates, invalid)).toThrow('invalid threshold stat');
    invalid.overrides['1'] = { statTargets: [] } as never;
    expect(() => validateConfig(source, templates, invalid)).toThrow('unknown override field');
  });

  it('allows distinct breakpoints on one stat but rejects exact duplicates', () => {
    const config: ProfileOverrideConfig = {
      schemaVersion: 3,
      overrides: {
        '1': {
          hardBreakpoints: [
            { stat: 'SpeedDelta', threshold: 160 },
            { stat: 'SpeedDelta', threshold: 200 }
          ]
        }
      }
    };
    expect(() => validateConfig([samples[0]], templates, config)).not.toThrow();
    config.overrides['1'].hardBreakpoints!.push({ stat: 'SpeedDelta', threshold: 160 });
    expect(() => validateConfig([samples[0]], templates, config)).toThrow('duplicate threshold');
  });

  it('rejects stale review and generated profile drift', () => {
    const overrides: ProfileOverrideConfig = {
      schemaVersion: 3,
      overrides: { '1': { reviewedInputDigest: '0'.repeat(64) } }
    };
    const inputs = { characters: samples, templates, overrides, sourceCommit: commit };
    const artifact = generateProfiles(samples, templates, overrides, commit);
    expect(() => validateProfiles(artifact, inputs)).toThrow('stale review');
    expect(() => validateProfiles(artifact, inputs, { allowStaleReviews: true })).not.toThrow();
    artifact.profiles[0].metadata.inputDigest = '0'.repeat(64);
    expect(() => validateProfiles(artifact, inputs, { allowStaleReviews: true })).toThrow(
      'stale profile digest'
    );
  });

  it('approves only the selected character current digest', () => {
    const inputs = { characters: samples, templates, overrides: noOverrides, sourceCommit: commit };
    const summary = currentReviewSummary(inputs, '1');
    expect(summary.softTargets).toEqual([]);
    const approved = approveCurrentReview(inputs, '1');
    expect(approved.overrides['1'].reviewedInputDigest).toBe(summary.inputDigest);
    expect(noOverrides.overrides['1']).toBeUndefined();
    expect(Object.keys(approved.overrides)).toEqual(['1']);
    expect(() => currentReviewSummary(inputs, 'missing')).toThrow('unknown character');
  });
});
