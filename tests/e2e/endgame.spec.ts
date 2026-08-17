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
  await expect(boss.locator('.hp-mechanics, .toughness-mechanics')).toHaveCount(0);
});

test('遗忘冽风难度 4 使用本地海报立绘和精确战斗属性', async ({ page }) => {
  const failedImages: string[] = [];
  page.on('response', (response) => {
    if (response.request().resourceType() === 'image' && response.status() >= 400)
      failedImages.push(response.url());
  });
  await page.goto('/endgame/as/3018?encounter=30184');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-battle-slot]')).toHaveCount(3);
  const expectations = [
    ['406401204', '7,259,250 × 2', '120 × 8', '190'],
    ['100401404', '6,874,290 × 2', '100', '172'],
    ['100402604', '3,299,659', '200', '165'],
    ['403401304', '6,775,300 × 2', '300 × 2', '174']
  ] as const;
  for (const [monsterId, hp, toughness, speed] of expectations) {
    const card = page.locator(`[data-monster-id="${monsterId}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator('[data-enemy-portrait]')).toHaveAttribute(
      'src',
      /generated-enemy-assets\/icons\/Monster_\d+\.webp/
    );
    await expect(card.locator('[data-endgame-hp]')).toHaveText(hp);
    await expect(card.locator('[data-endgame-toughness]')).toHaveText(toughness);
    await expect(card.locator('[data-endgame-speed]')).toHaveText(speed);
  }
  expect(failedImages).toEqual([]);
  await expect(page.locator('.endgame-enemy__placeholder')).toHaveCount(0);
});

test('兵锋骑士难度 4 显示玩家侧韧性且不显示机制弹窗', async ({ page }) => {
  await page.goto('/endgame/as/3019?encounter=30194');
  for (const [monsterId, toughness] of [
    ['302401304', '300'],
    ['401401304', '480'],
    ['300402104', '190']
  ] as const) {
    const card = page.locator(`[data-monster-id="${monsterId}"]`);
    await expect(card.locator('[data-endgame-toughness]')).toHaveText(toughness);
  }
  await expect(page.locator('.hp-mechanics, .toughness-mechanics')).toHaveCount(0);
  await expect(page.getByLabel('查看生命值机制说明')).toHaveCount(0);
  await expect(page.getByLabel('查看韧性机制说明')).toHaveCount(0);
});

test('敌人立绘请求失败时保留完整数据并显示中性降级', async ({ page }) => {
  await page.goto('/endgame/as/3018?encounter=30184');
  const card = page.locator('[data-monster-id="406401204"]');
  const portrait = card.locator('[data-enemy-portrait]');
  await expect(portrait).toBeVisible();
  await portrait.evaluate((image) => image.dispatchEvent(new Event('error')));
  await expect(card.locator('[data-enemy-portrait]')).toHaveCount(0);
  await expect(card.locator('.endgame-enemy__fallback')).toBeVisible();
  await expect(card.locator('[data-endgame-hp]')).toHaveText('7,259,250 × 2');
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
