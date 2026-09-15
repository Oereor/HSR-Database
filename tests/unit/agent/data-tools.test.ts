import { describe, expect, it } from 'vitest';
import type { EndgameFilter } from '../../../src/lib/agent/contracts';
import type {
  EndgameDatasetByMode,
  EndgameGroup,
  EndgameMode
} from '../../../src/lib/domain/endgame';
import {
  defaultAgentDataSource,
  type AgentDataSource
} from '../../../src/lib/server/agent/data-source';
import { aggregateEndgame } from '../../../src/lib/server/agent/endgame-aggregate';
import { loadEndgameRows, selectSeasonGroups } from '../../../src/lib/server/agent/endgame-rows';
import { queryEndgame } from '../../../src/lib/server/agent/endgame-query';
import { searchEntities } from '../../../src/lib/server/agent/entity-resolution';

function group(groupId: number, begin?: string, end?: string): EndgameGroup {
  return {
    groupId,
    ...(begin && end ? { schedule: { begin, end } } : {}),
    encounters: []
  } as unknown as EndgameGroup;
}

function sourceWithGroups(groups: Partial<Record<EndgameMode, EndgameGroup[]>>): AgentDataSource {
  return {
    getEndgameDataset: async (mode) =>
      ({ mode, groups: groups[mode] ?? [] }) as EndgameDatasetByMode[typeof mode],
    getEnemyDetail: defaultAgentDataSource.getEnemyDetail
  };
}

describe('Endgame season selection', () => {
  it.each(['moc', 'pf', 'as', 'aa'] as const)(
    '%s 始终按 groupId DESC 判断 latest',
    async (mode) => {
      const dataSource = sourceWithGroups({
        [mode]: [
          group(1, '2026-08-01 00:00:00', '2026-08-02 00:00:00'),
          group(3, '2020-01-01 00:00:00', '2020-01-02 00:00:00'),
          group(2)
        ]
      });
      const selected = await selectSeasonGroups(
        { modes: [mode], seasons: { kind: 'latest-per-mode', count: 2, includeUpcoming: false } },
        { dataSource, now: Date.parse('2026-09-15T00:00:00+08:00') }
      );
      expect(selected.map(({ group: item }) => item.groupId)).toEqual([3, 2]);
      expect(selected.map(({ status }) => status)).toEqual(['historical', 'unknown']);
    }
  );

  it('默认排除 upcoming，显式允许时保留；current 不由最大 groupId 推断', async () => {
    const dataSource = sourceWithGroups({
      aa: [
        group(7),
        group(8, '2026-09-01 00:00:00', '2026-09-30 00:00:00'),
        group(9, '2026-10-01 00:00:00', '2026-10-30 00:00:00')
      ]
    });
    const now = Date.parse('2026-09-15T00:00:00+08:00');
    const baseline: EndgameFilter = {
      modes: ['aa'],
      seasons: { kind: 'latest-per-mode' as const, count: 2, includeUpcoming: false }
    };
    await expect(selectSeasonGroups(baseline, { dataSource, now })).resolves.toMatchObject([
      { group: { groupId: 8 }, status: 'current' },
      { group: { groupId: 7 }, status: 'unknown' }
    ]);
    const includingUpcoming = await selectSeasonGroups(
      {
        modes: ['aa'],
        seasons: { kind: 'latest-per-mode', count: 2, includeUpcoming: true }
      },
      { dataSource, now }
    );
    expect(includingUpcoming.map(({ group: item, status }) => [item.groupId, status])).toEqual([
      [9, 'upcoming'],
      [8, 'current']
    ]);
    const current = await selectSeasonGroups(
      { modes: ['aa'], statuses: ['current'] },
      { dataSource, now }
    );
    expect(current.map(({ group: item }) => item.groupId)).toEqual([8]);
  });
});

