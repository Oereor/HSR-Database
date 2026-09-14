import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { GlobalSearchIndex } from '../../src/lib/domain/search-index';
import { normalizeSearchLabel } from '../../src/lib/search/normalization';

const index = JSON.parse(
  readFileSync('static/generated/zh-CN/search.json', 'utf8')
) as GlobalSearchIndex;
// Human aliases can legitimately add characters to the two official March forms.
const marchMatches = index.documents.flatMap((doc) =>
  doc.target.kind === 'character' &&
  [doc.canonicalName, ...doc.officialAliases, ...doc.playerAliases].some((name) =>
    normalizeSearchLabel(name).includes('三月七')
  )
    ? [{ id: doc.target.id, name: doc.canonicalName }]
    : []
);

test('Search V2 exact 和 partial 共存，别名不进入 cards，清空后可重新搜索', async ({ page }) => {
  await page.goto('/search?q=丹恒');
  const cards = page.locator('a.entity-overview-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toHaveAttribute('href', '/characters/1002');
  await expect(page.locator('a[href="/characters/1213"]')).toBeVisible();
  const input = page.getByPlaceholder('搜索角色、光锥、遗器、敌方单位…');
  await input.fill('三月七');
  await input.press('Enter');
  await expect(cards).toHaveCount(marchMatches.length);
  await expect(cards).toContainText(['三月七·存护', '三月七·巡猎']);
  for (const match of marchMatches) {
    const card = page.locator(`a.entity-overview-card[href="/characters/${match.id}"]`);
    await expect(card).toContainText(match.name);
    if (!match.name.includes('三月七')) await expect(card).not.toContainText('三月七');
  }
  await input.fill('');
  await input.press('Enter');
  await expect(page.getByRole('heading', { name: '开始探索' })).toBeVisible();
  await input.fill('丹恒饮月');
  await input.press('Enter');
  await expect(cards).toHaveCount(1);
  await expect(cards).toHaveAttribute('href', '/characters/1213');
});

test('Search V2 分片失败保留普通结果并可在下一次提交重试', async ({ page }) => {
  let requests = 0;
  await page.route('**/generated/zh-CN/endgame-occurrences/**', async (route) => {
    requests += 1;
    if (requests === 1) await route.fulfill({ status: 503, body: 'unavailable' });
    else await route.continue();
  });
  await page.goto('/search?q=迷惘之渊的裁定者');
  await expect(page.locator('.search-data-unavailable')).toContainText('部分高难模式资料');
  await expect(page.locator('a.entity-overview-card[href="/enemies/4064012"]')).toBeVisible();
  await expect(page.locator('.empty-state')).toHaveCount(0);
  const input = page.getByPlaceholder('搜索角色、光锥、遗器、敌方单位…');
  await input.fill('锋镝');
  await input.press('Enter');
  await expect(page.locator('a[href="/light-cones/20000"]')).toBeVisible();
  await input.fill('迷惘之渊的裁定者');
  await input.press('Enter');
  await expect(page.locator('[data-endgame-enemy-card]')).toHaveCount(4);
  await expect(page.locator('.search-data-unavailable')).toHaveCount(0);
  expect(requests).toBe(2);
});

test('Search V2 初始化异常显示资料不可用，不误报无结果', async ({ page }) => {
  const diagnostics: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(message.text());
  });
  await page.route('**/search?*', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    expect(body).toContain('searchIndex:{schemaVersion:3,normalizationVersion:1');
    await route.fulfill({
      response,
      body: body.replace(
        'searchIndex:{schemaVersion:3,normalizationVersion:1',
        'searchIndex:{schemaVersion:999,normalizationVersion:1'
      )
    });
  });
  await page.goto('/search?q=三月七');
  await expect(page.locator('.search-data-unavailable')).toContainText('部分搜索资料');
  await expect(page.locator('.empty-state')).toHaveCount(0);
  expect(diagnostics.some((text) => text.includes('搜索索引初始化失败'))).toBe(true);
});

