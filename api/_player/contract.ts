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

export interface PlayerCharacter {
  characterId: string;
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
  base: string | null;
  addition: string | null;
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

export interface MiHoMoDependencies {
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}
