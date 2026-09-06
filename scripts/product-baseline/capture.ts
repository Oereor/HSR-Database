import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CharacterDetailIconKey } from '../../src/lib/domain/character-detail-icons.js';
import { parseCharacterDetailIconKey } from '../../src/lib/domain/character-detail-icons.js';
import type { EndgameGroup, EndgameModeDataset } from '../../src/lib/domain/endgame.js';
import {
  buildGroupView,
  buildPeriodView,
  endgameEnemyReferenceKey,
  ENDGAME_MODES,
  recommendedGroupId,
  resolveEndgameEnemyReference,
  type EndgameEnemyDetailSource,
  type EndgameEnemyReference
} from '../../src/lib/domain/endgame-view.js';
import type { GlobalSearchIndex } from '../../src/lib/domain/search-index.js';
import type {
  CatalogEntry,
  Character,
  DataManifest,
  Enemy,
  EnemyCatalogEntry,
  HomepageRecentWarpData,
  RelicCatalogEntry,
  RelicProperty,
  RelicSet
} from '../../src/lib/domain/types.js';
import type { VisualAssetManifest } from '../../src/lib/domain/visual-assets.js';
import { buildCharacterDomain } from '../../scripts/data/domain/character.js';
import { loadCharacterDomainTables } from '../../scripts/data/character-sources.js';
import {
  createGlobalSearchService,
  type GlobalSearchCatalogs
} from '../../src/lib/search/search.js';
import { loadEnemyPortraitMap } from '../../src/lib/server/enemy-assets.js';
import { m } from '../../src/lib/paraglide/messages.js';
import { NAVIGATION_ITEMS } from '../../src/lib/navigation.js';
import { SITE_NAME } from '../../src/lib/site.js';
import {
  readAssetManifest,
  readAssetRequirements,
  readCharacterDetailIconSources
} from '../assets/shared.js';
import { assertAssetRoot, resolveAssetRoot } from '../assets/paths.js';
import {
  assertDataRoot,
  auditRoot,
  generatedRoot,
  siteRoot,
  staticGeneratedRoot
} from '../data/paths.js';
import type { TextDiagnosticKind, TextDiagnosticSummary } from '../data/localization.js';
import { canonicalize, ContentRegistry, withoutObjectKeys } from './canonical.js';
import {
  PRODUCT_BASELINE_FIXTURE_FORMAT_VERSION,
  type ProductBaselineCapture,
  type StableEntityArea
} from './model.js';

const localeRoot = path.join(generatedRoot, 'views', 'zh-CN');
const CHARACTER_INTERNAL_FIELDS = new Set(['order']);
const RECOMMENDATION_REFERENCE_TIME = Date.parse('2026-09-05T00:00:00Z');

async function json<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

