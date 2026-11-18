import { spawn } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { UpstreamPin } from './lock.js';

export type GitCommandRunner = (args: string[], cwd?: string) => Promise<string>;
export type CheckoutPreparationResult = 'reused' | 'materialized';

const gitExecutable = process.platform === 'win32' ? 'git.exe' : 'git';
const GIT_HEARTBEAT_MS = 30_000;
const secondsSince = (start: number): string => ((performance.now() - start) / 1000).toFixed(2);
const errorCode = (error: unknown) => (error as NodeJS.ErrnoException | undefined)?.code;
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

function gitFailureReason(stderr: string): string {
  if (/could not resolve proxy/i.test(stderr)) return 'proxy DNS lookup failed';
  if (/could not resolve host/i.test(stderr)) return 'remote DNS lookup failed';
  if (/operation too slow|timed out|timeout was reached/i.test(stderr))
    return 'network transfer stalled or timed out';
  if (/failed to connect|could not connect|reset by peer/i.test(stderr))
    return 'connection to remote or proxy failed';
  if (
    /authentication failed|terminal prompts disabled|could not read (username|password)|\b407\b/i.test(
      stderr
    )
  )
    return 'remote or proxy authentication failed';
  if (/schannel|ssl|tls|certificate/i.test(stderr))
    return 'TLS negotiation or certificate validation failed';
  if (/index\.lock|unable to create.*lock/i.test(stderr)) return 'checkout files are locked';
  if (/permission denied|access is denied/i.test(stderr)) return 'access denied';
  if (/not our ref|couldn.t find remote ref/i.test(stderr)) return 'pinned ref is unavailable';
  return 'Git reported an error';
}

function operationName(args: string[]): string {
  const command = args.find((arg) => !arg.startsWith('-'));
  switch (command) {
    case 'sparse-checkout':
      return args.includes('set') ? 'sparse-checkout set' : 'sparse-checkout list';
    case 'checkout':
    case 'fetch':
    case 'ls-remote':
    case 'init':
    case 'remote':
    case 'config':
    case 'rev-parse':
    case 'ls-tree':
    case 'status':
      return command;
    default:
      return 'command';
  }
}

export const runGit: GitCommandRunner = (args, cwd) =>
  new Promise((resolve, reject) => {
    const operation = operationName(args);
    const needsProgress = ['checkout', 'fetch', 'ls-remote', 'sparse-checkout set'].includes(
      operation
    );
    const started = performance.now();
    const label = `[upstream:git] ${cwd ? `${path.basename(cwd)} ` : ''}${operation}`;
    const env = needsProgress
      ? {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GCM_INTERACTIVE: 'never',
          GIT_HTTP_LOW_SPEED_LIMIT: process.env.GIT_HTTP_LOW_SPEED_LIMIT ?? '1',
          GIT_HTTP_LOW_SPEED_TIME: process.env.GIT_HTTP_LOW_SPEED_TIME ?? '120'
        }
      : process.env;
    const child = spawn(gitExecutable, args, {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    if (needsProgress) console.log(`${label} started (pid=${child.pid ?? 'unavailable'})`);
    let lastOutput = started;
    const heartbeat = needsProgress
      ? setInterval(() => {
          console.log(
            `${label} still running after ${secondsSince(started)}s (last Git output ${secondsSince(lastOutput)}s ago)`
          );
        }, GIT_HEARTBEAT_MS).unref()
      : undefined;
    let stdout = '';
    let stderr = '';
    let settled = false;
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      lastOutput = performance.now();
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      lastOutput = performance.now();
      stderr = (stderr + chunk).slice(-8192);
    });
    const finish = (failure?: string) => {
      if (settled) return;
      settled = true;
      clearInterval(heartbeat);
      if (failure) {
        reject(new Error(`${label} failed after ${secondsSince(started)}s: ${failure}`));
      } else {
        if (needsProgress) console.log(`${label} completed in ${secondsSince(started)}s`);
        resolve(stdout.trim());
      }
    };
    child.once('error', (error) =>
      finish(`could not start Git (${errorCode(error) ?? 'unknown'})`)
    );
    child.once('close', (code, signal) =>
      finish(code === 0 ? undefined : `${gitFailureReason(stderr)} (exit=${signal ?? code})`)
    );
  });

