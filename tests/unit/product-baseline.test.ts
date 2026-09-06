import { describe, expect, it } from 'vitest';
import { captureProductBaseline } from '../../scripts/product-baseline/capture';
import { compareProductBaseline } from '../../scripts/product-baseline/compare';
import { readProductBaselineFixtures } from '../../scripts/product-baseline/fixtures';

describe('PRODUCT BEHAVIOR CONTRACT: zh-CN semantic baseline', () => {
  it('matches the existing generated cache with field-level diagnostics', async () => {
    const [expected, actual] = await Promise.all([
      readProductBaselineFixtures(),
      captureProductBaseline()
    ]);
    expect(actual.characters.order).toHaveLength(97);
    expect(compareProductBaseline(expected, actual)).toEqual([]);
  }, 120_000);
});
