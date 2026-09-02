import { expect, test } from '@playwright/test';

test('共享 SectionNav 提供真实锚点、scroll spy、sticky offset 与窄屏滚动', async ({ page }) => {
  await page.goto('/characters/1001');
  const characterNav = page.getByRole('navigation', { name: '详情章节' });
  const characterLinks = characterNav.getByRole('link');
  await expect(characterLinks).toHaveCount(5);
  expect(
    await characterLinks.evaluateAll((links) => links.map((link) => link.getAttribute('href')))
  ).toEqual(['#stats', '#skills', '#traces', '#eidolons', '#equipment-recommendation']);
  for (const id of ['stats', 'skills', 'traces', 'eidolons', 'equipment-recommendation'])
    await expect(page.locator(`#${id}`)).toHaveCount(1);

  await expect(characterNav.getByRole('link', { name: '属性' })).toHaveAttribute(
    'aria-current',
    'location'
  );
  await characterNav.getByRole('link', { name: '星魂' }).click();
  await expect(page).toHaveURL(/#eidolons$/);
  await expect(characterNav.getByRole('link', { name: '星魂' })).toHaveAttribute(
    'aria-current',
    'location'
  );
  await page.waitForTimeout(800);

  await page.locator('#traces').evaluate((target) => {
    document.documentElement.style.scrollBehavior = 'auto';
    target.scrollIntoView({ block: 'start' });
  });
  await expect(characterNav.getByRole('link', { name: '行迹' })).toHaveAttribute(
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

  await page.goto('/enemies/1003010');
  const enemyNav = page.getByRole('navigation', { name: '详情章节' });
  expect(
    await enemyNav
      .getByRole('link')
      .evaluateAll((links) =>
        links.map((link) => [link.textContent?.trim(), link.getAttribute('href')])
      )
  ).toEqual([
    ['基础数据', '#stats'],
    ['派生个体', '#monsters'],
    ['技能', '#skills']
  ]);
  for (const id of ['stats', 'monsters', 'skills'])
    await expect(page.locator(`#${id}`)).toHaveCount(1);

  await page.goto('/light-cones/20000');
  await expect(page.getByRole('navigation', { name: '详情章节' })).toHaveCount(0);
});

test('四类详情页消费同一标题视觉层级并保持语义 heading hierarchy', async ({ page }) => {
  await page.goto('/characters/1001');
  await expect(page.getByRole('heading', { name: '技能', level: 2 })).toBeVisible();
  await expect(page.locator('#skills')).not.toContainText('5 类');
  await expect(page.locator('#traces')).not.toContainText(/\d+ 条记录/);
  await expect(page.getByRole('heading', { name: '装备推荐', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '光锥建议', level: 3 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '遗器建议', level: 3 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '隧洞遗器', level: 4 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '位面饰品', level: 4 })).toBeVisible();

  await page.goto('/light-cones/20000');
  await expect(page.getByRole('heading', { name: '背景故事', level: 2 })).toBeVisible();

  await page.goto('/enemies/1003010');
  await expect(page.getByRole('heading', { name: '派生个体', level: 2 })).toBeVisible();
  await expect(page.locator('#monsters')).not.toContainText(/\d+ 个变种/);
  await expect(page.getByRole('heading', { name: '召唤单位', level: 3 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '技能组', level: 3 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '技能', level: 2 })).toBeVisible();

  for (const url of ['/characters/1001', '/light-cones/20000', '/relics/101', '/enemies/1003010']) {
    await page.goto(url);
    await expect(page.locator('.source-note')).toHaveCount(0);
  }

  await page.goto('/endgame/moc/1034?encounter=5312');
  await expect(page.getByRole('heading', { name: '扫除风暴其十二', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '节点一', level: 3 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '波次一', level: 4 }).first()).toBeVisible();
});
