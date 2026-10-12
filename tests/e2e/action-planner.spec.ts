import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const aliases = JSON.parse(readFileSync('data/search/character-player-aliases.json', 'utf8')) as {
  characters: Record<string, { playerAliases: string[] }>;
};

async function selectCharacter(page: Page, index: number, id: string) {
  await page.getByTestId('ally-slot').nth(index).getByTestId('character-trigger').click();
  await page.locator('[data-testid="character-option"][data-character-id="' + id + '"]').click();
  await expect(page.getByTestId('character-selector')).not.toBeVisible();
}

async function configure(page: Page, path = '/game-tools/action-planner/') {
  await page.goto(path);
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  const slots = page.getByTestId('ally-slot');
  await selectCharacter(page, 0, '1001');
  await slots.nth(0).getByTestId('panel-speed').fill('160');
  await selectCharacter(page, 1, '1002');
  await slots.nth(1).getByTestId('panel-speed').fill('134');
  await expect(page.getByTestId('action-node').first()).toHaveAttribute('data-total-av', '62.5');
  return slots;
}

async function chooseType(page: Page, value: string) {
  const editor = page.getByTestId('event-editor');
  if (!(await editor.getByTestId('effect-form').isVisible()))
    await editor.getByTestId('add-effect').click();
  await editor.locator(`[data-testid="effect-type"][data-value="${value}"]`).click();
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
  await selectCharacter(page, 0, '1001');
  await expect(slots.nth(0).getByTestId('base-speed')).toHaveValue('120');
  await expect(slots.nth(0).getByTestId('panel-speed')).toHaveValue('160');
  await selectCharacter(page, 0, '1003');
  expect(await slots.nth(0).getByTestId('panel-speed').inputValue()).toBe(
    await slots.nth(0).getByTestId('base-speed').inputValue()
  );
  await slots.nth(0).getByTestId('panel-speed').fill('160');

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
  await editor.locator(`[data-testid="preset-target"][data-unit-id="${firstUnitId}"]`).click();
  await editor.getByTestId('preset-vonwacq').click();
  await expect(editor.getByTestId('effect-percent')).toHaveValue('40');
  await expect(editor.locator('[data-operation-id]')).toHaveCount(0);
  await editor.getByTestId('submit-effect').click();
  await expect(page.getByTestId('action-node').first()).toHaveAttribute('data-total-av', '37.5');
  await editor.getByTestId('preset-eagle').click();
  await editor.getByTestId('submit-effect').click();
  await editor.getByTestId('preset-dance').click();
  await expect(editor.getByTestId('effect-percent')).toHaveValue('24');
  await expect(editor.locator('[data-testid="effect-target"][aria-pressed="true"]')).toHaveCount(2);
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

test('infinite group speed effects, draft validation, cancellation and orphaned anchors', async ({
  page
}) => {
  const slots = await configure(page);
  const editor = page.getByTestId('event-editor');
  await chooseType(page, 'addSpeedModifier');
  await expect(editor.getByTestId('effect-type')).toHaveCount(4);
  await expect(editor.getByTestId('effect-phase')).toHaveCount(0);
  await expect(editor.locator('select')).toHaveCount(0);
  await editor.getByTestId('targets-all').click();
  await editor.locator('[data-testid="speed-mode"][data-value="percent"]').click();
  await editor.getByTestId('effect-amount').fill('20');
  for (const value of ['0', '-1', '1.5', 'invalid']) {
    await editor.getByTestId('effect-turns').fill(value);
    await editor.getByTestId('submit-effect').click();
    await expect(editor.getByTestId('effect-turns')).toHaveAttribute('aria-invalid', 'true');
    await expect(editor.locator('[data-operation-id]')).toHaveCount(0);
  }
  await editor.getByTestId('effect-turns').fill('');
  await editor.getByTestId('submit-effect').click();
  await expect(editor.locator('[data-operation-id]')).toHaveCount(1);
  await expect(editor.locator('[data-operation-id] .targets .avatar')).toHaveCount(2);
  await editor.getByTestId('edit-effect').click();
  await expect(editor.getByTestId('effect-turns')).toHaveValue('');
  await editor.getByTestId('effect-amount').fill('-20');
  const before = await page.getByTestId('action-node').first().getAttribute('data-total-av');
  await editor.getByTestId('cancel-effect').click();
  await expect(page.getByTestId('action-node').first()).toHaveAttribute('data-total-av', before!);
  await editor.getByTestId('edit-effect').click();
  await expect(editor.getByTestId('effect-amount')).toHaveValue('20');
  await editor.getByTestId('cancel-effect').click();
  await editor.getByTestId('delete-effect').click();
  await expect(page.getByTestId('action-node').first()).toHaveAttribute('data-total-av', '62.5');
  await page.getByTestId('action-node').first().click();
  await chooseType(page, 'advance');
  await editor.getByTestId('targets-all').click();
  await editor.getByTestId('submit-effect').click();
  await selectCharacter(page, 0, '1003');
  await expect(page.getByTestId('unreached-events')).toBeVisible();
  await expect(page.locator('[data-code="unreached-anchor"]')).toBeVisible();
  await page.getByTestId('unreached-events').locator('.text-button').click();
  await expect(editor.locator('[data-operation-id]')).toHaveCount(1);
  await slots.nth(0).getByTestId('panel-speed').fill('0');
  await expect(page.locator('[data-code="invalid-input"]')).toBeVisible();
  await expect(page.getByTestId('action-node')).toHaveCount(0);
  await slots.nth(0).getByTestId('panel-speed').fill('160');
  await expect(page.getByTestId('enemy-slot')).toHaveCount(0);
  await expect(page.getByTestId('add-enemy')).toHaveCount(0);
  await page.getByTestId('view-queue').click();
  await expect(page.getByTestId('queue-unit')).toHaveCount(2);
  await page.getByTestId('reset-plan').click();
  await expect(page.getByTestId('action-node')).toHaveCount(0);
  await expect(slots.nth(0).getByTestId('base-speed')).toHaveCount(0);
});

test('localized entry points, keyboard access and responsive layout', async ({ page }) => {
  await page.goto('/en/game-tools/');
  await page.locator('main a[href="/en/game-tools/action-planner/"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const slot = page.getByTestId('ally-slot').first();
  await slot.getByTestId('character-trigger').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('character-search')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(slot.getByTestId('character-trigger')).toBeFocused();
  await selectCharacter(page, 0, '1001');
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

test('four slots, duplicate prevention, search, removal and selector lifecycle', async ({
  page
}, testInfo) => {
  await page.goto('/game-tools/action-planner/');
  const slots = page.getByTestId('ally-slot');
  await expect(slots).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    await selectCharacter(page, i, String(1001 + i));
    expect(await slots.nth(i).getByTestId('base-speed').inputValue()).toBe(
      await slots.nth(i).getByTestId('panel-speed').inputValue()
    );
    await expect(slots.nth(i).locator('img')).toHaveAttribute(
      'src',
      '/generated-assets/characters/icons/' + (1001 + i) + '.png'
    );
  }
  await page.getByTestId('view-queue').click();
  await expect(page.getByTestId('queue-unit')).toHaveCount(4);
  const oldId = await slots.nth(0).getAttribute('data-unit-id');
  await slots.nth(0).getByTestId('character-trigger').click();
  const selector = page.getByTestId('character-selector');
  await expect(selector.locator('[data-character-id="1002"]')).toBeDisabled();
  await expect(selector.locator('[data-character-id="1001"]')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  const name = await selector.locator('[data-character-id="1001"]').getAttribute('aria-label');
  await page.getByTestId('character-search').fill(name!);
  await expect(selector.locator('[data-character-id="1001"]')).toBeVisible();
  const alias = aliases.characters['1001']?.playerAliases[0];
  if (alias) {
    await page.getByTestId('character-search').fill(alias);
    await expect(selector.locator('[data-character-id="1001"]')).toBeVisible();
  }
  await page.getByTestId('character-search').fill('zz-no-character-987654321');
  await expect(page.getByTestId('character-no-results')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(slots.nth(0).getByTestId('character-trigger')).toBeFocused();
  await slots.nth(0).getByTestId('character-trigger').click();
  await expect(page.getByTestId('character-search')).toHaveValue('');
  await page.mouse.click(0, 0);
  await expect(selector).not.toBeVisible();
  await slots.nth(0).getByTestId('remove-character').click();
  await expect(page.getByTestId('queue-unit')).toHaveCount(3);
  await expect(slots.nth(0).getByTestId('character-trigger')).toBeFocused();
  await selectCharacter(page, 0, '1001');
  expect(await slots.nth(0).getAttribute('data-unit-id')).not.toBe(oldId);
  await expect(page.getByTestId('queue-unit')).toHaveCount(4);
  await slots.nth(0).getByTestId('character-trigger').click();
  const bounds = await selector.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThan(0);
  expect(Math.abs(bounds!.x + bounds!.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(bounds!.height).toBeLessThan(viewport.height);
  await page.screenshot({ path: testInfo.outputPath('character-selector.png'), fullPage: false });
  await page.getByTestId('close-selector').click();
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
});

test('missing square icons remain selectable without loading global search', async ({ page }) => {
  const globalRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/generated\/(zh-CN|en)\/search\.json/.test(request.url()))
      globalRequests.push(request.url());
  });
  await page.route('**/generated-assets/characters/icons/1001.png', (route) => route.abort());
  await page.goto('/game-tools/action-planner/');
  await page.getByTestId('ally-slot').first().getByTestId('character-trigger').click();
  const option = page.locator('[data-testid="character-option"][data-character-id="1001"]');
  await expect(option.locator('[data-image-fallback]')).toBeVisible();
  await option.click();
  await expect(page.getByTestId('action-node').first()).toBeVisible();
  await expect(
    page.getByTestId('action-node').first().locator('[data-image-fallback]')
  ).toBeVisible();
  await expect(
    page.getByTestId('ally-slot').first().locator('[data-image-fallback]')
  ).toBeVisible();
  expect(globalRequests).toEqual([]);
});

for (const locale of ['zh-CN', 'en'] as const) {
  test(`action cards preserve AV, icons, stable selection and summaries (${locale})`, async ({
    page
  }, testInfo) => {
    const slots = await configure(
      page,
      locale === 'en' ? '/en/game-tools/action-planner/' : '/game-tools/action-planner/'
    );
    const first = page.getByTestId('action-node').first();
    const anchor = await first.getAttribute('data-anchor');
    const firstId = await first.getAttribute('data-unit-id');
    const secondId = await slots.nth(1).getAttribute('data-unit-id');
    expect(
      await page
        .getByTestId('action-node')
        .evaluateAll((nodes) => nodes.slice(0, 4).map((node) => node.getAttribute('data-unit-id')))
    ).toEqual([firstId, secondId, firstId, secondId]);
    await expect(first).toHaveAttribute('data-delta-av', '62.5');
    await expect(first.getByTestId('card-av-number')).toHaveText('62.5');
    await expect(first.getByTestId('card-delta-av')).toContainText('+62.5');
    await expect(first.locator('img')).toHaveAttribute(
      'src',
      '/generated-assets/characters/icons/1001.png'
    );
    const iconBounds = await first.locator('.avatar').boundingBox();
    expect(iconBounds!.width).toBe(48);
    expect(iconBounds!.height).toBe(48);
    await expect(page.getByTestId('effect-summary')).toHaveCount(0);
    await expect(page.locator('.sequence .slot-number')).toHaveCount(0);
    await expect(page.getByTestId('start-node').locator('img')).toHaveCount(0);
    expect((await page.getByTestId('start-node').boundingBox())!.height).toBeLessThan(
      (await first.boundingBox())!.height
    );

    await first.focus();
    await page.keyboard.press('Space');
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    const editor = page.getByTestId('event-editor');
    if (!(await editor.getByTestId('effect-form').isVisible()))
      await editor.getByTestId('add-effect').click();
    await editor.getByTestId('targets-all').click();
    await editor.getByTestId('effect-percent').fill('25');
    await editor.getByTestId('submit-effect').click();
    const selected = page.locator(`[data-testid="action-node"][data-anchor="${anchor}"]`);
    await expect(selected.getByTestId('effect-summary')).toHaveAttribute('data-kind', 'advance');
    await expect(selected.getByTestId('effect-summary')).toHaveAttribute('data-count', '1');
    await chooseType(page, 'delay');
    await editor.getByTestId('submit-effect').click();
    await expect(selected.getByTestId('effect-summary')).toHaveAttribute('data-kind', 'mixed');
    await expect(selected.getByTestId('effect-summary')).toHaveAttribute('data-count', '2');
    await slots.nth(1).getByTestId('panel-speed').fill('200');
    await expect(page.getByTestId('action-node').first()).toHaveAttribute(
      'data-unit-id',
      secondId!
    );
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await expect(editor.locator('[data-operation-id]')).toHaveCount(2);
    await editor.locator('[data-operation-id]').first().getByTestId('delete-effect').click();
    await expect(selected.getByTestId('effect-summary')).toHaveAttribute('data-kind', 'delay');
    await editor.locator('[data-operation-id]').first().getByTestId('delete-effect').click();
    await expect(selected.getByTestId('effect-summary')).toHaveCount(0);
    const overflow = await page
      .locator('.sequence')
      .evaluate((node) => node.scrollWidth > node.clientWidth + 1);
    expect(overflow).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath(`action-cards-${locale}.png`),
      fullPage: true
    });
  });
}

test('queue cards distinguish speed states, select next anchors and preserve stepping', async ({
  page
}, testInfo) => {
  await configure(page);
  const editor = page.getByTestId('event-editor');
  await chooseType(page, 'addSpeedModifier');
  if (!(await editor.getByTestId('effect-form').isVisible()))
    await editor.getByTestId('add-effect').click();
  await editor.getByTestId('targets-all').click();
  await editor.getByTestId('effect-amount').fill('20');
  await editor.getByTestId('effect-turns').fill('2');
  await editor.getByTestId('submit-effect').click();
  await expect(page.getByTestId('start-node').getByTestId('effect-summary')).toHaveAttribute(
    'data-kind',
    'speed'
  );
  const futureAnchor = await page.getByTestId('action-node').first().getAttribute('data-anchor');
  const nextAV = await page.getByTestId('action-node').first().getAttribute('data-total-av');
  await page.getByTestId('view-queue').click();
  const first = page.getByTestId('queue-unit').first();
  await expect(first).toHaveAttribute('data-anchor', futureAnchor!);
  await expect(first).toHaveAttribute('data-remaining-av', nextAV!);
  expect(await first.getAttribute('data-total-av')).toBeNull();
  await expect(first.getByTestId('card-av-number')).toHaveText(
    new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format(Number(nextAV))
  );
  await expect(first.getByTestId('card-remaining-label')).toBeVisible();
  await expect(first.getByTestId('card-delta-av')).toHaveCount(0);
  await expect(first.getByTestId('effect-summary')).toHaveCount(0);
  const states = page.getByTestId('queue-speed-states').first();
  await states.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(states).toHaveAttribute('open', '');
  await expect(states.locator('.speed-state')).toBeVisible();
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(editor.locator('[data-operation-id]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('queue-cards.png'), fullPage: true });
  await page.getByTestId('queue-next').click();
  await expect(page.getByTestId('queue-status')).toHaveAttribute('data-total-av', nextAV!);
  await expect(page.getByTestId('queue-unit')).toHaveCount(2);
  const values = await page
    .getByTestId('queue-unit')
    .evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute('data-remaining-av'))));
  expect(values).toEqual([...values].sort((a, b) => a - b));
  await page.getByTestId('queue-previous').click();
  await expect(page.getByTestId('queue-status')).toHaveAttribute('data-step', '0');
  await page.getByTestId('view-predict').click();
  await page.getByTestId('start-node').click();
  await chooseType(page, 'immediatelyAct');
  if (!(await editor.getByTestId('effect-form').isVisible()))
    await editor.getByTestId('add-effect').click();
  await editor.getByTestId('targets-all').click();
  await editor.getByTestId('submit-effect').click();
  await expect(page.getByTestId('action-node').first()).toHaveAttribute('data-delta-av', '0');
  await expect(page.getByTestId('action-node').first().getByTestId('card-delta-av')).toContainText(
    '+0'
  );
});

test('queue anchors beyond the budget remain editable without fabricated preview state', async ({
  page
}) => {
  await configure(page);
  await page.getByTestId('max-actions').fill('1');
  await page.getByTestId('view-queue').click();
  // At step zero, the second unit's first action lies beyond the one-action budget.
  await page.getByTestId('queue-unit').nth(1).click();
  const anchor = await page.getByTestId('queue-unit').nth(1).getAttribute('data-anchor');
  const editor = page.getByTestId('event-editor');
  if (!(await editor.getByTestId('effect-form').isVisible()))
    await editor.getByTestId('add-effect').click();
  await editor.getByTestId('targets-all').click();
  await editor.getByTestId('submit-effect').click();
  await expect(page.getByTestId('unreached-events')).toBeVisible();
  await expect(page.locator(`[data-testid="queue-unit"][data-anchor="${anchor}"]`)).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(editor.locator('[data-operation-id]')).toHaveCount(1);
  await editor.getByTestId('edit-effect').click();
  await expect(
    editor.locator('[data-testid="effect-type"][data-value="removeSpeedModifier"]')
  ).toHaveCount(0);
  await expect(editor.getByTestId('effect-phase')).toHaveCount(2);
});

for (const locale of ['zh-CN', 'en'] as const) {
  test(`Inspector windows, keyboard targets, stage sorting and stable queue replay (${locale})`, async ({
    page
  }, testInfo) => {
    const slots = await configure(
      page,
      locale === 'en' ? '/en/game-tools/action-planner/' : '/game-tools/action-planner/'
    );
    await selectCharacter(page, 0, '1306');
    await slots.nth(0).getByTestId('panel-speed').fill('160');
    const firstId = await slots.nth(0).getAttribute('data-unit-id');
    const firstAnchor = await page.getByTestId('action-node').first().getAttribute('data-anchor');
    const second = page.locator(
      `[data-testid="action-node"][data-unit-id="${firstId}"][data-turn="2"]`
    );
    await page.getByTestId('action-node').first().click();
    const editor = page.getByTestId('event-editor');
    await chooseType(page, 'advance');
    // Direct avatar multi-select, including keyboard activation, creates one group card.
    const target = editor.getByTestId('effect-target').nth(1);
    await target.focus();
    await page.keyboard.press('Space');
    await expect(target).toHaveAttribute('aria-pressed', 'true');
    await editor.getByTestId('effect-percent').fill('24');
    await editor.getByTestId('submit-effect').click();
    await expect(editor.locator('[data-operation-id]')).toHaveCount(1);
    await expect(editor.locator('[data-operation-id] .avatar')).toHaveCount(2);
    await expect(second).toHaveAttribute('data-total-av', '125');
    await editor.getByTestId('edit-effect').click();
    await editor.locator('[data-testid="effect-phase"][data-value="postAction"]').click();
    await expect(second).toHaveAttribute('data-total-av', '125');
    await editor.getByTestId('cancel-effect').click();
    await expect(editor.locator('[data-phase-group="preAction"] [data-operation-id]')).toHaveCount(
      1
    );
    await editor.getByTestId('edit-effect').click();
    await editor.locator('[data-testid="effect-phase"][data-value="postAction"]').click();
    await editor.getByTestId('submit-effect').click();
    await expect(editor.locator('[data-phase-group="postAction"] [data-operation-id]')).toHaveCount(
      1
    );
    await expect(second).toHaveAttribute('data-total-av', '110');
    await expect(
      page.locator(`[data-testid="action-node"][data-anchor="${firstAnchor}"]`)
    ).toHaveAttribute('aria-pressed', 'true');

    await chooseType(page, 'delay');
    await editor.locator('[data-testid="effect-phase"][data-value="postAction"]').click();
    await editor.getByTestId('effect-percent').fill('10');
    await editor.getByTestId('submit-effect').click();
    await expect(second).toHaveAttribute('data-total-av', '116.25');
    const post = editor.locator('[data-phase-group="postAction"] [data-operation-id]');
    const id = await post.first().getAttribute('data-operation-id');
    await post.last().getByTestId('move-effect-up').click();
    await expect(post.last()).toHaveAttribute('data-operation-id', id!);
    await expect(post.first().getByTestId('move-effect-up')).toBeDisabled();
    await post.first().getByTestId('delete-effect').click();
    await expect(second).toHaveAttribute('data-total-av', '110');

    await page.getByTestId('view-queue').click();
    await page.getByTestId('queue-next').click();
    await page.getByTestId('queue-next').click();
    await expect(page.getByTestId('queue-status')).toHaveAttribute('data-step', '2');
    // b's pre-action effect modifies Sparkle's next gauge without creating another unit.
    await chooseType(page, 'advance');
    await editor.getByTestId('effect-percent').fill('100');
    await editor.locator('[data-testid="effect-phase"][data-value="preAction"]').click();
    await editor.getByTestId('submit-effect').click();
    await expect(page.getByTestId('queue-unit')).toHaveCount(2);
    await expect(page.getByTestId('queue-status')).toHaveAttribute('data-step', '2');
    await editor.getByTestId('edit-effect').click();
    await expect(editor.getByTestId('effect-form')).toHaveAttribute('data-mode', 'edit');
    await expect(editor.getByTestId('effect-target').first()).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await slots.nth(1).getByTestId('panel-speed').fill('200');
    // The completed b:1 cursor follows its anchor when it becomes the first action.
    await expect(page.getByTestId('queue-status')).toHaveAttribute('data-step', '1');
    await expect(editor.getByTestId('effect-form')).toHaveAttribute('data-mode', 'edit');
    await expect(page.getByTestId('queue-unit')).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath(`inspector-${locale}.png`), fullPage: true });
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
  });
}

