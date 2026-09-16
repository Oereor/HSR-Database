import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evalCaseSchema, isExplicitAbstention, type EvalCase } from '../../../src/lib/agent/eval';
import {
  isIntentResolved,
  loadGeneralizationCorpus,
  parseArguments,
  score
} from '../../../scripts/agent/eval';
import type { RunAgentResult } from '../../../src/lib/server/agent/runtime';

async function cases(file: string): Promise<EvalCase[]> {
  return (await readFile(path.join(process.cwd(), 'evals', 'agent', file), 'utf8'))
    .trim()
    .split(/\r?\n/)
    .map((line) => evalCaseSchema.parse(JSON.parse(line)));
}

describe('Agent eval corpus', () => {
  it('A/B 参数和首工具/recovery telemetry 使用冻结 gold', async () => {
    expect(parseArguments(['--thinking=both']).modes).toEqual(['off', 'low']);
    expect(parseArguments(['--suite=generalization-v1', '--thinking=low'])).toMatchObject({
      suite: 'generalization-v1',
      modes: ['low']
    });
    const testCase = (await cases('dev.jsonl'))[0];
    const result: RunAgentResult = {
      answer: { answer: testCase.gold.facts.join(' '), evidenceIds: ['eg1/test'], limitations: [] },
      invalidEvidenceIds: [],
      turns: 3,
      toolCalls: 2,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      trace: [
        {
          turn: 1,
          toolCallId: 'bad',
          tool: 'query_endgame',
          ok: false,
          errorCode: 'INVALID_ARGUMENTS',
          latencyMs: 0,
          summary: { toolResultBytes: 1, evidenceCount: 0 }
        },
        {
          turn: 2,
          toolCallId: 'good',
          tool: 'query_endgame',
          ok: true,
          validatedArgs: testCase.gold.keyArguments.query_endgame,
          latencyMs: 0,
          summary: { toolResultBytes: 1, evidenceCount: 1 }
        }
      ],
      modelTrace: [1, 2, 3].map((turn) => ({
        turn,
        latencyMs: 0,
        reasoningPresent: false,
        reasoningChars: 0
      })),
      answerNormalization: {
        evidenceDeduplicated: 0,
        evidenceCapped: 0,
        limitationsDeduplicated: 0,
        limitationsCapped: 0
      },
      structuredAnswer: true,
      hitTurnLimit: false,
      truncationDisclosure: { required: false, modelProvided: false, runtimeEnforced: false }
    };
    const scored = score(testCase, result);
    expect(scored).toMatchObject({
      firstToolName: true,
      firstToolKeyArguments: false,
      invalidToolCallCount: 1,
      schemaInvalidCallCount: 1,
      recoveryCount: 1
    });
  });
  it('只把明确拒答或达到 turn 上限计为 unsupported abstention', () => {
    expect(isExplicitAbstention('数据库不含该指标，无法直接给出结论。')).toBe(true);
    expect(isExplicitAbstention('模型在允许的最大轮次内没有生成最终回答。')).toBe(true);
    expect(isExplicitAbstention('按 HP 口径看，这一期最难。')).toBe(false);
  });

  it('Case C 的澄清或明示假设不被计为首工具失败', () => {
    const testCase = evalCaseSchema.parse({
      id: 'manual-case-c',
      tags: ['ambiguity'],
      question: '分析「颁赐者，千军首，天谴之矛」在最近 6 期混沌回忆中的血量变化。',
      coverage: {
        modes: ['moc'],
        metrics: ['hp'],
        operations: ['scope-check'],
        grains: ['season', 'enemyTemplate'],
        timeScope: 'multi-season',
        answerability: 'partial'
      },
      gold: {
        expectedTools: ['search_entities', 'query_endgame'],
        forbiddenTools: [],
        keyArguments: {},
        facts: [],
        warnings: [],
        forbiddenAnswerTerms: [],
        answerability: 'partial',
        evidenceRequired: false
      }
    });
    const result = {
      answer: {
        answer: '请确认：你指的是全局最近 6 期，还是该敌人最近 6 次出现？',
        evidenceIds: [],
        limitations: []
      },
      invalidEvidenceIds: [],
      turns: 1,
      toolCalls: 0,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      trace: [],
      modelTrace: [],
      answerNormalization: {
        evidenceDeduplicated: 0,
        evidenceCapped: 0,
        limitationsDeduplicated: 0,
        limitationsCapped: 0
      },
      structuredAnswer: true,
      hitTurnLimit: false,
      truncationDisclosure: { required: false, modelProvided: false, runtimeEnforced: false }
    } satisfies RunAgentResult;
    expect(isIntentResolved(result.answer.answer)).toBe(true);
    expect(score(testCase, result)).toMatchObject({
      ambiguityHandled: true,
      firstToolEligible: false,
      passed: true
    });
  });

  it('ordinary presentation 的 literal forbidden terms 进入独立评分', async () => {
    const testCase = (await loadGeneralizationCorpus()).find(
      ({ id }) => id === 'gen-presentation-ordinary'
    );
    if (!testCase) throw new Error('presentation case missing');
    const result = {
      answer: { answer: 'groupId 3020 的结果', evidenceIds: ['eg1/test'], limitations: [] },
      invalidEvidenceIds: [],
      turns: 1,
      toolCalls: 1,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      trace: [
        {
          turn: 1,
          toolCallId: 'q',
          tool: 'query_endgame',
          ok: true,
          validatedArgs: testCase.gold.keyArguments.query_endgame,
          latencyMs: 0,
          summary: { toolResultBytes: 1, evidenceCount: 1 }
        }
      ],
      modelTrace: [],
      answerNormalization: {
        evidenceDeduplicated: 0,
        evidenceCapped: 0,
        limitationsDeduplicated: 0,
        limitationsCapped: 0
      },
      structuredAnswer: true,
      hitTurnLimit: false,
      truncationDisclosure: { required: false, modelProvided: false, runtimeEnforced: false }
    } satisfies RunAgentResult;
    expect(score(testCase, result)).toMatchObject({ presentation: false, passed: false });
  });

  it('冻结 24 dev + 12 held-out 且 ID 唯一', async () => {
    const [dev, heldOut] = await Promise.all([cases('dev.jsonl'), cases('held-out.jsonl')]);
    expect(dev).toHaveLength(24);
    expect(heldOut).toHaveLength(12);
    expect(new Set([...dev, ...heldOut].map(({ id }) => id)).size).toBe(36);
  });

  it('generalization-v1 保持独立 16 cases 且不收录原 dogfooding wording', async () => {
    const generalization = await loadGeneralizationCorpus();
    expect(generalization).toHaveLength(16);
    const questions = generalization.map(({ question }) => question).join('\n');
    expect(questions).not.toContain('最多和次多的是哪两个');
    expect(questions).not.toContain('分别分析最近6期混沌回忆');
    expect(questions).not.toContain('颁赐者，千军首，天谴之矛');
    expect(new Set(generalization.map(({ id }) => id)).size).toBe(16);
  });

  it('覆盖四模式、六类指标、主要操作、grain 与三种 answerability', async () => {
    const all = [...(await cases('dev.jsonl')), ...(await cases('held-out.jsonl'))];
    const values = <K extends keyof EvalCase['coverage']>(key: K) =>
      new Set(
        all.flatMap(({ coverage }) => {
          const value = coverage[key];
          return Array.isArray(value) ? value : [value];
        })
      );
    for (const value of ['moc', 'pf', 'as', 'aa']) expect(values('modes')).toContain(value);
    for (const value of ['hp', 'speed', 'toughness', 'level', 'weakness', 'rank'])
      expect(values('metrics')).toContain(value);
    for (const value of [
      'retrieve',
      'sort',
      'distinct',
      'count',
      'countDistinct',
      'min',
      'max',
      'avg',
      'set-comparison',
      'multi-step'
    ])
      expect(values('operations')).toContain(value);
    for (const value of [
      'season',
      'encounter',
      'battleSlot',
      'stage',
      'wave',
      'enemyTemplate',
      'monster',
      'configured-occurrence'
    ])
      expect(values('grains')).toContain(value);
    expect(values('answerability')).toEqual(new Set(['supported', 'partial', 'unsupported']));
    expect(all.filter(({ tags }) => tags.includes('stability')).length).toBeGreaterThanOrEqual(10);
  });
});
