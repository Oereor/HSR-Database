import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { selectTrailblazer } from '../helpers/trailblazer';
import { withTrailblazerGender } from '../../src/lib/domain/trailblazer';
import type { CharacterTeamRecommendations } from '../../src/lib/domain/team-recommendation';

test('角色装备推荐解析真实实体、同权属性与本地资源', async ({ page }) => {
  await page.goto('/characters/1001/');
  const section = page.locator('#build-guide');
  await expect(section.locator('h2').first()).toBeVisible();
  expect(
    await page
      .locator('#eidolons, #build-guide')
      .evaluateAll((sections) => sections.map((section) => section.id))
  ).toEqual(['eidolons', 'build-guide']);
  expect(
    await page
      .locator('.section-nav')
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
  ).toEqual(['#stats', '#skills', '#traces', '#eidolons', '#build-guide', '#training']);

  const lightCones = section.locator('a[href^="/light-cones/"]');
  const relicSets = section.locator('a[href^="/relics/"]');
  await expect(lightCones).toHaveCount(3);
  await expect(relicSets).toHaveCount(6);
  await expect(lightCones.first()).toHaveAttribute('href', '/light-cones/21002/');
  await expect(lightCones.first().locator('img').first()).toHaveAttribute(
    'src',
    '/generated-assets/light-cones/preview/21002.png'
  );
  await expect(lightCones.first()).toContainText('存护');
  await expect(lightCones.first().locator('.compact-entity-card__tertiary')).toHaveCount(1);
  await expect(relicSets.first()).toHaveAttribute('href', '/relics/103/');
  await expect(relicSets.first().locator('img').first()).toHaveAttribute(
    'src',
    '/generated-assets/relics/icons/103.png'
  );
  await expect(relicSets.first().locator('.compact-entity-card__secondary')).not.toHaveText('');
  await expect(relicSets.locator('.compact-entity-card__tertiary')).toHaveCount(0);

  const surface = section.locator('.recommendation-stats-surface');
  const slots = surface.locator('[data-relic-slot]');
  await expect(slots).toHaveCount(4);
  expect(
    await slots.evaluateAll((items) => items.map((item) => item.getAttribute('data-relic-slot')))
  ).toEqual(['BODY', 'FOOT', 'NECK', 'OBJECT']);
  expect(
    await slots
      .nth(0)
      .locator('.relic-property-token img')
      .evaluateAll((images) => images.map((image) => image.getAttribute('src')))
  ).toEqual([
    '/generated-assets/relic-properties/IconDefence.png',
    '/generated-assets/relic-properties/IconStatusProbability.png'
  ]);
  expect(
    await slots
      .nth(1)
      .locator('.relic-property-token img')
      .evaluateAll((images) => images.map((image) => image.getAttribute('src')))
  ).toEqual([
    '/generated-assets/relic-properties/IconSpeed.png',
    '/generated-assets/relic-properties/IconDefence.png'
  ]);
  await expect(surface.locator('.recommendation-substats .relic-property-token')).not.toHaveCount(
    0
  );

  const brokenCard = relicSets.first();
  await brokenCard
    .locator('img')
    .first()
    .evaluate((image) => image.dispatchEvent(new Event('error')));
  await expect(brokenCard).toHaveAttribute('data-image-missing', 'true');
});

test('推荐数量边界和具体 AvatarID ownership 保持独立', async ({ page }) => {
  await page.goto('/characters/1301/');
  await expect(page.locator('#build-guide a[href^="/light-cones/"]')).toHaveCount(2);
  await expect(page.locator('[data-relic-slot="NECK"] .relic-property-token')).toHaveCount(2);
  await expect(page.locator('[data-relic-slot="OBJECT"] .relic-property-token')).toHaveCount(2);

  await page.goto('/characters/1501/');
  const cavernGroup = page
    .locator('.equipment-recommendation__group')
    .filter({ has: page.locator('a[href^="/relics/"]') })
    .first();
  await expect(cavernGroup.locator('a[href^="/relics/"]')).toHaveCount(2);

  for (const id of ['1224', '8001', '8002', '1508']) {
    await page.goto(`/characters/${id}/`);
    await expect(page.locator('#build-guide')).toBeVisible();
  }
});

for (const [prefix, male] of [
  ['', '穹'],
  ['/en', 'Caelus']
] as const) {
  test(`Build Guide shows official ordered teams and grouped alternate links (${prefix || 'zh-CN'})`, async ({
    page
  }) => {
    const data = JSON.parse(
      readFileSync('src/lib/generated/runtime/character-team-recommendations.json', 'utf8')
    ) as CharacterTeamRecommendations;
    const sourceId = '8007';
    const femaleId = withTrailblazerGender(sourceId, 'female');
    const teams = data.teamsByAvatar[sourceId];
    await page.goto(`${prefix}/characters/${femaleId}/#build-guide`);
    const cards = page.locator('#build-guide [data-team-id]');
    expect(
      await cards.evaluateAll((elements) =>
        elements.map((element) => Number(element.getAttribute('data-team-id')))
      )
    ).toEqual(teams.map(({ teamId }) => teamId));
    const first = cards.first();
    await expect(first).toHaveAttribute('data-team-source-avatar', sourceId);
    const starters = teams[0].slots.map(({ avatarId }) =>
      withTrailblazerGender(avatarId, 'female')
    );
    const slots = first.locator('ol [data-team-avatar]');
    await expect(slots).toHaveCount(4);
    expect(
      await slots.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-team-avatar'))
      )
    ).toEqual(starters);
    await slots.first().focus();
    await expect(page.getByRole('tooltip').first()).toBeVisible();
    await expect(first.locator('[data-team-target] a')).toHaveAttribute(
      'href',
      `${prefix}/characters/${femaleId}/`
    );

    const slotWithGroups = teams[0].slots.findIndex(
      ({ backupGroupIds }) => backupGroupIds.length > 1
    );
    await first
      .locator(`[data-team-slot="${slotWithGroups + 1}"] [data-team-backups-trigger]`)
      .click();
    const popover = page.locator('[data-slot="popover-content"]');
    await expect(popover).toBeVisible();
    const groups = popover.locator('[data-team-backup-group]');
    await expect(groups).toHaveCount(teams[0].slots[slotWithGroups].backupGroupIds.length);
    expect(
      await groups.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-team-backup-group'))
      )
    ).toEqual(teams[0].slots[slotWithGroups].backupGroupIds);
    for (const id of starters)
      await expect(popover.locator(`[data-team-avatar="${id}"]`)).toHaveCount(0);
    const backup = groups.first().locator('a').first();
    const href = (await backup.getAttribute('href'))!;
    await backup.click();
    await expect(page).toHaveURL(href);

    const relatedTeam = data.teamsByAvatar['1413'].find(({ slots }) =>
      slots.some(({ avatarId }) => avatarId === sourceId)
    )!;
    await page.goto(`${prefix}/characters/1413/#build-guide`);
    const relatedCard = page.locator(`[data-team-id="${relatedTeam.teamId}"]`);
    await expect(relatedCard.locator(`[data-team-avatar="${femaleId}"]`)).toBeVisible();
    await selectTrailblazer(page, male);
    const maleAvatar = relatedCard.locator(`[data-team-avatar="${sourceId}"]`);
    await expect(maleAvatar).toHaveAttribute('href', `${prefix}/characters/${sourceId}/`);
    await expect(maleAvatar.locator('img')).toHaveAttribute(
      'src',
      new RegExp(`/${sourceId}\\.png$`)
    );
    await expect(maleAvatar).toHaveAccessibleName(new RegExp(male));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1);
  });
}
