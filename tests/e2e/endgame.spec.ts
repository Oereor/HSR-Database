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
  await expect(page.getByRole('heading', { name: '高难模式', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /混沌回忆/ }).first()).toBeVisible();

  await page.goto('/endgame/moc');
  await expect(page.getByRole('heading', { name: '混沌回忆赛期', level: 1 })).toHaveClass(
    /sr-only/
  );
  await expect(page.getByRole('link', { name: /扫除风暴/ })).toBeVisible();

  await page.goto('/endgame/moc/1034?encounter=5312');
  await expect(page.getByRole('heading', { name: '扫除风暴', exact: true })).toBeVisible();
  await expect(page.locator('[data-battle-slot]')).toHaveCount(3);
});

test('Endgame overview 使用统一 Hero、3 + 1 卡片和严格日期降级', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/endgame');

  await expect(page.getByText('DATABASE / ENDGAME', { exact: true })).toBeVisible();
  await expect(page.getByText('共 4 种模式', { exact: true })).toBeVisible();
  await expect(page.locator('.endgame-hero-artwork__icon')).toHaveCount(4);
  await expect(page.getByRole('navigation', { name: '高难模式切换' })).toHaveCount(0);
  await expect(page.getByText(/生命值来自关卡中实际 MonsterID/)).toHaveCount(0);

  const cards = page.locator('[data-endgame-overview-card]');
  await expect(cards).toHaveCount(4);
  await expect(page.locator('.endgame-overview-grid > [data-endgame-overview-card]')).toHaveCount(
    3
  );
  await expect(page.locator('[data-endgame-overview-card="aa"]')).toHaveClass(
    /endgame-overview-card--featured/
  );
  await expect(page.locator('[data-endgame-overview-card="moc"]')).toContainText('扫除风暴');
  await expect(page.locator('[data-endgame-overview-card="moc"]')).toContainText('-');
  await expect(page.locator('[data-endgame-overview-card="pf"]')).toContainText(
    '2026/08/03 – 2026/09/14'
  );
  await expect(page.locator('[data-endgame-overview-card="aa"]')).toContainText('军团再临');
  await expect(page.locator('[data-endgame-overview-card="aa"]')).toContainText('-');
  await expect(cards.getByText(/MOC|PF|AS|AA/, { exact: true })).toHaveCount(0);

  expect(await gridColumnCount(page.locator('.endgame-overview-grid'))).toBe(3);
  const footerTops = await page
    .locator('.endgame-overview-grid .endgame-overview-card__footer')
    .evaluateAll((footers) => footers.map((footer) => footer.getBoundingClientRect().top));
  expect(Math.max(...footerTops) - Math.min(...footerTops)).toBeLessThanOrEqual(1);

  const firstCard = page.locator('[data-endgame-overview-card="moc"]');
  await firstCard.focus();
  expect(
    await firstCard.evaluate((element) => ({
      tag: element.tagName,
      outline: getComputedStyle(element).outlineStyle
    }))
  ).toEqual({ tag: 'A', outline: 'solid' });

  for (const width of [900, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await gridColumnCount(page.locator('.endgame-overview-grid'))).toBe(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test('Endgame mode archive 按真实状态共享 Current、Upcoming、Unknown 与 History 布局', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto('/endgame/moc');
  await expect(page.locator('.endgame-mode-summary')).toHaveCount(0);
  await expect(page.getByText(/按楼层查看固定编队/)).toHaveCount(0);
  await expect(page.getByText('56 个赛期', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '时间未知', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '历史赛期', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '当前赛期', level: 2 })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '即将开放', level: 2 })).toBeVisible();
  await expect(page.locator('[data-endgame-season-card="upcoming"]')).toHaveCount(2);
  const mocUnknown = page.locator('[data-endgame-season-card="unknown"]');
  await expect(mocUnknown).toHaveCount(4);
  await expect(mocUnknown.locator('.endgame-season-card__date')).toHaveText(['-', '-', '-', '-']);
  await expect(page.locator('[data-endgame-season-card="historical"]')).toHaveCount(50);
  const sweep = page.getByRole('link', { name: '扫除风暴，查看赛期详情', exact: true });
  await expect(sweep).toHaveAttribute('href', '/endgame/moc/1034');
  await expect(sweep).toContainText('12 个关卡');

  await page.goto('/endgame/pf');
  await expect(page.getByRole('heading', { name: '当前赛期', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '即将开放', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '历史赛期', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /时间未知/, level: 2 })).toHaveCount(0);
  const current = page.locator('[data-endgame-season-card="current"]');
  const upcoming = page.locator('[data-endgame-season-card="upcoming"]');
  const history = page.locator('[data-endgame-season-card="historical"]');
  await expect(current).toHaveCount(1);
  await expect(current).toContainText('构事生意');
  await expect(upcoming).toHaveCount(1);
  await expect(upcoming).toContainText('立界开篇');
  await expect(history).toHaveCount(24);
  await expect(current.locator('.endgame-season-card__watermark')).toHaveAttribute(
    'aria-hidden',
    'true'
  );
  await expect(upcoming.locator('.endgame-season-card__watermark')).toHaveCount(0);
  await expect(history.locator('.endgame-season-card__watermark')).toHaveCount(0);
  await expect(page.locator('.endgame-period-status')).toHaveCount(0);
  const heights = await Promise.all([
    current.evaluate((element) => element.getBoundingClientRect().height),
    upcoming.evaluate((element) => element.getBoundingClientRect().height),
    history.first().evaluate((element) => element.getBoundingClientRect().height)
  ]);
  expect(heights[0]).toBeGreaterThan(heights[1]);
  expect(heights[1]).toBeGreaterThan(heights[2]);
  const desktopUpcomingSpacing = await upcoming.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft
    };
  });
  expect(desktopUpcomingSpacing).toEqual({
    paddingTop: '16px',
    paddingRight: '24px',
    paddingBottom: '16px',
    paddingLeft: '24px'
  });
  await current.focus();
  await expect(current).toBeFocused();
  expect(await current.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');

  await page.setViewportSize({ width: 390, height: 900 });
  const mobileUpcomingSpacing = await upcoming.evaluate((element) => {
    const style = getComputedStyle(element);
    const cardRect = element.getBoundingClientRect();
    const titleRect = element.querySelector('h3')!.getBoundingClientRect();
    const footerRect = element
      .querySelector('.endgame-season-card__footer')!
      .getBoundingClientRect();
    const arrowRect = element.querySelector('.endgame-season-card__arrow')!.getBoundingClientRect();
    return {
      padding: style.padding,
      topInset: titleRect.top - cardRect.top,
      leftInset: titleRect.left - cardRect.left,
      bottomInset: cardRect.bottom - footerRect.bottom,
      rightInset: cardRect.right - arrowRect.right
    };
  });
  expect(mobileUpcomingSpacing.padding).toBe('16px');
  expect(mobileUpcomingSpacing.topInset).toBeGreaterThan(16);
  expect(mobileUpcomingSpacing.leftInset).toBeGreaterThan(16);
  expect(mobileUpcomingSpacing.bottomInset).toBeGreaterThan(16);
  expect(mobileUpcomingSpacing.rightInset).toBeGreaterThan(16);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto('/endgame/as');
  await expect(page.locator('[data-endgame-season-card="current"]')).toHaveCount(1);
  await expect(page.locator('[data-endgame-season-card="historical"]')).toHaveCount(19);
  await expect(page.getByRole('heading', { name: '即将开放', level: 2 })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /时间未知/, level: 2 })).toHaveCount(0);

  await page.goto('/endgame/aa');
  await expect(page.getByRole('heading', { name: '时间未知', level: 2 })).toBeVisible();
  await expect(page.locator('[data-endgame-season-card="unknown"]')).toHaveCount(9);
  await expect(page.locator('[data-endgame-season-card="current"]')).toHaveCount(0);
  await expect(page.locator('[data-endgame-season-card="upcoming"]')).toHaveCount(0);
  await expect(page.locator('[data-endgame-season-card="historical"]')).toHaveCount(0);
});

