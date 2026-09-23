import type { RelicSlot } from '../domain/types.js';

/** Phase 1C scoring parameters; N and K deliberately have no production defaults. */
export const RELIC_SCORE_CONFIG = {
  piece: { mainShare: 0.3, subShare: 0.7 },
  slots: { HEAD: 0.1, HAND: 0.1, BODY: 0.2, FOOT: 0.2, NECK: 0.2, OBJECT: 0.2 } as Record<
    RelicSlot,
    number
  >,
  build: { statShare: 0.85, breakpointShare: 0.1, setShare: 0.05 },
  sets: {
    cavernShare: 2 / 3,
    planarShare: 1 / 3,
    recommended4pcFull: 1,
    recommended4pcHalf: 0.5,
    recommendedPlanarFull: 1
  }
} as const;

export const RELIC_SLOTS: readonly RelicSlot[] = ['HEAD', 'HAND', 'BODY', 'FOOT', 'NECK', 'OBJECT'];

export function validateScoringConfig(): void {
  const sum = (items: readonly number[]) => items.reduce((a, b) => a + b, 0);
  const { piece, slots, build, sets } = RELIC_SCORE_CONFIG;
  if (
    Math.abs(sum(Object.values(piece)) - 1) > 1e-12 ||
    Math.abs(sum(Object.values(slots)) - 1) > 1e-12 ||
    Math.abs(sum(Object.values(build)) - 1) > 1e-12 ||
    Math.abs(sets.cavernShare + sets.planarShare - 1) > 1e-12 ||
    Object.values(RELIC_SCORE_CONFIG).some((group) =>
      Object.values(group).some((value) => !Number.isFinite(value) || value < 0 || value > 1)
    )
  )
    throw new Error('[relic-score] invalid scoring config');
}
