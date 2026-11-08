import { expect, test } from '@playwright/test';

test('shell bounds stay stable when navigation removes the scrollbar', async ({
  playwright,
  baseURL,
  storageState,
  isMobile
}) => {
  test.skip(isMobile, 'This regression exercises desktop scrollbar gutters');
  const browser = await playwright.chromium.launch({
    ignoreDefaultArgs: ['--hide-scrollbars'],
    args: ['--disable-features=OverlayScrollbar,OverlayScrollbars']
  });
  try {
    const page = await browser.newPage({
      baseURL,
      storageState,
      viewport: { width: 1920, height: 1080 }
    });
    const measureShell = () =>
      page.evaluate(() => {
        const root = document.documentElement;
        return {
          verticalOverflow: root.scrollHeight > root.clientHeight,
          scrollbarWidth: innerWidth - root.clientWidth,
          horizontalOverflow: root.scrollWidth - root.clientWidth,
          bounds: [
            'main > .content.site-container',
            '.global-breadcrumb > .site-container',
            '.site-footer > .site-container'
          ].map((selector) => {
            const { left, width } = document.querySelector(selector)!.getBoundingClientRect();
            return { left, width };
          })
        };
      });

    await page.goto('/characters/');
    await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
    const longPage = await measureShell();
    expect(longPage.verticalOverflow).toBe(true);
    expect(longPage.scrollbarWidth).toBeGreaterThan(0);

    const navigation = page.locator('.primary-navigation');
    await navigation.locator('a[href="/player/"]').click();
    await page.waitForURL('/player/');
    await expect(page.locator('.player-page__heading')).toBeVisible();
    const shortPage = await measureShell();
    expect(shortPage.verticalOverflow).toBe(false);

    await navigation.locator('a[href="/characters/"]').click();
    await page.waitForURL('/characters/');
    await expect(page.locator('.entity-overview-card').first()).toBeVisible();
    const returnedPage = await measureShell();
    expect(returnedPage.verticalOverflow).toBe(true);

    const origin = longPage.bounds[0];
    for (const layout of [longPage, shortPage, returnedPage]) {
      expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
      for (const box of layout.bounds) {
        expect(Math.abs(box.left - origin.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(box.width - origin.width)).toBeLessThanOrEqual(1);
      }
    }
  } finally {
    await browser.close();
  }
});

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
    expect(response.ok()).toBe(true);
    const navigation = (await response.text()).match(
      /<nav\b[^>]*data-slot="breadcrumb"[^>]*>[\s\S]*?<\/nav>/
    );
    expect(navigation?.[0]).toContain('aria-current="page"');
    await page.goto(`${prefix}/characters/1001/?rank=2&level=20&encounter=ignored`);
    const breadcrumb = page.locator('[data-slot="breadcrumb"]');
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(breadcrumb.locator('a').first()).toHaveAttribute('href', `${prefix}/`);
    await expect(breadcrumb.locator('a').nth(1)).toHaveAttribute('href', `${prefix}/characters/`);
    await expect(breadcrumb.locator('[aria-current="page"]')).not.toHaveAttribute('href');
    await expect(breadcrumb.locator('a')).toHaveCount(2);
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
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(breadcrumb.locator('a')).toHaveCount(1);
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
      if (width >= 768) await page.locator('[data-slot="sidebar-trigger"]').click();
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
