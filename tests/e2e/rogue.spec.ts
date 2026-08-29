import { expect, test } from '@playwright/test';

test('Sidebar、顶部搜索与四个 Rogue 模式路由可用', async ({ page }, testInfo) => {
  await page.goto('/rogue');
  await expect(page).toHaveURL(/\/rogue\/su$/);
  const sidebarLinks = page.locator('.sidebar nav a');
  await expect(sidebarLinks.filter({ hasText: 'Endgame' })).toHaveCount(1);
  await expect(sidebarLinks.filter({ hasText: 'Rogue' })).toHaveCount(1);
  await expect(sidebarLinks.filter({ hasText: '全局搜索' })).toHaveCount(0);
  await expect(page.locator('#global-search')).toHaveCount(1);
  if (testInfo.project.name === 'desktop-chromium') {
    await expect(sidebarLinks.filter({ hasText: 'Rogue' })).toBeVisible();
    await expect(page.locator('#global-search')).toBeVisible();
  }

  const modeNav = page.getByRole('navigation', { name: 'Rogue 模式' });
  for (const [name, path] of [
    ['模拟宇宙', '/rogue/su'],
    ['模拟宇宙·寰宇蝗灾', '/rogue/swarm-disaster'],
    ['模拟宇宙·黄金与机械', '/rogue/gold-and-gears'],
    ['差分宇宙', '/rogue/du/blessings']
  ] as const) {
    await expect(modeNav.getByRole('link', { name, exact: true })).toHaveAttribute('href', path);
  }
});

test('模拟宇宙保持连续图鉴、图标筛选和独立等级状态', async ({ page }) => {
  await page.goto('/rogue/su');
  await expect(page.locator('[data-su-catalog-notice]')).toContainText('完整 162 项图鉴');
  await expect(page.locator('[data-su-continuous-flow]')).toBeVisible();
  await expect(page.getByRole('navigation', { name: '差分宇宙图鉴分类' })).toHaveCount(0);

  const pathFilter = page.getByRole('group', { name: '模拟宇宙命途筛选' });
  await expect(pathFilter.locator('[data-path-filter-all] [data-icon-kind="path"]')).toHaveCount(0);
  const pathChips = pathFilter.locator('[data-path-filter-chip]');
  expect(await pathChips.count()).toBeGreaterThan(0);
  await expect(pathChips.locator('[data-icon-kind="path"]')).toHaveCount(await pathChips.count());

  const blessings = page.locator('article[data-rogue-card-kind="blessing"]');
  await expect(blessings).toHaveCount(162);
  const first = blessings.nth(0);
  const second = blessings.nth(1);
  await first.getByRole('button', { name: '加强' }).click();
  await expect(first.locator('[data-rogue-blessing]')).toHaveAttribute('data-blessing-level', '2');
  await expect(second.locator('[data-rogue-blessing]')).toHaveAttribute('data-blessing-level', '1');

  const explanations = first.locator('[data-rogue-extra-effects]');
  if ((await explanations.count()) > 0) {
    await explanations.getByText('效果说明').click();
    await expect(explanations).toHaveAttribute('open', '');
  }
});

test('SU 回响交错仍只按主命途筛选，构音三项保持纵向', async ({ page }) => {
  await page.goto('/rogue/swarm-disaster');
  const pathFilter = page.getByRole('group', { name: '模拟宇宙命途筛选' });
  await pathFilter.getByRole('button', { name: '「存护」', exact: true }).click();
  const crosses = page.locator('article[data-rogue-card-kind="cross-resonance"]');
  await expect(crosses.first()).toBeVisible();
  await expect(crosses.first()).toContainText('主·「存护」');

  const enhancement = page.locator('[data-enhancement-list]').first();
  const effects = enhancement.locator('[data-enhancement-effect]');
  await expect(effects).toHaveCount(3);
  const boxes = await Promise.all([0, 1, 2].map((index) => effects.nth(index).boundingBox()));
  expect(boxes[0]!.y).toBeLessThan(boxes[1]!.y);
  expect(boxes[1]!.y).toBeLessThan(boxes[2]!.y);
});

test('DU 使用可直达、可刷新并支持历史导航的二级路由', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/rogue/du');
  await expect(page).toHaveURL(/\/rogue\/du\/blessings$/);
  await expect(page.locator('[data-du-revision]')).toContainText('差分宇宙·乐园漫记');

  const collectionNav = page.getByRole('navigation', { name: '差分宇宙图鉴分类' });
  const blessingsLink = collectionNav.getByRole('link', { name: '祝福', exact: true });
  const equationsLink = collectionNav.getByRole('link', { name: '方程', exact: true });
  await expect(blessingsLink).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-du-blessings] article')).toHaveCount(144);
  await expect(page.locator('[data-du-equations]')).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(/\/rogue\/du\/blessings$/);

  await equationsLink.click();
  await expect(page).toHaveURL(/\/rogue\/du\/equations$/);
  await expect(collectionNav.getByRole('link', { name: '方程', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  );
  await expect(page.locator('[data-du-equations] article')).toHaveCount(104);
  await expect(page.locator('[data-du-blessings]')).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/rogue\/du\/blessings$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/rogue\/du\/equations$/);
});

