import { expect, test } from '@playwright/test';

for (const prefix of ['', '/en']) {
  test(`endgame responsive details ${prefix || 'zh-CN'}`, async ({ page, isMobile }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.setFixedTime(new Date('2026-09-09T00:00:00+08:00'));
    await page.addInitScript(() => {
      const date = new Date();
      localStorage.setItem(
        'hsrarchive:changelog-dismissed-date',
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      );
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const routes = [
      'moc/1034/?encounter=5312',
      'pf/2025/?encounter=20254',
      'as/3020/?encounter=30204',
      'aa/8/?encounter=804%3Anormal'
    ];
    const width = page.viewportSize()!.width;
    for (const route of routes) {
      await page.goto(`${prefix}/endgame/${route}`);
      await expect(page.locator('[data-app-ready]')).toHaveAttribute('data-app-ready', 'true');
      if (width >= 1280) {
        await page.locator('[data-sidebar="trigger"]').click();
        await expect(page.locator('[data-slot="sidebar"][data-state]')).toHaveAttribute(
          'data-state',
          'expanded'
        );
      }
      const cards = page.locator('[data-endgame-enemy-card]');
      expect(await cards.count()).toBeGreaterThan(0);
      await cards
        .first()
        .locator('.endgame-enemy__name')
        .evaluate((el) => (el.textContent = 'SyntheticLongName'.repeat(30)));
      await cards
        .first()
        .locator('[data-endgame-speed]')
        .evaluate((el) => (el.textContent = '1234567890'.repeat(8)));
      for (const selector of ['.endgame-enemy__name', '[data-endgame-speed]'])
        expect(
          await cards
            .first()
            .locator(selector)
            .evaluate((el) => el.scrollWidth - el.clientWidth)
        ).toBeLessThanOrEqual(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        )
      ).toBeLessThanOrEqual(1);
    }
    // Container-query boundaries are independent of the device viewport.
    if (isMobile) {
      expect(errors).toEqual([]);
      return;
    }
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(`${prefix}/endgame/aa/8/?encounter=804%3Anormal`);
    await expect(page.locator('.endgame-local-nav a[aria-current="page"]')).toHaveAttribute(
      'href',
      '?encounter=804%3Anormal'
    );
    const main = page.locator('.endgame-main-content');
    for (const width of [599, 600, 619, 620, 839, 840, 859, 860]) {
      await main.evaluate((el, width) => (el.style.width = `${width}px`), width);
      const segments = page.locator('[data-mechanic-section-segments]');
      const count = Number(await segments.getAttribute('data-mechanic-section-segments'));
      await expect
        .poll(() =>
          segments.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
        )
        .toBe(width < 600 ? 1 : width < 840 ? Math.min(count, 2) : count);
      await expect
        .poll(() =>
          page
            .locator('[data-buff-option-grid]')
            .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
        )
        .toBe(width < 620 ? 1 : width < 860 ? 2 : 3);
    }
    await page.goto(`${prefix}/endgame/as/3020/?encounter=30204`);
    await expect(page.locator('.endgame-local-nav a[aria-current="page"]')).toHaveAttribute(
      'href',
      '?encounter=30204'
    );
    const dossier = page.locator('.as-boss-dossier--with-traits').first();
    for (const width of [699, 700]) {
      await page
        .locator('.endgame-main-content')
        .evaluate((el, width) => (el.style.width = `${width}px`), width);
      await expect
        .poll(() =>
          dossier.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
        )
        .toBe(width < 700 ? 1 : 2);
    }
    expect(errors).toEqual([]);
  });
}
