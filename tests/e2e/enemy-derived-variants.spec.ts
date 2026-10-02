import { expect, test } from '@playwright/test';

for (const width of [1440, 1100, 1080, 900, 390, 320]) {
  test(`派生详情在 ${width}px 下保持等宽或顺序堆叠，双语长文本不溢出`, async ({
    page
  }, testInfo) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    for (const prefix of ['', '/en']) {
      for (const [id, count] of [
        ['8034010', 3],
        ['3002011', 2]
      ] as const) {
        await page.goto(`${prefix}/enemies/${id}/`);
        const panel = page.locator('.enemy-battle-panel');
        const sections = panel.locator(':scope > section');
        await expect(sections).toHaveCount(count);
        await expect(panel).toHaveAttribute('data-battle-columns', String(count));
        await expect(
          page.locator('.enemy-selected-monster-heading, .enemy-level-control--standalone')
        ).toHaveCount(0);
        const stats = panel.locator('.enemy-battle-column--stats');
        await expect(stats.getByRole('slider')).toHaveCount(1);
        await expect(stats.locator('.stat-level-control > .skill-level-control')).toHaveCSS(
          'border-top-width',
          '0px'
        );
        await expect(stats.locator('.hero-stat-list')).toHaveCSS('margin-top', '24px');
        const rows = panel.locator(
          '[data-enemy-stat], [data-enemy-resistance], [data-special-resistance]'
        );
        for (const row of await rows.all()) {
          await expect(row).toHaveClass(/hero-stat-row/);
          await expect(row.locator('dd')).toHaveCSS('text-align', 'right');
          await expect(row.locator('strong')).toHaveCSS('font-variant-numeric', 'tabular-nums');
        }
        const geometry = await sections.evaluateAll((elements) =>
          elements.map((element) => {
            const bounds = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              bottom: bounds.bottom,
              leftBorder: style.borderLeftWidth,
              topBorder: style.borderTopWidth
            };
          })
        );
        for (let index = 1; index < geometry.length; index++) {
          const previous = geometry[index - 1];
          const current = geometry[index];
          expect(Math.abs(current.width - previous.width)).toBeLessThanOrEqual(1);
          if (width > 1080) {
            expect(current.y).toBeCloseTo(previous.y, 0);
            expect(current.x).toBeGreaterThan(previous.x);
            expect(current.leftBorder).toBe('1px');
            expect(current.topBorder).toBe('0px');
          } else {
            expect(current.x).toBeCloseTo(previous.x, 0);
            expect(current.y).toBeGreaterThanOrEqual(previous.bottom - 1);
            expect(current.leftBorder).toBe('0px');
            expect(current.topBorder).toBe('1px');
          }
        }
        const slider = stats.getByRole('slider');
        expect(
          await slider.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            const column = element.closest('section')!.getBoundingClientRect();
            return bounds.width > 0 && bounds.left >= column.left && bounds.right <= column.right;
          })
        ).toBe(true);
        if (!prefix)
          await page.locator('#monsters').screenshot({
            path: testInfo.outputPath(`derived-${id}-${width}.png`),
            // Keep fixed site chrome from obscuring this section in full-height captures.
            style: '.mobile-header, .section-nav, .settings-control { visibility: hidden; }'
          });

        // Exercise real label compositions, including the elemental icon slot, without fixing translated copy.
        await rows.locator('.hero-stat-label-text').evaluateAll((elements) => {
          for (const element of elements) {
            const target = element.querySelector('.semantic-icon-label__text') ?? element;
            target.textContent = 'Synthetic long localized label ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          }
        });
        await rows.locator('dd strong').evaluateAll((elements) => {
          for (const [index, element] of elements.entries()) {
            element.textContent = index % 2 ? '123,456,789,012,345,678,901,234' : '100%';
          }
        });
        for (const row of await rows.all()) {
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
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
          )
        ).toBeLessThanOrEqual(1);
      }
    }
    expect(errors).toEqual([]);
  });
}

test('派生属性等级控件保留双语标签、范围、键盘操作和数值更新', async ({ page }) => {
  for (const prefix of ['', '/en']) {
    await page.goto(`${prefix}/enemies/8034010/`);
    const stats = page.locator('.enemy-battle-column--stats');
    const slider = stats.getByRole('slider');
    await expect(slider).toHaveAccessibleName(/\S/);
    await expect(slider).toHaveValue('95');
    const minimum = (await slider.getAttribute('min'))!;
    const maximum = (await slider.getAttribute('max'))!;
    await expect(stats.locator('.skill-level-range span').first()).toHaveText(`Lv.${minimum}`);
    await expect(stats.locator('.skill-level-range span').last()).toHaveText(`Lv.${maximum}`);
    const hp = stats.locator('[data-enemy-stat="hp"] dd');
    const initialHp = await hp.textContent();
    await slider.fill('60');
    await expect(hp).not.toHaveText(initialHp!);
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveValue('61');
    await expect(slider).toHaveAttribute('aria-valuenow', '61');
    await expect(stats.locator('output')).toHaveText('Lv.61');
    await expect(slider).toBeFocused();
    await page.keyboard.press('Home');
    await expect(slider).toHaveValue(minimum);
    await page.keyboard.press('End');
    await expect(slider).toHaveValue(maximum);
  }
});
