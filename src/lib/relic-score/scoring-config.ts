import type { RelicSlot } from '../domain/types.js';

/** V1 source of truth. Benchmark generation remains an explicit maintenance task. */
export const RELIC_SCORE_CONFIG = {
  benchmark: {
    budgetN: 3,
    experimentCount: 65_536,
    seed: 123_456_789,
    selectionMode: 'B',
    quantilePoints: 257
  },
  piece: { mainShare: 0.35, subShare: 0.65 },
  build: {
    statShare: 0.95,
    setShare: 0.05,
    baseStatWeight: 95,
    softTargetWeight: 8,
    hardBreakpointWeight: 5
  },
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
    benchmark.selectionMode !== 'B' ||
    benchmark.quantilePoints !== 257 ||
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
    !Number.isFinite(build.baseStatWeight) ||
    build.baseStatWeight <= 0 ||
    !Number.isFinite(build.softTargetWeight) ||
    build.softTargetWeight < 0 ||
    !Number.isFinite(build.hardBreakpointWeight) ||
    build.hardBreakpointWeight < 0
  )
    throw new Error('[relic-score] invalid scoring config');
}
