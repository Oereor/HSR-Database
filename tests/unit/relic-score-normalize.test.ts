import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildEnkaPlayerProfile, playerRuntimeData } from '../../api/_player/enka/pipeline';
import { normalizePlayerBuildInput } from '../../src/lib/relic-score/normalize';
import { synthesizePlayerCharacter } from '../../src/lib/player/stat-synthesis';
import type { CanonicalPlayerCharacterBuild } from '../../src/lib/player/canonical';
import {
  buildPlayerInput,
  withMainStat,
  withPanelTarget,
  withRollEvidence,
  withoutSlot
} from '../fixtures/relic-score/builders';

const raw = JSON.parse(
  readFileSync('tests/fixtures/enka/phase1-player.sanitized.json', 'utf8')
) as unknown;

function withBuild(update: (build: CanonicalPlayerCharacterBuild) => void) {
  const source = structuredClone(buildEnkaPlayerProfile(raw).canonical.characters[0].build);
  update(source);
  return normalizePlayerBuildInput(
    synthesizePlayerCharacter(source, playerRuntimeData),
    playerRuntimeData
  );
}

describe('relic score player input normalization', () => {
  it('preserves numeric panel, relic identity and exact Enka roll evidence', () => {
    const pipeline = buildEnkaPlayerProfile(raw);
    expect(pipeline.normalizedBuilds).toHaveLength(6);
    const first = pipeline.normalizedBuilds[0];
    expect(first.status).toBe('valid');
    if (first.status !== 'valid') return;
    const expected = buildPlayerInput();
    expect(first.input).toEqual(expected);
    expect(first.input.characterId).toBe('1310');
    expect(first.input.relics[0]).toMatchObject({
      relicId: '61191',
      slot: 'HEAD',
      rarity: 5,
      level: 15,
      mainStat: { key: 'HPDelta' }
    });
    expect(first.input.relics[0].substats[0]).toMatchObject({
      occurrenceCount: 1,
      cumulativeStep: 1,
      rollCount: { status: 'exact', count: 1, source: 'provider' }
    });
    expect(first.input.panel.spd).toBeCloseTo(pipeline.canonical.characters[0].values.spd!, 8);
    expect(first.input.relics[0].mainStat.value).toBeGreaterThan(0);
    expect(JSON.stringify(first.input)).not.toMatch(/uid|nickname|display|%/i);
  });

  it('distinguishes missing, unknown and impossible relic inputs', () => {
    expect(withBuild((build) => build.relics.pop())).toMatchObject({
      status: 'unavailable',
      reason: 'MISSING_SLOT'
    });
    expect(withBuild((build) => (build.relics[0].tid = 'unknown'))).toMatchObject({
      status: 'unavailable',
      reason: 'UNKNOWN_RELIC'
    });
    expect(withBuild((build) => (build.relics[0].type = 2))).toMatchObject({
      status: 'invalid',
      reason: 'SLOT_MISMATCH'
    });
    expect(withBuild((build) => build.relics.push(structuredClone(build.relics[0])))).toMatchObject(
      {
        status: 'invalid',
        reason: 'DUPLICATE_SLOT'
      }
    );
    expect(withBuild((build) => (build.relics[0].subAffixes[0].cnt = 10))).toMatchObject({
      status: 'invalid',
      reason: 'INVALID_ROLL_COUNT'
    });
    expect(withBuild((build) => (build.relics[0].subAffixes[0].step = 3))).toMatchObject({
      status: 'invalid',
      reason: 'INVALID_STEP'
    });
    expect(withBuild((build) => (build.relics[0].mainAffixId = 999))).toMatchObject({
      status: 'unavailable',
      reason: 'UNKNOWN_AFFIX'
    });
    expect(withBuild((build) => (build.relics[0].subAffixes[0].cnt = 3))).toMatchObject({
      status: 'invalid',
      reason: 'IMPOSSIBLE_OCCURRENCES'
    });
    expect(
      withBuild((build) => build.relics[0].subAffixes.push(build.relics[0].subAffixes[0]))
    ).toMatchObject({
      status: 'invalid',
      reason: 'DUPLICATE_SUBSTAT'
    });
    expect(withBuild((build) => (build.relics[0].subAffixes[0].affixId = 1))).toMatchObject({
      status: 'invalid',
      reason: 'MAIN_SUB_CONFLICT'
    });
    const fourStarHead = Object.entries(playerRuntimeData.relics).find(
      ([, relic]) => relic.rarity === 4 && relic.slot === 1
    )![0];
    const lowerRarity = withBuild((build) => {
      build.relics[0].tid = fourStarHead;
      build.relics[0].level = 12;
    });
    expect(lowerRarity).toMatchObject({
      status: 'unavailable',
      reason: 'UNSUPPORTED_RARITY_ROLLS'
    });
    if (lowerRarity.status === 'unavailable') {
      expect(lowerRarity.partialInput?.relics[0].rarity).toBe(4);
      expect(lowerRarity.partialInput?.relics[0].mainStat.value).toBeGreaterThan(0);
    }
  });

  it('does not turn missing synthesized panel values into zero', () => {
    const character = structuredClone(buildEnkaPlayerProfile(raw).canonical.characters[0]);
    delete character.values.spd;
    expect(normalizePlayerBuildInput(character, playerRuntimeData)).toMatchObject({
      status: 'unavailable',
      reason: 'MISSING_PANEL_STAT'
    });
  });

  it('provides compact builders for future score cases', () => {
    const base = buildPlayerInput();
    expect(withoutSlot(base, 'BODY').relics).toHaveLength(5);
    expect(withMainStat(base, 'BODY', 'HPAddedRatio').relics[2].mainStat.key).toBe('HPAddedRatio');
    expect(withPanelTarget(base, 'spd', 160).panel.spd).toBe(160);
    expect(
      withRollEvidence(base, 'HEAD', { status: 'ambiguous', candidates: [1, 2] }).relics[0]
        .substats[0].rollCount.status
    ).toBe('ambiguous');
    expect(
      withRollEvidence(base, 'HEAD', { status: 'unavailable' }).relics[0].substats[0].rollCount
        .status
    ).toBe('unavailable');
    expect(base.relics).toHaveLength(6);
  });
});