function fileDigest(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function profilePresentation(profile: Record<string, any>) {
  return {
    energyControlRendered: !!profile.energy,
    specialEffectDialogRendered: profile.specialEffects.length > 0,
    skillCards: profile.skillCards.map((card: Record<string, any>) => {
      const fixedVariants = card.variants.filter(
        (variant: Record<string, any>) => !variant.progressionId
      );
      return {
        category: card.category,
        iconRendered: !!card.iconKey,
        progressionLevelControls: card.progressions.map((progression: Record<string, any>) => ({
          id: progression.id,
          defaultLevel: progression.defaultLevel,
          availableLevels: progression.availableLevels,
          rendered: progression.availableLevels.length > 1
        })),
        fixedVariantDividerRendered: card.progressions.length > 0 && fixedVariants.length > 0,
        variants: card.variants.map((variant: Record<string, any>) => ({
          id: variant.id,
          levelLabelRendered: !variant.progressionId && card.category !== 'technique',
          descriptionFallbackRendered: !variant.levels[0]?.descriptionTokens?.length
        }))
      };
    }),
    tracesFallbackRendered: profile.traces.length === 0,
    eidolonsFallbackRendered: profile.eidolons.length === 0
  };
}

function characterSemantic(detail: Character, catalog: CatalogEntry) {
  const normalized = withoutObjectKeys(detail, CHARACTER_INTERNAL_FIELDS) as Record<string, any>;
  return canonicalize({
    catalog,
    detail: normalized,
    presentation: {
      route: `/characters/${detail.id}`,
      subtitleRendered: !!detail.fullName && detail.fullName !== detail.name,
      descriptionFallbackRendered: !detail.description,
      enhancedToggleRendered: !!detail.profiles.enhanced,
      profiles: Object.fromEntries(
        Object.entries(detail.profiles).map(([name, profile]) => [
          name,
          profilePresentation(profile as Record<string, any>)
        ])
      )
    }
  });
}

function lightConeSemantic(detail: Record<string, any>, catalog: CatalogEntry) {
  return canonicalize({
    catalog,
    detail,
    presentation: {
      route: `/light-cones/${detail.id}`,
      passiveRendered: detail.passive.superimposition.levels.length > 0,
      inspectionDividerRendered: true,
      storyFallbackRendered: !detail.story
    }
  });
}

function relicSemantic(detail: RelicSet, catalog: RelicCatalogEntry) {
  return canonicalize({
    catalog,
    detail,
    presentation: {
      route: `/relics/${detail.id}`,
      effectFallbacks: detail.effects.map((effect) => ({
        required: effect.required,
        rendered: !effect.description
      })),
      pieces: detail.pieces.map((piece) => ({
        id: piece.id,
        descriptionFallbackRendered: !piece.description
      }))
    }
  });
}

async function captureStableArea<TCatalog extends { id: string }, TDetail>(
  catalogFile: string,
  detailDirectory: string,
  semantic: (detail: TDetail, catalog: TCatalog) => unknown
): Promise<StableEntityArea> {
  const catalog = await json<TCatalog[]>(catalogFile);
  const entities = Object.fromEntries(
    await Promise.all(
      catalog.map(async (entry) => [
        entry.id,
        semantic(await json<TDetail>(path.join(detailDirectory, `${entry.id}.json`)), entry)
      ])
    )
  );
  return { order: catalog.map(({ id }) => id), entities };
}

function normalizeEnemyMonster(
  monster: Record<string, any>,
  registries: {
    monsters: ContentRegistry;
    skills: ContentRegistry;
    summons: ContentRegistry;
    statSeries: ContentRegistry;
  }
): string {
  const stats = monster.stats ?? {};
  const statNames = [
    'hp',
    'attack',
    'defence',
    'speed',
    'toughness',
    'effectHit',
    'effectResistance'
  ] as const;
  const statSeries = {
    columns: ['level', ...statNames],
    valueColumns: ['status', 'value', 'reason'],
    rows: (stats.levels ?? []).map((level: Record<string, any>) => [
      level.level,
      ...statNames.map((name) => {
        const value = level[name] ?? {};
        const unknownKeys = Object.keys(value).filter(
          (key) => !['status', 'value', 'reason'].includes(key)
        );
        if (unknownKeys.length)
          throw new Error(
            `Enemy stat ${name} contains unsupported fields: ${unknownKeys.join(', ')}`
          );
        return [value.status ?? null, value.value ?? null, value.reason ?? null];
      })
    ])
  };
  const record = {
    ...monster,
    stats: {
      ...stats,
      levels: undefined,
      statSeriesRef: registries.statSeries.add(statSeries)
    },
    skills: undefined,
    skillRefs: (monster.skills ?? []).map((skill: unknown) => registries.skills.add(skill)),
    summons: undefined,
    summonRefs: (monster.summons ?? []).map((summon: unknown) => registries.summons.add(summon))
  };
  return registries.monsters.add(record);
}

async function captureEnemies(catalog: EnemyCatalogEntry[]) {
  const templates = new ContentRegistry();
  const monsters = new ContentRegistry();
  const skills = new ContentRegistry();
  const summons = new ContentRegistry();
  const statSeries = new ContentRegistry();
  const details = new Map<string, Enemy>();
  const entities: Record<string, unknown> = {};
  for (const entry of catalog) {
    const detail = await json<Enemy>(
      path.join(localeRoot, 'details', 'enemies', `${entry.id}.json`)
    );
    details.set(entry.id, detail);
    const normalizedMonsterRefs = detail.monsters.map((monster) =>
      normalizeEnemyMonster(monster as unknown as Record<string, any>, {
        monsters,
        skills,
        summons,
        statSeries
      })
    );
    const defaultIndex = detail.monsters.findIndex(
      (monster) => monster.monsterId === detail.defaultMonsterId
    );
    entities[entry.id] = canonicalize({
      catalog: entry,
      detail: {
        ...detail,
        template: undefined,
        templateRef: templates.add(detail.template),
        monsters: undefined,
        monsterRefs: normalizedMonsterRefs,
        defaultMonster: undefined,
        defaultMonsterRef:
          defaultIndex >= 0
            ? normalizedMonsterRefs[defaultIndex]
            : normalizeEnemyMonster(detail.defaultMonster as unknown as Record<string, any>, {
                monsters,
                skills,
                summons,
                statSeries
              })
      },
      presentation: {
        route: `/enemies/${detail.id}`,
        defaultMonsterId: detail.defaultMonsterId,
        selectableMonsterIds: detail.monsters.map((monster) => monster.monsterId),
        descriptionFallbackRendered: !detail.description
      }
    });
  }
  return {
    area: {
      order: catalog.map(({ id }) => id),
      entities,
      registries: {
        templates: templates.values,
        monsters: monsters.values,
        skills: skills.values,
        summons: summons.values,
        statSeries: statSeries.values
      }
    },
    details
  };
}

function isOccurrence(value: Record<string, unknown>): boolean {
  return (
    'monsterId' in value &&
    'monsterTemplateId' in value &&
    'hp' in value &&
    'speed' in value &&
    'toughness' in value
  );
}

function isMechanic(value: Record<string, unknown>): boolean {
  return (
    typeof value.id === 'number' &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    !('monsterId' in value)
  );
}

function normalizeEndgameNode(
  value: unknown,
  registries: {
    occurrences: ContentRegistry;
    mechanics: ContentRegistry;
    presentedOccurrences: ContentRegistry;
  },
  presentation = false
): unknown {
  if (Array.isArray(value))
    return value.map((child) => normalizeEndgameNode(child, registries, presentation));
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (isOccurrence(record)) {
    const normalized = {
      ...record,
      ...('mechanics' in record
        ? { mechanics: undefined, mechanicRef: registries.mechanics.add(record.mechanics) }
        : {})
    };
    const reference = presentation
      ? registries.presentedOccurrences.add(normalized)
      : registries.occurrences.add(normalized);
    return { occurrenceRef: reference };
  }
  if (isMechanic(record)) return { mechanicRef: registries.mechanics.add(record) };
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [
      key,
      normalizeEndgameNode(child, registries, presentation)
    ])
  );
}

