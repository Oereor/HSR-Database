import { expect, test } from '@playwright/test';

test('character cards adapt to their container and retain accessible breakdowns', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);
  for (const locale of ['', '/en']) {
    for (const id of ['1001', '1213', '8007']) {
      await page.goto(`${locale}/characters/${id}/`);
      await page.waitForLoadState('networkidle');
      const triggers = page.locator('#traces [data-slot="collapsible-trigger"]');
      await expect(triggers.first()).toHaveAttribute('aria-expanded', 'false');
      await triggers.first().focus();
      await page.keyboard.press('Enter');
      await expect(triggers.first()).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Space');
      await expect(triggers.first()).toHaveAttribute('aria-expanded', 'false');
      for (const trigger of await triggers.all()) await trigger.click();

      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const layout = await page.evaluate(() => {
          const bounds = (element: Element) => element.getBoundingClientRect();
          const cards = [...document.querySelectorAll('#traces [data-trace-property]')];
          const panel = document.querySelector('.trace-card-panel')!;
          const content = document.querySelector('#skills [data-slot="card-content"]')!;
          const meta = content.querySelector('[data-combat-meta]')?.parentElement;
          return {
            overflow: document.documentElement.scrollWidth - innerWidth,
            columns: getComputedStyle(
              document.querySelector('[data-trace-stat-summaries]')!
            ).gridTemplateColumns.split(' ').length,
            expectedColumns: bounds(panel).width >= 1024 ? 3 : 1,
            metaHorizontal: meta ? getComputedStyle(meta).display === 'flex' : false,
            expectedMetaHorizontal:
              content.clientWidth -
                parseFloat(getComputedStyle(content).paddingLeft) -
                parseFloat(getComputedStyle(content).paddingRight) >=
              768,
            rowsFit: cards.every((card) =>
              [...card.querySelectorAll('[data-trace-id]')].every((row) => {
                const children = [...row.children].map(bounds);
                return (
                  children.length === 2 &&
                  children[0].right <= children[1].left &&
                  children[1].right <= bounds(row).right + 1
                );
              })
            ),
            colorsMatch: cards.every((card) =>
              [...card.querySelectorAll('[data-trace-id] > span:first-child')].every(
                (value) =>
                  getComputedStyle(value).color ===
                  getComputedStyle(card.querySelector('output')!).color
              )
            ),
            separatorsFit: [
              ...document.querySelectorAll(
                '#skills [data-slot="card"], #eidolons [data-slot="card"], #traces [data-trace-property]'
              )
            ].every((card) => {
              const separator = card.querySelector(':scope > [data-slot="separator"]')!;
              return Math.abs(bounds(separator).width - (bounds(card).width - 2)) <= 1;
            })
          };
        });
        expect(layout.overflow).toBeLessThanOrEqual(1);
        expect(layout.columns).toBe(layout.expectedColumns);
        expect(layout.metaHorizontal).toBe(layout.expectedMetaHorizontal);
        expect(layout.rowsFit).toBe(true);
        expect(layout.colorsMatch).toBe(true);
        expect(layout.separatorsFit).toBe(true);
        if (locale === '' && id === '1001' && [390, 1440].includes(width)) {
          await page
            .locator('[data-trace-stat-summaries]')
            .screenshot({ path: testInfo.outputPath(`traces-${width}.png`) });
          await page
            .locator('#skills [data-slot="card"]')
            .first()
            .screenshot({ path: testInfo.outputPath(`skill-${width}.png`) });
        }
      }
    }
  }
});
