import { describe, expect, it } from 'vitest';
import { fingerprintTools } from 'ai';
import { z } from 'zod';
import {
  FINAL_ANSWER_CHAR_LIMIT,
  FINAL_EVIDENCE_LIMIT,
  FINAL_LIMITATION_CHAR_LIMIT,
  FINAL_LIMITATION_LIMIT,
  aggregateEndgameInputSchema,
  modelAnswerSchema,
  queryEndgameInputSchema,
  searchEntitiesInputSchema,
  selectEndgameExtremaInputSchema
} from '../../../src/lib/agent/contracts';
import { averageDecimals, parseDecimal } from '../../../src/lib/domain/decimal';
import { createAgentTools } from '../../../src/lib/server/agent/tools';

describe('Agent strict contracts', () => {
  it('拒绝额外字段、越界 limit 和非 zh-CN locale', () => {
    expect(
      searchEntitiesInputSchema.safeParse({ query: '可可利亚', locale: 'en-US' }).success
    ).toBe(false);
    expect(
      queryEndgameInputSchema.safeParse({ locale: 'zh-CN', include: ['location'], limit: 101 })
        .success
    ).toBe(false);
    expect(queryEndgameInputSchema.safeParse({ locale: 'zh-CN' }).success).toBe(false);
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
    expect(
      aggregateEndgameInputSchema.safeParse({
        locale: 'zh-CN',
        groupBy: [],
        metrics: [{ op: 'rowCount', as: 'rows' }]
      }).success
    ).toBe(true);
    expect(
      aggregateEndgameInputSchema.safeParse({
        locale: 'zh-CN',
        groupBy: ['season', 'weakness'],
        metrics: [
          {
            op: 'argMax',
            field: 'hpPerBar',
            select: ['enemyTemplate', 'location'],
            as: 'highest'
          }
        ]
      }).success
    ).toBe(false);
    expect(
      selectEndgameExtremaInputSchema.safeParse({
        locale: 'zh-CN',
        groupBy: ['season', 'weakness'],
        extrema: [
          {
            op: 'argMax',
            field: 'hpPerBar',
            select: ['enemyTemplate', 'location'],
            as: 'highest'
          }
        ]
      }).success
    ).toBe(true);
    expect(
      aggregateEndgameInputSchema.safeParse({
        locale: 'zh-CN',
        groupBy: ['weakness', 'weakness'],
        metrics: [{ op: 'rowCount', as: 'rows' }]
      }).success
    ).toBe(false);
    expect(
      selectEndgameExtremaInputSchema.safeParse({
        locale: 'zh-CN',
        extrema: [
          {
            op: 'argMin',
            field: 'speed',
            select: ['enemyTemplate', 'enemyTemplate'],
            as: 'slowest'
          }
        ]
      }).success
    ).toBe(false);
    expect(
      selectEndgameExtremaInputSchema.safeParse({
        locale: 'zh-CN',
        extrema: [{ op: 'avg', field: 'hpPerBar', as: 'average' }]
      }).success
    ).toBe(false);
    expect(
      selectEndgameExtremaInputSchema.safeParse({
        locale: 'zh-CN',
        extrema: [{ op: 'argMax', field: 'hpPerBar', select: ['enemyTemplate'], as: 'highest' }],
        sort: [{ by: 'extremum', extremum: 'other', direction: 'desc' }]
      }).success
    ).toBe(false);
  });

  it('从同一 Zod schema 暴露 AI SDK tools 和稳定 fingerprint', async () => {
    const tools = createAgentTools({ executedToolCalls: 0 });
    expect(Object.keys(tools)).toEqual([
      'search_entities',
      'query_endgame',
      'aggregate_endgame',
      'select_endgame_extrema'
    ]);
    for (const schema of [
      searchEntitiesInputSchema,
      queryEndgameInputSchema,
      aggregateEndgameInputSchema,
      selectEndgameExtremaInputSchema
    ])
      expect(z.toJSONSchema(schema)).toMatchObject({
        type: 'object',
        additionalProperties: false
      });
    expect(Object.keys(await fingerprintTools(tools))).toEqual(Object.keys(tools));
    expect(tools.search_entities.inputSchema).toBe(searchEntitiesInputSchema);
    expect(tools.query_endgame.inputSchema).toBe(queryEndgameInputSchema);
    expect(tools.aggregate_endgame.inputSchema).toBe(aggregateEndgameInputSchema);
    expect(tools.select_endgame_extrema.inputSchema).toBe(selectEndgameExtremaInputSchema);
  });

  it('把最终回答长度与数组限制暴露到 JSON Schema', () => {
    expect(z.toJSONSchema(modelAnswerSchema)).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        answer: { type: 'string', maxLength: FINAL_ANSWER_CHAR_LIMIT },
        evidenceIds: { type: 'array', maxItems: FINAL_EVIDENCE_LIMIT },
        limitations: {
          type: 'array',
          maxItems: FINAL_LIMITATION_LIMIT,
          items: { type: 'string', maxLength: FINAL_LIMITATION_CHAR_LIMIT }
        }
      },
      required: ['answer', 'evidenceIds', 'limitations']
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
