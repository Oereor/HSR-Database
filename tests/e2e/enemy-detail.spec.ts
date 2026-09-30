import { expect, test } from '@playwright/test';

test('Enemy Detail 中英文直达均恢复 compact stats', async ({ page }) => {
  for (const detailPath of ['/enemies/8034010/', '/en/enemies/8034010/'] as const) {
    await page.goto(detailPath);
    await expect(page).toHaveURL(new RegExp(`${detailPath}$`));
    await expect(page.getByRole('slider')).toHaveValue('95');
    await expect(page.locator('[data-enemy-stat]')).toHaveCount(7);
    await expect(page.locator('[data-enemy-stat="hp"]')).toContainText('657,149');
  }
});

test('Enemy Detail Hero 复用统一分栏并仅展示 Template 基础数据', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/enemies/1004014/');

  const backLink = page.locator('a[href="/enemies/"]').first();
  await expect(backLink).toHaveAttribute('href', '/enemies/');
  const hero = page.locator('[data-enemy-hero]');
  await expect(hero).toBeVisible();
  await expect(hero.locator('.kicker')).toContainText('1004014');
  await expect(hero.locator('.enemy-template-stats-panel h2')).toBeVisible();
  await expect(hero.getByRole('slider')).toHaveCount(0);
  await expect(page.locator('#enemy-level-1004014')).toHaveCount(1);
  const stats = hero.locator('[data-enemy-template-stat]');
  await expect(stats).toHaveCount(8);
  await expect(hero.locator('dl.inspection-stat-list')).toHaveCount(1);
  await expect(hero.locator('.inspection-stat-row')).toHaveCount(8);
  expect(
    await stats.evaluateAll((rows) =>
      Object.fromEntries(
        rows.map((row) => [
          row.getAttribute('data-enemy-template-stat'),
          row.querySelector('dd')?.textContent?.trim()
        ])
      )
    )
  ).toEqual({
    hp: '5,813',
    attack: '18',
    defence: '210',
    speed: '130',
    toughness: '100',
    'critical-damage': '20%',
    'effect-resistance': '30%',
    'initial-action-value': '20%'
  });
  await expect(hero.locator('[data-enemy-portrait]')).toHaveAttribute(
    'data-artwork-fit',
    'contain'
  );
  await expect(hero.locator('[data-enemy-portrait] img')).toHaveCSS('object-fit', 'contain');
});

test('Enemy Detail Hero 本地化 raw rank 而不泄露内部值', async ({ page }) => {
  for (const [id, raw] of [
    ['1002011', 'MinionLv2'],
    ['1003012', 'Elite'],
    ['1004014', 'LittleBoss']
  ]) {
    await page.goto(`/enemies/${id}/`);
    const hero = page.locator('[data-enemy-hero]');
    const rank = hero.locator('.enemy-rank-tag');
    await expect(rank).not.toHaveText('');
    await expect(hero.locator('[data-icon-presentation="path-identity"]')).toHaveCount(0);
    await expect(hero).not.toContainText(raw);
  }
});

test('Enemy Detail Hero 对缺失 Template 字段保留固定行', async ({ page }) => {
  await page.goto('/enemies/3004010/');
  const missingValue = page.locator('[data-enemy-template-stat="speed"] dd');
  await expect(missingValue).not.toHaveText('');
  await expect(page.locator('[data-enemy-template-stat="toughness"] dd')).toHaveText(
    (await missingValue.textContent())!
  );

  await page.goto('/enemies/1005010/');
  await expect(page.locator('[data-enemy-template-stat="effect-resistance"] dd')).not.toHaveText(
    ''
  );
  await expect(page.locator('[data-enemy-template-stat]')).toHaveCount(8);

  await page.goto('/enemies/3002040/');
  await expect(page.locator('[data-enemy-template-stat="initial-action-value"] dd')).not.toHaveText(
    ''
  );
});

test('Enemy Detail 将首回合行动值比例格式化为百分比', async ({ page }) => {
  await page.goto('/enemies/1002011/');
  await expect(page.locator('[data-enemy-template-stat="initial-action-value"]')).toContainText(
    '100%'
  );

  await page.goto('/enemies/4014022/');
  await expect(page.locator('[data-enemy-template-stat="initial-action-value"]')).toContainText(
    '50%'
  );
});

