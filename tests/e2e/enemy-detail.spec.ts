import { expect, test } from '@playwright/test';

test('Enemy Detail 默认展示七项 Lv.95 属性并由滑块切换预生成行', async ({ page }) => {
  await page.goto('/enemies/8034010');
  await expect(page.getByRole('heading', { level: 1, name: /诡弈砂金/ })).toBeVisible();
  const rows = page.locator('[data-enemy-stat]');
  await expect(rows).toHaveCount(7);
  await expect(page.locator('[data-enemy-stat="hp"]')).toContainText('657,149');
  await expect(page.locator('[data-enemy-stat="attack"]')).toContainText('718');
  await expect(page.locator('[data-enemy-stat="defence"]')).toContainText('1,150');
  await expect(page.locator('[data-enemy-stat="speed"]')).toContainText('158');
  await expect(page.locator('[data-enemy-stat="toughness"]')).toContainText('150');
  await expect(page.locator('[data-enemy-stat="effect-hit"]')).toContainText('36%');
  await expect(page.locator('[data-enemy-stat="effect-resistance"]')).toContainText('40%');
  const slider = page.getByRole('slider', { name: '敌人等级' });
  await expect(slider).toHaveValue('95');
  const sliderBox = await page.locator('.enemy-level-control').boundingBox();
  const statsList = page.locator('.enemy-stats-list');
  const listBox = await statsList.boundingBox();
  expect(sliderBox).not.toBeNull();
  expect(listBox).not.toBeNull();
  expect(sliderBox!.y + sliderBox!.height).toBeLessThanOrEqual(listBox!.y + 1);
  await expect(page.locator('.enemy-stats-panel table')).toHaveCount(0);
  await expect(statsList.locator('dt')).toHaveCount(7);
  await expect(statsList.locator('dd')).toHaveCount(7);
  await expect(page.locator('.enemy-stats-panel')).toHaveCSS('border-radius', '14px');
  await expect(page.locator('.enemy-stats-panel')).not.toHaveCSS('border-top-width', '0px');
  await slider.fill('1');
  await expect(page.locator('.enemy-level-control output')).toHaveText('Lv.1');
  await expect(page.locator('[data-enemy-stat="hp"]')).not.toContainText('657,149');
});

test('Enemy Detail 展示语义弱点、非零抗性、状态抗性、召唤和技能元数据', async ({ page }) => {
  await page.goto('/enemies/8034010');
  const weaknesses = page.locator('.enemy-weakness-list [data-icon-kind="element"]');
  await expect(weaknesses).toHaveCount(3);
  await expect(weaknesses).toContainText(['物理', '冰', '雷']);
  for (const weakness of await weaknesses.all()) {
    await expect(weakness.locator('img')).toBeVisible();
    await expect(weakness).not.toHaveCSS('color', 'rgb(255, 255, 255)');
  }
  await expect(page.locator('[data-enemy-resistance]')).toHaveCount(3);
  await expect(page.locator('[data-enemy-resistance="Imaginary"]')).toContainText('40%');
  await expect(page.locator('[data-special-resistance="STAT_CTRL"]')).toContainText('控制抵抗50%');
  await expect(
    page.locator('#resistances').getByRole('heading', { name: '负面效果抵抗' })
  ).toBeVisible();
  await expect(page.getByText('特殊状态抗性', { exact: true })).toHaveCount(0);
  await expect(page.locator('#special-resistances')).toHaveCount(0);

  const summon = page.locator('[data-summon-template="8032030"]');
  await expect(summon).toHaveAttribute('href', '/enemies/8032030');
  await expect(summon).toContainText('「所有或一无所有」');

  const skill = page.locator('[data-enemy-skill="803401002"]');
  await expect(skill).toContainText('分散投资');
  await expect(skill.locator('[data-skill-effect="Bounce"]')).toHaveText('弹射');
  await expect(skill.locator('[data-icon-kind="element"]')).toContainText('虚数');
  await expect(skill).toContainText('适用阶段 1 / 2');
  await expect(skill.locator('.enemy-skill-meta [data-icon-kind="element"]')).toHaveCSS(
    'border-top-width',
    '0px'
  );
  await expect(page.getByText('出现关卡', { exact: true })).toHaveCount(0);
  await expect(page.getByText('LittleBoss', { exact: true })).toHaveCount(0);
});

test('Enemy ExtraEffect 使用原生可访问 disclosure，缺失 DamageType 不推断', async ({ page }) => {
  await page.goto('/enemies/1004014');
  const skill = page.locator('[data-enemy-skill="100401411"]');
  await expect(page.locator('[data-enemy-skill="100401414"]')).toHaveCount(0);
  await expect(skill.getByText('天赋', { exact: true })).toHaveCount(1);
  const details = skill.locator('details');
  await expect(details).not.toHaveAttribute('open', '');
  await details.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await expect(details.locator('[data-extra-effect="70000304"]')).toContainText('转移');

  await page.goto('/enemies/4034013');
  await expect(
    page.locator('[data-enemy-skill="403401302"] [data-icon-kind="element"]')
  ).toHaveCount(0);
});

