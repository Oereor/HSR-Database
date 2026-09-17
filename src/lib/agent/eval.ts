import { z } from 'zod';

export const toolOperationSchema = z.enum([
  'entity-resolution',
  'concrete-query',
  'scalar-summary',
  'associated-extrema'
]);
export const evalOperationSchema = z.union([
  toolOperationSchema,
  z.literal('ambiguity-resolution')
]);
export type ToolOperation = z.infer<typeof toolOperationSchema>;
export type EvalOperation = z.infer<typeof evalOperationSchema>;

export function operationForTool(tool: string): ToolOperation | undefined {
  if (tool === 'search_entities') return 'entity-resolution';
  if (tool === 'query_endgame') return 'concrete-query';
  if (tool === 'aggregate_endgame') return 'scalar-summary';
  if (tool === 'select_endgame_extrema') return 'associated-extrema';
  return undefined;
}

const answerabilitySchema = z.enum(['supported', 'partial', 'unsupported']);
const modeCoverageSchema = z.enum(['moc', 'pf', 'as', 'aa', 'cross-mode']);
const metricCoverageSchema = z.enum([
  'hp',
  'speed',
  'toughness',
  'level',
  'weakness',
  'rank',
  'identity',
  'unsupported'
]);
const operationCoverageSchema = z.enum([
  'retrieve',
  'filter',
  'sort',
  'distinct',
  'count',
  'countDistinct',
  'min',
  'max',
  'avg',
  'groupBy',
  'argMin',
  'argMax',
  'identity-handoff',
  'scope-check',
  'presentation',
  'set-comparison',
  'multi-step',
  'abstain'
]);
const grainCoverageSchema = z.enum([
  'mode',
  'season',
  'encounter',
  'battleSlot',
  'stage',
  'wave',
  'enemyTemplate',
  'monster',
  'weakness',
  'location',
  'configured-occurrence'
]);
const timeScopeSchema = z.enum([
  'current',
  'latest',
  'specific',
  'multi-season',
  'historical',
  'none'
]);

const presentationDetailClassificationSchema = z.enum([
  'requested',
  'helpful-context',
  'unnecessary',
  'internal'
]);

const presentationExpectationSchema = z
  .object({
    audience: z.enum(['ordinary', 'technical']),
    leadFacts: z.array(z.string().min(1)).default([]),
    softMaxSentences: z.number().int().positive().optional(),
    limitationConcepts: z
      .array(
        z
          .object({
            anyOf: z.array(z.string().min(1)).min(1),
            minMentions: z.number().int().min(0).default(1),
            maxMentions: z.number().int().positive().default(1)
          })
          .strict()
      )
      .default([]),
    forbiddenLimitationTerms: z.array(z.string().min(1)).default([]),
    details: z
      .array(
        z
          .object({
            anyOf: z.array(z.string().min(1)).min(1),
            classification: presentationDetailClassificationSchema
          })
          .strict()
      )
      .default([])
  })
  .strict()
  .superRefine((value, context) => {
    value.limitationConcepts.forEach((concept, index) => {
      if (concept.minMentions > concept.maxMentions)
        context.addIssue({
          code: 'custom',
          path: ['limitationConcepts', index, 'minMentions'],
          message: 'minMentions 不能大于 maxMentions'
        });
    });
  });

export const evalCaseSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    tags: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1),
    question: z.string().min(1),
    coverage: z
      .object({
        modes: z.array(modeCoverageSchema).min(1),
        metrics: z.array(metricCoverageSchema).min(1),
        operations: z.array(operationCoverageSchema).min(1),
        grains: z.array(grainCoverageSchema).min(1),
        timeScope: timeScopeSchema,
        answerability: answerabilitySchema
      })
      .strict(),
    gold: z
      .object({
        expectedOperations: z.array(evalOperationSchema).max(5),
        forbiddenOperations: z.array(evalOperationSchema).default([]),
        operationArguments: z
          .partialRecord(toolOperationSchema, z.record(z.string(), z.unknown()))
          .default({}),
        facts: z.array(z.string()).default([]),
        warnings: z.array(z.string()).default([]),
        forbiddenAnswerTerms: z.array(z.string().min(1)).default([]),
        presentation: presentationExpectationSchema.optional(),
        answerability: answerabilitySchema,
        evidenceRequired: z.boolean()
      })
      .strict()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.coverage.answerability !== value.gold.answerability)
      context.addIssue({
        code: 'custom',
        path: ['gold', 'answerability'],
        message: 'answerability 必须一致'
      });
    const expected = new Set(value.gold.expectedOperations);
    for (const name of value.gold.forbiddenOperations)
      if (expected.has(name))
        context.addIssue({
          code: 'custom',
          path: ['gold', 'forbiddenOperations'],
          message: 'operation 不能同时为 expected 和 forbidden'
        });
    for (const name of Object.keys(value.gold.operationArguments))
      if (!expected.has(name as ToolOperation))
        context.addIssue({
          code: 'custom',
          path: ['gold', 'operationArguments', name],
          message: 'operationArguments 只能引用 expected operation'
        });
  });

export type EvalCase = z.infer<typeof evalCaseSchema>;

export function isExplicitAbstention(answer: string): boolean {
  return (
    /模型在允许的最大(?:轮次|步骤|\s*model steps?)内没有生成最终回答/.test(answer) ||
    /(?:无法|不能|不足以|不支持)(?:直接)?(?:回答|给出|确定|判断|计算|推断|说明|支持)/.test(answer)
  );
}
