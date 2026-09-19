import { expect, test } from '@playwright/test';

test('Enemy Detail 中英文直达均恢复 compact stats', async ({ page }) => {
  for (const detailPath of ['/enemies/8034010/', '/en/enemies/8034010/'] as const) {
    await page.goto(detailPath);
    await expect(page).toHaveURL(new RegExp(`${detailPath}$`));
    await expect(page.getByRole('slider')).toHaveValue('95');
    await expect(page.locator('[data-enemy-stat]')).toHaveCount(7);
    await expect(page.locator('[data-enemy-stat="hp"]')).toContainText('657,149');
  }
});

test('Enemy Detail Hero 复用统一分栏并仅展示 Template 基础数据', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/enemies/1004014/');

  const backLink = page.locator('a[href="/enemies/"]').first();
  await expect(backLink).toHaveAttribute('href', '/enemies/');
  const hero = page.locator('[data-enemy-hero]');
  await expect(hero).toBeVisible();
  await expect(hero.locator('.kicker')).toContainText('1004014');
  await expect(hero.locator('.enemy-template-stats-panel h2')).toBeVisible();
  await expect(hero.getByRole('slider')).toHaveCount(0);
  await expect(page.locator('#enemy-level-1004014')).toHaveCount(1);
  const stats = hero.locator('[data-enemy-template-stat]');
  await expect(stats).toHaveCount(8);
  await expect(hero.locator('dl.inspection-stat-list')).toHaveCount(1);
  await expect(hero.locator('.inspection-stat-row')).toHaveCount(8);
  expect(
    await stats.evaluateAll((rows) =>
      Object.fromEntries(
        rows.map((row) => [
          row.getAttribute('data-enemy-template-stat'),
          row.querySelector('dd')?.textContent?.trim()
        ])
      )
    )
  ).toEqual({
    hp: '5,813',
    attack: '18',
    defence: '210',
    speed: '130',
    toughness: '100',
    'critical-damage': '20%',
    'effect-resistance': '30%',
    'initial-action-value': '20%'
  });
  await expect(hero.locator('[data-enemy-portrait]')).toHaveAttribute(
    'data-artwork-fit',
    'contain'
  );
  await expect(hero.locator('[data-enemy-portrait] img')).toHaveCSS('object-fit', 'contain');
});

test('Enemy Detail Hero 本地化 raw rank 而不泄露内部值', async ({ page }) => {
  for (const [id, raw] of [
    ['1002011', 'MinionLv2'],
    ['1003012', 'Elite'],
    ['1004014', 'LittleBoss']
  ]) {
    await page.goto(`/enemies/${id}/`);
    const hero = page.locator('[data-enemy-hero]');
    const rank = hero.locator('.enemy-rank-tag');
    await expect(rank).not.toHaveText('');
    await expect(hero.locator('[data-icon-presentation="path-identity"]')).toHaveCount(0);
    await expect(hero).not.toContainText(raw);
  }
});

test('Enemy Detail Hero 对缺失 Template 字段保留固定行', async ({ page }) => {
  await page.goto('/enemies/3004010/');
  const missingValue = page.locator('[data-enemy-template-stat="speed"] dd');
  await expect(missingValue).not.toHaveText('');
  await expect(page.locator('[data-enemy-template-stat="toughness"] dd')).toHaveText(
    (await missingValue.textContent())!
  );

  await page.goto('/enemies/1005010/');
  await expect(page.locator('[data-enemy-template-stat="effect-resistance"] dd')).not.toHaveText(
    ''
  );
  await expect(page.locator('[data-enemy-template-stat]')).toHaveCount(8);

  await page.goto('/enemies/3002040/');
  await expect(page.locator('[data-enemy-template-stat="initial-action-value"] dd')).not.toHaveText(
    ''
  );
});

test('Enemy Detail 将首回合行动值比例格式化为百分比', async ({ page }) => {
  await page.goto('/enemies/1002011/');
  await expect(page.locator('[data-enemy-template-stat="initial-action-value"]')).toContainText(
    '100%'
  );

  await page.goto('/enemies/4014022/');
  await expect(page.locator('[data-enemy-template-stat="initial-action-value"]')).toContainText(
    '50%'
  );
});

