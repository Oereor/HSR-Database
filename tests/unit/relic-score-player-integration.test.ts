import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildEnkaPlayerProfile, playerRuntimeData } from '../../api/_player/enka/pipeline.js';
import { scorePlayerCharacterBuild } from '../../src/lib/server/relic-score/player.js';

const raw = JSON.parse(
  readFileSync('tests/fixtures/enka/phase1-player.sanitized.json', 'utf8')
) as {
  detailInfo: { avatarDetailList: Array<{ relicList: Array<Record<string, unknown>> }> };
};
describe('production V2 player scoring', () => {
  it('uses the formal loader and preserves scorer precision for every build', () => {
    const result = buildEnkaPlayerProfile(raw);
    expect(result.scoringFailures).toEqual([]);
    expect(result.presentation.characters).toHaveLength(6);
    for (const [index, character] of result.presentation.characters.entries()) {
      expect(character.relicScore).toEqual(
        scorePlayerCharacterBuild(result.canonical.characters[index].build, playerRuntimeData).score
      );
      expect(character.relicScore).toMatchObject({
        version: 3,
        algorithmVersion: 2,
        build: { status: 'available' }
      });
      for (const piece of Object.values(character.relicScore!.pieces)) {
        expect(piece?.status).toBe('available');
        if (piece?.status === 'available') {
          expect(piece.score).toBeGreaterThanOrEqual(0);
          expect(piece.score).toBeLessThanOrEqual(100);
        }
      }
    }
    expect(JSON.stringify(result.presentation)).not.toMatch(
      /quantiles|benchmarkIdentity|softTargets|hardBreakpoints/
    );
  });
  it('retains five valid pieces when the sixth slot is missing', () => {
    const source = structuredClone(raw);
    source.detailInfo.avatarDetailList[0].relicList.pop();
    const score = buildEnkaPlayerProfile(source).presentation.characters[0].relicScore!;
    expect(score.build).toEqual({ status: 'unavailable', reason: 'incomplete-build' });
    expect(Object.values(score.pieces)).toHaveLength(5);
    expect(Object.values(score.pieces).every((piece) => piece?.status === 'available')).toBe(true);
  });
  it('isolates a malformed affix to its slot', () => {
    const source = structuredClone(raw);
    source.detailInfo.avatarDetailList[0].relicList[0].mainAffixId = 999;
    const score = buildEnkaPlayerProfile(source).presentation.characters[0].relicScore!;
    expect(score.pieces.HEAD).toEqual({ status: 'unavailable', reason: 'piece-unavailable' });
    expect(score.pieces.HAND?.status).toBe('available');
    expect(score.build.status).toBe('unavailable');
  });
  it('keeps separate instances of the same character', () => {
    const source = structuredClone(raw);
    source.detailInfo.avatarDetailList = [
      source.detailInfo.avatarDetailList[0],
      structuredClone(source.detailInfo.avatarDetailList[0])
    ];
    source.detailInfo.avatarDetailList[1].relicList.pop();
    const [first, second] = buildEnkaPlayerProfile(source).presentation.characters;
    expect(first.characterId).toBe(second.characterId);
    expect(first.buildId).not.toBe(second.buildId);
    expect(first.relicScore?.build.status).toBe('available');
    expect(second.relicScore?.build).toEqual({ status: 'unavailable', reason: 'incomplete-build' });
  });
});