test('Endgame archive grid 在四档宽度保持 4/3/2/1 列且无页面溢出', async ({ page }) => {
  await page.goto('/endgame/pf');
  const grid = page.locator('.endgame-archive-grid');
  for (const [width, columns] of [
    [1440, 4],
    [1100, 3],
    [768, 2],
    [390, 1]
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    expect(await gridColumnCount(grid)).toBe(columns);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test('Endgame floating switcher 保持四项页面导航与独立页面标题', async ({ page }) => {
  await page.goto('/endgame/pf/2025?encounter=20254');
  const modeNav = page.getByRole('navigation', { name: '高难模式切换' });
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
  await expect(activeMode.getByRole('heading')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '构事生意', level: 1 })).toBeVisible();
  await expect(page.getByText(/PF ENCOUNTER|PF PERIODS/)).toHaveCount(0);
});

test('Endgame floating switcher 使用模式 accent 并在长页面滚动时吸附', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  const expectations = [
    ['/endgame/moc', '混沌回忆', '#8157f0'],
    ['/endgame/pf', '虚构叙事', '#4fa4e1'],
    ['/endgame/as', '末日幻影', '#d068ed'],
    ['/endgame/aa', '异相仲裁', '#fb4554']
  ] as const;

  for (const [url, label, accent] of expectations) {
    await page.goto(url);
    const active = page
      .getByRole('navigation', { name: '高难模式切换' })
      .getByRole('link', { name: label, exact: true });
    await expect(active).toHaveAttribute('aria-current', 'page');
    expect(
      await active.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--endgame-accent').trim()
      )
    ).toBe(accent);
  }

  await page.goto('/endgame/moc');
  const switcher = page.locator('.endgame-mode-switcher');
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(500);
  expect(await switcher.evaluate((element) => getComputedStyle(element).position)).toBe('sticky');
  expect((await switcher.boundingBox())!.y).toBeLessThanOrEqual(14);
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

test('MoC、PF、AS 与全部 AA 关卡使用共享 Hero', async ({ page }) => {
  await page.goto('/endgame/moc/1034?encounter=5312');
  await expect(page.getByLabel('选择赛期')).toHaveCount(0);

  await page.goto('/endgame/pf/2025?encounter=20254');
  const hero = page.locator('.endgame-season-hero');
  await expect(page.getByLabel('选择赛期')).toHaveCount(0);
  await expect(hero.getByText('赛期 ID · 2025', { exact: true })).toBeVisible();
  await expect(hero.getByRole('heading', { name: '构事生意', level: 1 })).toBeVisible();
  await expect(hero).toContainText('2026/08/03 – 2026/09/14');
  await expect(hero).toContainText('当前');

  await page.goto('/endgame/as/3020?encounter=30204');
  const asHero = page.locator('.endgame-season-hero');
  await expect(page.getByLabel('选择赛期')).toHaveCount(0);
  await expect(asHero.getByText('赛期 ID · 3020', { exact: true })).toBeVisible();
  await expect(asHero.getByRole('heading', { name: '仙客天狼', level: 1 })).toBeVisible();
  await expect(asHero).toContainText('2026/08/31 – 2026/10/05');
  await expect(asHero).toContainText('当前');

  await page.goto('/endgame/aa/8?encounter=801%3Apreliminary');
  const knightHero = page.locator('.endgame-season-hero');
  await expect(page.getByLabel('选择赛期')).toHaveCount(0);
  await expect(knightHero.getByText('赛期 ID · 8', { exact: true })).toBeVisible();
  await expect(knightHero.getByRole('heading', { name: '尘世卷中', level: 1 })).toBeVisible();
  await expect(knightHero).toContainText('时间资料未提供');

  await page.goto('/endgame/aa/8?encounter=804%3Anormal');
  const kingHero = page.locator('.endgame-season-hero');
  await expect(page.getByLabel('选择赛期')).toHaveCount(0);
  await expect(kingHero.getByText('赛期 ID · 8', { exact: true })).toBeVisible();
  await expect(kingHero.getByRole('heading', { name: '尘世卷中', level: 1 })).toBeVisible();
  await expect(kingHero).toContainText('时间资料未提供');
});

test('MoC Hero 与三级 inline divider heading 建立明确层级', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/endgame/moc/1033');
  const hero = page.locator('.endgame-season-hero');
  await expect(hero.getByText('赛期 ID · 1033', { exact: true })).toBeVisible();
  await expect(hero.getByRole('heading', { name: '学院怪谈', level: 1 })).toBeVisible();
  await expect(hero).toContainText('2026/07/06 – 2026/08/17');
  expect(
    await hero
      .getByRole('heading', { name: '学院怪谈', level: 1 })
      .evaluate((element) => Number.parseInt(getComputedStyle(element).fontWeight, 10))
  ).toBeGreaterThanOrEqual(700);

  await page.goto('/endgame/moc/1034?encounter=5312');
  await expect(page.getByRole('heading', { name: '扫除风暴其十二', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '节点一', level: 3 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '波次一', level: 4 }).first()).toBeVisible();
  await expect(page.locator('.moc-encounter-heading')).not.toContainText('场战斗');
  await expect(page.locator('[data-battle-slot="1"]')).not.toContainText('战斗 1');
  await expect(
    page.locator('[data-battle-slot="1"] > .endgame-node-section__heading')
  ).not.toContainText('Lv.');
});

test('MoC 相同记忆紊流只展示一次并保留 GameText 格式', async ({ page }) => {
  await page.goto('/endgame/moc/1034?encounter=5312');
  const turbulence = page.locator('[data-endgame-mechanics="memory-turbulence"]');
  await expect(turbulence).toHaveCount(1);
  const surface = turbulence.locator('.season-mechanic-card');
  await expect(surface.getByRole('heading', { name: '记忆紊流', level: 2 })).toBeVisible();
  await expect(turbulence.locator(':scope > .section-heading')).toHaveCount(0);
  const percentage = turbulence.locator('[data-game-color="#f29e38ff"]').filter({ hasText: '80%' });
  await expect(percentage).toHaveCount(1);
  await expect(percentage).toHaveClass(/description-token--unbreak/);
  await expect(turbulence).toContainText('1回合');
  await expect(turbulence.locator('img')).toHaveCount(0);
  await expect(surface.getByRole('heading', { name: '记忆紊流', level: 2 })).toHaveCSS(
    'color',
    'rgb(241, 220, 162)'
  );
});

test('MoC WaveGroup 按卡片数量定宽并在窄屏保持分组原子性', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/endgame/moc/1034?encounter=5312');

  const firstNodeGroups = page.locator('[data-battle-slot="1"] [data-endgame-wave-group]');
  await expect(firstNodeGroups).toHaveCount(2);
  await expect(firstNodeGroups.nth(0).locator('[data-endgame-enemy-card]')).toHaveCount(2);
  await expect(firstNodeGroups.nth(1).locator('[data-endgame-enemy-card]')).toHaveCount(1);
  const firstNodeBoxes = await firstNodeGroups.evaluateAll((groups) =>
    groups.map((group) => {
      const box = group.getBoundingClientRect();
      return { width: box.width, y: box.y };
    })
  );
  expect(firstNodeBoxes[0].width).toBeGreaterThan(firstNodeBoxes[1].width * 1.7);
  expect(Math.abs(firstNodeBoxes[0].y - firstNodeBoxes[1].y)).toBeLessThanOrEqual(1);
  expect(
    await firstNodeGroups.nth(1).evaluate((group) => getComputedStyle(group, '::before').width)
  ).toBe('1px');

  const thirdNodeGroups = page.locator('[data-battle-slot="3"] [data-endgame-wave-group]');
  await expect(thirdNodeGroups.nth(0).locator('[data-endgame-enemy-card]')).toHaveCount(3);
  await expect(thirdNodeGroups.nth(1).locator('[data-endgame-enemy-card]')).toHaveCount(1);
  const thirdNodeY = await thirdNodeGroups.evaluateAll((groups) =>
    groups.map((group) => group.getBoundingClientRect().y)
  );
  expect(Math.abs(thirdNodeY[0] - thirdNodeY[1])).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 900, height: 1000 });
  const tabletBoxes = await firstNodeGroups.evaluateAll((groups) =>
    groups.map((group) => {
      const box = group.getBoundingClientRect();
      return { width: box.width, y: box.y };
    })
  );
  expect(tabletBoxes[1].y).toBeGreaterThan(tabletBoxes[0].y);
  expect(Math.abs(tabletBoxes[0].width - tabletBoxes[1].width)).toBeLessThanOrEqual(1);
  expect(
    await firstNodeGroups.nth(1).evaluate((group) => getComputedStyle(group, '::before').content)
  ).toBe('none');
  const tabletCardY = await firstNodeGroups
    .nth(0)
    .locator('[data-endgame-enemy-card]')
    .evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().y));
  expect(Math.abs(tabletCardY[0] - tabletCardY[1])).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileCardY = await firstNodeGroups
    .nth(0)
    .locator('[data-endgame-enemy-card]')
    .evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().y));
  expect(mobileCardY[1]).toBeGreaterThan(mobileCardY[0]);
  for (const width of [900, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test('MoC 两个单敌人 wave 保持内容宽度，不平分整行', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/endgame/moc/1025?encounter=4405');
  const groups = page.locator('[data-battle-slot="2"] [data-endgame-wave-group]');
  await expect(groups).toHaveCount(2);
  const boxes = await groups.evaluateAll((items) =>
    items.map((item) => {
      const box = item.getBoundingClientRect();
      return { width: box.width, y: box.y };
    })
  );
  expect(boxes.every(({ width }) => width < 320)).toBe(true);
  expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThanOrEqual(1);
});

test('MoC WaveLayout 按实际卡片数整体配对或换行', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto('/endgame/moc/100?encounter=5');
  const twoByTwo = page.locator('[data-battle-slot="1"] [data-endgame-wave-group]');
  await expect(twoByTwo).toHaveCount(2);
  await expect(twoByTwo.nth(0).locator('[data-endgame-enemy-card]')).toHaveCount(2);
  await expect(twoByTwo.nth(1).locator('[data-endgame-enemy-card]')).toHaveCount(2);
  const pairedBoxes = await twoByTwo.evaluateAll((groups) =>
    groups.map((group) => {
      const box = group.getBoundingClientRect();
      const cardY = [...group.querySelectorAll('[data-endgame-enemy-card]')].map(
        (card) => card.getBoundingClientRect().y
      );
      return { width: box.width, y: box.y, cardY };
    })
  );
  expect(Math.abs(pairedBoxes[0].y - pairedBoxes[1].y)).toBeLessThanOrEqual(1);
  expect(Math.abs(pairedBoxes[0].width - pairedBoxes[1].width)).toBeLessThanOrEqual(1);
  expect(new Set(pairedBoxes[0].cardY.map(Math.round)).size).toBe(1);
  expect(new Set(pairedBoxes[1].cardY.map(Math.round)).size).toBe(1);

  await page.goto('/endgame/moc/100?encounter=3');
  const threeByTwo = page.locator('[data-battle-slot="1"] [data-endgame-wave-group]');
  await expect(threeByTwo).toHaveCount(2);
  const wrappedY = await threeByTwo.evaluateAll((groups) =>
    groups.map((group) => group.getBoundingClientRect().y)
  );
  expect(wrappedY[1]).toBeGreaterThan(wrappedY[0]);

  await page.goto('/endgame/moc/100?encounter=11');
  const oneByTwo = page.locator('[data-battle-slot="1"] [data-endgame-wave-group]');
  await expect(oneByTwo).toHaveCount(2);
  const asymmetricBoxes = await oneByTwo.evaluateAll((groups) =>
    groups.map((group) => {
      const box = group.getBoundingClientRect();
      return { width: box.width, y: box.y };
    })
  );
  expect(Math.abs(asymmetricBoxes[0].y - asymmetricBoxes[1].y)).toBeLessThanOrEqual(1);
  expect(asymmetricBoxes[1].width).toBeGreaterThan(asymmetricBoxes[0].width * 1.7);
});

