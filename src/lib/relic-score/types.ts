import type { RelicSlot } from '../domain/types.js';
import type { PlayerStatTarget } from '../player/property-semantics.js';
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

export interface PlayerBuildInput {
  characterId: string;
  panel: Partial<Record<PlayerStatTarget, number>>;
  relics: NormalizedRelicPiece[];
}

export type NormalizationReason =
  | 'SYNTHESIS_FAILED'
  | 'MISSING_SLOT'
  | 'UNKNOWN_RELIC'
  | 'UNKNOWN_AFFIX'
  | 'UNKNOWN_RARITY'
  | 'MISSING_PANEL_STAT'
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

export type PlayerBuildNormalization =
  | { status: 'valid'; input: PlayerBuildInput }
  | {
      status: 'unavailable';
      reason: NormalizationReason;
      detail?: string;
      partialInput?: PlayerBuildInput;
      pieceFailures?: Partial<
        Record<RelicSlot, { status: 'unavailable' | 'invalid'; reason: NormalizationReason }>
      >;
    }
  | {
      status: 'invalid';
      reason: NormalizationReason;
      detail?: string;
      partialInput?: PlayerBuildInput;
      pieceFailures?: Partial<
        Record<RelicSlot, { status: 'unavailable' | 'invalid'; reason: NormalizationReason }>
      >;
    };
