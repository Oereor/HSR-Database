import { expect, test } from '@playwright/test';

const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
};

test('更新日志首次自动打开、今日关闭与手动打开', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const dialog = page.getByRole('dialog', { name: '更新日志' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: '更新日志' })).toBeVisible();
  await expect(dialog.getByText('上游数据自动更新', { exact: true })).toBeVisible();
  await expect(dialog.getByText('2026-09-03', { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText('TurnBasedGameData', { exact: true })).toBeVisible();

  await dialog.getByRole('button', { name: '关闭更新日志' }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('hsrarchive:changelog-dismissed-date'))
  ).toBeNull();

  await page.reload();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '今日关闭' }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('hsrarchive:changelog-dismissed-date'))
  ).toBe(localDate());

  await page.reload();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: '更新日志' }).first().click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
