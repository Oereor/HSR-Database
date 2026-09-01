import { expect, test } from '@playwright/test';

test('角色装备推荐解析真实实体、同权属性与本地资源', async ({ page }) => {
  await page.goto('/characters/1001');
  const section = page.locator('#equipment-recommendation');
  await expect(section.getByRole('heading', { level: 2, name: '装备推荐' })).toBeVisible();
  await expect(section).toContainText('来自游戏配置中的系统推荐数据，不代表实时玩家使用率。');
  expect(
    await page
      .locator('#eidolons, #equipment-recommendation')
      .evaluateAll((sections) => sections.map((section) => section.id))
  ).toEqual(['eidolons', 'equipment-recommendation']);
  expect(
    await page
      .getByRole('navigation', { name: '详情章节' })
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
  ).toEqual(['#stats', '#skills', '#traces', '#eidolons', '#equipment-recommendation']);

  const lightCones = section.locator('a[href^="/light-cones/"]');
  const relicSets = section.locator('a[href^="/relics/"]');
  await expect(lightCones).toHaveCount(3);
  await expect(relicSets).toHaveCount(6);
  await expect(lightCones.first()).toHaveAttribute('href', '/light-cones/21002');
  await expect(lightCones.first().locator('img').first()).toHaveAttribute(
    'src',
    '/generated-assets/light-cones/preview/21002.png'
  );
  await expect(lightCones.first()).toContainText('存护');
  await expect(lightCones.first().locator('.compact-entity-card__tertiary')).toHaveCount(1);
  await expect(relicSets.first()).toHaveAttribute('href', '/relics/103');
  await expect(relicSets.first().locator('img').first()).toHaveAttribute(
    'src',
    '/generated-assets/relics/icons/103.png'
  );
  await expect(relicSets.first()).toContainText('隧洞遗器');
  await expect(relicSets.locator('.compact-entity-card__tertiary')).toHaveCount(0);
  await expect(section).not.toContainText(/\d件套/);

  const surface = section.locator('.recommendation-stats-surface');
  const slots = surface.locator('[data-relic-slot]');
  await expect(slots).toHaveCount(4);
  expect(
    await slots.evaluateAll((items) => items.map((item) => item.getAttribute('data-relic-slot')))
  ).toEqual(['BODY', 'FOOT', 'NECK', 'OBJECT']);
  await expect(slots.nth(0)).toContainText(/防御力.*效果命中/);
  await expect(slots.nth(1)).toContainText(/速度.*防御力/);
  await expect(surface.locator('.recommendation-substats')).toContainText('效果抵抗');
  await expect(section).not.toContainText(/最佳|次选|F2P|专属|ScoreRank/);

  const brokenCard = relicSets.first();
  await brokenCard
    .locator('img')
    .first()
    .evaluate((image) => image.dispatchEvent(new Event('error')));
  await expect(brokenCard).toHaveAttribute('data-image-missing', 'true');
});

test('推荐数量边界和具体 AvatarID ownership 保持独立', async ({ page }) => {
  await page.goto('/characters/1301');
  await expect(page.locator('#equipment-recommendation a[href^="/light-cones/"]')).toHaveCount(2);
  await expect(page.locator('[data-relic-slot="NECK"] .relic-property-token')).toHaveCount(2);
  await expect(page.locator('[data-relic-slot="OBJECT"] .relic-property-token')).toHaveCount(2);

  await page.goto('/characters/1501');
  const cavernGroup = page
    .locator('.equipment-recommendation__subgroup')
    .filter({ has: page.getByRole('heading', { name: '隧洞遗器' }) });
  await expect(cavernGroup.locator('a[href^="/relics/"]')).toHaveCount(2);

  for (const id of ['1224', '8001', '8002', '1508']) {
    await page.goto(`/characters/${id}`);
    await expect(page.locator('#equipment-recommendation')).toBeVisible();
  }
});
