import { expect, test } from '@playwright/test';

test('首页和精简后的核心分类可浏览', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /查清每一条数据/ })).toBeVisible();
  await expect(page.getByRole('link', { name: '物品' })).toHaveCount(0);
  await page.goto('/characters');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: '角色' })).toBeVisible();
  await expect(page.locator('.entity-overview-card').first()).toBeVisible();
  await page.goto('/items');
  await expect(page.getByRole('heading', { name: '这条星轨暂不存在' })).toBeVisible();
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
  await expect(firstCard.locator('.entity-kind')).toHaveCount(0);
  await expect(firstCard.locator('.entity-overview-card__subtitle')).toHaveCount(0);
  await expect(firstCard.locator('.entity-overview-card__fade')).toHaveCount(0);
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

test('角色目录与详情接入属性、命途图标和优化立绘', async ({ page, isMobile }) => {
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
  if (isMobile) await expect(portrait).toBeHidden();
  else await expect(portrait).toBeVisible();
  await expect(page.locator('.tag-row [data-icon-kind="path"]')).toContainText('记忆');
  await expect(page.locator('.tag-row [data-icon-kind="element"]')).toContainText('雷');
  expect(failedImages).toEqual([]);
});

test('敌人目录使用本地立绘、三类 Rank 和 default Monster 弱点', async ({ page }) => {
  await page.goto('/enemies?sort=id');
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
  await expect(page.locator('select[name="type"]')).toHaveValue('normal');
  await expect(page.locator('.entity-overview-card').first()).toContainText('普通敌人');
  await expect(page.locator('select[name="type"] option')).toHaveText([
    '全部',
    '普通敌人',
    '精英敌人',
    '首领敌人'
  ]);
});

