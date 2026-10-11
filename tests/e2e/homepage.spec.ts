import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import type { HomepageRecentWarpData } from '../../src/lib/domain/types';

const homepage = JSON.parse(
  readFileSync('src/lib/generated/views/zh-CN/homepage.json', 'utf8')
) as HomepageRecentWarpData;

for (const locale of ['zh-CN', 'en'] as const) {
  const messages = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')) as Record<
    string,
    string
  >;

  for (const width of [375, 390, 768, 1280, 1920]) {
    test(`${locale} 首页 Hero 文字层级与布局 ${width}px`, async ({ page, isMobile }, testInfo) => {
      test.skip(isMobile, 'The explicit viewport matrix runs once in desktop Chromium');
      await page.setViewportSize({ width, height: 900 });
      await page.goto(locale === 'en' ? '/en/' : '/');
      await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
      await expect(page.locator('html')).toHaveAttribute('lang', locale);

      const hero = page.locator('.home-hero');
      await expect(hero).toHaveAttribute('aria-labelledby', 'home-title');
      await expect(page.locator('main h1')).toHaveCount(1);
      await expect(hero.locator('h1')).toHaveAttribute('id', 'home-title');
      for (const [selector, key] of [
        ['.home-hero__eyebrow', 'home_hero_eyebrow'],
        ['.home-hero__title', 'home_hero_title'],
        ['.home-hero__tagline', 'home_tagline']
      ] as const) {
        await expect(hero.locator(selector)).toBeVisible();
        await expect(hero.locator(selector)).toHaveText(messages[key]);
      }
      await expect(page).toHaveTitle(messages.site_name);
      for (const property of ['og:title', 'og:site_name']) {
        await expect(page.locator(`meta[property="${property}"]`)).toHaveAttribute(
          'content',
          messages.site_name
        );
      }
      await expect(page.locator('.navigator-pane__brand strong')).toHaveText(messages.site_name);

      const layout = await hero.evaluate((element) => {
        const identity = element.querySelector<HTMLElement>('.home-hero__identity')!;
        const collage = element.querySelector<HTMLElement>('.home-hero__collage')!;
        const bounds = element.getBoundingClientRect();
        const identityBounds = identity.getBoundingClientRect();
        const collageBounds = collage.getBoundingClientRect();
        const lines = Array.from(identity.children, (child) => {
          const childBounds = child.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(child);
          const textBounds = range.getBoundingClientRect();
          return {
            top: childBounds.top,
            bottom: childBounds.bottom,
            textLeft: textBounds.left,
            textRight: textBounds.right,
            textTop: textBounds.top,
            textBottom: textBounds.bottom,
            lineCount: range.getClientRects().length,
            lineHeight: Number.parseFloat(getComputedStyle(child).lineHeight),
            height: childBounds.height
          };
        });
        return {
          left: bounds.left,
          right: bounds.right,
          identityTop: identityBounds.top,
          identityRight: identityBounds.right,
          identityBottom: identityBounds.bottom,
          collageTop: collageBounds.top,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          lines
        };
      });

      expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.lines).toHaveLength(3);
      for (const line of layout.lines) {
        expect(line.textLeft).toBeGreaterThanOrEqual(layout.left - 1);
        expect(line.textRight).toBeLessThanOrEqual(layout.identityRight + 1);
        expect(line.textTop).toBeGreaterThanOrEqual(layout.identityTop - 1);
        expect(line.textBottom).toBeLessThanOrEqual(layout.identityBottom + 1);
      }
      expect(layout.lines[0].bottom).toBeLessThan(layout.lines[1].top);
      expect(layout.lines[1].bottom).toBeLessThan(layout.lines[2].top);
      expect(layout.lines[0].textBottom).toBeLessThan(layout.lines[1].textTop);
      expect(layout.lines[1].textBottom).toBeLessThan(layout.lines[2].textTop);
      // The agreed short titles fit on one line at every required viewport.
      expect(layout.lines[1].lineCount).toBe(1);
      expect(layout.lines[1].height).toBeCloseTo(layout.lines[1].lineHeight, 0);
      if (width <= 820) {
        expect(layout.collageTop).toBeGreaterThanOrEqual(layout.identityBottom - 1);
      } else {
        expect(layout.identityRight - layout.left).toBeLessThanOrEqual(
          (layout.right - layout.left) * 0.45 + 1
        );
      }

      await expect(hero.locator('img')).toHaveCount(4);
      await expect
        .poll(() =>
          hero
            .locator('img')
            .evaluateAll((images) =>
              images.every(
                (image) =>
                  image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
              )
            )
        )
        .toBe(true);
      await page.evaluate(() => document.fonts.ready);
      mkdirSync('test-results/hero-typography', { recursive: true });
      const screenshot = `test-results/hero-typography/${locale}-${width}.png`;
      await page.screenshot({ path: screenshot });
      await testInfo.attach('Hero typography', { path: screenshot, contentType: 'image/png' });
    });
  }
}

test('首页作为数据库入口展示品牌、分类与最近限定跃迁', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.home-hero h1')).toBeVisible();
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    'href',
    /\/generated-assets\/branding\/train-party\.png$/
  );
  await expect(page.locator('.home-hero__eyebrow')).toBeVisible();
  await expect(page.locator('.home-hero__tagline')).toBeVisible();
  await expect(page.locator('.home-hero__collage img')).toHaveCount(4);
  expect(
    await page
      .locator('.home-hero__collage img')
      .evaluateAll((images) => images.map((image) => image.getAttribute('src')).sort())
  ).toEqual(
    [
      '/generated-assets/characters/preview/1001.png',
      '/generated-assets/characters/preview/1002.png',
      '/generated-assets/light-cones/preview/21003.png',
      '/generated-assets/light-cones/preview/21030.png'
    ].sort()
  );

  for (const href of [
    '/player/',
    '/characters/',
    '/light-cones/',
    '/relics/',
    '/enemies/',
    '/endgame/'
  ] as const) {
    const row = page.locator(`.home-directory-row[href="${href}"]`);
    await expect(row).toBeVisible();
    await expect(row).not.toContainText(/\d+ 条记录/);
    await expect(row.locator('.home-directory-row__arrow')).toHaveText('→');
  }

  await expect(page.locator('[data-homepage-recent="avatar"] .entity-overview-card')).toHaveCount(
    6
  );
  await expect(page.locator('[data-homepage-recent="weapon"] .entity-overview-card')).toHaveCount(
    6
  );
  expect(
    await page
      .locator('[data-homepage-recent="avatar"] .entity-overview-card')
      .evaluateAll((cards) => cards.map((card) => card.getAttribute('href')))
  ).toEqual(homepage.avatarUps.map(({ avatarId }) => `/characters/${avatarId}/`));
  expect(
    await page
      .locator('[data-homepage-recent="weapon"] .entity-overview-card')
      .evaluateAll((cards) => cards.map((card) => card.getAttribute('href')))
  ).toEqual(homepage.weaponUps.map(({ equipmentId }) => `/light-cones/${equipmentId}/`));

  const search = page.getByRole('search').filter({ has: page.locator('#home-search') });
  await search.locator('#home-search').fill('三月七');
  await search.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/search\/\?q=%E4%B8%89%E6%9C%88%E4%B8%83$/);

  await page.goto('/characters/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.locator('.entity-overview-card').first()).toBeVisible();
  const missing = await page.goto('/items');
  expect(missing?.status()).toBe(404);
  await expect(page.locator('main h1')).toBeVisible();
});

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
