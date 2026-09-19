import { expect, test } from '@playwright/test';

const playerProfile = (uid: string, includeCharacter = true) => ({
  uid,
  nickname: 'Synthetic Player',
  level: 70,
  worldLevel: 6,
  avatar: null,
  signature: '',
  characterCount: includeCharacter ? 1 : 0,
  lightConeCount: 0,
  achievementCount: 0,
  characters: includeCharacter
    ? [
        {
          characterId: '1304',
          progression: { rank: 3, level: 80, promotion: 6, enhanced: false },
          skillTree: [
            { id: '1304001', level: 6 },
            { id: '1304002', level: 10 },
            { id: '1304003', level: 10 },
            { id: '1304004', level: 10 },
            { id: '1304007', level: 1 },
            { id: '1304101', level: 1 },
            { id: '1304102', level: 0 }
          ],
          lightCone: { lightConeId: '23023', rank: 2, level: 80, promotion: 6 },
          relics: [
            {
              type: 1,
              setId: '103',
              level: 15,
              mainAffix: { type: 'HPDelta', display: '705', percent: false },
              subAffixes: [{ type: 'DefenceAddedRatio', display: '8.2%', percent: true, count: 2 }]
            },
            {
              type: 2,
              setId: '103',
              level: 15,
              mainAffix: { type: 'AttackDelta', display: '352', percent: false },
              subAffixes: []
            },
            {
              type: 3,
              setId: '103',
              level: 15,
              mainAffix: { type: 'DefenceAddedRatio', display: '54.0%', percent: true },
              subAffixes: [{ type: 'SpeedDelta', display: '7', percent: false, count: 0 }]
            },
            {
              type: 4,
              setId: '103',
              level: 15,
              mainAffix: { type: 'SpeedDelta', display: '25', percent: false },
              subAffixes: []
            },
            {
              type: 5,
              setId: '310',
              level: 15,
              mainAffix: { type: 'DefenceAddedRatio', display: '43.2%', percent: true },
              subAffixes: []
            },
            {
              type: 6,
              setId: '310',
              level: 15,
              mainAffix: { type: 'DefenceAddedRatio', display: '43.2%', percent: true },
              subAffixes: []
            }
          ],
          stats: [
            {
              field: 'effect_hit',
              percent: true,
              total: '20%'
            },
            {
              field: 'hp',
              percent: false,
              total: '9,677'
            },
            {
              field: 'elation_dmg',
              percent: true,
              total: '40%'
            },
            {
              field: 'sp_rate',
              percent: true,
              total: '24.4%'
            }
          ]
        }
      ]
    : []
});

