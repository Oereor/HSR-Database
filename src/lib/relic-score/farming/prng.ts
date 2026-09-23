/** Mulberry32 v1: explicit uint32 seed, uint32 state, and float output in [0, 1). */
export const PRNG_VERSION = 'mulberry32-v1' as const;

export interface SeededRng {
  next(): number;
}

export function createSeededRng(seed: number): SeededRng {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error('[relic-score/farming] seed must be a uint32');
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
    }
  };
}
