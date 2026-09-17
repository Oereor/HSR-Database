import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evalCaseSchema, isExplicitAbstention, type EvalCase } from '../../../src/lib/agent/eval';
import {
  findInternalTermLeakage,
  includesFact,
  inspectPresentation,
  isIntentResolved,
  loadGeneralizationCorpus,
  loadPresentationCorpus,
  loadStepBudgetAggregationCorpus,
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

function presentationResult(
  testCase: EvalCase,
  answer: string,
  limitations: string[] = [],
  truncationDisclosure: RunAgentResult['truncationDisclosure'] = {
    required: false,
    modelProvided: false,
    runtimeEnforced: false
  }
): RunAgentResult {
  const tools = {
    'entity-resolution': 'search_entities',
    'concrete-query': 'query_endgame',
    'scalar-summary': 'aggregate_endgame',
    'associated-extrema': 'select_endgame_extrema'
  } as const;
  const trace = testCase.gold.expectedOperations.flatMap((operation, index) => {
    if (operation === 'ambiguity-resolution') return [];
    return [
      {
        step: index + 1,
        toolCallId: `call-${index + 1}`,
        tool: tools[operation],
        ok: true,
        validatedArgs: testCase.gold.operationArguments[operation],
        latencyMs: 0,
        summary: {
          toolResultBytes: 1,
          evidenceCount: 1,
          warnings: testCase.gold.warnings
        }
      }
    ];
  });
  return {
    answer: {
      answer,
      evidenceIds: testCase.gold.evidenceRequired ? ['eg1/test'] : [],
      limitations
    },
    invalidEvidenceIds: [],
    modelSteps: trace.length + 1,
    toolCalls: trace.length,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    trace,
    modelTrace: [],
    answerNormalization: {
      evidenceDeduplicated: 0,
      evidenceCapped: 0,
      limitationsDeduplicated: 0,
      limitationsCapped: 0
    },
    structuredAnswer: true,
    hitStepLimit: false,
    truncationDisclosure
  };
}

describe('Agent eval corpus', () => {
  it('numeric fact 匹配忽略展示用千分位与分隔符', () => {
    expect(includesFact('每管血量 11,347,628.66', '1134')).toBe(true);
    expect(includesFact('赛期名称为扫除风暴', '1134')).toBe(false);
  });

  it('A/B 参数和首工具/recovery telemetry 使用冻结 gold', async () => {
    expect(parseArguments(['--thinking=both']).modes).toEqual(['off', 'low']);
    expect(parseArguments(['--suite=generalization-v1', '--thinking=low'])).toMatchObject({
      suite: 'generalization-v1',
      modes: ['low']
    });
    expect(parseArguments(['--suite=step-budget-aggregation-v1'])).toMatchObject({
      suite: 'step-budget-aggregation-v1',
      modes: ['off']
    });
    expect(parseArguments(['--suite=presentation-v1'])).toMatchObject({
      suite: 'presentation-v1',
      modes: ['off']
    });
    const testCase = (await cases('dev.jsonl'))[0];
    const result: RunAgentResult = {
      answer: { answer: testCase.gold.facts.join(' '), evidenceIds: ['eg1/test'], limitations: [] },
      invalidEvidenceIds: [],
      modelSteps: 3,
      toolCalls: 2,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      trace: [
        {
          step: 1,
          toolCallId: 'bad',
          tool: 'query_endgame',
          ok: false,
          errorCode: 'INVALID_ARGUMENTS',
          latencyMs: 0,
          summary: { toolResultBytes: 1, evidenceCount: 0 }
        },
        {
          step: 2,
          toolCallId: 'good',
          tool: 'query_endgame',
          ok: true,
          validatedArgs: testCase.gold.operationArguments['concrete-query'],
          latencyMs: 0,
          summary: { toolResultBytes: 1, evidenceCount: 1 }
        }
      ],
      modelTrace: [1, 2, 3].map((step) => ({
        step,
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
      hitStepLimit: false,
      truncationDisclosure: { required: false, modelProvided: false, runtimeEnforced: false }
    };
    const scored = score(testCase, result);
    expect(scored).toMatchObject({
      firstOperation: true,
      firstOperationArguments: false,
      invalidToolCallCount: 1,
      schemaInvalidCallCount: 1,
      recoveryCount: 1
    });
  });
  it('只把明确拒答或达到 step 上限计为 unsupported abstention', () => {
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
        expectedOperations: ['entity-resolution', 'concrete-query', 'ambiguity-resolution'],
        forbiddenOperations: [],
        operationArguments: {},
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
      modelSteps: 1,
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
      hitStepLimit: false,
      truncationDisclosure: { required: false, modelProvided: false, runtimeEnforced: false }
    } satisfies RunAgentResult;
    expect(isIntentResolved(result.answer.answer)).toBe(true);
    expect(score(testCase, result)).toMatchObject({
      ambiguityHandled: true,
      firstOperationEligible: false,
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
      modelSteps: 1,
      toolCalls: 1,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      trace: [
        {
          step: 1,
          toolCallId: 'q',
          tool: 'query_endgame',
          ok: true,
          validatedArgs: testCase.gold.operationArguments['concrete-query'],
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
      hitStepLimit: false,
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

  it('step-budget-aggregation-v1 固定 6 个 DOG + 5 个职责分解 cases', async () => {
    const regression = await loadStepBudgetAggregationCorpus();
    expect(regression).toHaveLength(11);
    expect(regression.filter(({ id }) => id.startsWith('dog-'))).toHaveLength(6);
    expect(regression.filter(({ id }) => id.startsWith('decomp-'))).toHaveLength(5);
    expect(
      regression.find(({ id }) => id === 'dog-006-pf-associated-extrema')?.gold.expectedOperations
    ).toEqual(['associated-extrema']);
  });

  it('presentation-v1 固定核心、简单查询与 guardrail cases', async () => {
    const presentation = await loadPresentationCorpus();
    expect(presentation).toHaveLength(11);
    expect(presentation.slice(0, 4).map(({ id }) => id)).toEqual([
      'pres-001-current-as-fastest',
      'pres-002-moc-total-hp-trend',
      'pres-003-current-moc-boss-average-winner',
      'pres-004-monkey-recent-three'
    ]);
    expect(presentation.filter(({ tags }) => tags.includes('simple'))).toHaveLength(3);
    expect(presentation.filter(({ tags }) => tags.includes('guardrail'))).toHaveLength(4);
  });

  it('普通回答检测内部术语，技术问题允许显式请求的 ID', async () => {
    const presentation = await loadPresentationCorpus();
    const ordinary = presentation[0];
    const technical = presentation.at(-1)!;
    const leaked = presentationResult(ordinary, '当前末日幻影 groupId 中的 enemyTemplateId 结果。');
    expect(findInternalTermLeakage(leaked, 'ordinary')).toEqual(
      expect.arrayContaining(['groupId', 'enemyTemplateId'])
    );
    const requested = presentationResult(
      technical,
      'groupId 表示赛期顺序；evidenceId 是证据引用，MonsterID 是敌人变体 ID。'
    );
    expect(findInternalTermLeakage(requested, 'technical')).toEqual([]);
    expect(inspectPresentation(technical, requested)?.detailHits.requested).toHaveLength(3);
  });

  it('分层评分保留实质限制，并阻止重复限制与范围复述', async () => {
    const presentation = await loadPresentationCorpus();
    const totalHp = presentation.find(({ id }) => id === 'pres-002-moc-total-hp-trend')!;
    const missing = presentationResult(totalHp, '最近三期的每管血量整体上升。');
    expect(score(totalHp, missing)).toMatchObject({ tier1: false, passed: false });

    const concise = presentationResult(
      totalHp,
      '严格整层总血量无法可靠计算，部分首领有多阶段或共享血量。若改看每管血量，最近三期整体上升。'
    );
    expect(score(totalHp, concise)).toMatchObject({ tier1: true, tier2: true, passed: true });

    const repeated = presentationResult(
      totalHp,
      '严格整层总血量无法可靠计算。若改看每管血量，最近三期整体上升。',
      ['总血量无法可靠还原。']
    );
    expect(score(totalHp, repeated)).toMatchObject({ tier1: true, tier2: false, passed: false });

    const scoped = presentation.find(({ id }) => id === 'pres-010-scope-not-limitation')!;
    const scopeRestated = presentationResult(scoped, '三期平均速度已列出。', [
      '本回答不包括 upcoming，仅统计第 12 层。'
    ]);
    expect(score(scoped, scopeRestated)).toMatchObject({ tier2: false, passed: false });
  });

  it('结论前置与软句数目标只进入 Tier 3', async () => {
    const testCase = (await loadPresentationCorpus())[0];
    const direct = presentationResult(
      testCase,
      '当前末日幻影难度 4 速度最高的是「业火焚心的影将军」，速度为 190.08。'
    );
    expect(score(testCase, direct)).toMatchObject({ tier1: true, tier2: true, tier3: true });
    const delayed = presentationResult(
      testCase,
      '先说明一些背景。这是一个极值查询。答案是「业火焚心的影将军」，速度 190.08。'
    );
    expect(score(testCase, delayed)).toMatchObject({ tier1: true, tier2: true, tier3: false });
  });

  it('截断全局结果仍必须由模型或 runtime 披露', async () => {
    const testCase = (await loadPresentationCorpus())[0];
    const answer = '「业火焚心的影将军」速度最高，为 190.08。';
    const missing = presentationResult(testCase, answer, [], {
      required: true,
      modelProvided: false,
      runtimeEnforced: false
    });
    expect(score(testCase, missing)).toMatchObject({ tier1: false, passed: false });
    const enforced = presentationResult(testCase, answer, ['结果已截断，排名可能不完整。'], {
      required: true,
      modelProvided: false,
      runtimeEnforced: true
    });
    expect(score(testCase, enforced)).toMatchObject({ tier1: true, passed: true });
  });

  it('身份歧义和单观察值仍保留对结论有影响的限制', async () => {
    const presentation = await loadPresentationCorpus();
    const ambiguity = presentation.find(({ id }) => id === 'pres-008-material-identity-ambiguity')!;
    const clarified = presentationResult(
      ambiguity,
      '请确认：你指的是该敌人最近 6 次出现，还是全局最近 6 期？'
    );
    expect(score(ambiguity, clarified)).toMatchObject({ tier1: true, tier2: true, passed: true });

    const oneObservation = presentation.find(
      ({ id }) => id === 'pres-009-material-single-observation'
    )!;
    const cautious = presentationResult(
      oneObservation,
      '无法判断跨赛期趋势，因为只有一个可比赛期。'
    );
    expect(score(oneObservation, cautious)).toMatchObject({
      tier1: true,
      tier2: true,
      passed: true
    });
    const overconfident = presentationResult(oneObservation, '首领每管血量呈上升趋势。');
    expect(score(oneObservation, overconfident)).toMatchObject({ tier1: false, passed: false });
  });

  it('argMin/argMax gold 使用 architecture-neutral associated-extrema operation', async () => {
    const generalization = await loadGeneralizationCorpus();
    const associated = generalization.filter(({ coverage }) =>
      coverage.operations.some((operation) => operation === 'argMin' || operation === 'argMax')
    );
    expect(associated).toHaveLength(4);
    expect(
      associated.every(({ gold }) => gold.expectedOperations.includes('associated-extrema'))
    ).toBe(true);
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
