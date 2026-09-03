import { describe, expect, it } from 'vitest';
import { collectChangelogEntries } from '../../src/lib/content/changelog';
import {
  CHANGELOG_DISMISSED_DATE_KEY,
  dismissChangelogForToday,
  localDateKey,
  shouldAutoOpenChangelog
} from '../../src/lib/domain/changelog';

const component = (() => undefined) as never;

describe('changelog content loader', () => {
  it('sorts entries newest first and uses a stable id tie-breaker', () => {
    const entries = collectChangelogEntries({
      './2026-09-03-b.svx': { default: component, metadata: { title: 'B', date: '2026-09-03' } },
      './2026-09-04.svx': { default: component, metadata: { title: 'Newest', date: '2026-09-04' } },
      './2026-09-03-a.svx': { default: component, metadata: { title: 'A', date: '2026-09-03' } }
    });
    expect(entries.map((entry) => entry.title)).toEqual(['Newest', 'A', 'B']);
  });

  it.each([
    ['missing metadata', {}],
    ['missing title', { metadata: { date: '2026-09-03' } }],
    ['empty title', { metadata: { title: ' ', date: '2026-09-03' } }],
    ['missing date', { metadata: { title: 'Title' } }],
    ['invalid date shape', { metadata: { title: 'Title', date: '2026/09/03' } }],
    ['invalid calendar date', { metadata: { title: 'Title', date: '2026-02-30' } }],
    ['invalid component', { default: {}, metadata: { title: 'Title', date: '2026-09-03' } }]
  ])('rejects %s', (_, module) => {
    expect(() => collectChangelogEntries({ './entry.svx': module as never })).toThrow(
      /\[changelog\]/
    );
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
