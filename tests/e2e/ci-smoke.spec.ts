import { expect, test, type Page } from '@playwright/test';

async function expectAppReady(page: Page) {
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
}

test('homepage and client navigation remain usable', async ({ page }) => {
  await page.goto('/');
  await expectAppReady(page);
  await expect(
    page.getByRole('heading', { level: 1, name: '《崩坏：星穹铁道》档案库' })
  ).toBeVisible();
  await page.locator('.home-directory-row[href="/characters"]').click();
  await expect(page).toHaveURL(/\/characters$/);
  await expect(page.locator('.entity-overview-card').first()).toBeVisible();
});

test('search locale switching preserves the route and results', async ({ page }) => {
  await page.goto('/search?q=March#search-results-characters');
  await expectAppReady(page);
  await page.locator('.settings-trigger').click();
  const english = page.locator('.language-segments a').filter({ hasText: /^EN$/ });
  const englishHref = new URL((await english.getAttribute('href'))!, page.url()).href;
  await Promise.all([page.waitForURL(englishHref, { waitUntil: 'load' }), english.click()]);
  await expectAppReady(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#search-results-characters')).toBeVisible();
  await expect(page.locator('a[href^="/en/characters/"]').first()).toBeVisible();

  await page.locator('.settings-trigger').click();
  const chinese = page.locator('.language-segments a').filter({ hasText: /^中文$/ });
  const chineseHref = new URL((await chinese.getAttribute('href'))!, page.url()).href;
  await Promise.all([page.waitForURL(chineseHref, { waitUntil: 'load' }), chinese.click()]);
  await expectAppReady(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page).toHaveURL(/\/search\?q=March#search-results-characters$/);
});

test('enemy direct navigation and core interaction remain functional', async ({ page }) => {
  await page.goto('/enemies/1002015');
  await expectAppReady(page);
  const slider = page.getByRole('slider', { name: '敌人等级' });
  await expect(slider).toHaveValue('95');
  await slider.fill('60');
  const variant = page.locator('[data-monster-option="100201506"]');
  await variant.click();
  await expect(variant).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.enemy-level-control output')).toHaveText('Lv.60');
});

test('asset request failures expose the accessible local fallback', async ({ page }) => {
  let intercepted = 0;
  await page.route('**/generated-assets/paths/**', (route) => {
    intercepted += 1;
    return route.abort();
  });
  await page.route('**/generated-assets/elements/**', (route) => {
    intercepted += 1;
    return route.abort();
  });
  await page.goto('/characters?q=%E7%A0%82%E9%87%91');
  const card = page.locator('a[href="/characters/1304"]');
  await card.scrollIntoViewIfNeeded();
  await expect.poll(() => intercepted).toBeGreaterThan(0);
  await expect(card.locator('[role="img"][data-icon-missing="true"]')).toHaveCount(2);
  await expect(card.locator('[role="img"][data-icon-missing="true"]').first()).toContainText('?');
});

test('mobile navigation reaches a representative route', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expectAppReady(page);
  await page.getByRole('button', { name: '打开导航' }).click();
  const dialog = page.getByRole('dialog', { name: '完整导航' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('link', { name: '敌方单位' }).click();
  await expect(page).toHaveURL(/\/enemies$/);
  await expect(page.locator('.entity-overview-card').first()).toBeVisible();
});
