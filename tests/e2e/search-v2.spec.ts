import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { GlobalSearchIndex } from '../../src/lib/domain/search-index';
import { normalizeSearchLabel } from '../../src/lib/search/normalization';

const index = JSON.parse(readFileSync('static/generated/search.json', 'utf8')) as GlobalSearchIndex;
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
  await page.route('**/generated/endgame-occurrences/**', async (route) => {
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
    expect(body).toContain('searchIndex:{schemaVersion:2,normalizationVersion:1');
    await route.fulfill({
      response,
      body: body.replace(
        'searchIndex:{schemaVersion:2,normalizationVersion:1',
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
      doc.target.kind !== 'endgame-name' &&
      [doc.canonicalName, ...doc.officialAliases, ...doc.playerAliases].some((name) =>
        normalizeSearchLabel(name).includes(query)
      )
  );
  const buckets = index.endgameEnemies.filter((entry) =>
    normalizeSearchLabel(entry.name).includes(query)
  );
  await page.goto(`/search?q=${query}`);
  const modes = page.locator('.search-endgame-mode');
  await expect(modes).toHaveCount(
    new Set(buckets.flatMap((entry) => entry.locators.map((locator) => locator.mode))).size
  );
  for (const mode of await modes.all()) {
    const id = (await mode.getAttribute('aria-labelledby'))!.replace('search-results-endgame-', '');
    const expected = buckets
      .flatMap((entry) => entry.locators)
      .filter((locator) => locator.mode === id);
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
      [...new Set(expected.map((locator) => locator.groupId))].sort((a, b) => b - a)
    );
  }
  for (const section of await page.locator('.search-result-section').all()) {
    const more = section.getByRole('button', { name: '加载更多', exact: true });
    while (await more.count()) await more.first().click();
  }
  await expect(page.locator('a.entity-overview-card')).toHaveCount(ordinary.length);
  await expect(page.locator('[data-endgame-enemy-card]')).toHaveCount(
    buckets.reduce((total, entry) => total + entry.locators.length, 0)
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
