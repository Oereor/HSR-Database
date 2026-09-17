import { expect, test } from '@playwright/test';

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
    await expect(card.getByRole('img', { name: pathName, exact: true })).toBeVisible();
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
      if (path === '/characters' && viewport.width === 390) {
        await expect(page.getByRole('button', { name: '筛选与排序' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: '巡猎' })).toBeVisible();
      }
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
