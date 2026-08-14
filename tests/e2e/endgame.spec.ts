import { expect, test } from '@playwright/test';

test('Endgame 首页、模式和赛期可以直接访问', async ({ page }) => {
  await page.goto('/endgame');
  await expect(page.getByRole('heading', { name: 'Endgame', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /混沌回忆/ }).first()).toBeVisible();

  await page.goto('/endgame/moc');
  await expect(page.getByRole('heading', { name: '混沌回忆' })).toBeVisible();
  await expect(page.getByRole('link', { name: /扫除风暴/ })).toBeVisible();

  await page.goto('/endgame/moc/1034?encounter=5312');
  await expect(page.getByRole('heading', { name: '扫除风暴', exact: true })).toBeVisible();
  await expect(page.locator('[data-battle-slot]')).toHaveCount(3);
});

test('PF 只显示波内唯一敌人类型', async ({ page }) => {
  await page.goto('/endgame/pf/2025?encounter=20254');
  await expect(page.getByText(/重复生成、生成次数与先后顺序已省略/)).toBeVisible();
  const firstBattle = page.locator('[data-battle-slot="1"]');
  await expect(firstBattle.locator('[data-wave="spawn-303230411"] .endgame-enemy')).toHaveCount(4);
  await expect(firstBattle.locator('[data-wave="spawn-303230412"] .endgame-enemy')).toHaveCount(3);
  await expect(firstBattle.locator('.endgame-enemy__count')).toHaveCount(0);
});

test('AS 多阶段生命值显示完整整数、阶段数和属性图标', async ({ page }) => {
  await page.goto('/endgame/as/3019?encounter=30194#battle-2');
  const boss = page.locator('[data-monster-id="401401304"]');
  await expect(boss).toBeVisible();
  await expect(boss.locator('[data-endgame-hp]')).toHaveText('14,628,489 × 2');
  await expect(boss.locator('[data-endgame-hp]')).not.toHaveText(/[KMB]/);
  const weaknesses = boss.locator('.endgame-weaknesses [data-icon-kind="element"]');
  await expect(weaknesses).toHaveCount(4);
  await expect(weaknesses.first().locator('img')).toHaveAttribute(
    'src',
    /generated-assets\/elements\/.+\.png/
  );
  await expect(weaknesses.first().locator('span')).not.toBeEmpty();
  await expect(boss.locator('.hp-mechanics summary')).toHaveAccessibleName('查看生命值机制说明');
});

test('AA 王棋普通和绝境使用实际 spawned occurrence', async ({ page }) => {
  await page.goto('/endgame/aa/8?encounter=804%3Ahard');
  await expect(page.locator('[data-monster-id="501403002"]')).toBeVisible();
  await expect(page.locator('[data-monster-id="5014030"]')).toHaveCount(0);
  await expect(page.locator('[data-monster-id="501403002"] [data-endgame-hp]')).toHaveText(
    '63,467,351 × 2'
  );

  await page.getByRole('link', { name: '将杀王棋', exact: true }).click();
  await expect(page).toHaveURL(/encounter=804%3Anormal/);
  await expect(page.locator('[data-monster-id="501403002"] [data-endgame-hp]')).toHaveText(
    '16,660,180 × 2'
  );
  await page.goBack();
  await expect(page).toHaveURL(/encounter=804%3Ahard/);
});

test('Endgame 移动端单列且页面无横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/endgame/moc/1034?encounter=5312');
  const columns = await page
    .locator('.endgame-battle-grid')
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
