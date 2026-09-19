import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { verifyBuildPageRoutes } from '../../scripts/deployment/verify-routes';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(link = '/characters/1304/?uid=168902602#stats') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-route-verify-'));
  roots.push(root);
  await mkdir(path.join(root, 'characters/1304'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), `<a href="${link}">Character</a>`);
  await writeFile(path.join(root, 'characters/1304/index.html'), '<a href="/">Home</a>');
  await writeFile(path.join(root, '404.html'), 'Not found');
  return root;
}

it('accepts page directory outputs and canonical hrefs with query/hash', async () => {
  await expect(
    verifyBuildPageRoutes(['/', '/characters/1304/'], await fixture())
  ).resolves.toBeUndefined();
});

it('rejects an old .html page output alongside the canonical index', async () => {
  const root = await fixture();
  await writeFile(path.join(root, 'characters/1304.html'), 'Old output');
  await expect(verifyBuildPageRoutes(['/', '/characters/1304/'], root)).rejects.toThrow(/stale/);
});

it('rejects a rendered no-slash internal page link', async () => {
  await expect(
    verifyBuildPageRoutes(['/', '/characters/1304/'], await fixture('/characters/1304?uid=1'))
  ).rejects.toThrow(/noncanonical/);
});

it('rejects a missing page index', async () => {
  await expect(
    verifyBuildPageRoutes(['/', '/characters/1304/', '/en/characters/1304/'], await fixture())
  ).rejects.toThrow(/missing directory index/);
});