test('DU 两个 collection 的命途筛选独立且繁育使用现有 fallback', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/rogue/du/blessings');
  const blessingFilter = page.getByRole('group', { name: '差分宇宙祝福命途筛选' });
  const blessingTotal = 144;
  await expect(page.locator('[data-du-blessings] article')).toHaveCount(blessingTotal);
  await blessingFilter.getByRole('button', { name: '「记忆」', exact: true }).click();
  expect(await page.locator('[data-du-blessings] article').count()).toBeLessThan(blessingTotal);
  await expect(page.locator('[data-rogue-collection-count]')).not.toHaveText('144 / 144');

  await page.goto('/rogue/du/equations');
  await expect(page.locator('[data-du-equations] article')).toHaveCount(104);
  const equationFilter = page.getByRole('group', { name: '差分宇宙方程主命途筛选' });
  await equationFilter.getByRole('button', { name: '「记忆」', exact: true }).click();
  expect(await page.locator('[data-du-equations] article').count()).toBeLessThan(104);

  const propagation = equationFilter.getByRole('button', { name: '「繁育」', exact: true });
  await expect(propagation.locator('[data-icon-kind="path"]')).toHaveAttribute(
    'data-icon-missing',
    'true'
  );
});

test('祝福卡用 rarity surface 区分层级且 segmented toggle 不抢占状态', async ({ page }) => {
  await page.goto('/rogue/du/blessings');
  const cards = [1, 2, 3].map((tier) =>
    page.locator(`article:has([data-rogue-tier="${tier}"])`).first()
  );
  for (const card of cards) await expect(card).toBeVisible();
  const surfaces = await Promise.all(
    cards.map((card) =>
      card.evaluate((element) => ({
        background: getComputedStyle(element).backgroundImage,
        border: getComputedStyle(element).borderColor
      }))
    )
  );
  expect(new Set(surfaces.map((surface) => `${surface.background}|${surface.border}`)).size).toBe(
    3
  );

  const first = cards[0];
  const second = page.locator('article[data-rogue-card-kind="blessing"]').nth(1);
  await first.getByRole('button', { name: '加强' }).click();
  await expect(first.locator('[data-rogue-blessing]')).toHaveAttribute('data-blessing-level', '2');
  await expect(second.locator('[data-rogue-blessing]')).toHaveAttribute('data-blessing-level', '1');
});

test('普通与临界方程共享几何并保留 Main/Sub requirement 顺序', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/rogue/du/equations');
  const critical = page.locator('article[data-rogue-card-kind="critical-equation"]').first();
  const ordinary = page
    .locator('article[data-rogue-card-kind="equation"]:has(.rogue-path-visual--dual)')
    .first();
  await expect(page.locator('article[data-rogue-card-kind="critical-equation"]')).toHaveCount(8);
  await expect(critical.locator('[data-equation-requirements]')).toHaveText('展开条件 × 16');
  await expect(
    critical.locator('[data-equation-requirements] [data-icon-kind="path"]')
  ).toHaveCount(0);

  const ordinaryRequirement = ordinary.locator('[data-equation-requirements]');
  await expect(ordinaryRequirement).toContainText(/展开条件.*× \d+.*·.*× \d+/);
  await expect(ordinaryRequirement.locator('[data-icon-kind="path"]')).toHaveCount(0);

  const dual = ordinary.locator('.rogue-path-visual--dual');
  const [main, sub, mainIcon, subIcon, ordinaryContent, criticalContent] = await Promise.all([
    dual.locator('.rogue-path-visual__main').boundingBox(),
    dual.locator('.rogue-path-visual__sub').boundingBox(),
    dual.locator('.rogue-path-visual__main .semantic-icon-label').boundingBox(),
    dual.locator('.rogue-path-visual__sub .semantic-icon-label').boundingBox(),
    ordinary.locator('.rogue-card__content').boundingBox(),
    critical.locator('.rogue-card__content').boundingBox()
  ]);
  expect(main!.x + main!.width).toBeLessThanOrEqual(sub!.x + 1);
  expect(mainIcon!.width).toBeGreaterThan(subIcon!.width);
  expect(Math.abs(ordinaryContent!.x - criticalContent!.x)).toBeLessThanOrEqual(1);

  const withEffects = page
    .locator('article[data-rogue-card-kind="equation"]')
    .filter({ has: page.locator('[data-rogue-extra-effects]') })
    .first();
  await withEffects.getByText('效果说明', { exact: true }).click();
  await expect(withEffects.locator('[data-rogue-extra-effects]')).toHaveAttribute('open', '');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
