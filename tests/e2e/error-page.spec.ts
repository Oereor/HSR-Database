import { expect, test } from '@playwright/test';

for (const prefix of ['', '/en']) {
  test(`error return link preserves locale and keyboard access (${prefix || 'zh-CN'})`, async ({
    page
  }) => {
    // Navigate from a known locale route so the static fallback uses the same URL locale.
    await page.goto(`${prefix}/`);
    await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
    await page.goto(`${prefix}/__ui_missing_page__/`);
    const link = page.locator('.error-state a[data-slot="button"]');
    await expect(link).toHaveAttribute('href', `${prefix}/`);
    await expect(link).toHaveRole('link');
    await expect(link).toHaveCSS('background-color', 'rgb(215, 181, 109)');
    await expect(link).toHaveCSS('color', 'rgb(11, 13, 18)');

    // Tab through the real page order instead of relying on programmatic focus.
    for (let attempt = 0; attempt < 40; attempt++) {
      await page.keyboard.press('Tab');
      if (await link.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(link).toBeFocused();
    expect(await link.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
    expect(await link.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${prefix}/$`));
    await expect(page.locator('.home-hero')).toBeVisible();
  });
}