test('PF 战意机制复用 segmented MechanicSectionCard，荒腔走板保持静态中性', async ({ page }) => {
  await page.goto('/endgame/pf/2025?encounter=20254');
  const battleWill = page.locator('[data-endgame-mechanics="battle-will"]');
  const fixedSurface = battleWill.locator('.season-mechanic-card');
  await expect(fixedSurface).toHaveCount(1);
  await expect(fixedSurface.getByRole('heading', { name: '战意机制', level: 2 })).toBeVisible();
  await expect(battleWill.locator('.season-mechanic-card__segment')).toHaveCount(3);
  await expect(battleWill.locator('.season-mechanic-card__segment h3')).toHaveText([
    '追加攻击',
    '战熄潮平',
    '战意汹涌'
  ]);
  await expect(battleWill.getByRole('heading', { name: '追加攻击' })).toBeVisible();
  await expect(battleWill.getByRole('heading', { name: '战熄潮平' })).toBeVisible();
  await expect(battleWill.getByRole('heading', { name: '战意汹涌' })).toBeVisible();
  await expect(fixedSurface.getByRole('heading', { name: '战意机制', level: 2 })).toHaveCSS(
    'color',
    'rgb(241, 220, 162)'
  );

  const cacophony = page.locator('[data-endgame-mechanics="cacophony"]');
  await expect(cacophony.getByText(/三选一/)).toHaveCount(0);
  await expect(cacophony.locator('[data-buff-option-tile]')).toHaveCount(3);
  await expect(cacophony.getByRole('heading', { name: '暴言' })).toBeVisible();
  await expect(cacophony.getByRole('heading', { name: '高论' })).toBeVisible();
  await expect(cacophony.getByRole('heading', { name: '快嘴' })).toBeVisible();
  await expect(cacophony.locator('button, input, [role="button"], [tabindex]')).toHaveCount(0);
  await expect(cacophony.locator('img')).toHaveCount(0);
  expect(
    await cacophony
      .locator('[data-buff-option-tile]')
      .first()
      .evaluate((element) => ({
        cursor: getComputedStyle(element).cursor,
        boxShadow: getComputedStyle(element).boxShadow
      }))
  ).toEqual({ cursor: 'auto', boxShadow: 'none' });

  await page.goto('/endgame/pf/2001?encounter=20014');
  const historical = page.locator('[data-endgame-mechanics="battle-will"]');
  await expect(historical.locator('.season-mechanic-card__segment')).toHaveCount(1);
  await expect(historical.locator('[data-season-mechanic-segments]')).toHaveAttribute(
    'data-season-mechanic-segments',
    '1'
  );
});

