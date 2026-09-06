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

  it('keeps the baseline limited to product contracts rather than migration registries', async () => {
    const capture = await captureProductBaseline();
    expect(capture.metadata).not.toHaveProperty('sourceCommit');
    expect(capture.metadata).not.toHaveProperty('assetCommit');
    expect(capture.enemies).not.toHaveProperty('registries');
    expect(capture.endgame).not.toHaveProperty('registries');
    expect(capture).not.toHaveProperty('characterIcons');
    expect(
      Object.keys((capture.search as { queries: Record<string, unknown> }).queries).sort((a, b) =>
        a.localeCompare(b, 'zh-CN')
      )
    ).toEqual(
      ['卡芙卡', '锋镝', '银鬃尉官', '迷惘之渊的裁定者', '不存在的搜索词'].sort((a, b) =>
        a.localeCompare(b, 'zh-CN')
      )
    );
    expect(capture.unresolvedLocalization).not.toHaveProperty('entries');
  }, 120_000);
});
