import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { evalCaseSchema, isExplicitAbstention, type EvalCase } from '../../src/lib/agent/eval.js';
import {
  DATA_AGENT_SYSTEM_PROMPT,
  runDataAgent,
  type RunAgentResult
} from '../../src/lib/server/agent/runtime.js';
import { type AgentThinkingMode } from '../../src/lib/agent/contracts.js';
import { AGENT_TOOL_DEFINITIONS } from '../../src/lib/server/agent/tools.js';
import { getAgentDataVersion } from '../../src/lib/server/agent/data-version.js';
import { redactSecrets } from './inspector.js';
import { createDeepSeekClientFromEnv } from '../../src/lib/server/agent/providers/deepseek.js';

type Split = 'dev' | 'held-out' | 'all';

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
  return {
    model: args.includes('--model'),
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

export function score(testCase: EvalCase, result: RunAgentResult) {
  const tools = result.trace.map(({ tool }) => tool);
  const warnings = new Set(result.trace.flatMap(({ summary }) => summary.warnings ?? []));
  const expectedTools = testCase.gold.expectedTools.every((tool) => tools.includes(tool));
  const forbiddenTools = testCase.gold.forbiddenTools.every((tool) => !tools.includes(tool));
  const keyArguments = Object.entries(testCase.gold.keyArguments).every(([tool, expected]) =>
    result.trace.some((entry) => entry.tool === tool && isSubset(expected, entry.validatedArgs))
  );
  const facts = testCase.gold.facts.every((fact) => result.answer.answer.includes(fact));
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
  const withinGoldPlusOne = result.toolCalls <= testCase.gold.expectedTools.length + 1;
  const firstExpected = testCase.gold.expectedTools[0];
  const first = result.trace.find((entry) => entry.errorCode !== 'TOOL_CALL_LIMIT_EXCEEDED');
  const schemaInvalid = result.trace.filter((entry) =>
    ['INVALID_JSON', 'INVALID_ARGUMENTS'].includes(entry.errorCode ?? '')
  );
  const recovered = schemaInvalid.filter((entry) => {
    const nextTurn = result.modelTrace.find((item) => item.turn > entry.turn);
    const next = nextTurn && result.trace.find((item) => item.turn === nextTurn.turn);
    return next?.tool === entry.tool && next.ok;
  }).length;
  return {
    firstToolEligible: !!firstExpected,
    firstToolName: !!firstExpected && first?.tool === firstExpected,
    firstToolKeyArguments:
      !!firstExpected &&
      first?.tool === firstExpected &&
      isSubset(testCase.gold.keyArguments[firstExpected], first.validatedArgs),
    invalidToolCallCount: result.trace.filter((entry) =>
      ['UNKNOWN_TOOL', 'INVALID_JSON', 'INVALID_ARGUMENTS'].includes(entry.errorCode ?? '')
    ).length,
    schemaInvalidCallCount: schemaInvalid.length,
    recoveryCount: recovered,
    expectedTools,
    forbiddenTools,
    keyArguments,
    facts,
    warnings: warningMatch,
    evidence,
    abstained,
    structuredFinal: result.structuredAnswer,
    hitTurnLimit: result.hitTurnLimit,
    truncationRequired: result.truncationDisclosure.required,
    truncationPreserved,
    truncationModelProvided: result.truncationDisclosure.modelProvided,
    truncationRuntimeEnforced: result.truncationDisclosure.runtimeEnforced,
    evidenceRequired: testCase.gold.evidenceRequired,
    warningRequired: testCase.gold.warnings.length > 0,
    unsupported: testCase.gold.answerability === 'unsupported',
    supported: testCase.gold.answerability === 'supported',
    goldToolCalls: testCase.gold.expectedTools.length,
    withinGoldPlusOne,
    forbiddenCallCount: result.trace.filter(({ tool }) =>
      testCase.gold.forbiddenTools.includes(tool as never)
    ).length,
    unnecessaryToolCalls:
      testCase.gold.answerability === 'unsupported'
        ? result.toolCalls
        : result.trace.filter(({ tool }) => testCase.gold.forbiddenTools.includes(tool as never))
            .length,
    passed:
      expectedTools &&
      forbiddenTools &&
      keyArguments &&
      facts &&
      warningMatch &&
      evidence &&
      abstained &&
      result.structuredAnswer &&
      truncationPreserved
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
  const corpus = await loadEvalCorpus();
  const selectedSplit =
    args.split === 'dev'
      ? corpus.dev
      : args.split === 'held-out'
        ? corpus.heldOut
        : [...corpus.dev, ...corpus.heldOut];
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
    `Validated ${corpus.dev.length} dev + ${corpus.heldOut.length} held-out cases; selected ${selected.length}.`
  );
  if (!args.model) return;

  const clients = new Map(
    args.modes.map((mode) => [mode, createDeepSeekClientFromEnv(process.env, undefined, mode)])
  );
  const secrets = [process.env.DEEPSEEK_API_KEY ?? ''];
  const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const auditRoot = path.join(process.cwd(), 'data', 'audit', 'agent', runId);
  await mkdir(auditRoot, { recursive: true });
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const experiment = {
    modes: args.modes,
    order: `repetition → corpus case → ${args.modes.join(' then ')}`,
    model: process.env.DEEPSEEK_MODEL ?? 'deepseek-flash',
    dataVersion: await getAgentDataVersion(),
    promptHash: hash(DATA_AGENT_SYSTEM_PROMPT),
    toolsHash: hash(JSON.stringify(AGENT_TOOL_DEFINITIONS)),
    corpusHashes: {
      dev: hash(await readFile('evals/agent/dev.jsonl', 'utf8')),
      heldOut: hash(await readFile('evals/agent/held-out.jsonl', 'utf8'))
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
            client: clients.get(thinkingMode)!
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
          keyArgumentRate: low.metrics.keyArgumentSubset.rate - off.metrics.keyArgumentSubset.rate,
          firstToolNameRate:
            low.metrics.firstToolNameAccuracy.rate - off.metrics.firstToolNameAccuracy.rate,
          firstToolKeyArgumentRate:
            low.metrics.firstToolKeyArgumentAccuracy.rate -
            off.metrics.firstToolKeyArgumentAccuracy.rate,
          strictContractRate: low.metrics.strictContract.rate - off.metrics.strictContract.rate,
          forbiddenToolAvoidanceRate:
            low.metrics.forbiddenToolAvoided.rate - off.metrics.forbiddenToolAvoided.rate,
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
  const firstEligible = completed.filter(({ score: item }) => item.firstToolEligible);
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
      firstToolNameAccuracy: ratio(
        firstEligible.filter(({ score: item }) => item.firstToolName).length,
        firstEligible.length
      ),
      firstToolKeyArgumentAccuracy: ratio(
        firstEligible.filter(({ score: item }) => item.firstToolKeyArguments).length,
        firstEligible.length
      ),
      invalidToolCallCount: completed.reduce(
        (total, { score: item }) => total + item.invalidToolCallCount,
        0
      ),
      recoveryAfterInvalidCall: ratio(
        completed.reduce((total, { score: item }) => total + item.recoveryCount, 0),
        completed.reduce((total, { score: item }) => total + item.schemaInvalidCallCount, 0)
      ),
      finalizationRetries: completed.filter(({ result }) => result.finalization.retryUsed).length,
      strictContract: ratio(passed, completed.length),
      expectedToolPresent: ratio(count('expectedTools'), completed.length),
      forbiddenToolAvoided: ratio(count('forbiddenTools'), completed.length),
      keyArgumentSubset: ratio(count('keyArguments'), completed.length),
      goldFacts: ratio(count('facts'), completed.length),
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
      turnLimitHit: ratio(count('hitTurnLimit'), completed.length),
      averageToolCalls: average(completed.map(({ result }) => result.toolCalls)),
      averageTurns: average(completed.map(({ result }) => result.turns)),
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
