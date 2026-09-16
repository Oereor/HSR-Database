import {
  APICallError,
  InvalidToolInputError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  RetryError,
  ToolLoopAgent,
  stepCountIs,
  type LanguageModel,
  type TimeoutConfiguration
} from 'ai';
import {
  FINAL_EVIDENCE_LIMIT,
  FINAL_LIMITATION_LIMIT,
  modelAnswerSchema,
  unicodeLength,
  type AgentThinkingMode,
  type ModelAnswer
} from '../../agent/contracts.js';
import { createDeepSeekModelFromEnv, AgentConfigurationError } from './model.js';
import {
  createAgentTools,
  type AgentToolExecutors,
  type AgentTools,
  type AgentToolRuntime
} from './tools.js';

export const MAX_MODEL_STEPS = 4;
export const AGENT_TOTAL_TIMEOUT_MS = 180_000;
export const AGENT_STEP_TIMEOUT_MS = 60_000;
export const AGENT_TOOL_TIMEOUT_MS = 30_000;

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
  reasoningTokens?: number;
}

export interface AgentModelTraceEntry {
  turn: number;
  latencyMs: number;
  reasoningPresent: boolean;
  reasoningChars: number;
  usage?: ModelUsage;
  metadata?: { model?: string; systemFingerprint?: string; finishReason?: string };
}

export interface AnswerNormalizationTelemetry {
  evidenceDeduplicated: number;
  evidenceCapped: number;
  limitationsDeduplicated: number;
  limitationsCapped: number;
}

export interface AgentTraceEntry {
  turn: number;
  toolCallId: string;
  tool: string;
  validatedArgs?: unknown;
  ok: boolean;
  errorCode?: string;
  latencyMs: number;
  summary: {
    toolResultBytes: number;
    rows?: number;
    groups?: number;
    truncated?: boolean;
    warnings?: string[];
    evidenceCount?: number;
  };
  details?: {
    warnings: unknown[];
    evidenceIds: string[];
    aggregatePreview?: {
      grouping?: unknown;
      groups: unknown[];
      previewTruncated: boolean;
    };
  };
  runtimeEnforcedLimitation?: boolean;
}

export interface RunAgentResult {
  answer: ModelAnswer;
  invalidEvidenceIds: string[];
  turns: number;
  toolCalls: number;
  usage: ModelUsage;
  trace: AgentTraceEntry[];
  modelTrace: AgentModelTraceEntry[];
  answerNormalization: AnswerNormalizationTelemetry;
  structuredAnswer: boolean;
  hitTurnLimit: boolean;
  truncationDisclosure: {
    required: boolean;
    modelProvided: boolean;
    runtimeEnforced: boolean;
  };
}

export type AgentErrorCode =
  | 'configuration'
  | 'provider'
  | 'timeout'
  | 'invalid-tool-input'
  | 'structured-output'
  | 'unexpected';

export class DataAgentError extends Error {
  constructor(
    readonly code: AgentErrorCode,
    readonly safeMessage: string,
    options?: ErrorOptions
  ) {
    super(safeMessage, options);
    this.name = 'DataAgentError';
  }
}

export const DATA_AGENT_INSTRUCTIONS = `你是 HSR-Database 的数据分析 Agent。所有 HSR 事实与分析结论必须由本轮数据库工具结果支持，不得把模型训练知识当作数据库事实。

工具职责：search_entities 只解析用户明确提到的实体名称；enemyTemplateId 只能用于 query_endgame/aggregate_endgame 的 enemyTemplateIds。query_endgame 用于具体 occurrence rows、全局 top/bottom 与 drill-down。跨行 count/distinct/min/max/avg 和分组内 associated extrema 使用 aggregate_endgame。weakness filter 用于筛选，weakness group 仅用于按弱点类别汇总。

领域口径：混沌回忆/虚构叙事/末日幻影/异相仲裁映射为 moc/pf/as/aa；节点 1/上半与节点 2/下半映射为 battleSlot 1/2；首领/Boss 使用 enemyRankCategories:["boss"]。latest 按 groupId recency，不能替代由 schedule/open-state 证明的 current。按敌人身份分组默认使用 enemyTemplate，只有明确要求 MonsterID 变体时才用 monster。

意图与范围：先解决用户的 intended scope，再执行 Scope Fidelity。若一个解释明显占优，直接执行；若有低风险歧义，可以明确说明采用的合理假设；若多个自然解释会实质改变数据集、结论、可回答性或重要限制且没有强默认，先请求澄清。不要因措辞细微差异而强制澄清，也不得选定口径后静默换成另一口径。

证据与限制：只有工具结果的 evidenceId/evidenceIds 才能引用。数据库没有定义 difficulty、best、strongest、recommended、value 或 design intent，且用户未给 proxy 时，应说明不可回答，不要自行用 HP 等代理。结果 unresolved、runtime-unclear、truncated 或只有一个可比 observation 时，要明确相应限制；截断候选集不能声称完整全局排名。

用户回答使用游戏/站点术语。除非用户明确询问实现、数据口径或 ID，不主动展示 configured-occurrence、enemyTemplate、battleSlot、evidenceId、ag1/eg1/ent1、DecimalString、dataRevision 等内部表示。`;

