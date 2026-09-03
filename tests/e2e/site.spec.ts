import { expect, test } from '@playwright/test';

test('首页作为数据库入口展示品牌、分类与最近限定跃迁', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('《崩坏：星穹铁道》档案库');
  await expect(
    page.getByRole('heading', { level: 1, name: '《崩坏：星穹铁道》档案库' })
  ).toBeVisible();
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    'href',
    /\/generated-assets\/branding\/train-party\.png$/
  );
  await expect(page.getByText('HONKAI: STAR RAIL DATA ARCHIVE', { exact: true })).toBeVisible();
  await expect(page.locator('.home-hero__collage img')).toHaveCount(4);
  expect(
    await page
      .locator('.home-hero__collage img')
      .evaluateAll((images) => images.map((image) => image.getAttribute('src')).sort())
  ).toEqual(
    [
      '/generated-assets/characters/preview/1001.png',
      '/generated-assets/characters/preview/1002.png',
      '/generated-assets/light-cones/preview/21003.png',
      '/generated-assets/light-cones/preview/21030.png'
    ].sort()
  );

  for (const [href, label] of [
    ['/characters', '角色'],
    ['/light-cones', '光锥'],
    ['/relics', '遗器'],
    ['/enemies', '敌方单位'],
    ['/endgame', '高难模式']
  ] as const) {
    const row = page.locator(`.home-directory-row[href="${href}"]`);
    await expect(row).toContainText(label);
    await expect(row).not.toContainText(/\d+ 条记录/);
    await expect(row.locator('.home-directory-row__arrow')).toHaveText('→');
  }

  await expect(page.locator('[data-homepage-recent="avatar"] .entity-overview-card')).toHaveCount(
    6
  );
  await expect(page.locator('[data-homepage-recent="weapon"] .entity-overview-card')).toHaveCount(
    6
  );
  expect(
    await page
      .locator('[data-homepage-recent="avatar"] .entity-overview-card')
      .evaluateAll((cards) => cards.map((card) => card.getAttribute('href')))
  ).toEqual([
    '/characters/1504',
    '/characters/1513',
    '/characters/1409',
    '/characters/1512',
    '/characters/1304',
    '/characters/1412'
  ]);
  expect(
    await page
      .locator('[data-homepage-recent="weapon"] .entity-overview-card')
      .evaluateAll((cards) => cards.map((card) => card.getAttribute('href')))
  ).toEqual([
    '/light-cones/23056',
    '/light-cones/23064',
    '/light-cones/23042',
    '/light-cones/23063',
    '/light-cones/23023',
    '/light-cones/23048'
  ]);

  await expect(page.getByText('沿着星轨，查清每一条数据。')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '资料分类' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '五星角色速览' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '数据从哪里来？' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '物品' })).toHaveCount(0);

  const search = page.getByRole('search').filter({ has: page.locator('#home-search') });
  await search.getByRole('textbox', { name: '搜索资料库' }).fill('三月七');
  await search.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page).toHaveURL(/\/search\?q=%E4%B8%89%E6%9C%88%E4%B8%83$/);

  await page.goto('/characters');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveTitle('角色｜《崩坏：星穹铁道》档案库');
  await expect(page.getByRole('heading', { name: '角色' })).toBeVisible();
  await expect(page.locator('.entity-overview-card').first()).toBeVisible();
  await page.goto('/items');
  await expect(page).toHaveTitle('404｜《崩坏：星穹铁道》档案库');
  await expect(page.getByRole('heading', { name: '这条星轨暂不存在' })).toBeVisible();
});

test('Footer 仅保留正式服说明、数据仓库与本地许可证', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('main > footer');
  await expect(footer.locator('p')).toHaveCount(2);
  await expect(footer.locator('p').first()).toHaveText(
    '本站为非官方玩家制作的数据网站，与米哈游或 HoYoverse 无官方关联。游戏名称、角色及相关资产的权利归其权利人所有。'
  );
  await expect(footer.locator('p').nth(1)).toHaveText(
    '数据来源：TurnBasedGameData；角色与光锥视觉资源来源：StarRailRes（AGPL-3.0 许可证）。数据仅涵盖正式服内容，并可能存在延迟或错误。'
  );
  await expect(footer.getByRole('link', { name: 'TurnBasedGameData' })).toHaveAttribute(
    'href',
    'https://github.com/DimbreathBot/TurnBasedGameData'
  );
  await expect(footer.getByRole('link', { name: 'StarRailRes', exact: true })).toHaveAttribute(
    'href',
    'https://github.com/Mar-7th/StarRailRes'
  );
  await expect(footer.getByRole('link', { name: 'AGPL-3.0 许可证' })).toHaveAttribute(
    'href',
    '/licenses/StarRailRes-AGPL-3.0.txt'
  );
  await expect(footer).not.toContainText('第三方资源与权利声明');
});

test('角色目录按 ID 加载 preview 并保留安全缺图降级', async ({ page }) => {
  const failedImages: string[] = [];
  page.on('response', (response) => {
    if (response.request().resourceType() === 'image' && response.status() >= 400)
      failedImages.push(response.url());
  });
  await page.goto('/characters');
  const firstCard = page.locator('.entity-overview-card').first();
  await expect(firstCard).toHaveAttribute('data-image-missing', 'false');
  await expect(firstCard.locator('.entity-overview-card__artwork img')).toHaveAttribute(
    'src',
    /generated-assets\/characters\/preview\/\d+\.png/
  );
  await expect(firstCard.locator('.entity-overview-card__artwork img')).toHaveAttribute(
    'loading',
    'lazy'
  );
  await expect(firstCard).not.toContainText('CHARACTER /');
  await expect(firstCard.locator('.entity-overview-card__overlay .rarity-stars')).toBeVisible();
  await expect(firstCard.locator('.entity-overview-card__title')).not.toBeEmpty();
  await expect(firstCard.locator('.entity-overview-card__metadata')).toBeVisible();
  await expect(firstCard.locator('.entity-overview-card__artwork img')).toHaveCSS(
    'object-fit',
    'contain'
  );
  await expect(firstCard.locator('.entity-overview-card__artwork img')).toHaveCSS(
    'object-position',
    '50% 100%'
  );
  expect(failedImages).toEqual([]);

  await firstCard
    .locator('.entity-overview-card__artwork img')
    .evaluate((image: HTMLImageElement) => {
      image.dispatchEvent(new Event('error'));
    });
  await expect(firstCard).toHaveAttribute('data-image-missing', 'true');
  await expect(firstCard.locator('.entity-overview-card__artwork img')).toHaveCount(0);
  await expect(firstCard.locator('.entity-overview-card__fallback')).toBeVisible();
});

test('光锥目录复用角色 Overview presentation 并按 ID 加载 preview', async ({ page }) => {
  const failedImages: string[] = [];
  page.on('response', (response) => {
    if (response.request().resourceType() === 'image' && response.status() >= 400)
      failedImages.push(response.url());
  });

  for (const [id, name, rarity, pathName] of [
    ['20000', '锋镝', '★★★', '巡猎'],
    ['21015', '决心如汗珠般闪耀', '★★★★', '虚无'],
    ['23000', '银河铁道之夜', '★★★★★', '智识']
  ] as const) {
    await page.goto(`/light-cones?q=${encodeURIComponent(name)}`);
    const card = page.locator(`a[href="/light-cones/${id}"]`);
    await expect(card).toBeVisible();
    await expect(card).toHaveClass(/entity-overview-card/);
    await expect(card.locator('.entity-overview-card__title')).toHaveText(name);
    await expect(card.locator('.rarity-stars')).toHaveText(rarity);
    await expect(card.locator('[data-icon-kind="path"]')).toContainText(pathName);
    await expect(card.locator('[data-icon-kind="element"]')).toHaveCount(0);
    await expect(card.locator('.entity-overview-card__metadata > *')).toHaveCount(1);
    await expect(card.locator('.entity-overview-card__artwork img')).toHaveAttribute(
      'src',
      `/generated-assets/light-cones/preview/${id}.png`
    );
    await expect(card).not.toContainText('光锥技能仅对该命途生效');
    await expect(card).not.toContainText(/生命值|攻击力|防御力/);
  }

  await page.goto('/light-cones?rarity=5');
  const cards = page.locator('.entity-overview-card');
  await expect(cards.first()).toBeVisible();
  const heights = await Promise.all(
    [0, 1, 2].map(async (index) => (await cards.nth(index).boundingBox())?.height)
  );
  expect(heights.every((height) => height === heights[0])).toBe(true);

  const firstCard = cards.first();
  await firstCard
    .locator('.entity-overview-card__artwork img')
    .evaluate((image: HTMLImageElement) => image.dispatchEvent(new Event('error')));
  await expect(firstCard).toHaveAttribute('data-image-missing', 'true');
  await expect(firstCard.locator('.entity-overview-card__fallback')).toBeVisible();
  expect(failedImages).toEqual([]);
});

