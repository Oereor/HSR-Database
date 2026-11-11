import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Character } from '../../src/lib/domain/types';
import type { PlayerProfile } from '../../src/lib/player/contract';

for (const locale of ['zh-CN', 'en'] as const) {
  const prefix = locale === 'en' ? '/en' : '';
  test(`Aha external preview, shared dialog and fixed E2 reference stay independent (${locale})`, async ({
    page
  }) => {
    const aha: Character = JSON.parse(
      readFileSync(`src/lib/generated/views/${locale}/details/characters/1511.json`, 'utf8')
    );
    const variant = aha.profiles.base.skillCards.find(
      (card) => card.category === 'elation-ascension'
    )!.variants[0];
    await page.goto(`${prefix}/characters/1511/`);
    await expect(page.locator('[data-app-ready]')).toHaveAttribute('data-app-ready', 'true', {
      timeout: 30_000
    });
    const card = page.locator('[data-skill-category="elation-ascension"]');
    const states = card.locator('[data-slot="toggle-group-item"]');
    const description = card.locator('.levelled-description');
    await expect(description).toHaveText(variant.levels[0].description);
    await expect(card.getByRole('slider')).toHaveCount(0);
    const basic = page.locator('[data-skill-category="basic"] [role="slider"]');
    const basicLevel = await basic.getAttribute('aria-valuenow');
    await expect(page.locator('#training')).toHaveAttribute('data-training-state', 'ready');
    const costs = page.locator('#training [data-training-expense="total"] [data-material-id]');
    const amounts = () =>
      costs.evaluateAll((nodes) =>
        nodes.map((node) => [
          node.getAttribute('data-material-id'),
          node.getAttribute('data-material-count')
        ])
      );
    expect(await costs.count()).toBeGreaterThan(0);
    const trainingBefore = await amounts();
    await states.nth(1).click();
    await expect(description).toHaveText(variant.levels[1].description);
    await expect(basic).toHaveAttribute('aria-valuenow', basicLevel!);
    expect(await amounts()).toEqual(trainingBefore);
    const summary = card.locator('button').last();
    await summary.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('[data-special-effect-kind="series-skill-link"]')).toHaveCount(8);
    await expect(dialog.locator('a[href$="/characters/8009/"]')).toHaveCount(0);
    await expect(dialog.locator(`a[href="${prefix}/characters/8010/"]`)).toHaveCount(1);
    await expect(dialog.locator(`a[href="${prefix}/characters/1511/"]`)).toHaveCount(1);
    await expect(dialog.locator('[data-skill-id="151129"] .levelled-description')).toHaveText(
      variant.levels[1].description
    );
    await expect(dialog.locator('.special-effect-dialog__level')).not.toContainText('Lv.');
    await page.keyboard.press('Escape');
    await expect(summary).toBeFocused();
    await states.nth(0).click();
    await expect(description).toHaveText(variant.levels[0].description);
    await states.nth(0).click();
    await expect(states.nth(0)).toHaveAttribute('aria-checked', 'true');
    const reference = page.locator('[data-eidolon-id="151102"] [data-series-skill-reference]');
    await reference.focus();
    await page.keyboard.press('Enter');
    await expect(dialog.locator('[data-skill-id="151129"] .levelled-description')).toHaveText(
      variant.levels[1].description
    );
    await page.keyboard.press('Escape');
    await expect(reference).toBeFocused();
    await expect(description).toHaveText(variant.levels[0].description);
    await reference.click();
    await dialog.locator(`a[href="${prefix}/characters/8010/"]`).click();
    await expect(page).toHaveURL(`${prefix}/characters/8010/`);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test(`ExRanks follow the ordinary six without player-state claims (${locale})`, async ({
    page
  }) => {
    for (const id of ['1204', '1213', '1308']) {
      await page.goto(`${prefix}/characters/${id}/`);
      await expect(page.locator('#eidolons [data-eidolon-kind="rank"]')).toHaveCount(6);
      const ex = page.locator('#eidolons [data-eidolon-kind="ex-rank"]');
      await expect(ex).toHaveCount(1);
      await expect(ex).not.toHaveAttribute('data-player-state');
      await expect(ex.locator('img[src*="rank--"]')).toHaveCount(0);
    }
  });
}

test('player mode preserves missing ExRank provenance and default Point23 semantics', async ({
  page
}) => {
  let currentId = '1204';
  await page.route('**/api/player/**', (route) => {
    const profile: PlayerProfile = {
      uid: '100000001',
      nickname: 'Synthetic Player',
      level: 70,
      worldLevel: 6,
      avatar: null,
      signature: '',
      characterCount: 1,
      lightConeCount: 0,
      achievementCount: 0,
      characters: [
        {
          buildId: 'synthetic-build',
          characterId: currentId,
          display: { area: 'showcase', position: 1, sourceOrder: 0 },
          progression: { rank: 6, level: 80, promotion: 6, enhanced: false },
          skillTree: [],
          lightCone: null,
          relics: [],
          stats: []
        }
      ]
    };
    return route.fulfill({ json: profile });
  });
  await page.goto('/characters/1204/?uid=100000001');
  const ex = page.locator('[data-eidolon-kind="ex-rank"]');
  await expect(ex).toHaveAttribute('data-player-state', 'inactive');
  await expect(ex).toHaveAttribute('data-player-state-source', 'missing');
  await expect(page.locator('[data-eidolon-kind="rank"]').first()).toHaveAttribute(
    'data-player-state',
    'active'
  );
  currentId = '1511';
  await page.goto('/characters/1511/?uid=100000001');
  const point = page.locator('#traces [data-anchor="Point23"]');
  await expect(point).toBeVisible();
  await expect(point).not.toHaveAttribute('data-trace-state');
  await expect(point).not.toHaveAttribute('aria-pressed');
  const fixedLevel = page.locator('[data-skill-category="talent"] output').last();
  await expect(fixedLevel).not.toHaveAttribute('data-player-skill-state', 'unresolved');
  await expect(fixedLevel).toContainText(/\b1\b/);
});