test('Search V2 长结果全部可访问且保留模式和赛期顺序', async ({ page }) => {
  test.setTimeout(90_000);
  const query = '者';
  const ordinary = index.documents.filter(
    (doc) =>
      doc.target.kind !== 'endgame' &&
      [doc.canonicalName, ...doc.officialAliases, ...doc.playerAliases].some((name) =>
        normalizeSearchLabel(name).includes(query)
      )
  );
  const buckets = index.endgameTargets.filter((entry) =>
    normalizeSearchLabel(entry.name).includes(query)
  );
  await page.goto(`/search?q=${query}`);
  const modes = page.locator('.search-endgame-mode');
  await expect(modes).toHaveCount(
    new Set(buckets.flatMap((entry) => entry.occurrences.map(({ locator }) => locator.mode))).size
  );
  for (const mode of await modes.all()) {
    const id = (await mode.getAttribute('aria-labelledby'))!.replace('search-results-endgame-', '');
    const expected = buckets
      .flatMap((entry) => entry.occurrences)
      .filter(({ locator }) => locator.mode === id);
    await expect(mode.locator('[data-endgame-enemy-card]')).toHaveCount(
      Math.min(100, expected.length)
    );
    await expect(mode.locator('[data-search-total]')).toContainText(
      `已展示 ${Math.min(100, expected.length)} / ${expected.length} 个结果`
    );
    const loadMore = mode.getByRole('button', { name: '加载更多', exact: true });
    while (await loadMore.count()) await loadMore.click();
    await expect(mode.locator('[data-endgame-enemy-card]')).toHaveCount(expected.length);
    const groupIds = await mode
      .locator('.search-endgame-season')
      .evaluateAll((seasons) =>
        seasons.map((season) => Number(season.getAttribute('aria-labelledby')!.split('-').at(-1)))
      );
    expect(groupIds).toEqual(
      [...new Set(expected.map(({ locator }) => locator.groupId))].sort((a, b) => b - a)
    );
  }
  for (const section of await page.locator('.search-result-section').all()) {
    const more = section.getByRole('button', { name: '加载更多', exact: true });
    while (await more.count()) await more.first().click();
  }
  await expect(page.locator('a.entity-overview-card')).toHaveCount(ordinary.length);
  await expect(page.locator('[data-endgame-enemy-card]')).toHaveCount(
    buckets.reduce((total, entry) => total + entry.occurrences.length, 0)
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
});

test('Search V2 普通类别窗口保留第 101 条之后的结果，换查询后重置', async ({ page }) => {
  await page.goto('/search?q=的');
  const section = page.locator('section[aria-labelledby="search-results-enemies"]');
  await expect(section.locator('a.entity-overview-card')).toHaveCount(100);
  await expect(section.locator('[data-search-total]')).toContainText('已展示 100 / 105 个结果');
  await section.getByRole('button', { name: '加载更多' }).click();
  await expect(section.locator('a.entity-overview-card')).toHaveCount(105);
  await expect(section.getByRole('button', { name: '加载更多' })).toHaveCount(0);
  const input = page.getByPlaceholder('搜索角色、光锥、遗器、敌方单位…');
  await input.fill('三月七');
  await input.press('Enter');
  await expect(page.locator('a.entity-overview-card')).toHaveCount(marchMatches.length);
  await page.goBack();
  await expect(section.locator('a.entity-overview-card')).toHaveCount(100);
});

test('全局搜索只包含保留的简中领域', async ({ page }) => {
  await page.goto('/search?q=三月七');
  const hero = page.locator('.overview-hero');
  await expect(hero.getByText('GLOBAL SEARCH', { exact: true })).toBeVisible();
  await expect(hero.getByRole('heading', { level: 1, name: '全局搜索' })).toBeVisible();
  await expect(hero).toContainText('键入关键词以搜索角色、光锥、遗器和敌方单位等内容。');
  await expect(page.locator('a[href="/characters/1001"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: '物品' })).toHaveCount(0);
  await expect(page.getByPlaceholder('搜索角色、光锥、遗器、敌方单位…')).toBeVisible();
});

test('全局搜索以提交同步 URL，并支持刷新与前进后退', async ({ page }) => {
  await page.goto('/search?q=三月七');
  const input = page.getByPlaceholder('搜索角色、光锥、遗器、敌方单位…');
  await expect(page.locator('a[href="/characters/1001"]')).toBeVisible();
  await input.fill('锋镝');
  await expect(page).toHaveURL(/q=%E4%B8%89%E6%9C%88%E4%B8%83/);
  await expect(page.locator('a[href="/characters/1001"]')).toBeVisible();
  await expect(page.locator('a[href="/light-cones/20000"]')).toHaveCount(0);
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page).toHaveURL(/q=%E9%94%8B%E9%95%9D/);
  await expect(page.locator('a[href="/light-cones/20000"]')).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/q=%E4%B8%89%E6%9C%88%E4%B8%83/);
  await expect(input).toHaveValue('三月七');
  await expect(page.locator('a[href="/characters/1001"]')).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/q=%E9%94%8B%E9%95%9D/);
  await page.reload();
  await expect(input).toHaveValue('锋镝');
  await expect(page.locator('a[href="/light-cones/20000"]')).toBeVisible();

  await input.fill('');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole('heading', { name: '开始探索' })).toBeVisible();
});