test('Enemy 技能保持单列开放布局，并建立清晰的标题与描述层级', async ({ page }) => {
  await page.goto('/enemies/8034010');
  const cards = page.locator('[data-enemy-skill]');
  expect(await cards.count()).toBeGreaterThan(2);
  const firstBox = await cards.nth(0).boundingBox();
  const secondBox = await cards.nth(1).boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  expect(Math.abs(firstBox!.x - secondBox!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(firstBox!.width - secondBox!.width)).toBeLessThanOrEqual(1);
  await expect(cards.first()).toHaveCSS('border-radius', '14px');
  const skillSurface = await cards.first().evaluate((card) => {
    const style = getComputedStyle(card);
    return {
      background: style.backgroundColor,
      borderTop: style.borderTopWidth,
      borderBottom: style.borderBottomWidth
    };
  });
  expect(skillSurface.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(skillSurface.borderTop).toBe(skillSurface.borderBottom);
  const rowGap = await page
    .locator('.enemy-skill-list')
    .evaluate((list) => Number.parseFloat(getComputedStyle(list).rowGap));
  expect(rowGap).toBeGreaterThan(0);

  const hierarchy = await cards.first().evaluate((card) => {
    const title = card.querySelector('h3');
    const description = card.querySelector(':scope > p');
    if (!title || !description) return null;
    const titleStyle = getComputedStyle(title);
    const descriptionStyle = getComputedStyle(description);
    return {
      titleSize: Number.parseFloat(titleStyle.fontSize),
      titleWeight: Number.parseInt(titleStyle.fontWeight, 10),
      descriptionSize: Number.parseFloat(descriptionStyle.fontSize),
      descriptionWeight: Number.parseInt(descriptionStyle.fontWeight, 10)
    };
  });
  expect(hierarchy).not.toBeNull();
  expect(hierarchy!.titleSize).toBeGreaterThan(hierarchy!.descriptionSize);
  expect(hierarchy!.titleWeight).toBeGreaterThan(hierarchy!.descriptionWeight);
});

test('Enemy 各 section surface 全宽对齐，抗性空态不会保留空白右栏', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/enemies/8034010');
  const aligned = await page
    .locator(
      '.enemy-hero, .enemy-stats-panel, .enemy-resistance-surface, .enemy-summon-list, .enemy-skill-list'
    )
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { x: Math.round(rect.x), width: Math.round(rect.width) };
      })
    );
  expect(aligned.length).toBe(5);
  expect(new Set(aligned.map(({ x }) => x)).size).toBe(1);
  expect(new Set(aligned.map(({ width }) => width)).size).toBe(1);

  await page.goto('/enemies/3002011');
  await expect(page.getByRole('heading', { name: '负面效果抵抗' })).toHaveCount(0);
  const columns = await page
    .locator('.enemy-resistance-surface')
    .evaluate((surface) => getComputedStyle(surface).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(1);

  await page.goto('/enemies/4034013');
  await expect(page.locator('[data-special-resistance="STAT_CTRL_Frozen"]')).toContainText(
    '冻结抵抗75%'
  );
  await expect(page.locator('[data-special-resistance="STAT_Confine"]')).toContainText(
    '禁锢抵抗75%'
  );
  await expect(page.locator('[data-special-resistance="STAT_Entangle"]')).toContainText(
    '纠缠抵抗75%'
  );
});

test('Enemy Detail 各代表视口无横向溢出，移动端收起 Hero 立绘', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 900, height: 900 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/enemies/8034010');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
    const resistanceColumns = await page
      .locator('.enemy-resistance-surface')
      .evaluate((surface) => getComputedStyle(surface).gridTemplateColumns.split(' ').length);
    expect(resistanceColumns).toBe(viewport.width <= 1080 ? 1 : 2);
    if (viewport.width <= 520) {
      await expect(page.locator('.enemy-hero__art')).toBeHidden();
    } else {
      const copyBox = await page.locator('.enemy-hero__copy').boundingBox();
      const artBox = await page.locator('.enemy-hero__art').boundingBox();
      expect(copyBox).not.toBeNull();
      expect(artBox).not.toBeNull();
      expect(copyBox!.x + copyBox!.width).toBeLessThanOrEqual(artBox!.x + 1);
    }
  }

  await page.goto('/enemies/8003060');
  await expect(page.locator('.enemy-hero__art')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
