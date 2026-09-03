import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyBuildAssetClosure } from '../../scripts/deployment/verify-build';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('final build asset closure verification', () => {
  it('accepts existing generated asset URLs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-build-verify-'));
    roots.push(root);
    await mkdir(path.join(root, 'generated-assets', 'utility'), { recursive: true });
    await writeFile(path.join(root, 'generated-assets', 'utility', 'changelog.png'), 'x');
    await writeFile(
      path.join(root, 'index.html'),
      '<img src="/generated-assets/utility/changelog.png">'
    );
    await expect(verifyBuildAssetClosure(root)).resolves.toBeUndefined();
  });

  it('rejects missing, backslash and traversal URLs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-build-verify-'));
    roots.push(root);
    await writeFile(
      path.join(root, 'index.html'),
      '<img src="/generated-assets/utility/missing.png"><img src="/generated-assets\\utility\\x.png">'
    );
    await expect(verifyBuildAssetClosure(root)).rejects.toThrow(/无效视觉资源引用/);
  });
});
