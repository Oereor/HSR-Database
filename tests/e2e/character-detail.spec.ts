import { setSliderValue } from '../helpers/slider';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('角色目录与详情接入属性、命途图标和优化立绘', async ({ page }) => {
  const failedImages: string[] = [];
  page.on('response', (response) => {
    if (response.request().resourceType() === 'image' && response.status() >= 400) {
      failedImages.push(response.url());
    }
  });
  await page.goto('/characters/');
  const firstCard = page.locator('.entity-overview-card').first();
  await expect(firstCard.locator('.rarity-stars')).toHaveCSS('color', 'rgb(255, 215, 0)');

  await page.goto('/characters/?rarity=4');
  await expect(page.locator('.entity-overview-card').first().locator('.rarity-stars')).toHaveCSS(
    'color',
    'rgb(199, 125, 255)'
  );

  await page.goto('/characters/1402/');
  const portrait = page.locator('[data-character-portrait="1402"]');
  await expect(portrait.locator('img')).toHaveAttribute(
    'src',
    '/generated-assets/characters/portrait/1402.webp'
  );
  await expect(portrait).toBeVisible();
  await expect(page.locator('.detail-profile-hero [data-icon-kind="path"]')).toContainText('记忆');
  await expect(page.locator('.detail-profile-hero [data-icon-kind="element"]')).toContainText('雷');
  expect(failedImages).toEqual([]);
});

test('四名 LD 角色进入 Character Overview、Search、Detail 与本地资源链', async ({ page }) => {
  for (const [id, name, pathName, elementName] of [
    ['1014', 'Saber', '毁灭', '风'],
    ['1015', 'Archer', '巡猎', '量子'],
    ['1508', '远坂凛', '智识', '量子'],
    ['1509', '吉尔伽美什', '毁灭', '雷']
  ] as const) {
    await page.goto(`/characters/?q=${encodeURIComponent(name)}`);
    const card = page.locator(`a[href="/characters/${id}/"]`);
    await expect(card).toBeVisible();
    await expect(card.locator('.rarity-stars')).toHaveText('★★★★★');
    await expect(card.getByRole('img', { name: pathName, exact: true })).toBeVisible();
    await expect(card.getByRole('img', { name: elementName, exact: true })).toBeVisible();
    await expect(card.locator('.entity-overview-card__artwork img')).toHaveAttribute(
      'src',
      `/generated-assets/characters/preview/${id}.png`
    );

    await page.goto(`/search/?q=${encodeURIComponent(name)}`);
    await expect(page.locator(`a[href="/characters/${id}/"]`)).toBeVisible();

    await page.goto(`/characters/${id}/`);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.locator(`[data-character-portrait="${id}"] img`)).toHaveAttribute(
      'src',
      `/generated-assets/characters/portrait/${id}.webp`
    );
    await expect(page.locator('#skills .skill-card')).toHaveCount(5);
    await expect(page.locator('#traces')).not.toContainText('13 条记录');
    await expect(page.locator('#eidolons .rank-card')).toHaveCount(6);
  }
});

