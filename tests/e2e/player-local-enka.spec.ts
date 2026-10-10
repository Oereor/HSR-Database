import { readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { PlayerProfile } from '../../src/lib/player/contract.js';

const directory = process.env.PLAYER_MOCK_DIR;
const files =
  process.env.PLAYER_MOCK_ENABLED === '1' && directory
    ? readdirSync(directory)
        .filter((file) => /^\d{9}-Enka\.json$/.test(file))
        .sort()
    : [];

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
for (const [sample, file] of files.entries())
  for (const prefix of ['', '/en']) {
    test(`local Enka sample ${sample + 1} ${prefix ? 'en' : 'zh-CN'}`, async ({ page }) => {
      test.setTimeout(120_000);
      const errors: string[] = [];
      let requests = 0;
      let external = 0;
      let responseBody: PlayerProfile | undefined;
      page.on('pageerror', () => errors.push('pageerror'));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push('console-error');
      });
      await page.route('**/*', async (route) => {
        if (!['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)) {
          external++;
          await route.abort();
        } else await route.continue();
      });
      page.on('response', async (response) => {
        if (new URL(response.url()).pathname === '/api/player/') {
          requests++;
          expect(response.headers()['cache-control']).toBe('no-store');
          responseBody = (await response.json()) as PlayerProfile;
        }
      });
      await page.goto(`${prefix}/player/?uid=${file.slice(0, 9)}`);
      const links = page.locator('.player-characters a.entity-overview-card');
      await expect.poll(() => Boolean(responseBody?.characters.length)).toBe(true);
      const profile = responseBody!;
      await expect(links).toHaveCount(profile.characters.length);
      for (const character of profile.characters) {
        expect(character.relicScore).toMatchObject({ version: 3, algorithmVersion: 2 });
        const href = `${prefix}/characters/${character.characterId}/?uid=${profile.uid}&build=${encodeURIComponent(character.buildId)}`;
        await page
          .locator('.player-characters a')
          .filter({ hasNot: page.locator('[data-unused]') })
          .evaluateAll((elements, target) => {
            const anchor = elements.find((element) => element.getAttribute('href') === target) as
              HTMLAnchorElement | undefined;
            if (!anchor) throw new Error('Anonymous sample navigation link missing');
            anchor.click();
          }, href);
        const summary = page.locator('[data-player-relic-score-summary]');
        await expect(summary).toHaveAttribute('data-player-algorithm-version', '2');
        await expect(page.locator('[data-player-relic-slot]')).toHaveCount(6);
        await expect(page.locator('[data-player-stats-panel]')).toBeVisible();
        await expect(page.locator('.player-light-cone')).toBeVisible();
        const score = character.relicScore!;
        if (score.build.status === 'available')
          await expect(summary.locator('[data-player-build-score]')).toHaveText(
            score.build.score.toFixed(1)
          );
        else await expect(summary.locator('[data-player-build-score-unavailable]')).toBeVisible();
        for (const [slot, piece] of Object.entries(score.pieces))
          if (piece.status === 'available') {
            await expect(
              page.locator(`[data-player-relic-slot="${slot}"] [data-main-mode]`)
            ).toHaveAttribute('data-main-mode', piece.mainMode);
            expect(piece.score >= 0 && piece.score <= 100).toBe(true);
          }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
          )
        ).toBeLessThanOrEqual(1);
        await page.locator('.player-context-notice a').click();
        await expect(links).toHaveCount(profile.characters.length);
      }
      expect(requests).toBe(1);
      await page.reload();
      await expect.poll(() => requests).toBe(2);
      expect(external).toBe(0);
      expect(errors).toEqual([]);
    });
  }