test('Enemy Detail 默认选择 canonical Monster，切换 concrete Monster 时共享等级不重置', async ({
  page
}) => {
  await page.goto('/enemies/1002015/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const options = page.locator('[data-monster-option]');
  await expect(options).toHaveCount(11);
  const canonical = page.locator('[data-monster-option="1002015"]');
  const quantumVariant = page.locator('[data-monster-option="100201506"]');
  await expect(canonical).toHaveAttribute('aria-checked', 'true');

  const slider = page.locator('#enemy-level-1002015');
  await expect(slider).toHaveValue('95');
  await slider.fill('60');
  const canonicalHp = await page.locator('[data-enemy-stat="hp"] strong').textContent();
  await quantumVariant.click();
  await expect(quantumVariant).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.enemy-selected-monster-heading')).toContainText('#100201506');
  await expect(slider).toHaveValue('60');
  await expect(page.locator('[data-enemy-stat="hp"] strong')).not.toHaveText(canonicalHp ?? '');

  const weaknesses = page.locator(
    '.enemy-battle-column--attributes .enemy-weakness-list [data-icon-kind="element"]'
  );
  expect((await weaknesses.allTextContents()).map((text) => text.trim())).toEqual(['火', '量子']);

  await quantumVariant.focus();
  await page.keyboard.press('Home');
  await expect(canonical).toBeFocused();
  await expect(canonical).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(options.nth(1)).toBeFocused();
  await expect(options.nth(1)).toHaveAttribute('aria-checked', 'true');
});

test('单 Monster 页面省略 selector，仍展示共享等级与七项实际属性', async ({ page }) => {
  await page.goto('/enemies/1004011/');
  await expect(page.locator('[data-monster-option]')).toHaveCount(0);
  await expect(page.locator('.enemy-selected-monster-heading')).toContainText('#1004011');
  await expect(page.locator('[data-enemy-stat]')).toHaveCount(7);
  await expect(page.locator('#enemy-level-1004011')).toHaveValue('95');
  await expect(page.locator('.enemy-stats-panel table')).toHaveCount(0);
  await expect(page.locator('.enemy-stats-list')).toHaveAttribute('aria-label', /\S/);
});

test('战斗面板按 selected Monster 的负面抵抗自动切换三栏与两栏', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/enemies/8034010/');
  const threeColumnPanel = page.locator('.enemy-battle-panel');
  await expect(threeColumnPanel).toHaveAttribute('data-battle-columns', '3');
  await expect(page.locator('[data-enemy-stat]')).toHaveCount(7);
  await expect(page.locator('[data-enemy-stat="hp"]')).toContainText('657,149');
  await expect(page.locator('[data-enemy-stat="effect-hit"]')).toContainText('36%');
  await expect(page.locator('[data-enemy-stat="effect-resistance"]')).toContainText('40%');
  await expect(page.locator('[data-enemy-resistance]')).toHaveCount(3);
  await expect(page.locator('[data-enemy-resistance="Imaginary"]')).toContainText('40%');
  await expect(page.locator('[data-special-resistance="STAT_CTRL"]')).toContainText('控制抵抗50%');
  await page.goto('/enemies/4034013/');
  await expect(page.locator('[data-special-resistance="STAT_CTRL_Frozen"]')).toContainText(
    '冻结抵抗75%'
  );
  await expect(page.locator('[data-special-resistance="STAT_Confine"]')).toContainText(
    '禁锢抵抗75%'
  );
  await expect(page.locator('[data-special-resistance="STAT_Entangle"]')).toContainText(
    '纠缠抵抗75%'
  );

  await page.goto('/enemies/3002011/');
  const twoColumnPanel = page.locator('.enemy-battle-panel');
  await expect(twoColumnPanel).toHaveAttribute('data-battle-columns', '2');
});

