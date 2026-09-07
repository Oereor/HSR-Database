import { readFileSync } from 'node:fs';
import { expect, test, type Locator } from '@playwright/test';

type Entry = { id: string; name: string; pathName?: string; elementName?: string };

function catalog(locale: string, type: string): Entry[] {
  return JSON.parse(
    readFileSync(`src/lib/generated/views/${locale}/catalogs/${type}.json`, 'utf8')
  );
}

async function checkCard(card: Locator, entry: Entry) {
  await card.scrollIntoViewIfNeeded();
  const metadata = card.locator('.entity-overview-card__metadata');
  const labels = [entry.pathName, entry.elementName].filter(Boolean) as string[];
  await expect(metadata.getByRole('img')).toHaveCount(labels.length);
  await expect(metadata).toHaveText('');
  for (const label of labels) {
    const icon = metadata.getByRole('img', { name: label, exact: true });
    await expect(icon).toBeVisible();
    await expect(icon.locator('img')).toHaveAttribute('alt', '');
    await expect
      .poll(() => icon.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
  }
  const layout = await metadata.evaluate((row) => {
    const bounds = row.getBoundingClientRect();
    const icons = [...row.children].map((item) => item.getBoundingClientRect());
    return {
      rows: new Set(icons.map((icon) => Math.round(icon.top))).size,
      contained: icons.every((icon) => icon.left >= bounds.left && icon.right <= bounds.right),
      square: icons.every((icon) => Math.abs(icon.width - icon.height) < 1),
      centered:
        Math.abs((icons[0].left + icons.at(-1)!.right) / 2 - (bounds.left + bounds.right) / 2) < 1
    };
  });
  expect(layout).toEqual({ rows: 1, contained: true, square: true, centered: true });
}

for (const locale of ['zh-CN', 'en']) {
  const prefix = locale === 'en' ? '/en' : '';
  const characters = catalog(locale, 'characters');
  const lightCones = catalog(locale, 'light-cones');
  for (const width of [1440, 768, 390]) {
    test(`${locale} overview icons remain accessible across consumers at ${width}px`, async ({
      page
    }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const [type, entries, id] of [
        ['characters', characters, '1304'],
        ['light-cones', lightCones, '20000']
      ] as const) {
        const entry = entries.find((item) => item.id === id)!;
        for (const route of [`/${type}`, '/search']) {
          await page.goto(`${prefix}${route}?q=${encodeURIComponent(entry.name)}`);
          await checkCard(page.locator(`a[href="${prefix}/${type}/${id}"]`).first(), entry);
          await page
            .locator(`a[href="${prefix}/${type}/${id}"]`)
            .first()
            .screenshot({
              path: test
                .info()
                .outputPath(`${type}-${route === '/search' ? 'search' : 'catalog'}.png`)
            });
        }
      }
      await page.goto(prefix || '/');
      for (const [kind, type, entries] of [
        ['avatar', 'characters', characters],
        ['weapon', 'light-cones', lightCones]
      ] as const) {
        const card = page.locator(`[data-homepage-recent="${kind}"] a`).first();
        const href = await card.getAttribute('href');
        const entry = entries.find((item) => href === `${prefix}/${type}/${item.id}`)!;
        await checkCard(card, entry);
        await card.screenshot({ path: test.info().outputPath(`home-${kind}.png`) });
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1);
    });
  }

  test(`${locale} overview missing icons preserve localized semantics`, async ({ page }) => {
    await page.route('**/generated-assets/paths/**', (route) => route.abort());
    await page.route('**/generated-assets/elements/**', (route) => route.abort());
    await page.goto(
      `${prefix}/characters?q=${encodeURIComponent(characters.find((entry) => entry.id === '1304')!.name)}`
    );
    const card = page.locator(`a[href="${prefix}/characters/1304"]`);
    const entry = characters.find((item) => item.id === '1304')!;
    for (const label of [entry.pathName!, entry.elementName!]) {
      const icon = card.getByRole('img', { name: label, exact: true });
      await expect(icon).toHaveAttribute('data-icon-missing', 'true');
      await expect(icon).toHaveText('?');
      await expect(icon.locator('img')).toHaveCount(0);
    }
    const lightCone = lightCones.find((item) => item.id === '20000')!;
    await page.goto(`${prefix}/light-cones?q=${encodeURIComponent(lightCone.name)}`);
    const pathIcon = page
      .locator(`a[href="${prefix}/light-cones/20000"]`)
      .getByRole('img', { name: lightCone.pathName!, exact: true });
    await expect(pathIcon).toHaveAttribute('data-icon-missing', 'true');
    await expect(pathIcon).toHaveText('?');
    await expect(pathIcon.locator('img')).toHaveCount(0);
  });
}
