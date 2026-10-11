import type { RelicSlot } from '../../domain/types.js';
import type { PlayerRelicScorePresentationV2 } from '../../player/relic-rating-v2-contract.js';
import type { RatingV2Normalization } from './normalize.js';
import type { scoreRatingV2Build } from './score.js';

export function presentRatingV2(
  normalized: RatingV2Normalization,
  result: ReturnType<typeof scoreRatingV2Build>
): PlayerRelicScorePresentationV2 {
  const input = normalized.status === 'valid' ? normalized.input : normalized.partialInput;
  const pieces: PlayerRelicScorePresentationV2['pieces'] = {};
  for (const [index, piece] of input.relics.entries()) {
    const scored = result.pieces[index];
    if (scored?.status === 'available') {
      const { slot, ...value } = scored.value;
      pieces[slot] = { status: 'available', algorithmVersion: 2, ...value };
    } else
      pieces[piece.slot] = { status: 'unavailable', reason: scored?.reason ?? 'piece-unavailable' };
  }
  if (normalized.status !== 'valid')
    for (const slot of Object.keys(normalized.pieceFailures) as RelicSlot[])
      pieces[slot] = { status: 'unavailable', reason: 'piece-unavailable' };
  const build: PlayerRelicScorePresentationV2['build'] =
    normalized.status !== 'valid'
      ? {
          status: 'unavailable',
          reason: normalized.reason === 'MISSING_SLOT' ? 'incomplete-build' : 'piece-unavailable'
        }
      : result.build.status === 'available'
        ? {
            status: 'available',
            algorithmVersion: 2,
            ...result.build.value,
            setIntegrity: result.build.value.setIntegrity.total
          }
        : result.build;
  return { version: 3, algorithmVersion: 2, build, pieces };
}
