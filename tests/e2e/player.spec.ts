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

test('failed player images preserve profile metadata and character identity', async ({
  page
}, testInfo) => {
  await mockPlayerApi(page);
  await page.route(
    (url) => url.pathname.startsWith('/generated-assets/'),
    (route) => route.abort()
  );
  await page.goto('/player/?uid=100000001');
  await expect(page.getByRole('heading', { name: 'Player 100000001' })).toBeVisible();
  const avatar = page.locator('.player-hero__avatar');
  await expect(avatar.locator('[data-image-fallback]')).toHaveText('?');
  await expect(avatar.getByRole('img')).toHaveAttribute('aria-label', /Player 100000001/);
  const character = page.locator('.entity-overview-card__artwork').first();
  await character.scrollIntoViewIfNeeded();
  await expect(character.locator('[data-image-fallback]')).toHaveText('?');
  await expect(page.locator('.unknown-character')).toContainText('1999');
  await expect(page.locator('.player-hero__uid')).toHaveText('100000001');
  await page.screenshot({ path: testInfo.outputPath('player-missing-images.png') });
});

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
  await expect(page.locator('[data-app-ready]')).toHaveAttribute('data-app-ready', 'true');
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
  await expect(page.locator('.player-hero [data-slot="card"]')).toHaveCount(1);
  await expect(page.locator('.player-hero__counts dd')).toHaveText(['-', '0', '-']);
  expect(
    await page
      .locator('.player-hero__counts dd')
      .first()
      .evaluate((element) => getComputedStyle(element).fontVariantNumeric)
  ).toContain('tabular-nums');
  await expect(page.getByRole('link', { name: /三月七/ }).first()).toHaveAttribute(
    'href',
    '/characters/1001/?uid=100000001&build=area%3Aassist%3Aposition%3A1%3Aorder%3A0&from=player'
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
    '/en/characters/1001/?uid=100000001&build=area%3Aassist%3Aposition%3A1%3Aorder%3A0&from=player'
  );

  await page.locator('#player-uid-input').fill('100000002');
  await page.locator('.player-uid-form button[type="submit"]').click();
  await expect(page.getByRole('heading', { name: 'Player 100000002' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Player 100000001' })).toBeVisible();
  expect(requests.get('100000001')).toBe(1);
  expect(requests.get('100000002')).toBe(1);
});

for (const prefix of ['', '/en']) {
  test(`player validation, typed errors and retry ${prefix || 'zh-CN'}`, async ({ page }) => {
    const cases = [
      ['100000404', 404, 'PLAYER_NOT_FOUND'],
      ['100000429', 429, 'RATE_LIMITED', 37],
      ['100000430', 429, 'RATE_LIMITED'],
      ['100000504', 504, 'UPSTREAM_TIMEOUT'],
      ['100000502', 502, 'UPSTREAM_INVALID_RESPONSE'],
      ['100000400', 400, 'INVALID_UID'],
      ['100000503', 503, 'UPSTREAM_UNAVAILABLE']
    ] as const;
    const requests = new Map<string, number>();
    await page.route('**/api/player/**', async (route) => {
      const uid = new URL(route.request().url()).searchParams.get('uid')!;
      requests.set(uid, (requests.get(uid) ?? 0) + 1);
      const scenario = cases.find((item) => item[0] === uid);
      if (!scenario || (uid === '100000503' && requests.get(uid)! > 1))
        return route.fulfill({ json: profile(uid) });
      await route.fulfill({
        status: scenario[1],
        json: {
          error: {
            code: scenario[2],
            retryable: scenario[1] >= 429,
            ...(scenario.length === 4 ? { retryAfterSeconds: scenario[3] } : {})
          },
          detail: 'private-upstream-detail'
        }
      });
    });
    await page.goto(`${prefix}/player/`);
    await expect(page.locator('[data-app-ready]')).toHaveAttribute('data-app-ready', 'true');
    const input = page.locator('#player-uid-input');
    const submit = page.locator('.player-uid-form button[type=submit]');
    await expect(page.locator('.player-query-state[aria-live=polite]')).toBeVisible();
    for (const invalid of ['', '   ', 'abc', '-123', '1e8']) {
      await input.fill(invalid);
      await input.press('Enter');
      await expect(page.locator('#player-uid-error')).toBeVisible();
      await expect(input).toHaveAttribute('aria-describedby', 'player-uid-error');
      await expect(input).toHaveAttribute('aria-invalid', 'true');
    }
    expect(requests.size).toBe(0);
    await input.fill('1');
    await expect(page.locator('#player-uid-error')).toHaveCount(0);
    for (const scenario of cases) {
      await input.fill(scenario[0]);
      await input.press('Enter');
      await expect(page).toHaveURL(new RegExp(`uid=${scenario[0]}$`));
      const error = page.locator('.player-query-state--error');
      await expect(error).toBeVisible();
      await expect(error).toHaveAttribute('aria-live', 'assertive');
      await expect(page.locator('[role=alert]')).toHaveCount(1);
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      const text = await error.innerText();
      expect(text.trim()).not.toBe('');
      expect(/[\u3400-\u9fff]/u.test(text)).toBe(!prefix);
      expect(text).not.toContain('private-upstream-detail');
      if (scenario.length === 4) expect(text).toContain(String(scenario[3]));
      await expect(error.locator('button,a')).toHaveCount(0);
    }
    // Failed requests are not cached; resubmitting the same URL still works.
    await submit.click();
    await expect(page.locator('#player-profile-name')).toHaveText('Player 100000503');
    expect(requests.get('100000503')).toBe(2);
    await page.goto(`${prefix}/player/?uid=abc`);
    await expect(page.locator('.player-query-state--error')).toBeVisible();
    expect(requests.has('abc')).toBe(false);
  });

  test(`player loading, stale response and cached history ${prefix || 'zh-CN'}`, async ({
    page
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const requests = new Map<string, number>();
    await page.route('**/api/player/**', async (route) => {
      const uid = new URL(route.request().url()).searchParams.get('uid')!;
      requests.set(uid, (requests.get(uid) ?? 0) + 1);
      if (uid === '100000002') await gate;
      await route.fulfill({ json: profile(uid) });
    });
    await page.goto(`${prefix}/player/?uid=100000001`);
    const name = page.locator('#player-profile-name');
    await expect(name).toHaveText('Player 100000001');
    const input = page.locator('#player-uid-input');
    const submit = page.locator('.player-uid-form button[type=submit]');
    await input.fill(' 100000002 ');
    await input.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${prefix}/player/\\?uid=100000002$`));
    await expect(page.locator('.player-query-state[role=status]')).toBeVisible();
    await expect(submit).toBeDisabled();
    await expect(input).toBeEnabled();
    await input.fill('100000003');
    expect(requests.has('100000003')).toBe(false);
    await page.goBack();
    await expect(name).toHaveText('Player 100000001');
    const response = page.waitForResponse(
      (r) => r.url().includes('/api/player/') && r.url().includes('100000002')
    );
    release();
    await (await response).finished();
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    );
    await expect(name).toHaveText('Player 100000001');
    await expect(input).toHaveValue('100000001');
    await page.goForward();
    await expect(name).toHaveText('Player 100000002');
    await submit.click();
    await expect(name).toHaveText('Player 100000002');
    expect(requests.get('100000001')).toBe(1);
    expect(requests.get('100000002')).toBe(1);
    await page.goBack();
    await expect(name).toHaveText('Player 100000001');
    await page.goForward();
    await expect(name).toHaveText('Player 100000002');
  });

  test(`player compact layout ${prefix || 'zh-CN'}`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'Explicit viewport matrix runs once in desktop Chromium');
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/player/**', (route) =>
      route.fulfill({ json: { ...profile('100000001'), avatar: null } })
    );
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const width of [320, 390, 768, 1280, 1600]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${prefix}/player/?uid=100000001`);
      await expect(page.locator('#player-profile-name')).toBeVisible();
      if (width >= 1280) {
        await page.locator('[data-sidebar=trigger]').click();
        await expect(page.locator('[data-slot=sidebar][data-state]')).toHaveAttribute(
          'data-state',
          'expanded'
        );
        await expect
          .poll(() =>
            page
              .locator('[data-slot=sidebar-container]')
              .evaluate((el) =>
                Math.abs(
                  el.getBoundingClientRect().width -
                    parseFloat(getComputedStyle(el).getPropertyValue('--sidebar-width')) *
                      parseFloat(getComputedStyle(document.documentElement).fontSize)
                )
              )
          )
          .toBeLessThanOrEqual(1);
      }
      await expect(page.locator('.player-hero__avatar [data-image-fallback]')).toBeVisible();
      await expect(page.locator('.player-hero__counts dd')).toHaveText(['-', '0', '-']);
      await expect(
        page.locator('[aria-labelledby=player-support-characters] .overview-grid')
      ).toHaveCount(1);
      await expect(
        page.locator('[aria-labelledby=player-companion-characters] .overview-grid')
      ).toHaveCount(1);
      await expect(page.locator('[aria-labelledby=player-support-characters] a')).toHaveCount(1);
      await expect(page.locator('[aria-labelledby=player-companion-characters] a')).toHaveCount(1);
      await expect(page.locator('.unknown-character')).toContainText('1999');
      if ([390, 1280].includes(width))
        await page.screenshot({ path: `data/audit/phase6c-${prefix ? 'en' : 'zh'}-${width}.png` });
      await page
        .locator('#player-profile-name')
        .evaluate((el) => (el.textContent = 'SyntheticLongName'.repeat(30)));
      await page
        .locator('.player-hero__signature dd')
        .evaluate((el) => (el.textContent = 'First line\n' + 'Unbroken'.repeat(60)));
      await page
        .locator('.unknown-character p')
        .evaluate((el) => (el.textContent = '9'.repeat(80)));
      for (const selector of [
        '#player-profile-name',
        '.player-hero__signature dd',
        '.unknown-character p'
      ])
        expect(
          await page.locator(selector).evaluate((el) => el.scrollWidth - el.clientWidth)
        ).toBeLessThanOrEqual(1);
      const hero = page.locator('.player-hero');
      const available = await hero.evaluate((el) => el.clientWidth);
      await expect
        .poll(() =>
          page
            .locator('.player-hero__layout')
            .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
        )
        .toBe(available >= 768 ? 2 : 1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        )
      ).toBeLessThanOrEqual(1);
    }
    // Both sides of the profile's own 48rem boundary.
    await page.locator('.player-hero').evaluate((el) => (el.style.width = '767px'));
    await expect
      .poll(() =>
        page
          .locator('.player-hero__layout')
          .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
      )
      .toBe(1);
    await page.locator('.player-hero').evaluate((el) => (el.style.width = '768px'));
    await expect
      .poll(() =>
        page
          .locator('.player-hero__layout')
          .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
      )
      .toBe(2);
    await page.route('**/api/player/**', (route) =>
      route.fulfill({ json: profile('100000004', { empty: true }) })
    );
    await page.goto(`${prefix}/player/?uid=100000004`);
    await expect(page.locator('.player-characters__empty')).toHaveCount(2);
    await expect(page.locator('.player-characters a')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
