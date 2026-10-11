import { describe, expect, it } from 'vitest';
import policyJson from '../../data/relic-score/v2/profile-overrides.json';
import { assertRatingV2Overrides } from '../../src/lib/relic-score/v2/overrides';

const ids = ['1505', '1506'];
describe('Rating V2 explicit policy', () => {
  it('accepts only a traceable, scoped policy with known identities', () => {
    expect(() => assertRatingV2Overrides(policyJson, ids, policyJson.sourceCommit)).not.toThrow();
    expect(() => assertRatingV2Overrides(policyJson, ['1506'], policyJson.sourceCommit)).toThrow(
      /Unknown/
    );
    expect(() => assertRatingV2Overrides(policyJson, ids, 'a'.repeat(40))).toThrow(/stale/);
    expect(() =>
      assertRatingV2Overrides({ ...policyJson, unexpected: true }, ids, policyJson.sourceCommit)
    ).toThrow(/fields/);
  });
  it('rejects ambiguous, unreasoned and invalid overrides', () => {
    for (const patch of [
      { preference: -0.1 },
      { preference: 1.1 },
      { preference: NaN },
      { preference: '0.4' },
      { reason: '' },
      { slot: 'HEAD' },
      { key: 'AttackAddedRatio' },
      { key: 'unknown' },
      { extra: true }
    ]) {
      const policy = structuredClone(policyJson);
      Object.assign(policy.mainWeights[0], patch);
      expect(() => assertRatingV2Overrides(policy, ids, policy.sourceCommit)).toThrow();
    }
    const duplicate = structuredClone(policyJson);
    duplicate.mainWeights.push(duplicate.mainWeights[0]);
    expect(() => assertRatingV2Overrides(duplicate, ids, duplicate.sourceCommit)).toThrow(
      /Duplicate/
    );
    const conflict = structuredClone(policyJson);
    conflict.agnosticSlots.push({
      characterId: '1505',
      slot: 'NECK',
      reason: 'Synthetic conflict'
    });
    expect(() => assertRatingV2Overrides(conflict, ids, conflict.sourceCommit)).toThrow(
      /conflicting/
    );
  });
});
