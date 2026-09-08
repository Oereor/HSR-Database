import path from 'node:path';
import type { VisualAssetManifest } from '../../src/lib/domain/visual-assets.js';
import { assertAssetRoot, assetSourceCommit, resolveAssetRoot } from './paths.js';
import { syncAssets } from './sync.js';
import {
  assetRequirementsFingerprint,
  buildAssetFileIndex,
  manifestCoversRequirements,
  manifestFilesExist,
  readAssetManifest,
  readAssetRequirements,
  warnAssetFallback
} from './shared.js';
import type { AssetFileIndex, AssetRequirements } from './shared.js';

export interface AssetValidationContext {
  requirements: AssetRequirements;
  manifest: VisualAssetManifest;
  sourceCommit: string;
  fileIndex: AssetFileIndex;
}

export interface EnsureAssetsOptions {
  env?: NodeJS.ProcessEnv;
}

async function validatedContext(
  requirements: AssetRequirements,
  manifest: VisualAssetManifest,
  sourceCommit: string
): Promise<AssetValidationContext | undefined> {
  let fileIndex: AssetFileIndex;
  try {
    fileIndex = await buildAssetFileIndex(manifest);
  } catch {
    return undefined;
  }
  if (
    manifest.sourceCommit !== sourceCommit ||
    manifest.requirementsFingerprint !== assetRequirementsFingerprint(requirements) ||
    !manifestCoversRequirements(manifest, requirements) ||
    !(await manifestFilesExist(manifest, undefined, fileIndex))
  )
    return undefined;
  return { requirements, manifest, sourceCommit, fileIndex };
}

export async function ensureAssets(
  options: EnsureAssetsOptions = {}
): Promise<AssetValidationContext> {
  const env = options.env ?? process.env;
  const requirements = await readAssetRequirements();
  const cached = await readAssetManifest();
  const expectedCommit = env.HSR_EXPECTED_ASSET_COMMIT;

  try {
    const root = assertAssetRoot(resolveAssetRoot(env.HSR_ASSET_ROOT));
    const commit = assetSourceCommit(root);
    const context =
      cached && (!expectedCommit || cached.sourceCommit === expectedCommit)
        ? await validatedContext(requirements, cached, commit)
        : undefined;
    if (context) {
      console.log(`视觉资源已是最新版本：${commit.slice(0, 12)}`);
      warnAssetFallback(context.manifest, `缓存对应 StarRailRes ${commit.slice(0, 12)}`);
      return context;
    }
    const manifest = await syncAssets({ requirements, env });
    const generated = await validatedContext(requirements, manifest, commit);
    if (!generated) throw new Error('视觉资源生成后未通过 manifest 与文件存在性验证。');
    return generated;
  } catch (error) {
    if (env.HSR_DEPLOYMENT_BUILD === '1') throw error;
    const context =
      cached && (!expectedCommit || cached.sourceCommit === expectedCommit)
        ? await validatedContext(requirements, cached, cached.sourceCommit ?? '')
        : undefined;
    if (context) {
      console.warn(`视觉资源上游暂不可用，继续使用已有缓存：${(error as Error).message}`);
      warnAssetFallback(context.manifest, '现有缓存');
      return context;
    }
    const manifest = await syncAssets({ requirements, env });
    const fallback = await validatedContext(requirements, manifest, manifest.sourceCommit ?? '');
    if (!fallback) {
      throw new Error('视觉资源 fallback 未通过 manifest 与文件存在性验证。', {
        cause: error
      });
    }
    return fallback;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await ensureAssets();
}
