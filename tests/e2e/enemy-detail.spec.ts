import { setSliderValue } from '../helpers/slider';
import { expect, test, type Page } from '@playwright/test';

async function selectMonster(page: Page, id: string) {
  await expect(page.locator('[data-app-ready="true"]')).toBeAttached();
  await page.locator('[data-monster-trigger]').click();
  await page.getByRole('dialog').getByRole('combobox').fill(id);
  await page.locator(`[data-monster-option="${id}"]`).click();
  await expect(page.locator('[data-selected-monster]')).toHaveAttribute(
    'data-selected-monster',
    id
  );
}

test('Enemy Detail 中英文直达均恢复 compact stats', async ({ page }) => {
  for (const detailPath of ['/enemies/8034010/', '/en/enemies/8034010/'] as const) {
    await page.goto(detailPath);
    await expect(page).toHaveURL(new RegExp(`${detailPath}$`));
    await expect(page.getByRole('slider')).toHaveAttribute('data-value', '95');
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
  const portrait = hero.locator('.detail-profile-hero__identity [data-enemy-portrait] img');
  await expect(portrait).toHaveAttribute(
    'src',
    '/generated-enemy-assets/figures/Monster_1004010.webp'
  );
  await expect(portrait).toHaveCSS('object-fit', 'contain');
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

test('Enemy Detail displays the localized Template camp across Monster selections', async ({
  page
}) => {
  await page.goto('/enemies/1004010/');
  const metadata = page.locator('[data-enemy-hero] .hero-identity-metadata');
  await expect(metadata.locator('.enemy-rank-tag + [data-enemy-camp-id="1"]')).toHaveText(
    '雅利洛-Ⅵ'
  );

  await page.goto('/en/enemies/1002015/');
  const camp = metadata.locator('.enemy-rank-tag + [data-enemy-camp-id="99"]');
  await expect(camp).toHaveText('Other');
  await selectMonster(page, '100201506');
  await expect(camp).toHaveText('Other');
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

test('Variant selection keeps text, combat data and history in sync', async ({
  page,
  isMobile
}) => {
  await page.goto('/enemies/1002015/?keep=1#monsters');
  await expect(page.locator('[data-app-ready="true"]')).toBeAttached();
  const hero = page.locator('[data-enemy-hero]');
  const selected = page.locator('[data-selected-monster]');
  await expect(selected).toHaveAttribute('data-selected-monster', '1002015');
  await expect(hero.locator('.hero-description')).toHaveCount(0);
  const heroName = await hero.getByRole('heading', { level: 1 }).textContent();
  const slider = page.locator('#enemy-level-1002015');
  await setSliderValue(slider, '60');
  await selectMonster(page, '100201501');

  const name = await selected.locator('[data-monster-name]').textContent();
  const introduction = await selected.locator('[data-monster-introduction]').textContent();
  const hp = await page.locator('[data-enemy-stat="hp"] strong').textContent();
  const trigger = page.locator('[data-monster-trigger]');
  const weaknesses = '[role="group"] [data-icon-kind="element"]';
  const iconSources = (scope: typeof trigger) =>
    scope
      .locator(`${weaknesses} img`)
      .evaluateAll((icons) => icons.map((icon) => icon.getAttribute('src')));
  await expect(trigger).toContainText('#100201501');
  await expect(trigger).toHaveAccessibleDescription(/\S/);
  const initialWeaknesses = await iconSources(trigger);
  await trigger.click();
  const popup = page.getByRole('dialog');
  const picker = popup.getByRole('combobox');
  const listbox = popup.getByRole('listbox');
  await expect(picker).toBeFocused();
  await expect(picker).toHaveAttribute('aria-controls', (await listbox.getAttribute('id'))!);
  const previousOption = listbox.getByRole('option', { name: /#100201501$/ });
  const nextOption = listbox.getByRole('option', { name: /#100201506$/ });
  await expect(previousOption).toHaveAttribute('aria-current', 'true');
  const nextName = await nextOption.locator('[data-monster-name]').innerText();
  await picker.fill(nextName);
  await expect(previousOption).toHaveCount(0);
  await expect(nextOption).toBeAttached();
  await picker.fill('#100201506');
  const option = listbox.getByRole('option');
  await expect(option).toHaveCount(1);
  await expect(option).toHaveAccessibleName(/\S.+#100201506$/);
  await expect(option).toHaveAccessibleDescription(/\S/);
  const optionName = await option.locator('[data-monster-name]').textContent();
  const optionWeaknesses = await iconSources(option);
  expect(optionWeaknesses).not.toEqual(initialWeaknesses);
  const scrollY = await page.evaluate(() => window.scrollY);
  await picker.press('ArrowDown');
  await picker.press('Enter');
  await expect(picker).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollY)).toBeLessThanOrEqual(1);
  await expect(selected).toHaveAttribute('data-selected-monster', '100201506');
  await expect(page).toHaveURL(/keep=1&monster=100201506#monsters$/);
  expect(optionName).not.toBe(name);
  await expect(selected.locator('[data-monster-name]')).toHaveText(optionName!);
  expect(await iconSources(trigger)).toEqual(optionWeaknesses);
  await expect(selected.locator('[data-monster-introduction]')).not.toHaveText(introduction!);
  await expect(hero.getByRole('heading', { level: 1 })).toHaveText(heroName!);
  await expect(slider).toHaveAttribute('data-value', '60');
  await expect(page.locator('[data-enemy-stat="hp"] strong')).not.toHaveText(hp!);
  await expect(page.locator('[data-enemy-resistance="Lightning"]')).toBeVisible();
  await expect(page.locator('[data-enemy-resistance="Quantum"]')).toHaveCount(0);
  await expect(page.locator('[data-enemy-skill-browser]')).toHaveAttribute(
    'data-monster-id',
    '100201506'
  );
  await expect(page.locator('[data-summon-monster]')).toHaveCount(0);

  await page.goBack();
  await expect(selected).toHaveAttribute('data-selected-monster', '100201501');
  await expect(selected.locator('[data-monster-introduction]')).toHaveText(introduction!);
  await page.goForward();
  await expect(selected).toHaveAttribute('data-selected-monster', '100201506');
  await page.reload();
  await expect(selected).toHaveAttribute('data-selected-monster', '100201506');

  if (isMobile) await page.goto('/en/enemies/1002015/?monster=100201506');
  else {
    await page.locator('[data-language-select]').click();
    await page.locator('[data-locale="en"]').click();
    await expect(page).toHaveURL(/\/en\/enemies\/1002015\/\?keep=1&monster=100201506#monsters$/);
  }
  await expect(selected).toHaveAttribute('data-selected-monster', '100201506');
  await expect(selected.locator('[data-monster-introduction]')).not.toHaveText(introduction!);
  await selectMonster(page, '1002015');
  expect(new URL(page.url()).searchParams.has('monster')).toBe(false);
  await page.goto('/en/enemies/1002015/?monster=100204004&keep=1#monsters');
  await expect(selected).toHaveAttribute('data-selected-monster', '1002015');
  await selectMonster(page, '1002015');
  await expect(page).toHaveURL(/\?keep=1#monsters$/);
  await page.goto('/en/enemies/1002015/?monster=100201501&monster=100201506');
  await expect(selected).toHaveAttribute('data-selected-monster', '1002015');
});

test('a direct Variant link hides the static default while hydration is pending', async ({
  page,
  browser,
  baseURL
}) => {
  let releaseClient!: () => void;
  const clientReady = new Promise<void>((resolve) => {
    releaseClient = resolve;
  });
  await page.route('**/_app/immutable/entry/start.*.js', async (route) => {
    await clientReady;
    await route.continue();
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'warning' && /hydration/i.test(message.text()))
      errors.push(message.text());
  });

  try {
    await page.goto('/en/enemies/1002015/?monster=100201506', { waitUntil: 'commit' });
    await expect(page.locator('[data-enemy-hero]')).toBeVisible();
    const selected = page.locator('[data-selected-monster]');
    await expect(selected).toHaveAttribute('data-selected-monster', '1002015');
    await expect(selected).toBeHidden();
    await expect(page.locator('#skills')).toBeHidden();
    releaseClient();
    await expect(selected).toHaveAttribute('data-selected-monster', '100201506');
    await expect(selected).toBeVisible();
    await expect(page.locator('#skills')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    releaseClient();
  }

  const staticPage = await browser.newPage({ baseURL, javaScriptEnabled: false });
  try {
    await staticPage.goto('/en/enemies/1002015/?monster=100201506');
    await expect(staticPage.locator('[data-selected-monster="1002015"]')).toBeVisible();
  } finally {
    await staticPage.close();
  }
});

test('a single Monster uses the variant selector without changing the URL', async ({
  page,
  isMobile
}) => {
  // Keep the fragment scroll from moving the viewport between layout measurements.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  for (const prefix of ['', '/en']) {
    for (const { id, hasIntroduction, query } of [
      { id: '1004011', hasIntroduction: true, query: 'keep=1&monster=1004011' },
      { id: '5013090', hasIntroduction: false, query: 'keep=1' }
    ]) {
      await page.goto(`${prefix}/enemies/${id}/?${query}#monsters`);
      await expect(page.locator('[data-app-ready="true"]')).toBeAttached();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const originalUrl = page.url();
      const historyLength = await page.evaluate(() => history.length);
      const identity = page.locator(`[data-selected-monster="${id}"]`);
      const trigger = identity.locator('[data-monster-trigger]');
      const name = trigger.locator('[data-monster-name]');
      const chevron = trigger.locator('svg.lucide-chevron-down');
      const monsterId = trigger.getByText(`#${id}`, { exact: true });
      const weaknesses = trigger.getByRole('group');
      const introduction = identity.locator('[data-monster-introduction]');
      await expect(trigger).toHaveCSS('border-top-width', '1px');
      await expect(name).toBeVisible();
      await expect(chevron).toBeVisible();
      await expect(monsterId).toBeVisible();
      if (hasIntroduction) {
        const triggerBox = (await trigger.boundingBox())!;
        const introBox = (await introduction.boundingBox())!;
        const idBox = (await monsterId.boundingBox())!;
        const iconBox = (await weaknesses.boundingBox())!;
        expect(iconBox.x - idBox.x - idBox.width).toBeGreaterThan(0);
        expect(iconBox.x - idBox.x - idBox.width).toBeLessThan(24);
        expect(iconBox.y).toBeLessThan(idBox.y + idBox.height);
        if (isMobile) {
          expect(Math.abs(introBox.x - triggerBox.x)).toBeLessThan(2);
          expect(introBox.y).toBeGreaterThan(triggerBox.y + triggerBox.height);
        } else {
          expect(Math.abs(introBox.y - triggerBox.y)).toBeLessThan(2);
          expect(introBox.x).toBeGreaterThan(triggerBox.x + triggerBox.width);
        }
        await expect(page.locator('[data-enemy-stat]')).toHaveCount(7);
        await expect(page.locator(`#enemy-level-${id}`)).toHaveAttribute('data-value', '95');
      } else {
        await expect(introduction).toHaveCount(0);
        await expect(weaknesses).toHaveCount(0);
      }
      expect(
        await identity.evaluate((element) => element.scrollWidth - element.clientWidth)
      ).toBeLessThanOrEqual(1);

      if (isMobile) await trigger.tap();
      else await trigger.click();
      const popup = page.getByRole('dialog');
      const option = popup.getByRole('listbox').getByRole('option');
      await expect(popup).toBeVisible();
      await expect(popup.getByRole('combobox')).toHaveCount(0);
      await expect(popup.getByRole('status')).toHaveCount(0);
      await expect(option).toHaveCount(1);
      await expect(option).toHaveAttribute('data-monster-option', id);
      await expect(option).toHaveAttribute('aria-current', 'true');
      await expect(option.locator('svg.lucide-check')).toBeVisible();
      await expect(option).toBeFocused();
      if (isMobile) await option.tap();
      else await option.click();
      await expect(popup).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(page).toHaveURL(originalUrl);
      expect(await page.evaluate(() => history.length)).toBe(historyLength);

      await trigger.press('Enter');
      await expect(option).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(popup).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(page).toHaveURL(originalUrl);
      expect(await page.evaluate(() => history.length)).toBe(historyLength);
    }
  }
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
  await expect(page.locator('[data-special-resistance="STAT_CTRL"] dd')).toHaveText('50%');
  await page.goto('/enemies/4034013/');
  for (const code of ['STAT_CTRL_Frozen', 'STAT_Confine', 'STAT_Entangle']) {
    await expect(page.locator(`[data-special-resistance="${code}"] dd`)).toHaveText('75%');
  }

  await page.goto('/enemies/3002011/');
  const twoColumnPanel = page.locator('.enemy-battle-panel');
  await expect(twoColumnPanel).toHaveAttribute('data-battle-columns', '2');
});

test('召唤单位严格随 selected Monster 切换，并使用解析后的 Template route', async ({ page }) => {
  await page.goto('/enemies/1003010/');
  await expect(page.locator('[data-summon-template="1002040"]')).toHaveCount(1);
  await expect(page.locator('[data-summon-template="1002050"]')).toHaveCount(0);

  await selectMonster(page, '100301004');
  await expect(page.locator('[data-summon-template="1002040"]')).toHaveAttribute(
    'href',
    '/enemies/1002040/?monster=1002040'
  );
  await expect(page.locator('[data-summon-template="1002050"]')).toHaveAttribute(
    'href',
    '/enemies/1002050/?monster=1002050'
  );
  await expect(page.locator('[data-summon-monster]')).toHaveCount(2);
  const summon = page.locator('[data-summon-template="1002050"]');
  await expect(summon.locator('.compact-entity-card__artwork img')).toHaveAttribute(
    'src',
    '/generated-enemy-assets/icons/Monster_1002050.webp'
  );
  await expect(summon.locator('.compact-entity-card__tertiary')).toHaveCount(1);
  await expect(summon.locator('.enemy-weakness-group')).toHaveCount(1);
  await expect(summon).not.toContainText(/Monster #/);
  await summon.click();
  await expect(page).toHaveURL(/\/enemies\/1002050\/\?monster=1002050$/);
  await expect(page.locator('[data-selected-monster="1002050"]')).toBeVisible();

  await page.goto('/en/enemies/1004015/');
  const sameTemplate = page.locator('[data-summon-template="1002015"]');
  await expect(sameTemplate).toHaveCount(2);
  const concreteSummon = sameTemplate.filter({ has: page.locator('img') }).last();
  await expect(concreteSummon).toHaveAttribute('href', '/en/enemies/1002015/?monster=100201509');
  await concreteSummon.click();
  await expect(page.locator('[data-selected-monster="100201509"]')).toBeVisible();
});

test('Skill Browser 保留阶段筛选、技能顺序与本地选择状态', async ({ page }) => {
  await page.goto('/enemies/8034010/');
  const tabs = page.locator('.enemy-phase-tabs');
  await expect(tabs.getByRole('tab')).toHaveCount(2);
  const phase1 = tabs.getByRole('tab').nth(0);
  const phase2 = tabs.getByRole('tab').nth(1);
  await expect(phase1).toHaveAttribute('aria-selected', 'true');
  const phase1Panel = page.getByRole('tabpanel');
  await expect(phase1).toHaveAttribute('aria-controls', 'enemy-phase-panel-8034010-1');
  await expect(phase1Panel).toHaveAttribute('aria-labelledby', 'enemy-phase-tab-8034010-1');
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
  await expect(sharedOption).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-enemy-skill-detail="803401002"]')).toBeVisible();
  await expect(page).not.toHaveURL(/#enemy-skill-/);
  await expect(sharedOption).toBeFocused();
  await page.keyboard.press('ArrowDown');
  const nextOption = selector.locator('[data-enemy-skill-option="803401003"]');
  await expect(nextOption).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(nextOption).toHaveAttribute('aria-checked', 'true');
  await sharedOption.click();
  await phase2.click();
  await expect(sharedOption).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-enemy-skill-detail="803401002"]')).toBeVisible();
  await expect(selector.locator('[data-enemy-skill-option="803401004"]')).toHaveCount(0);
  await phase1.click();
  await selector.locator('[data-enemy-skill-option="803401004"]').click();
  await phase1.focus();
  await page.keyboard.press('ArrowRight');
  await expect(phase2).toBeFocused();
  await expect(phase2).toHaveAttribute('aria-selected', 'true');
  await expect(selector.locator('[data-enemy-skill-option="803401001"]')).toHaveAttribute(
    'aria-checked',
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
  await selectMonster(page, '403501001');
  await expect(page.locator('[data-enemy-skill-option="403501001"]')).toHaveAttribute(
    'aria-checked',
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
      await expect(chanceOption).toHaveAttribute('aria-checked', 'true');
      await expect(chanceOption).toBeFocused();

      await selector.locator('[data-enemy-skill-option="200401002"]').click();
      const detail = page.locator('[data-enemy-skill-detail="200401002"]');
      const metadata = detail.locator('header');
      await expect(metadata.locator('[data-icon-kind="element"]')).toHaveCount(1);
      await expect(metadata.locator('[data-skill-effect]')).toHaveCount(1);
      expect(
        await metadata.evaluate((element) => {
          const icon = element.querySelector('[data-icon-kind="element"]')!;
          const tag = element.querySelector('[data-skill-effect]')!;
          return !!(tag.compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING);
        })
      ).toBe(true);
      if (width === 1440) {
        const centers = await metadata.locator(':scope > *').evaluateAll((elements) =>
          elements.map((element) => {
            const { top, height } = element.getBoundingClientRect();
            return top + height / 2;
          })
        );
        expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
      }
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
    const selector = page.locator('[data-monster-trigger]');
    await expect(selector).toBeVisible();
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

test('Variant identity and introduction follow the available content width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/en/enemies/5014024/?monster=501402404');
  const selected = page.locator('[data-selected-monster]');
  const trigger = selected.locator('[data-monster-trigger]');
  const introduction = selected.locator('[data-monster-introduction]');
  await expect(selected).toHaveAttribute('data-selected-monster', '501402404');

  async function expectAdjacentWeaknesses(scope: typeof trigger) {
    const id = (await scope.getByText(/^#501402404$/).boundingBox())!;
    const icons = (await scope.getByRole('group').boundingBox())!;
    expect(icons.x - id.x - id.width).toBeGreaterThan(0);
    expect(icons.x - id.x - id.width).toBeLessThan(24);
    expect(icons.y).toBeLessThan(id.y + id.height);
    expect(id.y).toBeLessThan(icons.y + icons.height);
  }

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const identityBox = (await trigger.boundingBox())!;
    const introBox = (await introduction.boundingBox())!;
    if (width === 1440) {
      expect(Math.abs(introBox.y - identityBox.y)).toBeLessThan(2);
      expect(introBox.x).toBeGreaterThan(identityBox.x + identityBox.width);
    } else {
      expect(Math.abs(introBox.x - identityBox.x)).toBeLessThan(2);
      expect(introBox.y).toBeGreaterThan(identityBox.y + identityBox.height);
    }
    await expectAdjacentWeaknesses(trigger);
    expect(
      await selected.evaluate((element) => element.scrollWidth - element.clientWidth)
    ).toBeLessThanOrEqual(1);
  }

  await trigger.click();
  const option = page.getByRole('option', { name: /#501402404$/ });
  await expect(option).toBeVisible();
  await expectAdjacentWeaknesses(option);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('a long variant list scrolls and supports filtering on narrow screens', async ({
  page,
  isMobile
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/en/enemies/8002050/');
  await expect(page.locator('[data-app-ready="true"]')).toBeAttached();
  const trigger = page.locator('[data-monster-trigger]');
  await trigger.focus();
  await trigger.press('Enter');
  const popup = page.getByRole('dialog');
  const picker = popup.getByRole('combobox');
  await expect(picker).toBeFocused();
  const options = popup.getByRole('listbox');
  await expect(options).toBeVisible();
  await expect(picker).toHaveAccessibleName(/\S/);
  await expect(picker).toHaveAttribute('aria-activedescendant', /\S/);
  const firstActive = (await picker.getAttribute('aria-activedescendant'))!;
  await picker.press('ArrowDown');
  await expect(picker).not.toHaveAttribute('aria-activedescendant', firstActive);
  await picker.press('ArrowUp');
  await expect(picker).toHaveAttribute('aria-activedescendant', firstActive);
  expect(await options.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true
  );
  const fullCount = await options.getByRole('option').count();
  await picker.fill('no match 0123456789');
  await expect(options.getByRole('option')).toHaveCount(0);
  await expect(popup.getByRole('status')).toBeVisible();
  await picker.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(picker).toHaveValue('');
  await expect(options.getByRole('option')).toHaveCount(fullCount);
  await picker.fill('#800205073');
  await expect(options.getByRole('option')).toHaveCount(1);
  await expect
    .poll(() =>
      popup.evaluate((element) => {
        const { left, right, top, bottom } = element.getBoundingClientRect();
        return left >= 0 && right <= innerWidth && top >= 0 && bottom <= innerHeight;
      })
    )
    .toBe(true);
  const match = options.getByRole('option');
  if (isMobile) await match.tap();
  else await match.click();
  await expect(page.locator('[data-selected-monster="800205073"]')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
});
