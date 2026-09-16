import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LanguageModel } from 'ai';
import { agentThinkingModeSchema, type AgentThinkingMode } from '../../src/lib/agent/contracts.js';
import { runDataAgent, type RunAgentResult } from '../../src/lib/server/agent/runtime.js';

export function parseInspectorArguments(args: string[]) {
  let thinkingMode: AgentThinkingMode = 'off';
  let verbose = false;
  let save = false;
  let positional = false;
  const question: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--' && !positional) {
      positional = true;
      continue;
    }
    if (!positional && (argument === '--thinking' || argument.startsWith('--thinking='))) {
      const value =
        argument === '--thinking' ? args[++index] : argument.slice('--thinking='.length);
      const parsed = agentThinkingModeSchema.safeParse(value);
      if (!parsed.success) throw new Error('--thinking 必须是 off 或 low');
      thinkingMode = parsed.data;
    } else if (!positional && argument === '--verbose') verbose = true;
    else if (!positional && argument === '--save') save = true;
    else if (!positional && argument.startsWith('--')) throw new Error('Unknown Inspector option');
    else question.push(argument);
  }
  return { thinkingMode, verbose, save, question: question.join(' ').trim() };
}

// Defense in depth for user/provider-controlled strings; never serialize environment or client.
export function redactSecrets(value: unknown, secrets: readonly string[] = []): unknown {
  if (typeof value === 'string') {
    let result = value
      .replace(/\b(?:Authorization\s*[:=]\s*)?(?:Bearer\s+)[^\s"']+/gi, '[REDACTED]')
      .replace(/\bDEEPSEEK_API_KEY\s*[:=]\s*[^\s"']+/gi, '[REDACTED]');
    for (const secret of secrets.filter(Boolean)) result = result.split(secret).join('[REDACTED]');
    return result;
  }
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, secrets));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /authorization|api[-_]?key|^(?:process\.)?env(?:ironment)?$/i.test(key)
          ? '[REDACTED]'
          : redactSecrets(item, secrets)
      ])
    );
  return value;
}

export interface Inspection {
  kind: 'MANUAL / NON-EVAL';
  question: string;
  thinkingMode: AgentThinkingMode;
  latencyMs: number;
  result: RunAgentResult;
}

export async function inspectQuestion(
  question: string,
  thinkingMode: AgentThinkingMode,
  model?: LanguageModel
): Promise<Inspection> {
  const started = performance.now();
  // Each invocation creates a new runtime conversation; interactive sessions have no memory.
  const result = await runDataAgent(question, { model, thinkingMode, traceDetails: true });
  return {
    kind: 'MANUAL / NON-EVAL',
    question,
    thinkingMode,
    latencyMs: Math.round(performance.now() - started),
    result
  };
}

export function formatInspection(
  inspection: Inspection,
  verbose = false,
  secrets: readonly string[] = []
): string {
  const { result } = inspection;
  const lines = [
    inspection.kind,
    `Question: ${inspection.question}`,
    `Thinking: ${inspection.thinkingMode}`
  ];
  for (const turn of result.modelTrace) {
    lines.push(
      '',
      `Turn ${turn.turn} (model ${turn.latencyMs} ms)`,
      `  Reasoning present: ${turn.reasoningPresent}; chars: ${turn.reasoningChars}`
    );
    if (verbose && turn.metadata) lines.push(`  Provider: ${JSON.stringify(turn.metadata)}`);
    for (const entry of result.trace.filter((item) => item.turn === turn.turn)) {
      lines.push(
        `  Tool: ${entry.tool} (${entry.ok ? 'ok' : (entry.errorCode ?? 'failed')})`,
        `  Validated arguments: ${JSON.stringify(entry.validatedArgs ?? null)}`,
        `  Result summary: ${JSON.stringify(entry.summary)}`,
        `  Tool latency: ${entry.latencyMs} ms`
      );
      if (verbose && entry.details) lines.push(`  Details: ${JSON.stringify(entry.details)}`);
    }
  }
  lines.push(
    '',
    'Final',
    JSON.stringify(result.answer, null, 2),
    '',
    'Metrics',
    JSON.stringify(
      {
        modelTurns: result.turns,
        toolCalls: result.toolCalls,
        usage: result.usage,
        reasoningTokens: result.usage.reasoningTokens ?? 'not separately reported',
        toolResultBytes: result.trace.reduce(
          (total, entry) => total + entry.summary.toolResultBytes,
          0
        ),
        totalLatencyMs: inspection.latencyMs,
        structuredFinal: result.structuredAnswer,
        invalidEvidenceCount: result.invalidEvidenceIds.length,
        hitTurnLimit: result.hitTurnLimit,
        answerNormalization: result.answerNormalization,
        truncationDisclosure: result.truncationDisclosure
      },
      null,
      2
    )
  );
  return String(redactSecrets(lines.join('\n'), secrets));
}

export async function saveInspection(
  inspection: Inspection,
  root = process.cwd(),
  secrets: readonly string[] = []
): Promise<string> {
  const auditRoot = path.join(root, 'data', 'audit', 'agent', 'manual');
  await mkdir(auditRoot, { recursive: true });
  const hash = createHash('sha256').update(inspection.question).digest('hex').slice(0, 12);
  const file = path.join(
    auditRoot,
    `${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${hash}.json`
  );
  await writeFile(file, JSON.stringify(redactSecrets(inspection, secrets), null, 2), {
    flag: 'wx'
  });
  return file;
}
