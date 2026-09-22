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
    characters: options.empty
      ? []
      : [
          {
            buildId: 'area:assist:position:1:order:0',
            characterId: '1001',
            display: { area: 'assist', position: 1, sourceOrder: 0 }
          },
          {
            buildId: 'area:showcase:position:1:order:1',
            characterId: '1001',
            display: { area: 'showcase', position: 1, sourceOrder: 1 }
          },
          {
            buildId: 'area:unknown:position:none:order:2',
            characterId: '1999',
            display: { area: 'unknown', sourceOrder: 2 }
          }
        ]
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
  page,
  isMobile
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/player/**', async (route) => {
    const uid = new URL(route.request().url()).searchParams.get('uid') ?? '';
    await gate;
    await route.fulfill({ json: profile(uid, { nickname: 'Synthetic Player' }) });
  });

  await page.goto('/player/');
  await expect(page.locator('.player-page__heading h1')).toBeVisible();
  await page.locator('#player-uid-input').fill(' 100000001 ');
  await page.locator('.player-uid-form button[type="submit"]').click();

  await expect(page).toHaveURL(/\/player\/\?uid=100000001$/);
  await expect(page.locator('.player-query-state[role="status"]')).toBeVisible();
  release();

  await expect(page.getByRole('heading', { name: 'Synthetic Player' })).toBeVisible();
  await expect(page.locator('.unknown-character')).toContainText('1999');
  await expect(
    page.locator('img[src="/generated-assets/player-avatars/201001.png"]')
  ).toBeVisible();
  await expect(page.locator('img[src*="remote-icon-must-not-be-used"]')).toHaveCount(0);
  await expect(page.locator('a[href="https://enka.network/"]').first()).toBeVisible();
  await expect(page.locator('#player-support-characters')).toBeVisible();
  await expect(page.locator('#player-companion-characters')).toBeVisible();
  await expect(page.locator('[aria-labelledby="player-support-characters"] a')).toHaveCount(1);
  await expect(page.locator('[aria-labelledby="player-companion-characters"] a')).toHaveCount(1);
  const heroStyles = await page.locator('.player-hero').evaluate((hero) => {
    const details = hero.querySelector<HTMLElement>('.player-hero__details')!;
    const avatar = hero.querySelector<HTMLElement>('.player-hero__avatar')!;
    const metadataRow = hero.querySelector<HTMLElement>('.player-hero__metadata > div')!;
    const countLabel = hero.querySelector<HTMLElement>('.player-hero__counts dt')!;
    const countValue = hero.querySelector<HTMLElement>('.player-hero__counts dd')!;
    return {
      detailsJustify: getComputedStyle(details).justifyContent,
      avatarAlign: getComputedStyle(avatar).alignSelf,
      metadataAlign: getComputedStyle(metadataRow).alignItems,
      labelSize: Number.parseFloat(getComputedStyle(countLabel).fontSize),
      labelWeight: Number.parseInt(getComputedStyle(countLabel).fontWeight, 10),
      valueSize: Number.parseFloat(getComputedStyle(countValue).fontSize),
      valueWeight: Number.parseInt(getComputedStyle(countValue).fontWeight, 10)
    };
  });
  expect(heroStyles.detailsJustify).toBe('center');
  expect(heroStyles.avatarAlign).toBe('center');
  expect(heroStyles.metadataAlign).toBe('center');
  expect(heroStyles.labelSize).toBeGreaterThanOrEqual(13);
  expect(heroStyles.labelWeight).toBeGreaterThanOrEqual(600);
  expect(heroStyles.valueSize).toBeGreaterThanOrEqual(30);
  expect(heroStyles.valueSize).toBeGreaterThan(heroStyles.labelSize);
  expect(heroStyles.valueWeight).toBeGreaterThanOrEqual(700);
  expect(heroStyles.valueWeight).toBeLessThan(800);
  await expect(page.getByRole('link', { name: /三月七/ }).first()).toHaveAttribute(
    'href',
    '/characters/1001/?uid=100000001&build=area%3Aassist%3Aposition%3A1%3Aorder%3A0'
  );

  if (!isMobile) await page.setViewportSize({ width: 768, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
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
  await expect(page.locator('.player-query-state--error')).toBeVisible();
  await expect(page.getByText('private upstream message')).toHaveCount(0);
  await expect(page.locator('.player-query-state--error button')).toHaveCount(0);
});

test('preserves locale and reuses the SPA cache across browser history', async ({ page }) => {
  const requests = new Map<string, number>();
  await mockPlayerApi(page, (uid) => requests.set(uid, (requests.get(uid) ?? 0) + 1));

  await page.goto('/en/player/?uid=100000001');
  await expect(page.getByRole('heading', { name: 'Player 100000001' })).toBeVisible();
  await expect(page.locator('a[href="https://enka.network/"]').first()).toBeVisible();
  await expect(page.locator('.player-characters__empty')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /March 7th/ }).first()).toHaveAttribute(
    'href',
    '/en/characters/1001/?uid=100000001&build=area%3Aassist%3Aposition%3A1%3Aorder%3A0'
  );

  await page.locator('#player-uid-input').fill('100000002');
  await page.locator('.player-uid-form button[type="submit"]').click();
  await expect(page.getByRole('heading', { name: 'Player 100000002' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Player 100000001' })).toBeVisible();
  expect(requests.get('100000001')).toBe(1);
  expect(requests.get('100000002')).toBe(1);
});
