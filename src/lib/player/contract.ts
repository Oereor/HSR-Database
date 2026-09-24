import type { PlayerRelicScorePresentation } from './relic-score-contract.js';

export interface PlayerProfile {
  uid: string;
  nickname: string;
  level: number;
  worldLevel: number;
  avatar: {
    id: string;
    icon: string;
  } | null;
  signature: string;
  characterCount: number | null;
  lightConeCount: number | null;
  achievementCount: number | null;
  characters: PlayerCharacter[];
}

export type PlayerDisplayArea = 'assist' | 'showcase' | 'unknown';

export interface PlayerCharacter {
  buildId: string;
  characterId: string;
  display: {
    area: PlayerDisplayArea;
    position?: number;
    sourceOrder: number;
  };
  progression: {
    rank: number;
    level: number;
    promotion: number;
    enhanced: boolean;
  };
  skillTree: Array<{
    id: string;
    level: number;
  }>;
  lightCone: PlayerLightCone | null;
  relics: PlayerRelic[];
  stats: PlayerStat[];
  relicScore?: PlayerRelicScorePresentation;
}

export interface PlayerLightCone {
  lightConeId: string;
  rank: number;
  level: number;
  promotion: number;
}

export interface PlayerRelic {
  type: 1 | 2 | 3 | 4 | 5 | 6;
  setId: string;
  level: number;
  mainAffix: PlayerRelicAffix | null;
  subAffixes: PlayerRelicSubAffix[];
}

export interface PlayerRelicAffix {
  type: string;
  display: string;
  percent: boolean;
}

export interface PlayerRelicSubAffix extends PlayerRelicAffix {
  count: number;
}

export interface PlayerStat {
  field: string;
  percent: boolean;
  total: string;
}

export type PlayerErrorCode =
  | 'INVALID_UID'
  | 'PLAYER_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_INVALID_RESPONSE';

export interface PlayerErrorResponse {
  error: {
    code: PlayerErrorCode;
    retryable: boolean;
    retryAfterSeconds?: number;
  };
}
