import { assertAssetRoot, assetSourceCommit, resolveAssetRoot } from './paths.js';
import { syncAssets } from './sync.js';
import {
  assetRequirementsFingerprint,
  manifestCoversRequirements,
  manifestFilesExist,
  readAssetManifest,
  readAssetRequirements,
  warnAssetFallback
} from './shared.js';

const requirements = await readAssetRequirements();
const manifest = await readAssetManifest();
const expectedCommit = process.env.HSR_EXPECTED_ASSET_COMMIT;

try {
  const root = assertAssetRoot(resolveAssetRoot());
  const commit = assetSourceCommit(root);
  const valid =
    !!manifest &&
    manifest.sourceCommit === commit &&
    (!expectedCommit || manifest.sourceCommit === expectedCommit) &&
    manifest.requirementsFingerprint === assetRequirementsFingerprint(requirements) &&
    manifestCoversRequirements(manifest, requirements) &&
    (await manifestFilesExist(manifest));
  if (valid) {
    console.log(`视觉资源已是最新版本：${commit.slice(0, 12)}`);
    warnAssetFallback(manifest, `缓存对应 StarRailRes ${commit.slice(0, 12)}`);
  } else await syncAssets();
} catch (error) {
  if (process.env.HSR_DEPLOYMENT_BUILD === '1') throw error;
  const validCache =
    !!manifest &&
    (!expectedCommit || manifest.sourceCommit === expectedCommit) &&
    manifest.requirementsFingerprint === assetRequirementsFingerprint(requirements) &&
    manifestCoversRequirements(manifest, requirements) &&
    (await manifestFilesExist(manifest));
  if (validCache) {
    console.warn(`视觉资源上游暂不可用，继续使用已有缓存：${(error as Error).message}`);
    warnAssetFallback(manifest, '现有缓存');
  } else {
    await syncAssets();
  }
}
