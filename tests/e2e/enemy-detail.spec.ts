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
  await expect(page.locator('[data-special-resistance="STAT_CTRL"]')).toContainText('控制类50%');

  const summon = page.locator('[data-summon-template="8032030"]');
  await expect(summon).toHaveAttribute('href', '/enemies/8032030');
  await expect(summon).toContainText('「所有或一无所有」');

  const skill = page.locator('[data-enemy-skill="803401002"]');
  await expect(skill).toContainText('分散投资');
  await expect(skill.locator('[data-skill-effect="Bounce"]')).toHaveText('弹射');
  await expect(skill.locator('[data-icon-kind="element"]')).toContainText('虚数');
  await expect(skill).toContainText('适用阶段 1 / 2');
  await expect(page.getByText('出现关卡', { exact: true })).toHaveCount(0);
  await expect(page.getByText('LittleBoss', { exact: true })).toHaveCount(0);
});

test('Enemy ExtraEffect 使用原生可访问 disclosure，缺失 DamageType 不推断', async ({ page }) => {
  await page.goto('/enemies/1004014');
  const skill = page.locator('[data-enemy-skill="100401411"]');
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
    if (viewport.width <= 520) await expect(page.locator('.enemy-hero__art')).toBeHidden();
  }

  await page.goto('/enemies/8003060');
  await expect(page.locator('.enemy-hero__art')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