test('Global Buff 作为正常 Talent Variant 展示且不泄漏配置术语', async ({ page }) => {
  const messages = JSON.parse(readFileSync('messages/zh-CN.json', 'utf8')) as Record<
    string,
    string
  >;
  for (const [id, originalId, globalId, originalName, globalName, description] of [
    ['1407', '140704', '140704:global-buff:1', '掌心淌过的荒芜', '月茧之庇', '月茧'],
    ['1506', '150604', '150604:global-buff:1', '有我在，把把都是顺风局', '999安全卫士', '防火墙']
  ] as const) {
    await page.goto(`/characters/${id}/`);
    const talentCard = page.locator('[data-skill-category="talent"]');
    await expect(talentCard).toHaveCount(1);
    await expect(talentCard.locator('.skill-variant')).toHaveCount(2);
    await expect(talentCard.locator(`[data-skill-id="${originalId}"]`)).toContainText(originalName);
    const globalVariant = talentCard.locator(`[data-skill-id="${globalId}"]`);
    await expect(globalVariant).toContainText(globalName);
    await expect(globalVariant).toContainText(description);
    await expect(globalVariant.locator('.skill-variant__heading .skill-effect-tag')).toHaveText(
      messages.skill_exclusive
    );
    await expect(globalVariant.locator('.skill-variant__heading')).not.toContainText('Lv.1');
    await expect(page.locator('[data-skill-category="global-buff"]')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('仓库技');
    await expect(page.locator('body')).not.toContainText('Global Buff');
  }
});

test('角色 Detail Hero 在桌面 3:2 分栏并于 1180px 断点纵向堆叠', async ({ page }) => {
  for (const viewport of [
    { width: 1600, height: 1000 },
    { width: 1280, height: 800 },
    { width: 1181, height: 800 },
    { width: 1180, height: 800 },
    { width: 1024, height: 768 },
    { width: 820, height: 900 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/characters/1310/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
    const hero = page.locator('.detail-profile-hero');
    const identity = hero.locator('.detail-profile-hero__identity');
    const inspection = hero.locator('.detail-profile-hero__inspection');
    await expect(identity.getByRole('heading', { level: 1 })).toBeVisible();
    const identityBox = await identity.boundingBox();
    const inspectionBox = await inspection.boundingBox();
    expect(identityBox).not.toBeNull();
    expect(inspectionBox).not.toBeNull();
    if (viewport.width <= 1180) {
      expect(inspectionBox!.y).toBeGreaterThanOrEqual(identityBox!.y + identityBox!.height - 1);
    } else {
      expect(Math.abs(identityBox!.y - inspectionBox!.y)).toBeLessThan(1);
      expect(identityBox!.width / inspectionBox!.width).toBeGreaterThan(1.4);
      expect(identityBox!.width / inspectionBox!.width).toBeLessThan(1.6);
    }
    const title = identity.getByRole('heading', { level: 1 });
    await title.evaluate((element) => {
      element.textContent = 'Synthetic localized name ABCDEFGHIJKLMNOPQRSTUVWXYZ '.repeat(3);
    });
    expect(
      await title.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const bounds = element.getBoundingClientRect();
        return [...range.getClientRects()].every(
          (rect) => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1
        );
      })
    ).toBe(true);
  }
});

test('多命途角色名称由统一规则生成', async ({ page }) => {
  await page.goto('/characters/1224/');
  await expect(page.getByRole('heading', { name: '三月七·巡猎' })).toBeVisible();
  await page.goto('/characters/8005/');
  await expect(page.getByRole('heading', { name: '开拓者·同谐' })).toBeVisible();
});

test('技能卡按语义类别合并变体并使用真实默认等级', async ({ page }) => {
  await page.goto('/characters/1213/');
  const basicCard = page.locator('[data-skill-category="basic"]');
  await expect(basicCard).toHaveCount(1);
  await expect(basicCard.locator('.skill-variant')).toHaveCount(4);
  await expect(basicCard.locator('output')).toHaveText('Lv.6');
  await setSliderValue(basicCard.locator('[role="slider"]'), '0');
  await expect(basicCard.locator('output')).toHaveText('Lv.1');

  const skillCard = page.locator('[data-skill-category="skill"]');
  await expect(skillCard.locator('output')).toHaveText('Lv.10');
  await expect(skillCard.locator('.skill-variant')).toHaveCount(1);
  await expect(skillCard.locator('[data-skill-id="121302"]')).toBeVisible();
  await expect(skillCard.locator('[data-skill-id="121309"]')).toHaveCount(0);

  await page.goto('/characters/1401/');
  const hertaSkill = page.locator('[data-skill-category="skill"]');
  await expect(hertaSkill).toHaveCount(1);
  await expect(hertaSkill.locator('.skill-variant')).toHaveCount(2);
});

test('skill category headers expose accessible preview controls without category icons', async ({
  page
}) => {
  await page.goto('/characters/1001/');
  for (const category of ['basic', 'skill', 'ultimate', 'talent', 'technique']) {
    const card = page.locator(`[data-skill-category="${category}"]`);
    await expect(card.locator('[data-slot="card-header"] img')).toHaveCount(0);
    if (category === 'technique') await expect(card.getByRole('slider')).toHaveCount(0);
    else await expect(card.getByRole('slider')).toHaveAccessibleName(/.+/);
  }
});

test('每个 Skill Variant 独立展示技能类型与战斗元数据', async ({ page }) => {
  await page.goto('/characters/1001/');
  const basic = page.locator('[data-skill-id="100101"]');
  await expect(basic.locator('[data-skill-effect="SingleAttack"]')).not.toHaveText('');
  await expect(basic.locator('[data-combat-meta="battle-point"]')).toContainText('+1');
  await expect(basic.locator('[data-combat-meta="energy-gain"]')).toContainText('20');
  await expect(basic.locator('[data-combat-meta="toughness-damage"]')).toContainText('10');
  const skill = page.locator('[data-skill-id="100102"]');
  await expect(skill.locator('[data-skill-effect="Defence"]')).not.toHaveText('');
  await expect(skill.locator('[data-combat-meta="battle-point"]')).toContainText('-1');
  await expect(skill.locator('[data-combat-meta="energy-gain"]')).toContainText('30');
  await expect(skill.locator('[data-combat-meta="toughness-damage"]')).toHaveCount(0);

  await page.goto('/characters/1213/');
  for (const [id, bp, energy, toughness] of [
    ['121301', '+1', '20', '10'],
    ['121308', '-1', '30', '20'],
    ['121310', '-2', '35', '30'],
    ['121312', '-3', '40', '40']
  ]) {
    const variant = page.locator(`[data-skill-id="${id}"]`);
    await expect(variant.locator('[data-combat-meta="battle-point"]')).toContainText(bp);
    await expect(variant.locator('[data-combat-meta="energy-gain"]')).toContainText(energy);
    await expect(variant.locator('[data-combat-meta="toughness-damage"]')).toContainText(toughness);
  }
  await expect(page.locator('[data-skill-category="basic"] [role="slider"]')).toHaveCount(1);
});

test('特殊资源可与战技点同时显示且忆灵元数据不回归', async ({ page }) => {
  await page.goto('/characters/1310/?enhanced=0');
  const baseFirefly = page.locator('[data-skill-id="131002"]');
  await expect(baseFirefly.locator('[data-combat-meta="special-resource"]')).toContainText('40%');
  await expect(baseFirefly.locator('[data-combat-meta="battle-point"]')).toContainText('-1');

  await page.goto('/characters/1407/');
  const castoriceSkill = page.locator('[data-skill-id="140702"]');
  await expect(castoriceSkill.locator('[data-combat-meta="special-resource"]')).toContainText(
    '30%我方全体当前生命值'
  );
  await expect(castoriceSkill.locator('[data-combat-meta="battle-point"]')).toHaveCount(0);
  await expect(castoriceSkill.locator('[data-combat-meta="energy-gain"]')).toHaveCount(0);
  const memosprite = page.locator('[data-skill-id="1140702"]');
  await expect(memosprite.locator('[data-skill-effect="AoEAttack"]')).not.toHaveText('');
  await expect(memosprite.locator('[data-combat-meta="special-resource"]')).toContainText(
    '25%生命值'
  );
  await expect(memosprite.locator('[data-combat-meta="toughness-damage"]')).toContainText('10');
  await expect(page.locator('[data-skill-id="1140712"]')).toHaveCount(0);

  await page.goto('/characters/1401/');
  const normalHertaSkill = page.locator('[data-skill-id="140102"]');
  await expect(normalHertaSkill.locator('[data-stance-display="single"]')).toContainText('15');
  await expect(normalHertaSkill.locator('[data-stance-display="blast"]')).toContainText('10');
  const enhancedHertaSkill = page.locator('[data-skill-id="140109"]');
  await expect(enhancedHertaSkill.locator('[data-stance-display="single"]')).toContainText('20');
  await expect(enhancedHertaSkill.locator('[data-stance-display="blast"]')).toContainText('10');
  await expect(enhancedHertaSkill.locator('[data-stance-display="aoe"]')).toHaveCount(0);
});

test('角色 ExtraEffect 使用共享 disclosure 并保持多形态归属', async ({ page }) => {
  await page.goto('/characters/1224/');
  const normal = page.locator('[data-skill-id="122401"]');
  const enhanced = page.locator('[data-skill-id="122408"]');
  await expect(normal.locator('[data-skill-extra-effects]')).toHaveCount(0);
  const details = enhanced.locator('[data-skill-extra-effects]');
  await expect(details).not.toHaveAttribute('open', '');
  await details.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await expect(details.locator('[data-extra-effect="30000002"]')).toContainText('固定概率');
});

test('角色技能、行迹与星魂保留下划线并共享 ExtraEffect disclosure', async ({ page }) => {
  await page.goto('/characters/1001/');

  const skill = page.locator('[data-skill-id="100104"]');
  await expect(skill.locator('u')).toContainText('反击');

  const trace = page.locator('[data-trace-id="1001101"]');
  await expect(trace.locator('u')).toHaveText('负面效果');
  const traceEffects = trace.locator('[data-skill-extra-effects]');
  await expect(traceEffects).not.toHaveAttribute('open', '');
  await traceEffects.locator('summary').click();
  await expect(traceEffects.locator('[data-extra-effect="10000010"]')).toContainText('负面效果');

  const eidolon = page.locator('[data-eidolon-id="100104"]');
  await expect(eidolon.locator('u')).toHaveCount(2);
  const eidolonEffects = eidolon.locator('[data-skill-extra-effects]');
  await eidolonEffects.locator('summary').click();
  await expect(eidolonEffects.locator('[data-extra-effect="10000003"]')).toContainText('反击');

  await expect(page.locator('[data-trace-id="1001102"] [data-skill-extra-effects]')).toHaveCount(0);
  await expect(page.locator('[data-eidolon-id="100101"] [data-skill-extra-effects]')).toHaveCount(
    0
  );
});

test('忆灵技和忆灵天赋进入统一技能管线且不重复为行迹', async ({ page }) => {
  await page.goto('/characters/1402/');
  await expect(page.locator('[data-skill-category="memosprite-skill"]')).toBeVisible();
  await expect(page.locator('[data-skill-category="memosprite-talent"]')).toBeVisible();
  await expect(page.locator('[data-skill-id="1140201"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: '刺纹之陷', exact: true })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '擘裂冥茫的爪痕', exact: true })).toHaveCount(0);
});

test('角色 Detail Hero 展示完整 identity、放大标签与不截断传记', async ({ page }) => {
  for (const id of ['1402', '1506', '1317', '1310']) {
    await page.goto(`/characters/${id}/`);
    const hero = page.locator('.detail-profile-hero--character');
    await expect(hero).toHaveCount(1);
    await expect(hero.locator(`[data-character-portrait="${id}"] img`)).toHaveAttribute(
      'src',
      `/generated-assets/characters/portrait/${id}.webp`
    );
    await expect(hero.locator('.detail-profile-hero__gradient')).toHaveCount(1);
    await expect(hero.locator('.detail-profile-hero__gradient')).toHaveCSS(
      'pointer-events',
      'none'
    );
    await expect(hero.locator('.hero-identity-metadata [data-icon-kind="path"]')).toHaveAttribute(
      'data-label-size',
      'hero'
    );
    await expect(
      hero.locator('.hero-identity-metadata [data-icon-kind="element"]')
    ).toHaveAttribute('data-label-size', 'hero');
    const heroTagMetrics = await hero
      .locator('.hero-identity-metadata [data-icon-kind="path"]')
      .evaluate((label) => {
        const icon = label.querySelector('img')!;
        return {
          fontSize: Number.parseFloat(getComputedStyle(label).fontSize),
          iconSize: Number.parseFloat(getComputedStyle(icon).width)
        };
      });
    expect(heroTagMetrics).toEqual({ fontSize: 16, iconSize: 24 });
    await expect(hero.locator('.hero-description')).toHaveCSS('border-top-width', '1px');
    await expect(hero.locator('.hero-description')).toHaveCSS('text-overflow', 'clip');
    expect(
      await hero
        .locator('.hero-description')
        .evaluate((element) => element.scrollHeight - element.clientHeight)
    ).toBeLessThanOrEqual(1);
    if (id === '1317') {
      const biography = hero.locator('.hero-description');
      await expect(biography).toContainText(
        '身为「巡海游侠」的一员，始终追猎着名为「御猿•邪忍」的恶党，直至银河尽头。'
      );
      const biographyStyle = await biography.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          overflow: style.overflow,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          maxHeight: style.maxHeight,
          webkitLineClamp: style.webkitLineClamp,
          inlineHeight: (element as HTMLElement).style.height
        };
      });
      expect(biographyStyle.overflow).not.toBe('hidden');
      expect(biographyStyle.overflowX).not.toBe('hidden');
      expect(biographyStyle.overflowY).not.toBe('hidden');
      expect(biographyStyle.maxHeight).toBe('none');
      expect(biographyStyle.webkitLineClamp).toBe('none');
      expect(biographyStyle.inlineHeight).toBe('');
    }
    await expect(hero.locator('.hero-identity-copy')).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)'
    );
  }
});

