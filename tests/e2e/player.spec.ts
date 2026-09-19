import { expect, test, type Page } from '@playwright/test';

function profile(uid: string, options: { empty?: boolean; nickname?: string } = {}) {
  return {
    uid,
    nickname: options.nickname ?? `Player ${uid}`,
    level: 70,
    worldLevel: 6,
    avatar: { id: '201001', icon: 'remote-icon-must-not-be-used.png' },
    signature: 'Synthetic fixture\nSecond line',
    characterCount: null,
    lightConeCount: 0,
    achievementCount: null,
    characters: options.empty ? [] : [{ characterId: '1001' }, { characterId: '1999' }]
  };
}

async function mockPlayerApi(page: Page, onRequest?: (uid: string) => void) {
  await page.route('**/api/player/**', async (route) => {
    const uid = new URL(route.request().url()).searchParams.get('uid') ?? '';
    onRequest?.(uid);
    await route.fulfill({ json: profile(uid) });
  });
}

test('submitting a UID updates the URL before rendering Player Hero and character fallbacks', async ({
  page
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/player/**', async (route) => {
    const uid = new URL(route.request().url()).searchParams.get('uid') ?? '';
    await gate;
    await route.fulfill({ json: profile(uid, { nickname: 'Synthetic Player' }) });
  });

  await page.goto('/player/');
  await expect(page.getByRole('heading', { name: '玩家信息', exact: true })).toBeVisible();
  await page.getByLabel('玩家 UID').fill(' 100000001 ');
  await page.getByRole('button', { name: '查询' }).click();

  await expect(page).toHaveURL(/\/player\/\?uid=100000001$/);
  await expect(page.getByText('正在查询玩家信息…')).toBeVisible();
  release();

  await expect(page.getByRole('heading', { name: 'Synthetic Player' })).toBeVisible();
  await expect(page.getByText('ID 1999')).toBeVisible();
  await expect(
    page.locator('img[src="/generated-assets/player-avatars/201001.png"]')
  ).toBeVisible();
  await expect(page.locator('img[src*="remote-icon-must-not-be-used"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /三月七/ })).toHaveAttribute(
    'href',
    '/characters/1001/?uid=100000001'
  );
});

test('maps a typed API error without exposing raw server text', async ({ page }) => {
  await page.route('**/api/player/**', async (route) => {
    await route.fulfill({
      status: 503,
      json: {
        error: { code: 'UPSTREAM_UNAVAILABLE', retryable: true },
        detail: 'private upstream message'
      }
    });
  });

  await page.goto('/player/?uid=100000503');
  await expect(page.getByText('玩家信息服务暂时不可用，请稍后重试。')).toBeVisible();
  await expect(page.getByText('private upstream message')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '重试' })).toHaveCount(0);
});

test('preserves locale and reuses the SPA cache across browser history', async ({ page }) => {
  const requests = new Map<string, number>();
  await mockPlayerApi(page, (uid) => requests.set(uid, (requests.get(uid) ?? 0) + 1));

  await page.goto('/en/player/?uid=100000001');
  await expect(page.getByRole('heading', { name: 'Player 100000001' })).toBeVisible();
  await expect(page.getByText('No public characters')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /March 7th/ })).toHaveAttribute(
    'href',
    '/en/characters/1001/?uid=100000001'
  );

  await page.getByLabel('Player UID').fill('100000002');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('heading', { name: 'Player 100000002' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Player 100000001' })).toBeVisible();
  expect(requests.get('100000001')).toBe(1);
  expect(requests.get('100000002')).toBe(1);
});
