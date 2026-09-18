import { expect, test } from '@playwright/test';

test('光锥 Detail Hero 使用完整 contain portrait、单一 Hero 命途标签与稳定降级', async ({
  page
}) => {
  for (const id of ['20000', '21015', '21034', '23029', '23039']) {
    await page.goto(`/light-cones/${id}/`);
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

  await page.goto('/light-cones/20000/');
  const stage = page.locator('[data-light-cone-portrait="20000"]');
  const before = await stage.boundingBox();
  await stage.locator('img').evaluate((image) => image.dispatchEvent(new Event('error')));
  await expect(stage).toHaveAttribute('data-artwork-available', 'false');
  await expect(stage.locator('img')).toHaveCount(0);
  const after = await stage.boundingBox();
  expect(after!.height).toBeCloseTo(before!.height, 0);
});

test('光锥等级与叠影滑块独立、控件先于效果且动态参数更新', async ({ page }) => {
  await page.goto('/light-cones/20000/');
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
