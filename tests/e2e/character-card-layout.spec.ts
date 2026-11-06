import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('skill descriptions and trace conditions retain compact readable spacing', async ({
  page
}) => {
  for (const id of ['1407', '1103']) {
    const character = JSON.parse(
      readFileSync(`src/lib/generated/views/zh-CN/details/characters/${id}.json`, 'utf8')
    );
    const promotionById = Object.fromEntries(
      character.profiles.base.traces.map((trace: { id: string; promotionLimit?: number }) => [
        trace.id,
        trace.promotionLimit ?? 0
      ])
    );
    await page.goto(`/characters/${id}/`);
    await page.waitForLoadState('networkidle');
    for (const trigger of await page.locator('#traces [data-slot="collapsible-trigger"]').all())
      await trigger.click();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const result = await page.evaluate((promotions) => {
        const headings = [...document.querySelectorAll('#skills .skill-variant__heading')];
        const directDescriptions = headings.filter((heading) =>
          heading.nextElementSibling?.matches('.levelled-description, .data-placeholder')
        );
        const abilityCondition = document.querySelector(
          '[data-trace-abilities] .trace-card__condition'
        )!;
        const labelColor = getComputedStyle(abilityCondition.querySelector(':scope > span')!).color;
        const promotionColor = getComputedStyle(abilityCondition).color;
        return {
          hasDirectDescriptions: directDescriptions.length > 0,
          descriptionSpacing: directDescriptions.every(
            (heading) =>
              Math.abs(
                heading.nextElementSibling!.getBoundingClientRect().top -
                  heading.getBoundingClientRect().bottom -
                  12
              ) < 1
          ),
          metadataSpacing: headings
            .filter((heading) => heading.nextElementSibling?.matches('dl'))
            .every((heading) => getComputedStyle(heading.nextElementSibling!).marginTop === '8px'),
          conditions: [...document.querySelectorAll('[data-trace-property] [data-trace-id]')].every(
            (row) => {
              if (!promotions[row.getAttribute('data-trace-id')!])
                return row.childElementCount === 1;
              const condition = row.children[1];
              return (
                row.childElementCount === 2 &&
                condition.childElementCount === 2 &&
                getComputedStyle(condition.children[0]).color === labelColor &&
                getComputedStyle(condition.children[1]).color === promotionColor
              );
            }
          )
        };
      }, promotionById);
      expect(result.hasDirectDescriptions).toBe(true);
      expect(result.descriptionSpacing).toBe(true);
      expect(result.metadataSpacing).toBe(true);
      expect(result.conditions).toBe(true);
    }
  }
});

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
                  children.length >= 1 &&
                  children.length <= 2 &&
                  (children.length === 1 || children[0].right <= children[1].left) &&
                  children.at(-1)!.right <= bounds(row).right + 1
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
