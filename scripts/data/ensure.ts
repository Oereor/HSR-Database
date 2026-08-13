import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DataManifest } from '../../src/lib/domain/types.js';
import { assertDataRoot, generatedRoot, resolveDataRoot, sourceCommit } from './paths.js';
import { syncData } from './sync.js';

const manifestPath = path.join(generatedRoot, 'manifest.json');
let manifest: DataManifest | undefined;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch {
  // A missing or interrupted generation is handled below.
}

try {
  const root = assertDataRoot(resolveDataRoot());
  const commit = sourceCommit(root);
  if (!manifest || manifest.schemaVersion !== 11 || manifest.sourceCommit !== commit)
    await syncData();
  else console.log(`生成数据已是最新版本：${commit.slice(0, 12)}`);
} catch (error) {
  if (manifest?.schemaVersion === 11) {
    console.warn(`上游暂不可用，继续使用已有生成数据：${(error as Error).message}`);
  } else {
    throw error;
  }
}
