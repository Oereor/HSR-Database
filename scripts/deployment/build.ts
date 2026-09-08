import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { ensureAssets, type AssetValidationContext } from '../assets/ensure.js';
import { verifyAssets } from '../assets/verify.js';
import {
  loadDeploymentLock,
  prepareStarRailRes,
  prepareTurnBasedGameData,
  siteRoot
} from './prepare.js';
import type { UpstreamLock } from './lock.js';

export type DeploymentMode = 'preview-full' | 'production-ci-backed';
export type DeploymentCommandRunner = (args: string[], env: NodeJS.ProcessEnv) => Promise<void>;

export interface DeploymentBuildDependencies {
  environment?: NodeJS.ProcessEnv;
  loadLock?: () => Promise<UpstreamLock>;
  prepareTurnBased?: (lock: UpstreamLock) => Promise<string>;
  prepareStarRail?: (lock: UpstreamLock) => Promise<string>;
  commandRunner?: DeploymentCommandRunner;
  ensureGeneralAssets?: (env: NodeJS.ProcessEnv) => Promise<AssetValidationContext>;
  verifyGeneralAssets?: (context: AssetValidationContext, env: NodeJS.ProcessEnv) => Promise<void>;
}

interface StageTiming {
  label: string;
  seconds: number;
  failed: boolean;
}

const TIMING_ORDER = [
  'lock',
  'messages-and-script-checks',
  'prepare-turnbased',
  'prepare-starrailres',
  'search-names-check',
  'data-ensure',
  'enemy-assets-ensure',
  'assets-ensure',
  'assets-verify',
  'vite-build',
  'deploy-verify'
] as const;

export function resolveDeploymentMode(vercelEnv: string | undefined): DeploymentMode {
  return vercelEnv === 'production' ? 'production-ci-backed' : 'preview-full';
}

