import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteRoot } from '../data/paths.js';
import { readUpstreamLock, type UpstreamLock } from './lock.js';
import { resolveFormalDataSource } from './formal-source.js';

function runPnpm(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const entrypoint = process.env.npm_execpath;
    const child = spawn(
      entrypoint ? process.execPath : 'pnpm',
      entrypoint ? [entrypoint, ...args] : args,
      {
        cwd: siteRoot,
        env,
        shell: false,
        stdio: 'inherit',
        windowsHide: true
      }
    );
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`[prebuild] pnpm ${args.join(' ')} failed (${code})`))
    );
  });
}

interface PrebuildDependencies {
  env?: NodeJS.ProcessEnv;
  readLock?: () => Promise<UpstreamLock>;
  run?: typeof runPnpm;
}

export async function runPrebuild(dependencies: PrebuildDependencies = {}): Promise<void> {
  const env = dependencies.env ?? process.env;
  const lock = await (dependencies.readLock ?? (() => readUpstreamLock(siteRoot)))();
  const source = await resolveFormalDataSource(lock, env);
  const childEnv = {
    ...env,
    HSR_DATA_ROOT: source.root,
    HSR_EXPECTED_DATA_COMMIT: source.commit
  };
  const run = dependencies.run ?? runPnpm;
  console.log(`[prebuild] HSR_DATA_ROOT=${source.root}; commit=${source.commit}`);
  for (const command of [
    'messages:compile',
    'data:ensure',
    'assets:ensure',
    'relic-score:v2:benchmarks:validate'
  ])
    await run([command], childEnv);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPrebuild().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