test('角色等级属性默认 Lv.80、使用突破后边界并严格按语义行排序', async ({ page }) => {
  await page.goto('/characters/1001/');
  const panel = page.locator('.base-stats-panel');
  const slider = panel.locator('[role="slider"]');
  await expect(panel.locator('output')).toHaveText('Lv.80');
  await expect(
    page.locator('.detail-profile-hero__inspection#stats .base-stats-panel')
  ).toHaveCount(1);
  await expect(page.locator('.detail-section .base-stats-panel')).toHaveCount(0);
  await expect(panel.locator('dl.inspection-stat-list')).toHaveCount(1);
  await expect(panel.locator('.inspection-stat-row')).toHaveCount(5);
  await expect(panel.locator('.inspection-stat-row > dt')).toHaveCount(5);
  for (const field of ['hp', 'attack', 'defence', 'speed', 'energy']) {
    await expect(panel.locator(`[data-base-stat="${field}"] > dt`)).not.toHaveText('');
  }
  await expect(panel.locator('.inspection-stat-row > dd')).toHaveCount(5);
  await expect(panel.locator('[data-base-stat="hp"] > dd')).toHaveText('1,058');
  await expect(panel.locator('[data-base-stat="attack"] dt')).not.toHaveText('');
  await expect(panel.locator('[data-base-stat="defence"] dt')).not.toHaveText('');
  await expect(panel.locator('[data-base-stat="speed"] > dd')).toHaveText('101');
  await expect(panel.locator('[data-base-stat="energy"] > dd')).toHaveText('120');
  await expect(panel).not.toContainText(/HP|ATK|DEF|SPD/);
  const directOrder = await panel
    .locator(':scope > *')
    .evaluateAll((children) => children.map((child) => child.className));
  expect(directOrder[0]).toContain('stat-level-control');
  expect(directOrder[1]).toContain('inspection-stat-list');
  await expect(panel.locator('.skill-effect-tag')).toHaveCount(1);
  await setSliderValue(slider, '20');
  await expect(panel.locator('output')).toHaveText('Lv.20');
  await expect(slider).toHaveAttribute('aria-valuenow', '20');
  await expect(panel.locator('.inspection-stat-list .scaling-value').first()).toHaveText('281');
  await expect(panel.locator('.inspection-stat-list .scaling-value').first()).toHaveCSS(
    'color',
    'rgb(242, 164, 95)'
  );
});

