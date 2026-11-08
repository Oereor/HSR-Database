import { setSliderValue } from '../helpers/slider';
import { expect, test, type Page } from '@playwright/test';
const ready = (page: Page) =>
  expect(page.locator('#training')).toHaveAttribute('data-training-state', 'ready');
const materials = (page: Page) =>
  page
    .locator('#training [data-training-expense="total"] [data-material-id]')
    .evaluateAll((items) =>
      items.map((item) => [
        item.getAttribute('data-material-id'),
        item.getAttribute('data-material-count')
      ])
    );

for (const prefix of ['', '/en']) {
  test(`static stats and costs agree at promotion boundaries; cone rank remains independent (${prefix || 'zh-CN'})`, async ({
    page
  }) => {
    await page.goto(`${prefix}/light-cones/20000/`);
    await ready(page);
    const slider = page.locator('#light-cone-level-20000');
    const receipt = page.locator('#training [data-training-level]');
    const heroTag = page.locator('.base-stats-panel .skill-level-control__value .skill-effect-tag');
    await expect(page.locator('#training [data-training-target]')).toHaveCount(0);
    await expect(page.locator('#training').getByRole('slider')).toHaveCount(0);
    await expect(slider).toHaveAttribute('data-value', '80');
    await expect(heroTag).toBeVisible();
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
      await expect(receipt).toHaveAttribute('data-training-level', String(boundary));
      const tagAtBoundary = await heroTag.innerText();
      const hp = await page.locator('[data-base-stat="hp"] dd').textContent();
      await slider.focus();
      await page.keyboard.press('ArrowRight');
      await expect(slider).toHaveAttribute('data-value', String(boundary + 1));
      await expect(receipt).toHaveAttribute('data-training-level', String(boundary + 1));
      await expect(page.locator('[data-training-promotion]')).toHaveAttribute(
        'data-training-promotion',
        String(promotion + 1)
      );
      await expect(heroTag).not.toHaveText(tagAtBoundary);
      await expect(slider).toBeFocused();
      await expect(page.locator('[data-base-stat="hp"] dd')).not.toHaveText(hp!);
    }
    await slider.focus();
    await page.keyboard.press('Home');
    await expect(receipt).toHaveAttribute('data-training-level', '1');
    await page.keyboard.press('End');
    await expect(receipt).toHaveAttribute('data-training-level', '80');
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
    await expect(slider).toHaveAttribute('data-value', '37');
    await expect(
      page.locator('#training [data-training-skill], #training [data-training-tree]')
    ).toHaveCount(0);
    expect(
      await page
        .locator('#training [data-training-expense]')
        .evaluateAll((groups) => groups.map((group) => group.getAttribute('data-training-expense')))
    ).toEqual(['upgrade', 'promotion', 'total']);
    const total = await page.locator('#training [data-training-expense="total"]').textContent();
    await setSliderValue(page.locator('#superimposition-level-20000'), '4');
    await expect(page.locator('#training [data-training-expense="total"]')).toHaveText(total!);
    await setSliderValue(slider, '80');
    await expect(page.locator('#light-cone-level-20000')).toHaveAttribute('data-value', '80');
    await expect(
      page.locator('#training [data-training-expense="total"] [data-material-id="2"]')
    ).toHaveAttribute('data-material-count', '529750');
    await setSliderValue(page.locator('#light-cone-level-20000'), '1');
    await expect(receipt).toHaveAttribute('data-training-level', '1');
    await expect(page.locator('#training [data-material-id]')).toHaveCount(0);
  });
}

for (const prefix of ['', '/en']) {
  test(
    'character previews and the shared training target remain independent ' + prefix,
    async ({ page }) => {
      await page.goto(prefix + '/characters/1510/');
      await ready(page);
      await expect(page.locator('.section-nav a[href="#training"]')).toHaveCount(1);
      await expect(page.locator('#traces .trace-toggle')).toHaveCount(0);
      const groups = page.locator('#skills [data-preview-key="1510004"]');
      await expect(groups).toHaveCount(2);
      const sliders = groups.getByRole('slider');
      const target = page.locator('[data-training-skill="1510:0:1510004"]');
      await expect(target).toHaveCount(1);
      const fullCost = await materials(page);
      const initialTargetLevel = (await target.getAttribute('data-training-level'))!;
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
      await expect(target).toHaveAttribute('data-training-level', initialTargetLevel);
      expect(await materials(page)).toEqual(fullCost);

      await target.getByRole('slider').press('Home');
      await expect(target).toHaveAttribute('data-training-level', '1');
      await expect.poll(() => materials(page)).not.toEqual(fullCost);
      await expect(sliders.last()).toHaveAttribute('aria-valuenow', '1');
      await expect(page.locator('#training-character-level-1510')).toHaveAttribute(
        'data-value',
        '80'
      );
    }
  );
}

