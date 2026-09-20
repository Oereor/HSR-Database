import type { DataManifest, GeneratedArtifactMetadata } from '../../../src/lib/domain/types.js';
import type { EndgameDatasetByMode, EndgameMode } from '../../../src/lib/domain/endgame.js';
import { ENDGAME_MODES } from '../../../src/lib/domain/endgame-view.js';
import { GLOBAL_SEARCH_SCHEMA_VERSION } from '../../../src/lib/domain/search-index.js';
import {
  computeDataRevision,
  readDataManifest,
  validateGeneratedArtifacts,
  type GeneratedArtifactValidationSummary
} from '../generated-artifacts.js';
import {
  getGeneratedLocales,
  getPublicLocale,
  getPublicLocales,
  type Locale
} from '../locale-registry.js';
import {
  assertDataRoot,
  generatedRoot as defaultGeneratedRoot,
  resolveDataRoot,
  staticGeneratedRoot as defaultStaticGeneratedRoot
} from '../paths.js';
import {
  readPreparedSourceMetadata,
  readTextMapWithDigest,
  type PreparedSourceMetadata
} from '../source-metadata.js';
import { buildGeneratedRouteInventory } from '../routes.js';

const ROUTE_CATEGORIES = ['characters', 'light-cones', 'relics', 'enemies'] as const;
type RouteCategory = (typeof ROUTE_CATEGORIES)[number];

export interface BuildInputValidationOptions {
  env?: NodeJS.ProcessEnv;
  generatedRoot?: string;
  staticGeneratedRoot?: string;
  sourceRoot?: string;
  sourceMetadata?: PreparedSourceMetadata;
  expectedCommit?: string;
}

export interface BuildInputValidationContext {
  manifest: DataManifest;
  rawRoot: string;
  textMaps: Record<Locale, Record<string, string>>;
  artifacts: GeneratedArtifactValidationSummary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function exactSet(left: readonly string[], right: readonly string[]): boolean {
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

function decimalIds(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const ids = value.map((entry) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !/^\d+$/.test(entry.id))
      throw new Error(`${label} contains an invalid id`);
    return entry.id;
  });
  if (new Set(ids).size !== ids.length) throw new Error(`${label} contains duplicate ids`);
  return ids;
}

function routeIds(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || !/^\d+$/.test(id)))
    throw new Error(`${label} contains invalid route ids`);
  const ids = value as string[];
  if (new Set(ids).size !== ids.length) throw new Error(`${label} contains duplicate route ids`);
  return ids;
}

