import { expect, test, type Locator, type Page } from '@playwright/test';

async function gridColumnCount(locator: Locator) {
  return locator.evaluate((element) => {
    const tracks = getComputedStyle(element).gridTemplateColumns.match(/[\d.]+px/g) ?? [];
    return tracks.filter((track) => Number.parseFloat(track) > 1).length;
  });
}

async function selectLocalNode(page: Page, label: string) {
  const mobileTrigger = page.locator('.endgame-local-nav-trigger');
  if (await mobileTrigger.isVisible()) await mobileTrigger.click();
  await page.getByRole('link', { name: label, exact: true }).click();
}

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

test('Endgame mode tabs 保持四项导航并由 active tab 承担页面标题', async ({ page }) => {
  await page.goto('/endgame/pf/2025?encounter=20254');
  const modeNav = page.getByRole('navigation', { name: '终局模式' });
  const expectedModes = [
    ['混沌回忆', '/endgame/moc'],
    ['虚构叙事', '/endgame/pf'],
    ['末日幻影', '/endgame/as'],
    ['异相仲裁', '/endgame/aa']
  ] as const;
  await expect(modeNav.getByRole('link')).toHaveCount(4);
  for (const [label, href] of expectedModes) {
    await expect(modeNav.getByRole('link', { name: new RegExp(label) })).toHaveAttribute(
      'href',
      href
    );
  }
  const activeMode = modeNav.getByRole('link', { name: /虚构叙事/ });
  await expect(activeMode).toHaveAttribute('aria-current', 'page');
  await expect(activeMode.getByRole('heading', { name: '虚构叙事', level: 1 })).toBeVisible();
  await expect(page.getByText(/PF ENCOUNTER|PF PERIODS/)).toHaveCount(0);
});

