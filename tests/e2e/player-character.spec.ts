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
          buildId: 'area:showcase:position:1:order:0',
          characterId: '1304',
          display: { area: 'showcase', position: 1, sourceOrder: 0 },
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
          lightCone: { lightConeId: '23023', rank: 2, level: 70, promotion: 6 },
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
              subAffixes: [
                { type: 'DefenceAddedRatio', display: '8.2%', percent: true, count: 2 },
                { type: 'HPDelta', display: '76', percent: false, count: 0 }
              ]
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

  await expect(page).toHaveURL(
    /\/characters\/1304\/\?uid=100000001&build=area%3Ashowcase%3Aposition%3A1%3Aorder%3A0$/
  );
  const playerContext = page.locator('.player-context-notice');
  await expect(playerContext).toBeVisible();
  await expect(playerContext).toContainText('100000001');
  await expect(playerContext.locator('a')).toHaveAttribute('href', '/player/?uid=100000001');
  expect(requestCount).toBe(1);

  const level = page.locator('#player-level');
  const levelValue = page.locator('.player-stats-panel .skill-level-control__value');
  const promotionTag = levelValue.locator('.skill-effect-tag');
  await expect(level).toBeDisabled();
  await expect(level).toHaveValue('80');
  await expect(promotionTag).toHaveText(/\S/);
  await expect(levelValue.locator('output')).not.toHaveText('');
  expect(
    await levelValue.evaluate((value) => {
      const tag = value.querySelector('.skill-effect-tag')!;
      const output = value.querySelector('output')!;
      return Boolean(tag.compareDocumentPosition(output) & Node.DOCUMENT_POSITION_FOLLOWING);
    })
  ).toBe(true);

  const basicLevel = page.locator('[data-skill-category="basic"] input[type="range"]');
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
  await expect(page.locator('.player-stats-panel button')).toHaveCount(0);
  await expect(page.locator('[data-player-stat="effect_hit"]')).toContainText('20%');
  await expect(page.locator('[data-player-stat="elation_dmg"] dt')).not.toHaveText('');
  await expect(page.locator('[data-player-stat="elation_dmg"] img')).toHaveAttribute(
    'src',
    '/generated-assets/relic-properties/IconJoy.png'
  );
  await expect(page.locator('[data-player-stat="sp_rate"]')).toContainText('124.4%');
  await expect(page.locator('#equipment')).toBeVisible();
  await expect(page.locator('#equipment-recommendation')).toHaveCount(0);
  const lightConeCard = page.locator('[data-player-light-cone="23023"]');
  await expect(lightConeCard).toContainText('命运从未公平');
  await expect(lightConeCard.getByRole('link')).toHaveAttribute(
    'href',
    '/light-cones/23023/?level=70&rank=2'
  );
  await expect(lightConeCard.locator('.player-light-cone__identity > span')).toHaveCount(2);
  await expect(lightConeCard.locator('.player-light-cone__progression > span')).toHaveCount(3);
  const lightConeArtworkFit = await lightConeCard
    .locator('.compact-entity-card__artwork')
    .evaluate((artwork) => {
      const image = artwork.querySelector('img')!;
      const artworkBounds = artwork.getBoundingClientRect();
      const imageBounds = image.getBoundingClientRect();
      const imageStyles = getComputedStyle(image);
      return {
        insetTop: imageBounds.top - artworkBounds.top,
        insetRight: artworkBounds.right - imageBounds.right,
        insetBottom: artworkBounds.bottom - imageBounds.bottom,
        insetLeft: imageBounds.left - artworkBounds.left,
        objectFit: imageStyles.objectFit,
        transform: imageStyles.transform
      };
    });
  expect(lightConeArtworkFit.objectFit).toBe('contain');
  expect(lightConeArtworkFit.transform).toBe('none');
  expect(
    [
      lightConeArtworkFit.insetTop,
      lightConeArtworkFit.insetRight,
      lightConeArtworkFit.insetBottom,
      lightConeArtworkFit.insetLeft
    ].every((inset) => inset >= 3)
  ).toBe(true);
  await expect(page.locator('[data-player-relic-slot]')).toHaveCount(6);
  await expect(page.locator('[data-player-relic-slot="BODY"]')).toHaveAttribute(
    'href',
    '/relics/103/'
  );
  await expect(page.locator('[data-player-relic-slot="NECK"]')).toHaveAttribute(
    'href',
    '/relics/310/'
  );
  await expect(
    page.locator('[data-player-relic-slot="BODY"] [data-recommended="true"]')
  ).toHaveCount(2);
  const subAffixHeights = await page
    .locator('[data-player-relic-slot="BODY"] .player-relic-card__affixes--sub .player-affix-row')
    .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(subAffixHeights).toHaveLength(2);
  expect(Math.abs(subAffixHeights[0] - subAffixHeights[1])).toBeLessThanOrEqual(1);
  const relicIconContainment = await page.locator('[data-player-relic-slot]').evaluateAll((cards) =>
    cards.map((card) => {
      const header = card.querySelector('header')!.getBoundingClientRect();
      const icon = card.querySelector<HTMLElement>('[data-relic-icon-presentation="header"]')!;
      const bounds = icon.getBoundingClientRect();
      return (
        bounds.left >= header.left - 1 &&
        bounds.top >= header.top - 1 &&
        bounds.right <= header.right + 1 &&
        bounds.bottom <= header.bottom + 1
      );
    })
  );
  expect(relicIconContainment.every(Boolean)).toBe(true);
  const lightConeRadius = await lightConeCard
    .getByRole('link')
    .evaluate((card) => getComputedStyle(card).borderRadius);
  const relicCardGeometry = await page.locator('[data-player-relic-slot]').evaluateAll((cards) =>
    cards.map((card) => {
      const cardBounds = card.getBoundingClientRect();
      const trackedContent = [
        card.querySelector('[data-relic-icon-presentation="header"]'),
        card.querySelector('.player-relic-card__level'),
        card.querySelector('.player-relic-card__affixes--main .player-affix-row'),
        ...card.querySelectorAll('.player-relic-card__affixes--sub .player-affix-row')
      ].filter((element): element is Element => element !== null);
      return {
        radius: getComputedStyle(card).borderRadius,
        contentContained: trackedContent.every((element) => {
          const bounds = element.getBoundingClientRect();
          return (
            bounds.left >= cardBounds.left - 1 &&
            bounds.top >= cardBounds.top - 1 &&
            bounds.right <= cardBounds.right + 1 &&
            bounds.bottom <= cardBounds.bottom + 1
          );
        })
      };
    })
  );
  expect(relicCardGeometry).toHaveLength(6);
  expect(relicCardGeometry.every(({ radius }) => radius === lightConeRadius)).toBe(true);
  expect(relicCardGeometry.every(({ contentContained }) => contentContained)).toBe(true);

  const contextBounds = await page
    .locator('.detail-profile-hero__character-content')
    .evaluate((content) => {
      const context = content.querySelector<HTMLElement>('.detail-profile-hero__player-context')!;
      const identity = content.querySelector<HTMLElement>('.hero-identity-copy')!;
      return {
        contextBottom: context.getBoundingClientRect().bottom,
        identityTop: identity.getBoundingClientRect().top
      };
    });
  expect(contextBounds.contextBottom).toBeLessThanOrEqual(contextBounds.identityTop + 1);

  if (isMobile) {
    await expect(lightConeCard.locator('.player-light-cone__progression')).toHaveCSS(
      'display',
      'flex'
    );
    const progressionRows = await lightConeCard
      .locator('.player-light-cone__progression > span')
      .evaluateAll(
        (items) => new Set(items.map((item) => Math.round(item.getBoundingClientRect().y))).size
      );
    expect(progressionRows).toBe(1);
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
    await expect(lightConeCard.locator('.player-light-cone__progression')).toHaveCSS(
      'display',
      'grid'
    );
    await expect(page.locator('.detail-profile-hero--character')).toHaveCSS(
      'grid-template-columns',
      /\S+\s+\S+/
    );
    await page.setViewportSize({ width: 1180, height: 900 });
    const stackedColumns = await page
      .locator('.detail-profile-hero--character')
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/));
    expect(stackedColumns).toHaveLength(1);

    await page.setViewportSize({ width: 900, height: 900 });
    const mediumRelicColumns = await page
      .locator('.player-equipment__relic-grid')
      .evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).filter(Boolean)
      );
    expect(mediumRelicColumns).toHaveLength(2);
  }

  await lightConeCard.getByRole('link').click();
  await expect(page).toHaveURL(/\/light-cones\/23023\/\?level=70&rank=2$/);
  const lightConeLevel = page.locator('#light-cone-level-23023');
  await expect(lightConeLevel).toBeEnabled();
  await expect(lightConeLevel).toHaveValue('70');
  const rank = page.locator('#superimposition-level-23023');
  await expect(rank).toBeEnabled();
  await expect(rank).toHaveAttribute('aria-valuenow', '2');
  await lightConeLevel.fill('42');
  await rank.fill('3');
  await expect(lightConeLevel).toHaveValue('42');
  await expect(rank).toHaveAttribute('aria-valuenow', '4');

  await page.goto('/en/characters/1304/?uid=100000001');
  await expect(page.locator('.player-stats-panel .skill-effect-tag')).toHaveText(/\S/);
  await expect(page.locator('[data-player-stat="elation_dmg"] dt')).not.toHaveText('');
  await expect(page.locator('[data-player-stat="elation_dmg"]')).not.toContainText('elation_dmg');
  await expect(page.locator('[data-player-light-cone="23023"] a')).toHaveAttribute(
    'href',
    '/en/light-cones/23023/?level=70&rank=2'
  );
  await expect(page.locator('[data-player-relic-slot="BODY"]')).toHaveAttribute(
    'href',
    '/en/relics/103/'
  );

  await page.goto('/characters/1304/');
  const staticLevel = page.locator('#character-level-1304');
  await expect(staticLevel).toBeEnabled();
  await expect(page.locator('.base-stats-panel .skill-effect-tag')).toHaveCount(0);
  await expect(page.locator('[data-player-stats-panel]')).toHaveCount(0);
  await expect(page.locator('#eidolons [data-player-state]')).toHaveCount(0);
  await expect(page.locator('#equipment-recommendation')).toBeVisible();
  await expect(page.locator('#equipment')).toHaveCount(0);
});

