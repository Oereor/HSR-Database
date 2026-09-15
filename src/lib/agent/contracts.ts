import { z } from 'zod';
import type { DecimalAverage } from '../domain/decimal.js';
import type { DecimalString, EndgameMode, EnemyMechanics } from '../domain/endgame.js';
import type { EnemyRank, EnemyRankCategory } from '../domain/enemy-rank.js';
import type { ElementType } from '../domain/elements.js';
import type { EntityKind } from '../domain/types.js';
import type { MatchKind, NameKind } from '../search/documents.js';

export const AGENT_LOCALE = 'zh-CN' as const;
export const AGENT_PAYLOAD_LIMIT_BYTES = 64 * 1024;
export const SEARCH_ENTITY_LIMIT = 25;
export const QUERY_DEFAULT_ROW_LIMIT = 25;
export const QUERY_ROW_LIMIT = 100;
export const AGGREGATE_GROUP_LIMIT = 100;
export const LATEST_SEASON_LIMIT = 20;

const uniqueArray = <T>(values: readonly T[]): boolean => new Set(values).size === values.length;
const uniqueMessage = '数组不能包含重复值';

export const entityTypeSchema = z
  .enum(['character', 'light-cone', 'relic', 'enemy'])
  .describe('实体类型；只用于解析用户明确提到的名称或别名。');
export const endgameModeSchema = z
  .enum(['moc', 'pf', 'as', 'aa'])
  .describe('moc=混沌回忆，pf=虚构叙事，as=末日幻影，aa=异相仲裁。');
export const seasonStatusSchema = z.enum(['current', 'upcoming', 'historical', 'unknown']);
export const encounterVariantSchema = z.enum(['floor', 'preliminary', 'boss-normal', 'boss-hard']);
export const enemyRankSchema = z.enum(['Minion', 'MinionLv2', 'Elite', 'LittleBoss', 'BigBoss']);
export const enemyRankCategorySchema = z
  .enum(['normal', 'elite', 'boss'])
  .describe('用户说首领或 Boss 时使用 boss。');
export const elementSchema = z.enum([
  'Physical',
  'Fire',
  'Ice',
  'Lightning',
  'Wind',
  'Quantum',
  'Imaginary'
]);

const uniqueEnumArray = <T extends z.ZodType>(schema: T, max: number) =>
  z.array(schema).min(1).max(max).refine(uniqueArray, uniqueMessage);

const seasonKeySchema = z
  .object({ mode: endgameModeSchema, groupId: z.number().int().positive() })
  .strict();

export const seasonSelectionSchema = z
  .discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('ids'),
        seasons: z
          .array(seasonKeySchema)
          .min(1)
          .max(100)
          .refine(
            (values) => uniqueArray(values.map(({ mode, groupId }) => `${mode}:${groupId}`)),
            {
              message: uniqueMessage
            }
          )
      })
      .strict(),
    z
      .object({
        kind: z.literal('latest-per-mode'),
        count: z.number().int().min(1).max(LATEST_SEASON_LIMIT),
        includeUpcoming: z.boolean().default(false)
      })
      .strict()
  ])
  .describe(
    'latest-per-mode 表示按每个 mode 的 groupId recency 选择；它不表示 current，includeUpcoming 默认 false。'
  );

