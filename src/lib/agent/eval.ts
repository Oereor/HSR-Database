import { z } from 'zod';
import { AgentToolNameSchema } from './tool-names.js';

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
        expectedTools: z.array(AgentToolNameSchema).max(3),
        forbiddenTools: z.array(AgentToolNameSchema).default([]),
        keyArguments: z
          .partialRecord(AgentToolNameSchema, z.record(z.string(), z.unknown()))
          .default({}),
        facts: z.array(z.string()).default([]),
        warnings: z.array(z.string()).default([]),
        forbiddenAnswerTerms: z.array(z.string().min(1)).default([]),
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
    const expected = new Set(value.gold.expectedTools);
    for (const name of value.gold.forbiddenTools)
      if (expected.has(name))
        context.addIssue({
          code: 'custom',
          path: ['gold', 'forbiddenTools'],
          message: '工具不能同时为 expected 和 forbidden'
        });
    for (const name of Object.keys(value.gold.keyArguments))
      if (!expected.has(name as z.infer<typeof AgentToolNameSchema>))
        context.addIssue({
          code: 'custom',
          path: ['gold', 'keyArguments', name],
          message: 'keyArguments 只能引用 expected tool'
        });
  });

export type EvalCase = z.infer<typeof evalCaseSchema>;

export function isExplicitAbstention(answer: string): boolean {
  return (
    /模型在允许的最大轮次内没有生成最终回答/.test(answer) ||
    /(?:无法|不能|不足以|不支持)(?:直接)?(?:回答|给出|确定|判断|计算|推断|说明|支持)/.test(answer)
  );
}
