import { switchLanguage } from '../helpers/language';
import { expect, test, type Page } from '@playwright/test';
import { setSliderValue } from '../helpers/slider';

async function expectAppReady(page: Page) {
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
}

test('homepage and client navigation remain usable', async ({ page }) => {
  await page.goto('/');
  await expectAppReady(page);
  await expect(page.locator('.home-hero h1')).toBeInViewport();
  await page.locator('.primary-navigation a[href="/characters/"]').click();
  await expect(page).toHaveURL(/\/characters\/$/);
  await expect(page.locator('.entity-overview-card').first()).toBeVisible();
});

test('search locale switching preserves the route and results', async ({ page }) => {
  await page.goto('/search/?q=March#search-results-characters');
  await expectAppReady(page);
  await switchLanguage(page, 'en', '/en/search/?q=March#search-results-characters');
  await expect(page.locator('#search-results-characters')).toBeVisible();
  await expect(page.locator('a[href^="/en/characters/"]').first()).toBeVisible();

  await switchLanguage(page, 'zh-CN', '/search/?q=March#search-results-characters');
  await expect(page).toHaveURL(/\/search\/\?q=March#search-results-characters$/);
});

test('enemy direct navigation and core interaction remain functional', async ({ page }) => {
  await page.goto('/enemies/1002015/');
  await expectAppReady(page);
  const slider = page.locator('#enemy-level-1002015');
  await expect(slider).toHaveAttribute('aria-valuenow', '95');
  await setSliderValue(slider, 60);
  const variant = page.locator('[data-monster-option="100201506"]');
  await variant.click();
  await expect(variant).toHaveAttribute('aria-checked', 'true');
  await expect(slider).toHaveAttribute('aria-valuenow', '60');
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
  await page.goto('/characters/?q=%E7%A0%82%E9%87%91');
  const card = page.locator('a[href="/characters/1304/"]');
  await card.scrollIntoViewIfNeeded();
  await expect.poll(() => intercepted).toBeGreaterThan(0);
  await expect(card.locator('[role="img"][data-icon-missing="true"]')).toHaveCount(2);
  await expect(card.locator('[role="img"][data-icon-missing="true"]').first()).toContainText('?');
});

test('mobile navigation reaches a representative route', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expectAppReady(page);
  await page.locator('[data-slot="sidebar-trigger"]').click();
  const dialog = page.locator('#primary-navigator-pane');
  await expect(dialog).toBeVisible();
  await dialog.locator('a[href="/enemies/"]').click();
  await expect(page).toHaveURL(/\/enemies\/$/);
  await expect(page.locator('.entity-overview-card').first()).toBeVisible();
});
