import { expect, test } from '@playwright/test';

for (const locale of ['zh-CN', 'en']) {
  for (const width of [1440, 900, 390]) {
    test(`Voracity tags: ${locale} at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      const prefix = locale === 'en' ? '/en' : '';
      for (const [route, variant] of [
        ['/endgame/aa/9/?encounter=902%3Apreliminary', 'standard'],
        ['/endgame/pf/2026/?encounter=20264', 'compact']
      ]) {
        await page.goto(`${prefix}${route}`);
        const cards = page.locator('[data-endgame-enemy-card]').filter({
          has: page.locator('[data-voracity-level]')
        });
        await expect(cards.first()).toBeVisible();
        await expect(cards.first()).toHaveAttribute('data-enemy-card-variant', variant);
        for (const card of await cards.all()) {
          const layout = await card.evaluate((element) => {
            const pollution = element.querySelector<HTMLElement>('[data-voracity-level]')!;
            const level = element.querySelector<HTMLElement>('.endgame-enemy__level')!;
            const artwork = element.querySelector<HTMLElement>('.endgame-enemy__artwork')!;
            const p = pollution.getBoundingClientRect();
            const l = level.getBoundingClientRect();
            const a = artwork.getBoundingClientRect();
            const sharedStyle = (node: HTMLElement) => {
              const style = getComputedStyle(node);
              return [style.fontSize, style.fontWeight, style.borderRadius, style.padding];
            };
            return {
              contained:
                p.left >= a.left && l.right <= a.right && p.top >= a.top && p.bottom <= a.bottom,
              sameRow: Math.abs(p.top - l.top) < 1 && Math.abs(p.bottom - l.bottom) < 1,
              ordered: p.right <= l.left,
              sameStyle:
                JSON.stringify(sharedStyle(pollution)) === JSON.stringify(sharedStyle(level)),
              text: pollution.textContent?.trim(),
              level: pollution.dataset.voracityLevel
            };
          });
          expect(layout).toMatchObject({
            contained: true,
            sameRow: true,
            ordered: true,
            sameStyle: true,
            level: '2'
          });
          expect(layout.text).toContain('2');
          expect(layout.text).not.toContain('endgame_enemy_voracity');
          expect(/[\u3400-\u9fff]/u.test(layout.text!)).toBe(locale === 'zh-CN');
        }
        await cards.first().scrollIntoViewIfNeeded();
        await expect(cards.first().locator('[data-enemy-portrait]')).toBeVisible();
        await expect
          .poll(() =>
            cards
              .first()
              .locator('[data-enemy-portrait]')
              .evaluate((image) => (image as HTMLImageElement).naturalWidth)
          )
          .toBeGreaterThan(0);
        const screenshotPath = testInfo.outputPath(`${variant}.png`);
        await cards.first().screenshot({ path: screenshotPath });
        await testInfo.attach(`${variant}-${locale}-${width}`, {
          path: screenshotPath,
          contentType: 'image/png'
        });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
        ).toBe(true);
      }
      expect(pageErrors).toEqual([]);
    });
  }
}