test('trace buttons preserve branch dependencies and update the character receipt', async ({
  page
}) => {
  await page.goto('/characters/1001/');
  await ready(page);
  const tree = page.locator('[data-training-tree="preservation"]');
  const node = (id: string) => tree.locator(`[data-point-id="${id}"]`);
  const lines = tree.locator('svg.tree-connections');
  await expect(lines).toBeVisible();
  await expect(lines.locator('circle')).toHaveCount(0);
  await expect(lines).toHaveCSS('pointer-events', 'none');
  const paths = () =>
    lines.locator('path').evaluateAll((elements) => elements.map((path) => path.getAttribute('d')));
  const initialPaths = await paths();
  expect(initialPaths.length).toBeGreaterThan(0);
  const fullCost = await materials(page);
  const skill = node('1001001');
  await expect(skill).toHaveRole('img');
  await expect(skill).not.toHaveAttribute('aria-pressed');
  await expect(skill.locator('img')).toHaveAttribute('src', /character-details\/icons\/skill\//);

  await node('1001201').press('Space');
  for (const id of ['1001201', '1001101', '1001203', '1001102', '1001206'])
    await expect(node(id)).toHaveAttribute('aria-pressed', 'false');
  await expect(node('1001209')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => materials(page)).not.toEqual(fullCost);
  expect(await paths()).toEqual(initialPaths);

  await node('1001203').click();
  for (const id of ['1001201', '1001101', '1001202', '1001203'])
    await expect(node(id)).toHaveAttribute('aria-pressed', 'true');
  await expect(node('1001102')).toHaveAttribute('aria-pressed', 'false');
  await node('1001206').click();
  await expect.poll(() => materials(page)).toEqual(fullCost);

  const level = page.locator('#training-character-level-1001');
  await level.press('Home');
  await expect(level).toHaveAttribute('data-value', '1');
  await expect(page.locator('#character-level-1001')).toHaveAttribute('data-value', '80');
  await expect(page.locator('[data-training-skill="1001:0:1001001"]')).toHaveAttribute(
    'data-training-level',
    '1'
  );
  await expect(node('1001203')).toHaveAttribute('aria-pressed', 'false');
  await node('1001201').click();
  const emptyCost = await materials(page);
  await node('1001203').click();
  await expect(node('1001201')).toHaveAttribute('aria-pressed', 'false');
  await expect(node('1001203')).toHaveAttribute('aria-pressed', 'false');
  expect(await materials(page)).toEqual(emptyCost);

  await level.press('End');
  const credit = page.locator(
    '#training [data-training-expense="total"] [data-material-id="2"] button'
  );
  await credit.click();
  await expect(page.locator('.item-detail-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(credit).toBeFocused();

  const background = tree.locator('img.tree-path');
  await expect(background).toHaveAttribute('src', '/generated-assets/paths/large/Knight.png');
  await expect
    .poll(() => background.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBe(512);
  await expect(tree).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  for (const [anchor, iconRatio] of [
    ['Point01', 0.66],
    ['Point06', 0.84],
    ['Point09', 0.84]
  ] as const) {
    const slot = tree.locator(`[data-anchor="${anchor}"]`);
    const circle = (await slot.boundingBox())!;
    const icon = (await slot.locator('img').boundingBox())!;
    expect(Math.abs(icon.width - iconRatio * circle.width)).toBeLessThan(1);
  }

  const bounds = async () => {
    const { canvas, settings, sliders, pathIcon } = await tree.evaluate((element) => {
      const rect = (target: Element) => {
        const { x, y, width, height } = target.getBoundingClientRect();
        return { x, y, width, height };
      };
      const settings = element.closest('.training-target__settings.with-tree')!;
      return {
        canvas: rect(element),
        settings: rect(settings),
        sliders: rect(settings.querySelector('.training-target__skills')!),
        pathIcon: rect(element.querySelector('img.tree-path')!)
      };
    });
    expect(Math.abs(canvas.width - canvas.height)).toBeLessThan(1);
    expect(Math.abs(pathIcon.x + pathIcon.width / 2 - canvas.x - canvas.width / 2)).toBeLessThan(1);
    expect(Math.abs(pathIcon.y + pathIcon.height / 2 - canvas.y - canvas.height / 2)).toBeLessThan(
      1
    );
    return { canvas, settings, sliders, pathIcon };
  };

  const checkStacked = async () => {
    const { canvas, settings, sliders, pathIcon } = await bounds();
    expect(canvas.y).toBeGreaterThanOrEqual(sliders.y + sliders.height);
    expect(Math.abs(canvas.x + canvas.width / 2 - settings.x - settings.width / 2)).toBeLessThan(1);
    const oldWidth = Math.min(settings.width, 39 * 16);
    expect(canvas.width).toBeLessThan(oldWidth);
    expect(Math.abs(pathIcon.width - 0.64 * oldWidth)).toBeLessThan(1);
  };

  if (page.viewportSize()!.width < 768) {
    await checkStacked();
  } else {
    const { canvas, settings, sliders, pathIcon } = await bounds();
    expect(Math.abs(canvas.x + canvas.width - settings.x - settings.width)).toBeLessThan(1);
    expect(Math.abs(sliders.x - settings.x)).toBeLessThan(1);
    const gap = await page
      .locator('.training-target__settings.with-tree')
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).columnGap));
    expect(Math.abs(canvas.x - sliders.x - sliders.width - gap)).toBeLessThan(1);
    const oldWidth = Math.min(39 * 16, (settings.width + 20 * 16 - gap) / 2);
    expect(Math.abs(pathIcon.width - 0.64 * oldWidth)).toBeLessThan(1);
    await page.setViewportSize({ width: 900, height: page.viewportSize()!.height });
    await checkStacked();
  }
});

test('trace level gates apply within the same ascension and leave blocked costs unchanged', async ({
  page
}) => {
  await page.goto('/characters/1001/');
  await ready(page);
  const level = page.locator('#training-character-level-1001');
  const training = page.locator('[data-training-promotion]');
  const lv75 = page.locator('[data-training-tree] [data-point-id="1001209"]');
  const lv80 = page.locator('[data-training-tree] [data-point-id="1001210"]');

  await setSliderValue(level, '70');
  await expect(training).toHaveAttribute('data-training-promotion', '5');
  await setSliderValue(level, '75');
  await expect(training).toHaveAttribute('data-training-promotion', '6');
  await expect(lv75).toHaveAttribute('aria-pressed', 'false');
  await expect(lv75).toHaveAccessibleDescription(/75/);
  await lv75.press('Space');
  await expect(lv75).toHaveAttribute('aria-pressed', 'true');
  const before = await materials(page);
  await lv80.click();
  await expect(lv80).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-sonner-toast] [data-description]')).toContainText(/80/);
  expect(await materials(page)).toEqual(before);

  await setSliderValue(level, '74');
  await expect(training).toHaveAttribute('data-training-promotion', '6');
  await expect(lv75).toHaveAttribute('aria-pressed', 'false');
});

test('changing enhanced form keeps the character level and replaces the trace profile', async ({
  page
}) => {
  await page.goto('/characters/1102/');
  await ready(page);
  const tree = page.locator('[data-training-tree]');
  const level = page.locator('#training-character-level-1102');
  await expect(tree).toHaveAttribute('data-training-profile', '1');
  await setSliderValue(level, '70');
  await tree.locator('[data-point-id="11102101"]').click();
  await page.locator('.enhancement-switch').click();
  await expect(tree).toHaveAttribute('data-training-profile', '0');
  await expect(level).toHaveAttribute('data-value', '70');
  await expect(tree.locator('[data-point-id="1102101"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(tree.locator('[data-point-id="11102101"]')).toHaveCount(0);
});