async function statIfPresent(target: string) {
  try {
    return await lstat(target);
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(errorCode(error) ?? '')) throw error;
  }
}

function normalizeRemote(value: string): string {
  return value
    .trim()
    .replace(/\.git$/, '')
    .toLowerCase();
}

const normalizeSparsePath = (value: string): string => value.trim().replace(/^\/+/, '');
const sparsePattern = (value: string): string => `/${normalizeSparsePath(value)}`;
const localGit = (runner: GitCommandRunner, args: string[], directory: string) =>
  runner(['--no-lazy-fetch', '--no-optional-locks', ...args], directory);

export async function inspectCheckout(
  directory: string,
  pin: UpstreamPin,
  runner: GitCommandRunner = runGit
): Promise<boolean> {
  if (!(await statIfPresent(path.join(directory, '.git')))) return false;
  const [remote, head] = await Promise.all([
    localGit(runner, ['config', '--get', 'remote.origin.url'], directory),
    localGit(runner, ['rev-parse', '--verify', 'HEAD^{commit}'], directory)
  ]);
  return normalizeRemote(remote) === normalizeRemote(pin.repository) && head === pin.commit;
}

export async function assertCheckout(
  directory: string,
  pin: UpstreamPin,
  requiredPaths: string[],
  runner: GitCommandRunner = runGit
): Promise<void> {
  if (!(await inspectCheckout(directory, pin, runner)))
    throw new Error(`checkout remote or HEAD does not match pin ${pin.commit}`);
  const sparseEnabled = await localGit(
    runner,
    ['config', '--bool', 'core.sparseCheckout'],
    directory
  ).catch(() => '');
  if (sparseEnabled !== 'true') throw new Error('sparse checkout is disabled');
  const actual = (await localGit(runner, ['sparse-checkout', 'list'], directory))
    .split(/\r?\n/)
    .map(normalizeSparsePath)
    .filter(Boolean)
    .sort();
  const expected = [...new Set(requiredPaths.map(normalizeSparsePath))].sort();
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index]))
    throw new Error('sparse checkout specification mismatch');

  const trackedFiles = (
    await localGit(
      runner,
      ['--literal-pathspecs', 'ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', ...expected],
      directory
    )
  )
    .split('\0')
    .filter(Boolean);
  const trackedSet = new Set(trackedFiles);
  for (const relative of expected) {
    if (
      relative.endsWith('/')
        ? !trackedFiles.some((file) => file.startsWith(relative))
        : !trackedSet.has(relative)
    )
      throw new Error(`required path is absent from pinned tree: ${relative}`);
  }
  // Sparse index flags can hide unmaterialized files from Git status.
  for (let start = 0; start < trackedFiles.length; start += 64) {
    const files = trackedFiles.slice(start, start + 64);
    const stats = await Promise.all(files.map((file) => statIfPresent(path.join(directory, file))));
    const missing = stats.findIndex(
      (entry) => !entry || (!entry.isFile() && !entry.isSymbolicLink())
    );
    if (missing !== -1) throw new Error(`required file is not materialized: ${files[missing]}`);
  }

  if (
    await localGit(
      runner,
      [
        '--literal-pathspecs',
        'status',
        '--porcelain=v1',
        '-z',
        '--untracked-files=all',
        '--',
        ...expected
      ],
      directory
    )
  )
    throw new Error('pinned working tree contains local changes');
}