export const endgameFilterSchema = z
  .object({
    modes: uniqueEnumArray(endgameModeSchema, 4).optional(),
    seasons: seasonSelectionSchema.optional(),
    statuses: uniqueEnumArray(seasonStatusSchema, 4)
      .optional()
      .describe('current 只由 schedule/open-state 证明，不能用 latest groupId 替代。'),
    encounterIds: uniqueEnumArray(z.string().trim().min(1).max(100), 100).optional(),
    encounterOrdinals: uniqueEnumArray(z.number().int().positive(), 100).optional(),
    encounterVariants: uniqueEnumArray(encounterVariantSchema, 4).optional(),
    battleSlots: uniqueEnumArray(z.number().int().positive(), 10)
      .optional()
      .describe('节点1/上半=battle slot 1；节点2/下半=battle slot 2。'),
    stageIds: uniqueEnumArray(z.number().int().positive(), 100).optional(),
    levels: uniqueEnumArray(z.number().int().positive(), 100).optional(),
    waveNumbersOrIds: uniqueEnumArray(z.number().int().nonnegative(), 100).optional(),
    enemyTemplateIds: uniqueEnumArray(z.number().int().positive(), 100).optional(),
    monsterIds: uniqueEnumArray(z.number().int().positive(), 100).optional(),
    enemyRanks: uniqueEnumArray(enemyRankSchema, 5).optional(),
    enemyRankCategories: uniqueEnumArray(enemyRankCategorySchema, 3).optional(),
    weaknessesAny: uniqueEnumArray(elementSchema, 7).optional()
  })
  .strict();

export const searchEntitiesInputSchema = z
  .object({
    query: z.string().trim().min(1).max(200).describe('用户明确提到的实体名称或别名。'),
    locale: z.literal(AGENT_LOCALE),
    types: uniqueEnumArray(entityTypeSchema, 4)
      .optional()
      .describe('只搜索这些实体类型；已知类型时应显式提供。'),
    limit: z.number().int().min(1).max(SEARCH_ENTITY_LIMIT).default(10)
  })
  .strict();

export const endgameProjectionSchema = z.enum([
  'location',
  'enemy-identity',
  'enemy-defenses',
  'instance-stats',
  'mechanics'
]);

export const endgameSortFieldSchema = z.enum([
  'groupId',
  'encounterOrdinal',
  'battleSlot',
  'stageId',
  'wave',
  'enemyTemplateId',
  'monsterId',
  'hpPerBar',
  'speed',
  'toughnessPerBar'
]);

const directionSchema = z.enum(['asc', 'desc']);
const querySortSchema = z
  .object({ field: endgameSortFieldSchema, direction: directionSchema })
  .strict();

export const queryEndgameInputSchema = z
  .object({
    locale: z.literal(AGENT_LOCALE),
    filter: endgameFilterSchema.default({}),
    include: uniqueEnumArray(endgameProjectionSchema, 5).describe(
      '必填。只请求回答所需的 projection；不会隐式返回 location、identity、defenses、stats 或 mechanics。'
    ),
    sort: z.array(querySortSchema).max(5).default([]),
    limit: z.number().int().min(1).max(QUERY_ROW_LIMIT).default(QUERY_DEFAULT_ROW_LIMIT)
  })
  .strict();

export const endgameGroupDimensionSchema = z
  .enum(['mode', 'season', 'encounter', 'battleSlot', 'stage', 'wave', 'enemyTemplate', 'monster'])
  .describe(
    'enemyTemplate 按稳定敌人模板身份合并具体 Monster 变体，适合回答“谁/哪些敌人/Boss”；monster 只在明确需要具体 MonsterID 变体时使用。'
  );
export const numericFieldSchema = z.enum(['hpPerBar', 'speed', 'toughnessPerBar', 'level']);
export const distinctFieldSchema = z.enum([
  'seasonKey',
  'encounterKey',
  'stageKey',
  'waveKey',
  'enemyTemplateId',
  'monsterId'
]);
const metricAliasSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,31}$/);
export const endgameMetricSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('rowCount'), as: metricAliasSchema }).strict(),
  z
    .object({ op: z.literal('countDistinct'), field: distinctFieldSchema, as: metricAliasSchema })
    .strict(),
  z.object({ op: z.literal('min'), field: numericFieldSchema, as: metricAliasSchema }).strict(),
  z.object({ op: z.literal('max'), field: numericFieldSchema, as: metricAliasSchema }).strict(),
  z.object({ op: z.literal('avg'), field: numericFieldSchema, as: metricAliasSchema }).strict()
]);

