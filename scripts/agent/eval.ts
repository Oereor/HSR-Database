import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { fingerprintTools } from 'ai';
import {
  evalCaseSchema,
  isExplicitAbstention,
  operationForTool,
  type EvalCase,
  type EvalOperation
} from '../../src/lib/agent/eval.js';
import {
  DATA_AGENT_INSTRUCTIONS,
  runDataAgent,
  type RunAgentResult
} from '../../src/lib/server/agent/runtime.js';
import { type AgentThinkingMode } from '../../src/lib/agent/contracts.js';
import { createDeepSeekModelFromEnv } from '../../src/lib/server/agent/model.js';
import { createAgentTools } from '../../src/lib/server/agent/tools.js';
import { getAgentDataVersion } from '../../src/lib/server/agent/data-version.js';
import { redactSecrets } from './inspector.js';

type Split = 'dev' | 'held-out' | 'all';
type Suite = 'frozen' | 'generalization-v1' | 'step-budget-aggregation-v1' | 'presentation-v1';

export function parseArguments(args: string[]) {
  const valueAfter = (flag: string) => {
    const inline = args.find((argument) => argument.startsWith(`${flag}=`));
    if (inline) return inline.slice(flag.length + 1);
    const index = args.indexOf(flag);
    return index < 0 ? undefined : args[index + 1];
  };
  const split = (valueAfter('--split') ?? 'all') as Split;
  if (!['dev', 'held-out', 'all'].includes(split))
    throw new Error('--split 必须是 dev、held-out 或 all');
  const repeat = Number(valueAfter('--repeat') ?? '1');
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 10)
    throw new Error('--repeat 必须是 1 到 10 的整数');
  const caseIds = valueAfter('--cases')
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const thinking = valueAfter('--thinking') ?? 'off';
  if (!['off', 'low', 'both'].includes(thinking))
    throw new Error('--thinking 必须是 off、low 或 both');
  const modes: AgentThinkingMode[] =
    thinking === 'both' ? ['off', 'low'] : [thinking as AgentThinkingMode];
  const suite = (valueAfter('--suite') ?? 'frozen') as Suite;
  if (
    !['frozen', 'generalization-v1', 'step-budget-aggregation-v1', 'presentation-v1'].includes(
      suite
    )
  )
    throw new Error(
      '--suite 必须是 frozen、generalization-v1、step-budget-aggregation-v1 或 presentation-v1'
    );
  if (suite !== 'frozen' && args.some((argument) => argument.startsWith('--split')))
    throw new Error(`${suite} 是独立 suite，不接受 --split`);
  return {
    model: args.includes('--model'),
    suite,
    split,
    repeat,
    tag: valueAfter('--tag'),
    caseIds,
    modes
  };
}

async function loadFile(file: string): Promise<EvalCase[]> {
  const source = await readFile(file, 'utf8');
  return source
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      const parsed = evalCaseSchema.safeParse(JSON.parse(line));
      if (!parsed.success) throw new Error(`${file}:${index + 1}: ${parsed.error.message}`);
      return parsed.data;
    });
}

export async function loadEvalCorpus(root = process.cwd()) {
  const evalRoot = path.join(root, 'evals', 'agent');
  const [dev, heldOut] = await Promise.all([
    loadFile(path.join(evalRoot, 'dev.jsonl')),
    loadFile(path.join(evalRoot, 'held-out.jsonl'))
  ]);
  const ids = [...dev, ...heldOut].map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new Error('eval case id 必须全局唯一');
  if (dev.length !== 24 || heldOut.length !== 12)
    throw new Error(`eval corpus 数量错误：dev=${dev.length}, held-out=${heldOut.length}`);
  return { dev, heldOut };
}

export async function loadGeneralizationCorpus(root = process.cwd()) {
  const file = path.join(root, 'evals', 'agent', 'generalization-v1.jsonl');
  const cases = await loadFile(file);
  if (cases.length !== 16) throw new Error(`generalization-v1 corpus 数量错误：${cases.length}`);
  if (new Set(cases.map(({ id }) => id)).size !== cases.length)
    throw new Error('generalization-v1 case id 必须唯一');
  return cases;
}

