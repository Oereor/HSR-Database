import { expect, test } from '@playwright/test';

const comparisonPath = (id: string, locale = '') =>
  `${locale}/characters/${id}/enhancement-comparison/`;

for (const id of ['1306', '1212', '1205']) {
  test(`comparison for ${id} renders two readable forms without overflow`, async ({
    page,
    isMobile
  }, testInfo) => {
    const path = comparisonPath(id);
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    const response = await page.goto(path);
    expect(response?.ok()).toBe(true);
    await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
    await expect(page.locator('[data-enhancement-comparison]')).toHaveAttribute(
      'data-enhancement-comparison',
      id
    );
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      new RegExp(`${path}$`)
    );
    await expect(page.locator('link[hreflang=en]')).toHaveAttribute(
      'href',
      new RegExp(`/en${path}$`)
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      (await page.title()).split(' | ')[0]
    );
    await expect(page.locator('[data-enhancement-comparison] [role=switch]')).toHaveCount(0);
    await expect(page.locator('[data-comparison-item][data-status=unchanged]')).toHaveCount(0);
    await expect(page.locator('[data-comparison-item] [data-slot=badge]')).toHaveCount(0);
    await expect(page.locator('[data-comparison-item] details')).toHaveCount(0);
    await expect(page.locator('[data-comparison-item] [data-diff=insert]').first()).toBeVisible();
    await expect(page.locator('[data-comparison-item] [data-diff=delete]').first()).toBeVisible();
    if (id === '1212') await expect(page.locator('[data-comparison-notes]').first()).toBeVisible();

    const item = page.locator('[data-comparison-item]').first();
    const before = await item.locator('[data-comparison-side=before]').boundingBox();
    const after = await item.locator('[data-comparison-side=after]').boundingBox();
    expect(before).toBeTruthy();
    expect(after).toBeTruthy();
    if (isMobile) {
      expect(Math.abs(after!.x - before!.x)).toBeLessThan(2);
      expect(after!.y).toBeGreaterThan(before!.y);
      for (const tab of await page.getByRole('tab').all()) {
        const bounds = await tab.boundingBox();
        expect(bounds?.width).toBeGreaterThanOrEqual(44);
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
      }
    } else {
      expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
      expect(after!.x).toBeGreaterThan(before!.x);
    }

    const layout = await page.locator('[data-enhancement-comparison]').evaluate((root) => {
      const overflowingSides = [...root.querySelectorAll('[data-comparison-side]')].filter(
        (side) => side.scrollWidth > side.clientWidth + 1
      );
      return {
        overflowingSides: overflowingSides.length,
        viewportOverflow: document.documentElement.scrollWidth - innerWidth
      };
    });
    expect(layout.overflowingSides).toBe(0);
    expect(layout.viewportOverflow).toBeLessThanOrEqual(1);
    expect(consoleErrors).toEqual([]);

    if (process.env.HSR_CAPTURE_ENHANCEMENT_SCREENSHOTS === '1')
      await page.screenshot({
        path: testInfo.outputPath(`enhancement-${id}-${isMobile ? 'mobile' : 'desktop'}.png`),
        animations: 'disabled'
      });
  });
}

test('filters are shareable and recover across reload and history', async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 700 });
  const path = comparisonPath('1005', '/en');
  await page.goto(`${path}?changes=0`);
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  const category = (key: string) => page.locator(`[data-comparison-filter=${key}]`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    (await page.title()).split(' | ')[0]
  );
  await expect(category('all')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-comparison-item][data-source=profile]').first()).toBeVisible();
  await category('all').press('ArrowRight');
  await expect(page).toHaveURL(/category=skills$/);
  await expect(category('skills')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-comparison-item]:not([data-category=skills])')).toHaveCount(0);
  await category('eidolons').click();
  await expect(page).toHaveURL(/category=eidolons$/);
  await page.reload();
  await expect(category('eidolons')).toHaveAttribute('aria-selected', 'true');
  await page.goBack();
  await expect(category('skills')).toHaveAttribute('aria-selected', 'true');
  await page.goForward();
  await expect(category('eidolons')).toHaveAttribute('aria-selected', 'true');

  await page.goto(`${path}?category=unknown`);
  await expect(category('all')).toHaveAttribute('aria-selected', 'true');
});

test('comparison sliders update both forms independently and retain levels across tabs', async ({
  page,
  isMobile
}) => {
  await page.goto(comparisonPath('1212'));
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  const card = (id: string) => page.locator(`[data-comparison-item="skills:${id}"]`);
  const basic = card('121201');
  const skill = card('121202');
  const slider = basic.getByRole('slider');
  const otherSlider = skill.getByRole('slider');
  const before = basic.locator('[data-comparison-side=before]');
  const after = basic.locator('[data-comparison-side=after]');

  await expect(slider).toHaveAttribute('aria-valuenow', '6');
  await expect(otherSlider).toHaveAttribute('aria-valuenow', '10');
  await expect(card('121207').getByRole('slider')).toHaveCount(0);
  await expect(before.locator('del')).toContainText('100%');
  await expect(after.locator('ins')).toContainText('50%');

  await slider.press('Home');
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
  await expect(before.locator('del')).toContainText('50%');
  await expect(after.locator('ins')).toContainText('25%');
  await expect(otherSlider).toHaveAttribute('aria-valuenow', '10');

  const track = basic.locator('[data-slot=slider-track]');
  await track.scrollIntoViewIfNeeded();
  const bounds = (await track.boundingBox())!;
  const x = bounds.x + bounds.width - 1;
  const y = bounds.y + bounds.height / 2;
  if (isMobile) {
    await page.touchscreen.tap(x, y);
  } else {
    const thumb = (await slider.boundingBox())!;
    await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 8 });
    await page.mouse.up();
  }
  await expect(slider).toHaveAttribute('aria-valuenow', '10');
  await expect(before.locator('del')).toContainText('140%');
  await expect(after.locator('ins')).toContainText('70%');

  for (const category of ['traces', 'eidolons']) {
    await page.locator(`[data-comparison-filter=${category}]`).click();
    await expect(page).toHaveURL(new RegExp(`category=${category}$`));
    await expect(
      page.locator(`[data-comparison-item][data-category=${category}]`).first()
    ).toBeVisible();
    await expect(page.getByRole('slider')).toHaveCount(0);
  }
  await page.locator('[data-comparison-filter=skills]').click();
  await expect(slider).toHaveAttribute('aria-valuenow', '10');
  await expect(otherSlider).toHaveAttribute('aria-valuenow', '10');
  await expect(after.locator('ins')).toContainText('70%');
});

test('ordinary character comparison does not resolve', async ({ request }) => {
  const response = await request.get(comparisonPath('1001'));
  expect(response.status()).toBe(404);
});