test('特殊能量使用结构化标记且旧版银狼保持普通能量', async ({ page }) => {
  for (const id of ['1308', '1506']) {
    await page.goto(`/characters/${id}/`);
    const energy = page.locator('[data-base-stat="energy"]');
    await expect(energy.locator('dt')).not.toHaveText('');
    await expect(energy.locator('dd')).not.toHaveText('');
  }
  await page.goto('/characters/1006/');
  const standardEnergy = page.locator('[data-base-stat="energy"]');
  await expect(standardEnergy.locator('dt')).not.toHaveText('');
  await expect(standardEnergy.locator('dd')).toHaveText('110');
});

test('角色加强开关只渲染当前 Profile 并保持 URL 状态', async ({ page }) => {
  await page.goto('/characters/1212/');
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  const enhancement = page.locator('.enhancement-switch');
  await expect(enhancement).toBeVisible();
  await expect(enhancement).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.enhancement-control strong')).not.toHaveText('');
  await expect(page.locator('[data-skill-id="1121202"]')).toContainText('150%生命上限');
  await expect(page.locator('[data-skill-id="121202"]')).toHaveCount(0);
  await expect(page.locator('[data-trace-id="11212101"]')).toContainText('终结技伤害提高20%');
  await expect(page.locator('[data-trace-id="1212101"]')).toHaveCount(0);
  await expect(page.locator('[data-eidolon-id="1121201"]')).toContainText('暴击伤害提高36%');
  await expect(page.locator('[data-eidolon-id="121201"]')).toHaveCount(0);

  await enhancement.click();
  await expect(page).toHaveURL(/\/characters\/1212\/\?enhanced=0$/);
  await expect(enhancement).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.enhancement-control strong')).not.toHaveText('');
  await expect(page.locator('[data-skill-id="121202"]')).toContainText('200%攻击力');
  await expect(page.locator('[data-skill-id="1121202"]')).toHaveCount(0);
  await expect(page.locator('[data-trace-id="1212101"]')).toBeVisible();
  await expect(page.locator('[data-trace-id="11212101"]')).toHaveCount(0);
  await expect(page.locator('[data-eidolon-id="121201"]')).toContainText('暴击伤害提高24%');
  await expect(page.locator('[data-eidolon-id="1121201"]')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.enhancement-switch')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('[data-skill-id="1121202"]')).toHaveCount(0);
  await page.locator('.enhancement-switch').press('Space');
  await expect(page).toHaveURL(/\/characters\/1212\/$/);
  await expect(page.locator('[data-skill-id="1121202"]')).toBeVisible();

  await page.goto('/characters/1001/');
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.locator('.enhancement-switch')).toHaveCount(0);
});

