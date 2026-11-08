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
    await expect(panel.locator('.navigator-snapshot')).toHaveAttribute('role', 'status');
    await expect(panel.locator('button.navigator-snapshot')).toHaveCount(0);
    const before = await page.locator('main').boundingBox();
    await page.locator('[data-slot="sidebar-trigger"]').click();
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
    const submit = panel.locator('.search-bar button[type="submit"]');
    await submit.hover();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await expect(submit).not.toHaveAttribute('title');
    await submit.click();
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
    const trigger = page.locator('[data-slot="sidebar-trigger"]');
    const dialog = page.locator('[role="dialog"]#primary-navigator-pane');
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
    const changelog = dialog.locator('.changelog-trigger');
    await changelog.click();
    await expect(page.locator('.changelog-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.changelog-dialog')).toBeHidden();
    await expect(changelog).toBeFocused();
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
    await expect(page.locator('[data-slot="sidebar-trigger"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="sidebar-trigger"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
  }
});

test('sidebar animation keeps rows stable and reveals the title only after width settles', async ({
  page,
  isMobile
}) => {
  test.skip(isMobile, 'Desktop width animation');
  await page.goto('/');
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  const trigger = page.locator('[data-slot="sidebar-trigger"]');
  const panel = page.locator('[data-slot="sidebar-container"]');
  const title = panel.locator('.navigator-brand-title');
  const sample = () =>
    page.evaluate(() => {
      const panel = document.querySelector('[data-slot="sidebar-container"]')!;
      const frames: { width: number; y: number; height: number; visibility: string }[] = [];
      const record = () => {
        frames.push({
          width: panel.getBoundingClientRect().width,
          y: panel.querySelector('.primary-navigation a')!.getBoundingClientRect().top,
          height: panel.querySelector('.navigator-brand')!.getBoundingClientRect().height,
          visibility: getComputedStyle(panel.querySelector('.navigator-brand-title')!).visibility
        });
        if (!(window as any).stopSidebarFrames) requestAnimationFrame(record);
      };
      (window as any).stopSidebarFrames = false;
      (window as any).sidebarFrames = frames;
      requestAnimationFrame(record);
    });
  await sample();
  await trigger.click();
  await expect(title).toBeVisible();
  const expanded = (await panel.boundingBox())!.width;
  const frames = await page.evaluate(() => {
    (window as any).stopSidebarFrames = true;
    return (window as any).sidebarFrames as {
      width: number;
      y: number;
      height: number;
      visibility: string;
    }[];
  });
  const moving = frames.filter((f) => f.width > 65 && f.width < expanded - 1);
  expect(moving.length).toBeGreaterThan(0);
  expect(moving.every((f) => f.visibility === 'hidden')).toBe(true);
  expect(
    Math.max(...frames.map((f) => f.y)) - Math.min(...frames.map((f) => f.y))
  ).toBeLessThanOrEqual(1);
  expect(new Set(frames.map((f) => f.height)).size).toBe(1);
  await expect(title).toHaveCSS('white-space', 'nowrap');
  const current = panel.locator('.primary-navigation [aria-current="page"]');
  await expect(current).toHaveCSS('border-top-width', '1px');
  const selectedBorder = await current.evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(await current.evaluate((el) => getComputedStyle(el).borderColor)).not.toBe(
    await panel
      .locator('.primary-navigation a:not([aria-current])')
      .first()
      .evaluate((el) => getComputedStyle(el).borderColor)
  );
  await trigger.click();
  await expect(title).toHaveCSS('visibility', 'hidden');
  await expect(current).toHaveCSS('border-top-color', selectedBorder);
  await page.waitForFunction(
    () =>
      document.querySelector('[data-slot="sidebar-container"]')!.getBoundingClientRect().width < 100
  );
  await trigger.click();
  await page.waitForFunction(() => {
    const w = document
      .querySelector('[data-slot="sidebar-container"]')!
      .getBoundingClientRect().width;
    return w > 80 && w < 290;
  });
  await trigger.evaluate((el) => {
    (el as HTMLButtonElement).click();
    requestAnimationFrame(() => (el as HTMLButtonElement).click());
  });
  await expect(title).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await trigger.click();
  await expect(title).toBeHidden();
  await panel.locator('.navigator-search button').click();
  await expect(panel.locator('#global-search')).toBeFocused();
  await expect(title).toBeVisible();
});