test('PF 战意与荒腔走板按真实内容宽度降级为 3/2/1 列', async ({ page }) => {
  await page.goto('/endgame/pf/2025?encounter=20254');
  const fixedEntries = page.locator(
    '[data-endgame-mechanics="battle-will"] .season-mechanic-card__segments'
  );
  const options = page.locator('[data-endgame-mechanics="cacophony"] [data-buff-option-grid]');
  for (const [width, expectedColumns] of [
    [1440, 3],
    [1100, 2],
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

test('AS 节点使用 BossDossier、共享敌方卡、首领特性与中性终焉公理', async ({ page }) => {
  await page.goto('/endgame/as/3020?encounter=30204');
  const aftertaste = page.locator('[data-endgame-mechanics="aftertaste"]');
  await expect(aftertaste.getByRole('heading', { name: '末法余烬', level: 2 })).toBeVisible();
  await expect(aftertaste.locator('.season-mechanic-card')).toHaveCount(1);
  await expect(page.locator('[data-endgame-mechanics="axiom"]')).toHaveCount(3);
  await expect(page.locator('[data-endgame-mechanics="boss-traits"]')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: '首领特性', level: 4 })).toHaveCount(3);
  await expect(page.getByRole('heading', { name: '首领幻影', level: 4 })).toHaveCount(3);
  await expect(page.getByRole('heading', { name: '关卡效果', exact: true })).toHaveCount(0);
  for (const [slot, ordinal] of [
    ['1', '一'],
    ['2', '二'],
    ['3', '三']
  ] as const) {
    const battle = page.locator(`[data-as-battle-slot="${slot}"]`);
    await expect(battle.getByRole('heading', { name: `节点${ordinal}`, level: 3 })).toBeVisible();
    await expect(battle).not.toContainText(`战斗 ${slot}`);
    await expect(battle.locator('[data-endgame-enemy-card]')).toHaveCount(1);
    await expect(battle.locator('[data-endgame-enemy-card]')).toHaveAttribute(
      'data-enemy-card-variant',
      'standard'
    );
    await expect(battle.locator('[data-endgame-enemy-card] .endgame-enemy__level')).toHaveText(
      'Lv.90'
    );
    await expect(battle.locator('[data-endgame-mechanics="axiom"]')).toHaveCount(1);
    await expect(
      battle.locator('[data-endgame-mechanics="axiom"] [data-buff-option-tile]')
    ).toHaveCount(3);
    await expect(
      battle.locator('[data-endgame-mechanics="axiom"] button, input, [role="button"], [tabindex]')
    ).toHaveCount(0);
    await expect(battle.getByText('三选一', { exact: true })).toHaveCount(0);
    await expect(battle.locator('[data-as-boss-traits] .endgame-mechanic-entry')).toHaveCount(4);
    const dossierBox = await battle.locator('[data-as-boss-dossier]').boundingBox();
    const axiomBox = await battle.locator('[data-endgame-mechanics="axiom"]').boundingBox();
    expect(dossierBox).not.toBeNull();
    expect(axiomBox).not.toBeNull();
    expect(axiomBox!.y).toBeGreaterThan(dossierBox!.y + dossierBox!.height);
  }
  const slotOne = page.locator('[data-as-battle-slot="1"]');
  await expect(slotOne.getByRole('heading', { name: '坚防守备', exact: true })).toBeVisible();
  await expect(slotOne.getByRole('heading', { name: '丰亨豫大', exact: true })).toBeVisible();
  await expect(slotOne.getByRole('heading', { name: '如鹿添翼', exact: true })).toBeVisible();
  await expect(slotOne.getByRole('heading', { name: '仙光夺目', exact: true })).toBeVisible();
  await expect(slotOne.locator('[data-as-boss-traits]')).toContainText('50%');
  await expect(slotOne.locator('[data-as-boss-traits]')).toContainText('100%');
  const traitRhythm = await slotOne
    .locator('[data-as-boss-traits] .endgame-mechanic-entry')
    .nth(1)
    .evaluate((trait) => {
      const style = getComputedStyle(trait);
      const goldProbe = document.createElement('span');
      goldProbe.style.color = 'var(--gold)';
      document.body.append(goldProbe);
      const gold = getComputedStyle(goldProbe).color;
      goldProbe.remove();
      return {
        marginTop: style.marginTop,
        paddingTop: style.paddingTop,
        borderTopWidth: style.borderTopWidth,
        borderTopColor: style.borderTopColor,
        gold
      };
    });
  expect(traitRhythm).toMatchObject({
    marginTop: '24px',
    paddingTop: '24px',
    borderTopWidth: '1px'
  });
  expect(traitRhythm.borderTopColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(traitRhythm.borderTopColor).not.toBe(traitRhythm.gold);
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
    await slotThreeExplanations.evaluate((explanations) => {
      const trait = explanations.closest('.endgame-mechanic-entry');
      return (
        trait !== null &&
        trait.contains(explanations) &&
        trait.querySelector(':scope > p')?.compareDocumentPosition(explanations) ===
          Node.DOCUMENT_POSITION_FOLLOWING
      );
    })
  ).toBe(true);
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
});

test('AS 多敌人 slot 在固定一卡宽 roster 中纵向排列并保留完整战斗数据', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
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
  const enemyBoxes = await enemies.evaluateAll((cards) =>
    cards.map((card) => ({
      x: card.getBoundingClientRect().x,
      y: card.getBoundingClientRect().y,
      width: card.getBoundingClientRect().width
    }))
  );
  expect(Math.round(enemyBoxes[0].x)).toBe(Math.round(enemyBoxes[1].x));
  expect(enemyBoxes[1].y).toBeGreaterThan(enemyBoxes[0].y);
  expect(enemyBoxes.every(({ width }) => width <= 260.5)).toBe(true);
  for (const monsterId of ['100401404', '100402604']) {
    const enemy = slot.locator(`[data-monster-id="${monsterId}"]`);
    await expect(enemy.locator('.endgame-enemy__level')).toHaveText('Lv.90');
    await expect(enemy.locator('[data-endgame-hp]')).toBeVisible();
    await expect(enemy.locator('[data-endgame-speed]')).toBeVisible();
    await expect(enemy.locator('[data-endgame-toughness]')).toBeVisible();
    await expect(enemy.locator('.endgame-weaknesses')).toBeVisible();
  }
  await expect(slot.getByText('主首领', { exact: true })).toHaveCount(0);
  await expect(slot.getByText('随行敌人', { exact: true })).toHaveCount(0);
  await expect(slot.locator('[data-as-boss-profile], .as-enemy-profile-card')).toHaveCount(0);
  await expect(slot.getByRole('heading', { name: '首领幻影', level: 4 })).toBeVisible();
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

test('AS BossDossier 使用固定卡片列、可读特性列并按内容宽度堆叠', async ({ page }) => {
  await page.goto('/endgame/as/3001?encounter=30014');
  const layout = page.locator('[data-as-battle-slot="1"] [data-as-boss-dossier]');
  const roster = page.locator('[data-as-battle-slot="1"] [data-as-boss-roster]');
  const traits = page.locator('[data-as-battle-slot="1"] [data-as-boss-traits]');

  for (const width of [1440, 1200, 900]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await gridColumnCount(layout)).toBe(2);
    const rosterBox = await roster.boundingBox();
    const traitsBox = await traits.boundingBox();
    expect(rosterBox).not.toBeNull();
    expect(traitsBox).not.toBeNull();
    expect(rosterBox!.x).toBeLessThan(traitsBox!.x);
    expect(rosterBox!.width).toBeLessThanOrEqual(260.5);
    expect(traitsBox!.width).toBeGreaterThan(360);
  }

  for (const width of [700, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await gridColumnCount(layout)).toBe(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(await gridColumnCount(roster.locator('[data-enemy-grid]'))).toBe(1);

  const axiomGrid = page.locator(
    '[data-as-battle-slot="1"] [data-endgame-mechanics="axiom"] [data-buff-option-grid]'
  );
  for (const [width, expectedColumns] of [
    [1440, 3],
    [900, 2],
    [390, 1]
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await gridColumnCount(axiomGrid)).toBe(expectedColumns);
  }

  await page.goto('/endgame/as/3005?encounter=30054');
  for (const width of [900, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
    ).toBeLessThanOrEqual(1);
  }
});

test('AA normal/hard 共用新详情组合，并在棋局特性与波次之间复用裁决象限', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/endgame/aa/8?encounter=804%3Anormal');
  const detail = page.locator('[data-aa-stage-detail]');
  const quadrant = page.locator('[data-endgame-mechanics="judgment-quadrant"]');
  const traits = page.locator('[data-endgame-mechanics="chess-traits"]');
  const waves = page.locator('[data-aa-waves]');
  await expect(detail).toHaveCount(1);
  expect(
    await detail
      .locator(':scope > *')
      .evaluateAll((sections) =>
        sections.map(
          (section) =>
            section.getAttribute('data-endgame-mechanics') ??
            (section.hasAttribute('data-aa-waves') ? 'waves' : null)
        )
      )
  ).toEqual(['chess-traits', 'judgment-quadrant', 'waves']);
  await expect(quadrant).toHaveCount(1);
  await expect(quadrant.getByRole('heading', { name: '裁决象限', level: 2 })).toBeVisible();
  await expect(quadrant.locator('[data-buff-option-tile]')).toHaveCount(3);
  await expect(quadrant.locator('input, button, [role="radio"], [role="checkbox"]')).toHaveCount(0);
  await expect(traits.getByRole('heading', { name: '激怒', exact: true })).toBeVisible();
  await expect(traits.getByRole('heading', { name: '均衡', exact: true })).toBeVisible();
  await expect(traits.getByText('激怒+', { exact: true })).toHaveCount(0);
  await expect(traits.locator('[data-mechanic-tone="debuff"]')).toHaveCount(1);
  await expect(waves.locator('[data-endgame-wave-group]')).toHaveCount(2);
  await expect(waves.locator('[data-endgame-enemy-card]')).toHaveCount(4);
  await expect(waves.locator('.endgame-enemy__level')).toHaveText([
    'Lv.100',
    'Lv.100',
    'Lv.100',
    'Lv.100'
  ]);
  await expect(page.getByText('战斗 1', { exact: true })).toHaveCount(0);
  await expect(page.getByText('节点一', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '将杀王棋', exact: true })).toHaveCount(0);

  await selectLocalNode(page, '将杀王棋•绝境');
  await expect(page).toHaveURL(/encounter=804%3Ahard/);
  await expect(quadrant).toHaveCount(1);
  await expect(traits.getByRole('heading', { name: '激怒+', exact: true })).toBeVisible();
  await expect(traits.getByRole('heading', { name: '均衡+', exact: true })).toBeVisible();
  await expect(traits.getByRole('heading', { name: '激怒', exact: true })).toHaveCount(0);
  await expect(waves.locator('.endgame-enemy__level')).toHaveText([
    'Lv.120',
    'Lv.120',
    'Lv.120',
    'Lv.120'
  ]);
  await expect(page.getByRole('heading', { name: '战斗规则' })).toHaveCount(0);

  await selectLocalNode(page, '骑士（一）');
  await expect(page).toHaveURL(/encounter=801%3Apreliminary/);
  await expect(page.locator('[data-endgame-mechanics="judgment-quadrant"]')).toHaveCount(0);
  await expect(page.locator('[data-aa-stage-detail]')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '挑衅', exact: true })).toBeVisible();
});