test('presents relic scores and target details without changing the Player request flow', async ({
  page,
  isMobile
}) => {
  let playerRequests = 0;
  await page.route('**/api/player/**', async (route) => {
    playerRequests += 1;
    const uid = new URL(route.request().url()).searchParams.get('uid') ?? '';
    const fixture = playerProfile(uid);
    Object.assign(fixture.characters[0], {
      relicScore: {
        version: 1,
        build: {
          status: 'available',
          score: 86.6,
          coreScore: 85.2,
          statCompletion: 0.825,
          setIntegrity: 2 / 3,
          effectiveHits: {
            status: 'partial',
            known: 23,
            unknownRecommendedSubstats: 2,
            total: null
          },
          softTarget: {
            progress: 0.75,
            details: [
              {
                stat: 'StatusResistanceBase',
                currentValue: 0.5,
                minimumThreshold: 0,
                maximumThreshold: 0.8,
                progress: 0.625
              }
            ]
          },
          hardBreakpoint: {
            failureRatio: 0,
            details: [{ stat: 'SpeedDelta', currentValue: 200, threshold: 200, passed: true }]
          }
        },
        pieces: Object.fromEntries(
          ['HEAD', 'HAND', 'BODY', 'FOOT', 'NECK', 'OBJECT'].map((slot, index) => [
            slot,
            index === 2
              ? { status: 'unavailable', reason: 'piece-unavailable' }
              : {
                  status: 'available',
                  score: index === 0 ? 0 : index === 1 ? 99.6 : 82.4,
                  mainCompletion: 1,
                  benchmarkPercentile: 0.7,
                  rawSubUtility: 10,
                  effectiveHits: {
                    status: 'exact',
                    known: 4,
                    unknownRecommendedSubstats: 0,
                    total: 4
                  }
                }
          ])
        )
      }
    });
    await route.fulfill({ json: fixture });
  });
  await page.route('**/generated/en/player-equipment.json', async (route) => {
    await route.fulfill({
      json: {
        schemaVersion: 1,
        locale: 'en',
        lightCones: [],
        relicSets: [
          {
            id: '103',
            name: 'Knight of Purity Palace with an intentionally long English set name',
            pieces: ['HEAD', 'HAND', 'BODY', 'FOOT'].map((slot, index) => ({
              id: `3103${index + 1}`,
              slot,
              name: `A long English relic name for the ${slot.toLowerCase()} slot and responsive layout`
            }))
          },
          {
            id: '310',
            name: 'A similarly long planar ornament set name for responsive layout',
            pieces: ['NECK', 'OBJECT'].map((slot, index) => ({
              id: `3310${index + 1}`,
              slot,
              name: `A long English planar relic name for the ${slot.toLowerCase()} slot`
            }))
          }
        ]
      }
    });
  });

  await page.goto(
    '/en/characters/1304/?uid=100000001&build=area%3Ashowcase%3Aposition%3A1%3Aorder%3A0'
  );
  const summary = page.locator('[data-player-relic-score-summary]');
  await expect(summary).toBeVisible();
  await expect(summary.locator('[data-player-build-score]')).toHaveText('86.6');
  await expect(summary.locator('[data-player-effective-hits]')).toContainText('23');
  await expect(summary.locator('[data-player-soft-target]')).toContainText('75%');
  await expect(summary.locator('[data-player-hard-breakpoint]')).toBeVisible();
  const readSummaryLayout = () =>
    summary.evaluate((element) => {
      const strip = element.querySelector('[data-player-score-breakdown]')!;
      return {
        stripInside:
          strip.getBoundingClientRect().right <= element.getBoundingClientRect().right + 1,
        canScroll: strip.scrollWidth > strip.clientWidth
      };
    });
  const layout = await readSummaryLayout();
  expect(layout.stripInside).toBe(true);
  if (isMobile) {
    expect(layout.canScroll).toBe(true);
    await summary.locator('[data-player-score-breakdown]').focus();
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(() =>
        summary.locator('[data-player-score-breakdown]').evaluate((strip) => strip.scrollLeft)
      )
      .toBeGreaterThan(0);
  }
  await expect(page.locator('[data-player-relic-piece-score]')).toHaveCount(6);
  await expect(
    page.locator('[data-player-relic-slot="HEAD"] [data-player-relic-piece-score] strong')
  ).toHaveText('0.0');
  await expect(
    page.locator('[data-player-relic-slot="HAND"] [data-player-relic-piece-score] strong')
  ).toHaveText('99.6');
  await expect(
    page.locator('[data-player-relic-slot="HAND"] [data-player-relic-piece-score]')
  ).toHaveAttribute('aria-label', /99\.6/);
  await expect(
    page.locator('[data-player-relic-slot="BODY"] [data-player-relic-piece-score]')
  ).toContainText('—');
  expect(playerRequests).toBe(1);

  const details = summary.locator('[data-player-score-details]');
  await details.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await expect(details).toContainText('50.0%');
  await expect(details).toContainText('200');
  await expect(details).not.toContainText('StatusResistanceBase');
  await expect(details).not.toContainText('SpeedDelta');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
  if (!isMobile) {
    await page.setViewportSize({ width: 900, height: 800 });
    const tabletLayout = await readSummaryLayout();
    expect(tabletLayout.stripInside).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
    ).toBeLessThanOrEqual(1);
  }
});