test('Endgame desktop local rail 保持窄栏、active ownership 与原 query href', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/endgame/moc/1034?encounter=5312');
  const rail = page.locator('.endgame-local-nav');
  await expect(rail).toBeVisible();
  expect((await rail.boundingBox())?.width).toBeLessThanOrEqual(160);
  await expect(rail.getByRole('link')).toHaveCount(12);
  await expect(rail.getByRole('link', { name: '12', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  );
  await expect(rail.getByRole('link', { name: '01', exact: true })).toHaveAttribute(
    'href',
    '?encounter=5301'
  );
  await expect(page.locator('.endgame-encounter-nav, .aa-encounter-nav')).toHaveCount(0);
  await expect(page.locator('.endgame-local-nav-mobile')).toBeHidden();

  await page.goto('/endgame/aa/8?encounter=804%3Anormal');
  const aaRail = page.locator('.endgame-local-nav');
  await expect(aaRail.getByRole('heading', { name: '骑士', exact: true })).toBeVisible();
  await expect(aaRail.getByRole('heading', { name: '王棋', exact: true })).toBeVisible();
  await expect(aaRail.getByRole('link', { name: '将杀王棋', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  );
});

test('Endgame season selector 继续导航到同模式其他赛期', async ({ page }) => {
  await page.goto('/endgame/moc/1034?encounter=5312');
  const selector = page.getByLabel('选择赛期');
  const current = await selector.inputValue();
  const target = await selector
    .locator('option')
    .evaluateAll(
      (options, selected) =>
        options
          .map((option) => (option as HTMLOptionElement).value)
          .find((value) => value !== selected),
      current
    );
  if (!target) throw new Error('未找到可用于赛期 selector 回归的其他 MoC 赛期');
  await selector.selectOption(target);
  await expect(page).toHaveURL(new RegExp(`/endgame/moc/${target}$`));
});

test('MoC 相同记忆紊流只展示一次并保留 GameText 格式', async ({ page }) => {
  await page.goto('/endgame/moc/1034?encounter=5312');
  const turbulence = page.locator('[data-endgame-mechanics="memory-turbulence"]');
  await expect(turbulence).toHaveCount(1);
  await expect(turbulence.getByRole('heading', { name: '记忆紊流' })).toBeVisible();
  const percentage = turbulence.locator('[data-game-color="#f29e38ff"]').filter({ hasText: '80%' });
  await expect(percentage).toHaveCount(1);
  await expect(percentage).toHaveClass(/description-token--unbreak/);
  await expect(turbulence).toContainText('1回合');
  await expect(turbulence.locator('img')).toHaveCount(0);
});

test('PF 战意机制与荒腔走板保持 fixed/selectable 分离', async ({ page }) => {
  await page.goto('/endgame/pf/2025?encounter=20254');
  const battleWill = page.locator('[data-endgame-mechanics="battle-will"]');
  await expect(battleWill.locator('.endgame-mechanic-surface')).toHaveCount(1);
  await expect(battleWill.locator('.endgame-mechanic-entry')).toHaveCount(3);
  await expect(battleWill.getByRole('heading', { name: '追加攻击' })).toBeVisible();
  await expect(battleWill.getByRole('heading', { name: '战熄潮平' })).toBeVisible();
  await expect(battleWill.getByRole('heading', { name: '战意汹涌' })).toBeVisible();

  const cacophony = page.locator('[data-endgame-mechanics="cacophony"]');
  await expect(cacophony.getByText('三选一 · 每队', { exact: true })).toBeVisible();
  await expect(cacophony.locator('.endgame-option-card')).toHaveCount(3);
  await expect(cacophony.getByRole('heading', { name: '暴言' })).toBeVisible();
  await expect(cacophony.getByRole('heading', { name: '高论' })).toBeVisible();
  await expect(cacophony.getByRole('heading', { name: '快嘴' })).toBeVisible();
  await expect(cacophony.locator('button, input, [role="button"], [tabindex]')).toHaveCount(0);
  await expect(cacophony.locator('img')).toHaveCount(0);
});

test('AS 终焉公理分别绑定对应 battle slot', async ({ page }) => {
  await page.goto('/endgame/as/3020?encounter=30204');
  await expect(page.locator('[data-endgame-mechanics="aftertaste"]')).toContainText('末法余烬');
  await expect(page.locator('[data-endgame-mechanics="axiom"]')).toHaveCount(3);
  for (const slot of ['1', '2', '3']) {
    const battle = page.locator(`[data-battle-slot="${slot}"]`);
    await expect(battle.locator('[data-endgame-mechanics="axiom"]')).toHaveCount(1);
    await expect(battle.locator('.endgame-option-card')).toHaveCount(3);
  }
  await expect(page.locator('[data-endgame-mechanics] img')).toHaveCount(0);
});

test('AA normal/hard 切换 traits 并复用一份裁决象限', async ({ page }) => {
  await page.goto('/endgame/aa/8?encounter=804%3Anormal');
  const quadrant = page.locator('[data-endgame-mechanics="judgment-quadrant"]');
  const traits = page.locator('[data-endgame-mechanics="chess-traits"]');
  await expect(quadrant).toHaveCount(1);
  await expect(quadrant.locator('.endgame-option-card')).toHaveCount(3);
  await expect(traits.getByRole('heading', { name: '激怒', exact: true })).toBeVisible();
  await expect(traits.getByRole('heading', { name: '均衡', exact: true })).toBeVisible();
  await expect(traits.getByText('激怒+', { exact: true })).toHaveCount(0);

  await selectLocalNode(page, '将杀王棋•绝境');
  await expect(page).toHaveURL(/encounter=804%3Ahard/);
  await expect(quadrant).toHaveCount(1);
  await expect(traits.getByRole('heading', { name: '激怒+', exact: true })).toBeVisible();
  await expect(traits.getByRole('heading', { name: '均衡+', exact: true })).toBeVisible();
  await expect(traits.getByRole('heading', { name: '激怒', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '战斗规则' })).toHaveCount(0);

  await selectLocalNode(page, '骑士（一）');
  await expect(page).toHaveURL(/encounter=801%3Apreliminary/);
  await expect(page.locator('[data-endgame-mechanics="judgment-quadrant"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '挑衅', exact: true })).toBeVisible();
});

test('PF 只显示波内唯一敌人类型', async ({ page }) => {
  await page.goto('/endgame/pf/2025?encounter=20254');
  await expect(page.getByText(/重复生成、生成次数与先后顺序已省略/)).toBeVisible();
  const firstBattle = page.locator('[data-battle-slot="1"]');
  await expect(firstBattle.locator('[data-wave] > h4')).toHaveText(['波次 1', '波次 2', '波次 3']);
  await expect(firstBattle.locator('[data-wave="spawn-303230411"] .endgame-enemy')).toHaveCount(4);
  await expect(firstBattle.locator('[data-wave="spawn-303230412"] .endgame-enemy')).toHaveCount(3);
  await expect(firstBattle.locator('[data-wave="spawn-303230413"] .endgame-enemy')).toHaveCount(3);
  await expect(firstBattle.locator('.endgame-enemy__count')).toHaveCount(0);
});

test('敌方实体卡采用 portrait-first 信息层级并保留全部战斗字段', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/endgame/moc/1034?encounter=5312');
  const card = page.locator('[data-endgame-enemy-card]').first();
  const artwork = card.locator('.endgame-enemy__artwork');
  const name = card.locator('.endgame-enemy__name');
  await expect(card).toHaveAttribute('data-enemy-card-variant', 'standard');
  await expect(card.locator('.endgame-enemy__level')).toHaveText(/^Lv\.\d+$/);
  await expect(card.locator('[data-endgame-hp]')).toBeVisible();
  await expect(card.locator('[data-endgame-speed]')).toBeVisible();
  await expect(card.locator('[data-endgame-toughness]')).toBeVisible();
  await expect(card.locator('.endgame-weaknesses')).toBeVisible();

  const cardBox = await card.boundingBox();
  const artworkBox = await artwork.boundingBox();
  const nameBox = await name.boundingBox();
  expect(cardBox).not.toBeNull();
  expect(artworkBox).not.toBeNull();
  expect(nameBox).not.toBeNull();
  expect(cardBox!.width).toBeLessThanOrEqual(262);
  expect(cardBox!.height).toBeGreaterThan(cardBox!.width);
  expect(artworkBox!.y + artworkBox!.height).toBeLessThanOrEqual(nameBox!.y);

  const battleSurface = await page.locator('[data-battle-slot="1"]').evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    borderRadius: getComputedStyle(element).borderRadius,
    paddingTop: getComputedStyle(element).paddingTop
  }));
  expect(battleSurface).toEqual({
    background: 'rgba(0, 0, 0, 0)',
    borderRadius: '0px',
    paddingTop: '0px'
  });

  await page.goto('/endgame/moc/101?encounter=108');
  await expect(page.locator('.endgame-enemy__count').first()).toHaveText(/^×[2-9]\d*$/);
});

test('四模式映射到明确的敌方卡 variant 并保持 mechanics ownership', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto('/endgame/pf/2025?encounter=20254');
  await expect(page.locator('[data-endgame-enemy-card]').first()).toHaveAttribute(
    'data-enemy-card-variant',
    'compact'
  );
  const pfWaves = page.locator('[data-battle-slot="1"] .endgame-wave-list');
  await expect(pfWaves.locator('[data-wave]')).toHaveCount(3);
  await expect(pfWaves).toHaveAttribute('data-wave-layout', 'high-density');
  expect(await gridColumnCount(pfWaves)).toBe(2);

  await page.goto('/endgame/as/3020?encounter=30204');
  await expect(page.locator('[data-endgame-enemy-card]')).toHaveCount(3);
  await expect(page.locator('[data-endgame-enemy-card]').first()).toHaveAttribute(
    'data-enemy-card-variant',
    'boss'
  );
  const firstAsBattle = page.locator('[data-battle-slot="1"]');
  const axiomBox = await firstAsBattle.locator('[data-endgame-mechanics="axiom"]').boundingBox();
  const waveBox = await firstAsBattle.locator('.endgame-wave-list').boundingBox();
  expect(axiomBox).not.toBeNull();
  expect(waveBox).not.toBeNull();
  expect(axiomBox!.y + axiomBox!.height).toBeLessThanOrEqual(waveBox!.y);

  await page.goto('/endgame/aa/8?encounter=804%3Ahard');
  await expect(page.locator('[data-endgame-enemy-card]').first()).toHaveAttribute(
    'data-enemy-card-variant',
    'standard'
  );
});