test('召唤单位严格随 selected Monster 切换，并使用解析后的 Template route', async ({ page }) => {
  await page.goto('/enemies/1003010/');
  await expect(page.locator('[data-summon-template="1002040"]')).toHaveCount(1);
  await expect(page.locator('[data-summon-template="1002050"]')).toHaveCount(0);

  await page.locator('[data-monster-option="100301004"]').click();
  await expect(page.locator('[data-summon-template="1002040"]')).toHaveAttribute(
    'href',
    '/enemies/1002040/'
  );
  await expect(page.locator('[data-summon-template="1002050"]')).toHaveAttribute(
    'href',
    '/enemies/1002050/'
  );
  await expect(page.locator('[data-summon-monster]')).toHaveCount(2);
  const summon = page.locator('[data-summon-template="1002050"]');
  await expect(summon.locator('.compact-entity-card__tertiary')).toHaveCount(1);
  await expect(summon.locator('.enemy-weakness-group')).toHaveCount(1);
  await expect(summon).not.toContainText(/Monster #/);
  await summon.click();
  await expect(page).toHaveURL(/\/enemies\/1002050\/$/);
  await expect(page.locator('.enemy-selected-monster-heading')).toContainText('#1002050');
});

test('Skill Browser 保留阶段筛选、技能顺序与本地选择状态', async ({ page }) => {
  await page.goto('/enemies/8034010/');
  const tabs = page.locator('.enemy-phase-tabs');
  await expect(tabs.getByRole('tab')).toHaveCount(2);
  const phase1 = tabs.getByRole('tab').nth(0);
  const phase2 = tabs.getByRole('tab').nth(1);
  await expect(phase1).toHaveAttribute('aria-selected', 'true');
  const selector = page.locator('[data-enemy-skill-selector]');
  await expect(selector.locator('button').first()).toHaveAttribute(
    'data-enemy-skill-option',
    '803401001'
  );
  await expect(page.locator('[data-enemy-skill-detail="803401001"]')).toBeVisible();
  const sharedOption = selector.locator('[data-enemy-skill-option="803401002"]');
  await expect(sharedOption.locator('[data-icon-kind="element"]')).toHaveCount(1);
  await sharedOption.scrollIntoViewIfNeeded();
  const scrollBeforeSelection = await page.evaluate(() => window.scrollY);
  await sharedOption.click();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeSelection);
  await expect(sharedOption).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-enemy-skill-detail="803401002"]')).toBeVisible();
  await expect(page).not.toHaveURL(/#enemy-skill-/);
  await expect(sharedOption).toBeFocused();
  await page.keyboard.press('Tab');
  const nextOption = selector.locator('[data-enemy-skill-option="803401003"]');
  await expect(nextOption).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(nextOption).toHaveAttribute('aria-pressed', 'true');
  await sharedOption.click();
  await phase2.click();
  await expect(sharedOption).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-enemy-skill-detail="803401002"]')).toBeVisible();
  await expect(selector.locator('[data-enemy-skill-option="803401004"]')).toHaveCount(0);
  await phase1.click();
  await selector.locator('[data-enemy-skill-option="803401004"]').click();
  await phase1.focus();
  await page.keyboard.press('ArrowRight');
  await expect(phase2).toBeFocused();
  await expect(selector.locator('[data-enemy-skill-option="803401001"]')).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  await page.goto('/enemies/4034013/');
  const noDamageOption = page.locator('[data-enemy-skill-option="403401302"]');
  await expect(noDamageOption).toBeVisible();
  await expect(noDamageOption.locator('.enemy-skill-selector__icon')).toHaveCount(1);
  await expect(noDamageOption.locator('[data-icon-kind="element"]')).toHaveCount(0);
});