test('HideInUI 技能在玩家侧管线统一隐藏且公开技能保持可用', async ({ page }) => {
  await page.goto('/characters/8007/');
  const remembranceBasic = page.locator('[data-skill-category="basic"]');
  await expect(remembranceBasic.locator('.skill-variant')).toHaveCount(2);
  await expect(remembranceBasic.locator('[data-skill-id="800701"]')).toContainText('包在我身上');
  await expect(remembranceBasic.locator('[data-skill-id="800708"]')).toContainText(
    '明天，一同写下'
  );
  await expect(remembranceBasic.locator('[data-skill-id="800701"]')).toContainText('100%');
  await expect(remembranceBasic.locator('[data-skill-id="800708"]')).toContainText('120%');
  await expect(remembranceBasic.locator('[role="slider"]')).toHaveCount(1);
  await setSliderValue(remembranceBasic.locator('[role="slider"]'), '7');
  await expect(remembranceBasic.locator('output')).toHaveText('Lv.8');
  await expect(remembranceBasic.locator('[data-skill-id="800701"]')).toContainText('120%');
  await expect(remembranceBasic.locator('[data-skill-id="800708"]')).toContainText('144%');
  await expect(page.locator('[data-skill-id="800709"]')).toHaveCount(0);

  await page.goto('/characters/8008/');
  const remembranceBasicFemale = page.locator('[data-skill-category="basic"]');
  await expect(remembranceBasicFemale.locator('.skill-variant')).toHaveCount(2);
  await expect(remembranceBasicFemale.locator('[data-skill-id="800801"]')).toBeVisible();
  await expect(remembranceBasicFemale.locator('[data-skill-id="800808"]')).toContainText(
    '明天，一同写下'
  );
  await expect(remembranceBasicFemale.locator('[role="slider"]')).toHaveCount(1);
  await expect(page.locator('[data-skill-id="800809"]')).toHaveCount(0);

  await page.goto('/characters/1407/');
  const memospriteSkill = page.locator('[data-skill-category="memosprite-skill"]');
  await expect(memospriteSkill.locator('[data-skill-id="1140702"]')).toBeVisible();
  await expect(memospriteSkill.locator('[data-skill-id="1140710"]')).toHaveCount(0);
  await expect(memospriteSkill.locator('[data-skill-id="1140711"]')).toHaveCount(0);
  await expect(memospriteSkill.locator('[data-skill-id="1140712"]')).toHaveCount(0);
  await expect(memospriteSkill.locator('[role="slider"]')).toHaveCount(1);
  await expect(memospriteSkill.locator('[role="slider"]').first()).toBeVisible();
  const memospriteTalent = page.locator('[data-skill-category="memosprite-talent"]');
  await expect(memospriteTalent.locator('[data-skill-id="1140706"]')).toBeVisible();
  await expect(memospriteTalent.locator('[role="slider"]')).toHaveCount(1);

  await page.goto('/characters/1507/');
  await expect(page.locator('[data-skill-id="150709"]')).toHaveCount(0);
  await expect(page.locator('#skills .data-placeholder')).toHaveCount(0);

  await page.goto('/characters/1509/');
  await expect(page.locator('[data-skill-category="basic"] .skill-variant')).toHaveCount(1);
  await expect(page.locator('[data-skill-id="150901"]')).toContainText('漫不经心');
  const gilgameshSkill = page.locator('[data-skill-category="skill"]');
  await expect(gilgameshSkill.locator('.skill-variant')).toHaveCount(1);
  await expect(gilgameshSkill.locator('[data-skill-id="150902"]')).toContainText('王之财宝');
  await expect(page.locator('[data-skill-id="150909"]')).toHaveCount(0);
  await expect(page.locator('#skills .data-placeholder')).toHaveCount(0);

  await page.goto('/characters/1510/');
  await expect(page.locator('[data-skill-id="151022"]')).toBeVisible();
  await expect(page.locator('[data-skill-id="151025"]')).toHaveCount(0);
  await expect(page.locator('[data-skill-id="151026"]')).toHaveCount(0);

  await page.goto('/characters/1415/');
  const cyreneMemospriteSkill = page.locator('[data-skill-category="memosprite-skill"]');
  await expect(cyreneMemospriteSkill.locator('.skill-variant')).toHaveCount(2);
  await expect(cyreneMemospriteSkill.locator('[data-skill-id="1141501"]')).toBeVisible();
  await expect(cyreneMemospriteSkill.locator('[data-skill-id="1141502"]')).toBeVisible();
  for (let skillId = 1141513; skillId <= 1141526; skillId += 1)
    await expect(page.locator(`[data-skill-id="${skillId}"]`)).toHaveCount(0);
});