test('AA Group 6 波次按桌面、平板与手机宽度自适应且不改变 2+1+1 投影', async ({ page }) => {
  await page.goto('/endgame/aa/6?encounter=604%3Anormal');
  const waveList = page.locator('[data-battle-slot="1"] .endgame-wave-list');
  await expect(waveList.locator('[data-wave]')).toHaveCount(3);
  await expect(
    waveList.locator('[data-wave]').nth(0).locator('[data-endgame-enemy-card]')
  ).toHaveCount(2);
  await expect(
    waveList.locator('[data-wave]').nth(1).locator('[data-endgame-enemy-card]')
  ).toHaveCount(1);
  await expect(
    waveList.locator('[data-wave]').nth(2).locator('[data-endgame-enemy-card]')
  ).toHaveCount(1);

  for (const width of [1440, 1200]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await gridColumnCount(waveList)).toBe(3);
  }

  await page.setViewportSize({ width: 900, height: 1000 });
  expect(await gridColumnCount(waveList)).toBe(2);

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await gridColumnCount(waveList)).toBe(1);
    for (const grid of await waveList.locator('[data-enemy-grid]').all()) {
      expect(await gridColumnCount(grid)).toBe(1);
    }
    const cardBox = await waveList.locator('[data-endgame-enemy-card]').first().boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox!.width).toBeLessThanOrEqual(280);
    expect(cardBox!.height).toBeGreaterThan(cardBox!.width);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test('PF 非 canonical Monster 展示具体实例弱点', async ({ page }) => {
  await page.goto('/endgame/pf/2001?encounter=20011');
  const enemy = page.locator('[data-monster-id="800205005"]').first();
  await expect(enemy).toBeVisible();
  await expect(enemy.locator('.endgame-weaknesses [data-icon-kind="element"] span')).toHaveText([
    '雷',
    '虚数'
  ]);
  await expect(enemy.locator('[data-endgame-speed]')).toHaveText('120');
  await expect(enemy.locator('[data-endgame-toughness]')).toHaveText('30');
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
  const artworkBefore = await card.locator('.endgame-enemy__artwork').boundingBox();
  await portrait.evaluate((image) => image.dispatchEvent(new Event('error')));
  await expect(card.locator('[data-enemy-portrait]')).toHaveCount(0);
  await expect(card.locator('.endgame-enemy__fallback')).toBeVisible();
  const artworkAfter = await card.locator('.endgame-enemy__artwork').boundingBox();
  expect(artworkAfter?.height).toBe(artworkBefore?.height);
  await expect(card.locator('[data-endgame-hp]')).toHaveText('7,259,250 × 2');
});

