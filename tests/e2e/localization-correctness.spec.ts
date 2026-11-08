import { openLanguageSelect, switchLanguage } from '../helpers/language';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

test('sidebar language Select supports keyboard, focus return and outside dismissal', async ({
  page,
  isMobile
}) => {
  await page.goto('/');
  const trigger = await openLanguageSelect(page);
  const panel = page.getByRole('listbox');
  await expect(trigger).toHaveAccessibleName(/.+/);
  const box = await panel.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await page.locator(isMobile ? '.navigator-snapshot' : '.home-hero h1').click();
  await expect(panel).toBeHidden();
  if (!isMobile) {
    await expect(trigger.locator('span')).toBeHidden();
    await page.locator('[data-slot="sidebar-trigger"]').click();
    await expect(trigger.locator('span')).toBeVisible();
  }
  await trigger.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await Promise.all([
    page.waitForURL('**/en/', { waitUntil: 'load' }),
    page.keyboard.press('Enter')
  ]);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

async function switchTo(page: Page, locale: 'en' | 'zh-CN', pathname: string) {
  const previous = new URL(page.url());
  const target = `${pathname.endsWith('/') ? pathname : `${pathname}/`}${previous.search}${previous.hash}`;
  await switchLanguage(page, locale, target);
  await openLanguageSelect(page);
  const selected = page.getByRole('option', { selected: true });
  await expect(selected).toHaveAttribute('data-locale', locale);
  await page.evaluate(() =>
    document.documentElement.setAttribute('data-navigation-marker', 'retained')
  );
  await selected.click();
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-navigation-marker', 'retained');
}

for (const path of [
  '/',
  '/characters/1001/',
  '/enemies/1002015/',
  '/endgame/moc/1034/?encounter=5312',
  '/search/?q=March#search-results-characters'
]) {
  test(`document locale switch round trip: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
    const original = new URL(page.url());
    await switchTo(page, 'en', original.pathname === '/' ? '/en' : `/en${original.pathname}`);
    await switchTo(page, 'zh-CN', original.pathname);
    await page.goBack({ waitUntil: 'load' });
    await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.goForward({ waitUntil: 'load' });
    await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  });
}

for (const locale of ['zh-CN', 'en'] as const) {
  const prefix = locale === 'en' ? '/en' : '';
  for (const mode of ['moc', 'pf', 'as', 'aa']) {
    test(`${locale} ${mode} navigation and numbering`, async ({ page }) => {
      await page.goto(`${prefix}/endgame/`);
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
        await expect(page).toHaveURL(new RegExp(`${prefix}/endgame/${mode}/[^/?]+/\\?encounter=`));
      }
      for (const heading of await page.locator('[data-battle-slot] h3, [data-wave] h4').all()) {
        const text = await heading.textContent();
        expect(text).toMatch(/[1-9]\d*/);
      }
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
      const modeParent = page.locator(`.global-breadcrumb a[href="${prefix}/endgame/${mode}/"]`);
      await expect(modeParent).toBeVisible();
      await modeParent.click();
      await expect(page).toHaveURL(new RegExp(`${prefix}/endgame/${mode}/$`));
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
  test(`${locale} enemy labels in catalog and detail`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'Viewport-independent message contract runs once');
    const entries = JSON.parse(
      readFileSync(`src/lib/generated/views/${locale}/catalogs/enemies.json`, 'utf8')
    ) as Array<{ id: string; name: string; type: string }>;
    for (const rank of ['Minion', 'MinionLv2', 'Elite', 'LittleBoss', 'BigBoss']) {
      const entry = entries.find((entry) => entry.type === rank)!;
      await page.goto(`${prefix}/enemies/?q=${encodeURIComponent(entry.name)}`);
      const card = page.locator(`a[href="${prefix}/enemies/${entry.id}/"]`);
      const catalogLabel = (
        await card.locator('.entity-overview-card__overlay').textContent()
      )?.trim();
      expect(catalogLabel).toBeTruthy();
      await card.click();
      await expect(page).toHaveURL(new RegExp(`${prefix}/enemies/${entry.id}/$`));
      await expect(page.locator('.enemy-rank-tag')).toHaveText(catalogLabel!);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
    }
  });
  test(`${locale} search Endgame enemy links preserve locale`, async ({ page }) => {
    await page.goto(
      `${prefix}/search?q=${encodeURIComponent(locale === 'en' ? 'Silvermane' : '银鬃')}`
    );
    const enemy = page.locator('[data-endgame-enemy-card] [data-endgame-enemy-link]').first();
    await expect(enemy).toBeVisible();
    await expect(enemy).toHaveAttribute('href', new RegExp(`^${prefix}/enemies/`));
    const href = await enemy.getAttribute('href');
    await enemy.click();
    await expect(page).toHaveURL(new URL(href!, page.url()).href);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
  });
}