test('全局搜索复用四类 Overview cards，并隐藏空类别', async ({ page }) => {
  for (const [query, href, assertion] of [
    ['卡芙卡', '/characters/1005', 'character'],
    ['锋镝', '/light-cones/20000', 'light-cone'],
    ['云无留迹的过客', '/relics/101', 'relic'],
    ['银鬃尉官', '/enemies/1003010', 'enemy']
  ] as const) {
    await page.goto(`/search?q=${encodeURIComponent(query)}`);
    const card = page.locator(`a.entity-overview-card[href="${href}"]`);
    await expect(card).toBeVisible();
    await expect(card).toHaveClass(/entity-overview-card/);
    if (assertion === 'character') {
      await expect(card.locator('.rarity-stars')).toBeVisible();
      await expect(card.locator('[data-icon-kind="path"]')).toBeVisible();
      await expect(card.locator('[data-icon-kind="element"]')).toBeVisible();
    } else if (assertion === 'light-cone') {
      await expect(card.locator('.rarity-stars')).toBeVisible();
      await expect(card.locator('[data-icon-kind="path"]')).toBeVisible();
      await expect(card.locator('[data-icon-kind="element"]')).toHaveCount(0);
    } else if (assertion === 'relic') {
      await expect(card).toHaveAttribute('data-card-size', 'compact');
      await expect(card).toHaveAttribute('data-media-presentation', 'icon');
      await expect(card.locator('.entity-overview-card__overlay')).toHaveText('隧洞遗器');
    } else {
      await expect(card.locator('.enemy-weakness-group')).toBeVisible();
    }
  }

  await page.goto('/search?q=卡芙卡');
  await expect(page.getByRole('heading', { level: 2, name: '角色', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: '敌方单位', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '光锥', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: '遗器', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('heading', { level: 2, name: '高难模式', exact: true })
  ).toBeVisible();

  await page.goto('/search?q=完全不存在的词');
  await expect(page.locator('.empty-state')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: '未找到与「完全不存在的词」匹配的结果' })
  ).toBeVisible();
  await expect(page.locator('.search-result-section')).toHaveCount(0);
});

test('全局搜索按模式与赛期展示真实 Endgame enemy occurrences', async ({ page }) => {
  await page.goto(`/search?q=${encodeURIComponent('迷惘之渊的裁定者')}`);
  const endgame = page.locator('section[aria-labelledby="search-results-endgame"]');
  await expect(
    endgame.getByRole('heading', { level: 2, name: '高难模式', exact: true })
  ).toBeVisible();
  await expect(
    endgame.getByRole('heading', { level: 3, name: '末日幻影', exact: true })
  ).toBeVisible();
  await expect(
    endgame.getByRole('heading', { level: 4, name: '遗忘冽风', exact: true })
  ).toBeVisible();
  for (const mode of ['混沌回忆', '虚构叙事', '异相仲裁'])
    await expect(endgame.getByRole('heading', { level: 3, name: mode, exact: true })).toHaveCount(
      0
    );

  const cards = endgame.locator('[data-endgame-enemy-card]');
  await expect(cards).toHaveCount(4);
  expect(
    await cards.evaluateAll((items) =>
      items.map((item) => item.getAttribute('data-endgame-enemy-level'))
    )
  ).toEqual(['60', '70', '80', '90']);
  await expect(cards.locator('[data-enemy-portrait]')).toHaveCount(4);
  await expect(cards.locator('[data-endgame-hp]')).toHaveCount(4);
  await expect(cards.locator('[data-endgame-speed]')).toHaveCount(4);
  await expect(cards.locator('[data-endgame-toughness]')).toHaveCount(4);
  await expect(cards.locator('.endgame-weaknesses')).toHaveCount(4);
  await expect(endgame.locator('[data-endgame-enemy-card][href="/enemies/4064012"]')).toHaveCount(
    4
  );
  await expect(page.locator('a.entity-overview-card[href="/enemies/4064012"]')).toBeVisible();

  await page.goto(`/search?q=${encodeURIComponent('末日歧途的盗火者')}`);
  const seasons = page
    .locator('section[aria-labelledby="search-results-endgame"]')
    .getByRole('heading', { level: 4 });
  await expect(seasons).toHaveText(['遗忘冽风', '金血恶兽']);
  await expect(page.locator('[data-endgame-enemy-card]')).toHaveCount(5);
});

