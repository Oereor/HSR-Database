import type { PlayerDisplayArea, PlayerProfile, PlayerStat } from './contract.js';

export interface CanonicalPlayerTrace {
  pointId: string;
  rawLevel: number;
}

export interface CanonicalPlayerLightCone {
  lightConeId: string;
  superimposition: number;
  level: number;
  promotion: number;
}

export interface CanonicalPlayerRelicSubAffix {
  affixId: number;
  cnt: number;
  step?: number;
}

export interface CanonicalPlayerRelic {
  tid: string;
  type: 1 | 2 | 3 | 4 | 5 | 6;
  level: number;
  mainAffixId: number;
  subAffixes: CanonicalPlayerRelicSubAffix[];
}

export interface CanonicalPlayerCharacterBuild {
  buildId: string;
  avatarId: string;
  display: {
    area: PlayerDisplayArea;
    position?: number;
    sourceOrder: number;
  };
  level: number;
  promotion: number;
  eidolon: number;
  enhancedId?: number;
  skinId?: string;
  traces: CanonicalPlayerTrace[];
  lightCone?: CanonicalPlayerLightCone;
  relics: CanonicalPlayerRelic[];
}

export interface CanonicalPlayerPrivacy {
  displayCollection?: boolean;
  displayRecord?: boolean;
  displayRecordTeam?: boolean;
  displayOnlineStatus?: boolean;
  displayDiary?: boolean;
}

export interface CanonicalPlayerRecords {
  achievementCount?: number;
  bookCount?: number;
  avatarCount?: number;
  equipmentCount?: number;
  musicCount?: number;
  relicCount?: number;
  maxRogueChallengeScore?: number;
}

export interface CanonicalPlayerProfile {
  uid: string;
  nickname: string;
  level: number;
  worldLevel: number;
  signature?: string;
  headIconId?: string;
  personalCardId?: string;
  friendCount?: number;
  isDisplayAvatar?: boolean;
  privacy?: CanonicalPlayerPrivacy;
  records?: CanonicalPlayerRecords;
  characters: CanonicalPlayerCharacterBuild[];
}

export interface PlayerSynthesisDiagnostic {
  code:
    | 'UNKNOWN_AVATAR'
    | 'UNKNOWN_LIGHT_CONE'
    | 'UNKNOWN_RELIC'
    | 'UNKNOWN_AFFIX'
    | 'UNKNOWN_TRACE'
    | 'UNKNOWN_PROPERTY_TYPE';
  sourceId: string;
  propertyType?: string;
}

export interface SynthesizedPlayerCharacterBuild {
  build: CanonicalPlayerCharacterBuild;
  status: 'complete' | 'failed';
  stats: PlayerStat[];
  values: Partial<Record<string, number>>;
  diagnostics: PlayerSynthesisDiagnostic[];
}

export interface ResolvedCanonicalPlayerProfile {
  profile: CanonicalPlayerProfile;
  characters: SynthesizedPlayerCharacterBuild[];
}

export interface PlayerFetchMetadata {
  region?: string;
  ttl?: number;
  fetchedAt: number;
  cacheHit: boolean;
}

export interface PlayerFetchResult<T = CanonicalPlayerProfile> {
  profile: T;
  metadata: PlayerFetchMetadata;
}

/** Internal Enka pipeline result. Only presentation is returned by /api/player. */
export interface EnkaPlayerPipelineResult {
  canonical: ResolvedCanonicalPlayerProfile;
  normalizedBuilds: import('../relic-score/types.js').PlayerBuildNormalization[];
  presentation: PlayerProfile;
  metadata?: PlayerFetchMetadata;
}
