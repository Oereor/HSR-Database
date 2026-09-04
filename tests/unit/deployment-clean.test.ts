import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { runCleanDeploymentBuild } from '../../scripts/deployment/clean';

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.resolve('data/audit/clean-build-test-'));
  if (path.dirname(root) !== path.resolve('data/audit')) throw new Error('Unsafe fixture cleanup');
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true });
    for (const file of [
      'upstream.lock.json',
      'data/search/character-official-names.generated.json',
      'data/search/character-player-aliases.json'
    ]) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), '{ "preserve": true }\r\n');
    }
    await run(root);
  } finally {
    // All fixture paths are rooted beneath this repository's ignored audit directory.
    await rm(root, { recursive: true, force: true });
  }
}

it('cleans all generated namespaces, keeps tracked placeholders and runs the existing build once', async () => {
  await fixture(async (root) => {
    const artifacts = [
      'src/lib/generated',
      'static/generated',
      'src/lib/generated-assets',
      'static/generated-assets',
      'static/generated-enemy-assets',
      'build',
      '.svelte-kit',
      '.vite',
      '.upstream'
    ];
    for (const directory of artifacts) {
      await mkdir(path.join(root, directory), { recursive: true });
      await writeFile(path.join(root, directory, 'old'), 'cache');
    }
    await writeFile(path.join(root, 'src/lib/generated-assets/.gitkeep'), 'original');
    execFileSync('git', ['add', 'src/lib/generated-assets/.gitkeep'], {
      cwd: root,
      windowsHide: true
    });
    const build = vi.fn(async () => {
      for (const directory of artifacts)
        await expect(access(path.join(root, directory, 'old'))).rejects.toThrow();
      expect(await readFile(path.join(root, 'src/lib/generated-assets/.gitkeep'), 'utf8')).toBe(
        'original'
      );
    });
    await runCleanDeploymentBuild({ root, build });
    expect(build).toHaveBeenCalledTimes(1);
  });
});

it('preflights every target before mutation and refuses tracked source artifacts', async () => {
  await fixture(async (root) => {
    await mkdir(path.join(root, 'build'));
    await writeFile(path.join(root, 'build/source.ts'), 'tracked');
    execFileSync('git', ['add', 'build/source.ts'], { cwd: root, windowsHide: true });
    const build = vi.fn();
    await expect(runCleanDeploymentBuild({ root, build })).rejects.toThrow('tracked artifact');
    expect(await readFile(path.join(root, 'build/source.ts'), 'utf8')).toBe('tracked');
    expect(build).not.toHaveBeenCalled();
  });
});

it.each(['build/linked', 'src'])(
  'refuses linked targets or parents (%s) before deleting earlier artifacts',
  async (link) => {
    await fixture(async (root) => {
      await mkdir(path.join(root, 'build'));
      await writeFile(path.join(root, 'build/old'), 'keep on failure');
      await mkdir(path.join(root, 'outside'));
      await symlink(path.join(root, 'outside'), path.join(root, link), 'junction');
      const build = vi.fn();
      await expect(runCleanDeploymentBuild({ root, build })).rejects.toThrow(/symlink|linked/);
      expect(await readFile(path.join(root, 'build/old'), 'utf8')).toBe('keep on failure');
      expect(build).not.toHaveBeenCalled();
    });
  }
);

it('checks metadata even when the underlying build fails', async () => {
  await fixture(async (root) => {
    await expect(
      runCleanDeploymentBuild({
        root,
        build: async () => {
          throw new Error('build failed');
        }
      })
    ).rejects.toThrow('build failed');
    expect(
      await readFile(path.join(root, 'data/search/character-player-aliases.json'), 'utf8')
    ).toBe('{ "preserve": true }\r\n');
  });
});
