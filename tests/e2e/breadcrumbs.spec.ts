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

for (const prefix of ['', '/en']) {
  test(`shell containers align and Endgame anchors clear sticky navigation (${prefix || 'zh-CN'})`, async ({
    page,
    isMobile
  }) => {
    test.skip(isMobile, 'The explicit viewport matrix runs once in desktop Chromium');
    for (const width of [320, 390, 767, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${prefix}/endgame/moc/1034/?encounter=5312`);
      await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
      if (width >= 768)
        await page.locator('[data-slot="sidebar-container"] .navigator-toggle').click();
      const bounds = await page.evaluate(() =>
        [
          'main > .content',
          '.global-breadcrumb > .site-container',
          '.site-footer > .site-container'
        ].map((selector) => {
          const rect = document.querySelector(selector)!.getBoundingClientRect();
          return { x: rect.x, width: rect.width };
        })
      );
      expect(Math.abs(bounds[0].x - bounds[1].x)).toBeLessThanOrEqual(1);
      expect(Math.abs(bounds[0].x - bounds[2].x)).toBeLessThanOrEqual(1);
      expect(Math.abs(bounds[0].width - bounds[1].width)).toBeLessThanOrEqual(1);
      const heading = page.locator('.endgame-node-section[id]').first();
      await expect(heading).toBeVisible();
      await page.evaluate(
        (id) => {
          location.hash = id!;
        },
        await heading.getAttribute('id')
      );
      await expect
        .poll(async () =>
          page.evaluate(() => {
            const top = document
              .querySelector('.endgame-node-section[id]')!
              .getBoundingClientRect().top;
            const modeBottom = document
              .querySelector('.endgame-mode-switcher')!
              .getBoundingClientRect().bottom;
            return top >= modeBottom - 1 && top < innerHeight / 2;
          })
        )
        .toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
    }
  });
}
