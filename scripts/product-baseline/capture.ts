import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { EndgameMode, EndgameModeDataset } from '../../src/lib/domain/endgame.js';
import {
  buildGroupView,
  buildPeriodView,
  endgameEnemyReferenceKey,
  recommendedGroupId,
  resolveEndgameEnemyReference,
  type EndgameEnemyDetailSource,
  type EndgameEnemyReference
} from '../../src/lib/domain/endgame-view.js';
import type { GlobalSearchIndex } from '../../src/lib/domain/search-index.js';
import type {
  CatalogEntry,
  Character,
  Enemy,
  EnemyCatalogEntry,
  HomepageRecentWarpData,
  RelicCatalogEntry,
  RelicSet
} from '../../src/lib/domain/types.js';
import type { VisualAssetManifest } from '../../src/lib/domain/visual-assets.js';
import {
  createGlobalSearchService,
  type GlobalSearchCatalogs
} from '../../src/lib/search/search.js';
import { loadEnemyPortraitMap } from '../../src/lib/server/enemy-assets.js';
import { m } from '../../src/lib/paraglide/messages.js';
import { NAVIGATION_ITEMS } from '../../src/lib/navigation.js';
import { SITE_NAME } from '../../src/lib/site.js';
import { readAssetManifest } from '../assets/shared.js';
import { generatedRoot, staticGeneratedRoot } from '../data/paths.js';
import { canonicalize } from './canonical.js';
import { PRODUCT_BASELINE_CASES, PRODUCT_BASELINE_REFERENCE_TIME } from './cases.js';
import { PRODUCT_BASELINE_FIXTURE_FORMAT_VERSION, type ProductBaselineCapture } from './model.js';

const localeRoot = path.join(generatedRoot, 'views', 'zh-CN');
const referenceTime = Date.parse(PRODUCT_BASELINE_REFERENCE_TIME);

async function json<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

export async function captureDeclaredEntities<TCatalog extends { id: string }, TDetail>(
  domain: string,
  catalog: readonly TCatalog[],
  cases: readonly { id: string }[],
  loadDetail: (id: string) => Promise<TDetail>,
  semantic: (detail: TDetail, catalog: TCatalog) => unknown
): Promise<Record<string, unknown>> {
  const byId = new Map(catalog.map((entry) => [entry.id, entry]));
  return Object.fromEntries(
    await Promise.all(
      cases.map(async ({ id }) => {
        const entry = byId.get(id);
        if (!entry) throw new Error(`Declared product baseline case is missing: ${domain}/${id}`);
        return [id, semantic(await loadDetail(id), entry)];
      })
    )
  );
}

function sampledVariant(variant: Record<string, any>, defaultLevel?: number) {
  const levels = variant.levels ?? [];
  const selected = new Set(
    [levels[0]?.level, defaultLevel, levels.at(-1)?.level].filter(
      (level): level is number => level !== undefined
    )
  );
  return {
    ...variant,
    levels: levels.filter(({ level }: { level: number }) => selected.has(level))
  };
}

