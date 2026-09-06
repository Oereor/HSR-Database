import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  manifestSchema: 40,
  endgameSchema: 23,
  eligibility: true as unknown
}));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async (file: string) => {
    const name = file.replaceAll('\\', '/');
    if (name.endsWith('/neutral/manifest.json'))
      return JSON.stringify({
        schemaVersion: 1,
        sourceCommit: 'fixture',
        contentDigest: 'fixture-digest'
      });
    if (name.endsWith('/views/zh-CN/manifest.json'))
      return JSON.stringify({
        schemaVersion: 2,
        locale: 'zh-CN',
        textMapCode: 'CHS',
        projectionVersion: 'chs-view-4',
        textMapDigest: 'fixture-text-map',
        neutralDigest: 'fixture-digest'
      });
    if (name.endsWith('manifest.json'))
      return JSON.stringify({
        schemaVersion: state.manifestSchema,
        sourceCommit: 'fixture',
        neutral: { contentDigest: 'fixture-digest' },
        view: { neutralDigest: 'fixture-digest' }
      });
    if (name.endsWith('/neutral/source.json')) return '{}';
    if (name.includes('/endgame/'))
      return JSON.stringify({
        schemaVersion: state.endgameSchema,
        mode: name.split('/').at(-1)!.replace('.json', ''),
        groups: [{ recommendationEligible: state.eligibility }]
      });
    if (name.endsWith('search-inputs.json'))
      return JSON.stringify({
        official: {
          schemaVersion: 1,
          sourceCommit: 'fixture',
          normalizationVersion: 1,
          namingPolicyVersion: 1
        }
      });
    return '[]';
  })
}));
vi.mock('../../scripts/data/paths', () => ({
  generatedRoot: '/fixture',
  resolveDataRoot: () => '/missing',
  assertDataRoot: () => {
    throw new Error('upstream unavailable');
  },
  sourceCommit: vi.fn()
}));
vi.mock('../../scripts/data/sync', () => ({ syncData: vi.fn() }));
vi.mock('../../scripts/data/homepage', () => ({ assertHomepageRecentWarpData: vi.fn() }));
vi.mock('../../scripts/data/search-documents', () => ({
  searchInputsPath: '/fixture/search-inputs.json',
  ensureSearchDocuments: vi.fn()
}));
vi.mock('../../src/lib/search/name-metadata', () => ({ CHARACTER_NAMING_POLICY_VERSION: 1 }));
vi.mock('../../src/lib/search/normalization', () => ({ SEARCH_NORMALIZATION_VERSION: 1 }));
beforeEach(() => {
  vi.resetModules();
  state.manifestSchema = 40;
  state.endgameSchema = 23;
  state.eligibility = true;
  vi.stubEnv('HSR_DEPLOYMENT_BUILD', '');
  vi.stubEnv('HSR_EXPECTED_DATA_COMMIT', '');
});
it('accepts current explicit data contracts while upstream is unavailable', async () => {
  await expect(import('../../scripts/data/ensure')).resolves.toBeDefined();
});
it('rejects schema 36 rather than serving pre-localization business data offline', async () => {
  state.manifestSchema = 36;
  await expect(import('../../scripts/data/ensure')).rejects.toThrow('upstream unavailable');
});
it('rejects schema 22 rather than accepting old Endgame membership offline', async () => {
  state.endgameSchema = 22;
  await expect(import('../../scripts/data/ensure')).rejects.toThrow('upstream unavailable');
});
it('rejects a current-version cache missing required neutral eligibility', async () => {
  state.eligibility = undefined;
  await expect(import('../../scripts/data/ensure')).rejects.toThrow('upstream unavailable');
});
