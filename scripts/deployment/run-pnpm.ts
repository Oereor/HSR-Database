import { spawn } from 'node:child_process';
import { siteRoot } from '../data/paths.js';

export function runPnpm(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const entrypoint = env.npm_execpath || 'pnpm';
  const isJavaScript = /\.[cm]?js$/i.test(entrypoint);

  let command = isJavaScript ? process.execPath : entrypoint;
  let commandArgs = isJavaScript ? [entrypoint, ...args] : args;
  if (process.platform === 'win32' && !env.npm_execpath) {
    // Node cannot spawn the Windows pnpm.cmd shim without cmd.exe.
    if (args.some((arg) => !arg || /[^a-z0-9:@._=/\\-]/i.test(arg)))
      return Promise.reject(
        new Error('[pnpm] Windows PATH fallback requires literal script arguments')
      );
    command = 'cmd.exe';
    commandArgs = ['/d', '/s', '/c', 'pnpm', ...args];
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: siteRoot,
      env,
      shell: false,
      stdio: 'inherit',
      windowsHide: true
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`[pnpm] ${args.join(' ')} failed (${signal ?? code})`));
    });
  });
}