test('Enemy Detail 默认选择 canonical Monster，切换 concrete Monster 时共享等级不重置', async ({
  page
}) => {
  await page.goto('/enemies/1002015/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const options = page.locator('[data-monster-option]');
  await expect(options).toHaveCount(11);
  const canonical = page.locator('[data-monster-option="1002015"]');
  const quantumVariant = page.locator('[data-monster-option="100201506"]');
  await expect(canonical).toHaveAttribute('aria-checked', 'true');

  const slider = page.locator('#enemy-level-1002015');
  await expect(slider).toHaveValue('95');
  await slider.fill('60');
  const canonicalHp = await page.locator('[data-enemy-stat="hp"] strong').textContent();
  await quantumVariant.click();
  await expect(quantumVariant).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.enemy-selected-monster-heading')).toContainText('#100201506');
  await expect(slider).toHaveValue('60');
  await expect(page.locator('[data-enemy-stat="hp"] strong')).not.toHaveText(canonicalHp ?? '');

  const weaknesses = page.locator(
    '.enemy-battle-column--attributes .enemy-weakness-list [data-icon-kind="element"]'
  );
  expect((await weaknesses.allTextContents()).map((text) => text.trim())).toEqual(['火', '量子']);

  await quantumVariant.focus();
  await page.keyboard.press('Home');
  await expect(canonical).toBeFocused();
  await expect(canonical).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(options.nth(1)).toBeFocused();
  await expect(options.nth(1)).toHaveAttribute('aria-checked', 'true');
});

test('单 Monster 页面省略 selector，仍展示共享等级与七项实际属性', async ({ page }) => {
  await page.goto('/enemies/1004011/');
  await expect(page.locator('[data-monster-option]')).toHaveCount(0);
  await expect(page.locator('.enemy-selected-monster-heading')).toContainText('#1004011');
  await expect(page.locator('[data-enemy-stat]')).toHaveCount(7);
  await expect(page.locator('#enemy-level-1004011')).toHaveValue('95');
  await expect(page.locator('.enemy-stats-panel table')).toHaveCount(0);
  await expect(page.locator('.enemy-stats-list')).toHaveAttribute('aria-label', /\S/);
});

test('战斗面板按 selected Monster 的负面抵抗自动切换三栏与两栏', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/enemies/8034010/');
  const threeColumnPanel = page.locator('.enemy-battle-panel');
  await expect(threeColumnPanel).toHaveAttribute('data-battle-columns', '3');
  await expect(page.locator('[data-enemy-stat]')).toHaveCount(7);
  await expect(page.locator('[data-enemy-stat="hp"]')).toContainText('657,149');
  await expect(page.locator('[data-enemy-stat="effect-hit"]')).toContainText('36%');
  await expect(page.locator('[data-enemy-stat="effect-resistance"]')).toContainText('40%');
  await expect(page.locator('[data-enemy-resistance]')).toHaveCount(3);
  await expect(page.locator('[data-enemy-resistance="Imaginary"]')).toContainText('40%');
  await expect(page.locator('[data-special-resistance="STAT_CTRL"]')).toContainText('控制抵抗50%');
  await page.goto('/enemies/4034013/');
  await expect(page.locator('[data-special-resistance="STAT_CTRL_Frozen"]')).toContainText(
    '冻结抵抗75%'
  );
  await expect(page.locator('[data-special-resistance="STAT_Confine"]')).toContainText(
    '禁锢抵抗75%'
  );
  await expect(page.locator('[data-special-resistance="STAT_Entangle"]')).toContainText(
    '纠缠抵抗75%'
  );

  await page.goto('/enemies/3002011/');
  const twoColumnPanel = page.locator('.enemy-battle-panel');
  await expect(twoColumnPanel).toHaveAttribute('data-battle-columns', '2');
});