export async function loadStepBudgetAggregationCorpus(root = process.cwd()) {
  const file = path.join(root, 'evals', 'agent', 'step-budget-aggregation-v1.jsonl');
  const cases = await loadFile(file);
  if (cases.length !== 11)
    throw new Error(`step-budget-aggregation-v1 corpus 数量错误：${cases.length}`);
  if (new Set(cases.map(({ id }) => id)).size !== cases.length)
    throw new Error('step-budget-aggregation-v1 case id 必须唯一');
  return cases;
}

export async function loadPresentationCorpus(root = process.cwd()) {
  const file = path.join(root, 'evals', 'agent', 'presentation-v1.jsonl');
  const cases = await loadFile(file);
  if (cases.length !== 11) throw new Error(`presentation-v1 corpus 数量错误：${cases.length}`);
  if (new Set(cases.map(({ id }) => id)).size !== cases.length)
    throw new Error('presentation-v1 case id 必须唯一');
  if (cases.some(({ gold }) => !gold.presentation))
    throw new Error('presentation-v1 每个 case 都必须定义 gold.presentation');
  return cases;
}

function isSubset(expected: unknown, actual: unknown): boolean {
  if (expected === null || typeof expected !== 'object') return Object.is(expected, actual);
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) && expected.every((value, index) => isSubset(value, actual[index]))
    );
  if (!actual || typeof actual !== 'object') return false;
  return Object.entries(expected as Record<string, unknown>).every(([key, value]) =>
    isSubset(value, (actual as Record<string, unknown>)[key])
  );
}

export function includesFact(answer: string, fact: string): boolean {
  if (answer.includes(fact)) return true;
  if (!/^[\d\s,._-]+$/.test(fact)) return false;
  const compact = (value: string) => value.replace(/[\s,._-]/g, '');
  return compact(answer).includes(compact(fact));
}

export function isIntentResolved(answer: string): boolean {
  return (
    /(?:请问|请确认|需要确认|你指的是).*(?:还是|是指|口径|范围)/s.test(answer) ||
    /(?:我将|本回答|下文|暂按|按).{0,40}(?:理解为|口径|假设|解释)/s.test(answer)
  );
}

