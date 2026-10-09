import { expect, test } from '@playwright/test';

const ready = (page: import('@playwright/test').Page) =>
  expect(page.locator('#training')).toHaveAttribute('data-training-state', 'ready');
const skillResult = (page: import('@playwright/test').Page, key: string) =>
  page.locator(`[data-training-skill="${key}"]`);

for (const prefix of ['', '/en']) {
  test(`shared canonical skills, preview clamps and default materials (${prefix || 'zh-CN'})`, async ({
    page
  }, testInfo) => {
    const errors: string[] = [];
    const requests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (/\/generated\/(training\/|(?:zh-CN|en)\/materials)/.test(request.url()))
        requests.push(request.url());
    });
    await page.goto(`${prefix}/characters/1510/`);
    await ready(page);
    const groups = page.locator('[data-training-key="1510:0:1510004"]');
    await expect(groups).toHaveCount(2);
    const talent = page.locator(
      '[data-skill-category="talent"] [data-training-key="1510:0:1510004"]'
    );
    const assist = page.locator(
      '[data-skill-category="assist"] [data-training-key="1510:0:1510004"]'
    );
    expect(await talent.locator('label').textContent()).toEqual(
      await assist.locator('label').textContent()
    );
    await expect(talent.getByRole('slider')).toHaveAttribute('aria-valuenow', '10');
    await expect(talent.getByRole('slider')).toHaveAttribute('aria-valuemax', '15');
    const talentDescription = await talent.locator('.levelled-description').textContent();
    const assistDescription = await assist.locator('.levelled-description').textContent();
    await talent.getByRole('slider').fill('11');
    await expect(assist.getByRole('slider')).toHaveAttribute('aria-valuenow', '12');
    await expect(talent.locator('.levelled-description')).not.toHaveText(talentDescription!);
    await expect(assist.locator('.levelled-description')).not.toHaveText(assistDescription!);
    await expect(skillResult(page, '1510:0:1510004')).toHaveAttribute('data-training-level', '10');
    await page.locator('#character-level-1510').fill('60');
    await expect(skillResult(page, '1510:0:1510004')).toHaveAttribute('data-training-level', '6');
    await expect(groups.getByRole('slider').first()).toHaveAttribute('aria-valuenow', '12');
    await expect(
      groups.first().locator('.skill-level-control__value .skill-effect-tag')
    ).toBeVisible();
    const reducedTraces = await page
      .locator('[data-training-trace-count]')
      .getAttribute('data-training-trace-count');
    await page.locator('#character-level-1510').fill('80');
    await expect(skillResult(page, '1510:0:1510004')).toHaveAttribute('data-training-level', '10');
    await expect(
      groups.first().locator('.skill-level-control__value .skill-effect-tag')
    ).toHaveCount(0);
    await expect(page.locator('[data-training-trace-count]')).toHaveAttribute(
      'data-training-trace-count',
      reducedTraces!
    );
    await assist.getByRole('slider').fill('7');
    await expect(talent.getByRole('slider')).toHaveAttribute('aria-valuenow', '8');
    await expect(page.locator('[data-skill-id="151025"], [data-skill-id="151026"]')).toHaveCount(0);
    await expect(page.locator('#training [data-required-exp]')).toHaveAttribute(
      'data-required-exp',
      '5797920'
    );
    await expect(page.locator('#training [data-exp-credits]')).toHaveAttribute(
      'data-exp-credits',
      '579800'
    );
    await expect(page.locator('#training .training-exp [data-material-id="213"]')).toHaveAttribute(
      'data-material-count',
      '289'
    );
    await expect(page.locator('#training .training-exp [data-material-id="212"]')).toHaveAttribute(
      'data-material-count',
      '3'
    );
    await expect(page.locator('#training .training-exp [data-material-id="211"]')).toHaveAttribute(
      'data-material-count',
      '3'
    );
    await expect(page.locator('#training input, #training a, #training button')).toHaveCount(0);
    await expect(page.locator('.section-nav a[href="#training"]')).toHaveCount(1);
    expect(requests).toHaveLength(3);
    expect(new Set(requests).size).toBe(3);
    await expect(page.locator('#training .training-material__icon img').first()).toBeVisible();
    await page.locator('.section-nav a[href="#training"]').click();
    await expect(page).toHaveURL(/#training$/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
    ).toBeLessThanOrEqual(1);
    await page
      .locator('#training')
      .screenshot({ path: testInfo.outputPath(`training-${prefix ? 'en' : 'zh'}.png`) });
    expect(errors).toEqual([]);
  });
}

test('trace toggles follow the DAG and keyboard state, with no level-up restoration', async ({
  page
}) => {
  await page.goto('/characters/1001/');
  await ready(page);
  const toggle = (id: string) => page.locator(`[data-trace-id="${id}"] .trace-toggle`);
  await expect(page.locator('.trace-toggle[aria-pressed="true"]')).toHaveCount(13);
  await toggle('1001201').click();
  await expect(toggle('1001101')).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle('1001102')).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle('1001103')).toHaveAttribute('aria-pressed', 'true');
  await toggle('1001102').focus();
  await page.keyboard.press('Enter');
  await expect(toggle('1001201')).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle('1001102')).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle('1001102')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(toggle('1001102')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#character-level-1001').fill('1');
  const traces = await page.locator('.trace-toggle[aria-pressed="true"]').count();
  await toggle('1001101').click();
  await expect(toggle('1001101')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#traces [role="status"]')).not.toBeEmpty();
  await page.locator('#character-level-1001').fill('80');
  await expect(page.locator('.trace-toggle[aria-pressed="true"]')).toHaveCount(traces);
  await page.goto('/characters/8007/');
  await ready(page);
  await expect(page.locator('[data-trace-id="8007501"] .trace-toggle')).toHaveCount(0);
  await expect(page.locator('[data-trace-id="8007501"]')).toHaveCount(1);
});