test('Enemy Overview 将 2/3/4 个弱点收拢为单行 Group 并在极窄容器隐藏文字', async ({ page }) => {
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
    await expect(items).toHaveCount(count);
    await expect(group).toHaveCSS('border-top-width', '1px');
    await expect(items.first()).toHaveCSS('border-top-width', '0px');
    const boxes = await Promise.all(
      [...Array(count).keys()].map((index) => items.nth(index).boundingBox())
    );
    expect(boxes.every((box) => box !== null && Math.abs(box.y - boxes[0]!.y) < 1)).toBe(true);
    for (const label of await items.locator(':scope > span').all()) {
      await expect(label).toHaveCSS('position', 'static');
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
  for (const label of await narrowGroup.locator('.semantic-icon-label > span').all()) {
    await expect(label).toHaveCSS('position', 'absolute');
    await expect(label).toHaveCSS('clip-path', 'inset(50%)');
  }
  expect(
    await narrowGroup.evaluate((group) => group.scrollWidth - group.clientWidth)
  ).toBeLessThanOrEqual(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
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

test('Character 与 Enemy Overview 使用纵向自适应 Grid 且不溢出', async ({ page }) => {
  for (const path of ['/characters', '/enemies?sort=id']) {
    for (const viewport of [
      { width: 1600, height: 1000, columns: [4, 5] },
      { width: 1280, height: 800, columns: [3] },
      { width: 768, height: 900, columns: [2] },
      { width: 390, height: 844, columns: [1] },
      { width: 320, height: 720, columns: [1] }
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(path);
      const cards = page.locator('.entity-overview-card');
      const boxes = (
        await Promise.all([...Array(6).keys()].map((index) => cards.nth(index).boundingBox()))
      ).filter((box): box is NonNullable<typeof box> => box !== null);
      expect(boxes.length).toBe(6);
      const firstRow = boxes.filter((box) => Math.abs(box.y - boxes[0].y) < 1);
      expect(viewport.columns).toContain(firstRow.length);
      expect(Math.max(...firstRow.map((box) => box.height))).toBeLessThanOrEqual(466);
      expect(Math.min(...firstRow.map((box) => box.height))).toBeGreaterThanOrEqual(407);
      expect(Math.max(...firstRow.map((box) => box.height))).toBeCloseTo(
        Math.min(...firstRow.map((box) => box.height)),
        0
      );

      const firstCard = cards.first();
      const artwork = await firstCard.locator('.entity-overview-card__artwork').boundingBox();
      const content = await firstCard.locator('.entity-overview-card__content').boundingBox();
      const overlay = await firstCard.locator('.entity-overview-card__overlay').boundingBox();
      expect(artwork).not.toBeNull();
      expect(content).not.toBeNull();
      expect(overlay).not.toBeNull();
      expect(artwork!.y + artwork!.height).toBeLessThanOrEqual(content!.y + 1);
      expect(overlay!.y).toBeGreaterThanOrEqual(artwork!.y);
      expect(overlay!.x + overlay!.width).toBeLessThanOrEqual(artwork!.x + artwork!.width);
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

test('详情立绘失败时移除视觉层且不保留破图布局', async ({ page }) => {
  await page.goto('/characters/1001');
  const hero = page.locator('.detail-hero');
  const image = hero.locator('[data-character-portrait] img');
  await expect(hero).toHaveClass(/detail-hero--with-portrait/);
  await image.evaluate((element) => element.dispatchEvent(new Event('error')));
  await expect(hero.locator('[data-character-portrait]')).toHaveCount(0);
  await expect(hero).not.toHaveClass(/detail-hero--with-portrait/);
});

test('角色视觉增强在固定视口不遮挡正文或造成页面横向溢出', async ({ page }) => {
  for (const viewport of [
    { width: 1600, height: 1000 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/characters/8007');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
    const content = page.locator('.detail-hero__content');
    await expect(content.getByRole('heading', { level: 1 })).toBeVisible();
    if (viewport.width <= 820) {
      await expect(page.locator('[data-character-portrait]')).toBeHidden();
    } else {
      const copy = await content.boundingBox();
      const portrait = await page.locator('[data-character-portrait]').boundingBox();
      expect(copy).not.toBeNull();
      expect(portrait).not.toBeNull();
      expect(copy!.x + copy!.width).toBeLessThanOrEqual(portrait!.x + portrait!.width * 0.55);
    }
  }
});

test('技能在桌面保持双列等高并在窄屏切换单列', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/characters/1213');
  const cards = page.locator('#skills .skill-card');
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(Math.abs(first!.y - second!.y)).toBeLessThan(1);
  expect(Math.abs(first!.height - second!.height)).toBeLessThan(1);
  expect(second!.x).toBeGreaterThan(first!.x + first!.width - 1);

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.reload();
  const narrowFirst = await cards.nth(0).boundingBox();
  const narrowSecond = await cards.nth(1).boundingBox();
  expect(narrowFirst).not.toBeNull();
  expect(narrowSecond).not.toBeNull();
  expect(Math.abs(narrowFirst!.x - narrowSecond!.x)).toBeLessThan(1);
  expect(narrowSecond!.y).toBeGreaterThan(narrowFirst!.y + narrowFirst!.height - 1);
});

test('筛选状态写入 URL、分页响应客户端导航并进入详情', async ({ page, isMobile }) => {
  await page.goto('/characters');
  const firstPageFirstId = await page.locator('.entity-overview-card').first().getAttribute('href');
  await page.getByRole('link', { name: '下一页' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator('.pagination').getByText('第 2 / 3 页')).toBeVisible();
  await expect(page.locator('.entity-overview-card').first()).not.toHaveAttribute(
    'href',
    firstPageFirstId!
  );
  await page.getByRole('link', { name: '上一页' }).click();
  await expect(page.locator('.pagination').getByText('第 1 / 3 页')).toBeVisible();

  await page.goto('/characters?rarity=4&page=2');
  if (isMobile) {
    await page.getByRole('button', { name: '筛选与排序' }).click();
    await expect(page.getByRole('dialog', { name: '筛选与排序' })).toBeVisible();
  }
  await expect(page.locator('select[name="rarity"]')).toHaveValue('4');
  await page.locator('select[name="rarity"]').selectOption('5');
  await expect(page).not.toHaveURL(/page=/);
  await page.goto('/characters/1001');
  await expect(page.getByRole('heading', { name: '三月七·存护' })).toBeVisible();
});

test('目录搜索只在提交时应用草稿并重置分页', async ({ page, isMobile }) => {
  await page.goto('/characters?page=2');
  await page.waitForLoadState('networkidle');
  if (isMobile) await page.getByRole('button', { name: '筛选与排序' }).click();
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

test('全局搜索只包含保留的简中领域', async ({ page }) => {
  await page.goto('/search?q=三月七');
  await expect(page.locator('a[href="/characters/1001"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: '物品' })).toHaveCount(0);
  await expect(page.getByPlaceholder(/角色、光锥、遗器或敌人/)).toBeVisible();
});

test('全局搜索的输入、提交与清空状态相互独立', async ({ page }) => {
  await page.goto('/search?q=三月七');
  const input = page.getByPlaceholder(/角色、光锥、遗器或敌人/);
  await expect(page.locator('a[href="/characters/1001"]')).toBeVisible();
  await input.fill('锋镝');
  await expect(page).toHaveURL(/q=%E4%B8%89%E6%9C%88%E4%B8%83/);
  await expect(page.locator('a[href="/characters/1001"]')).toBeVisible();
  await expect(page.locator('a[href="/light-cones/20000"]')).toHaveCount(0);
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page).toHaveURL(/q=%E9%94%8B%E9%95%9D/);
  await expect(page.locator('a[href="/light-cones/20000"]')).toBeVisible();

  await input.fill('三月七');
  await input.press('Escape');
  await expect(input).toHaveValue('');
  await expect(page.locator('a[href="/light-cones/20000"]')).toBeVisible();
  await input.press('Enter');
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole('heading', { name: '开始探索' })).toBeVisible();
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
  await expect(skillCard.locator('[data-skill-id="121309"]')).toContainText('Lv.1');

  await page.goto('/characters/1401');
  const hertaSkill = page.locator('[data-skill-category="skill"]');
  await expect(hertaSkill).toHaveCount(1);
  await expect(hertaSkill.locator('.skill-variant')).toHaveCount(2);
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

test('角色等级属性默认 Lv.80 并使用突破后边界', async ({ page }) => {
  await page.goto('/characters/1001');
  const panel = page.locator('.base-stats-panel');
  const slider = panel.getByRole('slider', { name: '角色等级' });
  await expect(panel.locator('output')).toHaveText('Lv.80');
  await expect(panel.locator('.base-stat-card')).toHaveCount(5);
  await expect(panel.locator('[data-base-stat="hp"]')).toContainText('生命值1,058');
  await expect(panel.locator('[data-base-stat="attack"]')).toContainText('攻击力');
  await expect(panel.locator('[data-base-stat="defence"]')).toContainText('防御力');
  await expect(panel.locator('[data-base-stat="speed"]')).toContainText('速度101');
  await expect(panel.locator('[data-base-stat="energy"]')).toContainText('能量上限120');
  await expect(panel).not.toContainText(/HP|ATK|DEF|SPD/);
  const [speedBox, energyBox] = await Promise.all([
    panel.locator('[data-base-stat="speed"]').boundingBox(),
    panel.locator('[data-base-stat="energy"]').boundingBox()
  ]);
  expect(speedBox).not.toBeNull();
  expect(energyBox).not.toBeNull();
  expect(Math.abs(speedBox!.y - energyBox!.y)).toBeLessThan(1);
  await slider.fill('20');
  await expect(panel.locator('.base-stat-grid .scaling-value').first()).toHaveText('338');
  await expect(panel.locator('.base-stat-grid .scaling-value').first()).toHaveCSS(
    'color',
    'rgb(242, 164, 95)'
  );
});

test('光锥等级与叠影滑块独立且叠影默认 1', async ({ page }) => {
  await page.goto('/light-cones/20000');
  const stats = page.locator('.base-stats-panel');
  const superimposition = page.locator('.superimposition-panel');
  await expect(stats.locator('output')).toHaveText('Lv.80');
  await expect(stats.locator('.base-stat-card')).toHaveCount(3);
  await expect(stats.locator('[data-base-stat="hp"]')).toContainText('生命值847');
  await expect(stats).not.toContainText(/HP|ATK|DEF|SPD/);
  await expect(superimposition.locator('output')).toHaveText('Lv.1');
  await expect(superimposition.locator('.scaling-value')).toHaveText('12%');
  await stats.getByRole('slider', { name: '光锥等级' }).fill('1');
  await expect(superimposition.locator('output')).toHaveText('Lv.1');
  await superimposition.getByRole('slider', { name: '叠影等级' }).fill('4');
  await expect(superimposition.locator('output')).toHaveText('Lv.5');
  await expect(stats.locator('output')).toHaveText('Lv.1');
});

test('特殊能量使用结构化标记且旧版银狼保持普通能量', async ({ page }) => {
  for (const id of ['1308', '1506']) {
    await page.goto(`/characters/${id}`);
    const energy = page.locator('[data-base-stat="energy"]');
    await expect(energy).toContainText('能量上限特殊能量');
  }
  await page.goto('/characters/1006');
  const standardEnergy = page.locator('[data-base-stat="energy"]');
  await expect(standardEnergy).toContainText('能量上限110');
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

test('内部空描述技能按结构关系隐藏且公开技能保持可用', async ({ page }) => {
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
});

test('属性行迹、普通换行与光锥颜色 markup 正确渲染', async ({ page }) => {
  await page.goto('/characters/1407');
  await expect(page.locator('[data-trace-id="1407202"]')).toContainText('量子属性伤害提高3.2%');
  await expect(page.locator('[data-trace-id="1407204"]')).toContainText('暴击伤害提高5.3%');
  const introduction = page.locator('.detail-hero__content > p').last();
  await expect(introduction.locator('.game-text')).toHaveCSS('white-space', 'pre-line');
  expect((await introduction.innerText()).split('\n')).toHaveLength(3);

  await page.goto('/light-cones/20002');
  const pathRestriction = page.locator('[data-game-color="#f29e38ff"]').filter({ hasText: '毁灭' });
  await expect(pathRestriction.first()).toHaveCSS('color', 'rgb(242, 158, 56)');
  await expect(page.locator('.detail-hero')).not.toContainText('<color');
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

test('技能与行迹标题中的游戏文本继承原有字号和字重', async ({ page }) => {
  await page.goto('/characters/1402');
  for (const name of ['共舞吧，命定的衣匠', '短视之惩', '伤害强化•雷']) {
    const heading = page.getByRole('heading', { name, exact: true }).first();
    await expect(heading).toBeVisible();
    const styles = await heading.evaluate((element) => {
      const gameText = element.querySelector<HTMLElement>('.game-text')!;
      const headingStyle = getComputedStyle(element);
      const textStyle = getComputedStyle(gameText);
      return {
        headingSize: headingStyle.fontSize,
        textSize: textStyle.fontSize,
        headingWeight: headingStyle.fontWeight,
        textWeight: textStyle.fontWeight
      };
    });
    expect(styles.textSize).toBe(styles.headingSize);
    expect(styles.textWeight).toBe(styles.headingWeight);
    expect(Number(styles.textWeight)).toBeGreaterThanOrEqual(600);
  }
});

test('四类详情页使用收敛后的标题层级与章节留白', async ({ page }) => {
  for (const url of ['/characters/1001', '/light-cones/20000', '/relics/101', '/enemies/1002011']) {
    await page.goto(url);
    const heroSize = await page
      .locator(url.startsWith('/enemies/') ? '.enemy-hero h1' : '.detail-hero h1')
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    const section = page.locator('.detail-section').first();
    const sectionSize = await section
      .locator('h2')
      .first()
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    const sectionPadding = await section.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).paddingTop)
    );
    expect(heroSize).toBeLessThanOrEqual(54);
    expect(sectionSize).toBeLessThanOrEqual(24);
    expect(sectionPadding).toBeGreaterThanOrEqual(40);
  }
});

test('角色与敌人属性文字使用统一颜色', async ({ page }) => {
  await page.goto('/characters/1005');
  await expect(page.locator('.tag-row').getByText('雷', { exact: true })).toHaveCSS(
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
  await page.getByRole('button', { name: '筛选与排序' }).click();
  await expect(page.getByRole('dialog', { name: '筛选与排序' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
