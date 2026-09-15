import { describe, expect, it } from 'vitest';
import {
  aggregateEndgameInputSchema,
  queryEndgameInputSchema,
  searchEntitiesInputSchema
} from '../../../src/lib/agent/contracts';
import { averageDecimals, parseDecimal } from '../../../src/lib/domain/decimal';
import { AGENT_TOOL_DEFINITIONS, executeAgentTool } from '../../../src/lib/server/agent/tools';

describe('Agent strict contracts', () => {
  it('拒绝额外字段、越界 limit 和非 zh-CN locale', () => {
    expect(
      searchEntitiesInputSchema.safeParse({ query: '可可利亚', locale: 'en-US' }).success
    ).toBe(false);
    expect(queryEndgameInputSchema.safeParse({ locale: 'zh-CN', limit: 501 }).success).toBe(false);
    expect(queryEndgameInputSchema.safeParse({ locale: 'zh-CN', surprise: true }).success).toBe(
      false
    );
  });

  it('限制 metric alias 和 aggregate sort surface', () => {
    const duplicate = aggregateEndgameInputSchema.safeParse({
      locale: 'zh-CN',
      metrics: [
        { op: 'rowCount', as: 'count' },
        { op: 'max', field: 'hpPerBar', as: 'count' }
      ]
    });
    const unknownSort = aggregateEndgameInputSchema.safeParse({
      locale: 'zh-CN',
      metrics: [{ op: 'rowCount', as: 'count' }],
      sort: [{ by: 'metric', metric: 'other', direction: 'desc' }]
    });
    expect(duplicate.success).toBe(false);
    expect(unknownSort.success).toBe(false);
  });

  it('从同一 Zod schema 暴露 strict provider JSON Schema', () => {
    expect(AGENT_TOOL_DEFINITIONS.map(({ function: entry }) => entry.name)).toEqual([
      'search_entities',
      'query_endgame',
      'aggregate_endgame'
    ]);
    for (const definition of AGENT_TOOL_DEFINITIONS)
      expect(definition.function.parameters).toMatchObject({
        type: 'object',
        additionalProperties: false
      });
  });

  it('对未知工具和非法 JSON 只返回稳定错误码', async () => {
    await expect(executeAgentTool('read_file', '{}')).resolves.toMatchObject({
      ok: false,
      result: { error: { code: 'UNKNOWN_TOOL' } }
    });
    await expect(executeAgentTool('query_endgame', '{')).resolves.toMatchObject({
      ok: false,
      result: { error: { code: 'INVALID_JSON' } }
    });
  });
});

describe('Agent lossless averages', () => {
  it('返回有限小数的精确表达', () => {
    expect(averageDecimals([parseDecimal('1'), parseDecimal('2')])).toEqual({
      numerator: '3',
      denominator: 2,
      exactDecimal: '1.5',
      decimalApprox: '1.500000000000',
      approximate: false,
      rounding: 'half-up-12dp'
    });
  });

  it('使用 BigInt 对大数和非终止小数进行 12 位 half-up 舍入', () => {
    expect(
      averageDecimals([
        parseDecimal('999999999999999999999999999999.99'),
        parseDecimal('0.01'),
        parseDecimal('0')
      ])
    ).toMatchObject({
      numerator: '1000000000000000000000000000000.00',
      denominator: 3,
      decimalApprox: '333333333333333333333333333333.333333333333',
      approximate: true,
      rounding: 'half-up-12dp'
    });
  });
});
