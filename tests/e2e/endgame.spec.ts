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
  const surface = turbulence.locator('.endgame-mechanic-surface');
  await expect(surface.getByRole('heading', { name: '记忆紊流', level: 2 })).toBeVisible();
  await expect(turbulence.locator(':scope > .section-heading')).toHaveCount(0);
  const percentage = turbulence.locator('[data-game-color="#f29e38ff"]').filter({ hasText: '80%' });
  await expect(percentage).toHaveCount(1);
  await expect(percentage).toHaveClass(/description-token--unbreak/);
  await expect(turbulence).toContainText('1回合');
  await expect(turbulence.locator('img')).toHaveCount(0);
});

test('PF 战意机制与荒腔走板保持 fixed/selectable 分离', async ({ page }) => {
  await page.goto('/endgame/pf/2025?encounter=20254');
  const battleWill = page.locator('[data-endgame-mechanics="battle-will"]');
  const fixedSurface = battleWill.locator('.endgame-mechanic-surface');
  await expect(fixedSurface).toHaveCount(1);
  await expect(fixedSurface.getByRole('heading', { name: '战意机制', level: 2 })).toBeVisible();
  await expect(battleWill.locator('.endgame-mechanic-entry')).toHaveCount(3);
  await expect(battleWill.locator('.endgame-mechanic-entry h3')).toHaveText([
    '追加攻击',
    '战熄潮平',
    '战意汹涌'
  ]);
  await expect(battleWill.locator('.endgame-mechanic-entry.endgame-option-card')).toHaveCount(0);
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
  expect(
    await cacophony
      .locator('.endgame-option-card')
      .first()
      .evaluate((element) => getComputedStyle(element).cursor)
  ).not.toBe('pointer');
});