test('召唤单位严格随 selected Monster 切换，并使用解析后的 Template route', async ({ page }) => {
  await page.goto('/enemies/1003010/');
  await expect(page.locator('[data-summon-template="1002040"]')).toHaveCount(1);
  await expect(page.locator('[data-summon-template="1002050"]')).toHaveCount(0);

  await page.locator('[data-monster-option="100301004"]').click();
  await expect(page.locator('[data-summon-template="1002040"]')).toHaveAttribute(
    'href',
    '/enemies/1002040/'
  );
  await expect(page.locator('[data-summon-template="1002050"]')).toHaveAttribute(
    'href',
    '/enemies/1002050/'
  );
  await expect(page.locator('[data-summon-monster]')).toHaveCount(2);
  const summon = page.locator('[data-summon-template="1002050"]');
  await expect(summon.locator('.compact-entity-card__tertiary')).not.toHaveText('');
  await expect(summon.locator('.compact-entity-card__tertiary')).toHaveCount(1);
  await expect(summon.locator('.enemy-weakness-group')).toHaveCount(1);
  await expect(summon).not.toContainText(/Monster #/);
  await summon.click();
  await expect(page).toHaveURL(/\/enemies\/1002050\/$/);
  await expect(page.locator('.enemy-selected-monster-heading')).toContainText('#1002050');
});

test('轻量 Skill References 保留真实 Phase、属性图标与唯一完整卡 anchor', async ({ page }) => {
  await page.goto('/enemies/8034010/');
  const tabs = page.locator('.enemy-phase-tabs');
  await expect(tabs.getByRole('tab')).toHaveCount(2);
  const phase1 = tabs.getByRole('tab').nth(0);
  const phase2 = tabs.getByRole('tab').nth(1);
  await expect(phase1).toHaveAttribute('aria-selected', 'true');

  const sharedReference = page.locator('[data-enemy-skill-reference="803401002"]');
  await expect(sharedReference).toBeVisible();
  await expect(sharedReference).toHaveAttribute('href', '#enemy-skill-803401002');
  await expect(sharedReference.locator('[data-icon-kind="element"]')).toHaveCount(1);
  await phase2.click();
  await expect(sharedReference).toBeVisible();
  await expect(page.locator('#enemy-skill-803401002')).toHaveCount(1);

  await sharedReference.click();
  await expect(page).toHaveURL(/#enemy-skill-803401002$/);
  await expect(page.locator('#enemy-skill-803401002')).toBeInViewport();

  await page.goto('/enemies/4034013/');
  const noDamageReference = page.locator('[data-enemy-skill-reference="403401302"]');
  await expect(noDamageReference).toBeVisible();
  await expect(noDamageReference.locator('[data-icon-kind="element"]')).toHaveCount(0);
});

test('完整 Skill Definitions 不随 Monster 切换重建，并按 default 顺序稳定去重', async ({
  page
}) => {
  await page.goto('/enemies/3003020/');
  const cards = page.locator('[data-enemy-skill]');
  await expect(cards).toHaveCount(4);
  const before = await cards.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-enemy-skill'))
  );
  expect(new Set(before).size).toBe(before.length);

  await page.locator('[data-monster-option="300302013"]').click();
  await expect(cards).toHaveCount(4);
  expect(
    await cards.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-enemy-skill'))
    )
  ).toEqual(before);
});

test('完整 Skill Card 保留 ExtraEffect disclosure 与无描述技能过滤', async ({ page }) => {
  await page.goto('/enemies/1004014/');
  const skill = page.locator('[data-enemy-skill="100401411"]');
  await expect(page.locator('[data-enemy-skill="100401414"]')).toHaveCount(0);
  await expect(skill.getByText('天赋', { exact: true })).toHaveCount(1);
  const details = skill.locator('details');
  await expect(details).not.toHaveAttribute('open', '');
  await details.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await expect(details.locator('[data-extra-effect="70000304"]')).toContainText('转移');
});

test('Enemy Detail 在桌面、中宽和手机布局下无页面级横向溢出', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 900, height: 900 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/enemies/8034010/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
    const selector = page.locator('.enemy-monster-selector');
    await expect(selector).toBeVisible();
    await expect(selector).toHaveCSS('overflow-x', 'auto');
    if (viewport.width <= 900)
      expect(await selector.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
        true
      );
    await expect(page.locator('[data-enemy-portrait]')).toBeVisible();
  }

  await page.goto('/enemies/8003060/');
  await expect(page.locator('[data-enemy-portrait]')).toHaveAttribute(
    'data-artwork-available',
    'false'
  );
  await expect(page.locator('[data-enemy-portrait] img')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
