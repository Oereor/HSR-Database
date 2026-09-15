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
  return { model: args.includes('--model'), split, repeat, tag: valueAfter('--tag') };
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
  return {
    expectedTools,
    forbiddenTools,
    keyArguments,
    facts,
    warnings: warningMatch,
    evidence,
    abstained,
    passed:
      expectedTools &&
      forbiddenTools &&
      keyArguments &&
      facts &&
      warningMatch &&
      evidence &&
      abstained
  };
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
  const tagged = args.tag
    ? selectedSplit.filter(({ tags }) => tags.includes(args.tag!))
    : selectedSplit;
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
  const records = [];
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
  const completed = records.filter((record) => 'score' in record);
  const passed = completed.filter((record) => record.score.passed).length;
  const summary = {
    runId,
    cases: selected.length,
    repeat: args.repeat,
    attempts: records.length,
    completed: completed.length,
    passed,
    passRate: completed.length ? passed / completed.length : 0
  };
  await writeFile(path.join(auditRoot, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Agent eval failed');
  process.exitCode = 1;
});
