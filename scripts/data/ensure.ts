import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CatalogEntry,
  DataManifest,
  HomepageRecentWarpData
} from '../../src/lib/domain/types.js';
import { CHARACTER_NAMING_POLICY_VERSION } from '../../src/lib/search/name-metadata.js';
import { SEARCH_NORMALIZATION_VERSION } from '../../src/lib/search/normalization.js';
import {
  readDataManifest,
  refreshArtifactMetadata,
  validateGeneratedArtifacts
} from './generated-artifacts.js';
import { assertHomepageRecentWarpData } from './homepage.js';
import { assertDataRoot, generatedRoot, resolveDataRoot, sourceCommit } from './paths.js';
import { ensureSearchDocuments, searchArtifactPaths } from './search-documents.js';
import { getGeneratedLocales } from './locale-registry.js';
import { syncData } from './sync.js';
import { withProcessTelemetry } from '../deployment/telemetry.js';
import { readTextMapWithDigest } from './source-metadata.js';

export interface DataEnsureSource {
  root: string;
  commit: string;
}

export interface DataEnsureDependencies {
  env?: NodeJS.ProcessEnv;
  readManifest?: () => Promise<DataManifest>;
  validateCache?: (candidate: DataManifest) => Promise<boolean>;
  resolveSource?: () => Promise<DataEnsureSource>;
  cacheMatchesSource?: (manifest: DataManifest, source: DataEnsureSource) => Promise<boolean>;
  sync?: () => Promise<DataManifest>;
  ensureSearch?: (sourceCommit: string) => Promise<boolean>;
  refreshMetadata?: (manifest: DataManifest, logicalPath: string) => Promise<DataManifest>;
  validateArtifacts?: (manifest: DataManifest) => Promise<void>;
}

async function cacheValid(candidate: DataManifest | undefined): Promise<boolean> {
  if (!candidate) return false;
  try {
    await validateGeneratedArtifacts(candidate);
    for (const { locale } of getGeneratedLocales()) {
      const productRoot = path.join(generatedRoot, 'views', locale);
      const [homepage, characterCatalog, lightConeCatalog, searchInputs] = await Promise.all([
        readFile(path.join(productRoot, 'homepage.json'), 'utf8').then(
          (value) => JSON.parse(value) as HomepageRecentWarpData
        ),
        readFile(path.join(productRoot, 'catalogs', 'characters.json'), 'utf8').then(
          (value) => JSON.parse(value) as CatalogEntry[]
        ),
        readFile(path.join(productRoot, 'catalogs', 'light-cones.json'), 'utf8').then(
          (value) => JSON.parse(value) as CatalogEntry[]
        ),
        readFile(searchArtifactPaths(locale).inputs, 'utf8').then((value) => JSON.parse(value))
      ]);
      assertHomepageRecentWarpData(homepage, characterCatalog, lightConeCatalog);
      if (
        searchInputs.official?.schemaVersion !== 1 ||
        searchInputs.official?.sourceCommit !== candidate.sourceCommit ||
        searchInputs.official?.normalizationVersion !== SEARCH_NORMALIZATION_VERSION ||
        searchInputs.official?.namingPolicyVersion !== CHARACTER_NAMING_POLICY_VERSION
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function resolveAvailableSource(): Promise<DataEnsureSource> {
  const root = assertDataRoot(resolveDataRoot());
  return { root, commit: sourceCommit(root) };
}

async function cacheMatchesAvailableSource(
  manifest: DataManifest,
  source: DataEnsureSource
): Promise<boolean> {
  const currentTextMapDigests = Object.fromEntries(
    await Promise.all(
      getGeneratedLocales().map(async ({ locale, textMapCode }) => {
        const { digest } = await readTextMapWithDigest(source.root, textMapCode);
        return [locale, digest];
      })
    )
  );
  return (
    manifest.sourceCommit === source.commit &&
    !getGeneratedLocales().some(
      ({ locale }) => manifest.locales[locale].textMapDigest !== currentTextMapDigests[locale]
    )
  );
}

export async function ensureData(dependencies: DataEnsureDependencies = {}): Promise<DataManifest> {
  const env = dependencies.env ?? process.env;
  const readManifest = dependencies.readManifest ?? readDataManifest;
  const validateCache = dependencies.validateCache ?? cacheValid;
  const resolveSource = dependencies.resolveSource ?? resolveAvailableSource;
  const cacheMatchesSource = dependencies.cacheMatchesSource ?? cacheMatchesAvailableSource;
  const sync = dependencies.sync ?? syncData;
  const ensureSearch = dependencies.ensureSearch ?? ensureSearchDocuments;
  const refreshMetadata = dependencies.refreshMetadata ?? refreshArtifactMetadata;
  const validateArtifacts = dependencies.validateArtifacts ?? validateGeneratedArtifacts;

  let manifest: DataManifest | undefined;
  let cacheResult: 'hit' | 'miss' | 'fallback' = 'miss';
  let cacheReason = 'manifest-missing-or-invalid';
  try {
    manifest = await readManifest();
  } catch {
    // A missing, obsolete, or interrupted generation is handled below.
  }
  let validated = manifest ? await validateCache(manifest) : false;
  if (manifest && !validated) cacheReason = 'generated-artifacts-invalid';
  let availableSource: DataEnsureSource | undefined;
  try {
    availableSource = await resolveSource();
  } catch (error) {
    if (env.HSR_DEPLOYMENT_BUILD === '1') throw error;
    if (
      validated &&
      manifest &&
      (!env.HSR_EXPECTED_DATA_COMMIT || manifest.sourceCommit === env.HSR_EXPECTED_DATA_COMMIT)
    ) {
      console.warn(`上游暂不可用，继续使用已有生成数据：${(error as Error).message}`);
      cacheResult = 'fallback';
      cacheReason = 'source-unavailable-valid-cache';
    } else {
      throw error;
    }
  }

  if (availableSource) {
    const matchesSource =
      manifest && validated ? await cacheMatchesSource(manifest, availableSource) : false;
    if (!manifest || !validated || !matchesSource) {
      if (manifest && validated && !matchesSource) cacheReason = 'source-or-textmap-changed';
      manifest = await sync();
      validated = false;
    } else {
      cacheResult = 'hit';
      cacheReason = 'manifest-source-and-artifacts-match';
      console.log(`生成数据已是最新版本：${availableSource.commit.slice(0, 12)}`);
    }
  }

  if (!manifest) throw new Error('生成数据不可用');
  if (await ensureSearch(manifest.sourceCommit)) {
    manifest = await refreshMetadata(manifest, 'static/generated/zh-CN/search.json');
    validated = false;
    cacheResult = 'miss';
    cacheReason = `${cacheReason}+search-artifact-refreshed`;
  }
  if (!validated) await validateArtifacts(manifest);
  const artifacts = Object.values(manifest.artifacts ?? {});
  console.log(`[deploy:cache] data result=${cacheResult} reason=${cacheReason}`);
  console.log(
    `[deploy:io] generated-data-output files=${artifacts.length} bytes=${artifacts.reduce((total, artifact) => total + artifact.bytes, 0)}`
  );
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await withProcessTelemetry('data-ensure', ensureData);
}
