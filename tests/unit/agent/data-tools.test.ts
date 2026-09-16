import { describe, expect, it } from 'vitest';
import {
  AGENT_PAYLOAD_LIMIT_BYTES,
  ARG_EXTREMA_TIE_LIMIT,
  QUERY_DEFAULT_ROW_LIMIT,
  QUERY_ROW_LIMIT,
  type EndgameFilter,
  type NormalizedEndgameRow,
  type SelectEndgameExtremaInput
} from '../../../src/lib/agent/contracts';
import { parseDecimal } from '../../../src/lib/domain/decimal';
import type {
  EndgameDatasetByMode,
  EndgameGroup,
  EndgameMode
} from '../../../src/lib/domain/endgame';
import {
  defaultAgentDataSource,
  type AgentDataSource
} from '../../../src/lib/server/agent/data-source';
import {
  aggregateEndgame,
  aggregateEvidenceId,
  aggregateRows,
  executeEndgameAnalysis,
  selectEndgameExtrema,
  type EndgameAnalysisInput
} from '../../../src/lib/server/agent/endgame-aggregate';
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
      evidenceId: 'ent1/character/1101',
      type: 'character',
      id: '1101',
      canonicalName: '布洛妮娅',
      rank: 1
    });
    const canonical = await searchEntities({
      query: '布洛妮娅',
      locale: 'zh-CN',
      types: ['character'],
      limit: 10
    });
    expect(canonical.matches[0].evidenceId).toBe(alias.matches[0].evidenceId);
    const prefix = await searchEntities({
      query: '银鬃尉',
      locale: 'zh-CN',
      types: ['enemy'],
      limit: 10
    });
    expect(prefix.matches[0]).toMatchObject({ type: 'enemy', matchKind: 'prefix', rank: 1 });
    expect(prefix.matches[0]).toHaveProperty('enemyTemplateId');
    expect(prefix.matches[0]).not.toHaveProperty('id');
    const ambiguous = await searchEntities({
      query: '可可利亚',
      locale: 'zh-CN',
      types: ['enemy'],
      limit: 10
    });
    expect(ambiguous.ambiguity).toMatchObject({ ambiguous: true });
    expect(
      ambiguous.ambiguity.candidates
        .slice(0, 2)
        .map((candidate) => ('enemyTemplateId' in candidate ? candidate.enemyTemplateId : null))
    ).toEqual([1004010, 1004016]);
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
      { payloadLimitBytes: 1000 }
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
      rows: { value: expect.any(Number) },
      monsters: { value: expect.any(Number) },
      minSpeed: { value: expect.any(String) },
      maxHp: { value: expect.any(String) },
      avgToughness: { value: expect.any(String), approximate: expect.any(Boolean) }
    });
    expect(result.warnings.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'PF_CONFIGURED_OCCURRENCE_GRAIN',
        'PF_ROW_COUNT_NOT_RUNTIME_SPAWNS',
        'PF_AVG_CONFIGURED_OCCURRENCE_WEIGHTING',
        'RESULT_TRUNCATED_GROUP_LIMIT'
      ])
    );
    expect(result.groups[0].evidenceId).toMatch(/^ag1\/[a-f0-9]{64}$/);
    expect(result.groups[0]).not.toHaveProperty('evidenceIds');
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

  it('query 使用 25/100/64 KiB limits，并让 compact projection 至少缩小 40%', async () => {
    expect(QUERY_DEFAULT_ROW_LIMIT).toBe(25);
    expect(QUERY_ROW_LIMIT).toBe(100);
    expect(AGENT_PAYLOAD_LIMIT_BYTES).toBe(64 * 1024);
    const filter: EndgameFilter = {
      seasons: { kind: 'ids', seasons: [{ mode: 'moc', groupId: 1033 }] }
    };
    const raw = (await loadEndgameRows(filter)).slice(0, 25);
    const compact = await queryEndgame({
      locale: 'zh-CN',
      filter,
      include: ['location', 'enemy-identity'],
      sort: [],
      limit: 25
    });
    const legacyRows = raw.map((row) => ({
      evidenceId: row.evidenceId,
      grain: row.grain,
      mode: row.mode,
      season: row.season,
      encounter: row.encounter,
      battleSlot: row.battleSlot,
      stage: row.stage,
      wave: row.wave,
      enemy: {
        monsterId: row.enemy.monsterId,
        templateId: row.enemy.templateId,
        name: row.enemy.name,
        detailStatus: row.enemy.detailStatus,
        detailReason: row.enemy.detailReason,
        rank: row.enemy.rank,
        rankCategory: row.enemy.rankCategory
      }
    }));
    expect(Buffer.byteLength(JSON.stringify(compact.rows), 'utf8')).toBeLessThanOrEqual(
      Buffer.byteLength(JSON.stringify(legacyRows), 'utf8') * 0.6
    );
    expect(compact.rows[0]).not.toHaveProperty('grain');
    expect(compact.rows[0]).not.toHaveProperty('encounter.configId');
  });

  it('aggregate evidence 对等价 filter 顺序稳定，且不受 sort/limit 影响', () => {
    const base: Parameters<typeof aggregateEvidenceId>[0] = {
      dataRevision: 'revision',
      filter: { modes: ['moc', 'as'], enemyRankCategories: ['boss'] },
      groupBy: ['enemyTemplate'],
      metrics: [{ op: 'max' as const, field: 'hpPerBar' as const, as: 'maxHp' }],
      dimensions: { enemyTemplate: { templateId: 1, name: '测试' } }
    };
    const reordered: Parameters<typeof aggregateEvidenceId>[0] = {
      ...base,
      filter: { enemyRankCategories: ['boss'], modes: ['as', 'moc'] }
    };
    expect(aggregateEvidenceId(base)).toBe(aggregateEvidenceId(reordered));
  });

  it('weakness explode 对所有 metrics 保持 assignment 语义与顶层 sourceRows', async () => {
    const filter: EndgameFilter = {
      modes: ['as'],
      seasons: { kind: 'latest-per-mode', count: 2, includeUpcoming: false }
    };
    const rows = await loadEndgameRows(filter);
    const result = await aggregateEndgame({
      locale: 'zh-CN',
      filter,
      groupBy: ['weakness'],
      metrics: [
        { op: 'rowCount', as: 'rows' },
        { op: 'countDistinct', field: 'enemyTemplateId', as: 'templates' },
        { op: 'min', field: 'speed', as: 'minSpeed' },
        { op: 'max', field: 'hpPerBar', as: 'maxHp' },
        { op: 'avg', field: 'toughnessPerBar', as: 'avgToughness' }
      ],
      sort: [{ by: 'dimension', dimension: 'weakness', direction: 'asc' }],
      limit: 100
    });
    const assignments = rows.reduce(
      (sum, row) =>
        sum +
        (row.enemy.detailStatus === 'resolved'
          ? new Set(row.enemy.weaknesses.map(({ element }) => element)).size
          : 0),
      0
    );
    expect(result).toMatchObject({
      sourceRows: rows.length,
      grouping: { explodedDimensions: ['weakness'], semantics: 'explode-v1' }
    });
    expect(result.groups.reduce((sum, item) => sum + item.sourceRows, 0)).toBe(assignments);
    for (const item of result.groups) {
      expect(item.dimensions.weakness).toMatchObject({
        element: expect.any(String),
        name: expect.any(String)
      });
      expect(item.metrics.rows.value).toBe(item.sourceRows);
      expect(item.metrics.templates.value).toBeGreaterThan(0);
      expect(item.metrics.minSpeed.value).not.toBeNull();
      expect(item.metrics.maxHp.value).not.toBeNull();
      expect(item.metrics.avgToughness.value).not.toBeNull();
    }
  });

  it.each([
    ['season', 'as'],
    ['mode', 'as'],
    ['battleSlot', 'as']
  ] as const)('%s + weakness 保持 scalar dimension 语义', async (dimension, mode) => {
    const result = await aggregateEndgame({
      locale: 'zh-CN',
      filter: {
        modes: [mode],
        seasons: { kind: 'latest-per-mode', count: 1, includeUpcoming: false }
      },
      groupBy: [dimension, 'weakness'],
      metrics: [{ op: 'countDistinct', field: 'monsterId', as: 'monsters' }],
      sort: [],
      limit: 100
    });
    expect(result.groups.length).toBeGreaterThan(0);
    expect(result.groups.every(({ dimensions }) => dimension in dimensions)).toBe(true);
    expect(result.groups.every(({ dimensions }) => 'weakness' in dimensions)).toBe(true);
  });

  it('weakness groups 继续遵守 group/payload hard limits', async () => {
    const result = await aggregateEndgame(
      {
        locale: 'zh-CN',
        filter: {
          modes: ['as'],
          seasons: { kind: 'latest-per-mode', count: 2, includeUpcoming: false }
        },
        groupBy: ['enemyTemplate', 'weakness'],
        metrics: [{ op: 'rowCount', as: 'rows' }],
        sort: [],
        limit: 1
      },
      { payloadLimitBytes: 1200 }
    );
    expect(result.returnedGroups).toBeLessThanOrEqual(1);
    expect(result.truncated).toBe(true);
    expect(result.warnings.map(({ code }) => code)).toContain('RESULT_TRUNCATED_GROUP_LIMIT');
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(1200);
  });

  it('weakness defensive dedupe 且 resolved empty/unresolved 不产生伪分组', () => {
    const base = normalizedRow();
    const groups = aggregateRows(
      [
        {
          ...base,
          enemy: {
            ...base.enemy,
            weaknesses: [
              { element: 'Fire', name: '火' },
              { element: 'Fire', name: '火' }
            ]
          }
        },
        {
          ...base,
          evidenceId: 'eg1/empty',
          enemy: { ...base.enemy, monsterId: 2, weaknesses: [] }
        },
        {
          ...base,
          evidenceId: 'eg1/unresolved',
          enemy: {
            ...base.enemy,
            monsterId: 3,
            detailStatus: 'unresolved',
            detailReason: 'missing-monster',
            weaknesses: [{ element: 'Ice', name: '冰' }]
          }
        }
      ],
      aggregateInput({
        groupBy: ['weakness'],
        metrics: [{ op: 'rowCount', as: 'rows' }]
      })
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      dimensions: { weakness: { element: 'Fire' } },
      sourceRows: 1,
      metrics: { rows: { value: 1 } }
    });
  });

  it('arg extrema 与 scalar extrema 等值并保留三类 associated projection', () => {
    const rows = [
      normalizedRow({ evidenceId: 'eg1/a', templateId: 10, monsterId: 101, hp: '30', speed: '90' }),
      normalizedRow({
        evidenceId: 'eg1/b',
        templateId: 20,
        monsterId: 201,
        hp: '10',
        speed: '120'
      }),
      normalizedRow({ evidenceId: 'eg1/c', templateId: 30, monsterId: 301, hp: '20', speed: '100' })
    ];
    const groups = aggregateRows(
      rows,
      aggregateInput({
        metrics: [
          { op: 'min', field: 'hpPerBar', as: 'minHp' },
          {
            op: 'argMin',
            field: 'hpPerBar',
            select: ['enemyTemplate', 'monster', 'location'],
            as: 'lowest'
          },
          { op: 'max', field: 'speed', as: 'maxSpeed' },
          {
            op: 'argMax',
            field: 'speed',
            select: ['monster'],
            as: 'fastest'
          }
        ]
      })
    );
    const metrics = groups[0].metrics;
    expect(metrics.lowest.value).toBe(metrics.minHp.value);
    expect(metrics.fastest.value).toBe(metrics.maxSpeed.value);
    expect(metrics.lowest).toMatchObject({
      value: '10',
      associated: [
        {
          enemyTemplate: { enemyTemplateId: 20 },
          monster: { monsterId: 201, enemyTemplateId: 20 },
          location: { mode: 'moc', season: { groupId: 1 }, wave: { configuredPosition: 1 } }
        }
      ],
      tiedRowCount: 1,
      tieCount: 1,
      returnedTies: 1,
      tiesTruncated: false,
      includedRows: 3,
      skippedUnresolvedRows: 0
    });
  });

  it.each(['hpPerBar', 'speed', 'toughnessPerBar', 'level'] as const)(
    '%s 的 scalar/arg min-max 严格等值',
    (field) => {
      const low = normalizedRow({
        evidenceId: `eg1/${field}-low`,
        hp: field === 'hpPerBar' ? '10' : '20',
        speed: field === 'speed' ? '10' : '20'
      });
      const high = normalizedRow({
        evidenceId: `eg1/${field}-high`,
        templateId: 20,
        monsterId: 201,
        hp: field === 'hpPerBar' ? '30' : '20',
        speed: field === 'speed' ? '30' : '20'
      });
      if (field === 'toughnessPerBar') {
        low.stats.toughnessPerBar = parseDecimal('10');
        high.stats.toughnessPerBar = parseDecimal('30');
      }
      if (field === 'level') {
        low.stage.level = 60;
        high.stage.level = 90;
      }
      const metrics = aggregateRows(
        [low, high],
        aggregateInput({
          metrics: [
            { op: 'min', field, as: 'minimum' },
            { op: 'argMin', field, select: ['monster'], as: 'argMinimum' },
            { op: 'max', field, as: 'maximum' },
            { op: 'argMax', field, select: ['monster'], as: 'argMaximum' }
          ]
        })
      )[0].metrics;
      expect(metrics.argMinimum.value).toBe(metrics.minimum.value);
      expect(metrics.argMaximum.value).toBe(metrics.maximum.value);
    }
  );

  it.each(['mode', 'season', 'battleSlot', 'encounter'] as const)(
    'arg extrema 在 %s partition 下只改变 grouping',
    (dimension) => {
      const left = normalizedRow({ evidenceId: `eg1/${dimension}-left`, hp: '10' });
      const right = normalizedRow({
        evidenceId: `eg1/${dimension}-right`,
        templateId: 20,
        monsterId: 201,
        hp: '20'
      });
      if (dimension === 'mode') right.mode = 'as';
      if (dimension === 'season') right.season = { ...right.season, groupId: 2 };
      if (dimension === 'battleSlot') right.battleSlot = 2;
      if (dimension === 'encounter')
        right.encounter = { ...right.encounter, id: 'encounter-2', ordinal: 2 };
      const groups = aggregateRows(
        [left, right],
        aggregateInput({
          groupBy: [dimension],
          metrics: [{ op: 'argMax', field: 'hpPerBar', select: ['enemyTemplate'], as: 'highest' }]
        })
      );
      expect(groups).toHaveLength(2);
      expect(groups.every(({ metrics }) => metrics.highest.value !== null)).toBe(true);
    }
  );

  it('arg extrema 区分 tied rows 与 distinct associated ties，并按 hard cap 稳定截断', () => {
    const rows = Array.from({ length: ARG_EXTREMA_TIE_LIMIT + 3 }, (_, index) =>
      normalizedRow({
        evidenceId: `eg1/tie-${index}`,
        templateId: index === 1 ? 100 : 100 + index,
        monsterId: 1000 + index,
        hp: '10'
      })
    );
    const metric = aggregateRows(
      rows,
      aggregateInput({
        metrics: [
          {
            op: 'argMin',
            field: 'hpPerBar',
            select: ['enemyTemplate'],
            as: 'lowest'
          }
        ]
      })
    )[0].metrics.lowest;
    expect(metric).toMatchObject({
      value: '10',
      tiedRowCount: ARG_EXTREMA_TIE_LIMIT + 3,
      tieCount: ARG_EXTREMA_TIE_LIMIT + 2,
      returnedTies: ARG_EXTREMA_TIE_LIMIT,
      tiesTruncated: true,
      includedRows: ARG_EXTREMA_TIE_LIMIT + 3
    });
    if (metric.op !== 'argMin') throw new Error('expected argMin');
    expect(metric.associated.map(({ enemyTemplate }) => enemyTemplate?.enemyTemplateId)).toEqual([
      100, 102, 103, 104, 105
    ]);
  });

  it('arg extrema 对 all-unresolved 返回可机器识别的 empty result', () => {
    const unresolved = normalizedRow({ hp: null });
    const metric = aggregateRows(
      [unresolved],
      aggregateInput({
        metrics: [{ op: 'argMax', field: 'hpPerBar', select: ['location'], as: 'highest' }]
      })
    )[0].metrics.highest;
    expect(metric).toMatchObject({
      value: null,
      associated: [],
      tiedRowCount: 0,
      tieCount: 0,
      returnedTies: 0,
      tiesTruncated: false,
      includedRows: 0,
      skippedUnresolvedRows: 1
    });
  });

  it('new aggregate evidence 覆盖 explode/select 语义，且 select 顺序等价', () => {
    const base = {
      dataRevision: 'revision',
      filter: {},
      groupBy: ['season'] as EndgameAnalysisInput['groupBy'],
      metrics: [
        {
          op: 'argMax' as const,
          field: 'hpPerBar' as const,
          select: ['monster', 'location'] as Array<'monster' | 'location'>,
          as: 'highest'
        }
      ],
      dimensions: { season: { mode: 'moc', groupId: 1 } }
    };
    expect(aggregateEvidenceId(base)).toBe(
      aggregateEvidenceId({
        ...base,
        metrics: [{ ...base.metrics[0], select: ['location', 'monster'] }]
      })
    );
    expect(aggregateEvidenceId(base)).not.toBe(
      aggregateEvidenceId({
        ...base,
        groupBy: ['weakness'],
        dimensions: { weakness: { element: 'Fire', name: '火' } }
      })
    );
  });

  it('extrema wrapper 复用确定性引擎、ag1 和 warning，并暴露 extrema result', async () => {
    const modelInput: SelectEndgameExtremaInput = {
      locale: 'zh-CN',
      filter: { modes: ['pf'], statuses: ['current'], encounterOrdinals: [4] },
      groupBy: [],
      extrema: [
        {
          op: 'argMax',
          field: 'hpPerBar',
          select: ['enemyTemplate'],
          as: 'highestHp'
        }
      ],
      sort: [],
      limit: 20
    };
    const [wrapped, internal] = await Promise.all([
      selectEndgameExtrema(modelInput),
      executeEndgameAnalysis({
        ...modelInput,
        metrics: [...modelInput.extrema],
        sort: [],
        limit: 20
      })
    ]);
    expect(wrapped.warnings).toEqual(internal.warnings);
    expect(wrapped.groups[0].evidenceId).toBe(internal.groups[0].evidenceId);
    expect(wrapped.groups[0].extrema).toEqual(internal.groups[0].metrics);
    expect(wrapped.groups[0]).not.toHaveProperty('metrics');
    expect(wrapped.groups[0].evidenceId).toMatch(/^ag1\//);
    expect(wrapped.warnings).toContainEqual(
      expect.objectContaining({ code: 'PF_CONFIGURED_OCCURRENCE_GRAIN' })
    );
  });
});