test('reuses the Player cache and renders real progression without changing static mode', async ({
  page,
  isMobile
}) => {
  let requestCount = 0;
  await page.route('**/api/player/**', async (route) => {
    requestCount += 1;
    const uid = new URL(route.request().url()).searchParams.get('uid') ?? '';
    await route.fulfill({ json: playerProfile(uid) });
  });

  await page.goto('/player/?uid=100000001');
  await expect(page.getByRole('heading', { name: 'Synthetic Player' })).toBeVisible();
  await page.getByRole('link', { name: /砂金/ }).click();

  await expect(page).toHaveURL(/\/characters\/1304\/\?uid=100000001$/);
  await expect(page.getByText('玩家数据', { exact: true })).toBeVisible();
  await expect(page.getByText('UID 100000001', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '返回玩家信息' })).toHaveAttribute(
    'href',
    '/player/?uid=100000001'
  );
  expect(requestCount).toBe(1);

  const level = page.getByRole('slider', { name: '角色等级' });
  await expect(level).toBeDisabled();
  await expect(level).toHaveValue('80');
  await expect(page.getByText('晋阶 6')).toBeVisible();

  const basicLevel = page.getByRole('slider', { name: '普攻等级' });
  await expect(basicLevel).toBeDisabled();
  await expect(basicLevel).toHaveAttribute('aria-valuenow', '6');

  await expect(page.locator('[data-trace-id="1304101"]')).toHaveAttribute(
    'data-player-state',
    'active'
  );
  await expect(page.locator('[data-trace-id="1304102"]')).toHaveAttribute(
    'data-player-state',
    'inactive'
  );
  await expect(page.locator('[data-trace-id="1304103"]')).toHaveAttribute(
    'data-player-state',
    'unresolved'
  );
  await expect(page.locator('#eidolons [data-player-state="active"]')).toHaveCount(3);
  await expect(page.locator('#eidolons [data-player-state="inactive"]')).toHaveCount(3);
  const eidolonTagInsets = await page.locator('#eidolons .rank-card').evaluateAll((cards) =>
    cards.map((card) => {
      const tag = card.querySelector<HTMLElement>('[data-player-state-label]')!;
      return {
        expected: Number.parseFloat(getComputedStyle(card).paddingRight),
        actual: card.getBoundingClientRect().right - tag.getBoundingClientRect().right
      };
    })
  );
  expect(eidolonTagInsets.every(({ expected, actual }) => Math.abs(expected - actual) <= 1)).toBe(
    true
  );

  await expect(page.locator('[data-player-stat="hp"]')).toContainText('9,677');
  await expect(page.getByRole('button', { name: '属性拆分' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '总面板' })).toHaveCount(0);
  await expect(page.locator('[data-player-stat="effect_hit"]')).toContainText('20%');
  await expect(page.locator('[data-player-stat="elation_dmg"]')).toContainText('欢愉度');
  await expect(page.locator('[data-player-stat="elation_dmg"] img')).toHaveAttribute(
    'src',
    '/generated-assets/relic-properties/IconJoy.png'
  );
  await expect(page.locator('[data-player-stat="sp_rate"]')).toContainText('124.4%');
  await expect(page.locator('#equipment')).toBeVisible();
  await expect(page.locator('#equipment-recommendation')).toHaveCount(0);
  await expect(page.locator('[data-player-light-cone="23023"]')).toContainText('命运从未公平');
  await expect(page.locator('[data-player-relic-slot]')).toHaveCount(6);
  await expect(
    page.locator('[data-player-relic-slot="BODY"] [data-recommended="true"]')
  ).toHaveCount(1);

  if (isMobile) {
    const columns = await page
      .locator('.player-stats-grid')
      .evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).filter(Boolean)
      );
    expect(columns).toHaveLength(1);
    const relicColumns = await page
      .locator('.player-equipment__relic-grid')
      .evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).filter(Boolean)
      );
    expect(relicColumns).toHaveLength(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
    ).toBeLessThanOrEqual(1);
  } else {
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.locator('.detail-profile-hero--character')).toHaveCSS(
      'grid-template-columns',
      /\S+\s+\S+/
    );
    await page.setViewportSize({ width: 1180, height: 900 });
    const stackedColumns = await page
      .locator('.detail-profile-hero--character')
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/));
    expect(stackedColumns).toHaveLength(1);
  }

  await page.goto('/en/characters/1304/?uid=100000001');
  await expect(page.locator('[data-player-stat="elation_dmg"]')).toContainText('Elation');
  await expect(page.locator('[data-player-stat="elation_dmg"]')).not.toContainText('elation_dmg');

  await page.goto('/characters/1304/');
  const staticLevel = page.getByRole('slider', { name: '角色等级' });
  await expect(staticLevel).toBeEnabled();
  await expect(page.locator('[data-player-stats-panel]')).toHaveCount(0);
  await expect(page.locator('#eidolons [data-player-state]')).toHaveCount(0);
  await expect(page.locator('#equipment-recommendation')).toBeVisible();
  await expect(page.locator('#equipment')).toHaveCount(0);
});

test('keeps static detail available for invalid, missing and failed Player context', async ({
  page
}) => {
  let requestCount = 0;
  await page.route('**/api/player/**', async (route) => {
    requestCount += 1;
    const uid = new URL(route.request().url()).searchParams.get('uid') ?? '';
    if (uid === '100000503') {
      await route.fulfill({
        status: 503,
        json: { error: { code: 'UPSTREAM_UNAVAILABLE', retryable: true } }
      });
      return;
    }
    await route.fulfill({ json: playerProfile(uid, false) });
  });

  await page.goto('/characters/1304/?uid=abc');
  await expect(page.getByText(/玩家 UID 无效/)).toBeVisible();
  await expect(page.getByRole('slider', { name: '角色等级' })).toBeEnabled();
  await expect(page.locator('#equipment-recommendation')).toBeVisible();
  expect(requestCount).toBe(0);

  await page.goto('/characters/1304/?uid=100000002');
  await expect(page.getByText(/没有公开展示此角色/)).toBeVisible();
  await expect(page.getByRole('slider', { name: '角色等级' })).toBeEnabled();
  await expect(page.locator('#equipment-recommendation')).toBeVisible();

  await page.goto('/characters/1304/?uid=100000503');
  await expect(page.getByText(/玩家数据暂时无法加载/)).toBeVisible();
  await expect(page.getByRole('slider', { name: '角色等级' })).toBeEnabled();
  await expect(page.locator('#equipment-recommendation')).toBeVisible();
  expect(requestCount).toBe(2);
});
