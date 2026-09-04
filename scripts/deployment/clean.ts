import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { runDeploymentBuild } from './build.js';
import { siteRoot } from './prepare.js';

const artifactPaths = [
  'src/lib/generated',
  'static/generated',
  'src/lib/generated-assets',
  'static/generated-assets',
  'static/generated-enemy-assets',
  'build',
  '.svelte-kit',
  '.vite',
  '.upstream'
] as const;

const metadataPaths = [
  'upstream.lock.json',
  'data/search/character-official-names.generated.json',
  'data/search/character-player-aliases.json'
] as const;

async function statIfPresent(target: string) {
  try {
    return await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Preflight the entire fixed allowlist before deleting anything. */
export async function cleanDeploymentArtifacts(root = siteRoot): Promise<void> {
  root = path.resolve(root);
  const tracked = execFileSync('git', ['-c', `safe.directory=${root}`, 'ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  })
    .split('\0')
    .filter(Boolean);
  const keep = new Set<string>();
  for (const file of tracked) {
    if (!artifactPaths.some((target) => file === target || file.startsWith(`${target}/`))) continue;
    if (path.posix.basename(file) !== '.gitkeep')
      throw new Error(`Clean build refuses tracked artifact: ${file}`);
    keep.add(path.resolve(root, file));
  }

  const removals: string[] = [];
  const inspect = async (target: string): Promise<void> => {
    const stat = await statIfPresent(target);
    if (!stat) return;
    if (stat.isSymbolicLink()) throw new Error(`Clean build refuses symlink/junction: ${target}`);
    if (stat.isDirectory())
      for (const child of await readdir(target)) await inspect(path.join(target, child));
  };
  const plan = async (target: string): Promise<void> => {
    if (keep.has(target)) return;
    if ([...keep].some((file) => file.startsWith(`${target}${path.sep}`))) {
      const stat = await statIfPresent(target);
      if (stat?.isDirectory())
        for (const child of await readdir(target)) await plan(path.join(target, child));
    } else removals.push(target);
  };
  for (const relative of artifactPaths) {
    const target = path.resolve(root, relative);
    const within = path.relative(root, target);
    if (!within || within.startsWith('..') || path.isAbsolute(within))
      throw new Error(`Unsafe clean build target: ${target}`);
    // Check parents too: a generated directory may live beneath a linked src/static.
    for (let parent = path.dirname(target); ; parent = path.dirname(parent)) {
      if ((await statIfPresent(parent))?.isSymbolicLink())
        throw new Error(`Clean build refuses linked parent: ${parent}`);
      if (parent === root) break;
    }
    await inspect(target);
    await plan(target);
  }
  for (const target of removals) {
    console.log(`[clean] ${path.relative(root, target)}`);
    await rm(target, { recursive: true, force: true });
  }
}

async function metadataDigests(root: string): Promise<string[]> {
  return Promise.all(
    metadataPaths.map(async (file) =>
      createHash('sha256')
        .update(await readFile(path.join(root, file)))
        .digest('hex')
    )
  );
}

export async function runCleanDeploymentBuild(
  dependencies: { root?: string; build?: () => Promise<void> } = {}
): Promise<void> {
  const root = dependencies.root ?? siteRoot;
  const before = await metadataDigests(root);
  const errors: unknown[] = [];
  try {
    await cleanDeploymentArtifacts(root);
    await (dependencies.build ?? runDeploymentBuild)();
  } catch (error) {
    errors.push(error);
  }
  try {
    const after = await metadataDigests(root);
    for (const [index, file] of metadataPaths.entries()) {
      if (before[index] !== after[index])
        throw new Error(`Clean build changed protected metadata: ${file}`);
      console.log(`[clean] unchanged ${file}: ${after[index]}`);
    }
  } catch (error) {
    errors.push(error);
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(errors, 'Clean build and metadata verification failed');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  if (process.argv.length > 2) throw new Error('deploy:build:clean accepts no path arguments');
  await runCleanDeploymentBuild();
}
