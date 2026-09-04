import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  loadDeploymentLock,
  prepareStarRailRes,
  prepareTurnBasedGameData,
  siteRoot
} from './prepare.js';
import type { UpstreamLock } from './lock.js';

export type DeploymentCommandRunner = (args: string[], env: NodeJS.ProcessEnv) => Promise<void>;

export interface DeploymentBuildDependencies {
  loadLock?: () => Promise<UpstreamLock>;
  prepareTurnBased?: (lock: UpstreamLock) => Promise<string>;
  prepareStarRail?: (lock: UpstreamLock) => Promise<string>;
  commandRunner?: DeploymentCommandRunner;
}

const runPnpm: DeploymentCommandRunner = (args, env) => {
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
};

async function timed<T>(label: string, operation: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await operation();
  } finally {
    console.log(`[timing] ${label}: ${((performance.now() - started) / 1000).toFixed(3)}s`);
  }
}

export async function runDeploymentBuild(
  dependencies: DeploymentBuildDependencies = {}
): Promise<void> {
  const overallStarted = performance.now();
  const loadLock = dependencies.loadLock ?? loadDeploymentLock;
  const prepareTurnBased = dependencies.prepareTurnBased ?? prepareTurnBasedGameData;
  const prepareStarRail = dependencies.prepareStarRail ?? prepareStarRailRes;
  const commandRunner = dependencies.commandRunner ?? runPnpm;
  const lock = await timed('lock', loadLock);
  const turnBasedRoot = await timed('TurnBasedGameData preparation', () => prepareTurnBased(lock));
  const env = {
    ...process.env,
    HSR_DEPLOYMENT_BUILD: '1',
    HSR_EXPECTED_ASSET_COMMIT: lock.starRailRes.commit,
    HSR_EXPECTED_DATA_COMMIT: lock.turnBasedGameData.commit,
    HSR_DATA_ROOT: path.relative(siteRoot, turnBasedRoot).replaceAll('\\', '/'),
    HSR_ASSET_ROOT: path
      .relative(siteRoot, path.join(siteRoot, '.upstream', 'StarRailRes'))
      .replaceAll('\\', '/')
  };

  console.log(`[data] HSR_DATA_ROOT=${env.HSR_DATA_ROOT}`);
  await timed('official search names validation', () =>
    commandRunner(['data:search-names:check'], env)
  );
  await timed('data ensure/generation', () => commandRunner(['data:ensure'], env));

  console.log('[enemy-assets] ensuring Nanoka enemy images');
  await timed('enemy asset ensure/generation', () => commandRunner(['assets:ensure:enemies'], env));

  const starRailRoot = await timed('StarRailRes preparation', () => prepareStarRail(lock));
  env.HSR_ASSET_ROOT = path.relative(siteRoot, starRailRoot).replaceAll('\\', '/');
  console.log(`[assets] HSR_ASSET_ROOT=${env.HSR_ASSET_ROOT}`);
  await timed('asset ensure/generation', () => commandRunner(['assets:ensure'], env));
  await timed('asset verification', () => commandRunner(['assets:verify'], env));

  console.log('[build] vite build');
  await timed('SvelteKit build', async () => {
    await commandRunner(['exec', 'svelte-kit', 'sync'], env);
    await commandRunner(['exec', 'vite', 'build'], env);
  });
  await timed('final build asset verification', () => commandRunner(['deploy:verify'], env));
  console.log(`[timing] overall: ${((performance.now() - overallStarted) / 1000).toFixed(3)}s`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await runDeploymentBuild();
}
