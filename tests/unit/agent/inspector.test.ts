import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatInspection,
  parseInspectorArguments,
  redactSecrets,
  saveInspection,
  type Inspection
} from '../../../scripts/agent/inspector';

const inspection: Inspection = {
  kind: 'MANUAL / NON-EVAL',
  question: '测试',
  thinkingMode: 'low',
  latencyMs: 12,
  result: {
    answer: { answer: '完成', evidenceIds: [], limitations: [] },
    invalidEvidenceIds: [],
    turns: 1,
    toolCalls: 0,
    usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    trace: [],
    modelTrace: [
      {
        turn: 1,
        latencyMs: 10,
        reasoningPresent: true,
        reasoningChars: 20,
        metadata: { finishReason: 'stop' }
      }
    ],
    finalization: {
      retryUsed: false,
      contractViolations: [],
      evidenceDeduplicated: 0,
      evidenceCapped: 0,
      limitationsDeduplicated: 0,
      limitationsCapped: 0
    },
    structuredAnswer: true,
    hitTurnLimit: false,
    truncationDisclosure: { required: false, modelProvided: false, runtimeEnforced: false }
  }
};

describe('Agent Inspector', () => {
  it('解析 off/low、verbose、save 与分隔后的问题', () => {
    expect(
      parseInspectorArguments(['--thinking=low', '--verbose', '--save', '--', '自定义问题'])
    ).toEqual({ thinkingMode: 'low', verbose: true, save: true, question: '自定义问题' });
    expect(parseInspectorArguments(['问题']).thinkingMode).toBe('off');
  });
  it('默认/verbose trace 都不含 reasoning 正文或 secret', () => {
    const output = formatInspection(inspection, true, ['secret-value']);
    expect(output).toContain('Reasoning present: true; chars: 20');
    expect(output).not.toContain('secret-value');
    expect(redactSecrets('Authorization: Bearer secret-value', ['secret-value'])).not.toContain(
      'secret-value'
    );
  });
  it('manual audit 固定在隔离目录且不触碰 eval corpus', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agent-inspector-'));
    const before = await readFile(path.join(process.cwd(), 'evals/agent/dev.jsonl'), 'utf8');
    const file = await saveInspection(inspection, root);
    expect(file).toContain(path.join('data', 'audit', 'agent', 'manual'));
    expect(await readFile(path.join(process.cwd(), 'evals/agent/dev.jsonl'), 'utf8')).toBe(before);
    await rm(root, { recursive: true, force: true });
  });
});
