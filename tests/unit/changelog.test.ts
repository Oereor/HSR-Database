import { describe, expect, it } from 'vitest';
import { compile } from 'mdsvex';
import {
  changelogManifest,
  loadChangelogEntries,
  type ChangelogModule
} from '../../src/lib/content/changelog';
import {
  buildChangelogManifest,
  discoverChangelogSources,
  validateChangelogMetadata,
  type DiscoveredChangelogSource
} from '../../src/lib/content/changelog/manifest';
import {
  CHANGELOG_DISMISSED_DATE_KEY,
  dismissChangelogForToday,
  localDateKey,
  shouldAutoOpenChangelog
} from '../../src/lib/domain/changelog';

const component = (() => undefined) as never;
const load = async (): Promise<ChangelogModule> => ({
  default: component,
  metadata: { title: 'Loaded title' }
});

function source(locale: 'zh-CN' | 'en', id: string): DiscoveredChangelogSource<ChangelogModule> {
  return { source: `./${locale}/${id}.svx`, load };
}

function pair(id: string): DiscoveredChangelogSource<ChangelogModule>[] {
  return [source('zh-CN', id), source('en', id)];
}

describe('changelog manifest', () => {
  it('pairs both locales under one stable filename identity', () => {
    const [entry] = buildChangelogManifest(pair('2026-09-03-stable-entry'));
    expect(entry.id).toBe('2026-09-03-stable-entry');
    expect(entry.date).toBe('2026-09-03');
    expect(entry.locales['zh-CN'].source).toBe('./zh-CN/2026-09-03-stable-entry.svx');
    expect(entry.locales.en.source).toBe('./en/2026-09-03-stable-entry.svx');
  });

  it('sorts deterministically by descending date and ascending id', () => {
    const inputs = [...pair('2026-09-03-b'), ...pair('2026-09-04-newest'), ...pair('2026-09-03-a')];
    const expected = ['2026-09-04-newest', '2026-09-03-a', '2026-09-03-b'];
    expect(buildChangelogManifest(inputs).map(({ id }) => id)).toEqual(expected);
    expect(buildChangelogManifest([...inputs].reverse()).map(({ id }) => id)).toEqual(expected);
  });

  it.each([
    ['missing EN counterpart', [source('zh-CN', '2026-09-03-entry')]],
    ['missing zh-CN counterpart', [source('en', '2026-09-03-entry')]],
    [
      'duplicate locale identity',
      [
        source('zh-CN', '2026-09-03-entry'),
        source('zh-CN', '2026-09-03-entry'),
        source('en', '2026-09-03-entry')
      ]
    ],
    ['invalid calendar date', pair('2026-02-30-entry')],
    ['invalid filename', pair('entry-without-date')]
  ])('rejects %s', (_, sources) => {
    expect(() => buildChangelogManifest(sources)).toThrow(/\[changelog\]/);
  });

  it.each([
    ['missing metadata', undefined],
    ['empty title', { title: ' ' }],
    ['non-string title', { title: 1 }]
  ])('rejects %s', (_, metadata) => {
    expect(() => validateChangelogMetadata(metadata, './en/2026-09-03-entry.svx')).toThrow(
      /\[changelog\]/
    );
  });

  it('discovers loaders in stable source order', () => {
    const sources = discoverChangelogSources({
      './zh-CN/2026-09-03-b.svx': load,
      './en/2026-09-03-a.svx': load
    });
    expect(sources.map(({ source: sourcePath }) => sourcePath)).toEqual([
      './en/2026-09-03-a.svx',
      './zh-CN/2026-09-03-b.svx'
    ]);
  });

  it('catches the unquoted-colon frontmatter regression at compile-time validation', async () => {
    const broken = await compile('---\ntitle: New Enemy Stat Display: Initial Action Value\n---\n');
    const fixed = await compile(
      "---\ntitle: 'New Enemy Stat Display: Initial Action Value'\n---\n"
    );
    expect(() => validateChangelogMetadata(broken?.data?.fm, './en/broken.svx')).toThrow(
      /missing frontmatter metadata/
    );
    expect(validateChangelogMetadata(fixed?.data?.fm, './en/fixed.svx')).toEqual({
      title: 'New Enemy Stat Display: Initial Action Value'
    });
  });

  it('discovers every existing historical entry exactly once in the established order', () => {
    expect(changelogManifest.map(({ id }) => id)).toEqual([
      '2026-09-09-add-init-av-stat',
      '2026-09-09-fix-moc-season',
      '2026-09-07-i18n-update',
      '2026-09-04-search-update',
      '2026-09-03-icon-update',
      '2026-09-03-initial-release'
    ]);
    expect(new Set(changelogManifest.map(({ id }) => id)).size).toBe(changelogManifest.length);
  });

  it('loads both locales through the shared runtime consumer', async () => {
    const [chinese, english] = await Promise.all([
      loadChangelogEntries('zh-CN'),
      loadChangelogEntries('en')
    ]);
    expect(chinese.map(({ id }) => id)).toEqual(english.map(({ id }) => id));
    expect(chinese[0].title).toContain('首回合行动值');
    expect(english[0].title).toBe('New Enemy Stat Display: Initial Action Value');
    expect(
      chinese.every(({ component: entryComponent }) => typeof entryComponent === 'function')
    ).toBe(true);
    expect(
      english.every(({ component: entryComponent }) => typeof entryComponent === 'function')
    ).toBe(true);
  });
});

describe('changelog suppression state', () => {
  it('formats browser local date without UTC conversion', () => {
    expect(localDateKey({ getFullYear: () => 2026, getMonth: () => 0, getDate: () => 5 })).toBe(
      '2026-01-05'
    );
  });

  it('opens only when entries exist and today was not dismissed', () => {
    expect(shouldAutoOpenChangelog(0, null, '2026-09-03')).toBe(false);
    expect(shouldAutoOpenChangelog(1, '2026-09-03', '2026-09-03')).toBe(false);
    expect(shouldAutoOpenChangelog(1, '2026-09-02', '2026-09-03')).toBe(true);
  });

  it('records today and tolerates storage failures', () => {
    const values = new Map<string, string>();
    expect(
      dismissChangelogForToday({ setItem: (key, value) => values.set(key, value) }, '2026-09-03')
    ).toBe(true);
    expect(values.get(CHANGELOG_DISMISSED_DATE_KEY)).toBe('2026-09-03');
    expect(
      dismissChangelogForToday(
        {
          setItem: () => {
            throw new Error('blocked');
          }
        },
        '2026-09-03'
      )
    ).toBe(false);
  });
});