export async function prepareCheckout(
  directory: string,
  pin: UpstreamPin,
  sparsePaths: string[],
  rootDirectory: string,
  runner: GitCommandRunner = runGit
): Promise<CheckoutPreparationResult> {
  directory = path.resolve(directory);
  rootDirectory = path.resolve(rootDirectory);
  if (path.dirname(directory) !== rootDirectory)
    throw new Error('checkout must be a direct child of the upstream directory');
  await mkdir(rootDirectory, { recursive: true });
  const name = path.basename(directory);
  const label = `[upstream] ${name}`;
  const lockFile = path.join(rootDirectory, `.lock-${name}`);
  try {
    await writeFile(lockFile, `${process.pid}\n`, { flag: 'wx' });
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error;
    const owner = (await readFile(lockFile, 'utf8').catch(() => '')).trim();
    throw new Error(
      `${label} preparation is locked (pid=${/^\d+$/.test(owner) ? owner : 'unavailable'}): ${lockFile}`,
      { cause: error }
    );
  }

  return withCleanup<CheckoutPreparationResult>(
    async () => {
      const inspectStarted = performance.now();
      console.log(`${label} inspecting checkout`);
      try {
        await assertCheckout(directory, pin, sparsePaths, runner);
        console.log(`${label} checkout validated in ${secondsSince(inspectStarted)}s (reused)`);
        return 'reused';
      } catch (error) {
        console.log(
          `${label} checkout requires preparation after ${secondsSince(inspectStarted)}s: ${errorMessage(error)}`
        );
      }

      const scratch = await mkdtemp(path.join(rootDirectory, `.tmp-${name}-`));
      const candidate = path.join(scratch, name);
      const previous = path.join(scratch, 'previous');
      return withCleanup<CheckoutPreparationResult>(
        async () => {
          await mkdir(candidate);
          await runner(['init', '--initial-branch=main'], candidate);
          await runner(['remote', 'add', 'origin', pin.repository], candidate);
          await runWithRetry(
            () =>
              runner(
                [
                  'fetch',
                  '--progress',
                  '--no-auto-maintenance',
                  '--filter=blob:none',
                  '--depth=1',
                  'origin',
                  pin.commit
                ],
                candidate
              ),
            `${name} fetch`
          );
          await runner(
            ['sparse-checkout', 'set', '--no-cone', ...sparsePaths.map(sparsePattern)],
            candidate
          );
          await runner(['checkout', '--detach', pin.commit], candidate);
          const validationStarted = performance.now();
          await assertCheckout(candidate, pin, sparsePaths, runner);
          console.log(`${label} checkout validated in ${secondsSince(validationStarted)}s`);
          const publishStarted = performance.now();
          console.log(`${label} publishing checkout`);
          await publishCheckout(candidate, directory, previous);
          console.log(`${label} checkout published in ${secondsSince(publishStarted)}s`);
          return 'materialized';
        },
        async (error) => {
          if (!(error instanceof CheckoutRecoveryError))
            await rm(scratch, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
        }
      );
    },
    () => rm(lockFile, { force: true })
  );
}

async function runWithRetry(operation: () => Promise<string>, label: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === 3) throw error;
      console.warn(`[upstream] ${label} failed (attempt ${attempt}/3): ${errorMessage(error)}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
}

async function withCleanup<T>(
  operation: () => Promise<T>,
  cleanup: (error?: unknown) => Promise<void>
): Promise<T> {
  let result: T;
  try {
    result = await operation();
  } catch (error) {
    try {
      await cleanup(error);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `${errorMessage(error)}; cleanup failed: ${errorMessage(cleanupError)}`,
        { cause: cleanupError }
      );
    }
    throw error;
  }
  await cleanup();
  return result;
}

async function renameWithRetry(source: string, destination: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (
        process.platform !== 'win32' ||
        attempt === 10 ||
        !['EPERM', 'EACCES', 'EBUSY'].includes(errorCode(error) ?? '')
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
}

class CheckoutRecoveryError extends AggregateError {}

export async function publishCheckout(
  candidate: string,
  destination: string,
  backup: string
): Promise<void> {
  const hadPrevious = Boolean(await statIfPresent(destination));
  if (hadPrevious) await renameWithRetry(destination, backup);
  try {
    await renameWithRetry(candidate, destination);
  } catch (error) {
    if (hadPrevious) {
      try {
        await renameWithRetry(backup, destination);
      } catch (rollbackError) {
        throw new CheckoutRecoveryError(
          [error, rollbackError],
          `upstream checkout publication failed: ${errorMessage(error)}; rollback failed: ${errorMessage(rollbackError)}; previous checkout retained at ${backup}`
        );
      }
    }
    throw error;
  }
}
