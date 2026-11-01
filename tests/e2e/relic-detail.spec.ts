import { expect, test } from '@playwright/test';

test('隧洞遗器详情使用双栏 Hero、唯一套装效果和四张部件卡', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/relics/101/');

  const hero = page.locator('[data-relic-detail-hero]');
  await expect(hero).toBeVisible();
  await expect(hero.getByRole('heading', { level: 1 })).toHaveText('云无留迹的过客');
  await expect(hero.locator('.hero-identity-copy > .kicker')).toContainText('101');
  await expect(hero.getByRole('heading', { level: 2 })).toBeVisible();
  await expect(page.locator('[data-relic-piece-count] h2')).toBeVisible();
  await expect(hero.locator('.relic-icon-stage--hero img')).toHaveAttribute(
    'src',
    '/generated-assets/relics/icons/101.png'
  );
  await expect(hero.locator('[data-effect-requirement]')).toHaveCount(2);
  await expect(hero.locator('[data-effect-requirement="2"]')).toContainText('治疗量提高10%');
  await expect(hero.locator('[data-effect-requirement="4"]')).toContainText(
    '立即为我方恢复1个战技点'
  );
  await expect(page.getByText('治疗量提高10%。', { exact: true })).toHaveCount(1);

  const pieces = page.locator('[data-relic-piece-id]');
  await expect(pieces).toHaveCount(4);
  await expect(pieces.getByRole('heading', { level: 3 })).toHaveCount(4);
  expect(
    await pieces.evaluateAll((cards) => cards.map((card) => card.getAttribute('data-relic-slot')))
  ).toEqual(['HEAD', 'HAND', 'BODY', 'FOOT']);
  expect(
    await pieces
      .locator('.relic-icon-stage--piece img')
      .evaluateAll((images) => images.map((image) => image.getAttribute('src')))
  ).toEqual([
    '/generated-assets/relics/pieces/31011.png',
    '/generated-assets/relics/pieces/31012.png',
    '/generated-assets/relics/pieces/31013.png',
    '/generated-assets/relics/pieces/31014.png'
  ]);
  await expect(page.locator('.source-note')).toHaveCount(0);
});

test('位面饰品只展示真实的 2 件套效果与两个部件', async ({ page }) => {
  await page.goto('/relics/301/');
  const hero = page.locator('[data-relic-detail-hero]');
  await expect(hero.locator('.hero-identity-copy > .kicker')).not.toHaveText('');
  await expect(hero.locator('[data-effect-requirement]')).toHaveCount(1);
  await expect(hero.locator('[data-effect-requirement="2"]')).toBeVisible();
  await expect(hero.locator('[data-effect-requirement="4"]')).toHaveCount(0);

  const pieces = page.locator('[data-relic-piece-id]');
  await expect(pieces).toHaveCount(2);
  expect(
    await pieces.evaluateAll((cards) => cards.map((card) => card.getAttribute('data-relic-slot')))
  ).toEqual(['NECK', 'OBJECT']);
  expect(
    await pieces
      .locator('img')
      .evaluateAll((images) => images.map((image) => image.getAttribute('src')))
  ).toEqual([
    '/generated-assets/relics/pieces/33015.png',
    '/generated-assets/relics/pieces/33016.png'
  ]);
});

test('长套装效果与图片错误保持可读降级', async ({ page }) => {
  await page.goto('/relics/132/');
  const hero = page.locator('[data-relic-detail-hero]');
  const longEffect = hero.locator('[data-effect-requirement="4"] p');
  await expect(longEffect).toContainText('持有【助燃】的我方目标造成的伤害提高15%');

  const heroStage = hero.locator('.relic-icon-stage--hero');
  await heroStage.locator('img').evaluate((image) => image.dispatchEvent(new Event('error')));
  await expect(heroStage).toHaveAttribute('data-image-missing', 'true');
  await expect(heroStage.locator('img')).toHaveCount(0);
  await expect(heroStage.locator('[data-image-fallback]')).toBeVisible();

  const pieceStage = page.locator('.relic-icon-stage--piece').first();
  await pieceStage.locator('img').evaluate((image) => image.dispatchEvent(new Event('error')));
  await expect(pieceStage).toHaveAttribute('data-image-missing', 'true');
  await expect(pieceStage.locator('img')).toHaveCount(0);
  await expect(pieceStage.locator('[data-image-fallback]')).toBeVisible();
});

for (const prefix of ['', '/en']) {
  test(`compact relic pieces follow container width ${prefix || 'zh-CN'}`, async ({ page }) => {
    for (const [id, count] of [
      ['101', 4],
      ['301', 2]
    ] as const) {
      for (const width of [390, 768, 1280, 1600]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${prefix}/relics/${id}/`);
        const pieces = page.locator('[data-relic-piece-id]');
        await expect(pieces).toHaveCount(count);
        await expect(page.locator('[data-relic-lore], [data-relic-story-section]')).toHaveCount(0);
        const grid = page.locator('.relic-piece-list');
        const available = await grid.evaluate((e) => e.getBoundingClientRect().width);
        const columns = available >= 1024 && count === 4 ? 4 : available >= 576 ? 2 : 1;
        await expect
          .poll(() =>
            grid.evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length)
          )
          .toBe(columns);
        if (width >= 1280) {
          await page.locator('[data-slot="sidebar-trigger"]').click();
          await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute(
            'data-state',
            'expanded'
          );
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        ).toBeLessThanOrEqual(1);
      }
    }
  });
}
