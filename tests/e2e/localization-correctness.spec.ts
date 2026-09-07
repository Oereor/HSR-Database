import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function switchTo(page: Page, locale: 'en' | 'zh-CN', pathname: string) {
  await page.locator('.settings-trigger').click();
  const link = page
    .locator('.language-segments a')
    .filter({ hasText: locale === 'en' ? /^EN$/ : /^中文$/ });
  const target = new URL((await link.getAttribute('href'))!, page.url());
  expect(target.pathname.replace(/\/$/, '')).toBe(pathname.replace(/\/$/, ''));
  const previous = new URL(page.url());
  expect(target.search).toBe(previous.search);
  expect(target.hash).toBe(previous.hash);
  const documentRequest = page.waitForRequest(
    (request) => request.isNavigationRequest() && request.resourceType() === 'document'
  );
  await link.click();
  await documentRequest;
  await expect
    .poll(() => new URL(page.url()).pathname.replace(/\/$/, ''))
    .toBe(pathname.replace(/\/$/, ''));
  expect(new URL(page.url()).search).toBe(target.search);
  expect(new URL(page.url()).hash).toBe(target.hash);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await page.locator('.settings-trigger').click();
  await expect(page.locator('.language-segments [aria-current="true"]')).toHaveText(
    locale === 'en' ? 'EN' : '中文'
  );
  await expect(page.locator('.settings-panel__heading strong')).toHaveText(
    locale === 'en' ? 'Language' : '语言'
  );
  let navigated = false;
  const listener = () => {
    navigated = true;
  };
  page.on('framenavigated', listener);
  await page.locator('.language-segments [aria-current="true"]').click();
  await expect(page.locator('.settings-panel')).toBeVisible();
  expect(navigated).toBe(false);
  page.off('framenavigated', listener);
  await page.locator('.settings-trigger').click();
}

for (const path of [
  '/',
  '/characters/1001',
  '/enemies/1002015',
  '/endgame/moc/1034?encounter=5312',
  '/search?q=March#search-results-characters'
]) {
  test(`document locale switch round trip: ${path}`, async ({ page }) => {
    await page.goto(path);
    const original = new URL(page.url());
    await switchTo(page, 'en', original.pathname === '/' ? '/en' : `/en${original.pathname}`);
    await switchTo(page, 'zh-CN', original.pathname);
    await page.goBack();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.goForward();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  });
}

for (const locale of ['zh-CN', 'en'] as const) {
  const prefix = locale === 'en' ? '/en' : '';
  for (const mode of ['moc', 'pf', 'as', 'aa']) {
    test(`${locale} ${mode} navigation and numbering`, async ({ page }) => {
      await page.goto(`${prefix}/endgame`);
      const card = page.locator(`[data-endgame-overview-card="${mode}"]`);
      await expect(card).toHaveAttribute('href', new RegExp(`^${prefix}/endgame/${mode}/`));
      await card.click();
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page).toHaveURL(new RegExp(`${prefix}/endgame/${mode}/`));
      const mobile = page.locator('.endgame-local-nav-trigger');
      if (await mobile.isVisible()) await mobile.click();
      const local = page
        .locator(
          '.endgame-local-nav a:not([aria-current="page"]):visible, .endgame-local-menu a:not([aria-current="page"]):visible'
        )
        .first();
      if (await local.count()) {
        await local.click();
        await expect(page).toHaveURL(new RegExp(`${prefix}/endgame/${mode}/[^?]+\\?encounter=`));
      }
      for (const heading of await page.locator('[data-battle-slot] h3, [data-wave] h4').all()) {
        const text = await heading.textContent();
        if (/Node|Wave|节点|波次/.test(text ?? ''))
          expect(text).toMatch(/(?:Node|Wave|节点|波次) [1-9]\d*/);
      }
      await expect(page.locator('main')).not.toContainText(
        /(?:Node|Wave|节点|波次)\s*[一二三四五六七八九十]/
      );
      const enemy = page.locator('a[data-endgame-enemy-card]').first();
      if (await enemy.count()) {
        const seasonUrl = page.url();
        await expect(enemy).toHaveAttribute('href', new RegExp(`^${prefix}/enemies/`));
        const enemyUrl = new URL((await enemy.getAttribute('href'))!, page.url()).href;
        await enemy.click();
        await expect(page).toHaveURL(enemyUrl);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await page.goBack();
        await expect(page).toHaveURL(seasonUrl);
      }
      await page.locator('.endgame-breadcrumb').click();
      await expect(page).toHaveURL(new RegExp(`${prefix}/endgame/${mode}$`));
      const season = page.locator('a.endgame-season-card').first();
      await expect(season).toHaveAttribute('href', new RegExp(`^${prefix}/endgame/${mode}/`));
      await season.click();
      await expect(page).toHaveURL(new RegExp(`${prefix}/endgame/${mode}/`));
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      const modeLinks = page.locator('.endgame-mode-switcher a');
      await expect(modeLinks).toHaveCount(4);
      for (const link of await modeLinks.all()) {
        await expect(link).toHaveAttribute('href', new RegExp(`^${prefix}/endgame/`));
      }
      const otherMode = page.locator('.endgame-mode-switcher a:not([aria-current="page"])').first();
      const nextHref = await otherMode.getAttribute('href');
      await otherMode.click();
      await expect(page).toHaveURL(new URL(nextHref!, page.url()).href);
    });
  }
  test(`${locale} enemy labels in catalog and detail`, async ({ page }) => {
    const entries = JSON.parse(
      readFileSync(`src/lib/generated/views/${locale}/catalogs/enemies.json`, 'utf8')
    ) as Array<{ id: string; name: string; type: string }>;
    for (const [rank, label] of Object.entries(
      locale === 'en'
        ? {
            Minion: 'Normal Enemy',
            MinionLv2: 'Normal Enemy',
            Elite: 'Elite Enemy',
            LittleBoss: 'Boss Enemy',
            BigBoss: 'Boss Enemy'
          }
        : {
            Minion: '普通敌人',
            MinionLv2: '普通敌人',
            Elite: '精英敌人',
            LittleBoss: '首领敌人',
            BigBoss: '首领敌人'
          }
    )) {
      const entry = entries.find((entry) => entry.type === rank)!;
      await page.goto(`${prefix}/enemies?q=${encodeURIComponent(entry.name)}`);
      const card = page.locator(`a[href="${prefix}/enemies/${entry.id}"]`);
      await expect(card.locator('.entity-overview-card__overlay')).toHaveText(label);
      await card.click();
      await expect(page).toHaveURL(new RegExp(`${prefix}/enemies/${entry.id}$`));
      await expect(page.locator('.enemy-rank-tag')).toHaveText(label);
    }
  });
  test(`${locale} search Endgame enemy links preserve locale`, async ({ page }) => {
    await page.goto(
      `${prefix}/search?q=${encodeURIComponent(locale === 'en' ? 'Silvermane' : '银鬃')}`
    );
    const enemy = page.locator('a[data-endgame-enemy-card]').first();
    await expect(enemy).toBeVisible();
    await expect(enemy).toHaveAttribute('href', new RegExp(`^${prefix}/enemies/`));
    const href = await enemy.getAttribute('href');
    await enemy.click();
    await expect(page).toHaveURL(new URL(href!, page.url()).href);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
  });
}
