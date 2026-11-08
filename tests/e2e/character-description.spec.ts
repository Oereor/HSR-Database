import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { getElementColor } from '../../src/lib/domain/elements';
import type { Character } from '../../src/lib/domain/types';

test('traces and eidolons render parameter tokens in their character element color', async ({
  page
}) => {
  test.setTimeout(90_000);
  for (const locale of ['zh-CN', 'en']) {
    for (const id of ['1001', '1103']) {
      const character = JSON.parse(
        readFileSync(`src/lib/generated/views/${locale}/details/characters/${id}.json`, 'utf8')
      ) as Character;
      const hex = getElementColor(character.element).slice(1);
      const color = `rgb(${[0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).join(', ')})`;
      await page.goto(`${locale === 'en' ? '/en' : ''}/characters/${id}/`);
      await page.waitForLoadState('networkidle');
      const profile = character.profiles.base;
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const [entry, selector] of [
          ...profile.traces
            .filter((trace) => trace.type === 'ability')
            .map(
              (trace) => [trace, `[data-trace-id="${trace.id}"] .trace-card__description`] as const
            ),
          ...profile.eidolons.map(
            (eidolon) =>
              [eidolon, `[data-eidolon-id="${eidolon.id}"] [data-slot="card-content"] > p`] as const
          )
        ]) {
          const parameters = page
            .locator(selector)
            .locator('[style*="color: var(--character-accent)"]');
          const expected = entry.descriptionTokens!.filter(
            (token) => token.type === 'fixed-param' && !token.color
          ).length;
          await expect(parameters).toHaveCount(expected);
          for (const parameter of await parameters.all())
            await expect(parameter).toHaveCSS('color', color);
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        ).toBeLessThanOrEqual(1);
      }
    }
  }
});
