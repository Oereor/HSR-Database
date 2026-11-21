import { expect, test } from '@playwright/test';
import { switchLanguage } from '../helpers/language';

for (const prefix of ['', '/en']) {
  test(`comparison entry and return preserves the selected form (${prefix || 'zh-CN'})`, async ({
    page,
    request
  }) => {
    const ordinary = `${prefix}/characters/1001/`;
    const detail = `${prefix}/characters/1212/`;
    const comparison = `${detail}enhancement-comparison/`;
    const entry = page.locator('[data-enhancement-comparison-link]');
    await page.goto(ordinary);
    await expect(entry).toHaveCount(0);
    const ordinaryData = await request.get(`${ordinary}__data.json`);
    expect(ordinaryData.ok()).toBe(true);
    expect(await ordinaryData.text()).not.toContain('enhancement-comparisons');
    expect(await ordinaryData.text()).not.toContain('declarationId');
    await page.goto(detail);
    await expect(entry).toHaveAttribute('href', comparison);
    const switcher = page.locator('.enhancement-control [role=switch]');
    await expect(switcher).toHaveAttribute('aria-checked', 'true');
    await switcher.click();
    await expect(entry).toHaveAttribute('href', `${comparison}?enhanced=0`);
    await expect(switcher).toHaveAttribute('aria-checked', 'false');
    await entry.click();
    await expect(page).toHaveURL(`${comparison}?enhanced=0`);
    const breadcrumb = page.locator('[data-slot=breadcrumb]');
    const parent = breadcrumb.locator('a').last();
    await expect(breadcrumb.locator('a')).toHaveCount(3);
    await expect(breadcrumb.locator('[aria-current=page]')).toBeVisible();
    await expect(parent).toHaveAttribute('href', `${detail}?enhanced=0`);
    await expect(page.locator('[data-comparison-return]')).toHaveAttribute(
      'href',
      `${detail}?enhanced=0`
    );
    await parent.click();
    await expect(page).toHaveURL(`${detail}?enhanced=0`);
    await expect(switcher).toHaveAttribute('aria-checked', 'false');

    await switcher.click();
    await expect(entry).toHaveAttribute('href', comparison);
    await entry.click();
    await page.locator('[data-comparison-return]').click();
    await expect(page).toHaveURL(detail);
    await expect(switcher).toHaveAttribute('aria-checked', 'true');
  });
}

for (const [prefix, width] of [
  ['', 450],
  ['/en', 520],
  ['/en', 320]
] as const) {
  test(`enhancement controls fit the detail hero at ${width}px (${prefix || 'zh-CN'})`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 840 });
    await page.goto(`${prefix}/characters/1102/`);
    await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const actions = page.locator('.enhancement-actions');
    const switcher = actions.getByRole('switch');

    for (const enhanced of [true, false]) {
      await expect(switcher).toHaveAttribute('aria-checked', String(enhanced));
      const layout = await actions.evaluate((element) => {
        const row = element.getBoundingClientRect();
        const [control, comparison] = Array.from(element.children, (child) =>
          child.getBoundingClientRect()
        );
        const gap = parseFloat(getComputedStyle(element).columnGap);
        return {
          overflow: Math.max(control.right, comparison.right) - row.right,
          onSameRow: control.top < comparison.bottom && comparison.top < control.bottom,
          fitsOnRow: control.width + comparison.width + gap <= row.width + 1
        };
      });
      expect(layout.overflow).toBeLessThanOrEqual(1);
      expect(layout.onSameRow).toBe(layout.fitsOnRow);
      if (!prefix) expect(layout.onSameRow).toBe(true);

      if (enhanced) await switcher.click();
    }
  });
}

test('language selection preserves comparison category and return form', async ({ page }) => {
  const suffix = '/characters/1005/enhancement-comparison/?category=traces&enhanced=0';
  await page.goto(suffix);
  await switchLanguage(page, 'en', `/en${suffix}`);
  await expect(page.locator('[data-comparison-filter=traces]')).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.locator('[data-comparison-return]')).toHaveAttribute(
    'href',
    '/en/characters/1005/?enhanced=0'
  );
});
