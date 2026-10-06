import { expect, test, type Page } from '@playwright/test';

const before = new Date('2026-10-05T03:59:59+08:00');

test.use({ timezoneId: 'Asia/Shanghai' });

async function installClock(page: Page, time = before) {
  await page.clock.install({ time });
  await page.clock.pauseAt(time);
  await page.addInitScript(() => {
    const date = new Date();
    localStorage.setItem(
      'hsrarchive:changelog-dismissed-date',
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    );
  });
}

async function openReady(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('[data-app-ready]')).toHaveAttribute('data-app-ready', 'true');
}

for (const prefix of ['', '/en']) {
  for (const route of ['overview', 'mode', 'detail'] as const) {
    test(`${prefix || 'zh-CN'} ${route} crosses the AS boundary on the same static page`, async ({
      page,
      request
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (/hydration/i.test(message.text())) errors.push(message.text());
      });
      await installClock(page);
      const url = `${prefix}/endgame/${route === 'overview' ? '' : route === 'mode' ? 'as/' : 'as/3021/'}`;
      const staticBefore = await (await request.get(url)).text();
      await openReady(page, url);
      const oldHref = `${prefix}/endgame/as/3020/`;
      const newHref = `${prefix}/endgame/as/3021/`;
      const card = page.locator('[data-endgame-overview-card="as"]');
      const oldPeriod = page.locator(`a[href="${oldHref}"][data-endgame-season-card]`);
      const newPeriod = page.locator(`a[href="${newHref}"][data-endgame-season-card]`);
      const heroStatus = page.locator('.endgame-season-hero .endgame-inline-status');

      if (route === 'overview') await expect(card).toHaveAttribute('href', oldHref);
      else if (route === 'mode') {
        await expect(oldPeriod).toHaveAttribute('data-endgame-season-card', 'current');
        await expect(newPeriod).toHaveAttribute('data-endgame-season-card', 'upcoming');
      } else {
        await expect(heroStatus).toHaveClass(/endgame-inline-status--upcoming/);
        await expect(page.locator('.endgame-season-hero h1')).not.toHaveText('');
      }

      let navigations = 0;
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) navigations += 1;
      });
      await page.clock.runFor(1_000);
      if (route === 'overview') await expect(card).toHaveAttribute('href', newHref);
      else if (route === 'mode') {
        await expect(oldPeriod).toHaveAttribute('data-endgame-season-card', 'historical');
        await expect(newPeriod).toHaveAttribute('data-endgame-season-card', 'current');
      } else {
        await expect(heroStatus).toHaveCount(1);
        await expect(heroStatus).not.toHaveClass(/endgame-inline-status--upcoming/);
      }
      expect(navigations).toBe(0);
      expect(await (await request.get(url)).text()).toBe(staticBefore);
      expect(errors).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        )
      ).toBeLessThanOrEqual(1);
    });
  }

  test(`${prefix || 'zh-CN'} navigation and restored page use the current clock`, async ({
    page
  }) => {
    // Allow navigation's animation frames to run, then pause at the exact boundary fixture.
    await installClock(page, new Date(before.getTime() - 59_000));
    await openReady(page, `${prefix}/endgame/`);
    const card = page.locator('[data-endgame-overview-card="as"]');
    await expect(card).toHaveAttribute('href', `${prefix}/endgame/as/3020/`);
    await page.clock.resume();
    await card.click();
    await expect(page).toHaveURL(new RegExp(`${prefix}/endgame/as/3020/$`));
    await page.clock.pauseAt(before);
    await expect(page.locator('.endgame-season-hero .endgame-inline-status')).toHaveCount(1);
    await page.clock.runFor(1_000);
    await expect(page.locator('.endgame-season-hero .endgame-inline-status')).toHaveCount(0);
    await page.clock.resume();
    await page.locator('.endgame-breadcrumb').click();
    await expect(page.locator(`a[href="${prefix}/endgame/as/3021/"]`)).toHaveAttribute(
      'data-endgame-season-card',
      'current'
    );
    await page.clock.pauseAt(new Date(before.getTime() + 61_000));
    await page.clock.setSystemTime(new Date('2026-10-05T03:59:59+08:00'));
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await expect(page.locator(`a[href="${prefix}/endgame/as/3020/"]`)).toHaveAttribute(
      'data-endgame-season-card',
      'current'
    );
  });
}

test.describe('different browser timezone', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test('schedule classification still follows the Shanghai boundary', async ({ page }) => {
    await installClock(page);
    await openReady(page, '/endgame/as/');
    await expect(page.locator('a[href="/endgame/as/3020/"]')).toHaveAttribute(
      'data-endgame-season-card',
      'current'
    );
    await page.clock.runFor(1_000);
    await expect(page.locator('a[href="/endgame/as/3021/"]')).toHaveAttribute(
      'data-endgame-season-card',
      'current'
    );
  });
});

test.describe('static fallback', () => {
  test.use({ javaScriptEnabled: false });
  test('Endgame remains browsable without JavaScript', async ({ page }) => {
    for (const url of ['/endgame/', '/endgame/as/', '/endgame/as/3021/', '/en/endgame/as/3021/']) {
      const response = await page.goto(url);
      expect(response?.status()).toBe(200);
      await expect(page.locator('main')).not.toBeEmpty();
    }
  });
});
