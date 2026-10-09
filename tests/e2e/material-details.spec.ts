import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { MaterialCatalog, MaterialDetailCatalog } from '../../src/lib/domain/training/types';
import { gameTextToPlain } from '../../src/lib/domain/game-text';

const modal = (page: Page) => page.locator('.item-detail-modal');
const cell = (page: Page, group = 'total', id = '2') =>
  page.locator(`[data-training-expense="${group}"] [data-material-id="${id}"] button`);
const plain = (value: string) => gameTextToPlain(value).replace(/\s+/g, ' ').trim();
const fixture = <T>(locale: string, file: string): T =>
  JSON.parse(readFileSync(`static/generated/${locale}/${file}.json`, 'utf8'));

async function ready(page: Page, path = '/characters/1001/') {
  await page.goto(path);
  await expect(page.locator('#training')).toHaveAttribute('data-training-state', 'ready');
}

async function trainingSnapshot(page: Page) {
  return page.locator('#training').evaluate((node) => ({
    targets: [...node.querySelectorAll('input')].map((input) => [input.id, input.value]),
    materials: [...node.querySelectorAll('[data-material-id]')].map((item) => [
      item.getAttribute('data-material-id'),
      item.getAttribute('data-material-count')
    ]),
    traces: [...node.querySelectorAll('[data-training-trace-id]')].map((trace) =>
      trace.getAttribute('data-training-trace-id')
    )
  }));
}

for (const locale of ['zh-CN', 'en'] as const) {
  const prefix = locale === 'en' ? '/en' : '';
  for (const path of ['/characters/1001/', '/light-cones/20000/']) {
    test(`material details are lazy, cached, accessible and preserve targets (${locale} ${path})`, async ({
      page
    }, testInfo) => {
      const requests: string[] = [];
      page.on('request', (request) => {
        if (request.url().endsWith('/material-details.json')) requests.push(request.url());
      });
      await ready(page, `${prefix}${path}`);
      expect(requests).toHaveLength(0);
      const before = await trainingSnapshot(page);
      const credits = cell(page);
      await credits.scrollIntoViewIfNeeded();
      await credits.focus();
      const scrollY = await page.evaluate(() => window.scrollY);
      await page.keyboard.press('Enter');
      await expect(modal(page)).toBeVisible();
      await expect(modal(page)).toHaveAttribute('data-item-detail-state', 'ready');
      await expect(page.locator('.item-detail-modal__close')).toBeFocused();
      await expect(page.locator('.item-detail-modal')).toHaveCount(1);
      const catalog = fixture<MaterialCatalog>(locale, 'materials');
      const details = fixture<MaterialDetailCatalog>(locale, 'material-details');
      await expect(modal(page).locator('h2')).toHaveText(
        plain(catalog.materials.find((item) => item.id === '2')!.name)
      );
      await expect(modal(page).locator('.item-detail-modal__description')).toHaveText(
        plain(details.materials.find((item) => item.id === '2')!.description!)
      );
      await expect(modal(page).locator('.item-detail-modal__icon img')).toHaveAttribute(
        'src',
        /\/materials\/icons\/2\.png$/
      );
      expect(requests).toHaveLength(1);
      expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
      await page.keyboard.press('Tab');
      expect(await modal(page).evaluate((node) => node.contains(document.activeElement))).toBe(
        true
      );
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator('.item-detail-modal__close')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(modal(page)).not.toBeVisible();
      await expect(credits).toBeFocused();
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');

      await cell(page, 'upgrade').click();
      await expect(modal(page)).toHaveAttribute('data-item-detail-id', '2');
      await expect(modal(page)).toHaveAttribute('data-item-detail-state', 'ready');
      await page.locator('.item-detail-modal__close').click();
      await expect(cell(page, 'upgrade')).toBeFocused();

      const other = page
        .locator('[data-training-expense="total"] [data-material-id]:not([data-material-id="2"])')
        .first();
      const id = (await other.getAttribute('data-material-id'))!;
      await other.locator('button .training-material__name').click();
      await expect(modal(page)).toHaveAttribute('data-item-detail-id', id);
      await expect(modal(page)).toHaveAttribute('data-item-detail-state', 'ready');
      await expect(modal(page).locator('h2')).toHaveText(
        plain(catalog.materials.find((item) => item.id === id)!.name)
      );
      await expect(modal(page).locator('.item-detail-modal__background')).toHaveText(
        plain(details.materials.find((item) => item.id === id)!.backgroundDescription!)
      );
      const visual = await modal(page).locator('.item-detail-modal__visual').boundingBox();
      const text = await modal(page).locator('.item-detail-modal__text').boundingBox();
      if (testInfo.project.name === 'mobile-chromium')
        expect(text!.y).toBeGreaterThan(visual!.y + visual!.height);
      else expect(text!.x).toBeGreaterThan(visual!.x + visual!.width);
      expect(
        await modal(page)
          .locator('.item-detail-modal__surface')
          .evaluate((node) => node.scrollWidth <= node.clientWidth)
      ).toBe(true);
      await modal(page).screenshot({ path: testInfo.outputPath(`material-detail-${locale}.png`) });
      await page.mouse.click(2, 2);
      await expect(modal(page)).not.toBeVisible();
      await expect(other.locator('button')).toBeFocused();
      expect(requests).toHaveLength(1);
      expect(await trainingSnapshot(page)).toEqual(before);
    });
  }
}

