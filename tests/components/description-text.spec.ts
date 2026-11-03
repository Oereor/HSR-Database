import { expect, test, type Locator } from '@playwright/test';
import { descriptionCases } from '../fixtures/description-text';

async function lineDistance(element: Locator, first = 'First', second = 'Second') {
  return element.evaluate(
    (element, { first, second }) => {
      const top = (word: string) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const index = node.textContent!.indexOf(word);
          if (index < 0) continue;
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          return range.getBoundingClientRect().top;
        }
        throw new Error(`Missing fixture word: ${word}`);
      };
      return (top(second) - top(first)) / parseFloat(getComputedStyle(element).lineHeight);
    },
    { first, second }
  );
}

test('SSR and hydrated descriptions preserve newlines and rich text like GameText', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/description-text');
  const fixture = page.locator('[data-description-fixture]');
  await expect(fixture).toHaveAttribute('data-hydrated', 'false');
  for (const hydrated of [false, true]) {
    if (hydrated) {
      await page.locator('#hydrate').click();
      await expect(fixture).toHaveAttribute('data-hydrated', 'true');
    }
    for (const item of descriptionCases) {
      const description = page.locator(`[data-description-case="${item.id}"]`);
      const gameText = page.locator(`[data-game-text-case="${item.id}"]`);
      await expect(description.locator('.game-text')).toHaveCSS('white-space', 'pre-line');
      expect(await lineDistance(description)).toBe(item.linesBetween);
      expect(await lineDistance(gameText)).toBe(item.linesBetween);
    }
    const rich = page.locator('[data-description-case="rich"]');
    await expect(rich.locator('u')).toHaveCSS('color', 'rgb(18, 52, 86)');
    await expect(rich.locator('u')).toHaveCSS('text-decoration-line', 'underline');
    await expect(rich.locator('em')).toHaveCSS('font-style', 'italic');
    await expect(rich.locator('.scaling-value')).toHaveCSS('font-weight', '650');
    await expect(rich.locator('.description-token--unbreak')).toHaveCSS('white-space', 'nowrap');
    expect(await lineDistance(page.locator('[data-special-effect]'), 'Before', 'After')).toBe(2);
  }
  const trigger = page.locator('.special-effect-trigger');
  await trigger.click();
  await expect(page.locator('[data-open-count]')).toHaveText('1');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-open-count]')).toHaveText('2');
  await expect(page.locator('[data-trigger-tag]')).toHaveText('BUTTON');
  expect(errors).toEqual([]);
});