const internalTermPatterns: ReadonlyArray<[label: string, pattern: RegExp]> = [
  ['enemyTemplateId', /enemyTemplateId/i],
  ['enemyTemplate', /enemyTemplate/i],
  ['groupId', /groupId/i],
  ['configured-occurrence', /configured[- ]occurrence/i],
  ['runtime-unclear', /runtime[- ]unclear/i],
  ['battleSlot', /battleSlot/i],
  ['encounterOrdinal', /encounterOrdinal/i],
  ['dataRevision', /dataRevision/i],
  ['DecimalString', /DecimalString/i],
  ['evidenceId', /evidenceId/i],
  ['stageId', /stageId/i],
  ['MonsterID', /MonsterID/i],
  ['evidence namespace', /(?:ag1|eg1|ent1)\//i],
  ['mode abbreviation', /(?:^|[\s（(])(?:moc|pf|as|aa)(?=$|[\s）)])/i]
];

function visibleSurfaces(result: RunAgentResult): string[] {
  return [result.answer.answer, ...result.answer.limitations];
}

export function findInternalTermLeakage(
  result: RunAgentResult,
  audience: 'ordinary' | 'technical'
): string[] {
  if (audience === 'technical') return [];
  const visible = visibleSurfaces(result).join('\n');
  return internalTermPatterns.flatMap(([label, pattern]) => (pattern.test(visible) ? [label] : []));
}

function sentenceCount(answer: string): number {
  return answer
    .split(/[。！？!?;；\n]+/)
    .map((part) => part.replace(/^[\s•·*-]+/, '').trim())
    .filter(Boolean).length;
}

function firstSentence(answer: string): string {
  return answer.split(/[。！？!?;；\n]/, 1)[0]?.trim() ?? '';
}

export function inspectPresentation(testCase: EvalCase, result: RunAgentResult) {
  const expectations = testCase.gold.presentation;
  if (!expectations) return undefined;
  const surfaces = visibleSurfaces(result);
  const limitations = result.answer.limitations;
  const internalTerms = findInternalTermLeakage(result, expectations.audience);
  const detailHits = Object.fromEntries(
    ['requested', 'helpful-context', 'unnecessary', 'internal'].map((classification) => [
      classification,
      expectations.details.flatMap((detail) =>
        detail.classification === classification &&
        surfaces.some((surface) => detail.anyOf.some((term) => surface.includes(term)))
          ? [detail.anyOf[0]]
          : []
      )
    ])
  ) as Record<'requested' | 'helpful-context' | 'unnecessary' | 'internal', string[]>;
  const limitationConcepts = expectations.limitationConcepts.map((concept) => {
    const mentions = surfaces.filter((surface) =>
      concept.anyOf.some((term) => surface.includes(term))
    ).length;
    return {
      label: concept.anyOf[0],
      mentions,
      required: mentions >= concept.minMentions,
      deduplicated: mentions <= concept.maxMentions
    };
  });
  const count = sentenceCount(result.answer.answer);
  return {
    audience: expectations.audience,
    internalTerms,
    detailHits,
    limitationConcepts,
    materialLimitationsPreserved: limitationConcepts.every(({ required }) => required),
    duplicateLimitationsAvoided: limitationConcepts.every(({ deduplicated }) => deduplicated),
    scopeRestatementAvoided: expectations.forbiddenLimitationTerms.every(
      (term) => !limitations.some((limitation) => limitation.includes(term))
    ),
    conclusionFirst: expectations.leadFacts.every((fact) =>
      includesFact(firstSentence(result.answer.answer), fact)
    ),
    sentenceCount: count,
    withinSoftSentenceTarget:
      expectations.softMaxSentences === undefined || count <= expectations.softMaxSentences
  };
}

export function score(testCase: EvalCase, result: RunAgentResult) {
  const ambiguityCase = testCase.tags.includes('ambiguity');
  const ambiguityHandled = !ambiguityCase || isIntentResolved(result.answer.answer);
  const observedOperations: EvalOperation[] = result.trace.flatMap(({ tool }) => {
    const operation = operationForTool(tool);
    return operation ? [operation] : [];
  });
  if (isIntentResolved(result.answer.answer)) observedOperations.push('ambiguity-resolution');
  const warnings = new Set(result.trace.flatMap(({ summary }) => summary.warnings ?? []));
  const expectedOperations = testCase.gold.expectedOperations.every((operation) =>
    observedOperations.includes(operation)
  );
  const forbiddenOperations = testCase.gold.forbiddenOperations.every(
    (operation) => !observedOperations.includes(operation)
  );
  const operationArguments = Object.entries(testCase.gold.operationArguments).every(
    ([operation, expected]) =>
      result.trace.some(
        (entry) =>
          operationForTool(entry.tool) === operation && isSubset(expected, entry.validatedArgs)
      )
  );
  const facts = testCase.gold.facts.every((fact) => includesFact(result.answer.answer, fact));
  const presentation = testCase.gold.forbiddenAnswerTerms.every(
    (term) =>
      !result.answer.answer.includes(term) && !result.answer.limitations.join(' ').includes(term)
  );
  const presentationInspection = inspectPresentation(testCase, result);
  const warningMatch = testCase.gold.warnings.every((warning) => warnings.has(warning));
  const evidence =
    result.invalidEvidenceIds.length === 0 &&
    (!testCase.gold.evidenceRequired || result.answer.evidenceIds.length > 0);
  const abstained =
    testCase.gold.answerability !== 'unsupported' || isExplicitAbstention(result.answer.answer);
  const truncationPreserved =
    !result.truncationDisclosure.required ||
    result.truncationDisclosure.modelProvided ||
    result.truncationDisclosure.runtimeEnforced;
  const expectedToolOperations = testCase.gold.expectedOperations.filter(
    (operation) => operation !== 'ambiguity-resolution'
  );
  const withinGoldPlusOne = result.toolCalls <= expectedToolOperations.length + 1;
  const firstExpected = expectedToolOperations[0];
  const first = result.trace.find((entry) => entry.errorCode !== 'TOOL_CALL_LIMIT_EXCEEDED');
  const schemaInvalid = result.trace.filter((entry) =>
    ['INVALID_JSON', 'INVALID_ARGUMENTS'].includes(entry.errorCode ?? '')
  );
  const recovered = schemaInvalid.filter((entry) => {
    const nextStep = result.modelTrace.find((item) => item.step > entry.step);
    const next = nextStep && result.trace.find((item) => item.step === nextStep.step);
    return next?.tool === entry.tool && next.ok;
  }).length;
  const correctnessPassed = ambiguityCase
    ? ambiguityHandled && forbiddenOperations && result.structuredAnswer && truncationPreserved
    : expectedOperations &&
      forbiddenOperations &&
      operationArguments &&
      facts &&
      warningMatch &&
      evidence &&
      abstained &&
      result.structuredAnswer &&
      truncationPreserved;
  const tier1 = correctnessPassed && (presentationInspection?.materialLimitationsPreserved ?? true);
  const tier2 =
    presentation &&
    (presentationInspection === undefined ||
      (presentationInspection.internalTerms.length === 0 &&
        presentationInspection.detailHits.internal.length === 0 &&
        presentationInspection.detailHits.unnecessary.length === 0 &&
        presentationInspection.duplicateLimitationsAvoided &&
        presentationInspection.scopeRestatementAvoided));
  const tier3 =
    presentationInspection === undefined ||
    (presentationInspection.conclusionFirst && presentationInspection.withinSoftSentenceTarget);
  return {
    ambiguityCase,
    ambiguityHandled,
    firstOperationEligible: !!firstExpected && !ambiguityCase,
    firstOperation: !!firstExpected && operationForTool(first?.tool ?? '') === firstExpected,
    firstOperationArguments:
      !!firstExpected &&
      operationForTool(first?.tool ?? '') === firstExpected &&
      isSubset(
        testCase.gold.operationArguments[
          firstExpected as keyof typeof testCase.gold.operationArguments
        ] ?? {},
        first?.validatedArgs
      ),
    invalidToolCallCount: result.trace.filter((entry) =>
      ['UNKNOWN_TOOL', 'INVALID_JSON', 'INVALID_ARGUMENTS'].includes(entry.errorCode ?? '')
    ).length,
    schemaInvalidCallCount: schemaInvalid.length,
    recoveryCount: recovered,
    expectedOperations,
    forbiddenOperations,
    operationArguments,
    facts,
    presentation,
    presentationInspection,
    tier1,
    tier2,
    tier3,
    warnings: warningMatch,
    evidence,
    abstained,
    structuredFinal: result.structuredAnswer,
    hitStepLimit: result.hitStepLimit,
    truncationRequired: result.truncationDisclosure.required,
    truncationPreserved,
    truncationModelProvided: result.truncationDisclosure.modelProvided,
    truncationRuntimeEnforced: result.truncationDisclosure.runtimeEnforced,
    evidenceRequired: testCase.gold.evidenceRequired,
    warningRequired: testCase.gold.warnings.length > 0,
    unsupported: testCase.gold.answerability === 'unsupported',
    supported: testCase.gold.answerability === 'supported',
    goldToolCalls: expectedToolOperations.length,
    withinGoldPlusOne,
    forbiddenCallCount: result.trace.filter(({ tool }) => {
      const operation = operationForTool(tool);
      return operation ? testCase.gold.forbiddenOperations.includes(operation) : false;
    }).length,
    unnecessaryToolCalls:
      testCase.gold.answerability === 'unsupported'
        ? result.toolCalls
        : result.trace.filter(({ tool }) => {
            const operation = operationForTool(tool);
            return operation ? testCase.gold.forbiddenOperations.includes(operation) : false;
          }).length,
    passed: testCase.gold.presentation ? tier1 && tier2 : correctnessPassed && presentation
  };
}

type CompletedRecord = {
  thinkingMode: AgentThinkingMode;
  order: number;
  caseId: string;
  repetition: number;
  latencyMs: number;
  result: RunAgentResult;
  score: ReturnType<typeof score>;
};

type FailedRecord = {
  thinkingMode: AgentThinkingMode;
  order: number;
  caseId: string;
  repetition: number;
  latencyMs: number;
  error: string;
};

function average(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values: readonly number[], quantile: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
}

function ratio(passed: number, total: number) {
  return { passed, total, rate: total ? passed / total : 0 };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const frozen = args.suite === 'frozen' ? await loadEvalCorpus() : undefined;
  const generalization =
    args.suite === 'generalization-v1' ? await loadGeneralizationCorpus() : undefined;
  const stepBudgetAggregation =
    args.suite === 'step-budget-aggregation-v1'
      ? await loadStepBudgetAggregationCorpus()
      : undefined;
  const presentation =
    args.suite === 'presentation-v1' ? await loadPresentationCorpus() : undefined;
  const standalone = generalization ?? stepBudgetAggregation ?? presentation;
  const selectedSplit = standalone
    ? standalone
    : args.split === 'dev'
      ? frozen!.dev
      : args.split === 'held-out'
        ? frozen!.heldOut
        : [...frozen!.dev, ...frozen!.heldOut];
  const selectedCases = args.caseIds
    ? selectedSplit.filter(({ id }) => args.caseIds!.includes(id))
    : selectedSplit;
  if (args.caseIds && selectedCases.length !== new Set(args.caseIds).size) {
    const found = new Set(selectedCases.map(({ id }) => id));
    const missing = [...new Set(args.caseIds)].filter((id) => !found.has(id));
    throw new Error(`--cases 包含当前 split 中不存在的 case: ${missing.join(', ')}`);
  }
  const tagged = args.tag
    ? selectedCases.filter(({ tags }) => tags.includes(args.tag!))
    : selectedCases;
  const selected = args.tag === 'stability' ? tagged.slice(0, 10) : tagged;
  if (!selected.length) throw new Error('筛选后没有 eval case');
  console.log(
    standalone
      ? `Validated ${standalone.length} ${args.suite} cases; selected ${selected.length}.`
      : `Validated ${frozen!.dev.length} dev + ${frozen!.heldOut.length} held-out cases; selected ${selected.length}.`
  );
  if (!args.model) return;

  const models = new Map(args.modes.map((mode) => [mode, createDeepSeekModelFromEnv(process.env)]));
  const secrets = [process.env.DEEPSEEK_API_KEY ?? ''];
  const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const auditRoot = path.join(process.cwd(), 'data', 'audit', 'agent', runId);
  await mkdir(auditRoot, { recursive: true });
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const experiment = {
    suite: args.suite,
    modes: args.modes,
    order: `repetition → corpus case → ${args.modes.join(' then ')}`,
    model: process.env.DEEPSEEK_MODEL ?? 'deepseek-flash',
    dataVersion: await getAgentDataVersion(),
    promptHash: hash(DATA_AGENT_INSTRUCTIONS),
    toolsHash: hash(
      JSON.stringify(await fingerprintTools(createAgentTools({ executedToolCalls: 0 })))
    ),
    corpusHashes:
      args.suite === 'frozen'
        ? {
            dev: hash(await readFile('evals/agent/dev.jsonl', 'utf8')),
            heldOut: hash(await readFile('evals/agent/held-out.jsonl', 'utf8'))
          }
        : args.suite === 'generalization-v1'
          ? {
              generalizationV1: hash(await readFile('evals/agent/generalization-v1.jsonl', 'utf8'))
            }
          : args.suite === 'step-budget-aggregation-v1'
            ? {
                stepBudgetAggregationV1: hash(
                  await readFile('evals/agent/step-budget-aggregation-v1.jsonl', 'utf8')
                )
              }
            : {
                presentationV1: hash(await readFile('evals/agent/presentation-v1.jsonl', 'utf8'))
              },
    selectedCaseIds: selected.map((item) => item.id),
    maxOutputTokens: 2048
  };
  await writeFile(
    path.join(auditRoot, 'experiment.json'),
    JSON.stringify(redactSecrets(experiment, secrets), null, 2)
  );
  const records: Array<CompletedRecord | FailedRecord> = [];
  for (let repetition = 1; repetition <= args.repeat; repetition += 1) {
    for (const testCase of selected) {
      for (const thinkingMode of args.modes) {
        const started = performance.now();
        try {
          const result = await runDataAgent(testCase.question, {
            model: models.get(thinkingMode)!,
            thinkingMode
          });
          const record = {
            thinkingMode,
            order: records.length + 1,
            caseId: testCase.id,
            repetition,
            latencyMs: Math.round(performance.now() - started),
            result,
            score: score(testCase, result)
          };
          records.push(record);
          await writeFile(
            path.join(auditRoot, `${testCase.id}-${thinkingMode}-${repetition}.json`),
            JSON.stringify(redactSecrets(record, secrets), null, 2)
          );
        } catch (error) {
          const record = {
            thinkingMode,
            order: records.length + 1,
            caseId: testCase.id,
            repetition,
            latencyMs: Math.round(performance.now() - started),
            error: error instanceof Error ? error.message : 'UNKNOWN_ERROR'
          };
          records.push(record);
          await writeFile(
            path.join(auditRoot, `${testCase.id}-${thinkingMode}-${repetition}.json`),
            JSON.stringify(redactSecrets(record, secrets), null, 2)
          );
        }
        console.log(
          `[${records.length}/${selected.length * args.repeat * args.modes.length}] ${testCase.id} ${thinkingMode}`
        );
      }
    }
  }
  const byMode = Object.fromEntries(
    args.modes.map((mode) => [
      mode,
      summarize(
        records.filter((item) => item.thinkingMode === mode),
        runId,
        selected.length,
        args.repeat
      )
    ])
  );
  const off = byMode.off;
  const low = byMode.low;
  const delta =
    off && low
      ? {
          operationArgumentRate:
            low.metrics.operationArgumentSubset.rate - off.metrics.operationArgumentSubset.rate,
          firstOperationRate:
            low.metrics.firstOperationAccuracy.rate - off.metrics.firstOperationAccuracy.rate,
          firstOperationArgumentRate:
            low.metrics.firstOperationArgumentAccuracy.rate -
            off.metrics.firstOperationArgumentAccuracy.rate,
          strictContractRate: low.metrics.strictContract.rate - off.metrics.strictContract.rate,
          forbiddenOperationAvoidanceRate:
            low.metrics.forbiddenOperationAvoided.rate - off.metrics.forbiddenOperationAvoided.rate,
          averageTokens:
            low.usage.averageTotalTokensPerAttempt - off.usage.averageTotalTokensPerAttempt,
          averageLatencyMs: low.latencyMs.average - off.latencyMs.average
        }
      : undefined;
  const summary = {
    runId,
    experiment,
    attempts: records.length,
    byMode,
    ...(delta ? { delta } : {})
  };
  await writeFile(
    path.join(auditRoot, 'summary.json'),
    JSON.stringify(redactSecrets(summary, secrets), null, 2)
  );
  console.log(JSON.stringify(redactSecrets(summary, secrets), null, 2));
}

function summarize(
  records: Array<CompletedRecord | FailedRecord>,
  runId: string,
  cases: number,
  repeat: number
) {
  const completed = records.filter((record): record is CompletedRecord => 'score' in record);
  const passed = completed.filter((record) => record.score.passed).length;
  const count = (key: keyof CompletedRecord['score']) =>
    completed.filter((record) => record.score[key] === true).length;
  const requiredEvidence = completed.filter(({ score: item }) => item.evidenceRequired);
  const requiredWarnings = completed.filter(({ score: item }) => item.warningRequired);
  const truncationRequired = completed.filter(({ score: item }) => item.truncationRequired);
  const unsupported = completed.filter(({ score: item }) => item.unsupported);
  const supported = completed.filter(({ score: item }) => item.supported);
  const presentationCases = completed.filter(
    ({ score: item }) => item.presentationInspection !== undefined
  );
  const firstEligible = completed.filter(({ score: item }) => item.firstOperationEligible);
  const ambiguityCases = completed.filter(({ score: item }) => item.ambiguityCase);
  const toolResultBytes = completed.flatMap(({ result }) =>
    result.trace.map(({ summary }) => summary.toolResultBytes)
  );
  const latencies = completed.map(({ latencyMs }) => latencyMs);
  const usage = completed.reduce(
    (total, { result }) => ({
      inputTokens: total.inputTokens + result.usage.inputTokens,
      outputTokens: total.outputTokens + result.usage.outputTokens,
      totalTokens: total.totalTokens + result.usage.totalTokens,
      cacheHitTokens: total.cacheHitTokens + (result.usage.cacheHitTokens ?? 0),
      cacheMissTokens: total.cacheMissTokens + (result.usage.cacheMissTokens ?? 0)
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0, cacheHitTokens: 0, cacheMissTokens: 0 }
  );
  const summary = {
    runId,
    cases,
    repeat,
    attempts: records.length,
    completed: completed.length,
    passed,
    passRate: completed.length ? passed / completed.length : 0,
    metrics: {
      firstOperationAccuracy: ratio(
        firstEligible.filter(({ score: item }) => item.firstOperation).length,
        firstEligible.length
      ),
      firstOperationArgumentAccuracy: ratio(
        firstEligible.filter(({ score: item }) => item.firstOperationArguments).length,
        firstEligible.length
      ),
      ambiguityHandling: ratio(
        ambiguityCases.filter(({ score: item }) => item.ambiguityHandled).length,
        ambiguityCases.length
      ),
      invalidToolCallCount: completed.reduce(
        (total, { score: item }) => total + item.invalidToolCallCount,
        0
      ),
      recoveryAfterInvalidCall: ratio(
        completed.reduce((total, { score: item }) => total + item.recoveryCount, 0),
        completed.reduce((total, { score: item }) => total + item.schemaInvalidCallCount, 0)
      ),
      strictContract: ratio(passed, completed.length),
      expectedOperationPresent: ratio(count('expectedOperations'), completed.length),
      forbiddenOperationAvoided: ratio(count('forbiddenOperations'), completed.length),
      operationArgumentSubset: ratio(count('operationArguments'), completed.length),
      goldFacts: ratio(count('facts'), completed.length),
      presentationBoundary: ratio(count('presentation'), completed.length),
      presentationTier1: ratio(
        presentationCases.filter(({ score: item }) => item.tier1).length,
        presentationCases.length
      ),
      presentationTier2: ratio(
        presentationCases.filter(({ score: item }) => item.tier2).length,
        presentationCases.length
      ),
      presentationTier3: ratio(
        presentationCases.filter(({ score: item }) => item.tier3).length,
        presentationCases.length
      ),
      internalTermLeakageCount: presentationCases.reduce(
        (total, { score: item }) =>
          total + (item.presentationInspection?.internalTerms.length ?? 0),
        0
      ),
      unnecessaryDetailHits: presentationCases.reduce(
        (total, { score: item }) =>
          total + (item.presentationInspection?.detailHits.unnecessary.length ?? 0),
        0
      ),
      materialLimitationsPreserved: ratio(
        presentationCases.filter(
          ({ score: item }) => item.presentationInspection?.materialLimitationsPreserved
        ).length,
        presentationCases.length
      ),
      duplicateLimitationsAvoided: ratio(
        presentationCases.filter(
          ({ score: item }) => item.presentationInspection?.duplicateLimitationsAvoided
        ).length,
        presentationCases.length
      ),
      scopeRestatementAvoided: ratio(
        presentationCases.filter(
          ({ score: item }) => item.presentationInspection?.scopeRestatementAvoided
        ).length,
        presentationCases.length
      ),
      conclusionFirst: ratio(
        presentationCases.filter(({ score: item }) => item.presentationInspection?.conclusionFirst)
          .length,
        presentationCases.length
      ),
      withinSoftSentenceTarget: ratio(
        presentationCases.filter(
          ({ score: item }) => item.presentationInspection?.withinSoftSentenceTarget
        ).length,
        presentationCases.length
      ),
      supportedGoldFacts: ratio(
        supported.filter(({ score: item }) => item.facts).length,
        supported.length
      ),
      requiredWarnings: ratio(
        requiredWarnings.filter(({ score: item }) => item.warnings).length,
        requiredWarnings.length
      ),
      requiredEvidence: ratio(
        requiredEvidence.filter(({ score: item }) => item.evidence).length,
        requiredEvidence.length
      ),
      invalidEvidenceIds: completed.reduce(
        (total, { result }) => total + result.invalidEvidenceIds.length,
        0
      ),
      structuredFinal: ratio(count('structuredFinal'), completed.length),
      stepLimitHit: ratio(count('hitStepLimit'), completed.length),
      averageToolCalls: average(completed.map(({ result }) => result.toolCalls)),
      averageModelSteps: average(completed.map(({ result }) => result.modelSteps)),
      goldAverageToolCalls: average(completed.map(({ score: item }) => item.goldToolCalls)),
      withinGoldPlusOne: ratio(count('withinGoldPlusOne'), completed.length),
      forbiddenCallCount: completed.reduce(
        (total, { score: item }) => total + item.forbiddenCallCount,
        0
      ),
      unnecessaryToolCalls: completed.reduce(
        (total, { score: item }) => total + item.unnecessaryToolCalls,
        0
      ),
      truncationPreservation: ratio(
        truncationRequired.filter(({ score: item }) => item.truncationPreserved).length,
        truncationRequired.length
      ),
      truncationModelProvided: ratio(
        truncationRequired.filter(({ score: item }) => item.truncationModelProvided).length,
        truncationRequired.length
      ),
      truncationRuntimeEnforced: ratio(
        truncationRequired.filter(({ score: item }) => item.truncationRuntimeEnforced).length,
        truncationRequired.length
      ),
      unsupportedAbstention: ratio(
        unsupported.filter(({ score: item }) => item.abstained).length,
        unsupported.length
      )
    },
    latencyMs: {
      average: average(latencies),
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95)
    },
    toolResults: {
      calls: toolResultBytes.length,
      totalBytes: toolResultBytes.reduce((sum, value) => sum + value, 0),
      averageBytes: average(toolResultBytes),
      p50Bytes: percentile(toolResultBytes, 0.5),
      p95Bytes: percentile(toolResultBytes, 0.95),
      perAttempt: {
        averageBytes: average(
          completed.map(({ result }) =>
            result.trace.reduce((sum, entry) => sum + entry.summary.toolResultBytes, 0)
          )
        ),
        p50Bytes: percentile(
          completed.map(({ result }) =>
            result.trace.reduce((sum, entry) => sum + entry.summary.toolResultBytes, 0)
          ),
          0.5
        ),
        p95Bytes: percentile(
          completed.map(({ result }) =>
            result.trace.reduce((sum, entry) => sum + entry.summary.toolResultBytes, 0)
          ),
          0.95
        )
      }
    },
    usage: {
      ...usage,
      reasoningTokens: completed.some(({ result }) => result.usage.reasoningTokens !== undefined)
        ? completed.reduce((total, { result }) => total + (result.usage.reasoningTokens ?? 0), 0)
        : 'not separately reported',
      averageTotalTokensPerAttempt: completed.length ? usage.totalTokens / completed.length : 0
    }
  };
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error: unknown) => {
    console.error(
      redactSecrets(error instanceof Error ? error.message : 'Agent eval failed', [
        process.env.DEEPSEEK_API_KEY ?? ''
      ])
    );
    process.exitCode = 1;
  });
