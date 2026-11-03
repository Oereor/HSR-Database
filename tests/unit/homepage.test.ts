import { render } from 'svelte/server';
import HomepageSection from '../../src/lib/components/home/HomepageSection.svelte';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, vi } from 'vitest';
import {
  extractHomepageIds,
  buildHomepageVersionData,
  assertBaseline,
  selectPreviousVersion,
  homepageCategories,
  loadHomepageBaseline
} from '../../scripts/data/homepage';
import {
  refreshHomepageBaseline,
  githubHistoryReader,
  type HistoryReader
} from '../../scripts/data/homepage-history';
import { selectHomepageArtwork } from '../../src/lib/domain/homepage';

const sha = (n: number) => n.toString(16).padStart(40, '0');
const pin = { repository: 'https://github.com/example/data.git', commit: sha(3) };
const commits = [
  { sha: sha(4), subject: 'OSPRODWin4.6.1_D4', parent: sha(3) },
  { sha: sha(3), subject: 'OSPRODWin4.6.0_D3', parent: sha(2) },
  { sha: sha(2), subject: 'OSPRODWin4.6.0_D2', parent: sha(1) },
  { sha: sha(1), subject: 'OSPRODWin4.5.0_D1', parent: null }
];
const tables = {
  AvatarConfig: [{ AvatarID: 1 }, { AvatarID: 1 }],
  AvatarConfigLD: [{ AvatarID: 1 }, { AvatarID: 2 }],
  EquipmentConfig: [{ EquipmentID: 10 }],
  RelicSetConfig: [{ SetID: 100 }],
  MonsterTemplateConfig: [{ MonsterTemplateID: 1000 }]
};
const reader = (): HistoryReader => ({
  commit: vi.fn(async (id) => commits.find((entry) => entry.sha === id)!),
  table: vi.fn(async (_, name) => tables[name as keyof typeof tables])
});
async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-homepage-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('homepage version history and diff', () => {
  it('reads immutable GitHub commit/table endpoints and rejects request failures', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sha: pin.commit,
          commit: { message: 'OSPRODWin4.6.0_D3\nbody' },
          parents: [{ sha: sha(2) }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '[{"AvatarID":1,"AvatarName":{"Hash":12345678901234567890}}]'
      })
      .mockResolvedValueOnce({ ok: false, status: 403 });
    vi.stubGlobal('fetch', fetcher);
    try {
      const source = githubHistoryReader(pin);
      expect(await source.commit(pin.commit)).toEqual(commits[1]);
      expect(await source.table(pin.commit, 'AvatarConfig')).toEqual([
        { AvatarID: 1, AvatarName: { Hash: '12345678901234567890' } }
      ]);
      expect(fetcher.mock.calls[0][0]).toContain(`/commits/${pin.commit}`);
      expect(fetcher.mock.calls[1][0]).toContain(`/${pin.commit}/ExcelOutput/AvatarConfig.json`);
      await expect(source.commit(pin.commit)).rejects.toThrow(/403/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('omits empty sections and keeps count metadata inside the overview heading link', () => {
    const props = { id: 'synthetic', title: 'Synthetic', href: '/characters/', total: 0, shown: 0 };
    expect(render(HomepageSection, { props }).body).not.toContain('<section');
    const body = render(HomepageSection, { props: { ...props, total: 20, shown: 6 } }).body;
    expect(body).toContain('href="/characters/"');
    expect(body).toContain('aria-labelledby="synthetic"');
    expect(body).toMatch(/6.*20/);
  });
  it('walks across same-version patches to the previous observed release, including major rollover', () => {
    expect(selectPreviousVersion(commits.slice(1))).toMatchObject({
      gameVersion: '4.6',
      baselineCommit: sha(1)
    });
    expect(
      selectPreviousVersion([
        { ...commits[1], subject: 'OSPRODWin4.0.0', parent: sha(1) },
        { ...commits[3], subject: 'OSPRODWin3.8.0' }
      ]).baselineVersion
    ).toBe('3.8');
    expect(() => selectPreviousVersion(commits.slice(1, 3))).toThrow(/baseline/);
    expect(() => selectPreviousVersion([{ ...commits[1], subject: 'unknown' }])).toThrow(/version/);
    expect(() => selectPreviousVersion([commits[1], commits[3]])).toThrow(/disconnected/);
  });
  it('merges LD identities and deduplicates without treating MonsterConfig instances as entities', () => {
    expect(extractHomepageIds(tables)).toEqual({
      characters: ['1', '2'],
      'light-cones': ['10'],
      relics: ['100'],
      enemies: ['1000']
    });
    expect(() => extractHomepageIds({ ...tables, AvatarConfig: [{ AvatarID: null }] })).toThrow(
      /invalid/
    );
  });
  it('caches exact pins and reuses baseline tables for same-version pin changes', async () =>
    fixture(async (root) => {
      const source = reader();
      const first = await refreshHomepageBaseline(root, pin, source);
      const calls = vi.mocked(source.table).mock.calls.length;
      await refreshHomepageBaseline(root, pin, source);
      expect(vi.mocked(source.commit).mock.calls).toHaveLength(3);
      const later = await refreshHomepageBaseline(root, { ...pin, commit: sha(4) }, source);
      expect(later.baselineCommit).toBe(first.baselineCommit);
      expect(later.ids).toEqual(first.ids);
      expect(vi.mocked(source.table).mock.calls).toHaveLength(calls);
      expect(vi.mocked(source.commit).mock.calls).toHaveLength(4);
      const current = Object.fromEntries(
        homepageCategories.map((category) => [category, [...first.ids[category], '9999', '9999']])
      ) as typeof first.ids;
      expect(buildHomepageVersionData(first, current, '4.6').additions).toEqual(
        Object.fromEntries(homepageCategories.map((category) => [category, ['9999']]))
      );
      expect(buildHomepageVersionData(first, first.ids, '4.6').additions).toEqual(
        Object.fromEntries(homepageCategories.map((category) => [category, []]))
      );
      expect(() => assertBaseline({ ...first, digest: 'corrupt' })).toThrow(/digest/);
      await writeFile(
        path.join(root, 'upstream.lock.json'),
        JSON.stringify({ turnBasedGameData: pin })
      );
      expect((await loadHomepageBaseline(pin.commit, root)).digest).toBe(first.digest);
      await writeFile(path.join(root, 'data/homepage', `${pin.commit}.json`), '{}');
      await expect(loadHomepageBaseline(pin.commit, root)).rejects.toThrow(/unavailable/);
    }));
  it('fails clearly when the historical baseline is missing', async () =>
    fixture(async (root) => {
      await expect(loadHomepageBaseline(pin.commit, root)).rejects.toThrow(/upstreams:update/);
      const source = reader();
      source.commit = async (id) => ({ sha: id, subject: 'OSPRODWin4.6.0', parent: null });
      await expect(refreshHomepageBaseline(root, pin, source)).rejects.toThrow(/baseline/);
    }));
  it('selects available artwork by rarity and stable ID; supports empty and missing assets', () => {
    const entries = [
      { id: '10', rarity: 5 },
      { id: '2', rarity: 5 },
      { id: '1', rarity: 4 }
    ];
    expect(
      selectHomepageArtwork(entries, (id) => (id === '2' ? undefined : `/art/${id}`), 2)
    ).toEqual(['/art/10', '/art/1']);
    expect(selectHomepageArtwork(entries, () => undefined, 2)).toEqual([]);
    expect(selectHomepageArtwork([], (id) => id, 1)).toEqual([]);
  });
});