function aggregateInput(overrides: Partial<EndgameAnalysisInput> = {}): EndgameAnalysisInput {
  return {
    locale: 'zh-CN',
    filter: {},
    groupBy: [],
    metrics: [{ op: 'rowCount', as: 'rows' }],
    sort: [],
    limit: 100,
    ...overrides
  };
}

function normalizedRow(
  input: {
    evidenceId?: string;
    templateId?: number;
    monsterId?: number;
    hp?: string | null;
    speed?: string | null;
  } = {}
): NormalizedEndgameRow {
  const hp =
    input.hp === undefined ? parseDecimal('10') : input.hp === null ? null : parseDecimal(input.hp);
  const speed =
    input.speed === undefined
      ? parseDecimal('100')
      : input.speed === null
        ? null
        : parseDecimal(input.speed);
  return {
    evidenceId: input.evidenceId ?? 'eg1/base',
    grain: 'configured-occurrence',
    mode: 'moc',
    season: {
      groupId: 1,
      name: '测试赛期',
      begin: null,
      end: null,
      status: 'historical',
      recencyBasis: 'group-id'
    },
    encounter: {
      id: 'encounter-1',
      configId: 1,
      name: '测试关卡',
      ordinal: 1,
      variant: 'floor'
    },
    battleSlot: 1,
    stage: { stageId: 1, ordinal: 1, level: 80 },
    wave: {
      kind: 'fixed',
      numberOrId: 1,
      monsterGroupId: null,
      configuredPosition: 1
    },
    enemy: {
      monsterId: input.monsterId ?? 101,
      templateId: input.templateId ?? 10,
      name: `敌人 ${input.templateId ?? 10}`,
      detailStatus: 'resolved',
      detailReason: null,
      rank: 'BigBoss',
      rankCategory: 'boss',
      weaknesses: [{ element: 'Fire', name: '火' }],
      resistances: [],
      specialResistances: []
    },
    stats: {
      hpPerBar: hp,
      hpStatus: hp === null ? 'unresolved' : 'resolved',
      hpReason: hp === null ? 'test-unresolved' : null,
      speed,
      speedStatus: speed === null ? 'unavailable' : 'resolved',
      speedReason: speed === null ? 'test-unavailable' : null,
      toughnessPerBar: parseDecimal('60'),
      toughnessStatus: 'resolved',
      toughnessReason: null,
      toughnessBarCount: 1,
      toughnessRuntimeStatus: 'static',
      phaseCount: 1,
      effectiveTotalHp: hp,
      effectiveTotalHpStatus: 'static'
    },
    mechanics: {} as NormalizedEndgameRow['mechanics']
  };
}
