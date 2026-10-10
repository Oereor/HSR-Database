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
    it(`renders V2-only semantics and review states in ${locale}`, () => {
      overwriteGetLocale(() => locale);
      const summary = render(PlayerRelicScoreSummary, { props: { score: build } }).body;
      expect(summary).toContain('data-player-rating-v2-main');
      expect(summary).toContain('data-player-rating-v2-sub');
      expect(summary).not.toMatch(
        /data-player-soft-target|data-player-hard-breakpoint|data-player-score-details/
      );
      const card = render(PlayerRelicCard, { props: { view, score: piece, showScore: true } }).body;
      expect(card).toContain('data-main-mode="fixed"');
      expect(card).not.toContain('data-player-main-suitability');
      expect(card).toContain('data-effective-hit="0"');
      const exception = render(PlayerRelicCard, {
        props: { view, score: { ...piece, mainMode: 'explicit-agnostic' }, showScore: true }
      }).body;
      expect(exception).toContain('data-main-mode="explicit-agnostic"');
      const unavailable = render(PlayerRelicScoreSummary, {
        props: { score: { status: 'unavailable', reason: 'profile-review-required' } }
      }).body;
      expect(unavailable).toContain('data-player-build-score-unavailable');
      expect(relicScoreUnavailableMessage('profile-review-required').length).toBeGreaterThan(0);
      expect(relicScoreUnavailableMessage('main-weight-unavailable').length).toBeGreaterThan(0);
    });
  }
});
