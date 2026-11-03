import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { HomepageVersionData } from '../../src/lib/domain/types';

const homepage = JSON.parse(
  readFileSync('src/lib/generated/views/zh-CN/homepage.json', 'utf8')
) as HomepageVersionData;
const categories = ['characters', 'light-cones', 'relics', 'enemies'] as const;
for (const locale of ['zh-CN', 'en'] as const) {
  for (const width of [390, 768, 1280]) {
    test(`${locale} homepage ${width}px`, async ({ page, isMobile }, testInfo) => {
      test.skip(isMobile, 'Explicit viewport matrix covers this layout');
      await page.setViewportSize({ width, height: 1000 });
      const prefix = locale === 'en' ? '/en' : '';
      await page.goto(`${prefix}/`);
      await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('main h1')).toHaveCount(1);
      await expect(page.locator('.home-hero__version')).toContainText(`v${homepage.gameVersion}`);
      const search = page.locator('#home-search');
      await expect(search).toBeVisible();
      await expect(page.locator('.home-hero').locator('#home-search')).toHaveCount(1);
      await expect(page.locator('.home-directory a')).toHaveCount(2);
      for (const target of ['player', 'endgame'])
        await expect(page.locator(`.home-directory a[href="${prefix}/${target}/"]`)).toBeVisible();
      for (const category of categories) {
        const ids = homepage.additions[category];
        const limit = category === 'relics' ? 4 : 6;
        const section = page.locator(`section[aria-labelledby="new-${category}"]`);
        await expect(section).toHaveCount(ids.length ? 1 : 0);
        if (!ids.length) continue;
        await expect(section.locator('h2 a')).toHaveAttribute('href', `${prefix}/${category}/`);
        expect(
          await section
            .locator('.entity-overview-card')
            .evaluateAll((cards) => cards.map((card) => card.getAttribute('href')))
        ).toEqual(ids.slice(0, limit).map((id) => `${prefix}/${category}/${id}/`));
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      const art = await page.locator('.home-hero__art').boundingBox();
      const input = await search.boundingBox();
      if (width <= 820 && art && input)
        expect(art.y).toBeGreaterThanOrEqual(input.y + input.height);
      await page.screenshot({
        path: testInfo.outputPath(`${locale}-${width}.png`),
        fullPage: true
      });
      await page
        .locator('.home-hero__art img')
        .evaluateAll((images) =>
          images.forEach((image) => image.dispatchEvent(new Event('error')))
        );
      await expect(search).toBeVisible();
      await expect(page.locator('.home-hero__art img')).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath(`${locale}-${width}-fallback.png`),
        fullPage: true
      });
      await search.fill('test');
      await page.locator('.home-search button[type="submit"]').click();
      await expect(page).toHaveURL(new RegExp(`${prefix}/search/\\?q=test$`));
    });
  }
}

test('Footer 仅保留正式服说明、数据仓库与本地许可证', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Viewport-independent message contract runs once');
  await page.goto('/');
  const footer = page.locator('main > footer');
  await expect(footer.locator('p')).toHaveCount(2);
  await expect(footer.locator('p').first()).not.toHaveText('');
  await expect(footer.locator('p').nth(1)).not.toHaveText('');
  for (const href of [
    'https://github.com/DimbreathBot/TurnBasedGameData',
    'https://github.com/Mar-7th/StarRailRes',
    '/licenses/StarRailRes-AGPL-3.0.txt',
    'https://enka.network/'
  ]) {
    await expect(footer.locator(`a[href="${href}"]`)).toHaveCount(1);
  }
});
