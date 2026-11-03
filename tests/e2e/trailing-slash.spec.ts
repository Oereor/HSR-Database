import { switchLanguage } from '../helpers/language';
import { expect, test } from '@playwright/test';

test('canonical deep links return real HTML 200 in both locales', async ({ page }) => {
  for (const prefix of ['', '/en']) {
    for (const route of [
      '/',
      '/characters/',
      '/characters/1304/',
      '/light-cones/',
      '/light-cones/20000/',
      '/relics/',
      '/relics/101/',
      '/enemies/',
      '/enemies/1002015/',
      '/endgame/',
      '/endgame/moc/',
      '/endgame/moc/1034/'
    ]) {
      const response = await page.goto(`${prefix}${route}`);
      expect(response?.status()).toBe(200);
      expect(response?.headers()['content-type']).toContain('text/html');
      expect(new URL(page.url()).pathname).toBe(`${prefix}${route}`);
      await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
      const canonical = new URL(
        (await page.locator('link[rel="canonical"]').getAttribute('href'))!
      );
      expect(canonical.pathname).toBe(`${prefix}${route}`);
      expect(canonical.search).toBe('');
      const noncanonical = await page.locator('a[href], form[action]').evaluateAll((elements) =>
        elements
          .map((element) => element.getAttribute('href') ?? element.getAttribute('action')!)
          .filter((href) =>
            /^\/(?:en\/)?(?:characters|light-cones|relics|enemies|endgame|search)(?:\/|[?#]|$)/.test(
              href
            )
          )
          .filter((href) => !href.split(/[?#]/, 1)[0].endsWith('/'))
      );
      expect(noncanonical).toEqual([]);
    }
  }
});

test('locale document navigation preserves future UID, repeated queries and hash', async ({
  page
}) => {
  const suffix = '/characters/1304/?uid=168902602&foo=a&foo=b#stats';
  await page.goto(suffix);
  await switchLanguage(page, 'en', `/en${suffix}`);
  await switchLanguage(page, 'zh-CN', suffix);
});

test('search submit preserves hash and canonical history across back/forward', async ({ page }) => {
  await page.goto('/search/?q=March#search-results-characters');
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  const input = page.locator('#search-page-query');
  await input.fill('丹恒');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/search\/\?q=.*#search-results-characters$/);
  expect(new URL(page.url()).searchParams.get('q')).toBe('丹恒');
  await page.goBack();
  await expect(page).toHaveURL(/\/search\/\?q=March#search-results-characters$/);
  await page.goForward();
  expect(new URL(page.url()).pathname).toBe('/search/');
  expect(new URL(page.url()).hash).toBe('#search-results-characters');
});

test('file resources remain unslashed and missing pages remain HTTP 404', async ({ request }) => {
  for (const route of [
    '/sitemap.xml',
    '/robots.txt',
    '/generated-assets/branding/train-party.png'
  ]) {
    const response = await request.get(route);
    expect(response.status()).toBe(200);
    expect(new URL(response.url()).pathname).toBe(route);
  }
  for (const route of ['/phase06-definitely-missing', '/phase06-definitely-missing/']) {
    expect((await request.get(route)).status()).toBe(404);
  }
});
