import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  loadDeploymentLock,
  prepareStarRailRes,
  prepareTurnBasedGameData,
  siteRoot
} from '../deployment/prepare.js';

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
      code === 0 ? resolve() : reject(new Error(`[ci:prepare] pnpm ${args.join(' ')} failed`))
    );
  });
}

const lock = await loadDeploymentLock();
const turnBasedRoot = await prepareTurnBasedGameData(lock);
const starRailRoot = await prepareStarRailRes(lock);
const env = {
  ...process.env,
  HSR_DEPLOYMENT_BUILD: '1',
  HSR_EXPECTED_DATA_COMMIT: lock.turnBasedGameData.commit,
  HSR_EXPECTED_ASSET_COMMIT: lock.starRailRes.commit,
  HSR_DATA_ROOT: path.relative(siteRoot, turnBasedRoot).replaceAll('\\', '/'),
  HSR_ASSET_ROOT: path.relative(siteRoot, starRailRoot).replaceAll('\\', '/')
};

await runPnpm(['data:ensure'], env);
await runPnpm(['assets:ensure:enemies'], env);
await runPnpm(['assets:ensure'], env);
console.log('CI inputs prepared from pinned upstream revisions.');
