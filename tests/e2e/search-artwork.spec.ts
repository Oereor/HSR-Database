import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { EndgameOccurrenceShard, GlobalSearchIndex } from '../../src/lib/domain/search-index';

for (const locale of ['zh-CN', 'en'] as const) {
  const index = JSON.parse(
    readFileSync(`static/generated/${locale}/search.json`, 'utf8')
  ) as GlobalSearchIndex;
  const target = index.endgameTargets.find(({ id }) => id === '3024020')!;
  const prefix = locale === 'en' ? '/en' : '';
  const selector = '[data-endgame-enemy-card][data-template-id="3024020"]';

  test(`${locale} Search delivers the same loaded Sam portrait as Endgame detail`, async ({
    page,
    request
  }) => {
    const response = await request.get(`/generated/${locale}/endgame-occurrences/${target.id}`);
    expect(response.ok()).toBe(true);
    const shard = (await response.json()) as EndgameOccurrenceShard;
    const item = Object.values(shard.occurrences)[0];
    const imageUrl = item.occurrence.portraitUrl!;
    expect(imageUrl).toMatch(/^\/generated-enemy-assets\//);
    expect((await request.get(imageUrl)).ok()).toBe(true);
    await page.goto(`${prefix}/search?q=${encodeURIComponent(target.name)}`);
    const card = page.locator(selector).first();
    await card.scrollIntoViewIfNeeded();
    const image = card.locator('[data-enemy-portrait]');
    await expect(image).toHaveAttribute('src', imageUrl);
    await expect
      .poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
      .toBe(true);
    const occurrence = target.occurrences[0].locator;
    await page.goto(`${prefix}/endgame/${occurrence.mode}/${occurrence.groupId}`);
    const detailImage = page.locator(selector).first().locator('[data-enemy-portrait]');
    await detailImage.scrollIntoViewIfNeeded();
    await expect(detailImage).toHaveAttribute('src', imageUrl);
    await expect
      .poll(() =>
        detailImage.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)
      )
      .toBe(true);
    await page.goto(`${prefix}/enemies/${target.id}`);
    const ordinaryImage = page.locator(`img[src="${imageUrl}"]`).first();
    await ordinaryImage.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        ordinaryImage.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)
      )
      .toBe(true);
    await page.goto(`${prefix}/enemies?sort=id`);
    const overviewImage = page
      .locator(`a[href^="${prefix}/enemies/"] img[src^="/generated-enemy-assets/"]`)
      .first();
    await overviewImage.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        overviewImage.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)
      )
      .toBe(true);
  });

  test(`${locale} Search preserves fallback on portrait request failure`, async ({ page }) => {
    let attempted = false;
    await page.route('**/generated-enemy-assets/icons/Monster_3024020.webp', async (route) => {
      attempted = true;
      await route.fulfill({ status: 404, body: '' });
    });
    await page.goto(`${prefix}/search?q=${encodeURIComponent(target.name)}`);
    const card = page.locator(selector).first();
    await card.scrollIntoViewIfNeeded();
    await expect.poll(() => attempted).toBe(true);
    await expect(card.locator('[data-enemy-portrait]')).toHaveCount(0);
    await expect(card).toContainText(target.name);
    await expect(card).toContainText(locale === 'en' ? 'E' : '敌');
  });
}

test('unsupported occurrence locale is not served from another locale', async ({ request }) => {
  expect((await request.get('/generated/fr/endgame-occurrences/3024020')).status()).toBe(404);
});