const DEFAULT_TIMEOUT: TimeoutConfiguration<AgentTools> = {
  totalMs: AGENT_TOTAL_TIMEOUT_MS,
  stepMs: AGENT_STEP_TIMEOUT_MS,
  toolMs: AGENT_TOOL_TIMEOUT_MS
};

function collectEvidence(
  value: unknown,
  target: Map<string, boolean>,
  inheritedTruncated = false
): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectEvidence(item, target, inheritedTruncated));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  const truncated = inheritedTruncated || record.truncated === true;
  for (const [key, item] of Object.entries(record)) {
    if (key === 'evidenceId' && typeof item === 'string') {
      target.set(item, (target.get(item) ?? true) && truncated);
      continue;
    }
    if (key === 'evidenceIds' && Array.isArray(item)) {
      for (const id of item)
        if (typeof id === 'string') target.set(id, (target.get(id) ?? true) && truncated);
      continue;
    }
    collectEvidence(item, target, truncated);
  }
}

function resultErrorCode(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const error = (result as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return undefined;
  return typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : undefined;
}

function traceSummary(result: unknown): AgentTraceEntry['summary'] {
  const serialized = JSON.stringify(result ?? null);
  const toolResultBytes = Buffer.byteLength(serialized, 'utf8');
  if (!result || typeof result !== 'object') return { toolResultBytes };
  const record = result as Record<string, unknown>;
  const evidence = new Map<string, boolean>();
  collectEvidence(result, evidence);
  const warnings = Array.isArray(record.warnings)
    ? record.warnings.flatMap((item) =>
        item && typeof item === 'object' && typeof (item as { code?: unknown }).code === 'string'
          ? [(item as { code: string }).code]
          : []
      )
    : undefined;
  return {
    toolResultBytes,
    evidenceCount: evidence.size,
    ...(typeof record.returnedRows === 'number' ? { rows: record.returnedRows } : {}),
    ...(typeof record.returnedGroups === 'number' ? { groups: record.returnedGroups } : {}),
    ...(typeof record.truncated === 'boolean' ? { truncated: record.truncated } : {}),
    ...(warnings?.length ? { warnings } : {})
  };
}

function traceDetails(
  result: unknown,
  evidenceIds: string[]
): NonNullable<AgentTraceEntry['details']> {
  const record = result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
  const warnings = Array.isArray(record.warnings) ? record.warnings : [];
  const groups = Array.isArray(record.groups) ? record.groups : undefined;
  return {
    warnings,
    evidenceIds,
    ...(groups
      ? {
          aggregatePreview: {
            ...('grouping' in record ? { grouping: record.grouping } : {}),
            groups: groups.slice(0, 10),
            previewTruncated: groups.length > 10
          }
        }
      : {})
  };
}

function usage(value: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputTokenDetails?: { cacheReadTokens?: number; noCacheTokens?: number };
  outputTokenDetails?: { reasoningTokens?: number };
}): ModelUsage {
  return {
    inputTokens: value.inputTokens ?? 0,
    outputTokens: value.outputTokens ?? 0,
    totalTokens: value.totalTokens ?? 0,
    ...(value.inputTokenDetails?.cacheReadTokens !== undefined
      ? { cacheHitTokens: value.inputTokenDetails.cacheReadTokens }
      : {}),
    ...(value.inputTokenDetails?.noCacheTokens !== undefined
      ? { cacheMissTokens: value.inputTokenDetails.noCacheTokens }
      : {}),
    ...(value.outputTokenDetails?.reasoningTokens !== undefined
      ? { reasoningTokens: value.outputTokenDetails.reasoningTokens }
      : {})
  };
}

