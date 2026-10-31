import { expect, test } from '@playwright/test';

for (const prefix of ['', '/en']) {
  test(`four-level breadcrumbs keep the current page visible on narrow screens (${prefix || 'zh-CN'})`, async ({
    page
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(`${prefix}/endgame/moc/1034/?encounter=5312`);
    const breadcrumb = page.locator('[data-slot="breadcrumb"]');
    const current = breadcrumb.locator('[aria-current="page"]');
    await expect(current).toBeVisible();
    await expect(breadcrumb.locator('a')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
  });
  test(`breadcrumb follows the route and leaves anchors visible (${prefix || 'zh-CN'})`, async ({
    page,
    request
  }) => {
    const response = await request.get(`${prefix}/characters/1001/`);
    expect(await response.text()).toContain('data-slot="breadcrumb-page"');
    await page.goto(`${prefix}/characters/1001/?rank=2&level=20&encounter=ignored`);
    const breadcrumb = page.locator('[data-slot="breadcrumb"]');
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(breadcrumb.locator('a').first()).toHaveAttribute('href', `${prefix}/`);
    await expect(breadcrumb.locator('a').nth(1)).toHaveAttribute('href', `${prefix}/characters/`);
    await expect(breadcrumb.locator('[aria-current="page"]')).not.toHaveAttribute('href');
    expect(await breadcrumb.locator('li').count()).toBe(5);
    const section = page.locator('.section-nav a').last();
    const hash = await section.getAttribute('href');
    await section.click();
    await expect(page).toHaveURL(new RegExp(`${hash}$`));
    await expect
      .poll(async () =>
        page.locator(hash!).evaluate((element) => element.getBoundingClientRect().top)
      )
      .toBeGreaterThanOrEqual(0);
    const barBottom = await page
      .locator('.section-nav')
      .evaluate((element) => element.getBoundingClientRect().bottom);
    expect(
      await page.locator(hash!).evaluate((element) => element.getBoundingClientRect().top)
    ).toBeGreaterThanOrEqual(barBottom - 1);
    await breadcrumb.locator('a').nth(1).click();
    await expect(page).toHaveURL(new RegExp(`${prefix}/characters/$`));
    await expect(breadcrumb.locator('[data-slot="breadcrumb-item"]')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
  });
}
