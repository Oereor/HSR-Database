import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildEnkaPlayerProfile } from '../../api/_player/enka/pipeline.js';
import { scoreProductionBuild } from '../../src/lib/server/relic-score/score.js';
import { scorePlayerCharacterBuild } from '../../src/lib/server/relic-score/player.js';
import { presentRelicScoreResult } from '../../src/lib/relic-score/presentation.js';
import type { RelicScoreRecommendationIndex } from '../../src/lib/relic-score/recommendations.js';
import { assertRelicScoreRecommendations } from '../../src/lib/relic-score/recommendations.js';
import type { PlayerBuildNormalization } from '../../src/lib/relic-score/types.js';
import { buildPlayerInput } from '../fixtures/relic-score/builders.js';

const raw = JSON.parse(
  readFileSync('tests/fixtures/enka/phase1-player.sanitized.json', 'utf8')
) as {
  detailInfo: { avatarDetailList: Array<{ relicList: Array<Record<string, unknown>> }> };
};
const recommendations = JSON.parse(
  readFileSync('src/lib/generated/runtime/relic-score-recommendations.json', 'utf8')
) as RelicScoreRecommendationIndex;

describe('Player Info relic scoring integration', () => {
  it('scores six actual Enka build instances after numeric synthesis and preserves scorer precision', () => {
    const result = buildEnkaPlayerProfile(raw);
    expect(result.scoringFailures).toEqual([]);
    expect(result.presentation.characters).toHaveLength(6);
    for (const [index, character] of result.presentation.characters.entries()) {
      const normalized = result.normalizedBuilds[index];
      expect(normalized.status).toBe('valid');
      if (normalized.status !== 'valid') continue;
      const direct = scoreProductionBuild(normalized.input, recommendations[character.characterId]);
      expect(character.relicScore).toEqual(presentRelicScoreResult(normalized, direct));
      expect(character.relicScore?.version).toBe(1);
      expect(Object.keys(character.relicScore?.pieces ?? {})).toHaveLength(6);
      if (direct.status === 'available' && character.relicScore?.build.status === 'available') {
        expect(character.relicScore.build.score).toBe(direct.build!.finalBuildScore);
        expect(character.relicScore.build.statCompletion).toBe(direct.build!.statCompletion.base);
        expect(character.relicScore.build.setIntegrity).toBe(direct.build!.setIntegrity.total);
      }
    }
    const serialized = JSON.stringify(result.presentation);
    for (const internal of [
      '"quantiles"',
      '"benchmarkIdentity"',
      '"probabilityDigest"',
      '"profileDigests"',
      '"substatWeights"',
      '"weightedContribution"',
      '"mainStatOptions"',
      '"cavernSetIds"'
    ])
      expect(serialized).not.toContain(internal);
    expect(
      Object.values(result.presentation.characters[0].relicScore?.pieces ?? {}).some(
        (piece) => piece?.status === 'available' && !Number.isInteger(piece.score)
      )
    ).toBe(true);
  });

  it('keeps five good Piece scores when the sixth slot is absent', () => {
    const source = structuredClone(raw);
    source.detailInfo.avatarDetailList[0].relicList.pop();
    const result = buildEnkaPlayerProfile(source);
    const normalized = result.normalizedBuilds[0];
    expect(normalized).toMatchObject({ status: 'unavailable', reason: 'MISSING_SLOT' });
    if (normalized.status === 'valid') return;
    expect(normalized.partialInput?.relics).toHaveLength(5);
    const score = result.presentation.characters[0].relicScore!;
    expect(score.build).toEqual({ status: 'unavailable', reason: 'incomplete-build' });
    expect(Object.values(score.pieces)).toHaveLength(5);
    expect(Object.values(score.pieces).every((piece) => piece?.status === 'available')).toBe(true);
  });

  it('marks only an unparseable equipped slot unavailable', () => {
    const source = structuredClone(raw);
    source.detailInfo.avatarDetailList[0].relicList[0].mainAffixId = 999;
    const result = buildEnkaPlayerProfile(source);
    const score = result.presentation.characters[0].relicScore!;
    expect(score.pieces.HEAD).toEqual({ status: 'unavailable', reason: 'piece-unavailable' });
    expect(score.pieces.HAND?.status).toBe('available');
    expect(score.build.status).toBe('unavailable');
  });

  it('does not deduplicate two instances sharing a character ID', () => {
    const source = structuredClone(raw);
    source.detailInfo.avatarDetailList = [
      source.detailInfo.avatarDetailList[0],
      structuredClone(source.detailInfo.avatarDetailList[0])
    ];
    source.detailInfo.avatarDetailList[1].relicList.pop();
    const result = buildEnkaPlayerProfile(source);
    const [first, second] = result.presentation.characters;
    expect(first.characterId).toBe(second.characterId);
    expect(first.buildId).not.toBe(second.buildId);
    expect(first.relicScore?.build.status).toBe('available');
    expect(second.relicScore?.build).toEqual({
      status: 'unavailable',
      reason: 'incomplete-build'
    });
  });

  it('expresses missing recommendation, profile, benchmark and uncertain hits without zero fallbacks', () => {
    const input = buildPlayerInput();
    const normalized: PlayerBuildNormalization = { status: 'valid', input };
    const noRecommendation = scorePlayerCharacterBuild(normalized, input.characterId, {
      recommendations: {}
    });
    expect(noRecommendation.build).toEqual({
      status: 'unavailable',
      reason: 'recommendation-unavailable'
    });
    const noProfile = scorePlayerCharacterBuild(
      { status: 'valid', input: { ...input, characterId: '999999' } },
      '999999',
      { recommendations: { '999999': { ...recommendations['1310'], avatarId: '999999' } } }
    );
    expect(noProfile.build).toEqual({ status: 'unavailable', reason: 'profile-unavailable' });
    const noBenchmark = scorePlayerCharacterBuild(normalized, input.characterId, {
      recommendations,
      score: () => ({ status: 'unavailable', reason: 'BENCHMARK_MISSING_OR_STALE', pieces: [] })
    });
    expect(noBenchmark.build).toEqual({ status: 'unavailable', reason: 'benchmark-unavailable' });
    expect(noBenchmark.pieces.HEAD).toEqual({
      status: 'unavailable',
      reason: 'benchmark-unavailable'
    });
    const uncertain = structuredClone(input);
    const head = uncertain.relics.find((piece) => piece.slot === 'HEAD')!;
    const recommended = head.substats.find((sub) =>
      recommendations[input.characterId].subStatPropertyTypes.includes(sub.key)
    )!;
    recommended.rollCount = { status: 'ambiguous', candidates: [1, 2] };
    const partial = scorePlayerCharacterBuild(
      { status: 'valid', input: uncertain },
      input.characterId,
      { recommendations }
    );
    expect(partial.build.status).toBe('available');
    if (partial.build.status === 'available') {
      expect(partial.build.effectiveHits.status).toBe('partial');
      expect(partial.build.effectiveHits.total).toBeNull();
    }
  });

  it('preserves low-rarity, underleveled, wrong-main and set semantics in the DTO', () => {
    const full = buildPlayerInput();
    const recommendation = recommendations[full.characterId];
    full.relics.forEach((piece) => {
      piece.setId = ['HEAD', 'HAND', 'BODY', 'FOOT'].includes(piece.slot)
        ? recommendation.cavernSetIds[0]
        : recommendation.planarSetIds[0];
    });
    const baseline = scorePlayerCharacterBuild({ status: 'valid', input: full }, full.characterId, {
      recommendations
    });
    expect(baseline.build.status).toBe('available');
    if (baseline.build.status !== 'available') return;
    expect(baseline.build.setIntegrity).toBe(1);

    const lower = structuredClone(full);
    lower.relics[0].rarity = 3;
    lower.relics[0].level = 6;
    lower.relics[0].mainStat.value /= 2;
    const lowScore = scorePlayerCharacterBuild(
      { status: 'valid', input: lower },
      full.characterId,
      {
        recommendations
      }
    );
    expect(lowScore.pieces.HEAD?.status).toBe('available');
    if (
      lowScore.pieces.HEAD?.status === 'available' &&
      baseline.pieces.HEAD?.status === 'available'
    )
      expect(lowScore.pieces.HEAD.mainCompletion).toBe(baseline.pieces.HEAD.mainCompletion / 2);

    const changed = structuredClone(full);
    changed.relics.find((piece) => piece.slot === 'BODY')!.mainStat.key = 'HPAddedRatio';
    changed.relics.find((piece) => piece.slot === 'HEAD')!.setId = 'unlisted';
    const broken = scorePlayerCharacterBuild(
      { status: 'valid', input: changed },
      full.characterId,
      {
        recommendations
      }
    );
    expect(broken.build.status).toBe('available');
    if (broken.build.status === 'available') {
      expect(broken.build.setIntegrity).toBeCloseTo((2 / 3) * 0.2 + 1 / 3);
      expect(broken.build.coreScore).toBeCloseTo(
        100 * (0.95 * broken.build.statCompletion + 0.05 * broken.build.setIntegrity)
      );
      expect(broken.build.score).toBeCloseTo(broken.build.coreScore);
    }
    expect(broken.pieces.BODY).toMatchObject({ status: 'available', mainCompletion: 0 });
  });

  it('rejects a malformed recommendation projection before scoring', () => {
    const missing = structuredClone(recommendations);
    delete (missing['1310'] as unknown as Record<string, unknown>).mainStatOptions;
    expect(() => assertRelicScoreRecommendations(missing)).toThrow();
  });
});
