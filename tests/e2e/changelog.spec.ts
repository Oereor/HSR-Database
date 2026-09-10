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

  const dialog = page.getByRole('dialog', { name: '更新日志' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: '更新日志' })).toBeVisible();
  await expect(dialog.getByText('增加了一些 icon', { exact: true })).toBeVisible();
  if (!isMobile) {
    const initialReleaseDate = dialog.locator('time[datetime="2026-09-03"]').first();
    await expect(initialReleaseDate).toBeVisible();
    await expect(initialReleaseDate).toHaveText('2026年9月3日');
  }
  await expect(dialog.getByText('光锥部分包括：', { exact: true })).toBeVisible();

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

test('中文与英文页面加载同一组本地化更新日志', async ({ page }) => {
  const cases = [
    {
      path: '/',
      dialogName: '更新日志',
      title: '「首回合行动值」——新的敌方单位基础属性数据展示',
      body: '大多数敌方单位的此属性值都是 100%',
      date: '2026年9月9日'
    },
    {
      path: '/en',
      dialogName: 'Changelog',
      title: 'New Enemy Stat Display: Initial Action Value',
      body: 'Most enemies have this stat set to 100%',
      date: 'Sep 9, 2026'
    }
  ];

  for (const entry of cases) {
    await page.goto(entry.path);
    await page.getByRole('button', { name: entry.dialogName }).first().click();
    const dialog = page.getByRole('dialog', { name: entry.dialogName });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: entry.title })).toBeVisible();
    await expect(dialog.getByText(entry.body, { exact: false })).toBeVisible();
    await expect(dialog.locator('time[datetime="2026-09-09"]').first()).toHaveText(entry.date);
    await expect(dialog.locator('.changelog-entry')).toHaveCount(6);
    await dialog.getByRole('button', { name: /关闭更新日志|Close changelog/ }).click();
  }
});