test('keeps piece scores when a five-piece build cannot be scored', async ({ page }) => {
  await page.route('**/api/player/**', async (route) => {
    const uid = new URL(route.request().url()).searchParams.get('uid') ?? '';
    const fixture = playerProfile(uid);
    fixture.characters[0].relics.pop();
    Object.assign(fixture.characters[0], {
      relicScore: {
        version: 1,
        build: { status: 'unavailable', reason: 'incomplete-build' },
        pieces: Object.fromEntries(
          ['HEAD', 'HAND', 'BODY', 'FOOT', 'NECK'].map((slot) => [
            slot,
            {
              status: 'available',
              score: 84.5,
              mainCompletion: 1,
              benchmarkPercentile: 0.7,
              rawSubUtility: 10,
              effectiveHits: {
                status: 'exact',
                known: 4,
                unknownRecommendedSubstats: 0,
                total: 4
              }
            }
          ])
        )
      }
    });
    await route.fulfill({ json: fixture });
  });

  await page.goto(
    '/characters/1304/?uid=100000001&build=area%3Ashowcase%3Aposition%3A1%3Aorder%3A0'
  );
  const summary = page.locator('[data-player-relic-score-summary]');
  await expect(summary.locator('[data-player-build-score]')).toHaveText('—');
  await expect(summary.locator('[data-player-build-score-unavailable]')).toBeVisible();
  await expect(page.locator('[data-player-relic-piece-score]')).toHaveCount(5);
  await expect(
    page.locator('[data-player-relic-slot="HEAD"] [data-player-relic-piece-score] strong')
  ).toHaveText('84.5');
  await expect(page.locator('[data-player-relic-slot="OBJECT"]')).toHaveAttribute(
    'data-player-relic-state',
    'empty'
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
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
  await expect(page.locator('.player-context-notice--fallback')).toBeVisible();
  await expect(page.locator('#character-level-1304')).toBeEnabled();
  await expect(page.locator('#equipment-recommendation')).toBeVisible();
  expect(requestCount).toBe(0);

  await page.goto('/characters/1304/?uid=100000002');
  await expect(page.locator('.player-context-notice--fallback')).toBeVisible();
  await expect(page.locator('#character-level-1304')).toBeEnabled();
  await expect(page.locator('#equipment-recommendation')).toBeVisible();

  await page.goto('/characters/1304/?uid=100000503');
  await expect(page.locator('.player-context-notice--fallback')).toBeVisible();
  await expect(page.locator('#character-level-1304')).toBeEnabled();
  await expect(page.locator('#equipment-recommendation')).toBeVisible();
  expect(requestCount).toBe(2);
});
