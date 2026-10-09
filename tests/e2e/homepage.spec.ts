import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { HomepageRecentWarpData } from '../../src/lib/domain/types';

const homepage = JSON.parse(
  readFileSync('src/lib/generated/views/zh-CN/homepage.json', 'utf8')
) as HomepageRecentWarpData;

test('首页作为数据库入口展示品牌、分类与最近限定跃迁', async ({ page, isMobile }) => {
  await page.goto('/');
  await expect(page.locator('.home-hero h1')).toBeVisible();
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    'href',
    /\/generated-assets\/branding\/train-party\.png$/
  );
  if (!isMobile) await expect(page.locator('.home-hero__identity > p')).toBeVisible();
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
