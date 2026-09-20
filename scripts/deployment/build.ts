import { execFileSync, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DataManifest } from '../../src/lib/domain/types.js';
import {
  loadDeploymentLock,
  prepareStarRailRes,
  prepareTurnBasedGameData,
  siteRoot
} from './prepare.js';
import { logFileSummary, summarizeDirectory, withProcessTelemetry } from './telemetry.js';
import { verifyBuildAssetClosure, verifyBuildSmoke } from './verify-build.js';
import { verifyBuildPageRoutes } from './verify-routes.js';

export type BuildProfile = 'preview' | 'production' | 'development' | 'ci';

interface StageTiming {
  label: string;
  seconds: number;
  failed: boolean;
}

const TIMING_ORDER = [
  'lock',
  'messages-compile',
  'prepare-turnbased',
  'prepare-starrailres',
  'data-ensure',
  'data-validate-full',
  'data-validate-build-inputs',
  'enemy-assets-validate',
  'assets-ensure',
  'assets-verify',
  'search-names-check',
  'check',
  'lint',
  'test',
  'vite-build',
  'output-smoke',
  'deploy-verify',
  'route-verify'
] as const;

function requestedProfile(args: string[]): BuildProfile | undefined {
  const values = args.flatMap((argument, index) => {
    if (argument.startsWith('--profile=')) return [argument.slice('--profile='.length)];
    if (argument === '--profile') return [args[index + 1] ?? ''];
    return [];
  });
  const unknown = args.filter(
    (argument, index) =>
      argument !== '--' &&
      argument !== '--profile' &&
      args[index - 1] !== '--profile' &&
      !argument.startsWith('--profile=')
  );
  if (unknown.length || values.length > 1)
    throw new Error(`deploy:build 参数无效：${unknown.join(', ') || args.join(' ')}`);
  if (!values.length) return undefined;
  const value = values[0];
  if (value === 'preview' || value === 'production' || value === 'development' || value === 'ci')
    return value;
  throw new Error(`未知 build profile：${value || '(empty)'}`);
}

function resolveBuildProfile(
  environment: NodeJS.ProcessEnv,
  explicit?: BuildProfile
): BuildProfile {
  if (explicit) return explicit;
  const vercelEnv = environment.VERCEL_ENV?.trim();
  if (!vercelEnv) return 'production';
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview' || vercelEnv === 'development') return 'preview';
  throw new Error(`无法从 VERCEL_ENV=${vercelEnv} 解析 build profile`);
}

function runPnpm(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const pnpmEntrypoint = process.env.npm_execpath;
    const command = pnpmEntrypoint ? process.execPath : 'pnpm';
    const commandArgs = pnpmEntrypoint ? [pnpmEntrypoint, ...args] : args;
    const child = spawn(command, commandArgs, {
      cwd: siteRoot,
      env,
      shell: false,
      stdio: 'inherit',
      windowsHide: true
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`[build] pnpm ${args.join(' ')} 失败（${code}）`))
    );
  });
}

function namedError(label: string, error: unknown): Error {
  return new Error(`[deploy] ${label} failed: ${(error as Error).message}`, { cause: error });
}

function throwCollected(errors: Error[], message: string): void {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, message);
}

