import { readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { buildEndgameOccurrenceShards } from '../../scripts/data/endgame-occurrence-shards';
import { getLocaleProjectionPolicy } from '../../scripts/data/projection/policy';
import type { EndgameDatasetByMode } from '../../src/lib/domain/endgame';
import type { Enemy } from '../../src/lib/domain/types';
import type { GlobalSearchIndex } from '../../src/lib/domain/search-index';
import { ENDGAME_MODES } from '../../src/lib/domain/endgame-view';

it('builds schedule-only shards identically across the AS boundary', async () => {
  const readJson = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
  const datasets = Object.fromEntries(
    await Promise.all(
      ENDGAME_MODES.map(async (mode) => [
        mode,
        await readJson(`src/lib/generated/views/en/endgame/${mode}.json`)
      ])
    )
  ) as EndgameDatasetByMode;
  const search = (await readJson('static/generated/en/search.json')) as GlobalSearchIndex;
  const target = search.endgameTargets.find(({ occurrences }) =>
    occurrences.some(({ locator }) => locator.mode === 'as' && locator.groupId === 3021)
  )!;
  expect(target).toBeDefined();
  const enemy = (await readJson(
    `src/lib/generated/views/en/details/enemies/${target.id}.json`
  )) as Enemy;
  const input = {
    locale: 'en' as const,
    datasets,
    enemies: [enemy],
    targets: [target],
    presentation: getLocaleProjectionPolicy('en').endgameView
  };
  const clock = vi.spyOn(Date, 'now');
  let before, after;
  try {
    clock.mockReturnValue(Date.parse('2026-10-05T03:59:59+08:00'));
    before = buildEndgameOccurrenceShards(input);
    clock.mockReturnValue(Date.parse('2026-10-05T04:00:00+08:00'));
    after = buildEndgameOccurrenceShards(input);
  } finally {
    clock.mockRestore();
  }
  expect(after).toEqual(before);
  expect(after[target.id].schemaVersion).toBe(3);
  for (const { mode, period } of after[target.id].periods) {
    expect(period).not.toHaveProperty('status');
    expect(period.schedule).toEqual(
      datasets[mode].groups.find(({ groupId }) => groupId === period.groupId)?.schedule
    );
  }
});
