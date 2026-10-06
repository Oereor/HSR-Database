import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { EndgameModeDataset, MocGroup } from '../../src/lib/domain/endgame';
import {
  buildGroupView,
  buildModeView,
  buildPeriodMetadata,
  buildPeriodView,
  parseEndgameSchedule,
  recommendedGroupId,
  refreshEndgameMode
} from '../../src/lib/domain/endgame-view';
import { getEndgamePeriodPresentation } from '../../src/lib/i18n/endgame';

const before = Date.parse('2026-10-05T03:59:59+08:00');
const boundary = Date.parse('2026-10-05T04:00:00+08:00');

describe('Endgame runtime temporal presentation', () => {
  it.each(['zh-CN', 'en'] as const)(
    'refreshes the existing %s AS snapshot at the real boundary',
    async (locale) => {
      const dataset = JSON.parse(
        await readFile(`src/lib/generated/views/${locale}/endgame/as.json`, 'utf8')
      ) as EndgameModeDataset;
      const presentation = getEndgamePeriodPresentation(locale);
      const previous = buildModeView('as', dataset.groups, presentation, before);
      const original = structuredClone(previous);
      expect(previous.recommendedGroupId).toBe(3020);
      expect(previous.periods.find(({ groupId }) => groupId === 3020)?.status).toBe('current');
      expect(previous.periods.find(({ groupId }) => groupId === 3021)?.status).toBe('upcoming');

      const current = refreshEndgameMode(previous, boundary);
      expect(current.recommendedGroupId).toBe(3021);
      expect(current.periods.find(({ groupId }) => groupId === 3020)?.status).toBe('historical');
      const period = current.periods.find(({ groupId }) => groupId === 3021)!;
      expect(period).toMatchObject({
        name: locale === 'zh-CN' ? '支配遗忘' : 'Dominance of Oblivion',
        status: 'current',
        schedule: { begin: '2026-10-05 04:00:00', end: '2026-11-16 04:00:00' }
      });
      expect(previous).toEqual(original);
      expect(current).toEqual(buildModeView('as', dataset.groups, presentation, boundary));
      const group = dataset.groups.find(({ groupId }) => groupId === 3021)!;
      const detail = buildGroupView(group, previous.periods, new Map(), presentation, before);
      expect(detail.period).toEqual(previous.periods.find(({ groupId }) => groupId === 3021));
      expect(period).toEqual({ ...buildPeriodMetadata(group, presentation), status: 'current' });
    }
  );

  it('keeps the schedule timezone independent of the browser timezone', () => {
    expect(parseEndgameSchedule('2026-10-05 04:00:00')).toBe(Date.parse('2026-10-04T20:00:00Z'));
  });

  const scheduled = (groupId: number, begin: string, end: string) => ({
    groupId,
    schedule: { begin, end }
  });
  const first = scheduled(99, '2026-08-01 04:00:00', '2026-10-05 04:00:00');
  const second = scheduled(1, '2026-09-01 04:00:00', '2026-11-16 04:00:00');
  const future = scheduled(500, '2026-11-16 04:00:00', '2026-12-16 04:00:00');

  it('chooses latest current by begin time, independently of ID and missing name', () => {
    expect(recommendedGroupId([first, second, future], before)).toBe(1);
  });

  it('chooses latest started in a gap and nearest upcoming before all schedules', () => {
    expect(recommendedGroupId([first, future], boundary)).toBe(99);
    expect(recommendedGroupId([second, first, future], Date.parse('2026-07-01T00:00:00Z'))).toBe(
      99
    );
  });

  it('falls back only without schedules and preserves unknown and empty inputs', () => {
    expect(recommendedGroupId([], boundary)).toBeUndefined();
    expect(recommendedGroupId([{ groupId: 4 }, { groupId: 8 }], boundary)).toBe(8);
    expect(recommendedGroupId([{ groupId: 9999 }, future], before)).toBe(500);
    const group: MocGroup = { mode: 'moc', groupId: 42, encounters: [] };
    expect(buildPeriodView(group, boundary).status).toBe('unknown');
    expect(buildPeriodMetadata(group)).not.toHaveProperty('status');
    expect(buildPeriodMetadata(group)).not.toHaveProperty('schedule');
    expect(buildPeriodView({ ...group, schedule: second.schedule }, before).status).toBe('current');
  });

  it('reorders refreshed upcoming periods by schedule rather than stale ID order', () => {
    const groups: MocGroup[] = [future, second, first].map((group) => ({
      ...group,
      mode: 'moc',
      encounters: []
    }));
    const view = buildModeView('moc', groups, undefined, boundary);
    const upcoming = refreshEndgameMode(view, Date.parse('2026-07-01T00:00:00Z'));
    expect(upcoming.periods.map(({ groupId }) => groupId)).toEqual([99, 1, 500]);
    expect(upcoming.periods.every(({ status }) => status === 'upcoming')).toBe(true);
  });
});