const aggregateSortSchema = z.discriminatedUnion('by', [
  z
    .object({
      by: z.literal('dimension'),
      dimension: endgameGroupDimensionSchema,
      direction: directionSchema
    })
    .strict(),
  z
    .object({ by: z.literal('metric'), metric: metricAliasSchema, direction: directionSchema })
    .strict()
]);

export const aggregateEndgameInputSchema = z
  .object({
    locale: z.literal(AGENT_LOCALE),
    filter: endgameFilterSchema.default({}),
    groupBy: z
      .array(endgameGroupDimensionSchema)
      .max(3)
      .refine(uniqueArray, uniqueMessage)
      .default([]),
    metrics: z
      .array(endgameMetricSchema)
      .min(1)
      .max(5)
      .refine((values) => uniqueArray(values.map(({ as }) => as)), {
        message: 'metric alias 必须唯一'
      }),
    sort: z.array(aggregateSortSchema).max(5).default([]),
    limit: z.number().int().min(1).max(AGGREGATE_GROUP_LIMIT).default(20)
  })
  .strict()
  .superRefine((input, context) => {
    const dimensions = new Set(input.groupBy);
    const aliases = new Set(input.metrics.map(({ as }) => as));
    input.sort.forEach((sort, index) => {
      if (sort.by === 'dimension' && !dimensions.has(sort.dimension))
        context.addIssue({
          code: 'custom',
          path: ['sort', index, 'dimension'],
          message: '只能按已声明的 groupBy dimension 排序'
        });
      if (sort.by === 'metric' && !aliases.has(sort.metric))
        context.addIssue({
          code: 'custom',
          path: ['sort', index, 'metric'],
          message: '只能按已声明的 metric alias 排序'
        });
    });
  });

export type SearchEntitiesInput = z.infer<typeof searchEntitiesInputSchema>;
export type QueryEndgameInput = z.infer<typeof queryEndgameInputSchema>;
export type AggregateEndgameInput = z.infer<typeof aggregateEndgameInputSchema>;
export type EndgameFilter = z.infer<typeof endgameFilterSchema>;
export type EndgameProjection = z.infer<typeof endgameProjectionSchema>;
export type EndgameSortField = z.infer<typeof endgameSortFieldSchema>;
export type EndgameGroupDimension = z.infer<typeof endgameGroupDimensionSchema>;
export type NumericField = z.infer<typeof numericFieldSchema>;
export type DistinctField = z.infer<typeof distinctFieldSchema>;
export type EndgameMetric = z.infer<typeof endgameMetricSchema>;

export interface DataVersion {
  gameVersion: string | null;
  sourceCommit: string;
  dataRevision: string;
  locale: typeof AGENT_LOCALE;
}

export type AgentWarningCode =
  | 'PF_CONFIGURED_OCCURRENCE_GRAIN'
  | 'PF_ROW_COUNT_NOT_RUNTIME_SPAWNS'
  | 'PF_AVG_CONFIGURED_OCCURRENCE_WEIGHTING'
  | 'UNRESOLVED_ENEMY_DETAIL'
  | 'UNRESOLVED_HP'
  | 'UNAVAILABLE_SPEED'
  | 'UNAVAILABLE_TOUGHNESS'
  | 'RUNTIME_UNCLEAR_EFFECTIVE_TOTAL_HP'
  | 'RESULT_TRUNCATED_ROW_LIMIT'
  | 'RESULT_TRUNCATED_GROUP_LIMIT'
  | 'RESULT_TRUNCATED_PAYLOAD_LIMIT';

export interface AgentWarning {
  code: AgentWarningCode;
  message: string;
  affectedRows: number;
}

