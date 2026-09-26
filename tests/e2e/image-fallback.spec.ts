import { expect, test } from '@playwright/test';

const detailSlots = [
  { route: '/characters/1304/', selector: '.detail-artwork-stage' },
  { route: '/light-cones/23023/', selector: '.detail-artwork-stage' },
  { route: '/enemies/1002015/', selector: '.detail-artwork-stage' },
  { route: '/relics/101/', selector: '.relic-icon-stage--hero' }
];

for (const { route, selector } of detailSlots) {
  test(`content image failure keeps the detail layout: ${route}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(route);
    await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
    const stage = page.locator(selector).first();
    const image = stage.locator('img');
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBeGreaterThan(0);
    const before = await stage.boundingBox();
    await image.evaluate((node) => node.dispatchEvent(new Event('error')));
    const fallback = stage.locator('[data-image-fallback]');
    await expect(fallback).toHaveText('?');
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveCSS('place-items', 'center');
    await expect(fallback).toHaveCSS('transform', 'none');
    expect(await stage.boundingBox()).toEqual(before);
    await page.screenshot({ path: testInfo.outputPath('missing-image.png') });
    expect(errors).toEqual([]);
  });
}

test('homepage collages disappear on request failure while content cards retain placeholders', async ({
  page
}, testInfo) => {
  await page.route('**/generated-assets/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.locator('.home-hero__collage img')).toHaveCount(0);
  await expect(page.locator('.home-hero__collage [data-image-fallback]')).toHaveCount(0);
  const artwork = page
    .locator('[data-homepage-recent="avatar"] .entity-overview-card__artwork')
    .first();
  await artwork.scrollIntoViewIfNeeded();
  const fallback = artwork.locator('[data-image-fallback]');
  await expect(fallback).toHaveText('?');
  const frame = await artwork.boundingBox();
  const mark = await fallback.boundingBox();
  expect(Math.abs(mark!.x + mark!.width / 2 - frame!.x - frame!.width / 2)).toBeLessThan(2);
  expect(Math.abs(mark!.y + mark!.height / 2 - frame!.y - frame!.height / 2)).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath('home-missing-images.png') });
});

test('overview hero artwork is decorative when requests fail', async ({ page }) => {
  await page.route('**/generated-assets/characters/**', (route) => route.abort());
  await page.goto('/characters/');
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.locator('.overview-hero__artwork img:visible')).toHaveCount(0);
  await expect(page.locator('.overview-hero__artwork [data-image-fallback]')).toHaveCount(0);
});

test('missing ability icons retain identity while supporting stat icons disappear', async ({
  page
}, testInfo) => {
  await page.route('**/generated-assets/character-details/**', (route) => route.abort());
  await page.goto('/characters/1407/');
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  for (const selector of [
    '#skills .skill-card__heading',
    '#traces .trace-card__identity',
    '#eidolons .rank-card'
  ]) {
    const slot = page.locator(selector).first();
    await expect(slot.locator('[data-image-fallback]')).toHaveText('?');
    await expect(slot.locator('h3')).not.toBeEmpty();
  }
  await expect(page.locator('#eidolons .rank-label')).toHaveCount(6);
  await expect(page.locator('#stats .inspection-stat-label img')).toHaveCount(0);
  await expect(page.locator('#stats [data-image-fallback]')).toHaveCount(0);
  await expect(page.locator('#stats [data-base-stat="hp"] strong')).not.toBeEmpty();
  await page.locator('#eidolons').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('ability-missing-images.png') });
});
