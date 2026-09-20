import { describe, expect, it } from 'vitest';
import {
  createBoundedPoolState,
  runBoundedPool,
  throwBoundedPoolFailures
} from '../../scripts/assets/pool';

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('bounded asset worker pool', () => {
  it('preserves input result order while workers finish out of order', async () => {
    const results = await runBoundedPool([30, 5, 15], 3, async (milliseconds, index) => {
      await delay(milliseconds);
      return `result-${index}`;
    });
    expect(results).toEqual(['result-0', 'result-1', 'result-2']);
  });

  it('stops taking new work and reports in-flight failures by stable input order', async () => {
    const state = createBoundedPoolState();
    const started: number[] = [];
    await runBoundedPool(
      [0, 1, 2, 3, 4],
      2,
      async (value) => {
        started.push(value);
        if (value === 0) {
          await delay(15);
          throw new Error('first-input');
        }
        if (value === 1) {
          await delay(5);
          throw new Error('second-input');
        }
      },
      state
    );
    expect(started).toEqual([0, 1]);
    expect(() => throwBoundedPoolFailures(state)).toThrow(AggregateError);
    try {
      throwBoundedPoolFailures(state);
    } catch (error) {
      expect((error as AggregateError).errors.map((item) => (item as Error).message)).toEqual([
        'first-input',
        'second-input'
      ]);
    }
  });
});
