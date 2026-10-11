import type { RelicSlot } from '../domain/types.js';

import type { RelicStatKey } from './stat-registry.js';

export type RollCountEvidence =
  | { status: 'exact'; count: number; source: 'provider' }
  | { status: 'inferred'; count: number; candidates: [number] }
  | { status: 'ambiguous'; candidates: number[] }
  | { status: 'unavailable' };

export interface NormalizedMainStat {
  key: RelicStatKey;
  value: number;
}

export interface NormalizedSubstat {
  key: RelicStatKey;
  value: number;
  occurrenceCount: number;
  cumulativeStep: number;
  rollCount: RollCountEvidence;
}

export interface NormalizedRelicPiece {
  slot: RelicSlot;
  relicId: string;
  setId: string;
  rarity: number;
  level: number;
  mainStat: NormalizedMainStat;
  substats: NormalizedSubstat[];
}

export type NormalizationReason =
  | 'MISSING_SLOT'
  | 'UNKNOWN_RELIC'
  | 'UNKNOWN_AFFIX'
  | 'UNKNOWN_RARITY'
  | 'DUPLICATE_SLOT'
  | 'SLOT_MISMATCH'
  | 'INVALID_LEVEL'
  | 'INVALID_MAIN_STAT'
  | 'INVALID_SUBSTAT'
  | 'DUPLICATE_SUBSTAT'
  | 'MAIN_SUB_CONFLICT'
  | 'INVALID_ROLL_COUNT'
  | 'INVALID_STEP'
  | 'NONFINITE_VALUE';
