import { render } from 'svelte/server';
import { afterEach, describe, expect, it } from 'vitest';
import PlayerRelicScoreSummary from '../../src/lib/components/player/PlayerRelicScoreSummary.svelte';
import PlayerRelicCard from '../../src/lib/components/player/PlayerRelicCard.svelte';
import type {
  PlayerRelicBuildScoreV2,
  PlayerRelicPieceScoreV2
} from '../../src/lib/player/relic-rating-v2-contract';
import type { PlayerRelicSlotView } from '../../src/lib/player/equipment';
import { getLocale, overwriteGetLocale } from '../../src/lib/paraglide/runtime.js';
import { m } from '../../src/lib/paraglide/messages.js';
import { relicScoreUnavailableMessage } from '../../src/lib/player/relic-score-presentation';

const originalGetLocale = getLocale;
afterEach(() => overwriteGetLocale(originalGetLocale));
const hits = { status: 'exact' as const, known: 2, total: 2, unknownRecommendedSubstats: 0 };
const build: PlayerRelicBuildScoreV2 = {
  status: 'available',
  algorithmVersion: 2,
  score: 84,
  statCompletion: 0.82,
  mainContribution: 0.28,
  subContribution: 0.54,
  setIntegrity: 1,
  effectiveHits: hits
};
const view: PlayerRelicSlotView = {
  slot: 'HEAD',
  type: 1,
  set: undefined,
  piece: undefined,
  relic: { type: 1, setId: 'synthetic', rarity: 5, level: 15, mainAffix: null, subAffixes: [] },
  mainAffix: null,
  subAffixes: []
};
const piece: Extract<PlayerRelicPieceScoreV2, { status: 'available' }> = {
  status: 'available',
  algorithmVersion: 2,
  score: 80,
  mainMode: 'fixed',
  mainCompletion: null,
  mainSuitability: null,
  mainContribution: 0,
  subContribution: 0.8,
  benchmarkPercentile: 0.8,
  rawSubUtility: 2,
  effectiveHits: hits,
  substats: [{ key: 'AttackDelta', weight: 4 / 9, rollEq: 1, utility: 4 / 9, effectiveHit: 0 }]
};

describe('Rating V2 locale presentation', () => {
  for (const locale of ['zh-CN', 'en'] as const) {
    it(`renders concise scores and review states in ${locale}`, () => {
      overwriteGetLocale(() => locale);
      const summary = render(PlayerRelicScoreSummary, { props: { score: build } }).body;
      expect(summary).toMatch(/data-player-build-score[^>]*>84\.0</);
      expect(summary).toMatch(/data-player-effective-hits[\s\S]*?<strong[^>]*>2<\/strong>/);
      expect(summary.match(/<dt\b/g)).toHaveLength(2);
      expect(summary.match(/<dd\b/g)).toHaveLength(2);
      expect(summary).toContain('82%');
      expect(summary).toContain('100%');
      expect(summary).not.toMatch(/V2|data-player-rating-v2|data-player-rating-algorithm/);
      for (const mainMode of ['fixed', 'continuous', 'explicit-agnostic'] as const) {
        const card = render(PlayerRelicCard, {
          props: { view, score: { ...piece, mainMode }, showScore: true }
        }).body;
        expect(card).toContain('data-player-relic-piece-score');
        expect(card).toMatch(/<strong[^>]*>80\.0<\/strong>/);
        expect(card).not.toMatch(
          /data-player-rating-v2|data-player-main-suitability|data-main-mode|data-weight|data-effective-hit/
        );
      }
      const partial = render(PlayerRelicScoreSummary, {
        props: {
          score: {
            ...build,
            effectiveHits: {
              status: 'partial',
              known: 2,
              total: null,
              unknownRecommendedSubstats: 1
            }
          }
        }
      }).body;
      expect(partial).toContain(m.player_relic_score_at_least({ count: 2 }));
      expect(partial).toMatch(/data-player-effective-hits[\s\S]*?<small[^>]*>[^<]+<\/small>/);
      const unavailablePiece = render(PlayerRelicCard, {
        props: {
          view,
          score: { status: 'unavailable', reason: 'profile-review-required' },
          showScore: true
        }
      }).body;
      expect(unavailablePiece).toMatch(
        /data-player-relic-piece-score[\s\S]*?<strong[^>]*>—<\/strong>/
      );
      expect(render(PlayerRelicCard, { props: { view, score: piece } }).body).not.toContain(
        'data-player-relic-piece-score'
      );
      const unavailable = render(PlayerRelicScoreSummary, {
        props: { score: { status: 'unavailable', reason: 'profile-review-required' } }
      }).body;
      expect(unavailable).toContain('data-player-build-score-unavailable');
      expect(unavailable).not.toContain('data-player-score-breakdown');
      expect(unavailable).not.toContain('/ 100');
      expect(unavailable).toMatch(/data-player-effective-hits[\s\S]*?<strong[^>]*>—<\/strong>/);
      expect(relicScoreUnavailableMessage('profile-review-required').length).toBeGreaterThan(0);
      expect(relicScoreUnavailableMessage('main-weight-unavailable').length).toBeGreaterThan(0);
    });
  }
});
