import { expect, type Page } from '@playwright/test';

export async function selectTrailblazer(page: Page, nickname: string) {
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  const control = page.locator('[data-trailblazer-select]');
  const mobile = !(await control.isVisible());
  if (mobile) await page.locator('[data-slot="sidebar-trigger"]').click();
  await control.click();
  await page.getByRole('option', { name: nickname, exact: true }).click();
  if (mobile) await page.keyboard.press('Escape');
}
