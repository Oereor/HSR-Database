import { expect, type Page } from '@playwright/test';

export async function openLanguageSelect(page: Page) {
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  const trigger = page.locator('[data-language-select]');
  if (!(await trigger.isVisible())) await page.locator('[data-slot="sidebar-trigger"]').click();
  await trigger.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  return trigger;
}

export async function switchLanguage(page: Page, locale: 'en' | 'zh-CN', href: string) {
  await openLanguageSelect(page);
  const target = new URL(href, page.url()).href;
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().isNavigationRequest() &&
        response.request().resourceType() === 'document' &&
        response.url() === target.split('#')[0]
    ),
    page.locator(`[role="option"][data-locale="${locale}"]`).click()
  ]);
  expect(response.ok()).toBe(true);
  await expect(page).toHaveURL(target);
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
}