test('AA 王棋普通和绝境使用实际 spawned occurrence', async ({ page }) => {
  await page.goto('/endgame/aa/8?encounter=804%3Ahard');
  await expect(page.locator('[data-monster-id="501403002"]')).toBeVisible();
  await expect(page.locator('[data-monster-id="5014030"]')).toHaveCount(0);
  await expect(page.locator('[data-monster-id="501403002"] [data-endgame-hp]')).toHaveText(
    '63,467,351 × 2'
  );

  await selectLocalNode(page, '将杀王棋');
  await expect(page).toHaveURL(/encounter=804%3Anormal/);
  await expect(page.locator('[data-monster-id="501403002"] [data-endgame-hp]')).toHaveText(
    '16,660,180 × 2'
  );
  await page.goBack();
  await expect(page).toHaveURL(/encounter=804%3Ahard/);
});

test('Endgame 移动端折叠 local rail，dialog 支持 ESC、焦点返回与节点导航', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/endgame/moc/1034?encounter=5312');
  const modeNav = page.getByRole('navigation', { name: '终局模式' });
  const modeNavLayout = await modeNav.evaluate((element) => ({
    display: getComputedStyle(element).display,
    flexWrap: getComputedStyle(element).flexWrap,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth
  }));
  expect(modeNavLayout).toMatchObject({ display: 'flex', flexWrap: 'nowrap' });
  expect(modeNavLayout.scrollWidth).toBeGreaterThan(modeNavLayout.clientWidth);
  await expect(page.locator('.endgame-local-nav')).toBeHidden();

  const trigger = page.getByRole('button', { name: '选择关卡，当前关卡 12' });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const menu = page.getByRole('dialog', { name: '选择关卡' });
  await expect(menu).toBeVisible();
  const currentLink = menu.getByRole('link', { name: '12', exact: true });
  await expect(currentLink).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.mouse.click(1, 1);
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await menu.getByRole('link', { name: '11', exact: true }).click();
  await expect(page).toHaveURL(/encounter=5311/);
  await expect(page.getByRole('button', { name: '选择关卡，当前关卡 11' })).toBeVisible();

  const columns = await page
    .locator('.endgame-battle-grid')
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Endgame selectable mechanics 移动端单列且无横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/endgame/pf/2025?encounter=20254');
  const columns = await page
    .locator('[data-endgame-mechanics="cacophony"] .endgame-option-grid')
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