test('Character Special Effect trigger 打开共享 modal 并保持 relation 与焦点', async ({
  page,
  isMobile
}) => {
  await page.goto('/characters/1415/');
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  const initialBodyOverflow = await page.evaluate(() => document.body.style.overflow);
  const cyreneSourceLevel = page
    .locator('[data-skill-category="memosprite-skill"]')
    .locator('[role="slider"]');
  await expect(cyreneSourceLevel).toHaveAttribute('data-value', '5');
  const trigger = page.locator('.special-effect-trigger').first();
  await expect(trigger).toBeVisible();
  await expect(trigger.locator('img')).toHaveAttribute(
    'src',
    '/generated-assets/characters/icons/1415.png'
  );
  await expect(trigger.locator('[data-game-icon="AvatarCyrene"]')).toBeVisible();
  await expect(trigger.locator('u')).toHaveCount(2);
  expect(
    await trigger.locator('u').evaluateAll((items) => items.every((item) => !!item.textContent))
  ).toBe(true);
  await trigger.focus();
  await trigger.press('Enter');

  const dialog = page.locator('.special-effect-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-special-effect-kind="servant-skill-link"]')).toHaveCount(14);
  await expect(dialog.locator('[data-special-effect-order]').first()).toHaveAttribute(
    'data-special-effect-order',
    '1'
  );
  await expect(dialog.locator('[data-special-effect-order]').last()).toHaveAttribute(
    'data-special-effect-order',
    '14'
  );
  await expect(dialog.locator('[data-skill-id="1141526"]')).toBeVisible();
  await expect(dialog.locator('[data-skill-id="1141513"]')).toBeVisible();
  await expect(dialog.locator('[data-linked-avatar-id="1415"]')).toContainText('昔涟');
  await expect(dialog.getByRole('slider')).toHaveCount(0);
  await expect(dialog.locator('.special-effect-dialog__level')).toHaveText('Lv.6');
  await expect(dialog.locator('[data-skill-id="1141526"]')).toContainText('60%');
  const cyreneTrailblazer = dialog.locator('[data-linked-avatar-id="8007"]');
  await expect(cyreneTrailblazer).toHaveAttribute('data-display-avatar-id', '8008');
  await expect(cyreneTrailblazer.locator('img')).toHaveAttribute(
    'src',
    /generated-assets\/characters\/icons\/8008\.png/
  );
  await expect(cyreneTrailblazer.locator('strong')).toHaveText('开拓者·记忆');
  expect(
    await dialog
      .locator('.special-effect-dialog__content')
      .evaluate((element) => element.scrollHeight > element.clientHeight)
  ).toBe(true);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

  await dialog.locator('.special-effect-dialog__close').click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe(initialBodyOverflow);

  await setSliderValue(cyreneSourceLevel, '7');
  await expect(cyreneSourceLevel).toHaveAttribute('data-value', '7');
  await trigger.click();
  await expect(dialog.locator('.special-effect-dialog__level')).toHaveText('Lv.8');
  await expect(dialog.locator('[data-skill-id="1141526"]')).toContainText('72%');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  if (!isMobile) {
    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  }

  await page.goto('/characters/1510/');
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  const himekoSourceLevel = page.locator(
    '[data-skill-category="assist"] .skill-level-control [role="slider"]'
  );
  await expect(himekoSourceLevel).toHaveAttribute('data-value', '9');
  const himekoTrigger = page.locator('.special-effect-trigger').first();
  await expect(himekoTrigger.locator('img')).toHaveAttribute(
    'src',
    '/generated-assets/characters/icons/1510.png'
  );
  await expect(page.locator('.special-effect-trigger')).toHaveCount(2);
  await himekoTrigger.click();
  const himekoDialog = page.locator('.special-effect-dialog');
  await expect(himekoDialog.locator('[data-special-effect-kind="avatar-skill-link"]')).toHaveCount(
    2
  );
  await expect(himekoDialog.locator('[data-skill-id="151025"]')).toBeVisible();
  await expect(himekoDialog.locator('[data-skill-id="151026"]')).toBeVisible();
  await expect(himekoDialog.getByRole('slider')).toHaveCount(0);
  await expect(himekoDialog.locator('.special-effect-dialog__level')).toHaveText('Lv.10');
  const himekoTrailblazer = himekoDialog.locator('[data-linked-avatar-id="8001"]');
  await expect(himekoTrailblazer).toHaveAttribute('data-display-avatar-id', '8002');
  await expect(himekoTrailblazer.locator('img')).toHaveAttribute(
    'src',
    /generated-assets\/characters\/icons\/8002\.png/
  );
  await expect(himekoTrailblazer.locator('strong')).toHaveText('开拓者');
  await expect(himekoDialog.locator('[data-linked-avatar-id="1001"] strong')).toHaveText('三月七');
  await expect(himekoDialog.locator('[data-linked-avatar-id="1003"]')).toContainText('姬子');
  await himekoDialog.locator('.special-effect-dialog__close').click();

  await page.goto('/characters/8007/');
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('开拓者·记忆');
  await page.goto('/characters/1001/');
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('三月七·存护');

  await page.goto('/characters/1509/');
  await expect(page.locator('.site-shell')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.locator('.special-effect-trigger')).toHaveCount(0);
  await expect(page.locator('[data-skill-id="150909"]')).toHaveCount(0);
});