export interface NormalizedEndgameRow {
  evidenceId: string;
  grain: 'configured-occurrence';
  mode: EndgameMode;
  season: {
    groupId: number;
    name: string | null;
    begin: string | null;
    end: string | null;
    status: 'current' | 'upcoming' | 'historical' | 'unknown';
    recencyBasis: 'group-id';
  };
  encounter: {
    id: string;
    configId: number;
    name: string | null;
    ordinal: number | null;
    variant: 'floor' | 'preliminary' | 'boss-normal' | 'boss-hard';
  };
  battleSlot: number;
  stage: { stageId: number; ordinal: number; level: number };
  wave: {
    kind: 'fixed' | 'spawn-sequence';
    numberOrId: number;
    monsterGroupId: number | null;
    configuredPosition: number;
  };
  enemy: {
    monsterId: number;
    templateId: number;
    name: string | null;
    detailStatus: 'resolved' | 'unresolved';
    detailReason: 'missing-template-detail' | 'missing-monster' | null;
    rank: EnemyRank | null;
    rankCategory: EnemyRankCategory | null;
    weaknesses: Array<{ element: ElementType; name: string }>;
    resistances: Array<{ element: string; name: string; value: string }>;
    specialResistances: Array<{ code: string; label: string; value: DecimalString }>;
  };
  stats: {
    hpPerBar: DecimalString | null;
    hpStatus: 'resolved' | 'unresolved';
    hpReason: string | null;
    speed: DecimalString | null;
    speedStatus: 'resolved' | 'unavailable';
    speedReason: string | null;
    toughnessPerBar: DecimalString | null;
    toughnessStatus: 'resolved' | 'unavailable';
    toughnessReason: string | null;
    toughnessBarCount: number | null;
    toughnessRuntimeStatus: 'static' | 'runtime-unclear';
    phaseCount: number | null;
    effectiveTotalHp: DecimalString | null;
    effectiveTotalHpStatus: 'static' | 'inferred' | 'runtime-unclear';
  };
  mechanics: EnemyMechanics;
}

export interface EntityMatch {
  evidenceId: string;
  type: EntityKind;
  id: string;
  canonicalName: string;
  matchedLabel: string;
  nameKind: NameKind;
  matchKind: MatchKind;
  rank: number;
}

export type AggregateMetricValue =
  | {
      op: 'rowCount' | 'countDistinct';
      value: number;
      includedRows: number;
      skippedUnresolvedRows: 0;
    }
  | {
      op: 'min' | 'max';
      value: DecimalString | null;
      includedRows: number;
      skippedUnresolvedRows: number;
    }
  | ({ op: 'avg'; includedRows: number; skippedUnresolvedRows: number } & (
      { value: DecimalAverage } | { value: null }
    ));

export const agentThinkingModeSchema = z.enum(['off', 'low']);
export type AgentThinkingMode = z.infer<typeof agentThinkingModeSchema>;
export const FINAL_ANSWER_CHAR_LIMIT = 800;
export const FINAL_EVIDENCE_LIMIT = 8;
export const FINAL_LIMITATION_LIMIT = 5;
export const FINAL_LIMITATION_CHAR_LIMIT = 160;
export const unicodeLength = (value: string): number => Array.from(value).length;

// Shape validation precedes deterministic array enforcement in the runtime.
export const modelAnswerCandidateSchema = z
  .object({
    answer: z.string(),
    evidenceIds: z.array(z.string()),
    limitations: z.array(z.string())
  })
  .strict();
export const modelAnswerSchema = modelAnswerCandidateSchema.extend({
  answer: z.string().refine((value) => unicodeLength(value) <= FINAL_ANSWER_CHAR_LIMIT),
  evidenceIds: z.array(z.string()).max(FINAL_EVIDENCE_LIMIT),
  limitations: z
    .array(z.string().refine((value) => unicodeLength(value) <= FINAL_LIMITATION_CHAR_LIMIT))
    .max(FINAL_LIMITATION_LIMIT)
});
export type ModelAnswer = z.infer<typeof modelAnswerSchema>;
