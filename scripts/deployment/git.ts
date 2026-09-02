import { spawn } from 'node:child_process';
import { access, cp, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { UpstreamPin } from './lock.js';

export type GitCommandRunner = (args: string[], cwd?: string) => Promise<string>;

const gitExecutable = process.platform === 'win32' ? 'git.exe' : 'git';

export const runGit: GitCommandRunner = (args, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(gitExecutable, args, { cwd, shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve(stdout.trim());
      const command =
        args.length > 20
          ? `${args.slice(0, 4).join(' ')} …（${args.length - 4} paths）`
          : args.join(' ');
      const detail = (stderr.trim() || stdout.trim()).slice(-4000);
      reject(new Error(`git ${command} 失败（${code}）：${detail}`));
    });
  });

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function normalizeRemote(value: string): string {
  return value
    .trim()
    .replace(/\.git$/, '')
    .toLowerCase();
}

export async function inspectCheckout(
  directory: string,
  pin: UpstreamPin,
  runner: GitCommandRunner = runGit
): Promise<boolean> {
  if (!(await exists(path.join(directory, '.git')))) return false;
  try {
    const [remote, head] = await Promise.all([
      runner(['config', '--get', 'remote.origin.url'], directory),
      runner(['rev-parse', 'HEAD'], directory)
    ]);
    return normalizeRemote(remote) === normalizeRemote(pin.repository) && head === pin.commit;
  } catch {
    return false;
  }
}

export async function assertCheckout(
  directory: string,
  pin: UpstreamPin,
  requiredPaths: string[],
  runner: GitCommandRunner = runGit
): Promise<void> {
  if (!(await inspectCheckout(directory, pin, runner)))
    throw new Error(`[upstream] checkout 未锁定到 ${pin.commit}: ${directory}`);
  const sparseEnabled = await runner(['config', '--bool', 'core.sparseCheckout'], directory).catch(
    () => ''
  );
  if (sparseEnabled !== 'true')
    throw new Error(`[upstream] sparse checkout 配置缺失：${directory}`);
  for (const relative of requiredPaths) {
    if (!(await exists(path.join(directory, relative))))
      throw new Error(`[upstream] sparse checkout 缺少必需路径：${relative}`);
  }
}

export async function prepareCheckout(
  directory: string,
  pin: UpstreamPin,
  sparsePaths: string[],
  rootDirectory: string,
  runner: GitCommandRunner = runGit
): Promise<void> {
  if (await inspectCheckout(directory, pin, runner)) {
    try {
      await assertCheckout(directory, pin, sparsePaths, runner);
      console.log(`[upstream] reusing ${path.basename(directory)}`);
      return;
    } catch {
      await setSparseCheckout(directory, sparsePaths, runner);
      await assertCheckout(directory, pin, sparsePaths, runner);
    }
    return;
  }

  await mkdir(rootDirectory, { recursive: true });
  const temporary = await makeTemporaryDirectory(rootDirectory);
  try {
    await runner(['init', '--initial-branch=main'], temporary);
    await runner(['remote', 'add', 'origin', pin.repository], temporary);
    await runWithRetry(
      () => runner(['fetch', '--filter=blob:none', '--depth=1', 'origin', pin.commit], temporary),
      `fetch ${pin.commit}`
    );
    await runner(['sparse-checkout', 'init', '--no-cone'], temporary);
    await setSparseCheckout(temporary, sparsePaths, runner);
    await runner(['checkout', '--detach', pin.commit], temporary);
    await assertCheckout(temporary, pin, sparsePaths, runner);
    await rm(directory, { recursive: true, force: true });
    await publishDirectory(temporary, directory);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

const sparsePattern = (value: string): string => `/${value.replace(/^\/+/, '')}`;

export async function setSparseCheckout(
  directory: string,
  paths: Iterable<string>,
  runner: GitCommandRunner = runGit
): Promise<void> {
  const patterns = [...paths].map(sparsePattern);
  await runWithRetry(
    () => runner(['sparse-checkout', 'set', '--no-cone', ...patterns], directory),
    `sparse checkout ${path.basename(directory)}`
  );
}

async function runWithRetry(operation: () => Promise<string>, label: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        console.warn(`[upstream] ${label} 失败，准备重试（${attempt}/3）`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }
  throw lastError;
}

async function renameWithRetry(source: string, destination: string): Promise<void> {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '') || attempt === 10) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
}

async function publishDirectory(source: string, destination: string): Promise<void> {
  try {
    await renameWithRetry(source, destination);
  } catch (error) {
    if (process.platform !== 'win32') throw error;
    console.warn('[upstream] Windows 无法原子重命名 checkout，使用已验证目录复制回退');
    await rm(destination, { recursive: true, force: true });
    try {
      await cp(source, destination, { recursive: true, force: false, errorOnExist: true });
      await rm(source, { recursive: true, force: true });
    } catch (copyError) {
      await rm(destination, { recursive: true, force: true });
      throw copyError;
    }
  }
}

async function makeTemporaryDirectory(rootDirectory: string): Promise<string> {
  const name = `.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const directory = path.join(rootDirectory, name);
  await mkdir(directory, { recursive: true });
  return directory;
}

export async function directorySize(directory: string): Promise<{ bytes: number; files: number }> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return { bytes: 0, files: 0 };
  }
  const children = await Promise.all(
    entries.map(async (entry) => {
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) return directorySize(child);
      if (!entry.isFile()) return { bytes: 0, files: 0 };
      return { bytes: (await stat(child)).size, files: 1 };
    })
  );
  return children.reduce(
    (total, current) => ({
      bytes: total.bytes + current.bytes,
      files: total.files + current.files
    }),
    { bytes: 0, files: 0 }
  );
}
