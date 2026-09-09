import { createHash } from 'node:crypto';
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
        const currentTextMap = await readFile(
          path.join(source.root, 'TextMap', `TextMap${textMapCode}.json`),
          'utf8'
        );
        return [
          locale,
          createHash('sha256')
            .update(JSON.stringify(JSON.parse(currentTextMap)))
            .digest('hex')
        ];
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
  try {
    manifest = await readManifest();
  } catch {
    // A missing, obsolete, or interrupted generation is handled below.
  }
  let validated = manifest ? await validateCache(manifest) : false;
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
    } else {
      throw error;
    }
  }

  if (availableSource) {
    if (!manifest || !validated || !(await cacheMatchesSource(manifest, availableSource))) {
      manifest = await sync();
      validated = false;
    } else {
      console.log(`生成数据已是最新版本：${availableSource.commit.slice(0, 12)}`);
    }
  }

  if (!manifest) throw new Error('生成数据不可用');
  if (await ensureSearch(manifest.sourceCommit)) {
    manifest = await refreshMetadata(manifest, 'static/generated/zh-CN/search.json');
    validated = false;
  }
  if (!validated) await validateArtifacts(manifest);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await ensureData();
}
