import { expect, test } from '@playwright/test';

for (const prefix of ['', '/en']) {
  test(`endgame overview and mode navigation ${prefix || 'zh-CN'}`, async ({ page, isMobile }) => {
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
    await page.goto(`${prefix}/endgame/`);
    await expect(page.locator('[data-app-ready]')).toHaveAttribute('data-app-ready', 'true');
    if (!isMobile) {
      await page.locator('[data-sidebar="trigger"]').click();
      await expect(page.locator('[data-slot="sidebar"][data-state]')).toHaveAttribute(
        'data-state',
        'expanded'
      );
    }
    await expect(page.locator('[data-endgame-overview-card]')).toHaveCount(4);
    await expect(page.locator('[data-endgame-overview-card="aa"]')).toBeVisible();
    for (const mode of ['moc', 'pf', 'as', 'aa']) {
      await page.goto(`${prefix}/endgame/${mode}/`);
      await expect(page.locator('[data-app-ready]')).toHaveAttribute('data-app-ready', 'true');
      const nav = page.locator('.endgame-mode-switcher__island');
      await expect(nav.getByRole('link')).toHaveCount(4);
      const active = nav.locator('[aria-current="page"]');
      await expect(active).toHaveAttribute('href', `${prefix}/endgame/${mode}/`);
      await expect(active).toBeInViewport();
      const cards = page.locator('[data-endgame-season-card]');
      await expect(cards.first()).toBeVisible();
      for (const card of await cards.all())
        await expect(card).toHaveAttribute(
          'href',
          new RegExp(`^${prefix}/endgame/${mode}/[0-9]+/$`)
        );
      await expect(cards.locator('a, button')).toHaveCount(0);
      const title = cards.first().getByRole('heading');
      await title.evaluate((el) => (el.textContent = 'SyntheticLongName'.repeat(30)));
      expect(await title.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1);
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
