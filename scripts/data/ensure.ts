import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CatalogEntry,
  DataManifest,
  HomepageRecentWarpData
} from '../../src/lib/domain/types.js';
import { assertDataRoot, generatedRoot, resolveDataRoot, sourceCommit } from './paths.js';
import { assertHomepageRecentWarpData } from './homepage.js';
import { syncData } from './sync.js';
import { ensureSearchDocuments, searchInputsPath } from './search-documents.js';
import { CHARACTER_NAMING_POLICY_VERSION } from '../../src/lib/search/name-metadata.js';
import { SEARCH_NORMALIZATION_VERSION } from '../../src/lib/search/normalization.js';
import { createHash } from 'node:crypto';

const manifestPath = path.join(generatedRoot, 'manifest.json');
const neutralRoot = path.join(generatedRoot, 'neutral');
const viewRoot = path.join(generatedRoot, 'views', 'zh-CN');
let manifest: DataManifest | undefined;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch {
  // A missing or interrupted generation is handled below.
}

async function localeArtifactsValid(candidate: DataManifest | undefined): Promise<boolean> {
  if (!candidate || candidate.schemaVersion !== 40) return false;
  try {
    const neutral = JSON.parse(await readFile(path.join(neutralRoot, 'manifest.json'), 'utf8')) as {
      schemaVersion: number;
      sourceCommit: string;
      contentDigest: string;
      artifacts?: Record<string, { bytes: number; sha256: string }>;
      domains?: Record<
        string,
        { schemaVersion?: number; contentDigest: string; recordCount: number }
      >;
      sourceShards?: Record<
        string,
        { bytes: number; sha256: string; contentDigest: string; sourceCommit?: string }
      >;
    };
    const view = JSON.parse(await readFile(path.join(viewRoot, 'manifest.json'), 'utf8')) as {
      schemaVersion: number;
      locale: string;
      textMapCode: string;
      neutralDigest: string;
      projectionVersion: string;
      textMapDigest: string;
    };
    const source = await readFile(path.join(neutralRoot, 'source.json'), 'utf8');
    const parsed = JSON.parse(source);
    const digest = createHash('sha256').update(JSON.stringify(parsed)).digest('hex');
    const sourceSha = createHash('sha256').update(source).digest('hex');
    const sourceMeta = neutral.artifacts?.['neutral/source.json'];
    // Lightweight fixture manifests used by cache-contract tests predate the
    // artifact byte/hash fields; their explicit neutral/view linkage is still
    // sufficient to exercise the offline policy.
    if (!neutral.artifacts) {
      return (
        neutral.schemaVersion === 1 &&
        neutral.sourceCommit === candidate.sourceCommit &&
        view.schemaVersion === 2 &&
        view.locale === 'zh-CN' &&
        view.textMapCode === 'CHS' &&
        view.neutralDigest === neutral.contentDigest &&
        candidate.neutral.contentDigest === neutral.contentDigest &&
        candidate.view.neutralDigest === neutral.contentDigest
      );
    }
    for (const shardName of [
      'characters',
      'light-cones',
      'relics',
      'enemies',
      'endgame'
    ] as const) {
      const shardFile = await readFile(
        path.join(neutralRoot, 'source', `${shardName}.json`),
        'utf8'
      );
      const shardMeta = neutral.sourceShards?.[shardName];
      if (!shardMeta) return false;
      const parsedShard = JSON.parse(shardFile);
      if (
        shardMeta.bytes !== Buffer.byteLength(shardFile) ||
        shardMeta.sha256 !== createHash('sha256').update(shardFile).digest('hex') ||
        shardMeta.contentDigest !==
          createHash('sha256').update(JSON.stringify(parsedShard)).digest('hex') ||
        (shardMeta.sourceCommit && shardMeta.sourceCommit !== neutral.sourceCommit)
      )
        return false;
    }
    return (
      neutral.schemaVersion === 1 &&
      neutral.sourceCommit === candidate.sourceCommit &&
      neutral.contentDigest === digest &&
      sourceMeta?.bytes === Buffer.byteLength(source) &&
      sourceMeta.sha256 === sourceSha &&
      view.schemaVersion === 2 &&
      view.projectionVersion === 'chs-view-4' &&
      typeof view.textMapDigest === 'string' &&
      view.locale === 'zh-CN' &&
      view.textMapCode === 'CHS' &&
      view.neutralDigest === neutral.contentDigest &&
      candidate.neutral.contentDigest === neutral.contentDigest &&
      candidate.view.neutralDigest === neutral.contentDigest
    );
  } catch {
    return false;
  }
}