function compactCharacterProfile(profile: Record<string, any>) {
  const defaults = new Map<string, number>(
    profile.skillCards.flatMap((card: Record<string, any>) =>
      card.progressions.map((progression: Record<string, any>) => [
        progression.id,
        progression.defaultLevel
      ])
    )
  );
  return {
    energy: profile.energy,
    skillCards: profile.skillCards.map((card: Record<string, any>) => ({
      ...card,
      variants: card.variants.map((variant: Record<string, any>) =>
        sampledVariant(variant, defaults.get(variant.progressionId))
      )
    })),
    specialEffects: profile.specialEffects,
    traces: profile.traces,
    eidolons: profile.eidolons
  };
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
  const record = detail as unknown as Record<string, any>;
  const identity = { ...record };
  const profiles = identity.profiles;
  delete identity.baseStats;
  delete identity.equipmentRecommendation;
  delete identity.order;
  delete identity.profiles;
  return canonicalize({
    catalog,
    detail: {
      ...identity,
      profiles: Object.fromEntries(
        Object.entries(profiles).map(([name, profile]) => [
          name,
          compactCharacterProfile(profile as Record<string, any>)
        ])
      )
    },
    presentation: {
      route: `/characters/${detail.id}`,
      subtitleRendered: !!detail.fullName && detail.fullName !== detail.name,
      descriptionFallbackRendered: !detail.description,
      enhancedToggleRendered: !!detail.profiles.enhanced,
      profiles: Object.fromEntries(
        Object.entries(detail.profiles).map(([name, profile]) => [
          name,
          profilePresentation(profile as unknown as Record<string, any>)
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

function enemySemantic(detail: Enemy, catalog: EnemyCatalogEntry) {
  const selected = detail.defaultMonster as unknown as Record<string, any>;
  const defaultLevel = selected.stats.defaultLevel;
  return canonicalize({
    catalog,
    detail: {
      id: detail.id,
      name: detail.name,
      description: detail.description,
      type: detail.type,
      typeName: detail.typeName,
      kind: detail.kind,
      rank: detail.rank,
      weaknesses: detail.weaknesses,
      template: detail.template,
      defaultMonsterId: detail.defaultMonsterId,
      selectors: detail.monsters.map(({ monsterId, hardLevelGroup, eliteGroup }) => ({
        monsterId,
        hardLevelGroup,
        eliteGroup
      })),
      defaultMonster: {
        monsterId: selected.monsterId,
        monsterTemplateId: selected.monsterTemplateId,
        modifiers: selected.modifiers,
        stats: {
          minLevel: selected.stats.minLevel,
          maxLevel: selected.stats.maxLevel,
          defaultLevel,
          selectedLevel: selected.stats.levels.find(
            ({ level }: { level: number }) => level === defaultLevel
          )
        },
        weaknesses: selected.weaknesses,
        resistances: selected.resistances,
        specialResistances: selected.specialResistances,
        summons: selected.summons,
        skills: selected.skills,
        skillPhases: selected.skillPhases
      }
    },
    presentation: {
      route: `/enemies/${detail.id}`,
      defaultMonsterId: detail.defaultMonsterId,
      selectableMonsterIds: detail.monsters.map((monster) => monster.monsterId),
      descriptionFallbackRendered: !detail.description
    }
  });
}

async function captureEndgame(enemyDetails: ReadonlyMap<string, Enemy>) {
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

  const datasets = new Map<EndgameMode, EndgameModeDataset>();
  const modes: ProductBaselineCapture['endgame']['modes'] = {};
  for (const selected of PRODUCT_BASELINE_CASES.endgame) {
    const mode = selected.mode as EndgameMode;
    let dataset = datasets.get(mode);
    if (!dataset) {
      dataset = await json<EndgameModeDataset>(path.join(localeRoot, 'endgame', `${mode}.json`));
      datasets.set(mode, dataset);
    }
    const group = dataset.groups.find(({ groupId }) => groupId === selected.groupId);
    if (!group)
      throw new Error(
        `Declared product baseline case is missing: endgame/${mode}/${selected.groupId}`
      );
    const periods = [...dataset.groups]
      .sort((left, right) => right.groupId - left.groupId)
      .map((candidate) => buildPeriodView(candidate, referenceTime));
    const presentation = buildGroupView(group, periods, references);
    presentation.period = buildPeriodView(group, referenceTime);
    const compactPresentation = { ...presentation } as Record<string, unknown>;
    delete compactPresentation.periods;
    modes[mode] ??= {};
    modes[mode][String(group.groupId)] = canonicalize({
      presentation: compactPresentation,
      route: `/endgame/${mode}/${group.groupId}`
    });
  }

  const boundaries = PRODUCT_BASELINE_CASES.endgameBoundaries.map((selected) => {
    const mode = selected.mode as EndgameMode;
    const dataset = datasets.get(mode);
    if (!dataset)
      throw new Error(`Endgame dataset was not loaded for boundary case: ${selected.id}`);
    const group = dataset.groups.find(({ groupId }) => groupId === selected.groupId);
    if (!group) throw new Error(`Declared product baseline boundary is missing: ${selected.id}`);
    const timestamp = Date.parse(selected.timestamp);
    return canonicalize({
      id: selected.id,
      timestamp: selected.timestamp,
      period: buildPeriodView(group, timestamp),
      recommendedGroupId: recommendedGroupId(dataset.groups, timestamp) ?? null
    });
  });
  return { modes, boundaries };
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

async function captureSearch(catalogs: GlobalSearchCatalogs) {
  const index = await json<GlobalSearchIndex>(
    path.join(staticGeneratedRoot, 'zh-CN', 'search.json')
  );
  const search = createGlobalSearchService(index, catalogs);
  return canonicalize({
    locale: index.locale,
    queries: Object.fromEntries(
      PRODUCT_BASELINE_CASES.searchQueries.map((query) => [
        query,
        compactSearchResult(search.search(query))
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

export async function captureProductBaseline(): Promise<ProductBaselineCapture> {
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
  const detail = <T>(directory: string, id: string) =>
    json<T>(path.join(localeRoot, 'details', directory, `${id}.json`));
  const enemyDetails = new Map(
    await Promise.all(
      enemyCatalog.map(async ({ id }) => [id, await detail<Enemy>('enemies', id)] as const)
    )
  );
  const catalogs: GlobalSearchCatalogs = {
    characters: characterCatalog,
    lightCones: lightConeCatalog,
    relics: relicCatalog,
    enemies: enemyCatalog
  };
  return {
    metadata: { fixtureFormatVersion: PRODUCT_BASELINE_FIXTURE_FORMAT_VERSION, locale: 'zh-CN' },
    characters: await captureDeclaredEntities(
      'characters',
      characterCatalog,
      PRODUCT_BASELINE_CASES.characters,
      (id) => detail<Character>('characters', id),
      characterSemantic
    ),
    lightCones: await captureDeclaredEntities(
      'light-cones',
      lightConeCatalog,
      PRODUCT_BASELINE_CASES.lightCones,
      (id) => detail<Record<string, any>>('light-cones', id),
      lightConeSemantic
    ),
    relics: await captureDeclaredEntities(
      'relics',
      relicCatalog,
      PRODUCT_BASELINE_CASES.relics,
      (id) => detail<RelicSet>('relics', id),
      relicSemantic
    ),
    enemies: await captureDeclaredEntities(
      'enemies',
      enemyCatalog,
      PRODUCT_BASELINE_CASES.enemies,
      async (id) => enemyDetails.get(id)!,
      enemySemantic
    ),
    endgame: await captureEndgame(enemyDetails),
    homepage: await captureHomepage(characterCatalog, lightConeCatalog, assets),
    search: await captureSearch(catalogs)
  };
}
