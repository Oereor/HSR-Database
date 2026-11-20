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

test('language selection preserves comparison category, scope and return form', async ({
  page
}) => {
  const suffix = '/characters/1005/enhancement-comparison/?category=traces&changes=0&enhanced=0';
  await page.goto(suffix);
  await switchLanguage(page, 'en', `/en${suffix}`);
  await expect(page.locator('[data-comparison-filter=traces]')).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.locator('[data-comparison-changes]')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('[data-comparison-return]')).toHaveAttribute(
    'href',
    '/en/characters/1005/?enhanced=0'
  );
});
