import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildEnkaPlayerProfile, playerRuntimeData } from '../../api/_player/enka/pipeline';
import { normalizePlayerBuildInput } from '../../src/lib/relic-score/normalize';
import {
  assertPlayerRuntimeData,
  playerMainAffixValue,
  playerRuntimeKey,
  playerSubAffixValue
} from '../../src/lib/player/runtime-data';
import { synthesizePlayerCharacter } from '../../src/lib/player/stat-synthesis';
import type { CanonicalPlayerCharacterBuild } from '../../src/lib/player/canonical';
import { buildPlayerInput } from '../fixtures/relic-score/builders';

const raw = JSON.parse(
  readFileSync('tests/fixtures/enka/phase1-player.sanitized.json', 'utf8')
) as unknown;

interface FixtureRelic {
  tid: number;
  level: number;
  mainAffixId: number;
  subAffixList: Array<{ affixId: number; cnt: number; step?: number }>;
}

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

  it('rejects structural relic errors while preserving provider roll evidence', () => {
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
    expect(withBuild((build) => (build.relics[0].subAffixes[0].cnt = -1))).toMatchObject({
      status: 'invalid',
      reason: 'INVALID_ROLL_COUNT'
    });
    expect(withBuild((build) => (build.relics[0].subAffixes[0].cnt = 1.5))).toMatchObject({
      status: 'invalid',
      reason: 'INVALID_ROLL_COUNT'
    });
    expect(withBuild((build) => (build.relics[0].subAffixes[0].step = -1))).toMatchObject({
      status: 'invalid',
      reason: 'INVALID_STEP'
    });
    expect(withBuild((build) => (build.relics[0].subAffixes[0].step = 1.5))).toMatchObject({
      status: 'invalid',
      reason: 'INVALID_STEP'
    });
    expect(withBuild((build) => (build.relics[0].mainAffixId = 999))).toMatchObject({
      status: 'unavailable',
      reason: 'UNKNOWN_AFFIX'
    });
    expect(withBuild((build) => (build.relics[0].subAffixes[0].affixId = 999))).toMatchObject({
      status: 'unavailable',
      reason: 'UNKNOWN_AFFIX'
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
    expect(withBuild((build) => (build.avatarId = 'unknown'))).toMatchObject({
      status: 'unavailable',
      reason: 'SYNTHESIS_FAILED'
    });
    const runtime = structuredClone(playerRuntimeData);
    const head = buildEnkaPlayerProfile(raw).canonical.characters[0].build.relics[0];
    const identity = runtime.relics[head.tid];
    const key = playerRuntimeKey(identity.subAffixGroup, head.subAffixes[0].affixId);
    (runtime.relicSubAffixes[key] as { propertyType: string }).propertyType = 'UnknownProperty';
    const build = structuredClone(buildEnkaPlayerProfile(raw).canonical.characters[0].build);
    expect(
      normalizePlayerBuildInput(synthesizePlayerCharacter(build, runtime), runtime)
    ).toMatchObject({
      status: 'unavailable',
      reason: 'SYNTHESIS_FAILED'
    });
  });

  it.each([2, 3, 4])('normalizes a runtime-backed %i-star Enka relic', (rarity) => {
    const source = structuredClone(raw) as {
      detailInfo: { avatarDetailList: Array<{ relicList: FixtureRelic[] }> };
    };
    const relic = source.detailInfo.avatarDetailList[0].relicList[0];
    const [relicId, identity] = Object.entries(playerRuntimeData.relics).find(
      ([, candidate]) => candidate.rarity === rarity && candidate.slot === 1
    )!;
    relic.tid = Number(relicId);
    relic.level = identity.maxLevel!;
    const runtime = structuredClone(playerRuntimeData);
    for (const [key, affix] of Object.entries(runtime.relicSubAffixes))
      if (key.startsWith(`${identity.subAffixGroup}:`)) delete affix.stepNum;
    assertPlayerRuntimeData(runtime);
    const result = buildEnkaPlayerProfile(source, runtime).normalizedBuilds[0];
    expect(result.status).toBe('valid');
    if (result.status !== 'valid') return;
    const head = result.input.relics[0];
    expect(head).toMatchObject({ relicId, rarity, level: relic.level, slot: 'HEAD' });
    const main =
      runtime.relicMainAffixes[playerRuntimeKey(identity.mainAffixGroup, relic.mainAffixId)];
    expect(head.mainStat).toEqual({
      key: main.propertyType,
      value: playerMainAffixValue(main, relic.level)
    });
    expect(head.substats).toHaveLength(relic.subAffixList.length);
    for (const [index, sub] of relic.subAffixList.entries()) {
      const affix = runtime.relicSubAffixes[playerRuntimeKey(identity.subAffixGroup, sub.affixId)];
      expect(affix.stepNum).toBeUndefined();
      expect(head.substats[index]).toEqual({
        key: affix.propertyType,
        value: playerSubAffixValue(affix, sub.cnt, sub.step ?? 0),
        occurrenceCount: sub.cnt,
        cumulativeStep: sub.step ?? 0,
        rollCount: { status: 'exact', count: sub.cnt, source: 'provider' }
      });
    }
  });

  it('accepts structurally parseable 5-star data without reconstructing enhancement history', () => {
    for (const update of [
      (build: CanonicalPlayerCharacterBuild) => (build.relics[0].subAffixes[0].cnt = 3),
      (build: CanonicalPlayerCharacterBuild) => {
        build.relics[0].subAffixes[0].cnt = 10;
        build.relics[0].subAffixes[0].step = 100;
      }
    ]) {
      const result = withBuild(update);
      expect(result.status).toBe('valid');
      if (result.status !== 'valid') continue;
      expect(result.input.relics[0].substats[0].rollCount).toEqual({
        status: 'exact',
        count: result.input.relics[0].substats[0].occurrenceCount,
        source: 'provider'
      });
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
});
