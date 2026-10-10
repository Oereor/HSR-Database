import { m } from '../paraglide/messages.js';
import type { RatingV2Reason } from '../relic-score/v2/score.js';

export function formatRelicScore(value: number): string {
  return value.toFixed(1);
}
export function formatRelicScorePercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
export function relicScoreUnavailableMessage(reason: RatingV2Reason): string {
  switch (reason) {
    case 'profile-review-required':
      return m.player_relic_rating_v2_review_required();
    case 'main-weight-unavailable':
      return m.player_relic_rating_v2_main_unavailable();
    case 'profile-unavailable':
      return m.player_relic_score_profile_unavailable();
    case 'benchmark-unavailable':
      return m.player_relic_score_benchmark_unavailable();
    case 'incomplete-build':
      return m.player_relic_score_incomplete_build();
    case 'piece-unavailable':
      return m.player_relic_score_piece_unavailable();
  }
}
