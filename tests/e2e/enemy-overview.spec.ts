import { expect, test } from '@playwright/test';

test('敌人目录使用本地立绘、default Monster 弱点和归一化类型筛选', async ({ page }) => {
  await page.goto('/enemies/?sort=id');
  const heroArtwork = page.locator('.overview-hero__artwork img');
  await expect(heroArtwork).toHaveCount(3);
  expect(
    await heroArtwork.evaluateAll((images) => images.map((image) => image.getAttribute('src')))
  ).toEqual([
    '/generated-enemy-assets/icons/Monster_1005010.webp',
    '/generated-enemy-assets/icons/Monster_2004010.webp',
    '/generated-enemy-assets/icons/Monster_4034010.webp'
  ]);
  const card = page.locator('a[href="/enemies/1002015/"]');
  await expect(card).toBeVisible();
  await expect(card.locator('.entity-overview-card__artwork img')).toHaveAttribute(
    'src',
    /^\/generated-enemy-assets\/icons\/Monster_\d+\.webp$/
  );
  await expect(
    card.locator('.entity-overview-card__metadata [data-icon-kind="element"]')
  ).toHaveCount(2);

  await page.goto('/enemies/?type=MinionLv2&sort=id');
  await expect(page.getByRole('button', { name: '普通', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  const typeGroup = page.locator('[aria-labelledby="filter-group-enemy-type"]');
  await expect(typeGroup.getByRole('button')).toHaveText(['全部', '普通', '精英', '首领']);
});

test('Enemy Overview 弱点使用可访问的 icon-only 单行 Group', async ({ page, isMobile }) => {
  test.skip(isMobile, 'This test owns its responsive viewport matrix');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/enemies/');

  const threeWeaknesses = page.locator('a[href="/enemies/4034011/"]');
  const fourWeaknesses = page.locator('a[href="/enemies/4034018/"]');
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

  await page.goto('/enemies/?sort=id');
  const twoWeaknesses = page.locator('a[href="/enemies/1002015/"]');
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
  await page.goto('/enemies/');
  const narrowGroup = page.locator('a[href="/enemies/4034018/"] .enemy-weakness-group').first();
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
  await page.goto('/enemies/?page=2&sort=id');
  await page.getByRole('button', { name: '精英', exact: true }).click();
  await page.getByRole('button', { name: '首领', exact: true }).click();
  await page.getByRole('button', { name: '冰', exact: true }).click();
  await page.getByRole('button', { name: '虚数', exact: true }).click();
  await expect(page).toHaveURL(/type=elite/);
  await expect(page).toHaveURL(/type=boss/);
  await expect(page).toHaveURL(/weakness=Ice/);
  await expect(page).toHaveURL(/weakness=Imaginary/);
  await expect(page).not.toHaveURL(/page=/);

  await page.goto('/enemies/?weakness=Physical&weakness=Ice&weakness=Imaginary&sort=id');
  const rankedCards = page.locator('.entity-overview-card');
  await expect(rankedCards.first()).toHaveAttribute('href', '/enemies/1002030/');
  await expect(rankedCards.nth(11)).toHaveAttribute('href', '/enemies/1002020/');

  await page.goto(
    '/enemies/?q=%E8%9A%95%E9%A3%9F%E8%80%85%E4%B9%8B%E5%BD%B1&weakness=Physical&weakness=Ice&weakness=Imaginary'
  );
  await expect(page.locator('.entity-overview-card')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '没有匹配结果' })).toBeVisible();
});

test('敌人缺图 Template 使用共享 fallback 且不发起远程请求', async ({ page }) => {
  const requestedUrls: string[] = [];
  page.on('request', (request) => requestedUrls.push(request.url()));
  await page.goto('/enemies/?sort=id&page=2');
  const card = page.locator('a[href="/enemies/2002020/"]');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-image-missing', 'true');
  await expect(card.locator('.entity-overview-card__artwork img')).toHaveCount(0);
  await expect(card.locator('.entity-overview-card__fallback')).toBeVisible();
  expect(requestedUrls.some((url) => url.includes('nanoka'))).toBe(false);
});
