import { expect, test } from '@playwright/test';

const entities = [
  { category: 'characters', id: '1001', rows: 5 },
  { category: 'light-cones', id: '20000', rows: 3 },
  { category: 'enemies', id: '1004014', rows: 8 }
] as const;

for (const width of [1440, 1024, 390]) {
  test(`Hero basic data stays aligned at ${width}px in both locales`, async ({
    page
  }, testInfo) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    for (const prefix of ['', '/en']) {
      for (const entity of entities) {
        await page.goto(`${prefix}/${entity.category}/${entity.id}/`);
        const pane = page.locator('.hero-basic-data-pane');
        const list = pane.locator('.hero-stat-list');
        await expect(list.locator('.hero-stat-row')).toHaveCount(entity.rows);
        await expect(pane).toHaveCSS('padding-left', width <= 820 ? '24px' : '32px');
        await expect(list).toHaveCSS('border-top-width', '0px');
        await expect(list).toHaveCSS('margin-top', '24px');
        await expect(pane.locator('.info-card')).toHaveCount(0);
        if (entity.category !== 'enemies') {
          await expect(pane.locator('.stat-level-control > .skill-level-control')).toHaveCSS(
            'border-top-width',
            '0px'
          );
          await expect(pane.locator('.stat-level-control > .skill-level-control')).toHaveCSS(
            'margin-top',
            '0px'
          );
          await expect(pane.locator('.stat-level-control > .skill-level-control')).toHaveCSS(
            'padding-top',
            '0px'
          );
        }

        const hero = pane.locator('..');
        const identityBox = await hero.locator('.detail-profile-hero__identity').boundingBox();
        const paneBox = await pane.boundingBox();
        const stacked = width <= (entity.category === 'characters' ? 1180 : 820);
        if (stacked)
          expect(paneBox!.y).toBeGreaterThanOrEqual(identityBox!.y + identityBox!.height - 1);
        else expect(paneBox!.y).toBeCloseTo(identityBox!.y, 0);

        const row = list.locator('.hero-stat-row').nth(1);
        await expect(row).toHaveCSS('display', 'grid');
        await expect(row).toHaveCSS('border-top-width', '0px');
        await expect(row.locator('dd strong')).toHaveCSS('font-variant-numeric', 'tabular-nums');
        const divider = await row.evaluate((element) => {
          const style = getComputedStyle(element, '::before');
          const label = element.querySelector('.hero-stat-label-text')!.getBoundingClientRect();
          return {
            inset: parseFloat(style.left),
            labelInset: label.left - element.getBoundingClientRect().left,
            height: style.height
          };
        });
        expect(divider.height).toBe('1px');
        expect(divider.inset).toBeCloseTo(divider.labelInset, 0);
        if (entity.category === 'enemies') {
          await expect(list.locator('.hero-stat-icon')).toHaveCount(0);
          expect(divider.inset).toBe(0);
        }

        if (!prefix)
          await hero.screenshot({ path: testInfo.outputPath(`${entity.category}-${width}.png`) });

        // Stress the actual row layout independently of mutable translated copy.
        await row.evaluate((element) => {
          element.querySelector('.hero-stat-label-text')!.textContent =
            'Synthetic localized label with a very long unbroken segment ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          element.querySelector('dd strong')!.textContent = '123,456,789,012,345,678,901,234';
        });
        const bounds = await row.evaluate((element) => {
          const label = element.querySelector('dt')!.getBoundingClientRect();
          const value = element.querySelector('dd')!.getBoundingClientRect();
          return {
            labelRight: label.right,
            valueLeft: value.left,
            valueRight: value.right,
            rowRight: element.getBoundingClientRect().right,
            overflow: element.scrollWidth - element.clientWidth
          };
        });
        expect(bounds.labelRight).toBeLessThanOrEqual(bounds.valueLeft);
        expect(bounds.valueRight).toBeLessThanOrEqual(bounds.rowRight + 1);
        expect(bounds.overflow).toBeLessThanOrEqual(1);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
          )
        ).toBeLessThanOrEqual(1);
      }
    }
    expect(pageErrors).toEqual([]);
  });
}

test('Hero level controls keep keyboard behavior and mixed missing icons keep labels aligned', async ({
  page
}) => {
  await page.goto('/characters/1001/');
  const pane = page.locator('.hero-basic-data-pane');
  const slider = pane.getByRole('slider');
  await slider.fill('79');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('80');
  await expect(slider).toHaveAttribute('aria-valuenow', '80');
  await expect(slider).toBeFocused();

  const labels = pane.locator('.hero-stat-label-text');
  const before = await labels.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().left)
  );
  const firstIcon = pane.locator('.hero-stat-icon img').first();
  await firstIcon.evaluate((image) => image.dispatchEvent(new Event('error')));
  await expect(pane.locator('.hero-stat-row').first().locator('img')).toHaveCount(0);
  await expect(pane.locator('[data-image-fallback]')).toHaveCount(0);
  const after = await labels.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().left)
  );
  expect(after).toEqual(before);
  expect(new Set(after).size).toBe(1);
});

test('Enemy Hero missing values use shared muted state with no icon column', async ({ page }) => {
  for (const prefix of ['', '/en']) {
    await page.goto(`${prefix}/enemies/3002040/`);
    const list = page.locator('.hero-basic-data-pane .hero-stat-list');
    await expect(list.locator('.hero-stat-row')).toHaveCount(8);
    await expect(list.locator('.hero-stat-icon')).toHaveCount(0);
    const unavailable = list.locator('.stat-value--unavailable');
    expect(await unavailable.count()).toBeGreaterThan(0);
    for (const value of await unavailable.all()) {
      await expect(value).not.toBeEmpty();
      await expect(value).toHaveCSS('font-weight', '400');
      await expect(value).toHaveCSS('color', 'rgb(127, 141, 165)');
    }
  }
});