function deploymentBuildVersion(env: NodeJS.ProcessEnv): string {
  for (const candidate of [env.VERCEL_GIT_COMMIT_SHA, env.GITHUB_SHA])
    if (candidate && /^[0-9a-f]{40}$/i.test(candidate)) return candidate.toLowerCase();
  return execFileSync(
    'git',
    ['-c', `safe.directory=${siteRoot.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'],
    { cwd: siteRoot, encoding: 'utf8', windowsHide: true }
  ).trim();
}

export async function runDeploymentBuild(explicitProfile?: BuildProfile): Promise<void> {
  const overallStarted = performance.now();
  const timings: StageTiming[] = [];
  const profile = resolveBuildProfile(process.env, explicitProfile);
  const fullIntegrity = profile === 'production' || profile === 'ci';
  const repositoryChecks = profile === 'development' || profile === 'ci';

  console.log(`[deploy] profile=${profile}`);
  console.log(`[deploy] VERCEL_ENV=${process.env.VERCEL_ENV?.trim() || 'unavailable'}`);

  const timed = async <T>(label: string, operation: () => Promise<T>): Promise<T> => {
    const started = performance.now();
    let failed = false;
    try {
      return await operation();
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      const seconds = (performance.now() - started) / 1000;
      timings.push({ label, seconds, failed });
      console.log(
        `[deploy:stage] ${label} wall=${seconds.toFixed(3)}s status=${failed ? 'failed' : 'passed'}`
      );
    }
  };

  try {
    const lock = await timed('lock', loadDeploymentLock);
    const initialEnv = {
      ...process.env,
      HSR_DEPLOYMENT_BUILD: '1',
      HSR_BUILD_VERSION: deploymentBuildVersion(process.env),
      HSR_EXPECTED_ASSET_COMMIT: lock.starRailRes.commit,
      HSR_EXPECTED_DATA_COMMIT: lock.turnBasedGameData.commit
    };
    const settle = <T>(label: string, promise: Promise<T>) =>
      promise.then(
        (value) => ({ value }),
        (error) => ({ error: namedError(label, error) })
      );
    const messages = settle(
      'messages-compile',
      timed('messages-compile', () => runPnpm(['messages:compile'], initialEnv))
    );
    const turnBasedPreparation = settle(
      'prepare-turnbased',
      timed('prepare-turnbased', () => prepareTurnBasedGameData(lock))
    );
    const starRailPreparation = settle(
      'prepare-starrailres',
      timed('prepare-starrailres', () => prepareStarRailRes(lock))
    );

    const earlyErrors: Error[] = [];
    const messagesResult = await messages;
    if ('error' in messagesResult) earlyErrors.push(messagesResult.error);
    const turnBasedResult = await turnBasedPreparation;
    if ('error' in turnBasedResult) earlyErrors.push(turnBasedResult.error);
    if (earlyErrors.length) {
      const starRailResult = await starRailPreparation;
      if ('error' in starRailResult) earlyErrors.push(starRailResult.error);
      throwCollected(earlyErrors, 'Deployment prerequisites failed');
    }
    if (!('value' in turnBasedResult)) throw turnBasedResult.error;

    const env = {
      ...initialEnv,
      HSR_DATA_ROOT: path.relative(siteRoot, turnBasedResult.value.directory).replaceAll('\\', '/'),
      HSR_ASSET_ROOT: path
        .relative(siteRoot, path.join(siteRoot, '.upstream', 'StarRailRes'))
        .replaceAll('\\', '/')
    };
    console.log(`[data] HSR_DATA_ROOT=${env.HSR_DATA_ROOT}`);
    await timed('data-ensure', () => runPnpm(['data:ensure'], env));
    const manifest = JSON.parse(
      await readFile(path.join(siteRoot, 'src/lib/generated/manifest.json'), 'utf8')
    ) as DataManifest;
    if (profile === 'ci')
      await timed('data-validate-full', () => runPnpm(['data:validate:full'], env));
    else if (profile === 'production')
      await timed('data-validate-build-inputs', () => runPnpm(['data:validate:build-inputs'], env));

    const starRailResult = await starRailPreparation;
    if (!('value' in starRailResult)) throw starRailResult.error;
    env.HSR_ASSET_ROOT = path
      .relative(siteRoot, starRailResult.value.directory)
      .replaceAll('\\', '/');
    console.log(`[assets] HSR_ASSET_ROOT=${env.HSR_ASSET_ROOT}`);
    console.log(
      `[deploy:cache] turnbased-checkout result=${turnBasedResult.value.result} reason=pinned-source`
    );
    console.log(
      `[deploy:cache] starrailres-checkout result=${starRailResult.value.result} reason=pinned-source`
    );
    logFileSummary('turnbased-input', turnBasedResult.value.summary);
    logFileSummary('starrailres-input', starRailResult.value.summary);

    const [enemyResult, generalResult] = await Promise.allSettled([
      timed('enemy-assets-validate', () => runPnpm(['validate:enemy-assets'], env)),
      (async () => {
        const { ensureAssets } = await import('../assets/ensure.js');
        const context = await timed('assets-ensure', () =>
          withProcessTelemetry('general-assets', () => ensureAssets({ env }))
        );
        logFileSummary('general-assets-output', context.observation.summary);
        if (fullIntegrity) {
          const { verifyAssets } = await import('../assets/verify.js');
          await timed('assets-verify', () => verifyAssets(context, env));
        }
      })()
    ]);
    const assetErrors: Error[] = [];
    if (enemyResult.status === 'rejected')
      assetErrors.push(namedError('enemy-assets-validate', enemyResult.reason));
    if (generalResult.status === 'rejected')
      assetErrors.push(namedError('general-assets', generalResult.reason));
    throwCollected(assetErrors, 'Asset preparation failed');
    logFileSummary(
      'enemy-assets-output',
      await summarizeDirectory(path.join(siteRoot, 'static/generated-enemy-assets'))
    );

    if (repositoryChecks) {
      await timed('search-names-check', () => runPnpm(['data:search-names:check'], env));
      await timed('check', () => runPnpm(['check'], env));
      await timed('lint', () => runPnpm(['lint'], env));
      await timed('test', () => runPnpm(['test'], env));
    }

    await timed('vite-build', async () => {
      await runPnpm(['exec', 'svelte-kit', 'sync'], env);
      await runPnpm(['exec', 'vite', 'build'], env);
    });
    const { localizedHref } = await import('../../src/lib/i18n/routing.js');
    const rootPagePaths = manifest.publicLocales.map((locale) => localizedHref('/', locale));
    await timed('output-smoke', () => verifyBuildSmoke(rootPagePaths));
    if (fullIntegrity) {
      const summary = await timed('deploy-verify', () => verifyBuildAssetClosure());
      logFileSummary('build-output', summary);
      await timed('route-verify', () =>
        verifyBuildPageRoutes(
          manifest.publicLocales.flatMap((locale) =>
            manifest.routePaths.map((route) => localizedHref(route, locale))
          )
        )
      );
    } else {
      logFileSummary('build-output', await summarizeDirectory(path.join(siteRoot, 'build')));
    }
  } finally {
    const byLabel = new Map(timings.map((timing) => [timing.label, timing]));
    console.log('[deploy:stage] summary');
    for (const label of TIMING_ORDER) {
      const timing = byLabel.get(label);
      if (timing)
        console.log(
          `  ${label.padEnd(28)} ${timing.seconds.toFixed(3)}s ${timing.failed ? 'failed' : 'passed'}`
        );
    }
    console.log(
      `  ${'total'.padEnd(28)} ${((performance.now() - overallStarted) / 1000).toFixed(3)}s`
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await runDeploymentBuild(requestedProfile(process.argv.slice(2)));
}