test('同一技能跨 Monster 保持选择并更新有效倍率', async ({ page }) => {
  await page.goto('/enemies/4035010/');
  const selected = page.locator('[data-enemy-skill-detail="403501001"]');
  await expect(selected.locator('[data-damage-target="primary"]')).toContainText('450%');
  await page.locator('[data-monster-option="403501001"]').click();
  await expect(page.locator('[data-enemy-skill-option="403501001"]')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(selected.locator('[data-damage-target="primary"]')).toContainText('400%');
  await expect(page.locator('[data-enemy-skill-detail]')).toHaveCount(1);
});

test('选中技能保留 ExtraEffect disclosure，缺失详情不出现空事实区', async ({ page }) => {
  await page.goto('/enemies/1004014/');
  await page.locator('[data-enemy-skill-option="100401411"]').click();
  const skill = page.locator('[data-enemy-skill-detail="100401411"]');
  await expect(page.locator('[data-enemy-skill-option="100401414"]')).toHaveCount(0);
  await expect(skill.locator('[data-skill-effect]')).toHaveCount(1);
  await expect(skill.locator('[data-enemy-skill-facts]')).toHaveCount(0);
  const details = skill.locator('details');
  await expect(details).not.toHaveAttribute('open', '');
  await details.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await expect(details.locator('[data-extra-effect="70000304"]')).toHaveCount(1);
});

test('Skill Browser 显示已有的数值伤害、概率和行动变化', async ({ page }) => {
  await page.goto('/enemies/1002030/');
  const damage = page.locator('[data-enemy-skill-detail="100203001"]');
  await expect(damage.locator('[data-damage-target="primary"]')).toContainText('130%');
  await expect(damage.locator('[data-damage-target="adjacent"]')).toContainText('100%');

  await page.goto('/enemies/1022010/');
  await expect(page.locator('[data-damage-target="primary"]')).toContainText('300%');
  await expect(page.locator('[data-action-shift="delay"]')).toContainText('50%');

  await page.goto('/enemies/2004010/');
  await page.locator('[data-enemy-skill-option="200401001"]').click();
  await expect(
    page.locator('[data-enemy-skill-detail="200401001"] [data-base-chance]')
  ).toContainText('100%');
  await expect(
    page.locator('[data-enemy-skill-detail="200401001"] [data-enemy-skill-damage]')
  ).toContainText('250%');
  await page.locator('[data-enemy-skill-option="200401002"]').click();
  await expect(page.locator('[data-damage-target="primary"]')).toContainText('900%');
  await expect(page.locator('[data-damage-target="adjacent"]')).toContainText('200%');
  await page.locator('[data-enemy-skill-option="200401004"]').click();
  await expect(page.locator('[data-base-chance]')).toContainText('120%');
  await expect(page.locator('[data-action-shift="advance"]')).toContainText('100%');

  await page.goto('/enemies/3003051/');
  const statuses = page.locator('[data-enemy-skill-detail="300305101"]');
  await expect(statuses.locator('[data-status-id]')).toHaveCount(0);
  await expect(statuses.locator('[data-base-chance]')).toHaveCount(1);
  await expect(statuses.locator('[data-base-chance]').first()).toContainText('100%');
  await page.locator('[data-enemy-skill-option="300305105"]').click();
  await expect(page.locator('[data-enemy-skill-facts]')).toHaveCount(0);
});

test('Skill Browser 展示独立候选并省略无标签组的目标说明', async ({ page }) => {
  for (const prefix of ['', '/en']) {
    await page.goto(`${prefix}/enemies/4014018/`);
    await page.locator('[data-enemy-skill-option="401401803"]').click();
    await expect(page.locator('[data-enemy-skill-damage]')).toContainText('180% / 360%');
    await page.locator('.enemy-phase-tabs').getByRole('tab').nth(1).click();
    await page.locator('[data-enemy-skill-option="401401802"]').click();
    const row = page.locator('[data-enemy-skill-damage] .enemy-skill-fact-row');
    await expect(row).toHaveCount(1);
    await expect(row.locator('span')).toHaveCount(0);
    await expect(row.locator('strong')).toContainText('90% / 110% / 180% / 220%');
    const gridLeft = await row
      .locator('..')
      .evaluate((element) => element.getBoundingClientRect().left);
    const valueLeft = await row
      .locator('strong')
      .evaluate((element) => element.getBoundingClientRect().left);
    expect(Math.abs(valueLeft - gridLeft)).toBeLessThanOrEqual(1);
  }
  await page.goto('/enemies/4064012/');
  await page.locator('[data-enemy-skill-option="406401204"]').click();
  await expect(page.locator('[data-enemy-skill-damage]')).toContainText('600% / 4,200%');
  await page.locator('[data-enemy-skill-option="406401205"]').click();
  await expect(page.locator('[data-damage-target="all"]')).toContainText('1,050%');
});

test('Skill Browser 紧凑数值列、图标槽和长文本在双语不同宽度下安全布局', async ({ page }) => {
  test.setTimeout(60_000);
  for (const prefix of ['', '/en']) {
    for (const width of [1440, 900, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${prefix}/enemies/2004010/`);
      const selector = page.locator('[data-enemy-skill-selector]');
      const options = selector.locator('button');
      const names = await options
        .locator('strong')
        .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().left));
      expect(Math.max(...names) - Math.min(...names)).toBeLessThanOrEqual(1);
      for (const option of await options.all()) {
        await expect(option.locator('.enemy-skill-selector__icon')).toHaveCount(1);
        await expect(option).toHaveAccessibleName(
          (await option.locator('strong').innerText()).trim()
        );
      }
      const chanceOption = selector.locator('[data-enemy-skill-option="200401004"]');
      await chanceOption.focus();
      await page.keyboard.press('Enter');
      await expect(chanceOption).toHaveAttribute('aria-pressed', 'true');
      await expect(chanceOption).toBeFocused();

      await selector.locator('[data-enemy-skill-option="200401002"]').click();
      const detail = page.locator('[data-enemy-skill-detail="200401002"]');
      const metadata = detail.locator('header .enemy-skill-detail__metadata');
      await expect(metadata.locator('[data-icon-kind="element"]')).toHaveCount(1);
      await expect(metadata.locator('[data-skill-effect]')).toHaveCount(1);
      expect(
        await metadata.evaluate((element) => {
          const icon = element.querySelector('[data-icon-kind="element"]')!;
          const tag = element.querySelector('[data-skill-effect]')!;
          return !!(icon.compareDocumentPosition(tag) & Node.DOCUMENT_POSITION_FOLLOWING);
        })
      ).toBe(true);
      const damage = detail.locator('[data-enemy-skill-damage]');
      await expect(damage.locator('h5')).toHaveCount(1);
      const grid = damage.locator('.enemy-skill-fact-grid');
      const gridBox = (await grid.boundingBox())!;
      const gridLimit = await grid.evaluate(
        () => 34 * parseFloat(getComputedStyle(document.documentElement).fontSize)
      );
      expect(gridBox.width).toBeLessThanOrEqual(gridLimit + 1);
      const primary = damage.locator('[data-damage-target="primary"]');
      // Read geometry together so scroll anchoring during panel replacement cannot skew y values.
      const geometry = await grid.evaluate((element) => {
        const primaryRow = element.querySelector('[data-damage-target="primary"]')!;
        return {
          qualifier: primaryRow.querySelector('span')!.getBoundingClientRect().toJSON(),
          primary: primaryRow.querySelector('strong')!.getBoundingClientRect().toJSON(),
          adjacent: element
            .querySelector('[data-damage-target="adjacent"] strong')!
            .getBoundingClientRect()
            .toJSON(),
          gap: parseFloat(getComputedStyle(element).columnGap)
        };
      });
      expect(Math.abs(geometry.primary.x - geometry.adjacent.x)).toBeLessThanOrEqual(1);
      if (width > 520) {
        const gap = geometry.primary.x - geometry.qualifier.right;
        expect(gap).toBeGreaterThan(0);
        expect(gap).toBeLessThanOrEqual(geometry.gap + 1);
      } else {
        expect(geometry.primary.y).toBeGreaterThanOrEqual(geometry.qualifier.bottom);
      }

      // Stress the real layout with extended existing text, without changing production fixtures.
      await selector.locator('strong').evaluateAll((elements) => {
        for (const element of elements) element.textContent = element.textContent!.repeat(5);
      });
      await detail.locator('h3').evaluate((element) => {
        element.textContent = element.textContent!.repeat(8);
      });
      await primary.locator('span').evaluate((element) => {
        element.textContent = element.textContent!.repeat(12);
      });
      await primary.locator('strong').evaluate((element) => {
        element.textContent = Array(12).fill(element.textContent).join(' / ');
      });
      for (const element of [
        selector,
        detail,
        grid,
        primary.locator('span'),
        primary.locator('strong')
      ]) {
        expect(
          await element.evaluate((node) => node.scrollWidth - node.clientWidth)
        ).toBeLessThanOrEqual(1);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        )
      ).toBeLessThanOrEqual(1);
      if (width > 520)
        expect((await primary.locator('span').boundingBox())!.width).toBeLessThanOrEqual(
          (gridLimit * 10) / 34 + 1
        );
    }
  }
});

test('Enemy Detail 在桌面、中宽和手机布局下无页面级横向溢出', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 900, height: 900 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/enemies/8034010/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
    const selector = page.locator('.enemy-monster-selector');
    await expect(selector).toBeVisible();
    await expect(selector).toHaveCSS('overflow-x', 'auto');
    if (viewport.width <= 900)
      expect(await selector.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
        true
      );
    await expect(page.locator('[data-enemy-portrait]')).toBeVisible();
    const browserGrid = page.locator('.enemy-skill-browser__grid');
    await expect(browserGrid).toBeVisible();
    const columns = await browserGrid.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length
    );
    expect(columns).toBe(viewport.width <= 820 ? 1 : 2);
  }

  await page.goto('/enemies/8003060/');
  await expect(page.locator('[data-enemy-portrait]')).toHaveAttribute(
    'data-artwork-available',
    'false'
  );
  await expect(page.locator('[data-enemy-portrait] img')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