function scheduleBoundaryCases(groups: EndgameGroup[]) {
  const timestamps = new Set<number>([RECOMMENDATION_REFERENCE_TIME]);
  for (const group of groups) {
    if (!group.schedule) continue;
    const begin = Date.parse(`${group.schedule.begin.replace(' ', 'T')}+08:00`);
    const end = Date.parse(`${group.schedule.end.replace(' ', 'T')}+08:00`);
    for (const timestamp of [begin - 1, begin, end - 1, end]) timestamps.add(timestamp);
  }
  return [...timestamps]
    .sort((left, right) => left - right)
    .map((timestamp) => ({ timestamp, groupId: recommendedGroupId(groups, timestamp) ?? null }));
}

async function captureEndgame(enemyDetails: ReadonlyMap<string, Enemy>) {
  const occurrences = new ContentRegistry();
  const mechanics = new ContentRegistry();
  const presentedOccurrences = new ContentRegistry();
  const portraits = await loadEnemyPortraitMap({ warn: () => undefined });
  const references = new Map<string, EndgameEnemyReference>();
  for (const detail of enemyDetails.values()) {
    for (const monster of detail.monsters) {
      const reference = resolveEndgameEnemyReference(
        detail as unknown as EndgameEnemyDetailSource,
        Number(monster.monsterId)
      );
      const portraitUrl = portraits.get(Number(monster.monsterTemplateId));
      references.set(
        endgameEnemyReferenceKey(Number(monster.monsterId), Number(monster.monsterTemplateId)),
        { ...reference, ...(portraitUrl ? { portraitUrl } : {}) }
      );
    }
  }
  const modes: ProductBaselineCapture['endgame']['modes'] = {};
  for (const mode of ENDGAME_MODES) {
    const dataset = await json<EndgameModeDataset>(
      path.join(localeRoot, 'endgame', `${mode}.json`)
    );
    const periods = [...dataset.groups]
      .sort((left, right) => right.groupId - left.groupId)
      .map((group) => buildPeriodView(group, RECOMMENDATION_REFERENCE_TIME));
    const groups = Object.fromEntries(
      dataset.groups.map((group) => {
        const presentation = buildGroupView(group, periods, references);
        presentation.period = buildPeriodView(group, RECOMMENDATION_REFERENCE_TIME);
        presentation.periods = periods;
        return [
          String(group.groupId),
          canonicalize({
            source: normalizeEndgameNode(group, {
              occurrences,
              mechanics,
              presentedOccurrences
            }),
            presentation: normalizeEndgameNode(
              presentation,
              { occurrences, mechanics, presentedOccurrences },
              true
            ),
            route: `/endgame/${mode}/${group.groupId}`
          })
        ];
      })
    );
    modes[mode] = {
      order: dataset.groups.map((group) => String(group.groupId)),
      groups,
      recommendations: scheduleBoundaryCases(dataset.groups)
    };
  }
  return {
    modes,
    registries: {
      occurrences: occurrences.values,
      mechanics: mechanics.values,
      presentedOccurrences: presentedOccurrences.values
    }
  };
}

