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

const manifestPath = path.join(generatedRoot, 'manifest.json');
let manifest: DataManifest | undefined;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch {
  // A missing or interrupted generation is handled below.
}

const endgameFilesPresent = await Promise.all(
  ['moc', 'pf', 'as', 'aa'].map(async (mode) => {
    try {
      await readFile(path.join(generatedRoot, 'endgame', `${mode}.json`), 'utf8');
      return true;
    } catch {
      return false;
    }
  })
);
let homepageFilesValid = true;
try {
  const [homepage, characterCatalog, lightConeCatalog] = await Promise.all([
    readFile(path.join(generatedRoot, 'homepage.json'), 'utf8').then(
      (value) => JSON.parse(value) as HomepageRecentWarpData
    ),
    readFile(path.join(generatedRoot, 'catalogs', 'characters.json'), 'utf8').then(
      (value) => JSON.parse(value) as CatalogEntry[]
    ),
    readFile(path.join(generatedRoot, 'catalogs', 'light-cones.json'), 'utf8').then(
      (value) => JSON.parse(value) as CatalogEntry[]
    )
  ]);
  assertHomepageRecentWarpData(homepage, characterCatalog, lightConeCatalog);
} catch {
  homepageFilesValid = false;
}
try {
  const root = assertDataRoot(resolveDataRoot());
  const commit = sourceCommit(root);
  if (
    !manifest ||
    manifest.schemaVersion !== 34 ||
    manifest.sourceCommit !== commit ||
    endgameFilesPresent.includes(false) ||
    !homepageFilesValid
  )
    await syncData();
  else console.log(`生成数据已是最新版本：${commit.slice(0, 12)}`);
} catch (error) {
  if (process.env.HSR_DEPLOYMENT_BUILD === '1') throw error;
  if (
    manifest?.schemaVersion === 34 &&
    (!process.env.HSR_EXPECTED_DATA_COMMIT ||
      manifest.sourceCommit === process.env.HSR_EXPECTED_DATA_COMMIT) &&
    !endgameFilesPresent.includes(false) &&
    homepageFilesValid
  ) {
    console.warn(`上游暂不可用，继续使用已有生成数据：${(error as Error).message}`);
  } else {
    throw error;
  }
}
