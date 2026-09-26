import { expect, test, type Locator } from '@playwright/test';

async function expectFullWidthLore(lore: Locator) {
  const widthDifference = await lore.evaluate((element) =>
    Math.abs(
      element.getBoundingClientRect().width - element.parentElement!.getBoundingClientRect().width
    )
  );
  expect(widthDifference).toBeLessThanOrEqual(1);
}

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

test('宽屏部件为单列长卡，故事直接可读且 Hero 仅在遗器页紧凑', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/relics/101/');

  const hero = page.locator('[data-relic-detail-hero]');
  await expect(hero).toHaveClass(/detail-profile-hero--relic-compact/);
  await expect(hero.locator('.detail-profile-hero__identity')).toHaveCSS('min-height', '390px');
  const pieces = page.locator('[data-relic-piece-id]');
  const first = pieces.first();
  await expect(first.locator('[data-relic-lore]')).toBeVisible();
  await expect(first.locator('[data-relic-lore]')).toContainText('佚名之人自漫长的沉眠中醒来');
  await expectFullWidthLore(first.locator('[data-relic-lore]'));
  await expect(first.locator('summary')).toBeHidden();
  const boxes = await pieces.evaluateAll((cards) =>
    cards.map((card) => card.getBoundingClientRect())
  );
  expect(boxes[0].width).toBeGreaterThan(700);
  expect(boxes[1].top).toBeGreaterThan(boxes[0].bottom);

  for (const url of ['/characters/1001/', '/light-cones/20000/', '/enemies/1004014/']) {
    await page.goto(url);
    await expect(page.locator('.detail-profile-hero--relic-compact')).toHaveCount(0);
  }
});

test('窄屏故事默认收起，四张卡片独立展开', async ({ page }) => {
  for (const width of [820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/relics/101/');
    const pieces = page.locator('[data-relic-piece-id]');
    const first = pieces.nth(0);
    const second = pieces.nth(1);
    const firstSummary = first.locator('summary');
    const secondSummary = second.locator('summary');
    const firstDetails = first.locator('details');
    await expect(firstSummary).toBeVisible();
    await expect(firstDetails).not.toHaveAttribute('open', '');
    await expect(first.locator('[data-relic-lore]')).toBeHidden();
    await expect(second.locator('[data-relic-lore]')).toBeHidden();
    await expect(first.locator('.relic-piece-card__slot')).toBeVisible();
    await firstSummary.focus();
    await page.keyboard.press('Enter');
    await expect(firstDetails).toHaveAttribute('open', '');
    await expect(first.locator('[data-relic-lore]')).toBeVisible();
    await expectFullWidthLore(first.locator('[data-relic-lore]'));
    await expect(second.locator('[data-relic-lore]')).toBeHidden();
    await secondSummary.click();
    await expect(first.locator('[data-relic-lore]')).toBeVisible();
    await expect(second.locator('[data-relic-lore]')).toBeVisible();
    await firstSummary.focus();
    await page.keyboard.press('Space');
    await expect(firstDetails).not.toHaveAttribute('open', '');
    await expect(second.locator('[data-relic-lore]')).toBeVisible();

    await page.setViewportSize({ width: 1600, height: 900 });
    await expect(first.locator('[data-relic-lore]')).toBeVisible();
    await expect(firstSummary).toBeHidden();
    await page.setViewportSize({ width, height: 900 });
    await expect(first.locator('[data-relic-lore]')).toBeHidden();
    await expect(second.locator('[data-relic-lore]')).toBeVisible();
  }
});

test('英文遗器故事在桌面和窄屏均可阅读', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/en/relics/101/');
  const first = page.locator('[data-relic-piece-id="31011"]');
  await expect(first.locator('[data-relic-lore]')).toContainText(
    'A distant and yet familiar feeling of nervousness'
  );
  await expect(first.locator('[data-relic-lore]')).toBeVisible();
  await expectFullWidthLore(first.locator('[data-relic-lore]'));

  await page.setViewportSize({ width: 390, height: 900 });
  await expect(first.locator('[data-relic-lore]')).toBeHidden();
  await first.locator('summary').click();
  await expect(first.locator('[data-relic-lore]')).toBeVisible();
  await expectFullWidthLore(first.locator('[data-relic-lore]'));
});