const runPnpm: DeploymentCommandRunner = (args, env) =>
  new Promise((resolve, reject) => {
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

function namedError(label: string, error: unknown): Error {
  return new Error(`[deploy] ${label} failed: ${(error as Error).message}`, { cause: error });
}

function throwCollected(errors: Error[], message: string): void {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, message);
}

function environmentLabel(value: string | undefined): string {
  if (value === undefined || value === '') return 'unavailable';
  if (['production', 'preview', 'development'].includes(value)) return value;
  return 'unknown';
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

export async function runDeploymentBuild(
  dependencies: DeploymentBuildDependencies = {}
): Promise<void> {
  const overallStarted = performance.now();
  const timings: StageTiming[] = [];
  const baseEnv = dependencies.environment ?? process.env;
  const mode = resolveDeploymentMode(baseEnv.VERCEL_ENV);
  const loadLock = dependencies.loadLock ?? loadDeploymentLock;
  const prepareTurnBased = dependencies.prepareTurnBased ?? prepareTurnBasedGameData;
  const prepareStarRail = dependencies.prepareStarRail ?? prepareStarRailRes;
  const commandRunner = dependencies.commandRunner ?? runPnpm;
  const ensureGeneralAssets = dependencies.ensureGeneralAssets ?? ((env) => ensureAssets({ env }));
  const verifyGeneralAssets = dependencies.verifyGeneralAssets ?? verifyAssets;

  console.log(`[deploy] mode=${mode}`);
  console.log(`[deploy] VERCEL_ENV=${environmentLabel(baseEnv.VERCEL_ENV)}`);
  if (baseEnv.VERCEL_ENV === undefined)
    console.log('[deploy] VERCEL_ENV unavailable; falling back to full validation');
  else if (mode === 'preview-full' && !['preview', 'development'].includes(baseEnv.VERCEL_ENV))
    console.log('[deploy] unrecognized VERCEL_ENV; falling back to full validation');

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
      console.log(`[deploy:timing] ${label} ${seconds.toFixed(3)}s${failed ? ' (failed)' : ''}`);
    }
  };

  try {
    const lock = await timed('lock', loadLock);
    const initialEnv = {
      ...baseEnv,
      HSR_DEPLOYMENT_BUILD: '1',
      HSR_BUILD_VERSION: deploymentBuildVersion(baseEnv),
      HSR_EXPECTED_ASSET_COMMIT: lock.starRailRes.commit,
      HSR_EXPECTED_DATA_COMMIT: lock.turnBasedGameData.commit
    };
    const settle = <T>(label: string, promise: Promise<T>) =>
      promise.then(
        (value) => ({ value }),
        (error) => ({ error: namedError(label, error) })
      );
    const messageChecks = settle(
      'messages-and-script-checks',
      timed('messages-and-script-checks', () =>
        commandRunner(
          [mode === 'production-ci-backed' ? 'messages:compile' : 'check:scripts'],
          initialEnv
        )
      )
    );
    const turnBasedPreparation = settle(
      'prepare-turnbased',
      timed('prepare-turnbased', () => prepareTurnBased(lock))
    );
    const starRailPreparation = settle(
      'prepare-starrailres',
      timed('prepare-starrailres', () => prepareStarRail(lock))
    );

    const earlyErrors: Error[] = [];
    const messageResult = await messageChecks;
    if ('error' in messageResult) earlyErrors.push(messageResult.error);
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
      HSR_DATA_ROOT: path.relative(siteRoot, turnBasedResult.value).replaceAll('\\', '/'),
      HSR_ASSET_ROOT: path
        .relative(siteRoot, path.join(siteRoot, '.upstream', 'StarRailRes'))
        .replaceAll('\\', '/')
    };
    console.log(`[data] HSR_DATA_ROOT=${env.HSR_DATA_ROOT}`);
    let dataError: Error | undefined;
    try {
      if (mode === 'preview-full')
        await timed('search-names-check', () => commandRunner(['data:search-names:check'], env));
      await timed('data-ensure', () => commandRunner(['data:ensure'], env));
    } catch (error) {
      dataError = namedError('data preparation', error);
    }

    const starRailResult = await starRailPreparation;
    const preparationErrors = [
      ...(dataError ? [dataError] : []),
      ...('error' in starRailResult ? [starRailResult.error] : [])
    ];
    throwCollected(preparationErrors, 'Data or upstream preparation failed');
    if (!('value' in starRailResult)) throw starRailResult.error;
    env.HSR_ASSET_ROOT = path.relative(siteRoot, starRailResult.value).replaceAll('\\', '/');
    console.log(`[assets] HSR_ASSET_ROOT=${env.HSR_ASSET_ROOT}`);

    console.log('[enemy-assets] ensuring Nanoka enemy images');
    const [enemyResult, generalResult] = await Promise.allSettled([
      timed('enemy-assets-ensure', () => commandRunner(['assets:ensure:enemies'], env)),
      (async () => {
        const context = await timed('assets-ensure', () => ensureGeneralAssets(env));
        await timed('assets-verify', () => verifyGeneralAssets(context, env));
      })()
    ]);
    const assetErrors: Error[] = [];
    if (enemyResult.status === 'rejected')
      assetErrors.push(namedError('enemy-assets-ensure', enemyResult.reason));
    if (generalResult.status === 'rejected')
      assetErrors.push(namedError('general-assets', generalResult.reason));
    throwCollected(assetErrors, 'Asset preparation failed');

    console.log('[build] vite build');
    await timed('vite-build', async () => {
      await commandRunner(['exec', 'svelte-kit', 'sync'], env);
      await commandRunner(['exec', 'vite', 'build'], env);
    });
    await timed('deploy-verify', () => commandRunner(['deploy:verify'], env));
  } finally {
    const byLabel = new Map(timings.map((timing) => [timing.label, timing]));
    console.log('[deploy:timing] summary');
    for (const label of TIMING_ORDER) {
      const timing = byLabel.get(label);
      if (timing)
        console.log(
          `  ${label.padEnd(28)} ${timing.seconds.toFixed(3)}s${timing.failed ? ' failed' : ''}`
        );
    }
    console.log(
      `  ${'total'.padEnd(28)} ${((performance.now() - overallStarted) / 1000).toFixed(3)}s`
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await runDeploymentBuild();
}
