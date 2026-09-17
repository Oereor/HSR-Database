import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  verifyBuildAssetClosure,
  verifyDeploymentOutput
} from '../../scripts/deployment/verify-build';

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

interface DeploymentFixture {
  root: string;
  outputRoot: string;
  staticRoot: string;
  configFile: string;
  functionAlias: string;
  functionTarget: string;
}

async function createDeploymentFixture(): Promise<DeploymentFixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-deployment-output-'));
  roots.push(root);
  const outputRoot = path.join(root, '.vercel', 'output');
  const staticRoot = path.join(outputRoot, 'static');
  const functionsRoot = path.join(outputRoot, 'functions');
  const functionTarget = path.join(functionsRoot, 'internal.func');
  const functionAlias = path.join(functionsRoot, 'api', '_deployment-probe.func');
  const configFile = path.join(outputRoot, 'config.json');

  await mkdir(path.join(root, 'src/lib/generated'), { recursive: true });
  await writeFile(
    path.join(root, 'src/lib/generated/manifest.json'),
    JSON.stringify({
      schemaVersion: 43,
      publicLocale: 'zh-CN',
      publicLocales: ['zh-CN', 'en'],
      routePaths: ['/']
    })
  );

  for (const locale of ['zh-CN', 'en']) {
    const relative = path.join('generated', locale, 'search.json');
    for (const base of [path.join(root, 'static'), staticRoot]) {
      await mkdir(path.dirname(path.join(base, relative)), { recursive: true });
      await writeFile(
        path.join(base, relative),
        JSON.stringify({ endgameTargets: [{ id: '100' }] })
      );
    }
    await mkdir(path.join(staticRoot, 'generated', locale, 'endgame-occurrences'), {
      recursive: true
    });
    await writeFile(path.join(staticRoot, 'generated', locale, 'endgame-occurrences', '100'), '{}');
  }

  await mkdir(path.join(root, 'static', 'generated-assets'), { recursive: true });
  await mkdir(path.join(staticRoot, 'generated-assets'), { recursive: true });
  await writeFile(path.join(root, 'static', 'generated-assets', 'icon.png'), 'asset');
  await writeFile(path.join(staticRoot, 'generated-assets', 'icon.png'), 'asset');
  await writeFile(path.join(staticRoot, 'index.html'), '<img src="/generated-assets/icon.png">');
  await writeFile(path.join(staticRoot, '__data.json'), '{}');
  await writeFile(path.join(staticRoot, 'en.html'), '<html lang="en"></html>');
  await mkdir(path.join(staticRoot, 'en'), { recursive: true });
  await writeFile(path.join(staticRoot, 'en', '__data.json'), '{}');
  await writeFile(path.join(staticRoot, 'robots.txt'), 'User-agent: *\n');
  await writeFile(path.join(staticRoot, 'sitemap.xml'), '<urlset><url></url><url></url></urlset>');

  await mkdir(functionTarget, { recursive: true });
  await writeFile(
    path.join(functionTarget, '.vc-config.json'),
    JSON.stringify({ runtime: 'nodejs22.x', launcherType: 'Nodejs' })
  );
  await writeFile(path.join(functionTarget, 'index.js'), 'export default () => ({ ok: true });');
  await mkdir(path.dirname(functionAlias), { recursive: true });
  await symlink(
    path.relative(path.dirname(functionAlias), functionTarget),
    functionAlias,
    'junction'
  );

  await writeFile(
    configFile,
    JSON.stringify({
      version: 3,
      routes: [{ src: '^/api/_deployment-probe/?$', dest: '/api/_deployment-probe' }],
      overrides: {
        'index.html': { path: '' },
        'en.html': { path: 'en' }
      }
    })
  );

  return { root, outputRoot, staticRoot, configFile, functionAlias, functionTarget };
}

describe('hybrid deployment output verification', () => {
  it('accepts a complete Build Output API v3 fixture', async () => {
    const fixture = await createDeploymentFixture();
    await expect(verifyDeploymentOutput(fixture.root, fixture.outputRoot)).resolves.toMatchObject({
      canonicalRoutes: 1,
      localizedRoutes: 2,
      occurrenceShards: 2,
      function: { uniqueFunctions: 1, runtime: 'nodejs22.x' }
    });
  });

  it('rejects a missing static output directory', async () => {
    const fixture = await createDeploymentFixture();
    await rm(fixture.staticRoot, { recursive: true });
    await expect(verifyDeploymentOutput(fixture.root, fixture.outputRoot)).rejects.toThrow(
      /static output.*不存在/
    );
  });

  it.each(['missing', 'damaged'] as const)('rejects a %s config.json', async (failure) => {
    const fixture = await createDeploymentFixture();
    if (failure === 'missing') await rm(fixture.configFile);
    else await writeFile(fixture.configFile, '{');
    await expect(verifyDeploymentOutput(fixture.root, fixture.outputRoot)).rejects.toThrow(
      /Build Output config/
    );
  });

  it('rejects a missing probe Function', async () => {
    const fixture = await createDeploymentFixture();
    await rm(fixture.functionAlias);
    await expect(verifyDeploymentOutput(fixture.root, fixture.outputRoot)).rejects.toThrow(
      /probe Function artifact 不存在/
    );
  });

  it('rejects incomplete public route coverage', async () => {
    const fixture = await createDeploymentFixture();
    await writeFile(
      fixture.configFile,
      JSON.stringify({
        version: 3,
        routes: [{ src: '^/api/_deployment-probe/?$', dest: '/api/_deployment-probe' }],
        overrides: { 'index.html': { path: '' } }
      })
    );
    await expect(verifyDeploymentOutput(fixture.root, fixture.outputRoot)).rejects.toThrow(
      /public route output 不完整/
    );
  });

  it('rejects Agent code or deployment data in the probe bundle', async () => {
    const fixture = await createDeploymentFixture();
    await writeFile(path.join(fixture.functionTarget, 'index.js'), 'const x = "runDataAgent";');
    await expect(verifyDeploymentOutput(fixture.root, fixture.outputRoot)).rejects.toThrow(
      /意外包含 Agent\/HSR deployment data/
    );
  });
});
