import { expect, test } from '@playwright/test';

test('two attribute cards switch together at their parent width threshold', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto('/trace-grid');
  const parent = page.locator('[data-trace-grid-fixture]');
  const cards = parent.locator('[data-trace-property]');
  await expect(cards).toHaveCount(2);
  for (const width of [28.9, 29]) {
    await parent.evaluate((element, width) => (element.style.width = `${width}rem`), width);
    const first = (await cards.first().boundingBox())!;
    const second = (await cards.last().boundingBox())!;
    expect(second.width).toBeCloseTo(first.width, 0);
    if (width < 29) {
      expect(second.x).toBe(first.x);
      expect(second.y).toBeGreaterThan(first.y);
    } else {
      expect(second.x).toBeGreaterThan(first.x);
      expect(second.y).toBe(first.y);
    }
  }
});
