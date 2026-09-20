import path from 'node:path';
import { stat } from 'node:fs/promises';
import { enemyAssetRoot, readEnemyRequirements, validateSnapshot } from './snapshot.js';

export async function validateEnemyAssets(): Promise<void> {
  const started = performance.now();
  const result = await validateSnapshot(await readEnemyRequirements());
  const snapshotBytes =
    result.bytes +
    (await stat(path.join(enemyAssetRoot, 'index.json'))).size +
    (await stat(path.join(enemyAssetRoot, 'README.md'))).size;
  console.log('[deploy:cache] enemy-assets result=hit reason=tracked-snapshot-valid');
  console.log(`[deploy:io] enemy-assets-output files=${result.images + 2} bytes=${snapshotBytes}`);
  console.log(
    `[enemy-assets] mapped=${result.mapped} unavailable=${result.unavailable} images=${result.images} wall=${((performance.now() - started) / 1000).toFixed(3)}s`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await validateEnemyAssets();
}
