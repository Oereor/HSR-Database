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

test('locale document links preserve future UID, repeated queries and hash', async ({ page }) => {
  await page.goto('/characters/1304/?uid=168902602&foo=a&foo=b#stats');
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  await page.locator('.settings-trigger').click();
  const english = page.locator('.language-segments a').filter({ hasText: /^EN$/ });
  await expect(english).toHaveAttribute(
    'href',
    '/en/characters/1304/?uid=168902602&foo=a&foo=b#stats'
  );
  await english.click();
  await expect(page).toHaveURL(/\/en\/characters\/1304\/\?uid=168902602&foo=a&foo=b#stats$/);
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  await page.locator('.settings-trigger').click();
  const chinese = page.locator('.language-segments a').filter({ hasText: /^中文$/ });
  await expect(chinese).toHaveAttribute(
    'href',
    '/characters/1304/?uid=168902602&foo=a&foo=b#stats'
  );
  await chinese.click();
  await expect(page).toHaveURL(/\/characters\/1304\/\?uid=168902602&foo=a&foo=b#stats$/);
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
