import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="gold"/></svg>'
    })
  );
  await page.route('**/broken.png', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: 'not a decodable image'
    })
  );
});

test('decoding failure preserves the slot and recovers on every source change', async ({
  page
}) => {
  await page.goto('/');
  const stage = page.locator('.stage');
  const source = page.getByLabel('Source');
  await expect(stage.locator('img')).toBeVisible();
  await expect
    .poll(() => stage.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(120);
  const before = await stage.boundingBox();
  await source.selectOption('/broken.png');
  await expect(stage.locator('[data-image-fallback]')).toHaveText('?');
  await expect(stage).toHaveAttribute('data-missing', 'true');
  await expect(stage.getByRole('img', { name: 'Synthetic entity' })).toBeVisible();
  expect(await stage.boundingBox()).toEqual(before);
  await expect(stage.locator('[data-image-fallback]')).toHaveCSS('place-items', 'center');
  for (const src of ['/valid-b.svg', '/valid-a.svg']) {
    await source.selectOption(src);
    await expect(stage.locator('img')).toHaveAttribute('src', src);
    await expect(stage).toHaveAttribute('data-missing', 'false');
  }
  // Returning to a previously failed URL must issue a fresh attempt.
  await page.route('**/broken.png', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="8"/>'
    })
  );
  await source.selectOption('/broken.png');
  await expect
    .poll(() => stage.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(12);
});

test('empty sources do not create requests; decorative failures stay silent', async ({ page }) => {
  await page.goto('/');
  const stage = page.locator('.stage');
  await page.getByLabel('Source').selectOption({ label: 'Whitespace' });
  await expect(stage.locator('img')).toHaveCount(0);
  await expect(stage.locator('[data-image-fallback]')).toHaveText('?');
  await page.getByLabel('Decorative').check();
  await expect(stage.locator('*')).toHaveCount(0);
  await page.getByLabel('Source').selectOption('/broken.png');
  await expect(stage).toHaveAttribute('data-missing', 'true');
  await expect(stage.locator('*')).toHaveCount(0);
  await page.getByLabel('Source').selectOption('/valid-a.svg');
  await expect(stage.locator('img')).toHaveAttribute('alt', '');
});

test('late errors from a replaced image cannot fail the new source', async ({ page }) => {
  await page.goto('/');
  const oldImage = await page.locator('.stage img').elementHandle();
  await page.getByLabel('Source').selectOption('/valid-b.svg');
  await expect(page.locator('.stage img')).toHaveAttribute('src', '/valid-b.svg');
  await oldImage!.evaluate((image) => image.dispatchEvent(new Event('error')));
  await expect(page.locator('.stage')).toHaveAttribute('data-missing', 'false');
  await expect(page.locator('.stage img')).toBeVisible();
});

test('hydrates an image whose error event fired before listeners were attached', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/hydration');
  await expect
    .poll(() =>
      page
        .locator('#app img')
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 0)
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Hydrate' }).click();
  await expect(page.locator('#app [data-image-fallback]')).toHaveText('?');
  expect(errors).toEqual([]);
});