test('PF fixed 与 selectable mechanics 按真实内容宽度降级为 3/2/1 列', async ({ page }) => {
  await page.goto('/endgame/pf/2025?encounter=20254');
  const fixedEntries = page.locator(
    '[data-endgame-mechanics="battle-will"] .endgame-mechanic-entry-list'
  );
  const options = page.locator('[data-endgame-mechanics="cacophony"] .endgame-option-grid');
  for (const [width, expectedColumns] of [
    [1440, 3],
    [1200, 2],
    [390, 1]
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await gridColumnCount(fixedEntries)).toBe(expectedColumns);
    expect(await gridColumnCount(options)).toBe(expectedColumns);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test('AS 三个战斗 slot 分别使用统一敌方卡并保留终焉公理与关卡效果', async ({ page }) => {
  await page.goto('/endgame/as/3020?encounter=30204');
  await expect(page.locator('[data-endgame-mechanics="aftertaste"]')).toContainText('末法余烬');
  await expect(page.locator('[data-endgame-mechanics="axiom"]')).toHaveCount(3);
  await expect(page.locator('[data-endgame-mechanics="boss-traits"]')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: '关卡效果', exact: true })).toHaveCount(3);
  for (const slot of ['1', '2', '3']) {
    const battle = page.locator(`[data-as-battle-slot="${slot}"]`);
    await expect(battle.getByRole('heading', { name: `战斗 ${slot}`, exact: true })).toBeVisible();
    await expect(battle.locator('[data-endgame-enemy-card]')).toHaveCount(1);
    await expect(battle.locator('[data-endgame-enemy-card]')).toHaveAttribute(
      'data-enemy-card-variant',
      'standard'
    );
    await expect(battle.locator('[data-endgame-mechanics="axiom"]')).toHaveCount(1);
    await expect(battle.locator('[data-as-axiom-options] .endgame-mechanic-entry')).toHaveCount(3);
    await expect(battle.locator('[data-as-boss-traits] .endgame-mechanic-entry')).toHaveCount(4);
  }
  const slotOne = page.locator('[data-as-battle-slot="1"]');
  await expect(slotOne.getByRole('heading', { name: '坚防守备', exact: true })).toBeVisible();
  await expect(slotOne.getByRole('heading', { name: '丰亨豫大', exact: true })).toBeVisible();
  await expect(slotOne.getByRole('heading', { name: '如鹿添翼', exact: true })).toBeVisible();
  await expect(slotOne.getByRole('heading', { name: '仙光夺目', exact: true })).toBeVisible();
  await expect(slotOne.locator('[data-as-boss-traits]')).toContainText('50%');
  await expect(slotOne.locator('[data-as-boss-traits]')).toContainText('100%');
  await expect(
    slotOne
      .locator('[data-as-boss-traits] .endgame-mechanic-entry')
      .first()
      .locator('[data-stage-effect-explanations]')
  ).toHaveCount(0);
  const slotThreeExplanations = page.locator(
    '[data-as-battle-slot="3"] [data-stage-effect-explanations]'
  );
  await expect(slotThreeExplanations).toHaveCount(1);
  expect(
    await slotThreeExplanations
      .locator('[data-extra-effect]')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-extra-effect')))
  ).toEqual(['501401001', '70000318']);
  await slotThreeExplanations.locator('summary').click();
  await expect(slotThreeExplanations).toContainText('连麦PK');
  await expect(slotThreeExplanations).toContainText('韧性锁止');
  expect(await slotThreeExplanations.textContent()).not.toContain('501401001');
  await expect(page.locator('[data-endgame-mechanics] img')).toHaveCount(0);
  await expect(page.locator('[data-endgame-enemy-card]')).toHaveCount(3);
  await expect(page.locator('[data-as-boss-profile], .as-enemy-profile-card')).toHaveCount(0);
  await expect(page.locator('.endgame-battle')).toHaveCount(0);
  await expect(page.locator('[data-endgame-mechanics="axiom"] .endgame-option-card')).toHaveCount(
    0
  );
  await expect(
    page.locator('[data-endgame-mechanics="aftertaste"] .endgame-mechanic-surface--accent')
  ).toHaveCount(0);
});

test('AS 多敌人 slot 使用同级统一卡并保留完整战斗数据', async ({ page }) => {
  await page.goto('/endgame/as/3001?encounter=30014');
  const slot = page.locator('[data-as-battle-slot="1"]');
  const enemies = slot.locator('[data-endgame-enemy-card]');
  await expect(enemies).toHaveCount(2);
  expect(
    await enemies.evaluateAll((cards) =>
      cards.every((card) => card.getAttribute('data-enemy-card-variant') === 'standard')
    )
  ).toBe(true);
  await expect(enemies.locator('.endgame-enemy__name')).toHaveText(['无望冽风的幻灭者', '杰帕德']);
  for (const monsterId of ['100401404', '100402604']) {
    const enemy = slot.locator(`[data-monster-id="${monsterId}"]`);
    await expect(enemy.locator('.endgame-enemy__level')).toHaveCount(0);
    await expect(enemy.locator('[data-endgame-hp]')).toBeVisible();
    await expect(enemy.locator('[data-endgame-speed]')).toBeVisible();
    await expect(enemy.locator('[data-endgame-toughness]')).toBeVisible();
    await expect(enemy.locator('.endgame-weaknesses')).toBeVisible();
  }
  await expect(slot.getByText('主首领', { exact: true })).toHaveCount(0);
  await expect(slot.getByText('随行敌人', { exact: true })).toHaveCount(0);
  await expect(slot.locator('[data-as-boss-profile], .as-enemy-profile-card')).toHaveCount(0);
  await expect(slot.locator('[data-endgame-mechanics="axiom"]')).toHaveCount(1);
  await expect(slot.locator('[data-endgame-mechanics="boss-traits"]')).toHaveCount(1);
});

test('AS mismatch 继续使用实际 Stage 首领，并保留 slot-owned traits', async ({ page }) => {
  await page.goto('/endgame/as/3011?encounter=30114');
  const slot = page.locator('[data-as-battle-slot="2"]');
  await expect(slot.locator('[data-monster-id="203501204"]')).toBeVisible();
  await expect(slot.locator('[data-as-boss-traits] .endgame-mechanic-entry')).toHaveCount(4);
  await expect(slot).not.toContainText('蛊言妄念的蚀心兽');
  expect(await page.content()).not.toContain('203302204');
});

test('AS malformed 首领特性被省略且不产生空文案', async ({ page }) => {
  await page.goto('/endgame/as/3003?encounter=30034');
  const slot = page.locator('[data-as-battle-slot="2"]');
  await expect(slot.locator('[data-as-boss-traits] .endgame-mechanic-entry')).toHaveCount(3);
  await expect(slot).not.toContainText('枯木逢春');
  expect(
    await slot
      .locator('[data-as-boss-traits] .endgame-mechanic-entry__title')
      .evaluateAll((headings) => headings.every((heading) => !!heading.textContent?.trim()))
  ).toBe(true);
});

test('AS 敌方网格与 mechanics 保持既有双栏比例并响应式堆叠', async ({ page }) => {
  await page.goto('/endgame/as/3001?encounter=30014');
  const layout = page.locator('[data-as-battle-slot="1"] .as-battle-section__layout');
  const enemies = page.locator('[data-as-battle-slot="1"] [data-as-battle-enemies]');
  const mechanics = page.locator('[data-as-battle-slot="1"] [data-as-boss-mechanics]');

  for (const width of [1440, 1200]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await gridColumnCount(layout)).toBe(2);
    const enemiesBox = await enemies.boundingBox();
    const mechanicsBox = await mechanics.boundingBox();
    expect(enemiesBox).not.toBeNull();
    expect(mechanicsBox).not.toBeNull();
    expect(enemiesBox!.x).toBeLessThan(mechanicsBox!.x);
    expect(enemiesBox!.width).toBeLessThan(mechanicsBox!.width);
  }

  for (const width of [900, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await gridColumnCount(layout)).toBe(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 390, height: 900 });
  expect(await gridColumnCount(enemies.locator('[data-enemy-grid]'))).toBe(1);
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await gridColumnCount(enemies.locator('[data-enemy-grid]'))).toBe(1);
});

