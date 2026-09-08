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
  it('accepts exact, nested, encoded and query/hash generated asset URLs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-build-verify-'));
    roots.push(root);
    await mkdir(path.join(root, 'generated-assets', 'utility'), { recursive: true });
    await writeFile(path.join(root, 'generated-assets', 'utility', 'changelog.png'), 'x');
    await mkdir(path.join(root, 'generated-assets', 'nested path'), { recursive: true });
    await writeFile(path.join(root, 'generated-assets', 'nested path', 'icon.png'), 'x');
    await writeFile(
      path.join(root, 'index.html'),
      '<img src="/generated-assets/utility/changelog.png?v=1#top"><img src="/generated-assets/nested%20path/icon.png">'
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

  it('rejects wrong-case and invalid encoded URLs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-build-verify-'));
    roots.push(root);
    await mkdir(path.join(root, 'generated-assets', 'utility'), { recursive: true });
    await writeFile(path.join(root, 'generated-assets', 'utility', 'Icon.png'), 'x');
    await writeFile(
      path.join(root, 'index.css'),
      'url("/generated-assets/utility/icon.png") url("/generated-assets/%E0%A4%A.png")'
    );
    await expect(verifyBuildAssetClosure(root)).rejects.toThrow(/无效视觉资源引用/);
  });

  it('ignores external, data and blob URLs outside generated namespaces', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-build-verify-'));
    roots.push(root);
    await writeFile(
      path.join(root, 'data.json'),
      JSON.stringify(['https://example.test/a.png', 'data:image/png;base64,AA', 'blob:test'])
    );
    await expect(verifyBuildAssetClosure(root)).resolves.toBeUndefined();
  });
});