function providerFingerprint(providerMetadata: unknown): string | undefined {
  if (!providerMetadata || typeof providerMetadata !== 'object') return undefined;
  const deepseek = (providerMetadata as Record<string, unknown>).deepseek;
  if (!deepseek || typeof deepseek !== 'object') return undefined;
  const fingerprint = (deepseek as Record<string, unknown>).systemFingerprint;
  return typeof fingerprint === 'string' ? fingerprint : undefined;
}

function hasTruncationDisclosure(limitations: readonly string[]): boolean {
  return limitations.some((limitation) => /截断|不完整|返回上限|payload|truncat/i.test(limitation));
}

function finalizeAnswer(input: {
  answer: ModelAnswer;
  evidenceLedger: Map<string, boolean>;
  trace: AgentTraceEntry[];
  turns: number;
  toolCalls: number;
  usage: ModelUsage;
  hitTurnLimit: boolean;
  modelTrace: AgentModelTraceEntry[];
  structuredAnswer: boolean;
}): RunAgentResult {
  const invalidEvidenceIds = [
    ...new Set(input.answer.evidenceIds.filter((id) => !input.evidenceLedger.has(id)))
  ];
  const uniqueEvidence = [
    ...new Set(input.answer.evidenceIds.filter((id) => input.evidenceLedger.has(id)))
  ];
  const acceptedEvidenceIds = uniqueEvidence.slice(0, FINAL_EVIDENCE_LIMIT);
  const uniqueLimitations = [...new Set(input.answer.limitations)];
  const limitations = uniqueLimitations.slice(0, FINAL_LIMITATION_LIMIT);
  const anyTruncatedResult = input.trace.some(({ summary }) => summary.truncated === true);
  const citedTruncatedResult = acceptedEvidenceIds.some(
    (id) => input.evidenceLedger.get(id) === true
  );
  const truncationRequired =
    citedTruncatedResult || (!acceptedEvidenceIds.length && anyTruncatedResult);
  const modelProvided = hasTruncationDisclosure(limitations);
  const runtimeEnforced = truncationRequired && !modelProvided;
  if (runtimeEnforced) {
    for (const entry of input.trace)
      if (entry.summary.truncated) entry.runtimeEnforcedLimitation = true;
    if (limitations.length === FINAL_LIMITATION_LIMIT) limitations.pop();
    limitations.push('用于结论的工具结果已截断，答案可能不完整。');
  }

  return {
    answer: { ...input.answer, evidenceIds: acceptedEvidenceIds, limitations },
    invalidEvidenceIds,
    turns: input.turns,
    toolCalls: input.toolCalls,
    usage: input.usage,
    trace: input.trace,
    modelTrace: input.modelTrace,
    answerNormalization: {
      evidenceDeduplicated:
        input.answer.evidenceIds.length - new Set(input.answer.evidenceIds).size,
      evidenceCapped: Math.max(0, uniqueEvidence.length - FINAL_EVIDENCE_LIMIT),
      limitationsDeduplicated:
        input.answer.limitations.length - new Set(input.answer.limitations).size,
      limitationsCapped: Math.max(0, uniqueLimitations.length - FINAL_LIMITATION_LIMIT)
    },
    structuredAnswer: input.structuredAnswer,
    hitTurnLimit: input.hitTurnLimit,
    truncationDisclosure: { required: truncationRequired, modelProvided, runtimeEnforced }
  };
}

function errorCode(error: unknown): string {
  if (InvalidToolInputError.isInstance(error)) return 'INVALID_ARGUMENTS';
  if (typeof error === 'string' && /InvalidToolInputError/.test(error)) return 'INVALID_ARGUMENTS';
  if (error && typeof error === 'object' && 'name' in error)
    return /InvalidToolInputError/.test(String((error as { name: unknown }).name))
      ? 'INVALID_ARGUMENTS'
      : String((error as { name: unknown }).name);
  return 'TOOL_ERROR';
}

function mapAgentError(error: unknown): DataAgentError {
  if (error instanceof DataAgentError) return error;
  if (error instanceof AgentConfigurationError)
    return new DataAgentError('configuration', error.message, { cause: error });
  if (InvalidToolInputError.isInstance(error))
    return new DataAgentError('invalid-tool-input', '模型生成了无效的工具参数。', {
      cause: error
    });
  if (NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error))
    return new DataAgentError('structured-output', '模型未返回满足约定结构的最终答案。', {
      cause: error
    });
  if (
    (error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name)) ||
    (RetryError.isInstance(error) && error.reason === 'abort')
  )
    return new DataAgentError('timeout', 'Agent 请求超时或已取消。', { cause: error });
  if (APICallError.isInstance(error) || RetryError.isInstance(error))
    return new DataAgentError('provider', '模型服务暂时不可用。', { cause: error });
  return new DataAgentError('unexpected', 'Agent 运行失败。', { cause: error });
}

