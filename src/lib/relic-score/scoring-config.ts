import type { RelicSlot } from '../domain/types.js';

/** Phase 1D source of truth. Benchmark generation remains an explicit maintenance task. */
export const RELIC_SCORE_CONFIG = {
  benchmark: { budgetN: 3, experimentCount: 65_536, seed: 123_456_789 },
  piece: { mainShare: 0.35, subShare: 0.65 },
  build: { statShare: 0.95, setShare: 0.05, maxSoftTargetBonus: 4, maxBreakpointPenalty: 8 },
  slots: { HEAD: 0.1, HAND: 0.1, BODY: 0.2, FOOT: 0.2, NECK: 0.2, OBJECT: 0.2 } as Record<
    RelicSlot,
    number
  >,
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
  const { benchmark, piece, build, slots, sets } = RELIC_SCORE_CONFIG;
  if (
    !Number.isSafeInteger(benchmark.budgetN) ||
    benchmark.budgetN < 1 ||
    benchmark.budgetN > 9 ||
    !Number.isSafeInteger(benchmark.experimentCount) ||
    benchmark.experimentCount < 1 ||
    !Number.isSafeInteger(benchmark.seed) ||
    benchmark.seed < 0 ||
    benchmark.seed > 0xffffffff ||
    Math.abs(sum(Object.values(piece)) - 1) > 1e-12 ||
    Math.abs(build.statShare + build.setShare - 1) > 1e-12 ||
    Math.abs(sum(Object.values(slots)) - 1) > 1e-12 ||
    Math.abs(sets.cavernShare + sets.planarShare - 1) > 1e-12 ||
    [piece, slots, sets].some((group) =>
      Object.values(group).some((value) => !Number.isFinite(value) || value < 0 || value > 1)
    ) ||
    [build.statShare, build.setShare].some(
      (value) => !Number.isFinite(value) || value < 0 || value > 1
    ) ||
    [build.maxSoftTargetBonus, build.maxBreakpointPenalty].some(
      (value) => !Number.isFinite(value) || value < 0 || value > 100
    )
  )
    throw new Error('[relic-score] invalid scoring config');
}
