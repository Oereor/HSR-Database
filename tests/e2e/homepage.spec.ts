import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { HomepageVersionData } from '../../src/lib/domain/types';

const homepage = JSON.parse(
  readFileSync('src/lib/generated/views/zh-CN/homepage.json', 'utf8')
) as HomepageVersionData;
const manifest = JSON.parse(readFileSync('src/lib/generated/manifest.json', 'utf8')) as {
  gameVersion?: string;
};

async function assertHeroLayout(page: Page, locale: 'zh-CN' | 'en', width: number) {
  await page.setViewportSize({ width, height: 1000 });
  const prefix = locale === 'en' ? '/en' : '';
  await page.goto(`${prefix}/`);
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('main h1')).toHaveCount(1);
  const title = page.locator('#home-title');
  await expect(title).toHaveAccessibleName(/\S/);
  await expect(title.locator('.home-hero__game-title')).toHaveCount(locale === 'zh-CN' ? 1 : 0);
  await expect(title.locator('.home-hero__archive-title')).toHaveCount(locale === 'zh-CN' ? 1 : 0);
  await expect(title.locator('.home-hero__english-title')).toHaveCount(locale === 'en' ? 1 : 0);
  const version = page.locator('.home-hero__version');
  await expect(version.locator('.home-hero__version-label')).not.toBeEmpty();
  await expect(page.locator('.home-hero__version')).toContainText(
    `v${manifest.gameVersion ?? homepage.gameVersion}`
  );
  // Check actual child bounds: an overflow-hidden Hero can conceal clipped text.
  const identityBox = (await page.locator('.home-hero__identity').boundingBox())!;
  for (const text of await page.locator('#home-title > span, .home-hero__version > span').all()) {
    const box = (await text.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(identityBox.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(identityBox.x + identityBox.width + 1);
    expect(await text.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true
    );
  }
  const titleBox = (await title.boundingBox())!;
  const versionBox = (await version.boundingBox())!;
  if (width <= 520) {
    expect(versionBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
  } else {
    expect(versionBox.x).toBeGreaterThanOrEqual(titleBox.x + titleBox.width);
    expect(versionBox.y).toBeLessThan(titleBox.y + titleBox.height);
  }
}

const categories = ['characters', 'light-cones', 'relics', 'enemies'] as const;
for (const locale of ['zh-CN', 'en'] as const) {
  for (const width of [390, 768, 1024, 1280, 1920]) {
    test(`${locale} homepage ${width}px`, async ({ page, isMobile }, testInfo) => {
      test.skip(isMobile, 'Explicit viewport matrix covers this layout');
      await assertHeroLayout(page, locale, width);
      const prefix = locale === 'en' ? '/en' : '';
      const search = page.locator('#home-search');
      await expect(search).toBeVisible();
      await expect(page.locator('.home-hero').locator('#home-search')).toHaveCount(1);
      await expect(page.locator('.home-directory a')).toHaveCount(2);
      for (const target of ['player', 'endgame'])
        await expect(page.locator(`.home-directory a[href="${prefix}/${target}/"]`)).toBeVisible();
      for (const category of categories) {
        const ids = homepage.additions[category];
        const visibleIds =
          category === 'enemies' ? ids : ids.slice(0, category === 'relics' ? 4 : 6);
        const section = page.locator(`section[aria-labelledby="new-${category}"]`);
        await expect(section).toHaveCount(ids.length ? 1 : 0);
        if (!ids.length) continue;
        await expect(section.locator('h2 a')).toHaveAttribute('href', `${prefix}/${category}/`);
        expect(
          await section
            .locator('.entity-overview-card')
            .evaluateAll((cards) => cards.map((card) => card.getAttribute('href')))
        ).toEqual(visibleIds.map((id) => `${prefix}/${category}/${id}/`));
      }
      const compact = page.locator('.home-additions');
      const visibleCategories = categories
        .slice(0, 3)
        .filter((category) => homepage.additions[category].length);
      await expect(compact).toHaveCount(visibleCategories.length ? 1 : 0);
      if (visibleCategories.length) {
        const primaryCategories = visibleCategories.filter((category) => category !== 'relics');
        const primary = compact.locator('.home-primary-additions');
        await expect(primary).toHaveCount(primaryCategories.length ? 1 : 0);
        if (primaryCategories.length) {
          const columns = await primary.evaluate(
            (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length
          );
          expect(columns).toBe(width >= 1024 && primaryCategories.length === 2 ? 2 : 1);
          const groupBox = (await primary.boundingBox())!;
          const boxes = await Promise.all(
            primaryCategories.map((category) =>
              primary.locator(`section[aria-labelledby="new-${category}"]`).boundingBox()
            )
          );
          if (width >= 1024 && boxes.length === 2) {
            expect(Math.abs(boxes[0]!.width - boxes[1]!.width)).toBeLessThan(1);
            expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(1);
            expect(boxes[1]!.x - boxes[0]!.x - boxes[0]!.width).toBeCloseTo(24, 0);
          } else {
            for (const box of boxes) expect(Math.abs(box!.width - groupBox.width)).toBeLessThan(1);
            if (boxes.length === 2)
              expect(boxes[1]!.y).toBeGreaterThanOrEqual(boxes[0]!.y + boxes[0]!.height);
          }
        }
        const containerBox = (await compact.boundingBox())!;
        for (const category of visibleCategories) {
          const section = compact.locator(`section[aria-labelledby="new-${category}"]`);
          const sectionBox = (await section.boundingBox())!;
          if (category === 'relics') {
            expect(Math.abs(sectionBox.width - containerBox.width)).toBeLessThan(1);
            if (primaryCategories.length) {
              const groupBox = (await primary.boundingBox())!;
              expect(sectionBox.y).toBeGreaterThanOrEqual(groupBox.y + groupBox.height);
            }
          }
          const heading = (await section.locator('h2 a').boundingBox())!;
          const arrow = (await section.locator('.home-section__meta > span').last().boundingBox())!;
          expect(
            Math.abs(heading.x + heading.width - sectionBox.x - sectionBox.width)
          ).toBeLessThan(1);
          expect(Math.abs(arrow.x + arrow.width - sectionBox.x - sectionBox.width)).toBeLessThan(1);
          let previous: { x: number; y: number; width: number; height: number } | null = null;
          for (const card of await section.locator('.entity-overview-card').all()) {
            const box = (await card.boundingBox())!;
            expect(box.width).toBeCloseTo(Math.min(192, sectionBox.width), 0);
            expect(box.x + box.width).toBeLessThanOrEqual(sectionBox.x + sectionBox.width + 1);
            if (!previous || Math.abs(previous.y - box.y) > 1)
              expect(Math.abs(box.x - sectionBox.x)).toBeLessThan(1);
            else expect(box.x - previous.x - previous.width).toBeCloseTo(12, 0);
            previous = box;
          }
        }
      }
      const enemySection = page.locator('section[aria-labelledby="new-enemies"]');
      if (homepage.additions.enemies.length) {
        expect(
          await enemySection.evaluate((element) =>
            element.parentElement?.classList.contains('homepage')
          )
        ).toBe(true);
        const grid = enemySection.locator('.overview-grid');
        await expect(grid).toHaveCount(1);
        await expect(
          grid.locator('.entity-overview-card__artwork img:not([loading="lazy"])')
        ).toHaveCount(0);
      }
      expect(await page.locator('.home-hero__character').count()).toBeLessThanOrEqual(1);
      expect(await page.locator('.home-hero__cone').count()).toBeLessThanOrEqual(1);
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

for (const locale of ['zh-CN', 'en'] as const) {
  for (const width of [320, 520, 521, 820, 821]) {
    test(`${locale} Hero boundary ${width}px`, async ({ page, isMobile }, testInfo) => {
      test.skip(isMobile, 'Explicit viewport matrix covers this layout');
      await assertHeroLayout(page, locale, width);
      const search = page.locator('#home-search');
      await expect(search).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      const art = (await page.locator('.home-hero__art').boundingBox())!;
      const input = (await search.boundingBox())!;
      if (width <= 820) expect(art.y).toBeGreaterThanOrEqual(input.y + input.height);
      await page
        .locator('.home-hero')
        .screenshot({ path: testInfo.outputPath(`${locale}-${width}-hero.png`) });
      await search.fill('test');
      await page.locator('.home-search button[type="submit"]').click();
      const prefix = locale === 'en' ? '/en' : '';
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