test('a failed detail request remains distinct from empty metadata and retries without changing training', async ({
  page
}) => {
  let attempts = 0;
  await page.route('**/generated/zh-CN/material-details.json', async (route) => {
    if (++attempts === 1) await route.fulfill({ status: 503, body: '' });
    else await route.continue();
  });
  await ready(page);
  const before = await trainingSnapshot(page);
  await cell(page).click();
  await expect(modal(page)).toHaveAttribute('data-item-detail-state', 'error');
  await expect(modal(page).locator('h2')).toBeVisible();
  await modal(page).locator('.item-detail-modal__retry').click();
  await expect(modal(page)).toHaveAttribute('data-item-detail-state', 'ready');
  expect(attempts).toBe(2);
  await page.keyboard.press('Escape');
  expect(await trainingSnapshot(page)).toEqual(before);
});

test('closing before a response and selecting another material never reopens or shows stale data', async ({
  page
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/generated/zh-CN/material-details.json', async (route) => {
    await gate;
    await route.continue();
  });
  await ready(page);
  await cell(page).click();
  await expect(modal(page)).toHaveAttribute('data-item-detail-state', 'loading');
  await page.keyboard.press('Escape');
  await expect(modal(page)).not.toBeVisible();
  const other = page
    .locator('[data-training-expense="total"] [data-material-id]:not([data-material-id="2"])')
    .first();
  const id = (await other.getAttribute('data-material-id'))!;
  await other.locator('button .training-material__icon').click();
  await expect(modal(page)).toHaveAttribute('data-item-detail-id', id);
  release();
  await expect(modal(page)).toHaveAttribute('data-item-detail-state', 'ready');
  const catalog = fixture<MaterialCatalog>('zh-CN', 'materials');
  await expect(modal(page).locator('h2')).toHaveText(
    plain(catalog.materials.find((item) => item.id === id)!.name)
  );
  await page.keyboard.press('Escape');
  await expect(modal(page)).not.toBeVisible();
  await cell(page).click();
  await expect(modal(page)).toHaveAttribute('data-item-detail-id', '2');
  await expect(modal(page)).toHaveAttribute('data-item-detail-state', 'ready');
});

test('long descriptions scroll internally, missing optional text is valid, and failed icons use the fallback', async ({
  page
}) => {
  const details = fixture<MaterialDetailCatalog>('zh-CN', 'material-details');
  const credits = details.materials.find((item) => item.id === '2')!;
  delete credits.description;
  credits.backgroundDescription = Array.from(
    { length: 90 },
    (_, index) => `fixture paragraph ${index}\n`
  ).join('\n');
  await page.route('**/generated/zh-CN/material-details.json', (route) =>
    route.fulfill({ json: details })
  );
  await page.route('**/generated-assets/materials/icons/2.png', (route) =>
    route.fulfill({ status: 404, body: '' })
  );
  await ready(page);
  await cell(page).click();
  await expect(modal(page)).toHaveAttribute('data-item-detail-state', 'ready');
  await expect(modal(page).locator('.item-detail-modal__description')).toHaveCount(0);
  await expect(modal(page).locator('[data-image-fallback]')).toBeVisible();
  const content = modal(page).locator('.item-detail-modal__content');
  expect(await content.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  await content.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect(modal(page).locator('.item-detail-modal__close')).toBeInViewport();
  expect(await content.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await modal(page).locator('.item-detail-modal__close').click();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe('hidden');
});

test('navigation and locale changes discard open item state and keep the requested locale', async ({
  page
}) => {
  await ready(page);
  await cell(page).click();
  await expect(modal(page)).toHaveAttribute('data-item-detail-state', 'ready');
  await ready(page, '/en/light-cones/20000/');
  await expect(modal(page)).not.toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  const response = page.waitForResponse('**/generated/en/material-details.json');
  await cell(page).click();
  await response;
  await expect(modal(page)).toHaveAttribute('data-item-detail-state', 'ready');
  const en = fixture<MaterialCatalog>('en', 'materials');
  await expect(modal(page).locator('h2')).toHaveText(
    plain(en.materials.find((item) => item.id === '2')!.name)
  );
});
