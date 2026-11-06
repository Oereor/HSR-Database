import { setSliderValue } from '../helpers/slider';
import { expect, test } from '@playwright/test';
const ready = (page: import('@playwright/test').Page) =>
  expect(page.locator('#training')).toHaveAttribute('data-training-state', 'ready');

for (const prefix of ['', '/en']) {
  test(`static stats and costs agree at promotion boundaries; cone rank remains independent (${prefix || 'zh-CN'})`, async ({
    page
  }) => {
    for (const [category, id] of [['light-cones', '20000']]) {
      await page.goto(`${prefix}/${category}/${id}/`);
      await ready(page);
      const slider = page.locator(
        category === 'characters' ? '#character-level-1001' : '#light-cone-level-20000'
      );
      const target = page.locator(
        category === 'characters'
          ? '#training-character-level-1001'
          : '#training-light-cone-level-20000'
      );
      const heroTag = page.locator(
        '.base-stats-panel .skill-level-control__value .skill-effect-tag'
      );
      const targetTag = page.locator(
        '[data-training-target] > .skill-level-control .skill-effect-tag'
      );
      await expect(slider).toHaveAttribute('data-value', '80');
      await expect(heroTag).toBeVisible();
      await expect(heroTag).toHaveText(await targetTag.innerText());
      for (const [boundary, promotion] of [
        [20, 0],
        [30, 1],
        [40, 2],
        [50, 3],
        [60, 4],
        [70, 5]
      ]) {
        await setSliderValue(slider, String(boundary));
        await expect(page.locator('[data-training-promotion]')).toHaveAttribute(
          'data-training-promotion',
          String(promotion)
        );
        await expect(target).toHaveAttribute('data-value', String(boundary));
        await expect(heroTag).toHaveText(await targetTag.innerText());
        const tagAtBoundary = await heroTag.innerText();
        const hp = await page.locator('[data-base-stat="hp"] dd').textContent();
        await slider.focus();
        await page.keyboard.press('ArrowRight');
        await expect(slider).toHaveAttribute('data-value', String(boundary + 1));
        await expect(target).toHaveAttribute('data-value', String(boundary + 1));
        await expect(page.locator('[data-training-promotion]')).toHaveAttribute(
          'data-training-promotion',
          String(promotion + 1)
        );
        await expect(heroTag).not.toHaveText(tagAtBoundary);
        await expect(heroTag).toHaveText(await targetTag.innerText());
        await expect(slider).toBeFocused();
        await expect(page.locator('[data-base-stat="hp"] dd')).not.toHaveText(hp!);
      }
      await target.focus();
      await page.keyboard.press('Home');
      await expect(slider).toHaveAttribute('data-value', '1');
      await expect(heroTag).toHaveText(await targetTag.innerText());
      await page.keyboard.press('End');
      await expect(slider).toHaveAttribute('data-value', '80');
      await expect(heroTag).toHaveText(await targetTag.innerText());
    }
    await page.goto(`${prefix}/light-cones/20000/?level=37&rank=3`);
    await ready(page);
    expect(
      await page
        .locator('.section-nav a')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
    ).toEqual(['#stats', '#training', '#story']);
    await expect(page.locator('[data-training-level]')).toHaveAttribute(
      'data-training-level',
      '37'
    );
    await expect(page.locator('#training-light-cone-level-20000')).toHaveAttribute(
      'data-value',
      '37'
    );
    await expect(
      page.locator('#training [data-training-skill], #training .training-traces')
    ).toHaveCount(0);
    expect(
      await page
        .locator('#training [data-training-expense]')
        .evaluateAll((groups) => groups.map((group) => group.getAttribute('data-training-expense')))
    ).toEqual(['upgrade', 'promotion', 'total']);
    const total = await page.locator('#training [data-training-expense="total"]').textContent();
    await setSliderValue(page.locator('#superimposition-level-20000'), '4');
    await expect(page.locator('#training [data-training-expense="total"]')).toHaveText(total!);
    await setSliderValue(page.locator('#training-light-cone-level-20000'), '80');
    await expect(page.locator('#light-cone-level-20000')).toHaveAttribute('data-value', '80');
    await expect(
      page.locator('#training [data-training-expense="total"] [data-material-id="2"]')
    ).toHaveAttribute('data-material-count', '529750');
    await setSliderValue(page.locator('#light-cone-level-20000'), '1');
    await expect(page.locator('#training-light-cone-level-20000')).toHaveAttribute(
      'data-value',
      '1'
    );
    await expect(page.locator('#training [data-material-id]')).toHaveCount(0);
  });
}

for (const prefix of ['', '/en']) {
  test('character previews need no training shards ' + prefix, async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => {
      if (/\/generated\/(training\/|(?:zh-CN|en)\/materials)/.test(r.url())) requests.push(r.url());
    });
    await page.goto(prefix + '/characters/1510/');
    await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
    await expect(page.locator('#training, .trace-toggle, a[href="#training"]')).toHaveCount(0);
    const groups = page.locator('#skills [data-preview-key="1510004"]');
    await expect(groups).toHaveCount(2);
    const sliders = groups.getByRole('slider');
    const before = await page
      .locator('[data-skill-category="talent"] .levelled-description')
      .allTextContents();
    await setSliderValue(sliders.first(), '0');
    await expect(sliders.last()).toHaveAttribute('aria-valuenow', '1');
    expect(
      await page.locator('[data-skill-category="talent"] .levelled-description').allTextContents()
    ).not.toEqual(before);
    await setSliderValue(page.locator('#character-level-1510'), '1');
    await expect(sliders.first()).toHaveAttribute('aria-valuenow', '1');
    expect(requests).toEqual([]);
  });
}
