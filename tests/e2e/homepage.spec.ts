import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const zhMessages = JSON.parse(readFileSync('messages/zh-CN.json', 'utf8')) as Record<
  string,
  string
>;

test('首页作为数据库入口展示品牌、分类与最近限定跃迁', async ({ page, isMobile }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('《崩坏：星穹铁道》档案库');
  await expect(
    page.getByRole('heading', { level: 1, name: '《崩坏：星穹铁道》档案库' })
  ).toBeVisible();
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    'href',
    /\/generated-assets\/branding\/train-party\.png$/
  );
  if (!isMobile)
    await expect(page.getByText(zhMessages.home_tagline, { exact: true })).toBeVisible();
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

  for (const [href, label] of [
    ['/characters/', '角色'],
    ['/light-cones/', '光锥'],
    ['/relics/', '遗器'],
    ['/enemies/', '敌方单位'],
    ['/endgame/', '高难模式']
  ] as const) {
    const row = page.locator(`.home-directory-row[href="${href}"]`);
    await expect(row).toContainText(label);
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
  ).toEqual([
    '/characters/1504/',
    '/characters/1513/',
    '/characters/1409/',
    '/characters/1512/',
    '/characters/1304/',
    '/characters/1412/'
  ]);
  expect(
    await page
      .locator('[data-homepage-recent="weapon"] .entity-overview-card')
      .evaluateAll((cards) => cards.map((card) => card.getAttribute('href')))
  ).toEqual([
    '/light-cones/23056/',
    '/light-cones/23064/',
    '/light-cones/23042/',
    '/light-cones/23063/',
    '/light-cones/23023/',
    '/light-cones/23048/'
  ]);

  await expect(page.getByText('沿着星轨，查清每一条数据。')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '资料分类' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '五星角色速览' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '数据从哪里来？' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '物品' })).toHaveCount(0);

  const search = page.getByRole('search').filter({ has: page.locator('#home-search') });
  await search.getByRole('textbox', { name: '搜索资料库' }).fill('三月七');
  await search.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page).toHaveURL(/\/search\/\?q=%E4%B8%89%E6%9C%88%E4%B8%83$/);

  await page.goto('/characters/');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveTitle('角色｜《崩坏：星穹铁道》档案库');
  await expect(page.getByRole('heading', { name: '角色' })).toBeVisible();
  await expect(page.locator('.entity-overview-card').first()).toBeVisible();
  await page.goto('/items');
  await expect(page).toHaveTitle('404｜《崩坏：星穹铁道》档案库');
  await expect(page.getByRole('heading', { name: '这条星轨暂不存在' })).toBeVisible();
});

test('Footer 仅保留正式服说明、数据仓库与本地许可证', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Viewport-independent message contract runs once');
  await page.goto('/');
  const footer = page.locator('main > footer');
  await expect(footer.locator('p')).toHaveCount(2);
  await expect(footer.locator('p').first()).toHaveText(zhMessages.footer_disclaimer);
  await expect(footer.locator('p').nth(1)).toHaveText(
    `${zhMessages.footer_data_source}TurnBasedGameData${zhMessages.footer_asset_source}StarRailRes (${zhMessages.footer_license})${zhMessages.footer_player_data_source}MiHoMo API / Mar-7th${zhMessages.footer_scope_note}`
  );
  await expect(footer.getByRole('link', { name: 'TurnBasedGameData' })).toHaveAttribute(
    'href',
    'https://github.com/DimbreathBot/TurnBasedGameData'
  );
  await expect(footer.getByRole('link', { name: 'StarRailRes', exact: true })).toHaveAttribute(
    'href',
    'https://github.com/Mar-7th/StarRailRes'
  );
  await expect(footer.getByRole('link', { name: 'AGPL-3.0 许可证' })).toHaveAttribute(
    'href',
    '/licenses/StarRailRes-AGPL-3.0.txt'
  );
  await expect(footer.getByRole('link', { name: 'MiHoMo API / Mar-7th' })).toHaveAttribute(
    'href',
    'https://march7th.xyz/zh/api/'
  );
  await expect(footer).not.toContainText('第三方资源与权利声明');
});
