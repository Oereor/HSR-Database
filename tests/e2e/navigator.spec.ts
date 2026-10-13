import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const requiredIcons = [
  'overview',
  'player',
  'characters',
  'light-cones',
  'relics',
  'enemies',
  'endgame'
];
const dataRevision = (
  JSON.parse(readFileSync('src/lib/generated/manifest.json', 'utf8')) as { dataRevision: string }
).dataRevision;

test('桌面 compact rail 与 overlay pane 共享导航且不重排主内容', async ({ page, isMobile }) => {
  test.skip(isMobile, '仅桌面项目执行');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const rail = page.locator('.navigator-rail');
  await expect(rail).toBeVisible();
  expect((await rail.boundingBox())?.width).toBe(72);
  await expect(rail.locator('.primary-navigation a')).toHaveCount(requiredIcons.length);
  await expect(rail.locator('a[aria-current="page"]')).toHaveAttribute('href', '/');
  const railBrandIcon = rail.locator('.navigator-rail__brand .brand-icon');
  await expect(railBrandIcon.locator('img')).toHaveAttribute(
    'src',
    '/generated-assets/branding/train-party.png'
  );
  await expect(railBrandIcon).toHaveCSS('border-radius', '0px');
  await expect(railBrandIcon).toHaveCSS('overflow', 'visible');

  const iconSources = await rail
    .locator('.primary-navigation__icon img')
    .evaluateAll((images) =>
      images.map((image) => new URL((image as HTMLImageElement).src).pathname)
    );
  expect(iconSources).toEqual(
    expect.arrayContaining(requiredIcons.map((icon) => `/generated-assets/navigation/${icon}.png`))
  );

  const characters = rail.locator('a[href="/characters/"]');
  await characters.hover();
  await expect(characters.getByRole('tooltip')).toBeVisible();

  const main = page.locator('main');
  const before = await main.boundingBox();
  await rail.locator('.navigator-toggle').click();
  const dialog = page.locator('#primary-navigator-pane');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.navigator-pane__brand')).toBeVisible();
  const brandTitle = dialog.locator('.navigator-pane__brand strong');
  await expect(brandTitle).not.toHaveText('');
  expect(
    await brandTitle.evaluate((element) => {
      const style = getComputedStyle(element);
      return element.getBoundingClientRect().height <= Number.parseFloat(style.lineHeight) + 1;
    })
  ).toBe(true);
  await expect(dialog.locator('.brand-icon img')).toHaveAttribute(
    'src',
    '/generated-assets/branding/train-party.png'
  );
  await expect(dialog.locator('.navigator-pane__snapshot strong')).not.toHaveText('');
  await expect(dialog.getByText(dataRevision.slice(0, 8))).toBeVisible();
  await expect(dialog.getByRole('navigation').getByRole('link')).toHaveCount(requiredIcons.length);
  const after = await main.boundingBox();
  expect(after?.x).toBe(before?.x);
  expect(after?.width).toBe(before?.width);

  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await rail.locator('.navigator-toggle').click();
  await dialog.click({ position: { x: 1000, y: 120 } });
  await expect(dialog).not.toBeVisible();

  await rail.locator('.navigator-toggle').click();
  await dialog.locator('#global-search').fill('三月七');
  await dialog.locator('.search-bar button[type="submit"]').click();
  await expect(page).toHaveURL(/\/search\/\?q=%E4%B8%89%E6%9C%88%E4%B8%83$/);
});

test('移动端仅保留顶部触发器并使用完整抽屉', async ({ page, isMobile }) => {
  test.skip(!isMobile, '仅移动项目执行');
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/endgame/');
  await expect(page.locator('.navigator-rail')).toBeHidden();
  await expect(page.locator('.mobile-header')).toBeVisible();

  const actions = page.locator('.mobile-header__actions');
  await expect(actions).toBeVisible();
  await expect(actions.locator('button')).toHaveCount(2);
  expect(
    await actions
      .locator('button')
      .evaluateAll((buttons) =>
        buttons.every((button) => Boolean(button.getAttribute('aria-label')))
      )
  ).toBe(true);
  expect(
    await actions.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.right <= document.documentElement.clientWidth && box.left >= 0;
    })
  ).toBe(true);

  await actions.locator('.navigator-toggle').click();
  const dialog = page.locator('#primary-navigator-pane');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('a[href="/endgame/"]')).toHaveAttribute('aria-current', 'page');
  await expect(dialog.locator('#global-search')).toBeVisible();
  await expect(dialog.locator('.navigator-pane__snapshot strong')).not.toHaveText('');
  expect((await dialog.locator('.navigator-pane__surface').boundingBox())?.width).toBeLessThan(321);
  await expect(page.locator('body')).toHaveClass(/navigator-open/);

  await dialog.locator('.navigator-toggle').click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/navigator-open/);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('导航重构后的代表路由均保留全局 shell', async ({ page }) => {
  for (const route of [
    '/',
    '/characters/1001/',
    '/light-cones/20000/',
    '/relics/101/',
    '/enemies/1002011/',
    '/endgame/'
  ]) {
    await page.goto(route);
    await expect(page.locator('.site-shell')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
  }

  const response = await page.goto('/rogue');
  expect(response?.status()).toBe(404);
  await expect(page.locator('main h1')).toBeVisible();
});
