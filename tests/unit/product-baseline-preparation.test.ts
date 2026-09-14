import { describe, expect, it, vi } from 'vitest';
import {
  captureFreshProductBaseline,
  runFreshProductBaselinePreparation,
  type ProductBaselinePreparationStage
} from '../../scripts/product-baseline/cli';

describe('product baseline fresh preparation', () => {
  it('prepares every generated input in dependency order', () => {
    const stages: ProductBaselinePreparationStage[] = [];

    runFreshProductBaselinePreparation((stage) => stages.push(stage));

    expect(stages).toEqual([
      'messages:check',
      'data:sync',
      'assets:ensure:enemies',
      'assets:ensure'
    ]);
  });

  it('surfaces enemy preparation failures before later stages or capture', async () => {
    const stages: ProductBaselinePreparationStage[] = [];
    const capture = vi.fn();

    await expect(
      captureFreshProductBaseline({
        commandRunner: (stage) => {
          stages.push(stage);
          if (stage === 'assets:ensure:enemies') throw new Error('enemy assets unavailable');
        },
        capture
      })
    ).rejects.toThrow('enemy assets unavailable');

    expect(stages).toEqual(['messages:check', 'data:sync', 'assets:ensure:enemies']);
    expect(capture).not.toHaveBeenCalled();
  });
});
