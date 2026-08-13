import { assertAssetRoot, assetSourceCommit, resolveAssetRoot } from './paths.js';
import { syncAssets } from './sync.js';
import {
  manifestCoversRequirements,
  manifestFilesExist,
  readAssetManifest,
  readAssetRequirements
} from './shared.js';

const requirements = await readAssetRequirements();
const manifest = await readAssetManifest();

try {
  const root = assertAssetRoot(resolveAssetRoot());
  const commit = assetSourceCommit(root);
  const valid =
    !!manifest &&
    manifest.sourceCommit === commit &&
    manifestCoversRequirements(manifest, requirements) &&
    (await manifestFilesExist(manifest));
  if (valid) console.log(`视觉资源已是最新版本：${commit.slice(0, 12)}`);
  else await syncAssets();
} catch (error) {
  const validCache =
    !!manifest &&
    manifestCoversRequirements(manifest, requirements) &&
    (await manifestFilesExist(manifest));
  if (validCache) {
    console.warn(`视觉资源上游暂不可用，继续使用已有缓存：${(error as Error).message}`);
  } else {
    await syncAssets();
  }
}
