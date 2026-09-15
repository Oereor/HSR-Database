import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { evalCaseSchema, isExplicitAbstention, type EvalCase } from '../../src/lib/agent/eval.js';
import { runDataAgent, type RunAgentResult } from '../../src/lib/server/agent/runtime.js';
import { createDeepSeekClientFromEnv } from '../../src/lib/server/agent/providers/deepseek.js';

type Split = 'dev' | 'held-out' | 'all';

function parseArguments(args: string[]) {
  const valueAfter = (flag: string) => {
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
  return { model: args.includes('--model'), split, repeat, tag: valueAfter('--tag'), caseIds };
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

function score(testCase: EvalCase, result: RunAgentResult) {
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
  return {
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
  caseId: string;
  repetition: number;
  latencyMs: number;
  result: RunAgentResult;
  score: ReturnType<typeof score>;
};

type FailedRecord = {
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

  const client = createDeepSeekClientFromEnv();
  const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const auditRoot = path.join(process.cwd(), 'data', 'audit', 'agent', runId);
  await mkdir(auditRoot, { recursive: true });
  const records: Array<CompletedRecord | FailedRecord> = [];
  for (let repetition = 1; repetition <= args.repeat; repetition += 1) {
    for (const testCase of selected) {
      const started = performance.now();
      try {
        const result = await runDataAgent(testCase.question, { client });
        const record = {
          caseId: testCase.id,
          repetition,
          latencyMs: Math.round(performance.now() - started),
          result,
          score: score(testCase, result)
        };
        records.push(record);
        await writeFile(
          path.join(auditRoot, `${testCase.id}-${repetition}.json`),
          JSON.stringify(record, null, 2)
        );
      } catch (error) {
        const record = {
          caseId: testCase.id,
          repetition,
          latencyMs: Math.round(performance.now() - started),
          error: error instanceof Error ? error.message : 'UNKNOWN_ERROR'
        };
        records.push(record);
        await writeFile(
          path.join(auditRoot, `${testCase.id}-${repetition}.json`),
          JSON.stringify(record, null, 2)
        );
      }
    }
  }
  const completed = records.filter((record): record is CompletedRecord => 'score' in record);
  const passed = completed.filter((record) => record.score.passed).length;
  const count = (key: keyof CompletedRecord['score']) =>
    completed.filter((record) => record.score[key] === true).length;
  const requiredEvidence = completed.filter(({ score: item }) => item.evidenceRequired);
  const requiredWarnings = completed.filter(({ score: item }) => item.warningRequired);
  const truncationRequired = completed.filter(({ score: item }) => item.truncationRequired);
  const unsupported = completed.filter(({ score: item }) => item.unsupported);
  const supported = completed.filter(({ score: item }) => item.supported);
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
    cases: selected.length,
    repeat: args.repeat,
    attempts: records.length,
    completed: completed.length,
    passed,
    passRate: completed.length ? passed / completed.length : 0,
    metrics: {
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
      averageTotalTokensPerAttempt: completed.length ? usage.totalTokens / completed.length : 0
    }
  };
  await writeFile(path.join(auditRoot, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Agent eval failed');
  process.exitCode = 1;
});