function localeFromArtifactPath(logicalPath: string): Locale | undefined {
  const match = logicalPath.match(/^(?:views|static\/generated)\/(zh-CN|en)\//);
  return match?.[1] as Locale | undefined;
}

function artifactLocaleSummary(
  manifest: DataManifest,
  locale: Locale
): { files: number; bytes: number } {
  const entries = Object.values(manifest.artifacts).filter(
    (metadata) => metadata.locale === locale
  );
  return {
    files: entries.length,
    bytes: entries.reduce((total, metadata) => total + metadata.bytes, 0)
  };
}

function assertArtifactLocale(logicalPath: string, metadata: GeneratedArtifactMetadata): void {
  const pathLocale = localeFromArtifactPath(logicalPath);
  if (!pathLocale || metadata.locale !== pathLocale)
    throw new Error(`Generated artifact locale mismatch: ${logicalPath}`);
}

export async function validateBuildInputs(
  options: BuildInputValidationOptions = {}
): Promise<BuildInputValidationContext> {
  const env = options.env ?? process.env;
  const generatedRoot = options.generatedRoot ?? defaultGeneratedRoot;
  const staticGeneratedRoot = options.staticGeneratedRoot ?? defaultStaticGeneratedRoot;
  const rawRoot = options.sourceRoot ?? assertDataRoot(resolveDataRoot(env.HSR_DATA_ROOT));
  const manifest = await readDataManifest(generatedRoot);
  const source = options.sourceMetadata ?? readPreparedSourceMetadata(rawRoot);
  const expectedCommit = options.expectedCommit ?? env.HSR_EXPECTED_DATA_COMMIT?.trim();

  if (!/^[0-9a-f]{40}$/i.test(manifest.sourceCommit))
    throw new Error('Generated data manifest source commit is invalid');
  if (expectedCommit && manifest.sourceCommit !== expectedCommit)
    throw new Error('Generated data manifest does not match HSR_EXPECTED_DATA_COMMIT');
  if (manifest.sourceCommit !== source.sourceCommit)
    throw new Error('Generated data manifest does not match prepared source HEAD');
  if (manifest.sourceVersion !== source.sourceVersion)
    throw new Error('Generated data manifest sourceVersion does not match prepared source HEAD');
  if (
    manifest.gameVersionFull !== source.gameVersionFull ||
    manifest.gameVersion !== source.gameVersion
  )
    throw new Error('Generated data manifest game version does not match prepared source HEAD');

  const generatedLocales = getGeneratedLocales();
  const publicLocales = getPublicLocales();
  const publicLocale = getPublicLocale();
  if (
    JSON.stringify(manifest.generatedLocales) !==
      JSON.stringify(generatedLocales.map(({ locale }) => locale)) ||
    JSON.stringify(manifest.publicLocales) !==
      JSON.stringify(publicLocales.map(({ locale }) => locale)) ||
    manifest.publicLocale !== publicLocale.locale ||
    manifest.routePaths.some((route) => route.startsWith('/zh-CN') || route.startsWith('/en/'))
  )
    throw new Error('Generated data locale or route registry does not match the current registry');

  const textMaps = Object.fromEntries(
    await Promise.all(
      generatedLocales.map(async ({ locale, textMapCode }) => {
        if (manifest.locales[locale].textMapCode !== textMapCode)
          throw new Error(`Generated data TextMap registry mismatch: ${locale}`);
        const textMap = await readTextMapWithDigest(rawRoot, textMapCode);
        if (manifest.locales[locale].textMapDigest !== textMap.digest)
          throw new Error(`${locale} view TextMap digest is stale`);
        return [locale, textMap.value] as const;
      })
    )
  ) as Record<Locale, Record<string, string>>;

  for (const locale of manifest.generatedLocales) {
    const expected = artifactLocaleSummary(manifest, locale);
    const recorded = manifest.locales[locale].artifacts;
    if (expected.files !== recorded.files || expected.bytes !== recorded.bytes)
      throw new Error(`Generated data locale artifact summary mismatch: ${locale}`);
  }
  if (manifest.dataRevision !== computeDataRevision(manifest))
    throw new Error('Generated data revision is stale');

  const catalogs = Object.fromEntries(
    manifest.generatedLocales.map((locale) => [locale, {}])
  ) as Record<Locale, Partial<Record<RouteCategory, string[]>>>;
  const relicPropertyCounts = new Map<Locale, number>();
  const endgame = Object.fromEntries(
    manifest.generatedLocales.map((locale) => [locale, {}])
  ) as Record<Locale, Partial<Record<EndgameMode, EndgameDatasetByMode[EndgameMode]>>>;
  const searchTargets = new Map<Locale, string[]>();
  const englishShards = new Set<string>();
  const playerEquipment = new Map<Locale, { lightCones: string[]; relicSets: string[] }>();

  const artifacts = await validateGeneratedArtifacts(
    manifest,
    { generated: generatedRoot, staticGenerated: staticGeneratedRoot },
    {
      onArtifact(logicalPath, value, metadata) {
        assertArtifactLocale(logicalPath, metadata);
        const catalogMatch = logicalPath.match(
          /^views\/(zh-CN|en)\/catalogs\/(characters|light-cones|relics|enemies)\.json$/
        );
        if (catalogMatch) {
          const [, locale, category] = catalogMatch as [string, Locale, RouteCategory];
          catalogs[locale][category] = decimalIds(value, `${locale} ${category} catalog`);
          return;
        }
        const propertyMatch = logicalPath.match(
          /^views\/(zh-CN|en)\/catalogs\/relic-properties\.json$/
        );
        if (propertyMatch) {
          if (!Array.isArray(value))
            throw new Error(`${propertyMatch[1]} relic properties invalid`);
          const keys = value.map((entry) =>
            isRecord(entry) && typeof entry.propertyType === 'string' ? entry.propertyType : ''
          );
          if (keys.some((key) => !key) || new Set(keys).size !== keys.length)
            throw new Error(`${propertyMatch[1]} relic properties contain invalid identities`);
          relicPropertyCounts.set(propertyMatch[1] as Locale, value.length);
          return;
        }
        const endgameMatch = logicalPath.match(
          /^views\/(zh-CN|en)\/endgame\/(moc|pf|as|aa)\.json$/
        );
        if (endgameMatch) {
          const [, locale, mode] = endgameMatch as [string, Locale, EndgameMode];
          if (
            !isRecord(value) ||
            value.schemaVersion !== 24 ||
            value.mode !== mode ||
            !Array.isArray(value.groups)
          )
            throw new Error(`${locale} Endgame ${mode} schema or mode mismatch`);
          const groupIds = value.groups.map((group) =>
            isRecord(group) && Number.isSafeInteger(group.groupId) ? Number(group.groupId) : NaN
          );
          if (
            groupIds.some((id) => !Number.isSafeInteger(id)) ||
            new Set(groupIds).size !== groupIds.length
          )
            throw new Error(`${locale} Endgame ${mode} group inventory is invalid`);
          endgame[locale][mode] = value as unknown as EndgameDatasetByMode[EndgameMode];
          return;
        }
        const searchMatch = logicalPath.match(/^static\/generated\/(zh-CN|en)\/search\.json$/);
        if (searchMatch) {
          const locale = searchMatch[1] as Locale;
          if (
            !isRecord(value) ||
            value.schemaVersion !== GLOBAL_SEARCH_SCHEMA_VERSION ||
            value.locale !== locale ||
            value.sourceCommit !== manifest.sourceCommit ||
            !Array.isArray(value.documents) ||
            !Array.isArray(value.endgameTargets)
          )
            throw new Error(`${locale} search build input identity is invalid`);
          const targets = decimalIds(value.endgameTargets, `${locale} search targets`);
          if (
            value.endgameTargets.some(
              (target) => !isRecord(target) || !Array.isArray(target.occurrences)
            )
          )
            throw new Error(`${locale} search target occurrences are invalid`);
          const occurrenceReferences = value.endgameTargets.reduce(
            (total, target) => total + (target as { occurrences: unknown[] }).occurrences.length,
            0
          );
          const summary = manifest.locales[locale].search;
          if (
            value.documents.length !== summary.documents ||
            targets.length !== summary.endgameTargets ||
            occurrenceReferences !== summary.occurrenceReferences ||
            targets.length !== summary.occurrenceShards
          )
            throw new Error(`${locale} search build input summary mismatch`);
          searchTargets.set(locale, targets);
          return;
        }
        const playerMatch = logicalPath.match(
          /^static\/generated\/(zh-CN|en)\/player-equipment\.json$/
        );
        if (playerMatch) {
          const locale = playerMatch[1] as Locale;
          if (!isRecord(value) || value.schemaVersion !== 1 || value.locale !== locale)
            throw new Error(`${locale} player equipment identity is invalid`);
          playerEquipment.set(locale, {
            lightCones: decimalIds(value.lightCones, `${locale} player light cones`),
            relicSets: decimalIds(value.relicSets, `${locale} player relic sets`)
          });
          return;
        }
        const shardMatch = logicalPath.match(/^views\/en\/endgame-occurrences\/(\d+)$/);
        if (shardMatch) {
          const targetId = shardMatch[1];
          if (
            !isRecord(value) ||
            value.schemaVersion !== 2 ||
            value.locale !== 'en' ||
            !isRecord(value.target) ||
            value.target.kind !== 'endgame' ||
            value.target.id !== targetId
          )
            throw new Error(`English Endgame occurrence shard identity mismatch: ${targetId}`);
          englishShards.add(targetId);
        }
      }
    }
  );

  const routeCountKeys: Record<RouteCategory, keyof DataManifest['counts']> = {
    characters: 'characters',
    'light-cones': 'lightCones',
    relics: 'relics',
    enemies: 'enemies'
  };
  for (const category of ROUTE_CATEGORIES) {
    const routes = routeIds(manifest.routes[category], `manifest ${category} routes`);
    if (routes.length !== manifest.counts[routeCountKeys[category]])
      throw new Error(`Manifest ${category} route count mismatch`);
    for (const locale of manifest.generatedLocales) {
      const catalog = catalogs[locale][category];
      if (!catalog || !exactSet(catalog, routes))
        throw new Error(`${locale} ${category} catalog does not match manifest routes`);
      if (catalog.length !== manifest.locales[locale].counts[routeCountKeys[category]])
        throw new Error(`${locale} ${category} catalog count does not match manifest`);
      const prefix = `views/${locale}/details/${category}/`;
      const actualDetails = Object.keys(manifest.artifacts)
        .filter((logicalPath) => logicalPath.startsWith(prefix) && logicalPath.endsWith('.json'))
        .map((logicalPath) => logicalPath.slice(prefix.length, -'.json'.length));
      if (!exactSet(actualDetails, routes))
        throw new Error(`${locale} ${category} detail inventory does not match manifest routes`);
    }
  }

  for (const locale of manifest.generatedLocales) {
    if (relicPropertyCounts.get(locale) !== manifest.locales[locale].counts.relicProperties)
      throw new Error(`${locale} relic property count does not match manifest`);
    const datasets = endgame[locale];
    if (ENDGAME_MODES.some((mode) => !datasets[mode]))
      throw new Error(`${locale} Endgame build inputs are incomplete`);
    const inventory = buildGeneratedRouteInventory(
      manifest.routes,
      datasets as EndgameDatasetByMode
    );
    if (JSON.stringify(inventory.routePaths) !== JSON.stringify(manifest.routePaths))
      throw new Error(`${locale} generated route inventory does not match manifest.routePaths`);
    const equipment = playerEquipment.get(locale);
    if (
      !equipment ||
      !exactSet(equipment.lightCones, manifest.routes['light-cones']) ||
      !exactSet(equipment.relicSets, manifest.routes.relics)
    )
      throw new Error(`${locale} player equipment inventory does not match manifest routes`);
    const targets = searchTargets.get(locale);
    if (!targets || targets.some((id) => !manifest.routes.enemies.includes(id)))
      throw new Error(`${locale} search target inventory does not resolve to enemy routes`);
  }

  if (!exactSet([...englishShards], searchTargets.get('en') ?? []))
    throw new Error('English Endgame occurrence shard inventory does not match search targets');

  console.log(
    `[data:validate:build-inputs] source=${manifest.sourceCommit.slice(0, 12)} artifacts=${artifacts.files} bytes=${artifacts.bytes} routes=${manifest.routePaths.length}`
  );
  return { manifest, rawRoot, textMaps, artifacts };
}