describe('Agent entity resolution and real generated rows', () => {
  it('复用 Search V2 exact、prefix、alias、type filter 与同名歧义', async () => {
    const alias = await searchEntities({
      query: '鸭鸭',
      locale: 'zh-CN',
      types: ['character'],
      limit: 10
    });
    expect(alias.matches[0]).toMatchObject({
      type: 'character',
      id: '1101',
      canonicalName: '布洛妮娅',
      rank: 1
    });
    const prefix = await searchEntities({
      query: '银鬃尉',
      locale: 'zh-CN',
      types: ['enemy'],
      limit: 10
    });
    expect(prefix.matches[0]).toMatchObject({ type: 'enemy', matchKind: 'prefix', rank: 1 });
    const ambiguous = await searchEntities({
      query: '可可利亚',
      locale: 'zh-CN',
      types: ['enemy'],
      limit: 10
    });
    expect(ambiguous.ambiguity).toMatchObject({ ambiguous: true });
    expect(ambiguous.ambiguity.candidates.slice(0, 2).map(({ id }) => id)).toEqual([
      '1004010',
      '1004016'
    ]);
  });

  it('保留 fixed/PF spawn grain、1-based position、exact Monster join 和 evidence 编码', async () => {
    const fixed = await loadEndgameRows({
      seasons: { kind: 'ids', seasons: [{ mode: 'as', groupId: 3020 }] },
      monsterIds: [203501204]
    });
    expect(fixed[0]).toMatchObject({
      grain: 'configured-occurrence',
      wave: { kind: 'fixed', configuredPosition: 1 },
      enemy: { detailStatus: 'resolved', templateId: 2035012, monsterId: 203501204 }
    });
    expect(fixed[0].evidenceId).toMatch(/^eg1\/as\/3020\/.+\/fixed\/\d+\/-\/1\/203501204$/);
    const spawn = await loadEndgameRows({
      seasons: { kind: 'ids', seasons: [{ mode: 'pf', groupId: 2026 }] }
    });
    expect(spawn.length).toBeGreaterThan(100);
    expect(
      spawn.every(({ wave }) => wave.kind === 'spawn-sequence' && wave.configuredPosition >= 1)
    ).toBe(true);
    expect(new Set(spawn.map(({ evidenceId }) => evidenceId)).size).toBe(spawn.length);
  });

  it('exact Monster 缺失时保留 unresolved，绝不回退 canonical Monster', async () => {
    const dataSource: AgentDataSource = {
      ...defaultAgentDataSource,
      getEnemyDetail: async (templateId) => ({
        ...(await defaultAgentDataSource.getEnemyDetail(templateId)),
        monsters: []
      })
    };
    const rows = await loadEndgameRows(
      {
        seasons: { kind: 'ids', seasons: [{ mode: 'as', groupId: 3020 }] },
        monsterIds: [203501204]
      },
      { dataSource }
    );
    expect(rows[0].enemy).toMatchObject({
      detailStatus: 'unresolved',
      detailReason: 'missing-monster',
      rank: null,
      weaknesses: []
    });
  });

  it('输出 dataVersion、稳定数值排序、null-last 和显式截断 warning', async () => {
    const result = await queryEndgame(
      {
        locale: 'zh-CN',
        filter: { seasons: { kind: 'ids', seasons: [{ mode: 'moc', groupId: 1029 }] } },
        include: ['location', 'enemy-identity', 'instance-stats'],
        sort: [{ field: 'speed', direction: 'desc' }],
        limit: 2
      },
      { payloadLimitBytes: 2500 }
    );
    expect(result.dataVersion).toMatchObject({ locale: 'zh-CN' });
    expect(result.truncated).toBe(true);
    expect(result.warnings.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['RESULT_TRUNCATED_ROW_LIMIT', 'RESULT_TRUNCATED_PAYLOAD_LIMIT'])
    );
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(2500);
  });

  it('支持五种 aggregation、distinct identity、unresolved 计数和 PF weighting warning', async () => {
    const result = await aggregateEndgame({
      locale: 'zh-CN',
      filter: {
        seasons: { kind: 'ids', seasons: [{ mode: 'pf', groupId: 2026 }] },
        enemyRankCategories: ['boss']
      },
      groupBy: ['enemyTemplate'],
      metrics: [
        { op: 'rowCount', as: 'rows' },
        { op: 'countDistinct', field: 'monsterId', as: 'monsters' },
        { op: 'min', field: 'speed', as: 'minSpeed' },
        { op: 'max', field: 'hpPerBar', as: 'maxHp' },
        { op: 'avg', field: 'toughnessPerBar', as: 'avgToughness' }
      ],
      sort: [{ by: 'metric', metric: 'maxHp', direction: 'desc' }],
      limit: 2
    });
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0].metrics).toMatchObject({
      rows: { op: 'rowCount' },
      monsters: { op: 'countDistinct' },
      minSpeed: { op: 'min' },
      maxHp: { op: 'max' },
      avgToughness: { op: 'avg' }
    });
    expect(result.warnings.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'PF_CONFIGURED_OCCURRENCE_GRAIN',
        'PF_ROW_COUNT_NOT_RUNTIME_SPAWNS',
        'PF_AVG_CONFIGURED_OCCURRENCE_WEIGHTING',
        'RESULT_TRUNCATED_GROUP_LIMIT'
      ])
    );
    expect(result.groups[0].evidenceIds.length).toBeLessThanOrEqual(8);
  });

  it('暴露 speed/toughness unavailable 与 runtime-unclear HP 语义', async () => {
    const speed = await loadEndgameRows({
      seasons: { kind: 'ids', seasons: [{ mode: 'moc', groupId: 1029 }] },
      monsterIds: [3004012]
    });
    const toughness = await loadEndgameRows({
      seasons: { kind: 'ids', seasons: [{ mode: 'moc', groupId: 1033 }] },
      monsterIds: [3004020]
    });
    const unclear = await loadEndgameRows({
      seasons: { kind: 'ids', seasons: [{ mode: 'as', groupId: 3020 }] },
      monsterIds: [202401601]
    });
    expect(speed[0].stats).toMatchObject({ speed: null, speedStatus: 'unavailable' });
    expect(toughness[0].stats).toMatchObject({
      toughnessPerBar: null,
      toughnessStatus: 'unavailable'
    });
    expect(unclear[0].stats).toMatchObject({
      phaseCount: 2,
      effectiveTotalHp: null,
      effectiveTotalHpStatus: 'runtime-unclear'
    });
  });

  it('保留 single/static、multi-phase、shared/restore/lock/manipulation 机制边界', async () => {
    const rows = await loadEndgameRows({
      seasons: {
        kind: 'ids',
        seasons: [
          { mode: 'moc', groupId: 1035 },
          { mode: 'moc', groupId: 1033 }
        ]
      },
      monsterIds: [4022010, 4034010, 4014030, 5014010, 2032020]
    });
    const byMonster = new Map(rows.map((row) => [row.enemy.monsterId, row]));
    expect(byMonster.get(4022010)?.stats).toMatchObject({ effectiveTotalHpStatus: 'static' });
    expect(byMonster.get(4034010)?.stats).toMatchObject({
      phaseCount: 2,
      effectiveTotalHp: null,
      effectiveTotalHpStatus: 'runtime-unclear'
    });
    expect(byMonster.get(4014030)?.mechanics.sharedHp).toBe(true);
    expect(byMonster.get(5014010)?.mechanics.restoresHp).toBe(true);
    expect(byMonster.get(2032020)?.mechanics).toMatchObject({ locksHp: true, manipulatesHp: true });
    for (const monsterId of [4034010, 4014030, 5014010, 2032020])
      expect(byMonster.get(monsterId)?.stats.effectiveTotalHp).toBeNull();
  });

  it('aggregate payload budget 也显式截断且保持硬上限', async () => {
    const result = await aggregateEndgame(
      {
        locale: 'zh-CN',
        filter: { modes: ['moc'] },
        groupBy: ['season', 'enemyTemplate'],
        metrics: [{ op: 'rowCount', as: 'rows' }],
        sort: [],
        limit: 100
      },
      { payloadLimitBytes: 3000 }
    );
    expect(result.truncated).toBe(true);
    expect(result.warnings.map(({ code }) => code)).toContain('RESULT_TRUNCATED_PAYLOAD_LIMIT');
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(3000);
  });
});
