import path from 'node:path';
import type { VisualAssetManifest } from '../../src/lib/domain/visual-assets.js';
import { resolveDataRoot } from '../data/paths.js';
import { assertAssetRoot, assetSourceCommit, resolveAssetRoot } from './paths.js';
import { syncAssets } from './sync.js';
import {
  assetRequirementsFingerprint,
  manifestCoversRequirements,
  manifestFilesExist,
  observeGeneratedAssetFiles,
  readAssetManifest,
  readAssetRequirements,
  VISUAL_ASSET_SCHEMA_VERSION,
  warnAssetFallback
} from './shared.js';
import type { AssetRequirements, AssetFilesFailure } from './shared.js';
import type { AssetFilesystemObservation } from './observation.js';
import type { ManifestReadFailure } from '../deployment/cache-diagnostics.js';

export interface AssetValidationContext {
  requirements: AssetRequirements;
  manifest: VisualAssetManifest;
  sourceCommit: string;
  observation: AssetFilesystemObservation;
}

export interface EnsureAssetsOptions {
  env?: NodeJS.ProcessEnv;
}

type AssetCacheFailure =
  | ManifestReadFailure
  | AssetFilesFailure
  | 'source-changed'
  | 'manifest-schema-invalid'
  | 'requirements-fingerprint-changed'
  | 'requirements-coverage-mismatch';

type AssetCacheCheck =
  | { context: AssetValidationContext; reason?: never }
  | { context?: never; reason: AssetCacheFailure };

async function validatedContext(
  requirements: AssetRequirements,
  manifest: VisualAssetManifest,
  sourceCommit: string,
  observation?: AssetFilesystemObservation
): Promise<AssetCacheCheck> {
  let actual: AssetFilesystemObservation;
  try {
    actual = observation ?? (await observeGeneratedAssetFiles());
  } catch {
    return { reason: 'filesystem-observation-failed' };
  }
  if (manifest.sourceCommit !== sourceCommit) return { reason: 'source-changed' };
  if (manifest.requirementsFingerprint !== assetRequirementsFingerprint(requirements))
    return { reason: 'requirements-fingerprint-changed' };
  if (!manifestCoversRequirements(manifest, requirements))
    return {
      reason:
        manifest.schemaVersion !== VISUAL_ASSET_SCHEMA_VERSION
          ? 'manifest-schema-invalid'
          : 'requirements-coverage-mismatch'
    };
  let reason: AssetFilesFailure = 'generated-files-missing';
  if (
    !(await manifestFilesExist(manifest, undefined, actual, (failure) => {
      reason = failure;
    }))
  )
    return { reason };
  return { context: { requirements, manifest, sourceCommit, observation: actual } };
}

export async function ensureAssets(
  options: EnsureAssetsOptions = {}
): Promise<AssetValidationContext> {
  const env = options.env ?? process.env;
  const requirements = await readAssetRequirements(resolveDataRoot(env.HSR_DATA_ROOT));
  // A successfully parsed falsy JSON value still follows the existing cache-miss path.
  let manifestFailure: AssetCacheFailure = 'manifest-schema-invalid';
  const cached = await readAssetManifest((reason) => {
    manifestFailure = reason;
  });
  const expectedCommit = env.HSR_EXPECTED_ASSET_COMMIT;

  try {
    const root = assertAssetRoot(resolveAssetRoot(env.HSR_ASSET_ROOT));
    const commit = assetSourceCommit(root);
    const check: AssetCacheCheck =
      cached && (!expectedCommit || cached.sourceCommit === expectedCommit)
        ? await validatedContext(requirements, cached, commit)
        : { reason: cached ? 'source-changed' : manifestFailure };
    const { context } = check;
    if (context) {
      console.log(
        '[deploy:cache] general-assets result=hit reason=manifest-source-and-files-match'
      );
      console.log(`视觉资源已是最新版本：${commit.slice(0, 12)}`);
      warnAssetFallback(context.manifest, `缓存对应 StarRailRes ${commit.slice(0, 12)}`);
      return context;
    }
    console.log(`[deploy:cache] general-assets result=miss reason=${check.reason}`);
    const synchronized = await syncAssets({ requirements, env });
    const generated = await validatedContext(
      requirements,
      synchronized.manifest,
      commit,
      synchronized.observation
    );
    if (!generated.context) throw new Error('视觉资源生成后未通过 manifest 与文件存在性验证。');
    return generated.context;
  } catch (error) {
    if (env.HSR_DEPLOYMENT_BUILD === '1') throw error;
    const check: AssetCacheCheck =
      cached && (!expectedCommit || cached.sourceCommit === expectedCommit)
        ? await validatedContext(requirements, cached, cached.sourceCommit ?? '')
        : { reason: cached ? 'source-changed' : manifestFailure };
    const { context } = check;
    if (context) {
      console.log(
        '[deploy:cache] general-assets result=fallback reason=source-unavailable-valid-cache'
      );
      console.warn(`视觉资源上游暂不可用，继续使用已有缓存：${(error as Error).message}`);
      warnAssetFallback(context.manifest, '现有缓存');
      return context;
    }
    console.log('[deploy:cache] general-assets result=miss reason=no-valid-fallback');
    const synchronized = await syncAssets({ requirements, env });
    const fallback = await validatedContext(
      requirements,
      synchronized.manifest,
      synchronized.manifest.sourceCommit ?? '',
      synchronized.observation
    );
    if (!fallback.context) {
      throw new Error('视觉资源 fallback 未通过 manifest 与文件存在性验证。', {
        cause: error
      });
    }
    return fallback.context;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await ensureAssets();
}
