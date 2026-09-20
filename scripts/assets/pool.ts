export interface BoundedPoolFailure {
  index: number;
  error: unknown;
}

export interface BoundedPoolState {
  failed: boolean;
  failures: BoundedPoolFailure[];
}

export const createBoundedPoolState = (): BoundedPoolState => ({
  failed: false,
  failures: []
});

export async function runBoundedPool<T, TResult>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T, index: number) => Promise<TResult>,
  state: BoundedPoolState = createBoundedPoolState(),
  indexOf: (value: T, index: number) => number = (_value, index) => index
): Promise<TResult[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1)
    throw new Error(`并发数必须是正整数：${concurrency}`);
  let next = 0;
  const results = new Array<TResult>(values.length);
  const worker = async (): Promise<void> => {
    while (!state.failed) {
      const index = next;
      next += 1;
      if (index >= values.length) return;
      try {
        results[index] = await operation(values[index], index);
      } catch (error) {
        state.failures.push({ index: indexOf(values[index], index), error });
        state.failed = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

export function throwBoundedPoolFailures(state: BoundedPoolState): void {
  if (!state.failures.length) return;
  const failures = [...state.failures].sort((left, right) => left.index - right.index);
  if (failures.length === 1) throw failures[0].error;
  throw new AggregateError(
    failures.map(({ error }) => error),
    `${failures.length} 个并发视觉资源任务失败`
  );
}
