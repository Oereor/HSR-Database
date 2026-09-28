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

  test(`v4.6 AA pollution level 3: ${locale}`, async ({ page }) => {
    const prefix = locale === 'en' ? '/en' : '';
    await page.setViewportSize({ width: 900, height: 1000 });
    await page.goto(`${prefix}/endgame/aa/10/?encounter=1001%3Apreliminary`);
    const card = page.locator('[data-endgame-enemy-card][data-monster-id="5014020"]');
    await expect(card).toBeVisible();
    const tag = card.locator('[data-voracity-level="3"]');
    const level = card.locator('.endgame-enemy__level');
    await expect(tag).toBeVisible();
    await expect(level).toHaveText('Lv.95');
    const layout = await card.evaluate((element) => {
      const tag = element.querySelector<HTMLElement>('[data-voracity-level="3"]')!;
      const level = element.querySelector<HTMLElement>('.endgame-enemy__level')!;
      const artwork = element.querySelector<HTMLElement>('.endgame-enemy__artwork')!;
      const tagRect = tag.getBoundingClientRect();
      const levelRect = level.getBoundingClientRect();
      const artworkRect = artwork.getBoundingClientRect();
      const tagStyle = getComputedStyle(tag);
      const levelStyle = getComputedStyle(level);
      const [red, green, blue] = tagStyle.color.match(/\d+/g)!.map(Number);
      return {
        text: tag.textContent?.trim(),
        contained: tagRect.left >= artworkRect.left && levelRect.right <= artworkRect.right,
        sameRow: Math.abs(tagRect.top - levelRect.top) < 1,
        ordered: tagRect.right <= levelRect.left,
        sameShape:
          tagStyle.borderRadius === levelStyle.borderRadius &&
          tagStyle.padding === levelStyle.padding &&
          tagStyle.fontSize === levelStyle.fontSize,
        red: red > green && red > blue
      };
    });
    expect(layout).toMatchObject({
      contained: true,
      sameRow: true,
      ordered: true,
      sameShape: true,
      red: true
    });
    expect(layout.text).toContain('3');
  });
}
