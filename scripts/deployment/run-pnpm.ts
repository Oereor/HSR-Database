import { spawn } from 'node:child_process';
import { siteRoot } from '../data/paths.js';

export function runPnpm(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const entrypoint = env.npm_execpath || 'pnpm';
  const isJavaScript = /\.[cm]?js$/i.test(entrypoint);

  return new Promise((resolve, reject) => {
    const child = spawn(
      isJavaScript ? process.execPath : entrypoint,
      isJavaScript ? [entrypoint, ...args] : args,
      { cwd: siteRoot, env, shell: false, stdio: 'inherit', windowsHide: true }
    );
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`[pnpm] ${args.join(' ')} failed (${signal ?? code})`));
    });
  });
}
