import { expect, test } from '@playwright/test';

for (const prefix of ['', '/en']) {
  test(`Phase 6A layout and navigation ${prefix || 'zh-CN'}`, async ({ page }, testInfo) => {
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
    async function expandSidebar(width: number) {
      await expect(page.locator('[data-app-ready]')).toHaveAttribute('data-app-ready', 'true');
      if (width < 1280) return;
      const sidebar = page.locator('[data-slot="sidebar"][data-state]');
      if ((await sidebar.getAttribute('data-state')) === 'collapsed')
        await page.locator('[data-sidebar="trigger"]').click();
      await expect(sidebar).toHaveAttribute('data-state', 'expanded');
      await expect
        .poll(() =>
          page
            .locator('[data-slot="sidebar-container"]')
            .evaluate((el) =>
              Math.abs(
                el.getBoundingClientRect().width -
                  Number.parseFloat(getComputedStyle(el).getPropertyValue('--sidebar-width')) *
                    Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
              )
            )
        )
        .toBeLessThanOrEqual(1);
    }
    for (const width of [320, 390, 768, 1280, 1600]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${prefix}/endgame/`);
      await expect(page.locator('[data-app-ready]')).toHaveAttribute('data-app-ready', 'true');
      await expandSidebar(width);
      const grid = page.locator('.endgame-overview-grid');
      const layout = await grid.evaluate((el) => ({
        width: el.clientWidth,
        columns: getComputedStyle(el).gridTemplateColumns.split(' ').length
      }));
      expect(layout.columns).toBe(layout.width >= 768 ? 3 : 1);
      await expect(
        page.locator('.endgame-overview-arbitration > [data-endgame-overview-card="aa"]')
      ).toHaveCount(1);
      await expect(page.locator('[data-endgame-overview-card]')).toHaveCount(4);
      const overviewTitle = page.locator('.endgame-overview-card__season strong').first();
      await overviewTitle.evaluate((el) => (el.textContent = 'SyntheticLongName'.repeat(30)));
      expect(
        await overviewTitle.evaluate((el) => el.scrollWidth - el.clientWidth)
      ).toBeLessThanOrEqual(1);
      for (const mode of ['moc', 'pf', 'as', 'aa']) {
        await page.goto(`${prefix}/endgame/${mode}/`);
        await expect(page.locator('[data-app-ready]')).toHaveAttribute('data-app-ready', 'true');
        await expandSidebar(width);
        const nav = page.locator('.endgame-mode-switcher__island');
        await expect(nav.getByRole('link')).toHaveCount(4);
        const active = nav.locator('[aria-current="page"]');
        await expect(active).toHaveAttribute('href', `${prefix}/endgame/${mode}/`);
        await expect
          .poll(() =>
            active.evaluate((el) => {
              const activeBox = el.getBoundingClientRect();
              const navBox = el.closest('nav')!.getBoundingClientRect();
              return activeBox.x >= navBox.x - 1 && activeBox.right <= navBox.right + 1;
            })
          )
          .toBe(true);
        const cards = page.locator('[data-endgame-season-card]');
        for (const card of await cards.all()) {
          await expect(card).toHaveAttribute(
            'href',
            new RegExp(`^${prefix}/endgame/${mode}/[0-9]+/$`)
          );
        }
        await expect(cards.locator('a, button')).toHaveCount(0);
        // Stress the actual production layout with synthetic unbroken text.
        await cards
          .first()
          .locator('h3')
          .evaluate((el) => (el.textContent = 'SyntheticLongName'.repeat(30)));
        const title = cards.first().locator('h3');
        expect(await title.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(
          1
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
          )
        ).toBeLessThanOrEqual(1);
      }
      if ([390, 1280].includes(width)) {
        for (const route of ['endgame/', 'endgame/moc/']) {
          await page.goto(`${prefix}/${route}`);
          await expandSidebar(width);
          await page.screenshot({
            path: `data/audit/phase6a-${route.includes('moc') ? 'archive' : 'overview'}-${prefix ? 'en' : 'zh'}-${width}-${testInfo.project.name}.png`,
            fullPage: false
          });
        }
      }
    }
    await page.goto(`${prefix}/endgame/moc/1034/?encounter=5312`);
    await page.locator(`.endgame-mode-switcher a[href="${prefix}/endgame/pf/"]`).click();
    await expect(page).toHaveURL(new RegExp(`${prefix}/endgame/pf/$`));
    await page.goBack();
    await expect(page).toHaveURL(/moc\/1034\/\?encounter=5312$/);
    await expect(page.locator('.endgame-mode-switcher [aria-current="page"]')).toHaveAttribute(
      'href',
      `${prefix}/endgame/moc/`
    );
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`${prefix}/endgame/pf/$`));
    expect(errors).toEqual([]);
  });
}
