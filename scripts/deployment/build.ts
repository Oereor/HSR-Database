import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  loadDeploymentLock,
  prepareStarRailRes,
  prepareTurnBasedGameData,
  siteRoot
} from './prepare.js';

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

async function timed<T>(label: string, operation: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await operation();
  } finally {
    console.log(`[timing] ${label}: ${((performance.now() - started) / 1000).toFixed(3)}s`);
  }
}

const overallStarted = performance.now();
const lock = await timed('lock', loadDeploymentLock);
const turnBasedRoot = await timed('TurnBasedGameData preparation', () =>
  prepareTurnBasedGameData(lock)
);
const env = {
  ...process.env,
  HSR_DATA_ROOT: path.relative(siteRoot, turnBasedRoot).replaceAll('\\', '/'),
  HSR_ASSET_ROOT: path
    .relative(siteRoot, path.join(siteRoot, '.upstream', 'StarRailRes'))
    .replaceAll('\\', '/')
};

console.log(`[data] HSR_DATA_ROOT=${env.HSR_DATA_ROOT}`);
await timed('data ensure/generation', () => runPnpm(['data:ensure'], env));

const starRailRoot = await timed('StarRailRes preparation', () => prepareStarRailRes(lock));
env.HSR_ASSET_ROOT = path.relative(siteRoot, starRailRoot).replaceAll('\\', '/');
console.log(`[assets] HSR_ASSET_ROOT=${env.HSR_ASSET_ROOT}`);
await timed('asset ensure/generation', () => runPnpm(['assets:ensure'], env));

console.log('[build] vite build');
await timed('SvelteKit build', async () => {
  await runPnpm(['exec', 'svelte-kit', 'sync'], env);
  await runPnpm(['exec', 'vite', 'build'], env);
});
console.log(`[timing] overall: ${((performance.now() - overallStarted) / 1000).toFixed(3)}s`);
