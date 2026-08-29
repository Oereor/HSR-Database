import { expect, test } from '@playwright/test';

test('隧洞遗器详情使用双栏 Hero、唯一套装效果和四张部件卡', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/relics/101');

  const hero = page.locator('[data-relic-detail-hero]');
  await expect(hero).toBeVisible();
  await expect(hero.getByRole('heading', { level: 1 })).toHaveText('云无留迹的过客');
  await expect(hero.locator('.hero-identity-copy > .kicker')).toHaveText('遗器套装 / ID 101');
  await expect(hero.getByRole('heading', { level: 2 })).toHaveText('套装效果');
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
  expect(
    await pieces.evaluateAll((cards) => cards.map((card) => card.getAttribute('data-relic-slot')))
  ).toEqual(['HEAD', 'HAND', 'BODY', 'FOOT']);
  expect(
    await pieces
      .locator('.relic-icon-stage--card img')
      .evaluateAll((images) => images.map((image) => image.getAttribute('src')))
  ).toEqual([
    '/generated-assets/relics/pieces/31011.png',
    '/generated-assets/relics/pieces/31012.png',
    '/generated-assets/relics/pieces/31013.png',
    '/generated-assets/relics/pieces/31014.png'
  ]);
  await expect(page.getByRole('heading', { name: '获取来源' })).toHaveCount(0);
  await expect(page.getByText('侵蚀隧洞【残响回廊】')).toHaveCount(0);
  await expect(page.locator('.source-note')).toContainText('数据来源');
  await expect(page.locator('.source-note')).toContainText('套装预览与各部件图标');

  const [identity, inspection] = await Promise.all([
    hero.locator('.detail-profile-hero__identity').boundingBox(),
    hero.locator('.detail-profile-hero__inspection').boundingBox()
  ]);
  expect(identity).not.toBeNull();
  expect(inspection).not.toBeNull();
  expect(inspection!.x).toBeGreaterThan(identity!.x);
  expect(Math.abs(identity!.y - inspection!.y)).toBeLessThan(1);

  const firstRow = await pieces.evaluateAll((cards) => {
    const boxes = cards.map((card) => card.getBoundingClientRect());
    return boxes.filter((box) => Math.abs(box.y - boxes[0].y) < 1).length;
  });
  expect(firstRow).toBe(4);
});

test('位面饰品只展示真实的 2 件套效果与两个部件', async ({ page }) => {
  await page.goto('/relics/301');
  const hero = page.locator('[data-relic-detail-hero]');
  await expect(hero).toContainText('位面饰品');
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

test('长套装效果与图片错误降级不会造成溢出或 broken image', async ({ page }) => {
  await page.goto('/relics/132');
  const hero = page.locator('[data-relic-detail-hero]');
  const longEffect = hero.locator('[data-effect-requirement="4"] p');
  await expect(longEffect).toContainText('持有【助燃】的我方目标造成的伤害提高15%');
  expect(
    await longEffect.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  ).toBe(true);
  expect(await hero.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );

  const heroStage = hero.locator('.relic-icon-stage--hero');
  await heroStage.locator('img').evaluate((image) => image.dispatchEvent(new Event('error')));
  await expect(heroStage).toHaveAttribute('data-image-missing', 'true');
  await expect(heroStage.locator('img')).toHaveCount(0);
  await expect(heroStage.locator('.relic-icon-stage__fallback')).toBeVisible();

  const pieceStage = page.locator('.relic-icon-stage--card').first();
  await pieceStage.locator('img').evaluate((image) => image.dispatchEvent(new Event('error')));
  await expect(pieceStage).toHaveAttribute('data-image-missing', 'true');
  await expect(pieceStage.locator('img')).toHaveCount(0);
  await expect(pieceStage.locator('.relic-icon-stage__fallback')).toBeVisible();
});

test('遗器 Hero 与部件网格在平板和移动端自然堆叠', async ({ page }) => {
  for (const viewport of [
    { width: 768, height: 1000, columns: 2 },
    { width: 390, height: 844, columns: 1 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/relics/101');
    const hero = page.locator('[data-relic-detail-hero]');
    const [identity, inspection] = await Promise.all([
      hero.locator('.detail-profile-hero__identity').boundingBox(),
      hero.locator('.detail-profile-hero__inspection').boundingBox()
    ]);
    expect(identity).not.toBeNull();
    expect(inspection).not.toBeNull();
    expect(inspection!.y).toBeGreaterThan(identity!.y);

    const pieces = page.locator('[data-relic-piece-id]');
    const firstRow = await pieces.evaluateAll((cards) => {
      const boxes = cards.map((card) => card.getBoundingClientRect());
      return boxes.filter((box) => Math.abs(box.y - boxes[0].y) < 1).length;
    });
    expect(firstRow).toBe(viewport.columns);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    ).toBe(true);
  }
});