test('AA normal/hard 切换 traits 并复用一份裁决象限', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/endgame/aa/8?encounter=804%3Anormal');
  const composition = page.locator('[data-aa-mechanics-composition]');
  const quadrant = page.locator('[data-endgame-mechanics="judgment-quadrant"]');
  const traits = page.locator('[data-endgame-mechanics="chess-traits"]');
  await expect(composition).toHaveClass(/endgame-aa-mechanics-composition--paired/);
  expect(
    await composition
      .locator(':scope > section')
      .evaluateAll((sections) =>
        sections.map((section) => section.getAttribute('data-endgame-mechanics'))
      )
  ).toEqual(['chess-traits', 'judgment-quadrant']);
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
  await expect(page.locator('[data-aa-mechanics-composition] > section')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '挑衅', exact: true })).toBeVisible();
});

test('AA paired mechanics 在宽桌面并排，并在桌面、平板与手机按 traits-first 堆叠', async ({
  page
}) => {
  await page.goto('/endgame/aa/8?encounter=804%3Anormal');
  const composition = page.locator('[data-aa-mechanics-composition]');
  const quadrant = composition.locator('[data-endgame-mechanics="judgment-quadrant"]');
  const traits = composition.locator('[data-endgame-mechanics="chess-traits"]');

  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(await gridColumnCount(composition)).toBe(2);
  expect(await gridColumnCount(quadrant.locator('.endgame-option-grid'))).toBe(1);
  expect(await gridColumnCount(traits.locator('.endgame-trait-grid'))).toBe(1);
  const quadrantBox = await quadrant.boundingBox();
  const traitsBox = await traits.boundingBox();
  expect(quadrantBox).not.toBeNull();
  expect(traitsBox).not.toBeNull();
  expect(quadrantBox!.x).toBeLessThan(traitsBox!.x);
  expect(quadrantBox!.width).toBeGreaterThan(traitsBox!.width);

  for (const [width, optionColumns] of [
    [1200, 2],
    [900, 1],
    [390, 1]
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await gridColumnCount(composition)).toBe(1);
    expect(await gridColumnCount(quadrant.locator('.endgame-option-grid'))).toBe(optionColumns);
    const traitBox = await traits.boundingBox();
    const quadrantStackBox = await quadrant.boundingBox();
    expect(traitBox).not.toBeNull();
    expect(quadrantStackBox).not.toBeNull();
    expect(traitBox!.y).toBeLessThan(quadrantStackBox!.y);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
  await expect(page.getByRole('heading', { name: '战斗规则' })).toHaveCount(0);
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
  await expect(card.locator('.endgame-enemy__level')).toHaveCount(0);
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
  const identityBox = await card.locator('.endgame-enemy__identity').boundingBox();
  const statsBox = await card.locator('.endgame-enemy__stats').boundingBox();
  expect(identityBox).not.toBeNull();
  expect(statsBox).not.toBeNull();
  expect(statsBox!.y - (identityBox!.y + identityBox!.height)).toBeLessThanOrEqual(20);

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

test('PF 保留 compact variant，AS 与其它模式复用 standard 敌方卡', async ({ page }) => {
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
  expect(
    await page
      .locator('[data-endgame-enemy-card]')
      .evaluateAll((cards) =>
        cards.every((card) => card.getAttribute('data-enemy-card-variant') === 'standard')
      )
  ).toBe(true);
  await expect(page.locator('[data-as-boss-profile], .as-enemy-profile-card')).toHaveCount(0);
  await expect(page.locator('.endgame-wave-list')).toHaveCount(0);

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
  const weaknesses = enemy.locator('.endgame-weaknesses [data-icon-kind="element"]');
  await expect(weaknesses).toHaveCount(2);
  expect(
    await weaknesses.evaluateAll((items) =>
      items.map((item) => [item.getAttribute('role'), item.getAttribute('aria-label')])
    )
  ).toEqual([
    ['img', '雷'],
    ['img', '虚数']
  ]);
  await expect(weaknesses.locator(':scope > span')).toHaveCount(0);
  await expect(enemy.locator('[data-endgame-speed]')).toHaveText('120');
  await expect(enemy.locator('[data-endgame-toughness]')).toHaveText('30');
});

test('四种 Endgame 模式的统一敌方卡只显示可访问的弱点图标', async ({ page }) => {
  for (const url of [
    '/endgame/moc/1034?encounter=5312',
    '/endgame/pf/2025?encounter=20254',
    '/endgame/as/3020?encounter=30204',
    '/endgame/aa/8?encounter=804%3Ahard'
  ]) {
    await page.goto(url);
    const weaknesses = page.locator(
      '[data-endgame-enemy-card] .endgame-weaknesses [data-icon-kind="element"]'
    );
    expect(await weaknesses.count()).toBeGreaterThan(0);
    await expect(weaknesses.locator(':scope > span')).toHaveCount(0);
    expect(
      await weaknesses.evaluateAll((items) =>
        items.every(
          (item) => item.getAttribute('role') === 'img' && !!item.getAttribute('aria-label')
        )
      )
    ).toBe(true);
  }
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
  await expect(weaknesses.locator(':scope > span')).toHaveCount(0);
  expect(
    await weaknesses.evaluateAll((items) =>
      items.map((item) => [item.getAttribute('role'), item.getAttribute('aria-label')])
    )
  ).toEqual([
    ['img', '火'],
    ['img', '冰'],
    ['img', '雷'],
    ['img', '量子']
  ]);
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