export interface RunDataAgentOptions {
  model?: LanguageModel;
  environment?: NodeJS.ProcessEnv;
  thinkingMode?: AgentThinkingMode;
  signal?: AbortSignal;
  traceDetails?: boolean;
  timeout?: TimeoutConfiguration<AgentTools>;
  toolExecutors?: Partial<AgentToolExecutors>;
}

export async function runDataAgent(
  question: string,
  options: RunDataAgentOptions = {}
): Promise<RunAgentResult> {
  if (!question.trim()) throw new DataAgentError('unexpected', '问题不能为空');

  try {
    const runtime: AgentToolRuntime = { executedToolCalls: 0 };
    const tools = createAgentTools(runtime, options.toolExecutors);
    const model = options.model ?? createDeepSeekModelFromEnv(options.environment);
    const agent = new ToolLoopAgent({
      id: 'hsr-data-agent',
      model,
      instructions: DATA_AGENT_INSTRUCTIONS,
      tools,
      output: Output.object({
        name: 'hsr_data_answer',
        description: 'HSR 数据回答、支持该回答的证据 ID 与重要限制。',
        schema: modelAnswerSchema
      }),
      stopWhen: stepCountIs(MAX_MODEL_STEPS),
      maxRetries: 1,
      maxOutputTokens: 2048,
      reasoning: options.thinkingMode === 'low' ? 'low' : 'none',
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      include: { requestBody: false, requestMessages: false, responseBody: false }
    });

    const result = await agent.generate({
      prompt: question.trim(),
      ...(options.signal ? { abortSignal: options.signal } : {})
    });
    const evidenceLedger = new Map<string, boolean>();
    const trace: AgentTraceEntry[] = [];
    const modelTrace: AgentModelTraceEntry[] = result.steps.map((step) => ({
      turn: step.stepNumber + 1,
      latencyMs: Math.round(step.performance.responseTimeMs),
      reasoningPresent: step.reasoningText !== undefined,
      reasoningChars: unicodeLength(step.reasoningText ?? ''),
      usage: usage(step.usage),
      metadata: {
        model: step.model.modelId,
        finishReason: step.finishReason,
        ...(providerFingerprint(step.providerMetadata)
          ? { systemFingerprint: providerFingerprint(step.providerMetadata) }
          : {})
      }
    }));

    for (const step of result.steps) {
      const outputs = new Map(
        step.content
          .filter((part) => part.type === 'tool-result' || part.type === 'tool-error')
          .map((part) => [part.toolCallId, part] as const)
      );
      for (const call of step.toolCalls) {
        const output = outputs.get(call.toolCallId);
        const value = output?.type === 'tool-result' ? output.output : undefined;
        if (value !== undefined) collectEvidence(value, evidenceLedger);
        const callEvidence = new Map<string, boolean>();
        if (value !== undefined) collectEvidence(value, callEvidence);
        const resultCode = resultErrorCode(value);
        trace.push({
          turn: step.stepNumber + 1,
          toolCallId: call.toolCallId,
          tool: call.toolName,
          validatedArgs: call.input,
          ok: output?.type === 'tool-result' && resultCode === undefined,
          ...(resultCode
            ? { errorCode: resultCode }
            : output?.type === 'tool-error'
              ? { errorCode: errorCode(output.error) }
              : {}),
          latencyMs: Math.round(step.performance.toolExecutionMs[call.toolCallId] ?? 0),
          summary: traceSummary(value ?? (output?.type === 'tool-error' ? { error: true } : null)),
          ...(options.traceDetails && value !== undefined
            ? { details: traceDetails(value, [...callEvidence.keys()]) }
            : {})
        });
      }
    }

    const hitTurnLimit =
      result.steps.length >= MAX_MODEL_STEPS && result.finishReason === 'tool-calls';
    const answer: ModelAnswer = hitTurnLimit
      ? {
          answer: '模型在允许的最大步骤内没有生成最终回答。',
          evidenceIds: [],
          limitations: [`已达到 ${MAX_MODEL_STEPS} 个 model steps 上限。`]
        }
      : result.output;

    return finalizeAnswer({
      answer,
      evidenceLedger,
      trace,
      turns: result.steps.length,
      toolCalls: runtime.executedToolCalls,
      usage: usage(result.usage),
      hitTurnLimit,
      modelTrace,
      structuredAnswer: !hitTurnLimit
    });
  } catch (error) {
    throw mapAgentError(error);
  }
}
