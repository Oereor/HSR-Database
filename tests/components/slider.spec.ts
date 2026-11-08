import { expect, test } from '@playwright/test';

test('single slider preserves step, callbacks, external state and disabled behavior', async ({
  page
}) => {
  await page.goto('/slider');
  const slider = page.locator('#fixture-step');
  await expect(slider).toHaveAttribute('data-value', '10');
  await page.getByText('Synthetic stepped level', { exact: true }).click();
  await expect(slider).toBeFocused();
  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('data-value', '12');
  await expect(page.locator('[data-events]')).toHaveText('[12]');
  await page.getByRole('button', { name: 'External update' }).click();
  await expect(slider).toHaveAttribute('data-value', '14');
  await expect(page.locator('[data-events]')).toHaveText('[12]');
  await slider.press('Home');
  await expect(slider).toHaveAttribute('data-value', '0');
  await slider.press('End');
  await expect(slider).toHaveAttribute('data-value', '20');
  await page.getByRole('button', { name: 'Toggle disabled' }).click();
  await expect(slider).toBeDisabled();
  await page.locator('[data-slot="slider-track"]').first().click({ force: true });
  await expect(slider).toHaveAttribute('data-value', '20');
  await expect(page.locator('[data-events]')).toHaveText('[12,0,20]');
});

test('mapped slider announces actual levels and drag emits distinct scalar changes', async ({
  page
}) => {
  await page.goto('/slider');
  const mapped = page.locator('#fixture-index');
  await mapped.press('ArrowRight');
  await expect(mapped).toHaveAttribute('data-value', '2');
  await expect(mapped).toHaveAttribute('aria-valuenow', '7');
  await expect(mapped).toHaveAttribute('aria-valuemin', '2');
  await expect(mapped).toHaveAttribute('aria-valuemax', '10');
  const slider = page.locator('#fixture-step');
  const box = await slider.boundingBox();
  const track = await page.locator('[data-slot="slider-track"]').first().boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(track!.x + track!.width - 1, box!.y + box!.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(slider).toHaveAttribute('data-value', '20');
  const events = JSON.parse(await page.locator('[data-events]').innerText()) as number[];
  expect(events.length).toBeGreaterThan(0);
  expect(events.every((value, index) => value % 2 === 0 && value !== events[index - 1])).toBe(true);
});

test('compact level tracks keep their position and width from level 9 to 10', async ({ page }) => {
  await page.goto('/slider');
  const slider = page.getByRole('slider', { name: 'Synthetic compact level' });
  const track = page.locator('.skill-level-control--compact [data-slot="slider-track"]');
  await expect(slider).toHaveAttribute('aria-valuenow', '9');
  const before = (await track.boundingBox())!;
  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '10');
  const after = (await track.boundingBox())!;
  expect(after.x).toBe(before.x);
  expect(after.width).toBe(before.width);
});

test('touch interaction uses the same controlled scalar value', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 }
  });
  const page = await context.newPage();
  await page.goto('/slider');
  const slider = page.locator('#fixture-step');
  await expect(slider).toHaveAttribute('data-value', '10');
  const box = await page.locator('[data-slot="slider-track"]').first().boundingBox();
  await page.touchscreen.tap(box!.x + box!.width * 0.8, box!.y + box!.height / 2);
  await expect(slider).toHaveAttribute('data-value', '16');
  await expect(page.locator('[data-events]')).toHaveText('[16]');
  const thumb = await slider.boundingBox();
  const client = await context.newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: thumb!.x + thumb!.width / 2, y: thumb!.y + thumb!.height / 2 }]
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: box!.x, y: thumb!.y + thumb!.height / 2 }]
  });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(slider).toHaveAttribute('data-value', '0');
  await expect(page.locator('[data-events]')).toHaveText('[16,0]');
  await context.close();
});
