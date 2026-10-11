import { expect, test, type Page } from '@playwright/test';

async function configure(page: Page, path = '/game-tools/action-planner/') {
  await page.goto(path);
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  const slots = page.getByTestId('ally-slot');
  await slots.nth(0).getByTestId('character-select').selectOption('1001');
  await slots.nth(0).getByTestId('panel-speed').fill('160');
  await slots.nth(1).getByTestId('character-select').selectOption('1002');
  await slots.nth(1).getByTestId('panel-speed').fill('134');
  await expect(page.getByTestId('action-node').first()).toHaveAttribute('data-total-av', '62.5');
  return slots;
}

test('real characters, independent speeds, presets, ordered editing and queue stepping', async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const slots = await configure(page);
  await expect(slots.nth(0).getByTestId('base-speed')).toHaveValue('101');
  await slots.nth(0).getByTestId('base-speed').fill('120');
  await expect(slots.nth(0).getByTestId('panel-speed')).toHaveValue('160');
  await slots.nth(0).getByTestId('character-select').selectOption('1002');
  await expect(slots.nth(0).getByTestId('base-speed')).toHaveValue('110');
  await expect(slots.nth(0).getByTestId('panel-speed')).toHaveValue('160');

  const firstUnitId = await page.getByTestId('action-node').first().getAttribute('data-unit-id');
  await page.getByTestId('view-queue').click();
  await expect(page.getByTestId('queue-unit')).toHaveCount(2);
  await expect(page.getByTestId('queue-unit').first()).toHaveAttribute(
    'data-unit-id',
    firstUnitId!
  );
  await page.getByTestId('queue-next').click();
  await expect(page.getByTestId('queue-status')).toHaveAttribute('data-total-av', '62.5');
  await page.getByTestId('queue-previous').click();
  await expect(page.getByTestId('queue-status')).toHaveAttribute('data-step', '0');
  await page.getByTestId('view-predict').click();
  await page.getByTestId('start-node').click();

  const editor = page.getByTestId('event-editor');
  await editor.locator('.presets summary').click();
  await editor.getByTestId('preset-target').selectOption(firstUnitId!);
  await editor.getByTestId('preset-vonwacq').click();
  await expect(editor.getByTestId('effect-percent')).toHaveValue('40');
  await expect(editor.locator('[data-operation-id]')).toHaveCount(0);
  await editor.getByTestId('submit-effect').click();
  await expect(page.getByTestId('action-node').first()).toHaveAttribute('data-total-av', '37.5');
  await editor.getByTestId('preset-eagle').click();
  await editor.getByTestId('submit-effect').click();
  await editor.getByTestId('preset-superimposition').selectOption('5');
  await editor.getByTestId('preset-dance').click();
  await expect(editor.getByTestId('effect-percent')).toHaveValue('24');
  await expect(editor.getByTestId('target-kind')).toHaveValue('allies');
  await editor.getByTestId('submit-effect').click();
  const ops = editor.locator('[data-operation-id]');
  await expect(ops).toHaveCount(3);
  const oldFirst = await ops.first().getAttribute('data-operation-id');
  await ops.nth(1).getByTestId('move-effect-up').click();
  await expect(ops.nth(1)).toHaveAttribute('data-operation-id', oldFirst!);
  await ops.first().getByTestId('edit-effect').click();
  await editor.getByTestId('effect-percent').fill('10');
  await editor.getByTestId('submit-effect').click();
  await ops.last().getByTestId('delete-effect').click();
  await expect(ops).toHaveCount(2);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('action-planner.png'), fullPage: true });
});

test('same-node speed removal, explicit multi-targets, orphaned anchors and input errors', async ({
  page
}) => {
  const slots = await configure(page);
  const editor = page.getByTestId('event-editor');
  await editor.getByTestId('effect-type').selectOption('addSpeedModifier');
  await editor.getByTestId('target-kind').selectOption('multiple');
  await editor.locator('fieldset input[type="checkbox"]').nth(0).check();
  await editor.locator('fieldset input[type="checkbox"]').nth(1).check();
  await editor.getByTestId('speed-mode').selectOption('percent');
  await editor.getByTestId('effect-amount').fill('20');
  await editor.getByTestId('submit-effect').click();
  await editor.getByTestId('effect-type').selectOption('removeSpeedModifier');
  await expect(editor.getByTestId('buff-instance')).toHaveCount(2);
  await editor.getByTestId('buff-instance').first().check();
  await editor.getByTestId('submit-effect').click();
  await expect(editor.locator('[data-operation-id]')).toHaveCount(2);
  await page.getByTestId('action-node').first().click();
  await editor.getByTestId('effect-type').selectOption('advance');
  await editor.getByTestId('target-kind').selectOption('allies');
  await editor.getByTestId('submit-effect').click();
  await slots.nth(0).getByTestId('character-select').selectOption('1003');
  await expect(page.getByTestId('unreached-events')).toBeVisible();
  await expect(page.locator('[data-code="unreached-anchor"]')).toBeVisible();
  await page.getByTestId('unreached-events').locator('.text-button').click();
  await expect(editor.locator('[data-operation-id]')).toHaveCount(1);
  await slots.nth(0).getByTestId('panel-speed').fill('0');
  await expect(page.locator('[data-code="invalid-input"]')).toBeVisible();
  await expect(page.getByTestId('action-node')).toHaveCount(0);
  await slots.nth(0).getByTestId('panel-speed').fill('160');
  await page.getByTestId('add-enemy').click();
  await page.getByTestId('enemy-speed').fill('110');
  await page.getByTestId('view-queue').click();
  await expect(page.getByTestId('queue-unit')).toHaveCount(3);
  await page.getByTestId('reset-plan').click();
  await expect(page.getByTestId('action-node')).toHaveCount(0);
  await expect(slots.nth(0).getByTestId('character-select')).toHaveValue('');
});

test('localized entry points, manual units, keyboard access and responsive layout', async ({
  page
}) => {
  await page.goto('/en/game-tools/');
  await page.locator('main a[href="/en/game-tools/action-planner/"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const slot = page.getByTestId('ally-slot').first();
  await slot.getByTestId('character-select').selectOption('manual');
  await slot.getByTestId('unit-name').fill('Synthetic unit');
  await slot.getByTestId('base-speed').fill('100');
  await slot.getByTestId('panel-speed').fill('134');
  await expect(page.getByTestId('action-node').first()).toHaveAttribute(
    'data-total-av',
    String(10000 / 134)
  );
  await page.getByTestId('start-node').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('event-editor')).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
  await page.locator('.settings-trigger').click();
  await page.locator('.language-segments a:not([href^="/en/"])').click();
  await expect(page).toHaveURL(/\/game-tools\/action-planner\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
});
