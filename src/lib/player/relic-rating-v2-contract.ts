import type { RelicSlot } from '../domain/types.js';
import type { RatingV2Piece, RatingV2Reason, RatingV2Build } from '../relic-score/v2/score.js';

export type PlayerRelicPieceScoreV2 =
  | ({ status: 'available'; algorithmVersion: 2 } & Omit<RatingV2Piece, 'slot'>)
  | { status: 'unavailable'; reason: RatingV2Reason };
export type PlayerRelicBuildScoreV2 =
  | ({ status: 'available'; algorithmVersion: 2; setIntegrity: number } & Omit<
      RatingV2Build,
      'setIntegrity'
    >)
  | { status: 'unavailable'; reason: RatingV2Reason };
/** Presentation version 3 and scoring algorithm 2 are separate contracts. */
export interface PlayerRelicScorePresentationV2 {
  version: 3;
  algorithmVersion: 2;
  build: PlayerRelicBuildScoreV2;
  pieces: Partial<Record<RelicSlot, PlayerRelicPieceScoreV2>>;
}
