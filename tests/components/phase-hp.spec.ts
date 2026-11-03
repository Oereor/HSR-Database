import { expect, test } from '@playwright/test';

for (const overlap of ['card link', 'HP button']) {
  test(`sticky mode navigation receives clicks above the ${overlap}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/phase-hp');
    const card = page.locator('[data-endgame-enemy-card][data-monster-id="1"]');
    const target = card.locator(
      overlap === 'HP button' ? '[data-endgame-hp-trigger]' : '.endgame-enemy__identity'
    );
    const island = page.locator('.endgame-mode-switcher__island');
    const link = island.locator('a[href="/endgame/as/"]');
    await expect(target).toBeVisible({ timeout: 20_000 });
    await page.evaluate(() => window.scrollTo(0, 100));
    const targetBox = (await target.boundingBox())!;
    const navBox = (await link.boundingBox())!;
    await page.evaluate(
      (delta) => window.scrollBy(0, delta),
      targetBox.y + targetBox.height / 2 - navBox.y - navBox.height / 2
    );
    await island.evaluate(
      (element, targetX) => {
        const mode = element.querySelector<HTMLAnchorElement>('a[href="/endgame/as/"]')!;
        const box = mode.getBoundingClientRect();
        element.scrollLeft += box.x + box.width / 2 - targetX;
      },
      targetBox.x + targetBox.width / 2
    );
    await expect
      .poll(async () => {
        const a = (await target.boundingBox())!,
          b = (await link.boundingBox())!;
        return Math.abs(a.y + a.height / 2 - b.y - b.height / 2);
      })
      .toBeLessThan(1);
    const box = (await link.boundingBox())!;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    expect(
      await page.evaluate(
        ({ x, y }) =>
          document
            .elementFromPoint(x, y)
            ?.closest('.endgame-mode-switcher a')
            ?.getAttribute('href'),
        point
      )
    ).toBe('/endgame/as/');
    await page.mouse.click(point.x, point.y);
    await expect(page).toHaveURL(/\/endgame\/as\/$/);
    await expect(page.locator('[data-endgame-hp-popover]')).toHaveCount(0);
  });
}

test('partial phase HP popover supports keyboard and stays separate from the card link', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/phase-hp');
  const card = page.locator('[data-endgame-enemy-card][data-monster-id="1"]');
  await expect(card).toBeVisible({ timeout: 20_000 });
  const uniform = page.locator('[data-endgame-enemy-card][data-monster-id="2"]');
  const unknown = page.locator('[data-endgame-enemy-card][data-monster-id="3"]');
  await expect(uniform.locator('[data-endgame-hp-trigger]')).toHaveCount(0);
  await expect(uniform.locator('[data-endgame-hp]')).toHaveText('100 × 2');
  await expect(unknown.locator('[data-endgame-hp-trigger]')).toHaveCount(0);
  await expect(unknown.locator('[data-endgame-hp]')).toHaveText('100');
  const trigger = card.locator('[data-endgame-hp-trigger]');
  const link = card.locator('[data-endgame-enemy-link]');
  await expect(card.locator('a button')).toHaveCount(0);
  await expect(link).toHaveAttribute('href', '/synthetic-enemy/');
  await trigger.focus();
  await trigger.press('Space');
  const content = page.locator('[data-endgame-hp-popover]');
  await expect(content).toBeVisible();
  await expect(content.locator('dd')).toHaveText(['100', '-']);
  const buttonBox = await trigger.boundingBox(),
    box = await content.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(buttonBox!.y + buttonBox!.height);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await expect(content).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.press('Enter');
  await expect(content).toBeVisible();
  await content.locator('dd').first().click();
  await expect(page).toHaveURL(/\/phase-hp$/);
  await page.keyboard.press('Escape');
  await link.press('Enter');
  await expect(page).toHaveURL(/\/synthetic-enemy\/$/);
});