test('static stats and costs agree at promotion boundaries; cone rank remains independent', async ({
  page
}) => {
  for (const [category, id] of [
    ['characters', '1001'],
    ['light-cones', '20000']
  ]) {
    await page.goto(`/${category}/${id}/`);
    await ready(page);
    const slider = page.locator(
      category === 'characters' ? '#character-level-1001' : '#light-cone-level-20000'
    );
    for (const [boundary, promotion] of [
      [20, 0],
      [30, 1],
      [40, 2],
      [50, 3],
      [60, 4],
      [70, 5]
    ]) {
      await slider.fill(String(boundary));
      await expect(page.locator('[data-training-promotion]')).toHaveAttribute(
        'data-training-promotion',
        String(promotion)
      );
      const hp = await page.locator('[data-base-stat="hp"] dd').textContent();
      await slider.fill(String(boundary + 1));
      await expect(page.locator('[data-training-promotion]')).toHaveAttribute(
        'data-training-promotion',
        String(promotion + 1)
      );
      await expect(page.locator('[data-base-stat="hp"] dd')).not.toHaveText(hp!);
    }
  }
  await page.goto('/en/light-cones/20000/?level=37&rank=3');
  await ready(page);
  await expect(page.locator('[data-training-level]')).toHaveAttribute('data-training-level', '37');
  const total = await page.locator('#training .training-total').textContent();
  await page.locator('#superimposition-level-20000').fill('4');
  await expect(page.locator('#training .training-total')).toHaveText(total!);
  await page.locator('#light-cone-level-20000').fill('80');
  await expect(page.locator('#training [data-exp-credits]')).toHaveAttribute(
    'data-exp-credits',
    '298750'
  );
  await expect(page.locator('#training .training-total [data-material-id="2"]')).toHaveAttribute(
    'data-material-count',
    '529750'
  );
  await page.locator('#light-cone-level-20000').fill('1');
  await expect(page.locator('#training [data-required-exp]')).toHaveAttribute(
    'data-required-exp',
    '0'
  );
  await expect(page.locator('#training [data-material-id]')).toHaveCount(0);
});

test('delayed cost loading preserves edited level and shared skill previews', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/generated/training/characters/1510.json', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/characters/1510/');
  await expect(page.locator('#training')).toHaveAttribute('data-training-state', 'loading');
  await page.locator('#character-level-1510').fill('60');
  const talent = page.locator('[data-skill-category="talent"] input[type="range"]');
  await talent.fill('11');
  await expect(page.locator('[data-skill-category="assist"] input[type="range"]')).toHaveAttribute(
    'aria-valuenow',
    '12'
  );
  release();
  await ready(page);
  await expect(skillResult(page, '1510:0:1510004')).toHaveAttribute('data-display-level', '12');
  await expect(skillResult(page, '1510:0:1510004')).toHaveAttribute('data-training-level', '6');
  await expect(page.locator('#character-level-1510')).toHaveValue('60');
});

test('load failure exposes retry and retains edits instead of showing zero costs', async ({
  page
}) => {
  let attempts = 0;
  await page.route('**/generated/training/characters/1001.json', async (route) => {
    if (++attempts === 1) await route.fulfill({ status: 503, body: '{}' });
    else await route.continue();
  });
  await page.goto('/characters/1001/');
  await expect(page.locator('#training')).toHaveAttribute('data-training-state', 'error');
  await expect(page.locator('#training [data-material-id]')).toHaveCount(0);
  await page.locator('#character-level-1001').fill('50');
  await page.locator('[data-skill-category="skill"] input').fill('11');
  await page.locator('#training button').click();
  await ready(page);
  await expect(skillResult(page, '1001:0:1001002')).toHaveAttribute('data-display-level', '12');
  await expect(page.locator('#character-level-1001')).toHaveValue('50');
  expect(attempts).toBe(2);
});

test('Profile switches reset skills and traces while keeping the level and rejecting stale loads', async ({
  page
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/generated/training/characters/1102.json', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/characters/1102/?enhanced=0');
  await page.locator('#character-level-1102').fill('60');
  await page.locator('[data-skill-category="skill"] input').fill('11');
  await page.locator('.enhancement-switch').click();
  release();
  await ready(page);
  await expect(page.locator('[data-training-key^="1102:0:"]')).toHaveCount(0);
  await expect(skillResult(page, '1102:1:11102002')).toHaveCount(1);
  await expect(page.locator('[data-skill-category="skill"] input')).toHaveAttribute(
    'aria-valuenow',
    '10'
  );
  await expect(page.locator('#character-level-1102')).toHaveValue('60');
  await page.locator('[data-skill-category="skill"] input').fill('11');
  await page.locator('.enhancement-switch').click();
  await ready(page);
  await expect(page.locator('[data-training-key^="1102:1:"]')).toHaveCount(0);
  await expect(page.locator('[data-skill-category="skill"] input')).toHaveAttribute(
    'aria-valuenow',
    '10'
  );
  await expect(page.locator('#character-level-1102')).toHaveValue('60');
});