test('AA 骑士正文从 debuff 棋局特性进入共享波次，且不保留冗余 wrapper 标题', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/endgame/aa/8?encounter=801%3Apreliminary');
  const main = page.locator('.endgame-main-content');
  const knight = main.locator('[data-aa-stage-detail]');
  const singleTraits = knight.locator('[data-endgame-mechanics="chess-traits"]');

  await expect(
    page.locator('.endgame-local-nav').getByRole('link', { name: '骑士（一）' })
  ).toHaveAttribute('aria-current', 'page');
  await expect(singleTraits.getByRole('heading', { name: '棋局特性', level: 2 })).toBeVisible();
  await expect(singleTraits.getByRole('heading', { name: '挑衅', level: 3 })).toBeVisible();
  await expect(singleTraits.locator('[data-mechanic-tone="debuff"]')).toHaveCount(1);
  expect(await gridColumnCount(singleTraits.locator('[data-mechanic-section-segments]'))).toBe(1);
  await expect(main.getByRole('heading', { name: '骑士（一）', exact: true })).toHaveCount(0);
  await expect(main.getByText('战斗 1', { exact: true })).toHaveCount(0);
  await expect(main.getByText('节点一', { exact: true })).toHaveCount(0);
  await expect(main.locator('h2, h3, h4').first()).toHaveText('棋局特性');

  await page.goto('/endgame/aa/8?encounter=802%3Apreliminary');
  const traits = page.locator('[data-endgame-mechanics="chess-traits"]');
  const surface = traits.locator('[data-mechanic-tone="debuff"]');
  const segments = traits.locator('.mechanic-section-card__segment');
  await expect(segments).toHaveCount(2);
  await expect(segments.locator('h3')).toHaveText(['破势', '失能']);
  expect(await gridColumnCount(traits.locator('[data-mechanic-section-segments]'))).toBe(2);
  const segmentBoxes = await segments.evaluateAll((items) =>
    items.map((item) => ({
      x: item.getBoundingClientRect().x,
      width: item.getBoundingClientRect().width
    }))
  );
  expect(Math.abs(segmentBoxes[0].width - segmentBoxes[1].width)).toBeLessThanOrEqual(1);
  expect(segmentBoxes[1].x).toBeGreaterThan(segmentBoxes[0].x);

  const debuffStyle = await surface.evaluate((element) => {
    const style = getComputedStyle(element);
    const token = element.querySelector<HTMLElement>('[data-game-color]');
    const orangeProbe = document.createElement('span');
    orangeProbe.style.color = '#f29e38';
    document.body.append(orangeProbe);
    const sourceOrange = getComputedStyle(orangeProbe).color;
    orangeProbe.remove();
    return {
      borderLeftWidth: style.borderLeftWidth,
      borderLeftColor: style.borderLeftColor,
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      tokenColor: token ? getComputedStyle(token).color : '',
      sourceOrange
    };
  });
  expect(debuffStyle.borderLeftWidth).toBe('2px');
  expect(debuffStyle.borderLeftColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(debuffStyle.backgroundColor).not.toBe('rgb(251, 69, 84)');
  expect(debuffStyle.backgroundImage).toContain('linear-gradient');
  expect(debuffStyle.tokenColor).not.toBe(debuffStyle.sourceOrange);

  const waveLayout = page.locator('[data-aa-waves] [data-wave-layout="paired"]');
  const waveGroups = waveLayout.locator('[data-endgame-wave-group]');
  await expect(waveGroups).toHaveCount(2);
  await expect(waveGroups.locator('h4')).toHaveText(['波次一', '波次二']);
  await expect(waveGroups.nth(0).locator('[data-endgame-enemy-card]')).toHaveCount(2);
  await expect(waveGroups.nth(1).locator('[data-endgame-enemy-card]')).toHaveCount(2);
  await expect(waveGroups.locator('.endgame-enemy__level')).toHaveText([
    'Lv.95',
    'Lv.95',
    'Lv.95',
    'Lv.95'
  ]);
  expect(
    await waveGroups
      .locator('[data-endgame-enemy-card]')
      .evaluateAll((cards) =>
        cards.every((card) => card.getAttribute('data-enemy-card-variant') === 'standard')
      )
  ).toBe(true);

  for (const [width, sameRow] of [
    [1440, true],
    [1200, false],
    [900, false],
    [390, false]
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    const positions = await waveGroups.evaluateAll((groups) =>
      groups.map((group) => ({
        y: group.getBoundingClientRect().y,
        width: group.getBoundingClientRect().width
      }))
    );
    expect(Math.round(positions[0].y) === Math.round(positions[1].y)).toBe(sameRow);
    if (!sameRow) expect(positions[1].y).toBeGreaterThan(positions[0].y);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  for (const grid of await waveLayout.locator('[data-enemy-grid]').all()) {
    expect(await gridColumnCount(grid)).toBe(1);
  }
});

test('AA 王棋的棋局特性、裁决象限与波次保持纵向节奏并复用共享响应式', async ({ page }) => {
  await page.goto('/endgame/aa/8?encounter=804%3Anormal');
  const detail = page.locator('[data-aa-stage-detail]');
  const traits = detail.locator('[data-endgame-mechanics="chess-traits"]');
  const quadrant = detail.locator('[data-endgame-mechanics="judgment-quadrant"]');
  const waves = detail.locator('[data-aa-waves]');

  for (const [width, traitColumns, optionColumns] of [
    [1440, 2, 3],
    [1200, 2, 3],
    [900, 2, 2],
    [390, 1, 1]
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await gridColumnCount(traits.locator('[data-mechanic-section-segments]'))).toBe(
      traitColumns
    );
    expect(await gridColumnCount(quadrant.locator('[data-buff-option-grid]'))).toBe(optionColumns);
    const traitBox = await traits.boundingBox();
    const quadrantBox = await quadrant.boundingBox();
    const wavesBox = await waves.boundingBox();
    expect(traitBox).not.toBeNull();
    expect(quadrantBox).not.toBeNull();
    expect(wavesBox).not.toBeNull();
    expect(traitBox!.y).toBeLessThan(quadrantBox!.y);
    expect(quadrantBox!.y).toBeLessThan(wavesBox!.y);
    expect(Math.abs(traitBox!.x - quadrantBox!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(quadrantBox!.x - wavesBox!.x)).toBeLessThanOrEqual(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test('AA 单波单敌人自然使用共享 WaveLayout，不产生王棋专属布局', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/endgame/aa/2?encounter=204%3Anormal');
  const layout = page.locator('[data-aa-waves] [data-wave-layout="paired"]');
  const group = layout.locator('[data-endgame-wave-group]');
  const card = group.locator('[data-endgame-enemy-card]');

  await expect(group).toHaveCount(1);
  await expect(group.getByRole('heading', { name: '波次一', level: 4 })).toBeVisible();
  await expect(card).toHaveCount(1);
  await expect(card.locator('.endgame-enemy__level')).toHaveText('Lv.100');
  const layoutBox = await layout.boundingBox();
  const groupBox = await group.boundingBox();
  expect(layoutBox).not.toBeNull();
  expect(groupBox).not.toBeNull();
  expect(Math.abs(layoutBox!.x - groupBox!.x)).toBeLessThanOrEqual(1);
  expect(groupBox!.width).toBeLessThanOrEqual(260);
  await expect(page.getByText('战斗 1', { exact: true })).toHaveCount(0);
  await expect(page.getByText('节点一', { exact: true })).toHaveCount(0);

  for (const width of [1200, 900, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
    ).toBeLessThanOrEqual(1);
  }
});

test('PF 只显示波内唯一敌人类型', async ({ page }) => {
  await page.goto('/endgame/pf/2025?encounter=20254');
  await expect(page.getByText(/重复生成、生成次数与先后顺序已省略/)).toBeVisible();
  const firstBattle = page.locator('[data-battle-slot="1"]');
  await expect(page.getByRole('heading', { name: '构事生意其四', level: 2 })).toBeVisible();
  await expect(firstBattle.getByRole('heading', { name: '节点一', level: 3 })).toBeVisible();
  await expect(firstBattle.locator('[data-wave] h4')).toHaveText(['波次一', '波次二', '波次三']);
  await expect(page.locator('.pf-encounter-heading')).not.toContainText('场战斗');
  await expect(firstBattle).not.toContainText('战斗 1');
  await expect(firstBattle.locator('.endgame-node-section__heading')).not.toContainText('Lv.');
  await expect(firstBattle.locator('[data-wave="spawn-303230411"] .endgame-enemy')).toHaveCount(4);
  await expect(firstBattle.locator('[data-wave="spawn-303230412"] .endgame-enemy')).toHaveCount(3);
  await expect(firstBattle.locator('[data-wave="spawn-303230413"] .endgame-enemy')).toHaveCount(3);
  await expect(firstBattle.locator('.endgame-enemy__count')).toHaveCount(0);
  const cards = firstBattle.locator('[data-endgame-enemy-card]');
  expect(
    await cards.evaluateAll((items) =>
      items.every((item) => item.getAttribute('data-endgame-enemy-level') === '85')
    )
  ).toBe(true);
  await expect(cards.first().locator('.endgame-enemy__level')).toHaveText('Lv.85');
});

test('敌方实体卡采用 portrait-first 信息层级并保留全部战斗字段', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/endgame/moc/1034?encounter=5312');
  const card = page.locator('[data-endgame-enemy-card]').first();
  const artwork = card.locator('.endgame-enemy__artwork');
  const name = card.locator('.endgame-enemy__name');
  await expect(card).toHaveAttribute('data-enemy-card-variant', 'standard');
  await expect(card).toHaveAttribute('data-endgame-enemy-level', '95');
  await expect(card.locator('.endgame-enemy__level')).toHaveText('Lv.95');
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

test('PF 保留 compact variant 并固定一波一行，AS 与其它模式继续使用原布局', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto('/endgame/pf/2025?encounter=20254');
  await expect(page.locator('[data-endgame-enemy-card]').first()).toHaveAttribute(
    'data-enemy-card-variant',
    'compact'
  );
  const pfWaves = page.locator('[data-battle-slot="1"] [data-wave-layout="stacked"]');
  await expect(pfWaves.locator('[data-wave]')).toHaveCount(3);
  const waveBoxes = await pfWaves.locator('[data-wave]').evaluateAll((waves) =>
    waves.map((wave) => {
      const box = wave.getBoundingClientRect();
      return { width: box.width, y: box.y };
    })
  );
  expect(waveBoxes[1].y).toBeGreaterThan(waveBoxes[0].y);
  expect(waveBoxes[2].y).toBeGreaterThan(waveBoxes[1].y);
  expect(
    Math.max(...waveBoxes.map(({ width }) => width)) -
      Math.min(...waveBoxes.map(({ width }) => width))
  ).toBeLessThanOrEqual(1);
  const firstWaveCardY = await pfWaves
    .locator('[data-wave]')
    .first()
    .locator('[data-endgame-enemy-card]')
    .evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().y));
  expect(new Set(firstWaveCardY.map(Math.round)).size).toBe(1);

  for (const width of [1200, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const rows = await pfWaves
      .locator('[data-wave]')
      .evaluateAll((waves) => waves.map((wave) => wave.getBoundingClientRect().y));
    expect(rows[1]).toBeGreaterThan(rows[0]);
    expect(rows[2]).toBeGreaterThan(rows[1]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
    ).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });

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

  await page.goto('/endgame/aa/8?encounter=804%3Ahard');
  await expect(page.locator('[data-endgame-enemy-card]').first()).toHaveAttribute(
    'data-enemy-card-variant',
    'standard'
  );
});

test('AA Group 6 波次按桌面、平板与手机宽度自适应且不改变 2+1+1 投影', async ({ page }) => {
  await page.goto('/endgame/aa/6?encounter=604%3Anormal');
  const waveLayout = page.locator('[data-aa-waves] [data-wave-layout="paired"]');
  const waveGroups = waveLayout.locator('[data-endgame-wave-group]');
  await expect(waveGroups).toHaveCount(3);
  await expect(waveGroups.nth(0).locator('[data-endgame-enemy-card]')).toHaveCount(2);
  await expect(waveGroups.nth(1).locator('[data-endgame-enemy-card]')).toHaveCount(1);
  await expect(waveGroups.nth(2).locator('[data-endgame-enemy-card]')).toHaveCount(1);
  await expect(waveGroups.locator('h4')).toHaveText(['波次一', '波次二', '波次三']);
  await expect(waveGroups.locator('.endgame-enemy__level')).toHaveText([
    'Lv.100',
    'Lv.100',
    'Lv.100',
    'Lv.100'
  ]);

  await page.setViewportSize({ width: 1440, height: 1000 });
  const desktopRows = await waveGroups.evaluateAll((groups) =>
    groups.map((group) => group.getBoundingClientRect().y)
  );
  expect(Math.abs(desktopRows[0] - desktopRows[1])).toBeLessThanOrEqual(1);
  expect(desktopRows[2]).toBeGreaterThan(desktopRows[1]);

  for (const width of [900, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const rows = await waveGroups.evaluateAll((groups) =>
      groups.map((group) => group.getBoundingClientRect().y)
    );
    expect(rows[1]).toBeGreaterThan(rows[0]);
    expect(rows[2]).toBeGreaterThan(rows[1]);
    if (width <= 390)
      for (const grid of await waveLayout.locator('[data-enemy-grid]').all())
        expect(await gridColumnCount(grid)).toBe(1);
    const cardBox = await waveLayout.locator('[data-endgame-enemy-card]').first().boundingBox();
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
  const modeNav = page.getByRole('navigation', { name: '高难模式切换' });
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
    .locator('.moc-node-list')
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('PF 荒腔走板移动端单列且无横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/endgame/pf/2025?encounter=20254');
  const columns = await page
    .locator('[data-endgame-mechanics="cacophony"] [data-buff-option-grid]')
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
