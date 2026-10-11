import type { CanonicalPlayerCharacterBuild } from '../../player/canonical.js';
import type { PlayerRuntimeData } from '../../player/runtime-data.js';
import { playerRuntimeKey } from '../../player/runtime-data.js';
import type { RelicSlot } from '../../domain/types.js';
import { normalizePiece } from '../normalize.js';
import { relicSlotFromNumber } from '../reference.js';
import { RELIC_SLOTS } from '../scoring-config.js';
import type { NormalizedRelicPiece, NormalizationReason } from '../types.js';

export interface RatingV2BuildInput {
  characterId: string;
  relics: NormalizedRelicPiece[];
}
export type RatingV2Normalization =
  | { status: 'valid'; input: RatingV2BuildInput }
  | {
      status: 'invalid' | 'unavailable';
      reason: NormalizationReason;
      partialInput: RatingV2BuildInput;
      pieceFailures: Partial<
        Record<RelicSlot, { status: 'invalid' | 'unavailable'; reason: NormalizationReason }>
      >;
    };

/** Canonical affixes suffice; panel synthesis success is irrelevant to V2. */
export function normalizeRatingV2Build(
  build: CanonicalPlayerCharacterBuild,
  runtime: PlayerRuntimeData
): RatingV2Normalization {
  const input: RatingV2BuildInput = { characterId: build.avatarId, relics: [] };
  const pieceFailures: Extract<
    RatingV2Normalization,
    { status: 'invalid' | 'unavailable' }
  >['pieceFailures'] = {};
  const seen = new Set<RelicSlot>();
  let failure: { status: 'invalid' | 'unavailable'; reason: NormalizationReason } | undefined;
  for (const relic of build.relics) {
    const slot = relicSlotFromNumber(relic.type);
    if (!slot) {
      failure = { status: 'invalid', reason: 'SLOT_MISMATCH' };
      continue;
    }
    if (seen.has(slot)) {
      const duplicate = { status: 'invalid' as const, reason: 'DUPLICATE_SLOT' as const };
      failure ??= duplicate;
      pieceFailures[slot] = duplicate;
      continue;
    }
    seen.add(slot);
    const identity = runtime.relics[relic.tid];
    const illegalStep =
      identity &&
      relic.subAffixes.some((sub) => {
        const affix =
          runtime.relicSubAffixes[playerRuntimeKey(identity.subAffixGroup, sub.affixId)];
        return (
          Number.isSafeInteger(sub.cnt) &&
          sub.cnt >= 0 &&
          affix?.stepNum !== undefined &&
          (sub.step ?? 0) > sub.cnt * affix.stepNum
        );
      });
    if (illegalStep) {
      const invalid = { status: 'invalid' as const, reason: 'INVALID_STEP' as const };
      failure = invalid;
      pieceFailures[slot] = invalid;
      continue;
    }
    const normalized = normalizePiece(relic, runtime);
    if (normalized.status === 'valid') input.relics.push(normalized.piece);
    else {
      failure ??= { status: normalized.status, reason: normalized.reason };
      pieceFailures[slot] = { status: normalized.status, reason: normalized.reason };
    }
  }
  if (RELIC_SLOTS.some((slot) => !seen.has(slot)))
    failure ??= { status: 'unavailable', reason: 'MISSING_SLOT' };
  input.relics.sort((a, b) => RELIC_SLOTS.indexOf(a.slot) - RELIC_SLOTS.indexOf(b.slot));
  return failure ? { ...failure, partialInput: input, pieceFailures } : { status: 'valid', input };
}