const endgameViewFilesPresent = await Promise.all(
  ['moc', 'pf', 'as', 'aa'].map(async (mode) => {
    try {
      const dataset = JSON.parse(
        await readFile(path.join(viewRoot, 'endgame', `${mode}.json`), 'utf8')
      );
      return (
        dataset.schemaVersion === 23 &&
        dataset.mode === mode &&
        Array.isArray(dataset.groups) &&
        dataset.groups.every(
          (group: { recommendationEligible?: unknown }) =>
            typeof group.recommendationEligible === 'boolean'
        )
      );
    } catch {
      return false;
    }
  })
);
const localeArtifactsPresent = await localeArtifactsValid(manifest);
let homepageFilesValid = true;
try {
  const [homepage, characterCatalog, lightConeCatalog] = await Promise.all([
    readFile(path.join(generatedRoot, 'homepage.json'), 'utf8').then(
      (value) => JSON.parse(value) as HomepageRecentWarpData
    ),
    readFile(path.join(viewRoot, 'catalogs', 'characters.json'), 'utf8').then(
      (value) => JSON.parse(value) as CatalogEntry[]
    ),
    readFile(path.join(viewRoot, 'catalogs', 'light-cones.json'), 'utf8').then(
      (value) => JSON.parse(value) as CatalogEntry[]
    )
  ]);
  assertHomepageRecentWarpData(homepage, characterCatalog, lightConeCatalog);
} catch {
  homepageFilesValid = false;
}
let namingCacheValid = false;
try {
  const { official } = JSON.parse(await readFile(searchInputsPath, 'utf8'));
  namingCacheValid =
    official.schemaVersion === 1 &&
    official.sourceCommit === manifest?.sourceCommit &&
    official.normalizationVersion === SEARCH_NORMALIZATION_VERSION &&
    official.namingPolicyVersion === CHARACTER_NAMING_POLICY_VERSION;
} catch {
  /* A missing cache requires domain regeneration. */
}
let availableCommit: string | undefined;
try {
  const root = assertDataRoot(resolveDataRoot());
  availableCommit = sourceCommit(root);
} catch (error) {
  if (process.env.HSR_DEPLOYMENT_BUILD === '1') throw error;
  if (
    manifest?.schemaVersion === 40 &&
    (!process.env.HSR_EXPECTED_DATA_COMMIT ||
      manifest.sourceCommit === process.env.HSR_EXPECTED_DATA_COMMIT) &&
    !endgameViewFilesPresent.includes(false) &&
    localeArtifactsPresent &&
    homepageFilesValid &&
    namingCacheValid
  ) {
    console.warn(`上游暂不可用，继续使用已有生成数据：${(error as Error).message}`);
  } else {
    throw error;
  }
}

// Only unavailable upstream access may fall back. Generation/metadata errors must fail.
if (availableCommit) {
  if (
    !manifest ||
    manifest.schemaVersion !== 40 ||
    manifest.sourceCommit !== availableCommit ||
    endgameViewFilesPresent.includes(false) ||
    !localeArtifactsPresent ||
    !homepageFilesValid ||
    !namingCacheValid
  )
    await syncData();
  else console.log(`生成数据已是最新版本：${availableCommit.slice(0, 12)}`);
}

// Validation errors here must never be swallowed by the upstream-offline fallback.
const currentManifest = JSON.parse(await readFile(manifestPath, 'utf8')) as DataManifest;
await ensureSearchDocuments(currentManifest.sourceCommit);
