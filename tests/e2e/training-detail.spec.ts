import { expect, test } from '@playwright/test';

const ready = (page: import('@playwright/test').Page) =>
  expect(page.locator('#training')).toHaveAttribute('data-training-state', 'ready');
const skillResult = (page: import('@playwright/test').Page, key: string) =>
  page.locator(`[data-training-skill="${key}"]`);

for (const prefix of ['', '/en']) {
  test(`training level target uses the Hero state and native keyboard (${prefix || 'zh-CN'})`, async ({
    page
  }) => {
    await page.goto(`${prefix}/characters/1001/`);
    await ready(page);
    const hero = page.locator('#character-level-1001');
    const target = page.locator('#training-character-level-1001');
    const control = page.locator('[data-training-target] > .skill-level-control');
    await expect(control.locator('label')).toHaveAttribute('for', 'training-character-level-1001');
    await hero.fill('20');
    await expect(target).toHaveValue('20');
    await expect(page.locator('.training-result')).toHaveAttribute('data-training-promotion', '0');
    await expect(
      page.locator('[data-training-expense="promotion"] [data-material-id]')
    ).toHaveCount(0);
    const tagAt20 = await control.locator('.skill-effect-tag').textContent();
    await target.focus();
    await page.keyboard.press('ArrowRight');
    await expect(hero).toHaveValue('21');
    await expect(target).toHaveValue('21');
    await expect(page.locator('.training-result')).toHaveAttribute('data-training-promotion', '1');
    await expect(control.locator('.skill-effect-tag')).not.toHaveText(tagAt20!);
    await expect(
      page.locator('[data-training-expense="promotion"] [data-material-id="2"]')
    ).toHaveCount(1);
    await page.keyboard.press('Home');
    await expect(hero).toHaveValue('1');
    await expect(page.locator('[data-training-expense="upgrade"] [data-material-id]')).toHaveCount(
      0
    );
    await expect(
      page.locator('[data-training-expense="promotion"] [data-material-id]')
    ).toHaveCount(0);
    const remaining = await page.locator('[data-training-trace-id]').count();
    await page.keyboard.press('End');
    await expect(hero).toHaveValue('80');
    await expect(page.locator('[data-training-trace-id]')).toHaveCount(remaining);
    await expect(target).toBeFocused();
  });
}

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
    expect(
      await page
        .locator('.section-nav a')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
    ).toEqual([
      '#stats',
      '#skills',
      '#traces',
      '#eidolons',
      '#equipment-recommendation',
      '#training'
    ]);
    expect(
      await page
        .locator('section[id].section-nav-target')
        .evaluateAll((sections) => sections.map((section) => section.id))
    ).toEqual(['skills', 'traces', 'eidolons', 'equipment-recommendation', 'training']);
    const groups = page.locator('#skills [data-training-key="1510:0:1510004"]');
    await expect(groups).toHaveCount(2);
    const target = skillResult(page, '1510:0:1510004');
    await expect(target).toHaveCount(1);
    await expect(target.getByRole('slider')).toHaveAttribute('aria-valuenow', '10');
    await expect(target.getByRole('slider')).toHaveAttribute('aria-valuemax', '15');
    const talent = page.locator(
      '[data-skill-category="talent"] [data-training-key="1510:0:1510004"]'
    );
    const assist = page.locator(
      '[data-skill-category="assist"] [data-training-key="1510:0:1510004"]'
    );
    expect(await talent.locator('label').textContent()).toEqual(
      await assist.locator('label').textContent()
    );
    expect(await target.locator('label').textContent()).toEqual(
      await talent.locator('label').textContent()
    );
    await expect(talent.getByRole('slider')).toHaveAttribute('aria-valuenow', '10');
    await expect(talent.getByRole('slider')).toHaveAttribute('aria-valuemax', '15');
    const talentDescription = await talent.locator('.levelled-description').textContent();
    const assistDescription = await assist.locator('.levelled-description').textContent();
    await talent.getByRole('slider').fill('11');
    await expect(assist.getByRole('slider')).toHaveAttribute('aria-valuenow', '12');
    await expect(target.getByRole('slider')).toHaveAttribute('aria-valuenow', '12');
    await expect(talent.locator('.levelled-description')).not.toHaveText(talentDescription!);
    await expect(assist.locator('.levelled-description')).not.toHaveText(assistDescription!);
    await expect(skillResult(page, '1510:0:1510004')).toHaveAttribute('data-training-level', '10');
    await page.locator('#character-level-1510').fill('60');
    await expect(page.locator('#training-character-level-1510')).toHaveValue('60');
    await expect(target.locator('.skill-effect-tag')).toBeVisible();
    await expect(skillResult(page, '1510:0:1510004')).toHaveAttribute('data-training-level', '6');
    await expect(groups.getByRole('slider').first()).toHaveAttribute('aria-valuenow', '12');
    await expect(
      groups.first().locator('.skill-level-control__value .skill-effect-tag')
    ).toBeVisible();
    const reducedTraces = await page
      .locator('[data-training-trace-count]')
      .getAttribute('data-training-trace-count');
    await page.locator('#training-character-level-1510').fill('80');
    await expect(page.locator('#character-level-1510')).toHaveValue('80');
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
    await expect(target.getByRole('slider')).toHaveAttribute('aria-valuenow', '8');
    const previousTalent = await talent.locator('.levelled-description').textContent();
    const previousAssist = await assist.locator('.levelled-description').textContent();
    await target.getByRole('slider').fill('6');
    await expect(talent.getByRole('slider')).toHaveAttribute('aria-valuenow', '7');
    await expect(assist.getByRole('slider')).toHaveAttribute('aria-valuenow', '7');
    await expect(talent.locator('.levelled-description')).not.toHaveText(previousTalent!);
    await expect(assist.locator('.levelled-description')).not.toHaveText(previousAssist!);
    await expect(target).toHaveAttribute('data-training-level', '7');
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
    await expect(
      page.locator(
        '#training .training-materials input, #training .training-materials a, #training .training-materials button'
      )
    ).toHaveCount(0);
    await expect(page.locator('#training .training-exp [data-material-id="2"]')).toHaveAttribute(
      'data-material-count',
      '579800'
    );
    await expect(page.locator('#training .training-total [data-material-id="2"]')).toHaveCount(1);
    expect(
      await page
        .locator('#training [data-training-expense]')
        .evaluateAll((groups) => groups.map((group) => group.getAttribute('data-training-expense')))
    ).toEqual(['upgrade', 'promotion', 'skill-trace', 'total']);
    const ids = await page
      .locator('[id]')
      .evaluateAll((elements) => elements.map((element) => element.id));
    expect(new Set(ids).size).toBe(ids.length);
    await expect(page.locator('.section-nav a[href="#training"]')).toHaveCount(1);
    expect(requests).toHaveLength(3);
    expect(new Set(requests).size).toBe(3);
    await expect(page.locator('#training .training-material__icon img').first()).toBeVisible();
    await page.locator('.section-nav a[href="#training"]').click();
    await expect(page).toHaveURL(/#training$/);
    await expect(page.locator('.section-nav a[href="#training"]')).toHaveAttribute(
      'aria-current',
      'location'
    );
    await expect(page.locator('#training > .section-heading-shared')).toBeInViewport();
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

for (const prefix of ['', '/en']) {
  test(`delayed trace toggles follow the DAG, costs and keyboard state (${prefix || 'zh-CN'})`, async ({
    page
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/generated/training/characters/1001.json', async (route) => {
      await gate;
      await route.continue();
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(`${prefix}/characters/1001/`);
      await expect(page.locator('#training')).toHaveAttribute('data-training-state', 'loading');
      await expect(page.locator('.trace-toggle')).toHaveCount(0);
      release();
      await ready(page);
      const card = (id: string) => page.locator(`[data-trace-id="${id}"]`);
      const toggle = (id: string) => page.locator(`[data-trace-id="${id}"] .trace-toggle`);
      const count = page.locator('[data-training-trace-count]');
      const credits = page.locator('#training .training-total [data-material-id="2"]');
      const weeklyMaterial = page.locator('#training .training-total [data-material-id="110501"]');
      await expect(page.locator('.trace-toggle[aria-pressed="true"]')).toHaveCount(13);
      await expect(count).toHaveAttribute('data-training-trace-count', '13');
      const initialCredits = Number(await credits.getAttribute('data-material-count'));
      const initialWeeklyMaterial = Number(
        await weeklyMaterial.getAttribute('data-material-count')
      );
      await toggle('1001201').hover();
      await expect(toggle('1001201')).toHaveCSS('cursor', 'pointer');
      await toggle('1001201').click();
      for (const id of [
        '1001201',
        '1001101',
        '1001202',
        '1001203',
        '1001102',
        '1001205',
        '1001206'
      ]) {
        await expect(toggle(id)).toHaveAttribute('aria-pressed', 'false');
        await expect(card(id)).toHaveAttribute('data-training-state', 'inactive');
        await expect(card(id)).toHaveCSS('filter', 'grayscale(1)');
      }
      await expect(toggle('1001103')).toHaveAttribute('aria-pressed', 'true');
      await expect(card('1001103')).toHaveAttribute('data-training-state', 'active');
      await expect(count).toHaveAttribute('data-training-trace-count', '6');
      await expect(
        page.locator(
          '[data-training-trace-id="1001201"], [data-training-trace-id="1001101"], [data-training-trace-id="1001102"]'
        )
      ).toHaveCount(0);
      await expect(page.locator('[data-training-trace-id]')).toHaveCount(6);
      await expect(
        page.locator('.training-traces button, .training-traces a, .training-traces input')
      ).toHaveCount(0);
      await expect(page.locator('[data-training-trace-id="1001103"]')).not.toHaveCSS(
        'cursor',
        'pointer'
      );
      // Sum of the seven removed nodes' real source costs, including both shared branches.
      await expect(credits).toHaveAttribute('data-material-count', String(initialCredits - 86000));
      await expect(weeklyMaterial).toHaveAttribute(
        'data-material-count',
        String(initialWeeklyMaterial - 2)
      );
      const explanation = card('1001101').locator('[data-skill-extra-effects]');
      await explanation.locator('summary').click();
      await expect(explanation).toHaveAttribute('open', '');
      await expect(toggle('1001101')).toHaveAttribute('aria-pressed', 'false');
      await expect(count).toHaveAttribute('data-training-trace-count', '6');
      await explanation.locator('summary').focus();
      await page.keyboard.press('Enter');
      await expect(explanation).not.toHaveAttribute('open', '');
      await expect(toggle('1001101')).toHaveAttribute('aria-pressed', 'false');
      await toggle('1001102').focus();
      await expect(toggle('1001102')).toHaveCSS('outline-style', 'solid');
      await page.keyboard.press('Enter');
      await expect(toggle('1001201')).toHaveAttribute('aria-pressed', 'true');
      await expect(toggle('1001102')).toHaveAttribute('aria-pressed', 'true');
      await expect(card('1001102')).toHaveAttribute('data-training-state', 'active');
      await expect(card('1001102')).toHaveCSS('filter', 'none');
      await expect(toggle('1001102')).toBeFocused();
      await expect(count).toHaveAttribute('data-training-trace-count', '8');
      await expect(page.locator('[data-training-trace-id="1001201"]')).toHaveCount(1);
      await expect(page.locator('[data-training-trace-id="1001102"]')).toHaveCount(1);
      await expect(credits).toHaveAttribute('data-material-count', String(initialCredits - 68000));
      await page.keyboard.press('Space');
      await expect(toggle('1001102')).toHaveAttribute('aria-pressed', 'false');
      await expect(card('1001102')).toHaveAttribute('data-training-state', 'inactive');
      await expect(count).toHaveAttribute('data-training-trace-count', '7');
      await page.locator('#character-level-1001').fill('1');
      await expect(page.locator('.trace-toggle[aria-pressed="true"]')).toHaveCount(1);
      const traces = await page.locator('.trace-toggle[aria-pressed="true"]').count();
      await toggle('1001101').click();
      await expect(toggle('1001101')).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('#traces [role="status"]')).not.toBeEmpty();
      await page.locator('#character-level-1001').fill('80');
      await expect(page.locator('.trace-toggle[aria-pressed="true"]')).toHaveCount(traces);
      await expect(count).toHaveAttribute('data-training-trace-count', String(traces));
      await expect(page.locator('[data-training-trace-id]')).toHaveCount(traces);
      await expect(card('1001101')).toHaveAttribute('data-training-state', 'inactive');
      await page.goto(`${prefix}/characters/8007/`);
      await ready(page);
      await expect(page.locator('[data-trace-id="8007501"] .trace-toggle')).toHaveCount(0);
      await expect(page.locator('[data-training-trace-id="8007501"]')).toHaveCount(0);
      await expect(page.locator('#training [data-training-skill]')).toHaveCount(6);
      await expect(page.locator('[data-trace-id="8007501"]')).toHaveCount(1);
      await expect(page.locator('[data-trace-id="8007501"]')).not.toHaveAttribute(
        'data-training-state'
      );
      await expect(page.locator('[data-trace-id="8007501"]')).not.toHaveCSS('cursor', 'pointer');
      expect(errors).toEqual([]);
    } finally {
      release();
    }
  });
}

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
  expect(
    await page
      .locator('.section-nav a')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
  ).toEqual(['#stats', '#training', '#story']);
  await expect(page.locator('[data-training-level]')).toHaveAttribute('data-training-level', '37');
  await expect(page.locator('#training-light-cone-level-20000')).toHaveValue('37');
  await expect(
    page.locator('#training [data-training-skill], #training .training-traces')
  ).toHaveCount(0);
  expect(
    await page
      .locator('#training [data-training-expense]')
      .evaluateAll((groups) => groups.map((group) => group.getAttribute('data-training-expense')))
  ).toEqual(['upgrade', 'promotion', 'total']);
  const total = await page.locator('#training .training-total').textContent();
  await page.locator('#superimposition-level-20000').fill('4');
  await expect(page.locator('#training .training-total')).toHaveText(total!);
  await page.locator('#training-light-cone-level-20000').fill('80');
  await expect(page.locator('#light-cone-level-20000')).toHaveValue('80');
  await expect(page.locator('#training [data-exp-credits]')).toHaveAttribute(
    'data-exp-credits',
    '298750'
  );
  await expect(page.locator('#training .training-total [data-material-id="2"]')).toHaveAttribute(
    'data-material-count',
    '529750'
  );
  await page.locator('#light-cone-level-20000').fill('1');
  await expect(page.locator('#training-light-cone-level-20000')).toHaveValue('1');
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
  await expect(page.locator('#training input')).toHaveCount(0);
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
  await expect(page.locator('#training-character-level-1510')).toHaveValue('60');
  await expect(skillResult(page, '1510:0:1510004').getByRole('slider')).toHaveAttribute(
    'aria-valuenow',
    '12'
  );
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
  await expect(page.locator('#training input')).toHaveCount(0);
  await page.locator('#character-level-1001').fill('50');
  await page.locator('[data-skill-category="skill"] input').fill('11');
  await page.locator('#training button').click();
  await ready(page);
  await expect(skillResult(page, '1001:0:1001002')).toHaveAttribute('data-display-level', '12');
  await expect(page.locator('#character-level-1001')).toHaveValue('50');
  await expect(page.locator('#training-character-level-1001')).toHaveValue('50');
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
  await expect(skillResult(page, '1102:1:11102002').getByRole('slider')).toHaveAttribute(
    'aria-valuenow',
    '10'
  );
  await expect(page.locator('[data-skill-category="skill"] input')).toHaveAttribute(
    'aria-valuenow',
    '10'
  );
  await expect(page.locator('#character-level-1102')).toHaveValue('60');
  const enhancedTrace = page.locator('[data-trace-id="11102201"] .trace-toggle');
  await expect(enhancedTrace).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-trace-id="1102201"]')).toHaveCount(0);
  await enhancedTrace.click();
  await expect(enhancedTrace).toHaveAttribute('aria-pressed', 'false');
  await page.locator('[data-skill-category="skill"] input').fill('11');
  await page.locator('.enhancement-switch').click();
  await ready(page);
  await expect(page.locator('[data-training-key^="1102:1:"]')).toHaveCount(0);
  await expect(page.locator('[data-skill-category="skill"] input')).toHaveAttribute(
    'aria-valuenow',
    '10'
  );
  await expect(page.locator('#character-level-1102')).toHaveValue('60');
  await expect(page.locator('[data-trace-id="11102201"]')).toHaveCount(0);
  await expect(page.locator('[data-training-trace-id="11102201"]')).toHaveCount(0);
  const baseTrace = page.locator('[data-trace-id="1102201"] .trace-toggle');
  await expect(baseTrace).toHaveAttribute('aria-pressed', 'true');
  await baseTrace.click();
  await expect(baseTrace).toHaveAttribute('aria-pressed', 'false');
  await page.locator('.enhancement-switch').click();
  await ready(page);
  await expect(enhancedTrace).toHaveAttribute('aria-pressed', 'true');
});
