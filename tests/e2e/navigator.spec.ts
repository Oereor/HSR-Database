import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { NAVIGATION_ICON_KEYS } from '../../src/lib/navigation';

const dataRevision = (
  JSON.parse(readFileSync('src/lib/generated/manifest.json', 'utf8')) as { dataRevision: string }
).dataRevision;

for (const prefix of ['', '/en']) {
  test(`desktop sidebar keeps session state and expands search (${prefix || 'zh-CN'})`, async ({
    page,
    isMobile
  }) => {
    test.skip(isMobile, 'Desktop behavior');
    await page.goto(`${prefix}/`);
    await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
    const sidebar = page.locator('[data-slot="sidebar"][data-state]');
    const panel = sidebar.locator('[data-slot="sidebar-container"]');
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed');
    await expect(panel.locator('.primary-navigation a')).toHaveCount(NAVIGATION_ICON_KEYS.length);
    await expect(panel.locator('a[aria-current="page"]')).toHaveAttribute('href', `${prefix}/`);
    for (const key of NAVIGATION_ICON_KEYS)
      await expect(
        panel.locator(`img[src="/generated-assets/navigation/${key}.png"]`)
      ).toBeVisible();
    await page.keyboard.press('Tab');
    await panel.locator(`a[href="${prefix}/characters/"]`).focus();
    await expect(page.getByRole('tooltip')).toBeVisible();
    const before = await page.locator('main').boundingBox();
    await panel.locator('.navigator-toggle').click();
    await expect(sidebar).toHaveAttribute('data-state', 'expanded');
    await expect(panel.locator('#global-search')).toBeVisible();
    await expect(panel.locator('.navigator-pane__snapshot')).toContainText(
      dataRevision.slice(0, 8)
    );
    await expect
      .poll(async () => (await page.locator('main').boundingBox())!.width)
      .toBeLessThan(before!.width);
    await panel.locator(`a[href="${prefix}/characters/"]`).click();
    await expect(page).toHaveURL(new RegExp(`${prefix}/characters/$`));
    await expect(sidebar).toHaveAttribute('data-state', 'expanded');
    await page.reload();
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed');
    await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
    await panel
      .locator('[aria-label]')
      .filter({ has: page.locator('svg.lucide-search') })
      .click();
    await expect(panel.locator('#global-search')).toBeFocused();
    await panel.locator('#global-search').fill('March');
    await panel.locator('#global-search').press('Enter');
    await expect(page).toHaveURL(new RegExp(`${prefix}/search/\\?q=March$`));
    await expect(sidebar).toHaveAttribute('data-state', 'expanded');
    expect(await page.context().cookies()).toEqual([]);
  });

  test(`mobile sheet manages focus and closes after navigation (${prefix || 'zh-CN'})`, async ({
    page,
    isMobile
  }) => {
    test.skip(!isMobile, 'Mobile behavior');
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(`${prefix}/endgame/`);
    await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
    const trigger = page.locator('.mobile-header .navigator-toggle');
    const dialog = page.locator('#primary-navigator-pane');
    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(`a[href="${prefix}/endgame/"]`)).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(dialog.locator('#global-search')).toBeVisible();
    await expect(dialog.locator('.navigator-pane__snapshot')).toContainText(
      dataRevision.slice(0, 8)
    );
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.mouse.click(319, 400);
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog.locator(`a[href="${prefix}/enemies/"]`).click();
    await expect(page).toHaveURL(new RegExp(`${prefix}/enemies/$`));
    await expect(dialog).toBeHidden();
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
    await trigger.click();
    await page.setViewportSize({ width: 900, height: 720 });
    await expect(dialog).toBeHidden();
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
  });
}

test('navigation shell keeps routes, changelog and short viewport controls reachable', async ({
  page
}) => {
  await page.setViewportSize({ width: 900, height: 500 });
  await page.goto('/');
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  const panel = page.locator('[data-slot="sidebar-container"]');
  await panel.locator('a[href="/endgame/"]').click();
  await expect(page).toHaveURL(/\/endgame\/$/);
  await panel.locator('.changelog-trigger').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel.locator('.changelog-trigger')).toBeFocused();
  for (const width of [767, 768, 820, 1280]) {
    await page.setViewportSize({ width, height: 720 });
    await expect(page.locator('.mobile-header')).toBeVisible({ visible: width < 768 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
  }
});
