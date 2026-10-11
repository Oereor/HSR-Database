import type { RelicSlot } from '../domain/types.js';

/** Common slot and Set Integrity policies. Main/sub synthesis is defined by Rating V2. */
export const RELIC_SCORE_CONFIG = {
  slots: { HEAD: 0.1, HAND: 0.1, BODY: 0.2, FOOT: 0.2, NECK: 0.2, OBJECT: 0.2 } as Record<
    RelicSlot,
    number
  >,
  sets: {
    cavernShare: 2 / 3,
    planarShare: 1 / 3,
    cavernRecommended4pc: 1,
    cavernOther4pc: 0.8,
    cavernTwoPairs: 0.5,
    cavernOnePair: 0.2,
    planarRecommended2pc: 1,
    planarOther2pc: 0.5
  }
} as const;
export const RELIC_SLOTS: readonly RelicSlot[] = ['HEAD', 'HAND', 'BODY', 'FOOT', 'NECK', 'OBJECT'];
export function validateScoringConfig(): void {
  const { slots, sets } = RELIC_SCORE_CONFIG;
  if (
    Math.abs(Object.values(slots).reduce((a, b) => a + b, 0) - 1) > 1e-12 ||
    Math.abs(sets.cavernShare + sets.planarShare - 1) > 1e-12 ||
    [slots, sets].some((group) =>
      Object.values(group).some((value) => !Number.isFinite(value) || value < 0 || value > 1)
    )
  )
    throw new Error('Invalid Rating V2 slot/set policy');
}
