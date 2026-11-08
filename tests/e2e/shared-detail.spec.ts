import { expect, test } from '@playwright/test';

test('共享 SectionNav 提供真实锚点、scroll spy、sticky offset 与窄屏滚动', async ({ page }) => {
  await page.goto('/characters/1001/');
  const characterNav = page.locator('.section-nav');
  const characterLinks = characterNav.getByRole('link');
  await expect(characterLinks).toHaveCount(6);
  expect(
    await characterLinks.evaluateAll((links) => links.map((link) => link.getAttribute('href')))
  ).toEqual([
    '#stats',
    '#skills',
    '#traces',
    '#eidolons',
    '#equipment-recommendation',
    '#training'
  ]);
  for (const id of [
    'stats',
    'skills',
    'traces',
    'eidolons',
    'equipment-recommendation',
    'training'
  ])
    await expect(page.locator(`#${id}`)).toHaveCount(1);

  await expect(characterNav.locator('a[href="#stats"]')).toHaveAttribute(
    'aria-current',
    'location'
  );
  await characterNav.locator('a[href="#eidolons"]').click();
  await expect(page).toHaveURL(/#eidolons$/);
  await expect(characterNav.locator('a[href="#eidolons"]')).toHaveAttribute(
    'aria-current',
    'location'
  );
  await page.waitForTimeout(800);

  await page.locator('#traces').evaluate((target) => {
    document.documentElement.style.scrollBehavior = 'auto';
    target.scrollIntoView({ block: 'start' });
  });
  await expect(characterNav.locator('a[href="#traces"]')).toHaveAttribute(
    'aria-current',
    'location'
  );
  const stickyGeometry = await page.locator('#traces').evaluate((target) => {
    const nav = document.querySelector<HTMLElement>('.section-nav')!;
    const navBox = nav.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    return {
      navTop: navBox.top,
      expectedTop: Number.parseFloat(getComputedStyle(nav).top),
      navBottom: navBox.bottom,
      targetTop: targetBox.top,
      overflowX: getComputedStyle(nav).overflowX,
      linkRows: new Set(
        [...nav.querySelectorAll('a')].map((link) => Math.round(link.getBoundingClientRect().top))
      ).size
    };
  });
  expect(Math.abs(stickyGeometry.navTop - stickyGeometry.expectedTop)).toBeLessThanOrEqual(1);
  expect(stickyGeometry.targetTop).toBeGreaterThanOrEqual(stickyGeometry.navBottom - 4);
  if ((page.viewportSize()?.width ?? 1280) <= 520) {
    expect(stickyGeometry.overflowX).toBe('auto');
    expect(stickyGeometry.linkRows).toBe(1);
  }

  await page.goto('/enemies/1003010/');
  const enemyNav = page.locator('.section-nav');
  expect(
    await enemyNav
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
  ).toEqual(['#stats', '#monsters', '#skills']);
  for (const id of ['stats', 'monsters', 'skills'])
    await expect(page.locator(`#${id}`)).toHaveCount(1);

  await page.goto('/light-cones/20000/');
  await expect(page.locator('.section-nav')).toHaveCount(1);
});

test('四类详情页消费同一标题视觉层级并保持语义 heading hierarchy', async ({ page }) => {
  await page.goto('/characters/1001/');
  await expect(page.locator('#skills h2')).toBeVisible();
  await expect(page.locator('#equipment-recommendation h2').first()).toBeVisible();
  await expect(
    page.locator('#equipment-recommendation').getByRole('heading', { level: 3 }).first()
  ).toBeVisible();

  await page.goto('/light-cones/20000/');
  await expect(page.locator('section.prose h2')).toBeVisible();

  await page.goto('/enemies/1003010/');
  await expect(page.locator('#monsters h2')).toBeVisible();
  await expect(page.locator('#summons h3')).toBeVisible();
  await expect(page.locator('[data-enemy-skill-selector]')).toBeVisible();
  await expect(page.locator('[data-enemy-skill-option][aria-checked="true"]')).toHaveCount(1);
  await expect(page.locator('.enemy-skill-browser__detail h3').first()).toBeVisible();
  await expect(page.locator('#skills h2')).toBeVisible();

  for (const url of [
    '/characters/1001/',
    '/light-cones/20000/',
    '/relics/101/',
    '/enemies/1003010/'
  ]) {
    await page.goto(url);
    await expect(page.locator('.source-note')).toHaveCount(0);
  }

  await page.goto('/endgame/moc/1034/?encounter=5312');
  await expect(page.locator('#moc-encounter-title')).toBeVisible();
  await expect(page.locator('#moc-encounter-title')).not.toBeEmpty();
  await expect(page.locator('[data-battle-slot="1"] h3')).toContainText('1');
  await expect(page.locator('[data-battle-slot="1"] [data-wave] h4').first()).toContainText('1');
});

test('Path、Character Element、Enemy Weakness 使用独立且稳定的 presentation semantics', async ({
  page
}) => {
  await page.goto('/characters/?q=三月七');
  const characterMetadata = page
    .locator('a[href="/characters/1001/"] .entity-overview-card__metadata')
    .first();
  await expect(characterMetadata.locator('[data-icon-kind="path"]')).toHaveAttribute(
    'data-icon-presentation',
    'overview-icon'
  );
  await expect(characterMetadata.locator('[data-icon-kind="element"]')).toHaveAttribute(
    'data-icon-presentation',
    'overview-icon'
  );

  await page.goto('/light-cones/?q=锋镝');
  await expect(
    page.locator('a[href="/light-cones/20000/"] [data-icon-kind="path"]')
  ).toHaveAttribute('data-icon-presentation', 'overview-icon');

  await page.goto('/enemies/?sort=id');
  const weakness = page
    .locator('a[href="/enemies/1002015/"] .enemy-weakness-group [data-icon-kind="element"]')
    .first();
  await expect(weakness).toHaveAttribute('data-icon-presentation', 'plain');
  await expect(weakness).not.toHaveAttribute(
    'data-icon-presentation',
    'character-element-identity'
  );
});

test('详情 Hero 立绘失败时只移除图片并保留稳定舞台', async ({ page }) => {
  await page.goto('/characters/1001/');
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

test('角色与光锥 Detail Hero 的 rarity 与 identity presentation 保持语义隔离', async ({ page }) => {
  for (const [url, heroSelector, rarity, color, tagCount] of [
    ['/characters/1402/', '.detail-profile-hero--character', 5, 'rgb(255, 215, 0)', 2],
    ['/characters/1001/', '.detail-profile-hero--character', 4, 'rgb(199, 125, 255)', 2],
    ['/light-cones/20000/', '.detail-profile-hero--light-cone', 3, 'rgb(96, 144, 255)', 1]
  ] as const) {
    await page.goto(url);
    const hero = page.locator(heroSelector);
    const rarityStars = hero.locator('.hero-identity-metadata > .rarity-stars');
    await expect(rarityStars).toHaveAttribute('aria-label', `${rarity}星`);
    await expect(rarityStars).toHaveAttribute('data-rarity-size', 'hero');
    await expect(rarityStars).toHaveCSS('color', color);
    const identityTags = hero.locator('.hero-identity-metadata > .semantic-icon-label');
    await expect(identityTags).toHaveCount(tagCount);
    for (let index = 0; index < tagCount; index += 1) {
      await expect(identityTags.nth(index)).toHaveCSS('font-weight', '500');
    }
  }
});

test('属性行迹、普通换行与光锥 identity 内容边界正确渲染', async ({ page }) => {
  await page.goto('/characters/1407/');
  await expect(page.locator('[data-trace-id="1407202"]')).toContainText('3.2%');
  await expect(page.locator('[data-trace-id="1407204"]')).toContainText('5.3%');
  const introduction = page.locator('.hero-description');
  await expect(introduction.locator('.game-text')).toHaveCSS('white-space', 'pre-line');
  expect((await introduction.innerText()).split('\n')).toHaveLength(3);

  await page.goto('/light-cones/20002/');
  const identity = page.locator('.detail-profile-hero__identity');
  await expect(identity).not.toContainText('光锥技能仅对「毁灭」命途角色生效');
  await expect(identity).not.toContainText('<color');
});

test('角色与敌人属性文字使用统一颜色', async ({ page }) => {
  await page.goto('/characters/1005/');
  await expect(page.locator('.hero-identity-metadata').getByText('雷', { exact: true })).toHaveCSS(
    'color',
    'rgb(212, 106, 235)'
  );
  await page.goto('/enemies/1002011/');
  const weaknesses = page.locator('.enemy-weakness-list');
  await expect(weaknesses.getByText('火', { exact: true })).toHaveCSS('color', 'rgb(242, 87, 64)');
});