test('光锥 Overview 支持命途与稀有度多选，并在清除筛选时保留搜索', async ({ page }) => {
  await page.goto('/light-cones?q=银河');
  await page.getByRole('button', { name: '智识' }).click();
  await page.getByRole('button', { name: '虚无' }).click();
  await page.getByRole('button', { name: '5★' }).click();
  await page.getByRole('button', { name: '4★' }).click();
  await expect(page).toHaveURL(/path=Mage/);
  await expect(page).toHaveURL(/path=Warlock/);
  await expect(page).toHaveURL(/rarity=5/);
  await expect(page).toHaveURL(/rarity=4/);
  await expect(page.getByRole('button', { name: '智识' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '4★' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.overview-toolbar')).toContainText('个结果');

  await page.getByRole('button', { name: '清除筛选' }).click();
  await expect(page).toHaveURL(/q=%E9%93%B6%E6%B2%B3/);
  await expect(page).not.toHaveURL(/path=|rarity=/);
});

test('遗器 Overview 使用统一页面外壳与本地套装 Hero decoration', async ({ page }) => {
  await page.goto('/relics?sort=id');

  const hero = page.locator('.overview-hero');
  await expect(hero.getByText('DATABASE / RELICS')).toBeVisible();
  await expect(hero.getByRole('heading', { level: 1, name: '遗器' })).toBeVisible();
  await expect(hero).toContainText('浏览、搜索并筛选遗器套装资料。');
  await expect(hero.getByText('共 60 套遗器', { exact: true })).toBeVisible();
  const heroArtwork = hero.locator('.overview-hero__artwork img');
  await expect(heroArtwork).toHaveCount(3);
  expect(
    await heroArtwork.evaluateAll((images) => images.map((image) => image.getAttribute('src')))
  ).toEqual([
    '/generated-assets/relics/icons/101.png',
    '/generated-assets/relics/icons/102.png',
    '/generated-assets/relics/icons/103.png'
  ]);

  await expect(page.getByPlaceholder('搜索遗器套装', { exact: true })).toBeVisible();
  const categoryGroup = page.locator('[aria-labelledby="filter-group-relic-category"]');
  await expect(categoryGroup.getByRole('button')).toHaveText(['全部', '隧洞遗器', '位面饰品']);
  await expect(categoryGroup.locator('img')).toHaveCount(0);
  await expect(page.locator('.overview-toolbar')).toContainText('共 60 个结果');
  await expect(page.getByRole('button', { name: '筛选与排序' })).toHaveCount(0);
  await expect(page.locator('.filters, .filter-backdrop')).toHaveCount(0);
});

test('遗器类别使用单选语义并保留排序、重置分页', async ({ page }) => {
  await page.goto('/relics?sort=id&page=2');
  const all = page.getByRole('button', { name: '全部', exact: true });
  const cavern = page.getByRole('button', { name: '隧洞遗器', exact: true });
  const planar = page.getByRole('button', { name: '位面饰品', exact: true });

  await cavern.click();
  await expect(page).toHaveURL(/type=cavern/);
  await expect(page).toHaveURL(/sort=id/);
  await expect(page).not.toHaveURL(/page=/);
  await expect(all).toHaveAttribute('aria-pressed', 'false');
  await expect(cavern).toHaveAttribute('aria-pressed', 'true');
  await expect(planar).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.overview-toolbar')).toContainText('共 32 个结果');
  await expect(page.locator('.entity-overview-card')).toHaveCount(32);
  await expect(page.locator('.entity-overview-card__overlay')).toHaveText(
    Array(32).fill('隧洞遗器')
  );

  await planar.click();
  await expect(page).toHaveURL(/type=planar/);
  await expect(page).not.toHaveURL(/type=cavern/);
  await expect(cavern).toHaveAttribute('aria-pressed', 'false');
  await expect(planar).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.overview-toolbar')).toContainText('共 28 个结果');
  await expect(page.locator('.entity-overview-card')).toHaveCount(28);
  await expect(page.locator('.entity-overview-card__overlay')).toHaveText(
    Array(28).fill('位面饰品')
  );

  await planar.click();
  await expect(planar).toHaveAttribute('aria-pressed', 'true');
  await all.click();
  await expect(page).not.toHaveURL(/type=/);
  await expect(page).toHaveURL(/sort=id/);
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.overview-toolbar')).toContainText('共 60 个结果');
});

test('遗器搜索与历史 type 参数可组合，清空搜索后保留类别', async ({ page }) => {
  for (const [type, query, id] of [
    ['cavern', '云无留迹的过客', '101'],
    ['planar', '太空封印站', '301']
  ] as const) {
    await page.goto(`/relics?type=${type}&sort=name`);
    const expectedLabel = type === 'cavern' ? '隧洞遗器' : '位面饰品';
    await expect(page.getByRole('button', { name: expectedLabel, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const input = page.getByPlaceholder('搜索遗器套装', { exact: true });
    await input.fill(query);
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(page.locator(`a[href="/relics/${id}"]`)).toBeVisible();
    expect(new URL(page.url()).searchParams.get('type')).toBe(type);
    expect(new URL(page.url()).searchParams.get('sort')).toBe('name');
  }

  const input = page.getByPlaceholder('搜索遗器套装', { exact: true });
  await input.fill('');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  expect(new URL(page.url()).searchParams.get('type')).toBe('planar');
  expect(new URL(page.url()).searchParams.has('q')).toBe(false);
  await expect(page.locator('.overview-toolbar')).toContainText('共 28 个结果');
});

test('遗器统一页面外壳与专用 Grid 在各断点不横向溢出', async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 700, height: 900 },
    { width: 520, height: 844 },
    { width: 390, height: 844 },
    { width: 340, height: 720 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/relics?sort=id');
    await expect(page.locator('.overview-hero')).toBeVisible();
    await expect(page.getByPlaceholder('搜索遗器套装', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '隧洞遗器', exact: true })).toBeVisible();
    await expect(page.locator('.overview-toolbar')).toBeVisible();
    await expect(page.locator('.overview-grid--compact')).toBeVisible();
    await expect(page.getByRole('button', { name: '筛选与排序' })).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
    ).toBeLessThanOrEqual(1);
  }
});

test('遗器目录复用 shared compact Overview，并保留可读 typography 与 icon fitting', async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/characters');
  const largeCards = page.locator('.entity-overview-card');
  const largeFirstRow = await largeCards.evaluateAll((cards) => {
    const boxes = cards.slice(0, 8).map((card) => card.getBoundingClientRect());
    return boxes.filter((box) => Math.abs(box.y - boxes[0].y) < 1).length;
  });
  const largeMetrics = await largeCards.first().evaluate((card) => {
    const artwork = card.querySelector<HTMLElement>('.entity-overview-card__artwork')!;
    const title = card.querySelector<HTMLElement>('.entity-overview-card__title')!;
    const overlay = card.querySelector<HTMLElement>('.entity-overview-card__overlay')!;
    return {
      cardHeight: card.getBoundingClientRect().height,
      artworkHeight: artwork.getBoundingClientRect().height,
      titleSize: getComputedStyle(title).fontSize,
      titleWeight: getComputedStyle(title).fontWeight,
      overlaySize: getComputedStyle(overlay).fontSize,
      overlayPadding: getComputedStyle(overlay).padding
    };
  });

  await page.goto('/relics?sort=id');
  const relicCards = page.locator('.entity-overview-card');
  const firstRelic = page.locator('a[href="/relics/101"]');
  await expect(firstRelic).toBeVisible();
  await expect(firstRelic).toHaveAttribute('data-card-size', 'compact');
  await expect(firstRelic).toHaveAttribute('data-media-presentation', 'icon');
  await expect(firstRelic.locator('.entity-overview-card__overlay')).toHaveText('隧洞遗器');
  await expect(firstRelic.locator('.entity-overview-card__title')).toHaveText('云无留迹的过客');
  await expect(firstRelic.locator('.entity-overview-card__metadata')).toHaveCount(0);
  await expect(firstRelic.locator('.entity-card__body')).toHaveCount(0);
  await expect(firstRelic).not.toContainText(/ID 101|版本 1\.0|2件：/);

  const firstIcon = firstRelic.locator('.entity-overview-card__artwork img');
  await expect(firstIcon).toHaveAttribute('src', '/generated-assets/relics/icons/101.png');
  await expect(firstIcon).toHaveCSS('object-fit', 'contain');
  await expect(firstIcon).toHaveCSS('object-position', '50% 50%');
  const iconBox = await firstIcon.boundingBox();
  expect(iconBox).not.toBeNull();
  expect(iconBox!.width).toBeLessThanOrEqual(128);
  expect(iconBox!.height).toBeLessThanOrEqual(128);

  const compactMetrics = await firstRelic.evaluate((card) => {
    const artwork = card.querySelector<HTMLElement>('.entity-overview-card__artwork')!;
    const title = card.querySelector<HTMLElement>('.entity-overview-card__title')!;
    const overlay = card.querySelector<HTMLElement>('.entity-overview-card__overlay')!;
    return {
      cardHeight: card.getBoundingClientRect().height,
      artworkHeight: artwork.getBoundingClientRect().height,
      titleSize: getComputedStyle(title).fontSize,
      titleWeight: getComputedStyle(title).fontWeight,
      overlaySize: getComputedStyle(overlay).fontSize,
      overlayPadding: getComputedStyle(overlay).padding
    };
  });
  expect(compactMetrics.cardHeight).toBeLessThan(largeMetrics.cardHeight);
  expect(compactMetrics.artworkHeight).toBeLessThan(largeMetrics.artworkHeight);
  expect(compactMetrics.artworkHeight).toBeCloseTo(176, 0);
  expect(compactMetrics.titleSize).toBe(largeMetrics.titleSize);
  expect(compactMetrics.titleWeight).toBe(largeMetrics.titleWeight);
  expect(compactMetrics.overlaySize).toBe(largeMetrics.overlaySize);
  expect(compactMetrics.overlayPadding).toBe(largeMetrics.overlayPadding);

  const compactFirstRow = await relicCards.evaluateAll((cards) => {
    const boxes = cards.slice(0, 12).map((card) => card.getBoundingClientRect());
    return boxes.filter((box) => Math.abs(box.y - boxes[0].y) < 1).length;
  });
  expect(largeFirstRow).toBeGreaterThanOrEqual(4);
  expect(compactFirstRow).toBeGreaterThanOrEqual(4);

  for (const [id, name, category] of [
    ['129', '闪耀功勋的魔法少女', '隧洞遗器'],
    ['301', '太空封印站', '位面饰品'],
    ['314', '出云显世与高天神国', '位面饰品']
  ] as const) {
    await page.goto(`/relics?q=${encodeURIComponent(name)}`);
    const card = page.locator(`a[href="/relics/${id}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator('.entity-overview-card__overlay')).toHaveText(category);
    await expect(card.locator('.entity-overview-card__title')).toHaveText(name);
    await expect(card.locator('.entity-overview-card__metadata')).toHaveCount(0);
    await expect(card.locator('.entity-overview-card__artwork img')).toHaveAttribute(
      'src',
      `/generated-assets/relics/icons/${id}.png`
    );
    expect(
      await card.locator('.entity-overview-card__title').evaluate((title) => {
        const style = getComputedStyle(title);
        return title.scrollHeight - title.clientHeight <= 1 && style.webkitLineClamp === '2';
      })
    ).toBe(true);
  }

  const navigableCard = page.locator('a[href="/relics/314"]');
  await navigableCard.click();
  await expect(page).toHaveURL(/\/relics\/314$/);
  await expect(page.getByRole('heading', { level: 1, name: '出云显世与高天神国' })).toBeVisible();

  await page.goto('/relics?q=%E4%BA%91%E6%97%A0%E7%95%99%E8%BF%B9%E7%9A%84%E8%BF%87%E5%AE%A2');
  const fallbackCard = page.locator('a[href="/relics/101"]');
  await fallbackCard
    .locator('.entity-overview-card__artwork img')
    .evaluate((image) => image.dispatchEvent(new Event('error')));
  await expect(fallbackCard).toHaveAttribute('data-image-missing', 'true');
  await expect(fallbackCard.locator('.entity-overview-card__fallback')).toBeVisible();

  for (const viewport of [
    { width: 768, height: 900, minimumColumns: 2 },
    { width: 390, height: 844, minimumColumns: 1 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/relics?sort=id');
    const cards = page.locator('.entity-overview-card');
    const firstRow = await cards.evaluateAll((items) => {
      const boxes = items.slice(0, 8).map((item) => item.getBoundingClientRect());
      return boxes.filter((box) => Math.abs(box.y - boxes[0].y) < 1).length;
    });
    expect(firstRow).toBeGreaterThanOrEqual(viewport.minimumColumns);
    if (viewport.width === 390) expect(firstRow).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
    ).toBeLessThanOrEqual(1);
  }
});

test('角色目录与详情接入属性、命途图标和优化立绘', async ({ page }) => {
  const failedImages: string[] = [];
  page.on('response', (response) => {
    if (response.request().resourceType() === 'image' && response.status() >= 400) {
      failedImages.push(response.url());
    }
  });
  await page.goto('/characters');
  const firstCard = page.locator('.entity-overview-card').first();
  await expect(firstCard.locator('[data-icon-kind="path"] img')).toHaveAttribute(
    'src',
    /generated-assets\/paths\/.+\.png/
  );
  await expect(firstCard.locator('[data-icon-kind="element"] img')).toHaveAttribute(
    'src',
    /generated-assets\/elements\/.+\.png/
  );
  await expect(firstCard.locator('[data-icon-kind="path"] > span')).not.toBeEmpty();
  await expect(firstCard.locator('[data-icon-kind="element"] > span')).not.toBeEmpty();
  await expect(firstCard.locator('[data-icon-kind="path"]')).toHaveAttribute(
    'data-label-size',
    'large'
  );
  await expect(firstCard.locator('[data-icon-kind="element"]')).toHaveAttribute(
    'data-label-size',
    'large'
  );
  await expect(firstCard.locator('.rarity-stars')).toHaveCSS('color', 'rgb(255, 215, 0)');

  await page.goto('/characters?rarity=4');
  await expect(page.locator('.entity-overview-card').first().locator('.rarity-stars')).toHaveCSS(
    'color',
    'rgb(199, 125, 255)'
  );

  await page.goto('/characters/1402');
  const portrait = page.locator('[data-character-portrait="1402"]');
  await expect(portrait.locator('img')).toHaveAttribute(
    'src',
    '/generated-assets/characters/portrait/1402.webp'
  );
  await expect(portrait).toBeVisible();
  await expect(page.locator('.detail-profile-hero [data-icon-kind="path"]')).toContainText('记忆');
  await expect(page.locator('.detail-profile-hero [data-icon-kind="element"]')).toContainText('雷');
  expect(failedImages).toEqual([]);
});

test('四名 LD 角色进入 Character Overview、Search、Detail 与本地资源链', async ({ page }) => {
  for (const [id, name, pathName, elementName] of [
    ['1014', 'Saber', '毁灭', '风'],
    ['1015', 'Archer', '巡猎', '量子'],
    ['1508', '远坂凛', '智识', '量子'],
    ['1509', '吉尔伽美什', '毁灭', '雷']
  ] as const) {
    await page.goto(`/characters?q=${encodeURIComponent(name)}`);
    const card = page.locator(`a[href="/characters/${id}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator('.rarity-stars')).toHaveText('★★★★★');
    await expect(card.locator('.entity-overview-card__metadata')).toContainText(pathName);
    await expect(card.locator('.entity-overview-card__metadata')).toContainText(elementName);
    await expect(card.locator('.entity-overview-card__artwork img')).toHaveAttribute(
      'src',
      `/generated-assets/characters/preview/${id}.png`
    );

    await page.goto(`/search?q=${encodeURIComponent(name)}`);
    await expect(page.locator(`a[href="/characters/${id}"]`)).toBeVisible();

    await page.goto(`/characters/${id}`);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.locator(`[data-character-portrait="${id}"] img`)).toHaveAttribute(
      'src',
      `/generated-assets/characters/portrait/${id}.webp`
    );
    await expect(page.locator('#skills .skill-card')).toHaveCount(5);
    await expect(page.locator('#traces')).not.toContainText('13 条记录');
    await expect(page.locator('#eidolons .rank-card')).toHaveCount(6);
  }
});

test('Path、Character Element、Enemy Weakness 使用独立且稳定的 presentation semantics', async ({
  page
}) => {
  await page.goto('/characters?q=三月七');
  const characterMetadata = page
    .locator('a[href="/characters/1001"] .entity-overview-card__metadata')
    .first();
  await expect(characterMetadata.locator('[data-icon-kind="path"]')).toHaveAttribute(
    'data-icon-presentation',
    'path-identity'
  );
  await expect(characterMetadata.locator('[data-icon-kind="element"]')).toHaveAttribute(
    'data-icon-presentation',
    'character-element-identity'
  );

  await page.goto('/light-cones?q=锋镝');
  await expect(
    page.locator('a[href="/light-cones/20000"] [data-icon-kind="path"]')
  ).toHaveAttribute('data-icon-presentation', 'path-identity');

  await page.goto('/enemies?sort=id');
  const weakness = page
    .locator('a[href="/enemies/1002015"] .enemy-weakness-group [data-icon-kind="element"]')
    .first();
  await expect(weakness).toHaveAttribute('data-icon-presentation', 'plain');
  await expect(weakness).not.toHaveAttribute(
    'data-icon-presentation',
    'character-element-identity'
  );
});

test('Global Buff 作为正常 Talent Variant 展示且不泄漏配置术语', async ({ page }) => {
  for (const [id, originalId, globalId, originalName, globalName, description] of [
    ['1407', '140704', '140704:global-buff:1', '掌心淌过的荒芜', '月茧之庇', '月茧'],
    ['1506', '150604', '150604:global-buff:1', '有我在，把把都是顺风局', '999安全卫士', '防火墙']
  ] as const) {
    await page.goto(`/characters/${id}`);
    const talentCard = page.locator('[data-skill-category="talent"]');
    await expect(talentCard).toHaveCount(1);
    await expect(talentCard.locator('.skill-variant')).toHaveCount(2);
    await expect(talentCard.locator(`[data-skill-id="${originalId}"]`)).toContainText(originalName);
    const globalVariant = talentCard.locator(`[data-skill-id="${globalId}"]`);
    await expect(globalVariant).toContainText(globalName);
    await expect(globalVariant).toContainText(description);
    await expect(globalVariant).toContainText('Lv.1');
    await expect(page.locator('[data-skill-category="global-buff"]')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('仓库技');
    await expect(page.locator('body')).not.toContainText('Global Buff');
  }
});

test('敌人目录使用本地立绘、三类 Rank 和 default Monster 弱点', async ({ page }) => {
  await page.goto('/enemies?sort=id');
  const heroArtwork = page.locator('.overview-hero__artwork img');
  await expect(heroArtwork).toHaveCount(3);
  expect(
    await heroArtwork.evaluateAll((images) => images.map((image) => image.getAttribute('src')))
  ).toEqual([
    '/generated-enemy-assets/icons/Monster_1005010.webp',
    '/generated-enemy-assets/icons/Monster_2004010.webp',
    '/generated-enemy-assets/icons/Monster_4034010.webp'
  ]);
  const card = page.locator('a[href="/enemies/1002015"]');
  await expect(card).toBeVisible();
  await expect(card.locator('.entity-overview-card__artwork img')).toHaveAttribute(
    'src',
    /^\/generated-enemy-assets\/icons\/Monster_\d+\.webp$/
  );
  await expect(card.locator('.entity-overview-card__overlay')).toHaveText('普通敌人');
  await expect(
    card.locator('.entity-overview-card__metadata [data-icon-kind="element"]')
  ).toHaveCount(2);
  await expect(card).not.toContainText('ENEMY /');
  await expect(card).not.toContainText('MinionLv2');

  await page.goto('/enemies?type=MinionLv2&sort=id');
  await expect(page.getByRole('button', { name: '普通', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.locator('.entity-overview-card').first()).toContainText('普通敌人');
  const typeGroup = page.locator('[aria-labelledby="filter-group-enemy-type"]');
  await expect(typeGroup.getByRole('button')).toHaveText(['全部', '普通', '精英', '首领']);
});

test('Enemy Overview 弱点使用可访问的 icon-only 单行 Group', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/enemies');

  const threeWeaknesses = page.locator('a[href="/enemies/4034011"]');
  const fourWeaknesses = page.locator('a[href="/enemies/4034018"]');
  for (const [card, count] of [
    [threeWeaknesses, 3],
    [fourWeaknesses, 4]
  ] as const) {
    const metadata = card.locator('.entity-overview-card__metadata');
    const group = metadata.locator(':scope > .enemy-weakness-group');
    const items = group.locator('.semantic-icon-label');
    await expect(group).toHaveCount(1);
    await expect(group).toHaveClass(/enemy-weakness-group--overview/);
    await expect(items).toHaveCount(count);
    await expect(group).toHaveCSS('border-top-width', '0px');
    await expect(items.first().locator('img')).toHaveCSS('width', '20px');
    const boxes = await Promise.all(
      [...Array(count).keys()].map((index) => items.nth(index).boundingBox())
    );
    expect(boxes.every((box) => box !== null && Math.abs(box.y - boxes[0]!.y) < 1)).toBe(true);
    for (const item of await items.all()) {
      await expect(item).toHaveAttribute('role', 'img');
      await expect(item).toHaveAttribute('aria-label', /属性弱点$/);
      await expect(item.locator('.semantic-icon-label__text')).toHaveCount(0);
    }
  }

  const threeHeight = await threeWeaknesses.evaluate((card) => card.getBoundingClientRect().height);
  const fourHeight = await fourWeaknesses.evaluate((card) => card.getBoundingClientRect().height);
  expect(threeHeight).toBeCloseTo(fourHeight, 0);

  await page.goto('/enemies?sort=id');
  const twoWeaknesses = page.locator('a[href="/enemies/1002015"]');
  const twoGroup = twoWeaknesses.locator('.enemy-weakness-group');
  await expect(twoGroup.locator('.semantic-icon-label')).toHaveCount(2);
  const twoGroupBox = await twoGroup.boundingBox();
  const twoMetadataBox = await twoWeaknesses
    .locator('.entity-overview-card__metadata')
    .boundingBox();
  expect(twoGroupBox).not.toBeNull();
  expect(twoMetadataBox).not.toBeNull();
  expect(twoGroupBox!.width).toBeLessThan(twoMetadataBox!.width);

  await page.setViewportSize({ width: 240, height: 720 });
  await page.goto('/enemies');
  const narrowGroup = page.locator('a[href="/enemies/4034018"] .enemy-weakness-group').first();
  await expect(narrowGroup).toHaveAttribute('aria-label', '弱点：物理、冰、雷、量子');
  await expect(narrowGroup.locator('img')).toHaveCount(4);
  await expect(narrowGroup.locator('img').first()).toHaveCSS('width', '20px');
  await expect(narrowGroup.locator('.enemy-weakness-group__item').first()).toHaveAttribute(
    'title',
    '物理属性弱点'
  );
  const narrowItems = await narrowGroup.locator('.semantic-icon-label').all();
  const narrowBoxes = await Promise.all(narrowItems.map((item) => item.boundingBox()));
  expect(narrowBoxes.every((box) => box !== null && Math.abs(box.y - narrowBoxes[0]!.y) < 1)).toBe(
    true
  );
  expect(
    await narrowGroup.evaluate((group) => group.scrollWidth - group.clientWidth)
  ).toBeLessThanOrEqual(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
});

test('敌方单位 Overview 支持类型多选、弱点 OR 与相关性优先排序', async ({ page }) => {
  await page.goto('/enemies?page=2&sort=id');
  await page.getByRole('button', { name: '精英', exact: true }).click();
  await page.getByRole('button', { name: '首领', exact: true }).click();
  await page.getByRole('button', { name: '冰', exact: true }).click();
  await page.getByRole('button', { name: '虚数', exact: true }).click();
  await expect(page).toHaveURL(/type=elite/);
  await expect(page).toHaveURL(/type=boss/);
  await expect(page).toHaveURL(/weakness=Ice/);
  await expect(page).toHaveURL(/weakness=Imaginary/);
  await expect(page).not.toHaveURL(/page=/);

  await page.goto('/enemies?weakness=Physical&weakness=Ice&weakness=Imaginary&sort=id');
  const rankedCards = page.locator('.entity-overview-card');
  await expect(rankedCards.first()).toHaveAttribute('href', '/enemies/1002030');
  await expect(rankedCards.nth(11)).toHaveAttribute('href', '/enemies/1002020');

  await page.goto(
    '/enemies?q=%E8%9A%95%E9%A3%9F%E8%80%85%E4%B9%8B%E5%BD%B1&weakness=Physical&weakness=Ice&weakness=Imaginary'
  );
  await expect(page.locator('.entity-overview-card')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '没有匹配结果' })).toBeVisible();
});

test('敌人缺图 Template 使用共享 fallback 且不发起远程请求', async ({ page }) => {
  const requestedUrls: string[] = [];
  page.on('request', (request) => requestedUrls.push(request.url()));
  await page.goto('/enemies?sort=id&page=2');
  const card = page.locator('a[href="/enemies/2002020"]');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-image-missing', 'true');
  await expect(card.locator('.entity-overview-card__artwork img')).toHaveCount(0);
  await expect(card.locator('.entity-overview-card__fallback')).toBeVisible();
  expect(requestedUrls.some((url) => url.includes('nanoka'))).toBe(false);
});

test('Character、Light Cone 与 Enemy Overview 使用统一紧凑 Grid 且不溢出', async ({ page }) => {
  for (const path of ['/characters', '/light-cones', '/enemies?sort=id']) {
    for (const viewport of [
      { width: 1600, height: 1000 },
      { width: 1280, height: 800 },
      { width: 768, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 720 }
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(path);
      const cards = page.locator('.entity-overview-card');
      await expect(cards.nth(5)).toBeVisible();
      const boxes = await cards.evaluateAll((elements) =>
        elements.slice(0, 6).map((element) => {
          const box = element.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        })
      );
      expect(boxes.length).toBe(6);
      const firstRow = boxes.filter((box) => Math.abs(box.y - boxes[0].y) < 1);
      const expectedColumns =
        viewport.width >= 1350
          ? [5, 6]
          : viewport.width >= 821
            ? [3, 4, 5]
            : viewport.width >= 521
              ? [3]
              : viewport.width > 340
                ? [2]
                : [1];
      expect(expectedColumns, `${path} @ ${viewport.width}px`).toContain(firstRow.length);
      expect(Math.max(...firstRow.map((box) => box.height))).toBeLessThanOrEqual(390);
      expect(Math.min(...firstRow.map((box) => box.height))).toBeGreaterThanOrEqual(300);
      expect(Math.max(...firstRow.map((box) => box.height))).toBeCloseTo(
        Math.min(...firstRow.map((box) => box.height)),
        0
      );

      const firstCard = cards.first();
      const cardMetrics = await firstCard.evaluate((card) => {
        const rect = (selector: string) => {
          const box = card.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        };
        return {
          artwork: rect('.entity-overview-card__artwork'),
          content: rect('.entity-overview-card__content'),
          overlay: rect('.entity-overview-card__overlay')
        };
      });
      expect(cardMetrics.artwork.y + cardMetrics.artwork.height).toBeLessThanOrEqual(
        cardMetrics.content.y + 1
      );
      expect(cardMetrics.overlay.y).toBeGreaterThanOrEqual(cardMetrics.artwork.y);
      expect(cardMetrics.overlay.x + cardMetrics.overlay.width).toBeLessThanOrEqual(
        cardMetrics.artwork.x + cardMetrics.artwork.width
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        )
      ).toBeLessThanOrEqual(1);
      await firstCard.focus();
      await expect(firstCard).toBeFocused();
    }
  }
});

test('详情 Hero 立绘失败时只移除图片并保留稳定舞台', async ({ page }) => {
  await page.goto('/characters/1001');
  const hero = page.locator('.detail-profile-hero');
  const stage = hero.locator('[data-character-portrait="1001"]');
  const image = hero.locator('[data-character-portrait] img');
  const before = await stage.boundingBox();
  expect(before).not.toBeNull();
  await expect(stage).toHaveAttribute('data-artwork-available', 'true');
  await image.evaluate((element) => element.dispatchEvent(new Event('error')));
  await expect(stage).toHaveCount(1);
  await expect(stage).toHaveAttribute('data-artwork-available', 'false');
  await expect(stage.locator('img')).toHaveCount(0);
  const after = await stage.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.width).toBeCloseTo(before!.width, 0);
  expect(after!.height).toBeCloseTo(before!.height, 0);
});

test('角色 Detail Hero 在桌面 3:2 分栏并于 820px 断点纵向堆叠', async ({ page }) => {
  for (const viewport of [
    { width: 1600, height: 1000 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 820, height: 900 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/characters/1310');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
    const hero = page.locator('.detail-profile-hero');
    const identity = hero.locator('.detail-profile-hero__identity');
    const inspection = hero.locator('.detail-profile-hero__inspection');
    await expect(identity.getByRole('heading', { level: 1 })).toBeVisible();
    const identityBox = await identity.boundingBox();
    const inspectionBox = await inspection.boundingBox();
    expect(identityBox).not.toBeNull();
    expect(inspectionBox).not.toBeNull();
    if (viewport.width <= 820) {
      expect(inspectionBox!.y).toBeGreaterThanOrEqual(identityBox!.y + identityBox!.height - 1);
    } else {
      expect(Math.abs(identityBox!.y - inspectionBox!.y)).toBeLessThan(1);
      expect(identityBox!.width / inspectionBox!.width).toBeGreaterThan(1.4);
      expect(identityBox!.width / inspectionBox!.width).toBeLessThan(1.6);
    }
  }
});

test('筛选状态写入 URL、分页响应客户端导航并进入详情', async ({ page }) => {
  await page.goto('/characters');
  const firstPageFirstId = await page.locator('.entity-overview-card').first().getAttribute('href');
  await page.getByRole('link', { name: '下一页' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator('.overview-pagination').getByText('第 2 / 3 页')).toBeVisible();
  await expect(page.locator('.entity-overview-card').first()).not.toHaveAttribute(
    'href',
    firstPageFirstId!
  );
  await page.getByRole('link', { name: '上一页' }).click();
  await expect(page.locator('.overview-pagination').getByText('第 1 / 3 页')).toBeVisible();

  await page.goto('/characters?rarity=4&page=2');
  await expect(page.getByRole('button', { name: '4★' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '5★' }).click();
  await expect(page).toHaveURL(/rarity=5/);
  await expect(page).not.toHaveURL(/page=/);
  await page.goto('/characters/1001');
  await expect(page.getByRole('heading', { name: '三月七·存护' })).toBeVisible();
});

test('Overview 分页保留实时筛选、重复参数与排序状态', async ({ page }) => {
  const cases = [
    {
      route: '/characters?sort=name',
      filters: ['4★', '5★'],
      parameter: 'rarity',
      values: ['4', '5']
    },
    {
      route: '/light-cones?sort=name',
      filters: ['4★', '5★'],
      parameter: 'rarity',
      values: ['4', '5']
    },
    {
      route: '/enemies?sort=name',
      filters: ['冰', '虚数'],
      parameter: 'weakness',
      values: ['Ice', 'Imaginary']
    }
  ] as const;

  for (const scenario of cases) {
    await page.goto(scenario.route);
    for (const filter of scenario.filters) {
      await page.getByRole('button', { name: filter, exact: true }).click();
    }

    const nextPage = page.getByRole('link', { name: '下一页', exact: true });
    await expect(nextPage).toBeVisible();
    const nextHref = await nextPage.getAttribute('href');
    const numericHref = await page
      .getByRole('link', { name: '2', exact: true })
      .getAttribute('href');
    expect(nextHref).not.toBeNull();
    expect(numericHref).not.toBeNull();

    for (const href of [nextHref!, numericHref!]) {
      const params = new URL(href, 'http://localhost').searchParams;
      expect(params.getAll(scenario.parameter)).toEqual(scenario.values);
      expect(params.get('sort')).toBe('name');
      expect(params.get('page')).toBe('2');
    }

    await nextPage.click();
    await expect(page).toHaveURL(/page=2/);
    const navigatedParams = new URL(page.url()).searchParams;
    expect(navigatedParams.getAll(scenario.parameter)).toEqual(scenario.values);
    expect(navigatedParams.get('sort')).toBe('name');
    for (const filter of scenario.filters) {
      await expect(page.getByRole('button', { name: filter, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    }
  }
});

test('从第二页修改筛选后，新分页链接使用重置后的完整状态', async ({ page }) => {
  await page.goto('/characters?rarity=4&rarity=5&sort=name&page=2');
  await page.getByRole('button', { name: '4★', exact: true }).click();
  await expect(page).not.toHaveURL(/page=/);

  const nextPage = page.getByRole('link', { name: '下一页', exact: true });
  await expect(nextPage).toBeVisible();
  const nextHref = await nextPage.getAttribute('href');
  expect(nextHref).not.toBeNull();
  const params = new URL(nextHref!, 'http://localhost').searchParams;
  expect(params.getAll('rarity')).toEqual(['5']);
  expect(params.get('sort')).toBe('name');
  expect(params.get('page')).toBe('2');

  await nextPage.click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByRole('button', { name: '4★', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false'
  );
  await expect(page.getByRole('button', { name: '5★', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});

test('遗器分页在 hydration 后保留排序参数', async ({ page }) => {
  await page.goto('/relics?sort=id');
  const nextPage = page.getByRole('link', { name: '下一页', exact: true });
  await expect(nextPage).toHaveAttribute('href', '?sort=id&page=2');
  await nextPage.click();
  await expect(page).toHaveURL('/relics?sort=id&page=2');
});

test('目录搜索只在提交时应用草稿并重置分页', async ({ page }) => {
  await page.goto('/characters?page=2');
  await page.waitForLoadState('networkidle');
  const firstResult = page.locator('.entity-overview-card').first();
  const originalHref = await firstResult.getAttribute('href');
  const input = page.getByPlaceholder('搜索角色', { exact: true });
  await input.fill('三月七');
  await expect(page).toHaveURL(/page=2/);
  await expect(firstResult).toHaveAttribute('href', originalHref!);
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page).toHaveURL(/q=%E4%B8%89%E6%9C%88%E4%B8%83/);
  await expect(page).not.toHaveURL(/page=/);
  await expect(page.locator('.entity-overview-card')).toHaveCount(2);
  const searchedCard = page.locator('a[href="/characters/1001"]');
  await expect(searchedCard.locator('.entity-overview-card__artwork img')).toHaveAttribute(
    'src',
    '/generated-assets/characters/preview/1001.png'
  );
});

test('角色目录支持同类多选与跨类组合筛选', async ({ page }) => {
  await page.goto('/characters');
  await page.getByRole('button', { name: '巡猎' }).click();
  await page.getByRole('button', { name: '虚无' }).click();
  await expect(page).toHaveURL(/path=Rogue/);
  await expect(page).toHaveURL(/path=Warlock/);
  await expect(page.getByRole('button', { name: '巡猎' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '虚无' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: '火' }).click();
  await page.getByRole('button', { name: '雷' }).click();
  await expect(page).toHaveURL(/element=Fire/);
  await expect(page).toHaveURL(/element=Lightning/);
  await expect(page.locator('.overview-toolbar')).toContainText('个结果');
  await page.getByRole('button', { name: '清除筛选' }).click();
  await expect(page).toHaveURL('/characters');
  await expect(page.getByRole('button', { name: '巡猎' })).toHaveAttribute('aria-pressed', 'false');
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
  await page.route('**/generated/endgame-occurrences/**', async (route) => {
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

test('多命途角色名称由统一规则生成', async ({ page }) => {
  await page.goto('/characters/1224');
  await expect(page.getByRole('heading', { name: '三月七·巡猎' })).toBeVisible();
  await page.goto('/characters/8005');
  await expect(page.getByRole('heading', { name: '开拓者·同谐' })).toBeVisible();
});

test('技能卡按语义类别合并变体并使用真实默认等级', async ({ page }) => {
  await page.goto('/characters/1213');
  const basicCard = page.locator('[data-skill-category="basic"]');
  await expect(basicCard).toHaveCount(1);
  await expect(basicCard.locator('.skill-variant')).toHaveCount(4);
  await expect(basicCard.locator('output')).toHaveText('Lv.6');
  await basicCard.getByRole('slider', { name: '普攻等级' }).fill('0');
  await expect(basicCard.locator('output')).toHaveText('Lv.1');

  const skillCard = page.locator('[data-skill-category="skill"]');
  await expect(skillCard.locator('output')).toHaveText('Lv.10');
  await expect(skillCard.locator('.skill-variant')).toHaveCount(1);
  await expect(skillCard.locator('[data-skill-id="121302"]')).toBeVisible();
  await expect(skillCard.locator('[data-skill-id="121309"]')).toHaveCount(0);

  await page.goto('/characters/1401');
  const hertaSkill = page.locator('[data-skill-category="skill"]');
  await expect(hertaSkill).toHaveCount(1);
  await expect(hertaSkill.locator('.skill-variant')).toHaveCount(2);
});

test('技能类别标题与正文之间只保留一条 divider，秘技隐藏固定等级', async ({ page }) => {
  await page.goto('/characters/1001');
  for (const category of ['basic', 'skill', 'ultimate', 'talent', 'technique']) {
    const card = page.locator(`[data-skill-category="${category}"]`);
    const dividerWidths = await card.evaluate((element) => {
      const heading = element.querySelector<HTMLElement>('.skill-card__heading')!;
      const firstBody = element.querySelector<HTMLElement>(
        '.skill-progression-group, .fixed-variant-list'
      )!;
      const firstLevelControl = element.querySelector<HTMLElement>('.skill-level-control');
      return {
        heading: getComputedStyle(heading).borderBottomWidth,
        firstBody: getComputedStyle(firstBody).borderTopWidth,
        firstLevelControl: firstLevelControl
          ? getComputedStyle(firstLevelControl).borderTopWidth
          : '0px'
      };
    });
    expect(dividerWidths).toEqual({ heading: '1px', firstBody: '0px', firstLevelControl: '0px' });
    if (category === 'technique')
      await expect(card.getByText('Lv.1', { exact: true })).toHaveCount(0);
  }
});

test('Mobile 角色 Overview 的双字命途与属性标签保持同一行', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/characters?q=素裳');
  const card = page.locator('a[href="/characters/1206"]');
  const metadata = card.locator('.entity-overview-card__metadata');
  await expect(card).toBeVisible();
  await expect(metadata).toContainText('巡猎');
  await expect(metadata).toContainText('物理');
  const rows = await metadata
    .locator(':scope > *')
    .evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
  expect(new Set(rows).size).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
});

test('每个 Skill Variant 独立展示技能类型与战斗元数据', async ({ page }) => {
  await page.goto('/characters/1001');
  const basic = page.locator('[data-skill-id="100101"]');
  await expect(basic.locator('[data-skill-effect="SingleAttack"]')).toHaveText('单攻');
  await expect(basic.locator('[data-combat-meta="battle-point"]')).toContainText(/战技点\s*\+1/);
  await expect(basic.locator('[data-combat-meta="energy-gain"]')).toContainText(/能量恢复\s*20/);
  await expect(basic.locator('[data-combat-meta="toughness-damage"]')).toContainText(
    /削韧值\s*单攻：10/
  );
  const skill = page.locator('[data-skill-id="100102"]');
  await expect(skill.locator('[data-skill-effect="Defence"]')).toHaveText('防御');
  await expect(skill.locator('[data-combat-meta="battle-point"]')).toContainText(/战技点\s*-1/);
  await expect(skill.locator('[data-combat-meta="energy-gain"]')).toContainText(/能量恢复\s*30/);
  await expect(skill.locator('[data-combat-meta="toughness-damage"]')).toHaveCount(0);

  await page.goto('/characters/1213');
  for (const [id, bp, energy, toughness] of [
    ['121301', '+1', '20', '10'],
    ['121308', '-1', '30', '20'],
    ['121310', '-2', '35', '30'],
    ['121312', '-3', '40', '40']
  ]) {
    const variant = page.locator(`[data-skill-id="${id}"]`);
    await expect(variant.locator('[data-combat-meta="battle-point"]')).toContainText(bp);
    await expect(variant.locator('[data-combat-meta="energy-gain"]')).toContainText(energy);
    await expect(variant.locator('[data-combat-meta="toughness-damage"]')).toContainText(
      toughness === '10' || toughness === '20' || toughness === '30' || toughness === '40'
        ? new RegExp(`(?:单攻|扩散)：${toughness}`)
        : toughness
    );
  }
  await expect(page.locator('[data-skill-category="basic"] input[type="range"]')).toHaveCount(1);
});

test('特殊资源可与战技点同时显示且忆灵元数据不回归', async ({ page }) => {
  await page.goto('/characters/1310?enhanced=0');
  const baseFirefly = page.locator('[data-skill-id="131002"]');
  await expect(baseFirefly.locator('[data-combat-meta="special-resource"]')).toContainText(
    /技能消耗\s*40%生命值/
  );
  await expect(baseFirefly.locator('[data-combat-meta="battle-point"]')).toContainText(
    /战技点\s*-1/
  );

  await page.goto('/characters/1407');
  const castoriceSkill = page.locator('[data-skill-id="140702"]');
  await expect(castoriceSkill.locator('[data-combat-meta="special-resource"]')).toContainText(
    '30%我方全体当前生命值'
  );
  await expect(castoriceSkill.locator('[data-combat-meta="battle-point"]')).toHaveCount(0);
  await expect(castoriceSkill.locator('[data-combat-meta="energy-gain"]')).toHaveCount(0);
  const memosprite = page.locator('[data-skill-id="1140702"]');
  await expect(memosprite.locator('[data-skill-effect="AoEAttack"]')).toHaveText('群攻');
  await expect(memosprite.locator('[data-combat-meta="special-resource"]')).toContainText(
    '25%生命值'
  );
  await expect(memosprite.locator('[data-combat-meta="toughness-damage"]')).toContainText('10');
  await expect(page.locator('[data-skill-id="1140712"]')).toHaveCount(0);

  await page.goto('/characters/1401');
  const normalHertaSkill = page.locator('[data-skill-id="140102"]');
  await expect(normalHertaSkill.locator('[data-stance-display="single"]')).toHaveText('单攻：15');
  await expect(normalHertaSkill.locator('[data-stance-display="blast"]')).toHaveText('扩散：10');
  const enhancedHertaSkill = page.locator('[data-skill-id="140109"]');
  await expect(enhancedHertaSkill.locator('[data-stance-display="single"]')).toHaveText('单攻：20');
  await expect(enhancedHertaSkill.locator('[data-stance-display="blast"]')).toHaveText('扩散：10');
  await expect(enhancedHertaSkill.locator('[data-stance-display="aoe"]')).toHaveCount(0);
});

test('角色 ExtraEffect 使用共享 disclosure 并保持多形态归属', async ({ page }) => {
  await page.goto('/characters/1224');
  const normal = page.locator('[data-skill-id="122401"]');
  const enhanced = page.locator('[data-skill-id="122408"]');
  await expect(normal.locator('[data-skill-extra-effects]')).toHaveCount(0);
  const details = enhanced.locator('[data-skill-extra-effects]');
  await expect(details).not.toHaveAttribute('open', '');
  await details.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await expect(details.locator('[data-extra-effect="30000002"]')).toContainText('固定概率');
});

test('角色技能、行迹与星魂保留下划线并共享 ExtraEffect disclosure', async ({ page }) => {
  await page.goto('/characters/1001');

  const skill = page.locator('[data-skill-id="100104"]');
  await expect(skill.locator('u')).toContainText('反击');

  const trace = page.locator('[data-trace-id="1001101"]');
  await expect(trace.locator('u')).toHaveText('负面效果');
  const traceEffects = trace.locator('[data-skill-extra-effects]');
  await expect(traceEffects).not.toHaveAttribute('open', '');
  await traceEffects.locator('summary').click();
  await expect(traceEffects.locator('[data-extra-effect="10000010"]')).toContainText('负面效果');

  const eidolon = page.locator('[data-eidolon-id="100104"]');
  await expect(eidolon.locator('u')).toHaveCount(2);
  const eidolonEffects = eidolon.locator('[data-skill-extra-effects]');
  await eidolonEffects.locator('summary').click();
  await expect(eidolonEffects.locator('[data-extra-effect="10000003"]')).toContainText('反击');

  await expect(page.locator('[data-trace-id="1001102"] [data-skill-extra-effects]')).toHaveCount(0);
  await expect(page.locator('[data-eidolon-id="100101"] [data-skill-extra-effects]')).toHaveCount(
    0
  );
});

test('忆灵技和忆灵天赋进入统一技能管线且不重复为行迹', async ({ page }) => {
  await page.goto('/characters/1402');
  await expect(page.locator('[data-skill-category="memosprite-skill"]')).toBeVisible();
  await expect(page.locator('[data-skill-category="memosprite-talent"]')).toBeVisible();
  await expect(page.locator('[data-skill-id="1140201"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: '刺纹之陷', exact: true })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '擘裂冥茫的爪痕', exact: true })).toHaveCount(0);
});

test('角色 Detail Hero 展示完整 identity、放大标签与不截断传记', async ({ page }) => {
  const baselineMetrics: Array<{ fontSize: number; iconSize: number }> = [];
  for (const [url, selector] of [
    ['/enemies/1002011', '.enemy-weakness-list [data-label-size="default"]'],
    ['/characters', '.entity-overview-card [data-label-size="large"]']
  ] as const) {
    await page.goto(url);
    baselineMetrics.push(
      await page
        .locator(selector)
        .first()
        .evaluate((label) => {
          const icon = label.querySelector('img')!;
          return {
            fontSize: Number.parseFloat(getComputedStyle(label).fontSize),
            iconSize: Number.parseFloat(getComputedStyle(icon).width)
          };
        })
    );
  }
  const baselineFontSize = Math.max(...baselineMetrics.map((metric) => metric.fontSize));
  const baselineIconSize = Math.max(...baselineMetrics.map((metric) => metric.iconSize));

  for (const id of ['1402', '1506', '1317', '1310']) {
    await page.goto(`/characters/${id}`);
    const hero = page.locator('.detail-profile-hero--character');
    await expect(hero).toHaveCount(1);
    await expect(hero.locator(`[data-character-portrait="${id}"] img`)).toHaveAttribute(
      'src',
      `/generated-assets/characters/portrait/${id}.webp`
    );
    const gradientMetrics = await hero
      .locator('.detail-profile-hero__gradient')
      .evaluate((layer) => {
        const backgroundImage = getComputedStyle(layer).backgroundImage;
        const angle = Number.parseFloat(
          backgroundImage.match(/linear-gradient\(([-\d.]+)deg/)?.[1] ?? 'NaN'
        );
        const alphas = [...backgroundImage.matchAll(/rgba\([^)]*,\s*([\d.]+)\)/g)].map((match) =>
          Number.parseFloat(match[1])
        );
        return {
          angle,
          firstAlpha: alphas[0] ?? Number.NaN,
          lastAlpha: alphas.at(-1) ?? Number.NaN
        };
      });
    expect(gradientMetrics.angle).toBeGreaterThanOrEqual(80);
    expect(gradientMetrics.angle).toBeLessThanOrEqual(100);
    expect(gradientMetrics.firstAlpha).toBeGreaterThan(0.85);
    expect(gradientMetrics.lastAlpha).toBeLessThan(0.15);
    expect(gradientMetrics.firstAlpha - gradientMetrics.lastAlpha).toBeGreaterThan(0.7);
    await expect(hero.locator('.hero-identity-metadata [data-icon-kind="path"]')).toHaveAttribute(
      'data-label-size',
      'hero'
    );
    await expect(
      hero.locator('.hero-identity-metadata [data-icon-kind="element"]')
    ).toHaveAttribute('data-label-size', 'hero');
    const heroTagMetrics = await hero
      .locator('.hero-identity-metadata [data-icon-kind="path"]')
      .evaluate((label) => {
        const icon = label.querySelector('img')!;
        return {
          fontSize: Number.parseFloat(getComputedStyle(label).fontSize),
          iconSize: Number.parseFloat(getComputedStyle(icon).width)
        };
      });
    expect(heroTagMetrics.fontSize).toBeGreaterThan(baselineFontSize);
    expect(heroTagMetrics.iconSize).toBeGreaterThan(baselineIconSize);
    await expect(hero.locator('.hero-description')).toHaveCSS('border-top-width', '1px');
    await expect(hero.locator('.hero-description')).toHaveCSS('text-overflow', 'clip');
    expect(
      await hero
        .locator('.hero-description')
        .evaluate((element) => element.scrollHeight - element.clientHeight)
    ).toBeLessThanOrEqual(1);
    if (id === '1317') {
      const biography = hero.locator('.hero-description');
      await expect(biography).toContainText(
        '身为「巡海游侠」的一员，始终追猎着名为「御猿•邪忍」的恶党，直至银河尽头。'
      );
      const biographyStyle = await biography.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          overflow: style.overflow,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          maxHeight: style.maxHeight,
          webkitLineClamp: style.webkitLineClamp,
          inlineHeight: (element as HTMLElement).style.height
        };
      });
      expect(biographyStyle.overflow).not.toBe('hidden');
      expect(biographyStyle.overflowX).not.toBe('hidden');
      expect(biographyStyle.overflowY).not.toBe('hidden');
      expect(biographyStyle.maxHeight).toBe('none');
      expect(biographyStyle.webkitLineClamp).toBe('none');
      expect(biographyStyle.inlineHeight).toBe('');
    }
    await expect(hero.locator('.hero-identity-copy')).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)'
    );
  }
});

test('角色与光锥 Detail Hero 的 rarity 与 identity presentation 保持语义隔离', async ({ page }) => {
  for (const [url, heroSelector, rarity, color, tagCount] of [
    ['/characters/1402', '.detail-profile-hero--character', 5, 'rgb(255, 215, 0)', 2],
    ['/characters/1001', '.detail-profile-hero--character', 4, 'rgb(199, 125, 255)', 2],
    ['/light-cones/20000', '.detail-profile-hero--light-cone', 3, 'rgb(96, 144, 255)', 1]
  ] as const) {
    await page.goto(url);
    const hero = page.locator(heroSelector);
    const rarityStars = hero.locator('.hero-identity-metadata > .rarity-stars');
    await expect(rarityStars).toHaveAttribute('aria-label', `${rarity}星`);
    await expect(rarityStars).toHaveAttribute('data-rarity-size', 'hero');
    await expect(rarityStars).toHaveCSS('color', color);
    expect(
      await rarityStars.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          borderWidth: style.borderTopWidth,
          backgroundColor: style.backgroundColor,
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight
        };
      })
    ).toEqual({
      borderWidth: '0px',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      paddingLeft: '0px',
      paddingRight: '0px'
    });

    const identityTags = hero.locator('.hero-identity-metadata > .semantic-icon-label');
    await expect(identityTags).toHaveCount(tagCount);
    for (let index = 0; index < tagCount; index += 1) {
      await expect(identityTags.nth(index)).toHaveCSS('font-weight', '500');
    }
  }
});

test('角色等级属性默认 Lv.80、使用突破后边界并严格按语义行排序', async ({ page }) => {
  await page.goto('/characters/1001');
  const panel = page.locator('.base-stats-panel');
  const slider = panel.getByRole('slider', { name: '角色等级' });
  await expect(panel.locator('output')).toHaveText('Lv.80');
  await expect(
    page.locator('.detail-profile-hero__inspection#stats .base-stats-panel')
  ).toHaveCount(1);
  await expect(page.locator('.detail-section .base-stats-panel')).toHaveCount(0);
  await expect(panel.locator('dl.inspection-stat-list')).toHaveCount(1);
  await expect(panel.locator('.inspection-stat-row')).toHaveCount(5);
  await expect(panel.locator('.inspection-stat-row > dt')).toHaveText([
    '生命值',
    '攻击力',
    '防御力',
    '基础速度',
    '能量上限'
  ]);
  await expect(panel.locator('.inspection-stat-row > dd')).toHaveCount(5);
  await expect(panel.locator('[data-base-stat="hp"] > dd')).toHaveText('1,058');
  await expect(panel.locator('[data-base-stat="attack"]')).toContainText('攻击力');
  await expect(panel.locator('[data-base-stat="defence"]')).toContainText('防御力');
  await expect(panel.locator('[data-base-stat="speed"] > dd')).toHaveText('101');
  await expect(panel.locator('[data-base-stat="energy"] > dd')).toHaveText('120');
  await expect(panel).not.toContainText(/HP|ATK|DEF|SPD/);
  const directOrder = await panel
    .locator(':scope > *')
    .evaluateAll((children) => children.map((child) => child.className));
  expect(directOrder[0]).toContain('stat-level-control');
  expect(directOrder[1]).toContain('inspection-stat-list');
  await slider.fill('20');
  await expect(panel.locator('.inspection-stat-list .scaling-value').first()).toHaveText('338');
  await expect(panel.locator('.inspection-stat-list .scaling-value').first()).toHaveCSS(
    'color',
    'rgb(242, 164, 95)'
  );
});

test('角色、光锥与敌人 Hero 共享 inspection stat row presentation', async ({ page }) => {
  const readRowPresentation = async (url: string) => {
    await page.goto(url);
    const list = page.locator('.detail-profile-hero__inspection .inspection-stat-list');
    const row = list.locator('.inspection-stat-row').nth(1);
    await expect(list).toBeVisible();
    return row.evaluate((element) => {
      const rowStyle = getComputedStyle(element);
      const labelStyle = getComputedStyle(element.querySelector('dt')!);
      const valueStyle = getComputedStyle(element.querySelector('dd strong')!);
      return {
        display: rowStyle.display,
        paddingTop: rowStyle.paddingTop,
        paddingBottom: rowStyle.paddingBottom,
        borderTopWidth: rowStyle.borderTopWidth,
        borderTopColor: rowStyle.borderTopColor,
        labelColor: labelStyle.color,
        labelFontSize: labelStyle.fontSize,
        valueColor: valueStyle.color,
        valueFontSize: valueStyle.fontSize,
        valueFontWeight: valueStyle.fontWeight
      };
    });
  };

  const character = await readRowPresentation('/characters/1001');
  const lightCone = await readRowPresentation('/light-cones/20000');
  const enemy = await readRowPresentation('/enemies/1004014');
  const withoutValueColor = ({ valueColor, ...presentation }: typeof character) => {
    void valueColor;
    return presentation;
  };
  expect(withoutValueColor(lightCone)).toEqual(withoutValueColor(character));
  expect(withoutValueColor(enemy)).toEqual(withoutValueColor(character));
  expect(lightCone.valueColor).toBe(character.valueColor);
  expect(enemy.valueColor).toBe('rgb(242, 245, 251)');
});

test('光锥 Detail Hero 使用完整 contain portrait、单一 Hero 命途标签与稳定降级', async ({
  page
}) => {
  for (const id of ['20000', '21015', '21034', '23029', '23039']) {
    await page.goto(`/light-cones/${id}`);
    const hero = page.locator('.detail-profile-hero--light-cone');
    const stage = hero.locator(`[data-light-cone-portrait="${id}"]`);
    const image = stage.locator('img');
    await expect(hero).toHaveCount(1);
    await expect(image).toHaveAttribute('src', `/generated-assets/light-cones/portrait/${id}.webp`);
    await expect(image).toHaveCSS('object-fit', 'contain');
    await expect(hero.locator('.hero-identity-metadata [data-icon-kind="path"]')).toHaveAttribute(
      'data-label-size',
      'hero'
    );
    await expect(hero.locator('.hero-identity-metadata [data-icon-kind="element"]')).toHaveCount(0);
    await expect(hero.locator('.hero-description')).toHaveCount(0);
    await expect(hero.locator('.hero-identity-copy')).not.toContainText(/仅对|装备者|叠影/);
  }

  await page.goto('/light-cones/20000');
  const stage = page.locator('[data-light-cone-portrait="20000"]');
  const before = await stage.boundingBox();
  await stage.locator('img').evaluate((image) => image.dispatchEvent(new Event('error')));
  await expect(stage).toHaveAttribute('data-artwork-available', 'false');
  await expect(stage.locator('img')).toHaveCount(0);
  const after = await stage.boundingBox();
  expect(after!.height).toBeCloseTo(before!.height, 0);
});

test('光锥等级与叠影滑块独立、控件先于效果且动态参数更新', async ({ page }) => {
  await page.goto('/light-cones/20000');
  const inspection = page.locator('.detail-profile-hero__inspection');
  const stats = page.locator('.base-stats-panel');
  const superimposition = page.locator('.superimposition-panel');
  await expect(stats.locator('output')).toHaveText('Lv.80');
  await expect(stats.locator('dl.inspection-stat-list')).toHaveCount(1);
  await expect(stats.locator('.inspection-stat-row')).toHaveCount(3);
  await expect(stats.locator('.inspection-stat-row > dt')).toHaveText([
    '生命值',
    '攻击力',
    '防御力'
  ]);
  await expect(stats.locator('.inspection-stat-row > dd')).toHaveCount(3);
  await expect(stats.locator('[data-base-stat="hp"] > dd')).toHaveText('847');
  await expect(stats).not.toContainText(/HP|ATK|DEF|SPD/);
  await expect(inspection.locator('.info-card')).toHaveCount(0);
  await expect(page.locator('.detail-section .base-stats-panel')).toHaveCount(0);
  await expect(page.locator('.detail-section .superimposition-panel')).toHaveCount(0);
  await expect(superimposition.getByRole('heading', { level: 3 })).toHaveText('危机');
  await expect(superimposition.locator('output')).toHaveText('Lv.1');
  await expect(superimposition.locator('.scaling-value')).toHaveText('12%');
  expect(
    await inspection.evaluate((panel) =>
      [
        ...panel.querySelectorAll(
          '.stat-level-control, [data-base-stat], :scope > .detail-inspection-divider, .superimposition-control, .superimposition-effect > h3, .superimposition-effect > .levelled-description'
        )
      ].map((element) => {
        if (element.classList.contains('stat-level-control')) return 'level';
        if (element.hasAttribute('data-base-stat')) return element.getAttribute('data-base-stat');
        if (element.classList.contains('detail-inspection-divider')) return 'divider';
        if (element.classList.contains('superimposition-control')) return 'superimposition';
        if (element.matches('h3')) return 'passive';
        return 'effect';
      })
    )
  ).toEqual([
    'level',
    'hp',
    'attack',
    'defence',
    'divider',
    'superimposition',
    'passive',
    'effect'
  ]);
  expect(
    await inspection
      .locator(':scope > *')
      .evaluateAll((children) => children.map((child) => child.className))
  ).toEqual(['base-stats-panel', 'detail-inspection-divider', 'superimposition-panel']);
  expect(
    await superimposition
      .locator(':scope > *')
      .evaluateAll((children) => children.map((child) => child.className))
  ).toEqual(['skill-level-control superimposition-control', 'superimposition-effect']);
  expect(
    await superimposition.evaluate((panel) => {
      const slider = panel.querySelector('input[type="range"]')!;
      const heading = panel.querySelector('h3')!;
      return Boolean(slider.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING);
    })
  ).toBe(true);
  await stats.getByRole('slider', { name: '光锥等级' }).fill('1');
  await expect(superimposition.locator('output')).toHaveText('Lv.1');
  await superimposition.getByRole('slider', { name: '叠影等级' }).fill('4');
  await expect(superimposition.locator('output')).toHaveText('Lv.5');
  await expect(superimposition.locator('.scaling-value')).toHaveText('24%');
  await expect(stats.locator('output')).toHaveText('Lv.1');
});

test('特殊能量使用结构化标记且旧版银狼保持普通能量', async ({ page }) => {
  for (const id of ['1308', '1506']) {
    await page.goto(`/characters/${id}`);
    const energy = page.locator('[data-base-stat="energy"]');
    await expect(energy.locator('dt')).toHaveText('能量上限');
    await expect(energy.locator('dd')).toHaveText('特殊能量');
  }
  await page.goto('/characters/1006');
  const standardEnergy = page.locator('[data-base-stat="energy"]');
  await expect(standardEnergy.locator('dt')).toHaveText('能量上限');
  await expect(standardEnergy.locator('dd')).toHaveText('110');
  await expect(standardEnergy).not.toContainText('特殊能量');
});

test('角色加强开关只渲染当前 Profile 并保持 URL 状态', async ({ page }) => {
  await page.goto('/characters/1212');
  const enhancement = page.getByRole('switch', { name: '角色加强' });
  await expect(enhancement).toBeVisible();
  await expect(enhancement).toHaveAttribute('aria-checked', 'true');
  await expect(enhancement).toContainText('加强后');
  await expect(page.locator('[data-skill-id="1121202"]')).toContainText('150%生命上限');
  await expect(page.locator('[data-skill-id="121202"]')).toHaveCount(0);
  await expect(page.locator('[data-trace-id="11212101"]')).toContainText('终结技伤害提高20%');
  await expect(page.locator('[data-trace-id="1212101"]')).toHaveCount(0);
  await expect(page.locator('[data-eidolon-id="1121201"]')).toContainText('暴击伤害提高36%');
  await expect(page.locator('[data-eidolon-id="121201"]')).toHaveCount(0);

  await enhancement.click();
  await expect(page).toHaveURL(/\/characters\/1212\?enhanced=0$/);
  await expect(enhancement).toHaveAttribute('aria-checked', 'false');
  await expect(enhancement).toContainText('加强前');
  await expect(page.locator('[data-skill-id="121202"]')).toContainText('200%攻击力');
  await expect(page.locator('[data-skill-id="1121202"]')).toHaveCount(0);
  await expect(page.locator('[data-trace-id="1212101"]')).toBeVisible();
  await expect(page.locator('[data-trace-id="11212101"]')).toHaveCount(0);
  await expect(page.locator('[data-eidolon-id="121201"]')).toContainText('暴击伤害提高24%');
  await expect(page.locator('[data-eidolon-id="1121201"]')).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('switch', { name: '角色加强' })).toHaveAttribute(
    'aria-checked',
    'false'
  );
  await expect(page.locator('[data-skill-id="1121202"]')).toHaveCount(0);
  await page.getByRole('switch', { name: '角色加强' }).press('Space');
  await expect(page).toHaveURL(/\/characters\/1212$/);
  await expect(page.locator('[data-skill-id="1121202"]')).toBeVisible();

  await page.goto('/characters/1001');
  await expect(page.getByRole('switch', { name: '角色加强' })).toHaveCount(0);
});

test('HideInUI 技能在玩家侧管线统一隐藏且公开技能保持可用', async ({ page }) => {
  await page.goto('/characters/8007');
  const remembranceBasic = page.locator('[data-skill-category="basic"]');
  await expect(remembranceBasic.locator('.skill-variant')).toHaveCount(2);
  await expect(remembranceBasic.locator('[data-skill-id="800701"]')).toContainText('包在我身上');
  await expect(remembranceBasic.locator('[data-skill-id="800708"]')).toContainText(
    '明天，一同写下'
  );
  await expect(remembranceBasic.locator('[data-skill-id="800701"]')).toContainText('100%');
  await expect(remembranceBasic.locator('[data-skill-id="800708"]')).toContainText('120%');
  await expect(remembranceBasic.getByRole('slider', { name: '普攻等级' })).toHaveCount(1);
  await remembranceBasic.getByRole('slider', { name: '普攻等级' }).fill('7');
  await expect(remembranceBasic.locator('output')).toHaveText('Lv.8');
  await expect(remembranceBasic.locator('[data-skill-id="800701"]')).toContainText('120%');
  await expect(remembranceBasic.locator('[data-skill-id="800708"]')).toContainText('144%');
  await expect(page.locator('[data-skill-id="800709"]')).toHaveCount(0);

  await page.goto('/characters/8008');
  const remembranceBasicFemale = page.locator('[data-skill-category="basic"]');
  await expect(remembranceBasicFemale.locator('.skill-variant')).toHaveCount(2);
  await expect(remembranceBasicFemale.locator('[data-skill-id="800801"]')).toBeVisible();
  await expect(remembranceBasicFemale.locator('[data-skill-id="800808"]')).toContainText(
    '明天，一同写下'
  );
  await expect(remembranceBasicFemale.getByRole('slider', { name: '普攻等级' })).toHaveCount(1);
  await expect(page.locator('[data-skill-id="800809"]')).toHaveCount(0);

  await page.goto('/characters/1407');
  const memospriteSkill = page.locator('[data-skill-category="memosprite-skill"]');
  await expect(memospriteSkill.locator('[data-skill-id="1140702"]')).toBeVisible();
  await expect(memospriteSkill.locator('[data-skill-id="1140710"]')).toHaveCount(0);
  await expect(memospriteSkill.locator('[data-skill-id="1140711"]')).toHaveCount(0);
  await expect(memospriteSkill.locator('[data-skill-id="1140712"]')).toHaveCount(0);
  await expect(memospriteSkill.getByRole('slider', { name: '忆灵技等级' })).toHaveCount(1);
  await expect(memospriteSkill.getByRole('slider', { name: '忆灵技等级' }).first()).toBeVisible();
  const memospriteTalent = page.locator('[data-skill-category="memosprite-talent"]');
  await expect(memospriteTalent.locator('[data-skill-id="1140706"]')).toBeVisible();
  await expect(memospriteTalent.getByRole('slider', { name: '忆灵天赋等级' })).toHaveCount(1);

  await page.goto('/characters/1507');
  await expect(page.locator('[data-skill-id="150709"]')).toHaveCount(0);
  await expect(page.getByText('上游原始数据未提供该技能描述。')).toHaveCount(0);

  await page.goto('/characters/1509');
  await expect(page.locator('[data-skill-category="basic"] .skill-variant')).toHaveCount(1);
  await expect(page.locator('[data-skill-id="150901"]')).toContainText('漫不经心');
  const gilgameshSkill = page.locator('[data-skill-category="skill"]');
  await expect(gilgameshSkill.locator('.skill-variant')).toHaveCount(1);
  await expect(gilgameshSkill.locator('[data-skill-id="150902"]')).toContainText('王之财宝');
  await expect(page.locator('[data-skill-id="150909"]')).toHaveCount(0);
  await expect(page.getByText('上游原始数据未提供该技能描述。')).toHaveCount(0);

  await page.goto('/characters/1510');
  await expect(page.locator('[data-skill-id="151022"]')).toBeVisible();
  await expect(page.locator('[data-skill-id="151025"]')).toHaveCount(0);
  await expect(page.locator('[data-skill-id="151026"]')).toHaveCount(0);

  await page.goto('/characters/1415');
  const cyreneMemospriteSkill = page.locator('[data-skill-category="memosprite-skill"]');
  await expect(cyreneMemospriteSkill.locator('.skill-variant')).toHaveCount(2);
  await expect(cyreneMemospriteSkill.locator('[data-skill-id="1141501"]')).toBeVisible();
  await expect(cyreneMemospriteSkill.locator('[data-skill-id="1141502"]')).toBeVisible();
  for (let skillId = 1141513; skillId <= 1141526; skillId += 1)
    await expect(page.locator(`[data-skill-id="${skillId}"]`)).toHaveCount(0);
});

test('Character Special Effect trigger 打开共享 modal 并保持 relation 与焦点', async ({
  page,
  isMobile
}) => {
  await page.goto('/characters/1415');
  const initialBodyOverflow = await page.evaluate(() => document.body.style.overflow);
  const cyreneSourceLevel = page
    .locator('[data-skill-category="memosprite-skill"]')
    .getByRole('slider', { name: '忆灵技等级' });
  await expect(cyreneSourceLevel).toHaveValue('5');
  const trigger = page.getByRole('button', { name: '查看特殊效果' }).first();
  await expect(trigger).toBeVisible();
  await expect(trigger.locator('[data-game-icon="AvatarCyrene"]')).toBeVisible();
  await expect(trigger.locator('u')).toHaveText(['特', '殊效果']);
  await trigger.focus();
  await trigger.press('Enter');

  const dialog = page.getByRole('dialog', { name: '特殊效果' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-special-effect-kind="servant-skill-link"]')).toHaveCount(14);
  await expect(dialog.locator('[data-special-effect-order]').first()).toHaveAttribute(
    'data-special-effect-order',
    '1'
  );
  await expect(dialog.locator('[data-special-effect-order]').last()).toHaveAttribute(
    'data-special-effect-order',
    '14'
  );
  await expect(dialog.locator('[data-skill-id="1141526"]')).toBeVisible();
  await expect(dialog.locator('[data-skill-id="1141513"]')).toBeVisible();
  await expect(dialog.locator('[data-linked-avatar-id="1415"]')).toContainText('昔涟');
  await expect(dialog.getByRole('slider')).toHaveCount(0);
  await expect(dialog.locator('.special-effect-dialog__level')).toHaveText('Lv.6');
  await expect(dialog.locator('[data-skill-id="1141526"]')).toContainText('60%');
  await expect(dialog.getByText(/^第 \d+ 项$/)).toHaveCount(0);
  const cyreneTrailblazer = dialog.locator('[data-linked-avatar-id="8007"]');
  await expect(cyreneTrailblazer).toHaveAttribute('data-display-avatar-id', '8008');
  await expect(cyreneTrailblazer.locator('img')).toHaveAttribute(
    'src',
    /generated-assets\/characters\/preview\/8008\.png/
  );
  await expect(cyreneTrailblazer.locator('strong')).toHaveText('开拓者·记忆');
  expect(
    await dialog
      .locator('.special-effect-dialog__content')
      .evaluate((element) => element.scrollHeight > element.clientHeight)
  ).toBe(true);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

  await dialog.getByRole('button', { name: '关闭特殊效果' }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe(initialBodyOverflow);

  await cyreneSourceLevel.fill('7');
  await expect(cyreneSourceLevel).toHaveValue('7');
  await trigger.click();
  await expect(dialog.locator('.special-effect-dialog__level')).toHaveText('Lv.8');
  await expect(dialog.locator('[data-skill-id="1141526"]')).toContainText('72%');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  if (!isMobile) {
    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  }

  await page.goto('/characters/1510');
  const himekoSourceLevel = page.locator(
    '[data-skill-category="assist"] .skill-level-control input[type="range"]'
  );
  await expect(himekoSourceLevel).toHaveValue('9');
  const himekoTrigger = page.getByRole('button', { name: '查看特殊效果' }).first();
  await expect(page.getByRole('button', { name: '查看特殊效果' })).toHaveCount(2);
  await himekoTrigger.click();
  const himekoDialog = page.getByRole('dialog', { name: '特殊效果' });
  await expect(himekoDialog.locator('[data-special-effect-kind="avatar-skill-link"]')).toHaveCount(
    2
  );
  await expect(himekoDialog.locator('[data-skill-id="151025"]')).toBeVisible();
  await expect(himekoDialog.locator('[data-skill-id="151026"]')).toBeVisible();
  await expect(himekoDialog.getByRole('slider')).toHaveCount(0);
  await expect(himekoDialog.locator('.special-effect-dialog__level')).toHaveText('Lv.10');
  const himekoTrailblazer = himekoDialog.locator('[data-linked-avatar-id="8001"]');
  await expect(himekoTrailblazer).toHaveAttribute('data-display-avatar-id', '8002');
  await expect(himekoTrailblazer.locator('img')).toHaveAttribute(
    'src',
    /generated-assets\/characters\/preview\/8002\.png/
  );
  await expect(himekoTrailblazer.locator('strong')).toHaveText('开拓者');
  await expect(himekoDialog.locator('[data-linked-avatar-id="1001"] strong')).toHaveText('三月七');
  await expect(himekoDialog.locator('[data-linked-avatar-id="1003"]')).toContainText('姬子');
  await expect(himekoDialog).not.toContainText('简化模式');
  await himekoDialog.getByRole('button', { name: '关闭特殊效果' }).click();

  await page.goto('/characters/8007');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('开拓者·记忆');
  await page.goto('/characters/1001');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('三月七·存护');

  await page.goto('/characters/1509');
  await expect(page.getByRole('button', { name: '查看特殊效果' })).toHaveCount(0);
  await expect(page.locator('[data-skill-id="150909"]')).toHaveCount(0);
});

test('属性行迹、普通换行与光锥 identity 内容边界正确渲染', async ({ page }) => {
  await page.goto('/characters/1407');
  await expect(page.locator('[data-trace-id="1407202"]')).toContainText('量子属性伤害提高3.2%');
  await expect(page.locator('[data-trace-id="1407204"]')).toContainText('暴击伤害提高5.3%');
  const introduction = page.locator('.hero-description');
  await expect(introduction.locator('.game-text')).toHaveCSS('white-space', 'pre-line');
  expect((await introduction.innerText()).split('\n')).toHaveLength(3);

  await page.goto('/light-cones/20002');
  const identity = page.locator('.detail-profile-hero__identity');
  await expect(identity).not.toContainText('光锥技能仅对「毁灭」命途角色生效');
  await expect(identity).not.toContainText('<color');
});

test('行迹使用三列能力分组与紧凑属性卡直接展示完整内容', async ({ page, isMobile }) => {
  await page.goto('/characters/1001');
  const traces = page.locator('#traces');
  const abilityGroups = traces.locator('[data-trace-group]');
  const abilities = abilityGroups.locator('.trace-card--ability');
  const purity = traces.locator('[data-trace-id="1001101"]');
  const ice = traces.locator('[data-trace-id="1001201"]');
  await expect(abilityGroups).toHaveCount(3);
  await expect(abilities).toHaveCount(3);
  await expect(purity).toContainText('额外能力');
  await expect(purity).toContainText('角色晋阶 2');
  await expect(purity).toContainText('解除指定我方单体的1个负面效果');
  await expect(ice).toContainText('属性加成');
  await expect(ice).not.toContainText('角色晋阶');
  await expect(ice).toHaveAttribute('data-trace-standalone', '');
  await expect(traces.getByText('Lv.1', { exact: true })).toHaveCount(0);
  await expect(traces.locator('svg, .trace-tree-viewport, .trace-detail')).toHaveCount(0);
  await expect(traces.locator('button[data-trace-id]')).toHaveCount(0);

  const geometry = await traces.evaluate((section) => {
    const box = (element: Element) => element.getBoundingClientRect();
    const abilityNodes = [
      ...section.querySelectorAll<HTMLElement>('[data-trace-group] > .trace-card--ability')
    ];
    const statNodes = [...section.querySelectorAll<HTMLElement>('.trace-card--stat')];
    return {
      abilityTops: abilityNodes.map((node) => box(node).top),
      abilityLefts: abilityNodes.map((node) => box(node).left),
      abilityWidths: abilityNodes.map((node) => box(node).width),
      abilityHeight: box(abilityNodes[0]).height,
      statHeight: Math.min(...statNodes.map((node) => box(node).height))
    };
  });
  expect(
    new Set((isMobile ? geometry.abilityLefts : geometry.abilityTops).map(Math.round)).size
  ).toBe(1);
  if (isMobile) expect(new Set(geometry.abilityTops.map(Math.round)).size).toBe(3);
  expect(new Set(geometry.abilityWidths.map(Math.round)).size).toBe(1);
  expect(geometry.abilityHeight).toBeGreaterThan(geometry.statHeight);
});

test('记忆开拓者按真实前置链归组并将第四项能力独占底部整行', async ({ page }) => {
  for (const id of ['8007', '8008']) {
    await page.goto(`/characters/${id}`);
    const traces = page.locator('#traces');
    const groups = traces.locator('[data-trace-group]');
    await expect(groups).toHaveCount(3);
    await expect(traces.locator('[data-trace-type="ability"]')).toHaveCount(4);
    await expect(traces.getByRole('heading', { name: '未完的尾声', exact: true })).toHaveCount(1);
    const special = traces.locator(`[data-trace-id="${id}501"]`);
    await expect(special).toHaveAttribute('data-trace-special', '');
    await expect(special).not.toContainText('解锁条件');
    await expect(groups.nth(0).locator('[data-trace-type="stat"]')).toHaveCount(2);
    await expect(groups.nth(1).locator('[data-trace-type="stat"]')).toHaveCount(2);
    await expect(groups.nth(2).locator('[data-trace-type="stat"]')).toHaveCount(3);
    await expect(groups.nth(2).locator(`[data-trace-id="${id}208"]`)).toBeVisible();
    await expect(groups.nth(2).locator(`[data-trace-id="${id}209"]`)).toBeVisible();
    await expect(groups.nth(2).locator(`[data-trace-id="${id}210"]`)).toBeVisible();
    await expect(traces.locator('[data-trace-standalone]')).toHaveCount(3);

    const geometry = await traces.evaluate((section) => {
      const specialBox = section
        .querySelector<HTMLElement>('[data-trace-special]')!
        .getBoundingClientRect();
      const independentBox = section
        .querySelector<HTMLElement>('[data-trace-independent-section]')!
        .getBoundingClientRect();
      return {
        specialWidth: specialBox.width,
        independentWidth: independentBox.width,
        bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    expect(Math.abs(geometry.specialWidth - geometry.independentWidth)).toBeLessThanOrEqual(2);
    expect(geometry.bodyOverflow).toBe(0);
  }
});

test('角色详情 icon 增强保持 canonical 技能、紧凑卡片与无破图布局', async ({ page, isMobile }) => {
  await page.goto('/characters/1407');
  await expect(page.locator('#stats .inspection-stat-label img')).toHaveCount(5);
  const skillCards = page.locator('#skills .skill-card');
  await expect(skillCards).toHaveCount(7);
  await expect(skillCards.locator('.skill-card__heading img')).toHaveCount(7);
  await expect(
    page.locator('[data-skill-category="skill"] .skill-card__heading img')
  ).toHaveAttribute('src', '/generated-assets/character-details/icons/skill/1407_skill.png');
  await expect(page.locator('[data-skill-category="skill"] [data-skill-id]')).toHaveCount(2);
  await expect(
    page.locator(
      '[data-skill-category="skill"] .skill-variant img[src^="/generated-assets/character-details/"]'
    )
  ).toHaveCount(0);

  await expect(
    page.locator('#traces .trace-card--ability .trace-card__identity > img')
  ).toHaveCount(3);
  await expect(page.locator('#traces .trace-card--stat .trace-card__title--icon img')).toHaveCount(
    10
  );
  await expect(page.locator('#eidolons .rank-icon')).toHaveCount(6);
  await expect(page.locator('#eidolons .rank-label')).toHaveText([
    '星魂 1',
    '星魂 2',
    '星魂 3',
    '星魂 4',
    '星魂 5',
    '星魂 6'
  ]);
  await expect(page.locator('#eidolons .rank-number')).toHaveCount(0);

  const presentation = await page.evaluate(() => {
    const detailImages = [
      ...document.querySelectorAll<HTMLImageElement>(
        'img[src^="/generated-assets/character-details/"]'
      )
    ];
    const skillHeading = document
      .querySelector<HTMLElement>('[data-skill-category="skill"] .skill-card__heading')!
      .getBoundingClientRect();
    return {
      loaded: detailImages.every((image) => image.complete && image.naturalWidth > 0),
      count: detailImages.length,
      skillHeadingHeight: skillHeading.height,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  expect(presentation.loaded).toBe(true);
  expect(presentation.count).toBeGreaterThan(20);
  expect(presentation.skillHeadingHeight).toBeLessThan(60);
  expect(presentation.overflow).toBeLessThanOrEqual(isMobile ? 1 : 0);

  for (const id of ['8007', '8008']) {
    await page.goto(`/characters/${id}`);
    await expect(
      page.locator(`[data-trace-id="${id}501"] .trace-card__identity > img`)
    ).toHaveAttribute(
      'src',
      `/generated-assets/character-details/icons/skill/${id}_basic_atk2.png`
    );
  }
});

test('角色与敌人属性文字使用统一颜色', async ({ page }) => {
  await page.goto('/characters/1005');
  await expect(page.locator('.hero-identity-metadata').getByText('雷', { exact: true })).toHaveCSS(
    'color',
    'rgb(212, 106, 235)'
  );
  await page.goto('/enemies/1002011');
  const weaknesses = page.locator('.enemy-weakness-list');
  await expect(weaknesses.getByText('火', { exact: true })).toHaveCSS('color', 'rgb(242, 87, 64)');
  await expect(page.getByRole('heading', { name: '掉落物' })).toHaveCount(0);
});

test('移动导航可用且页面无横向溢出', async ({ page, isMobile }) => {
  test.skip(!isMobile, '仅移动项目执行');
  await page.goto('/');
  await page.getByRole('button', { name: '打开导航' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('/characters');
  await expect(page.getByRole('button', { name: '筛选与排序' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '巡猎' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