test('trace summaries retain node breakdown and eidolons retain source ordering', async ({
  page
}) => {
  for (const id of ['1001', '8007']) {
    const character = JSON.parse(
      readFileSync(`src/lib/generated/views/zh-CN/details/characters/${id}.json`, 'utf8')
    );
    const profile = character.profiles.base;
    await page.goto(`/characters/${id}/`);
    const details = page.locator('#traces details');
    for (let i = 0; i < (await details.count()); i++)
      await details.nth(i).locator('summary').click();
    await expect(page.locator('#traces [data-trace-id]')).toHaveCount(profile.traces.length);
    for (const stat of profile.traces.filter((trace: { statBonus?: unknown }) => trace.statBonus)) {
      await expect(page.locator(`#traces [data-trace-id="${stat.id}"]`)).toBeVisible();
    }
    const eidolons = page.locator('#eidolons [data-eidolon-id]');
    await expect(eidolons).toHaveCount(6);
    expect(
      await eidolons.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-eidolon-id')))
    ).toEqual(profile.eidolons.map((e: { id: string }) => e.id));
  }
});

test('variants use their own generated skill icons including memosprites', async ({ page }) => {
  const icons = JSON.parse(readFileSync('src/lib/generated-assets/manifest.json', 'utf8'))
    .characterDetails.icons.resolved;
  for (const id of ['1213', '1407', '1415']) {
    const character = JSON.parse(
      readFileSync(`src/lib/generated/views/zh-CN/details/characters/${id}.json`, 'utf8')
    );
    await page.goto(`/characters/${id}/`);
    for (const card of character.profiles.base.skillCards)
      for (const variant of card.variants) {
        const row = page.locator(`#skills [data-skill-id="${variant.id}"]`);
        const expected = icons[variant.iconKey];
        if (expected)
          await expect(row.locator('.skill-variant__heading img')).toHaveAttribute('src', expected);
        else await expect(row.locator('[data-image-fallback]')).toBeVisible();
      }
  }
});
