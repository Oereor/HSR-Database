import { expect, test } from '@playwright/test';

const trigger = '[data-endgame-summon-trigger]';
const card = (id: number) => `[data-endgame-enemy-card][data-monster-id="${id}"]`;

for (const locale of ['zh-CN', 'en'] as const) {
  const prefix = locale === 'en' ? '/en' : '';
  test(`MoC summon Dialog and concrete variant links (${locale})`, async ({ page }) => {
    const season = `${prefix}/endgame/moc/1036/?encounter=5512`;
    await page.goto(season);
    const boss = page.locator(card(4064010));
    const opener = boss.locator(trigger);
    await expect(opener).toBeVisible();
    await expect(page.locator(card(2013020)).locator(trigger)).toHaveCount(0);
    await expect(boss.locator('a button')).toHaveCount(0);
    await expect(page.locator(card(4062010))).toHaveCount(0);
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${prefix}/endgame/moc/1036/\\?encounter=5512$`));
    const target = dialog.locator(card(4062010));
    await expect(target).toHaveAttribute('data-endgame-enemy-level', '95');
    await expect(target.locator('[data-endgame-hp]')).toHaveText('672,129');
    await expect(target.locator('[data-endgame-speed]')).toHaveText('132');
    await expect(target.locator('[data-endgame-toughness]')).toHaveText('30');
    await expect(target.locator('[data-voracity-level]')).toHaveAttribute(
      'data-voracity-level',
      '3'
    );
    await expect(dialog.locator(trigger)).toHaveCount(0);
    expect(
      /[\u3400-\u9fff]/u.test((await dialog.getByRole('heading').first().textContent()) ?? '')
    ).toBe(locale === 'zh-CN');
    expect(
      /[\u3400-\u9fff]/u.test(
        (await target.locator('[data-endgame-enemy-link]').textContent()) ?? ''
      )
    ).toBe(locale === 'zh-CN');
    expect(
      await dialog.evaluate(
        (element) =>
          element.scrollWidth <= element.clientWidth &&
          document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();

    const other = page.locator(card(2034010));
    const otherOpener = other.locator(trigger);
    await otherOpener.click();
    await expect(dialog.locator(card(4062010))).toHaveCount(0);
    const variantLink = dialog.locator(card(203201003)).locator('[data-endgame-enemy-link]');
    await expect(variantLink).toHaveAttribute(
      'href',
      `${prefix}/enemies/2032010/?monster=203201003`
    );
    await dialog.locator('[data-slot="dialog-close"]').click();
    await expect(dialog).toBeHidden();
    await expect(otherOpener).toBeFocused();
    await otherOpener.click();
    await variantLink.click();
    await expect(page).toHaveURL(new RegExp(`${prefix}/enemies/2032010/\\?monster=203201003$`));
    await expect(dialog).toBeHidden();
    await page.goto(season);
    await boss.locator('[data-endgame-enemy-link]').click();
    await expect(page).toHaveURL(new RegExp(`${prefix}/enemies/4064010/\\?monster=4064010$`));
  });
  test(`AA and AS summon cards share the detail Dialog (${locale})`, async ({ page, isMobile }) => {
    if (isMobile) await page.setViewportSize({ width: 360, height: 545 });
    await page.goto(`${prefix}/endgame/aa/11/?encounter=1103%3Apreliminary`);
    const knightTrigger = page.locator(card(4053020)).locator(trigger).first();
    await knightTrigger.click();
    const dialog = page.getByRole('dialog');
    const child = dialog.locator(card(4052020));
    await expect(child.locator('[data-endgame-hp]')).toHaveText('975,896');
    await expect(child).toHaveAttribute('data-endgame-enemy-level', '95');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(knightTrigger).toBeFocused();

    await page.goto(`${prefix}/endgame/as/3022/?encounter=30224`);
    const knight = page.locator('[data-as-boss-dossier]').locator(card(302401304)).first();
    const bossTrigger = knight.locator(trigger);
    await bossTrigger.click();
    const spear = dialog.locator(card(3021032));
    await expect(spear).toHaveAttribute('data-endgame-enemy-level', '90');
    await expect(spear.locator('[data-endgame-hp]')).toHaveText('791,918');
    await expect(spear.locator('[data-endgame-speed]')).toHaveText('132');
    await expect(spear.locator('[data-endgame-toughness]')).toHaveText('30');
    await expect(dialog.locator(trigger)).toHaveCount(0);
    const layout = await dialog.evaluate((element) => {
      const description = document.getElementById(element.getAttribute('aria-describedby') ?? '');
      const grid = element.querySelector('[data-enemy-grid]');
      const close = element.querySelector('[data-slot="dialog-close"]');
      const body = grid?.parentElement;
      if (!description?.textContent?.trim() || !body || !close) return null;
      const details = description.getBoundingClientRect();
      const previousTop = close.getBoundingClientRect().top;
      body.scrollTop = body.scrollHeight;
      return {
        descriptionHasNoLayout:
          details.width <= 1 &&
          details.height <= 1 &&
          getComputedStyle(description).position === 'absolute',
        overflowX:
          element.scrollWidth > element.clientWidth ||
          document.documentElement.scrollWidth > innerWidth,
        closeStaysInPlace: close.getBoundingClientRect().top === previousTop,
        scrolls: body.scrollTop > 0
      };
    });
    expect(layout).toMatchObject({
      descriptionHasNoLayout: true,
      overflowX: false,
      closeStaysInPlace: true
    });
    if (isMobile) expect(layout?.scrolls).toBe(true);
    await dialog.locator('[data-slot="dialog-close"]').click();
    await expect(dialog).toBeHidden();
    await expect(bossTrigger).toBeFocused();

    await bossTrigger.click();
    await spear.locator('[data-endgame-enemy-link]').click();
    await expect(page).toHaveURL(
      new URL(`${prefix}/enemies/3021032/?monster=3021032`, page.url()).href
    );
    await expect(dialog).toBeHidden();
    await page.goto(`${prefix}/endgame/pf/2026/?encounter=20264`);
    await expect(page.locator('[data-endgame-enemy-card]').first()).toBeVisible();
    await expect(page.locator(trigger)).toHaveCount(0);
  });
}

test('MoC shared and unknown HP preserve the other card attributes', async ({ page }) => {
  await page.goto('/endgame/moc/1029/?encounter=4811');
  await page.locator(card(3004012)).locator(trigger).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('[data-endgame-hp-shared]')).toHaveCount(3);
  await expect(dialog.locator(card(3003031)).locator('[data-endgame-toughness]')).toHaveText('60');
  await page.goto('/endgame/moc/113/?encounter=1306');
  await expect(dialog).toBeHidden();
  await page.locator(card(2022050)).locator(trigger).first().click();
  const target = dialog.locator(card(2022051));
  await expect(target.locator('[data-endgame-hp]')).toHaveText('-');
  await expect(target.locator('[data-endgame-speed]')).toHaveText('120');
  await expect(target.locator('[data-endgame-hp-shared]')).toHaveCount(0);
});