test('全局搜索不把赛期名称当作 Endgame 实体', async ({ page }) => {
  await page.goto(`/search?q=${encodeURIComponent('邓恩')}`);
  await expect(page.locator('a.entity-overview-card[href="/enemies/1003014"]')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '高难模式', exact: true })).toHaveCount(
    0
  );

  await page.goto(`/search?q=${encodeURIComponent('遗忘冽风')}`);
  await expect(page.getByRole('heading', { level: 2, name: '高难模式', exact: true })).toHaveCount(
    0
  );
});

test('全局搜索 Endgame grid 与展开导航在各断点不横向溢出', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 900, height: 900 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`/search?q=${encodeURIComponent('迷惘之渊的裁定者')}`);
    await expect(page.locator('[data-endgame-enemy-card]')).toHaveCount(4);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
    ).toBeLessThanOrEqual(1);

    await page.getByRole('button', { name: '打开导航' }).click();
    const navigator = page.getByRole('dialog', { name: '完整导航' });
    await expect(navigator).toBeVisible();
    await expect(navigator.getByRole('textbox', { name: '全局搜索' })).toBeVisible();
    expect(
      await navigator.evaluate((dialog) => dialog.scrollWidth - dialog.clientWidth)
    ).toBeLessThanOrEqual(1);
    await navigator.getByRole('button', { name: '关闭导航' }).click();
  }
});

test('全局搜索丢弃迟到分片，并在 Back/Forward 中复用分片缓存', async ({ page }) => {
  let shardRequests = 0;
  await page.route('**/generated/zh-CN/endgame-occurrences/**', async (route) => {
    shardRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });
  await page.goto('/search');
  const input = page.getByPlaceholder('搜索角色、光锥、遗器、敌方单位…');
  await input.fill('迷惘之渊的裁定者');
  await input.press('Enter');
  await expect(page).toHaveURL(/q=/);
  await input.fill('完全不存在的词');
  await input.press('Enter');
  await expect(
    page.getByRole('heading', { name: '未找到与「完全不存在的词」匹配的结果' })
  ).toBeVisible();
  await page.waitForTimeout(350);
  await expect(page.getByRole('heading', { level: 2, name: '高难模式' })).toHaveCount(0);

  await page.goBack();
  await expect(page.locator('[data-endgame-enemy-card]')).toHaveCount(4);
  expect(shardRequests).toBe(1);
  await page.goForward();
  await expect(page.locator('.empty-state')).toHaveCount(1);
});

test('Endgame 搜索单卡、多卡与不足一行均固定卡宽并从左排列', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto(`/search?q=${encodeURIComponent('浮烟')}`);
  const singleGrid = page.locator('[data-enemy-grid]').first();
  const singleCard = singleGrid.locator('[data-endgame-enemy-card]');
  await expect(singleCard).toHaveCount(1);
  const [singleGridBox, singleCardBox] = await Promise.all([
    singleGrid.boundingBox(),
    singleCard.boundingBox()
  ]);
  expect(singleCardBox?.width).toBeLessThanOrEqual(260);
  expect(Math.abs((singleCardBox?.x ?? 0) - (singleGridBox?.x ?? 0))).toBeLessThanOrEqual(1);

  await page.goto(`/search?q=${encodeURIComponent('迷惘之渊的裁定者')}`);
  const cards = page.locator('[data-endgame-enemy-card]');
  await expect(cards).toHaveCount(4);
  const boxes = await cards.evaluateAll((items) =>
    items.map((item) => {
      const box = item.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width };
    })
  );
  expect(new Set(boxes.map(({ width }) => Math.round(width))).size).toBe(1);
  const rows = new Map<number, typeof boxes>();
  for (const box of boxes)
    rows.set(Math.round(box.y), [...(rows.get(Math.round(box.y)) ?? []), box]);
  for (const row of rows.values())
    expect(row.map(({ x }) => x)).toEqual([...row.map(({ x }) => x)].sort((a, b) => a - b));
});
