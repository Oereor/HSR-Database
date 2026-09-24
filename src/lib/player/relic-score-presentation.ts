import type { RelicStatKey } from '../relic-score/stat-registry.js';
import { m } from '../paraglide/messages.js';
import { formatPlayerStatTotal } from './character.js';
import { formatPlayerDisplayNumber } from './display-number.js';
import { PLAYER_PROPERTY_SEMANTICS } from './property-semantics.js';
import type { PlayerRelicScoreUnavailableReason } from './relic-score-contract.js';

export function formatRelicScore(value: number): string {
  return String(Math.round(value));
}

export function formatRelicScorePercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatRelicScorePanelValue(stat: RelicStatKey, value: number): string {
  const field = PLAYER_PROPERTY_SEMANTICS[stat].target;
  const percent = !['hp', 'atk', 'def', 'spd'].includes(field);
  return formatPlayerStatTotal({
    field,
    percent,
    total: formatPlayerDisplayNumber(value, percent)
  });
}

export function relicScoreUnavailableMessage(reason: PlayerRelicScoreUnavailableReason): string {
  switch (reason) {
    case 'profile-unavailable':
      return m.player_relic_score_profile_unavailable();
    case 'recommendation-unavailable':
      return m.player_relic_score_recommendation_unavailable();
    case 'benchmark-unavailable':
      return m.player_relic_score_benchmark_unavailable();
    case 'incomplete-build':
      return m.player_relic_score_incomplete_build();
    case 'piece-unavailable':
      return m.player_relic_score_piece_unavailable();
    case 'panel-unavailable':
      return m.player_relic_score_panel_unavailable();
    case 'score-unavailable':
      return m.player_relic_score_unavailable();
  }
}
