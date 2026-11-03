import { expect, test } from '@playwright/test';

for (const prefix of ['', '/en']) {
  test(`Iron Tomb phase HP and card navigation ${prefix || 'zh-CN'}`, async ({
    page
  }, testInfo) => {
    await page.goto(`${prefix}/endgame/aa/9/?encounter=904%3Anormal`);
    const card = page.locator('[data-monster-id="403501001"]').first();
    const trigger = card.locator('[data-endgame-hp-trigger]');
    await expect(trigger).toBeVisible();
    await trigger.click();
    const content = page.locator('[data-endgame-hp-popover]');
    await expect(content.locator('dd')).toHaveText(['12,395,970', '15,494,962', '12,395,970']);
    if (!prefix && testInfo.project.name === 'desktop-chromium')
      await page.screenshot({ path: testInfo.outputPath('phase-hp.png') });
    await expect(card.locator('a button')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await card.locator('[data-endgame-enemy-link]').click();
    await expect(page).toHaveURL(new RegExp(`${prefix}/enemies/4035010/$`));
  });
}
