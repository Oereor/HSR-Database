import { expect, test } from '@playwright/test';

const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
};

test('更新日志首次自动打开、今日关闭与手动打开', async ({ page, isMobile }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const dialog = page.locator('dialog.changelog-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#changelog-dialog-title')).toBeVisible();
  const entries = dialog.locator('.changelog-entry');
  expect(await entries.count()).toBeGreaterThan(0);
  await expect(entries.first().locator('h3')).not.toHaveText('');
  await expect(entries.first().locator('.changelog-entry__body')).not.toHaveText('');
  if (!isMobile) {
    await expect(entries.first().locator('time')).toBeVisible();
  }

  await dialog.locator('.changelog-dialog__close').click();
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('hsrarchive:changelog-dismissed-date'))
  ).toBeNull();

  await page.reload();
  await expect(dialog).toBeVisible();
  await dialog.locator('.changelog-dialog__today').click();
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('hsrarchive:changelog-dismissed-date'))
  ).toBe(localDate());

  await page.reload();
  await expect(dialog).not.toBeVisible();
  await page.locator('.changelog-trigger:visible').first().click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('中文与英文页面加载同一组本地化更新日志', async ({ page }) => {
  const localeDates: string[][] = [];

  for (const path of ['/', '/en']) {
    await page.goto(path);
    await page.locator('.changelog-trigger:visible').first().click();
    const dialog = page.locator('dialog.changelog-dialog');
    await expect(dialog).toBeVisible();
    const entries = dialog.locator('.changelog-entry');
    expect(await entries.count()).toBeGreaterThan(0);
    await expect(entries.first().locator('h3')).not.toHaveText('');
    await expect(entries.first().locator('.changelog-entry__body')).not.toHaveText('');
    localeDates.push(
      await entries
        .locator('time')
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('datetime') ?? '')
        )
    );
    await dialog.locator('.button-primary').click();
  }

  expect(localeDates[0]).toEqual(localeDates[1]);
});
