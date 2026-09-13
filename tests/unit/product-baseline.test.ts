import { describe, expect, it } from 'vitest';
import { captureProductBaseline } from '../../scripts/product-baseline/capture';
import { PRODUCT_BASELINE_CASES } from '../../scripts/product-baseline/cases';
import { compareProductBaseline } from '../../scripts/product-baseline/compare';
import { readProductBaselineFixtures } from '../../scripts/product-baseline/fixtures';

function keysNamed(value: unknown, forbidden: ReadonlySet<string>): string[] {
  if (Array.isArray(value)) return value.flatMap((child) => keysNamed(child, forbidden));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    ...(forbidden.has(key) ? [key] : []),
    ...keysNamed(child, forbidden)
  ]);
}

describe('PRODUCT BEHAVIOR CONTRACT: compact zh-CN representative goldens', () => {
  it('matches the generated cache and only captures deliberate cases', async () => {
    const [expected, actual] = await Promise.all([
      readProductBaselineFixtures(),
      captureProductBaseline()
    ]);

    expect(compareProductBaseline(expected, actual)).toEqual([]);
    expect(Object.keys(actual.characters)).toEqual(
      PRODUCT_BASELINE_CASES.characters.map(({ id }) => id)
    );
    expect(Object.keys(actual.lightCones)).toEqual(
      PRODUCT_BASELINE_CASES.lightCones.map(({ id }) => id)
    );
    expect(Object.keys(actual.relics)).toEqual(PRODUCT_BASELINE_CASES.relics.map(({ id }) => id));
    expect(Object.keys(actual.enemies)).toEqual(PRODUCT_BASELINE_CASES.enemies.map(({ id }) => id));
    expect(actual.endgame.boundaries).toHaveLength(4);
    expect(
      keysNamed(
        actual,
        new Set([
          'templateRef',
          'monsterRefs',
          'defaultMonsterRef',
          'statSeriesRef',
          'skillRefs',
          'summonRefs'
        ])
      )
    ).toEqual([]);
    for (const area of [actual.characters, actual.lightCones, actual.relics, actual.enemies])
      expect(area).not.toHaveProperty('order');
    expect(actual).not.toHaveProperty('unresolvedLocalization');
  }, 120_000);

  it('keeps bounded Character levels and readable Enemy semantics', async () => {
    const capture = await captureProductBaseline();
    const character = capture.characters['1415'] as Record<string, any>;
    const profiles = character.detail.profiles as Record<string, any>;
    for (const profile of Object.values(profiles))
      for (const card of profile.skillCards)
        for (const variant of card.variants) expect(variant.levels.length).toBeLessThanOrEqual(3);

    const enemy = capture.enemies['4064012'] as Record<string, any>;
    expect(enemy.detail.selectors.length).toBeGreaterThan(1);
    expect(enemy.detail.defaultMonster.skills.length).toBeGreaterThan(0);
    expect(enemy.detail.defaultMonster.summons.length).toBeGreaterThan(0);
    expect(enemy.detail.template.baseStats).toHaveProperty('initialDelayRatio');
  }, 120_000);
});