for (const locale of ['zh-CN', 'en'] as const) {
  test(`preset cards preserve draft-only selection and responsive equipment layout (${locale})`, async ({
    page
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const slots = await configure(
      page,
      locale === 'en' ? '/en/game-tools/action-planner/' : '/game-tools/action-planner/'
    );
    await slots.nth(0).getByTestId('panel-speed').fill('100');
    const firstId = await slots.nth(0).getAttribute('data-unit-id');
    const secondId = await slots.nth(1).getAttribute('data-unit-id');
    const editor = page.getByTestId('event-editor');
    const panel = editor.locator('.presets');
    await panel.locator('summary').click();
    const cards = panel.locator('.compact-entity-card');
    await expect(cards).toHaveCount(3);
    await expect(
      panel.locator('a, .compact-entity-card__tertiary, .compact-entity-card__arrow, .rarity-stars')
    ).toHaveCount(0);
    await expect(panel.getByTestId('preset-superimposition')).toHaveCount(0);
    await expect(panel.locator('.helper')).toHaveCount(0);

    for (const [kind, src] of [
      ['vonwacq', '/generated-assets/relics/icons/308.png'],
      ['eagle', '/generated-assets/relics/icons/110.png'],
      ['dance', '/generated-assets/light-cones/preview/21018.png']
    ]) {
      const card = panel.getByTestId(`preset-${kind}`);
      expect(await card.evaluate((element) => element.tagName)).toBe('BUTTON');
      await expect(card).toHaveAttribute('type', 'button');
      await expect(card).toHaveAttribute('aria-pressed', 'false');
      await expect(card.locator('img')).toHaveAttribute('src', src);
      await expect(card.locator('.compact-entity-card__title')).not.toHaveText('');
      await expect(card.locator('.compact-entity-card__secondary')).not.toHaveText('');
      const titleFits = await card
        .locator('.compact-entity-card__title')
        .evaluate((element) => element.scrollHeight <= element.clientHeight + 1);
      expect(titleFits).toBe(true);
    }
    const before = await page.getByTestId('action-node').first().getAttribute('data-total-av');

    // Selecting a preset target remains independent of the ordinary target multi-select.
    await panel.locator(`[data-testid="preset-target"][data-unit-id="${firstId}"]`).click();
    const vonwacq = panel.getByTestId('preset-vonwacq');
    await expect(vonwacq).toBeEnabled();
    await vonwacq.focus();
    await page.keyboard.press('Enter');
    await expect(vonwacq).toHaveAttribute('aria-pressed', 'true');
    await expect(editor.getByTestId('effect-percent')).toHaveValue('40');
    await expect(
      editor.locator(`[data-testid="effect-target"][data-unit-id="${firstId}"]`)
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(editor.locator('[data-operation-id]')).toHaveCount(0);
    await expect(page.getByTestId('action-node').first()).toHaveAttribute('data-total-av', before!);
    await editor.getByTestId('cancel-effect').click();
    await expect(vonwacq).toHaveAttribute('aria-pressed', 'false');

    await panel.locator(`[data-testid="preset-target"][data-unit-id="${secondId}"]`).click();
    const eagle = panel.getByTestId('preset-eagle');
    await eagle.click();
    await expect(eagle).toHaveAttribute('aria-pressed', 'true');
    await expect(editor.getByTestId('effect-percent')).toHaveValue('25');
    await expect(
      editor.locator(`[data-testid="effect-target"][data-unit-id="${secondId}"]`)
    ).toHaveAttribute('aria-pressed', 'true');
    await editor.getByTestId('cancel-effect').click();

    const dance = panel.getByTestId('preset-dance');
    await dance.focus();
    await page.keyboard.press('Space');
    await expect(dance).toHaveAttribute('aria-pressed', 'true');
    await expect(editor.getByTestId('effect-percent')).toHaveValue('24');
    await expect(editor.locator('[data-testid="effect-target"][aria-pressed="true"]')).toHaveCount(
      2
    );
    await expect(editor.locator('[data-operation-id]')).toHaveCount(0);
    // Editing the filled draft must still allow arbitrary ordinary advance values.
    await editor.getByTestId('effect-percent').fill('18');
    await editor.getByTestId('submit-effect').click();
    await expect(dance).toHaveAttribute('aria-pressed', 'false');
    await expect(editor.locator('[data-operation-id]')).toHaveCount(1);
    await editor.getByTestId('edit-effect').click();
    await expect(editor.getByTestId('effect-percent')).toHaveValue('18');
    await expect(dance).toHaveAttribute('aria-pressed', 'false');
    await editor.getByTestId('cancel-effect').click();
    await dance.click();
    await expect(editor.getByTestId('effect-percent')).toHaveValue('24');
    await expect(editor.locator('[data-operation-id]')).toHaveCount(1);
    await editor.getByTestId('cancel-effect').click();

    // Icon failures keep both information levels and button semantics.
    await dance.locator('img').evaluate((image) => image.dispatchEvent(new Event('error')));
    await expect(dance.locator('[data-image-fallback]')).toBeVisible();
    await expect(dance).toBeEnabled();
    await expect(dance.locator('.compact-entity-card__title')).toBeVisible();
    const fits = await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
    expect(fits).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`preset-cards-${locale}.png`),
      fullPage: true
    });

    await page.getByTestId('action-node').first().click();
    await editor.locator('.presets summary').click();
    await expect(editor.getByTestId('preset-vonwacq')).toBeDisabled();
    await expect(editor.getByTestId('preset-eagle')).toBeEnabled();
    await expect(editor.getByTestId('preset-dance')).toBeEnabled();
    expect(errors).toEqual([]);
  });
}
