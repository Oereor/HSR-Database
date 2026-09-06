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
import { ensureSearchDocuments, searchInputsPath } from './search-documents.js';
import { syncData } from './sync.js';

const productRoot = path.join(generatedRoot, 'views', 'zh-CN');

async function cacheValid(candidate: DataManifest | undefined): Promise<boolean> {
  if (!candidate) return false;
  try {
    await validateGeneratedArtifacts(candidate);
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
      readFile(searchInputsPath, 'utf8').then((value) => JSON.parse(value))
    ]);
    assertHomepageRecentWarpData(homepage, characterCatalog, lightConeCatalog);
    return (
      searchInputs.official?.schemaVersion === 1 &&
      searchInputs.official?.sourceCommit === candidate.sourceCommit &&
      searchInputs.official?.normalizationVersion === SEARCH_NORMALIZATION_VERSION &&
      searchInputs.official?.namingPolicyVersion === CHARACTER_NAMING_POLICY_VERSION
    );
  } catch {
    return false;
  }
}

let manifest: DataManifest | undefined;
try {
  manifest = await readDataManifest();
} catch {
  // A missing, obsolete, or interrupted generation is handled below.
}
let valid = await cacheValid(manifest);
let availableRoot: string | undefined;
let availableCommit: string | undefined;
try {
  availableRoot = assertDataRoot(resolveDataRoot());
  availableCommit = sourceCommit(availableRoot);
} catch (error) {
  if (process.env.HSR_DEPLOYMENT_BUILD === '1') throw error;
  if (
    valid &&
    manifest &&
    (!process.env.HSR_EXPECTED_DATA_COMMIT ||
      manifest.sourceCommit === process.env.HSR_EXPECTED_DATA_COMMIT)
  ) {
    console.warn(`上游暂不可用，继续使用已有生成数据：${(error as Error).message}`);
  } else {
    throw error;
  }
}

if (availableRoot && availableCommit) {
  const currentTextMap = await readFile(
    path.join(availableRoot, 'TextMap', 'TextMapCHS.json'),
    'utf8'
  );
  const currentTextMapDigest = createHash('sha256')
    .update(JSON.stringify(JSON.parse(currentTextMap)))
    .digest('hex');
  if (
    !valid ||
    !manifest ||
    manifest.sourceCommit !== availableCommit ||
    manifest.textMapDigest !== currentTextMapDigest
  ) {
    manifest = await syncData();
    valid = true;
  } else {
    console.log(`生成数据已是最新版本：${availableCommit.slice(0, 12)}`);
  }
}

if (!manifest || !valid) throw new Error('生成数据不可用');
if (await ensureSearchDocuments(manifest.sourceCommit))
  manifest = await refreshArtifactMetadata(manifest, 'static/generated/zh-CN/search.json');
await validateGeneratedArtifacts(manifest);