function compactSearchResult(
  result: ReturnType<ReturnType<typeof createGlobalSearchService>['search']>
) {
  return {
    unavailable: result.unavailable,
    characters: result.results.characters.map(({ id }) => ({ id, href: `/characters/${id}` })),
    lightCones: result.results.lightCones.map(({ id }) => ({ id, href: `/light-cones/${id}` })),
    relics: result.results.relics.map(({ id }) => ({ id, href: `/relics/${id}` })),
    enemies: result.results.enemies.map(({ id }) => ({ id, href: `/enemies/${id}` })),
    endgame: result.endgameMatches.map(({ id }) => ({ id })),
    evidence: result.evidence
  };
}

function systematicQueries(index: GlobalSearchIndex): string[] {
  const queries = new Set<string>(['', '不存在的搜索词', '银鬃尉官', '的', '者']);
  for (const document of index.documents) {
    for (const label of [
      document.canonicalName,
      ...document.officialAliases,
      ...document.playerAliases
    ]) {
      const trimmed = label.trim();
      if (!trimmed) continue;
      queries.add(trimmed);
      queries.add(trimmed.slice(0, Math.min(2, trimmed.length)));
      if (trimmed.length > 2) queries.add(trimmed.slice(-2));
    }
  }
  return [...queries].sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

async function captureSearch(catalogs: GlobalSearchCatalogs) {
  const index = await json<GlobalSearchIndex>(
    path.join(staticGeneratedRoot, 'zh-CN', 'search.json')
  );
  const search = createGlobalSearchService(index, catalogs);
  return canonicalize({
    documents: index.documents,
    locale: index.locale,
    endgameTargets: index.endgameTargets,
    queries: Object.fromEntries(
      systematicQueries(index).map((query) => [query, compactSearchResult(search.search(query))])
    ),
    shardMembership: Object.fromEntries(
      index.endgameTargets.map((entry) => [
        entry.id,
        {
          groupKeys: [
            ...new Set(
              entry.occurrences.map(({ locator: { mode, groupId } }) => `${mode}:${groupId}`)
            )
          ],
          locatorCount: entry.occurrences.length
        }
      ])
    )
  });
}

async function captureHomepage(
  characters: CatalogEntry[],
  lightCones: CatalogEntry[],
  assets: VisualAssetManifest
) {
  const homepage = await json<HomepageRecentWarpData>(path.join(localeRoot, 'homepage.json'));
  const characterById = new Map(characters.map((entry) => [entry.id, entry]));
  const lightConeById = new Map(lightCones.map((entry) => [entry.id, entry]));
  return canonicalize({
    selection: homepage,
    recentCharacters: homepage.avatarUps.map(({ avatarId, gachaId }) => ({
      gachaId,
      card: characterById.get(avatarId),
      href: `/characters/${avatarId}`,
      imageUrl: assets.characters.previews.available.includes(avatarId)
        ? `/generated-assets/characters/preview/${avatarId}.png`
        : null
    })),
    recentLightCones: homepage.weaponUps.map(({ equipmentId, gachaId }) => ({
      gachaId,
      card: lightConeById.get(equipmentId),
      href: `/light-cones/${equipmentId}`,
      imageUrl: assets.lightCones.previews.available.includes(equipmentId)
        ? `/generated-assets/light-cones/preview/${equipmentId}.png`
        : null
    })),
    directory: NAVIGATION_ITEMS.filter(({ id }) => id !== 'overview').map((item) => ({
      id: item.id,
      label: item.label,
      href: item.href,
      fallback: item.fallback,
      iconRendered: assets.navigation.icons.available.includes(item.iconKey)
    })),
    localizedText: {
      siteName: SITE_NAME,
      tagline: m.home_tagline({}, { locale: 'zh-CN' }),
      searchLabel: m.home_search_label({}, { locale: 'zh-CN' }),
      searchPlaceholder: m.home_search_placeholder({}, { locale: 'zh-CN' }),
      recentCharacters: m.home_recent_character_warp({}, { locale: 'zh-CN' }),
      recentLightCones: m.home_recent_light_cone_warp({}, { locale: 'zh-CN' })
    },
    emptyStates: { recentCharacters: null, recentLightCones: null }
  });
}

async function captureUnresolvedLocalization() {
  const audit = await json<{
    textDiagnostics: TextDiagnosticSummary;
    missingTextAudit: Record<string, { count: number; samples: unknown[] }>;
    descriptionDiagnostics: Record<string, { count: number }>;
  }>(path.join(auditRoot, 'latest.json'));
  const entries = (
    Object.entries(audit.textDiagnostics) as Array<
      [TextDiagnosticKind, TextDiagnosticSummary[TextDiagnosticKind]]
    >
  ).flatMap(([kind, summary]) => summary.entries.map((entry) => ({ kind, ...entry })));
  const unclassified = entries.filter((entry) => !entry.disposition);
  return canonicalize({
    entries: entries.sort((left, right) =>
      [left.kind, left.source.entity, left.source.id ?? '', left.source.field, left.identifier]
        .join(':')
        .localeCompare(
          [
            right.kind,
            right.source.entity,
            right.source.id ?? '',
            right.source.field,
            right.identifier
          ].join(':'),
          'en'
        )
    ),
    classificationComplete: unclassified.length === 0,
    unclassified,
    invalidProgramErrors: {
      invalidReferences: audit.textDiagnostics['invalid-reference'].count,
      invalidDescriptionParameters: audit.descriptionDiagnostics['invalid-param']?.count ?? 0,
      categoryD: audit.missingTextAudit.D?.count ?? 0
    }
  });
}

function collectCharacterIconOwners(
  characters: Record<string, unknown>,
  neutralCharacters: Array<Record<string, any>>
) {
  const owners = new Map<string, unknown[]>();
  const add = (key: unknown, owner: unknown) => {
    if (typeof key !== 'string') return;
    owners.set(key, [...(owners.get(key) ?? []), owner]);
  };
  const neutralById = new Map(neutralCharacters.map((character) => [character.id, character]));
  for (const [characterId, semantic] of Object.entries(characters)) {
    const detail = (semantic as Record<string, any>).detail;
    const neutral = neutralById.get(characterId);
    for (const [stat, key] of Object.entries(detail.baseStats.iconKeys ?? {}))
      add(key, { characterId, ownerType: 'profile-stat', path: `baseStats.${stat}` });
    for (const [profileName, profile] of Object.entries(detail.profiles) as Array<
      [string, Record<string, any>]
    >) {
      const neutralProfile = neutral?.profiles?.[profileName];
      add(profile.energy.iconKey, {
        characterId,
        profile: profileName,
        ownerType: 'energy',
        path: 'energy'
      });
      for (const card of profile.skillCards) {
        const parsed = parseCharacterDetailIconKey(card.iconKey ?? '');
        const attached = (neutralProfile?.skills ?? []).filter((skill: Record<string, any>) =>
          card.variants.some((variant: Record<string, any>) => variant.id === skill.id)
        );
        add(card.iconKey, {
          characterId,
          profile: profileName,
          ownerType: 'skill-card',
          category: card.category,
          skillIds: card.variants.map((variant: Record<string, any>) => variant.id),
          configuredPaths: [
            ...new Set(
              attached.flatMap((skill: Record<string, any>) =>
                parsed?.kind === 'skill-tree'
                  ? [skill.progressionIconPath].filter(Boolean)
                  : [skill.iconPath].filter(Boolean)
              )
            )
          ]
        });
      }
      for (const trace of profile.traces)
        add(trace.iconKey, {
          characterId,
          profile: profileName,
          ownerType: 'trace',
          traceId: trace.id
        });
      for (const eidolon of profile.eidolons)
        add(eidolon.iconKey, {
          characterId,
          profile: profileName,
          ownerType: 'eidolon',
          eidolonId: eidolon.id
        });
    }
  }
  return owners;
}

async function captureCharacterIcons(
  characters: Record<string, unknown>,
  assets: VisualAssetManifest
) {
  const requirements = await readAssetRequirements();
  const assetRoot = assertAssetRoot(resolveAssetRoot());
  const sources = await readCharacterDetailIconSources(
    assetRoot,
    requirements.characterDetailIconKeys
  );
  const characterSource = await loadCharacterDomainTables(assertDataRoot());
  const neutralCharacters = buildCharacterDomain({ tables: characterSource }).characters;
  const owners = collectCharacterIconOwners(
    characters,
    neutralCharacters as Array<Record<string, any>>
  );
  const entries = Object.fromEntries(
    await Promise.all(
      requirements.characterDetailIconKeys.map(async (key: CharacterDetailIconKey) => {
        const source = sources.get(key);
        const resolvedPath = assets.characterDetails.icons.resolved[key];
        const resolvedFile = resolvedPath
          ? path.join(siteRoot, 'static', ...resolvedPath.slice(1).split('/'))
          : undefined;
        return [
          key,
          canonicalize({
            key,
            parsedOwnership: parseCharacterDetailIconKey(key),
            owners: owners.get(key) ?? [],
            sourcePath: source ? path.relative(assetRoot, source).replaceAll('\\', '/') : null,
            sourceDigest: source ? fileDigest(await readFile(source)) : null,
            resolvedPath: resolvedPath ?? null,
            resolvedDigest: resolvedFile ? fileDigest(await readFile(resolvedFile)) : null
          })
        ];
      })
    )
  );
  const duplicates = Object.entries(
    Object.groupBy(
      Object.entries(assets.characterDetails.icons.resolved),
      ([, resolvedPath]) => resolvedPath
    )
  )
    .flatMap(([resolvedPath, mappings]) =>
      (mappings?.length ?? 0) > 1
        ? [
            {
              resolvedPath,
              keys: mappings!.map(([key]) => key).sort((left, right) => left.localeCompare(right))
            }
          ]
        : []
    )
    .sort((left, right) => left.resolvedPath.localeCompare(right.resolvedPath));
  return canonicalize({
    requirementKeys: requirements.characterDetailIconKeys,
    entries,
    missingKeys: assets.characterDetails.icons.missing,
    duplicateMappings: duplicates
  });
}

export async function captureProductBaseline(): Promise<ProductBaselineCapture> {
  const manifest = await json<DataManifest>(path.join(generatedRoot, 'manifest.json'));
  const assets = await readAssetManifest();
  if (!assets?.sourceCommit) throw new Error('Visual asset manifest is missing its source commit');
  const characterCatalog = await json<CatalogEntry[]>(
    path.join(localeRoot, 'catalogs', 'characters.json')
  );
  const lightConeCatalog = await json<CatalogEntry[]>(
    path.join(localeRoot, 'catalogs', 'light-cones.json')
  );
  const relicCatalog = await json<RelicCatalogEntry[]>(
    path.join(localeRoot, 'catalogs', 'relics.json')
  );
  const enemyCatalog = await json<EnemyCatalogEntry[]>(
    path.join(localeRoot, 'catalogs', 'enemies.json')
  );
  const characters = await captureStableArea<CatalogEntry, Character>(
    path.join(localeRoot, 'catalogs', 'characters.json'),
    path.join(localeRoot, 'details', 'characters'),
    characterSemantic
  );
  const lightCones = await captureStableArea<CatalogEntry, Record<string, any>>(
    path.join(localeRoot, 'catalogs', 'light-cones.json'),
    path.join(localeRoot, 'details', 'light-cones'),
    lightConeSemantic
  );
  const relics = await captureStableArea<RelicCatalogEntry, RelicSet>(
    path.join(localeRoot, 'catalogs', 'relics.json'),
    path.join(localeRoot, 'details', 'relics'),
    relicSemantic
  );
  const capturedEnemies = await captureEnemies(enemyCatalog);
  const catalogs: GlobalSearchCatalogs = {
    characters: characterCatalog,
    lightCones: lightConeCatalog,
    relics: relicCatalog,
    enemies: enemyCatalog
  };
  return {
    metadata: {
      fixtureFormatVersion: PRODUCT_BASELINE_FIXTURE_FORMAT_VERSION,
      locale: 'zh-CN',
      sourceCommit: manifest.sourceCommit,
      sourceVersion: manifest.sourceVersion,
      assetCommit: assets.sourceCommit
    },
    characters,
    lightCones,
    relics: {
      ...relics,
      properties: await json<RelicProperty[]>(
        path.join(localeRoot, 'catalogs', 'relic-properties.json')
      )
    },
    enemies: capturedEnemies.area,
    endgame: await captureEndgame(capturedEnemies.details),
    homepage: await captureHomepage(characterCatalog, lightConeCatalog, assets),
    search: await captureSearch(catalogs),
    unresolvedLocalization: await captureUnresolvedLocalization(),
    characterIcons: await captureCharacterIcons(characters.entities, assets)
  };
}
