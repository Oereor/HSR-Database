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
    ['差分宇宙', '/rogue/du']
  ] as const) {
    await expect(modeNav.getByRole('link', { name, exact: true })).toHaveAttribute('href', path);
  }
});

test('模拟宇宙使用连续图鉴，祝福等级状态彼此独立', async ({ page }) => {
  await page.goto('/rogue/su');
  await expect(page.locator('[data-su-catalog-notice]')).toContainText('完整 162 项图鉴');
  await expect(page.locator('[data-su-continuous-flow]')).toBeVisible();

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

test('SU 回响交错只按主命途筛选，构音三项保持纵向', async ({ page }) => {
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

test('DU 独立筛选祝福与方程，并展示临界方程和双命途', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/rogue/du');
  await expect(page.locator('[data-du-revision]')).toContainText('差分宇宙·乐园漫记');
  await expect(page.locator('[data-du-blessings] article')).toHaveCount(144);
  await expect(page.locator('[data-du-equations] article')).toHaveCount(104);
  await expect(page.locator('article[data-rogue-card-kind="critical-equation"]')).toHaveCount(8);

  await page
    .getByRole('group', { name: '差分宇宙祝福命途筛选' })
    .getByRole('button', { name: '「记忆」', exact: true })
    .click();
  expect(await page.locator('[data-du-blessings] article').count()).toBeLessThan(144);
  await expect(page.locator('[data-du-equations] article')).toHaveCount(104);

  await page
    .getByRole('group', { name: '差分宇宙方程主命途筛选' })
    .getByRole('button', { name: '「记忆」', exact: true })
    .click();
  expect(await page.locator('[data-du-equations] article').count()).toBeLessThan(104);
  await expect(page.locator('[data-du-blessings] article').first()).toBeVisible();

  const dual = page.locator('.rogue-path-visual--dual').first();
  await expect(dual).toBeVisible();
  const [main, sub] = await Promise.all([
    dual.locator('.rogue-path-visual__main').boundingBox(),
    dual.locator('.rogue-path-visual__sub').boundingBox()
  ]);
  expect(main!.x + main!.width).toBeLessThanOrEqual(sub!.x + 1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
