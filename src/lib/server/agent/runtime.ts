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
  FINAL_ANSWER_CHAR_LIMIT,
  FINAL_EVIDENCE_LIMIT,
  FINAL_LIMITATION_CHAR_LIMIT,
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

export const MAX_MODEL_STEPS = 8;
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
  step: number;
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
  step: number;
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
  modelSteps: number;
  toolCalls: number;
  usage: ModelUsage;
  trace: AgentTraceEntry[];
  modelTrace: AgentModelTraceEntry[];
  answerNormalization: AnswerNormalizationTelemetry;
  structuredAnswer: boolean;
  hitStepLimit: boolean;
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

export type StructuredOutputFailureKind =
  | 'empty-content'
  | 'markdown-wrapped-json'
  | 'invalid-json'
  | 'schema-validation'
  | 'truncated-json'
  | 'no-output'
  | 'unknown';

export interface AgentSchemaIssueDiagnostic {
  path: string;
  code?: string;
  message: string;
}

export interface AgentErrorDiagnostics {
  errorClass: string;
  kind?: StructuredOutputFailureKind;
  finishReason?: string;
  stepNumber?: number;
  textEmpty?: boolean;
  textLength?: number;
  schemaIssues?: AgentSchemaIssueDiagnostic[];
  usage?: ModelUsage;
  warningCategories?: string[];
  generatedText?: string;
}

interface DataAgentErrorOptions extends ErrorOptions {
  diagnostics?: AgentErrorDiagnostics;
}

export class DataAgentError extends Error {
  readonly diagnostics?: AgentErrorDiagnostics;

  constructor(
    readonly code: AgentErrorCode,
    readonly safeMessage: string,
    options?: DataAgentErrorOptions
  ) {
    super(safeMessage, options);
    this.name = 'DataAgentError';
    this.diagnostics = options?.diagnostics;
  }
}

export const DATA_AGENT_INSTRUCTIONS = `你是 HSR-Database 的数据分析 Agent。所有 HSR 事实与分析结论必须由本轮数据库工具结果支持，不得把模型训练知识当作数据库事实。内部推理要保守，用户可见表达要克制。

分析政策：
- 工具职责：search_entities 只解析用户明确提到的实体名称，其 enemyTemplateId 只能交给 Endgame tools 的 enemyTemplateIds。query_endgame 用于具体 occurrence rows、全局具体 top/bottom row 与 drill-down。aggregate_endgame 用于 count/distinct/min/max/avg 标量或分组汇总。select_endgame_extrema 用于返回产生最小/最大值的身份或位置并保留并列；查全局获胜身份时省略 groupBy，不要把同一身份维度同时放入 groupBy 和 select。statuses:["current"] 可由分析工具直接解析，不需先用 query_endgame 探路。weakness filter 用于筛选，weakness group 仅用于按弱点类别汇总。
- 领域口径：混沌回忆/虚构叙事/末日幻影/异相仲裁映射为 moc/pf/as/aa；混沌回忆第 N 层、虚构叙事难度 N/其 N 使用 encounterOrdinals:[N]，levels 是敌人配置等级而不是难度；节点 1/上半与节点 2/下半映射为 battleSlot 1/2；首领/Boss 使用 enemyRankCategories:["boss"]。latest 按 groupId recency，不能替代由 schedule/open-state 证明的 current。按敌人身份分组默认使用 enemyTemplate，只有用户明确要求 MonsterID 变体时才用 monster。
- 实体解析：完整名称无结果且原文含明显称号或标点时，可在预算内仅用核心专名重试一次，不得据此扩大到多个实体。若返回多个同名模板，必须根据 Endgame 结果选择范围，不得静默合并。
- 意图与范围：先解决 intended scope，再执行 Scope Fidelity。一个解释明显占优时直接执行；低风险歧义可明示合理假设；多个自然解释会实质改变数据集、结论、可回答性或重要限制且无强默认时，先请求澄清。不要因措辞差异强制澄清，也不得选定口径后静默换口径。
- 证据与谨慎性：只有工具结果的 evidenceId/evidenceIds 可引用。数据库未定义 difficulty、best、strongest、recommended、value 或 design intent 且用户未给 proxy 时，说明不可回答，不得自行换成 HP 等代理。始终检查 unresolved、runtime-unclear、truncated、并列、同名身份、current/upcoming 以及可比 observation 数；截断候选集不能声称完整全局排名，只有一个可比观测时不能声称趋势。

最终回答政策：
- 通常在第一句直接回答用户的问题；比较或趋势问题先说趋势。若请求的精确指标无法可靠回答，则先说明这一点，再简要给出明确标注的最接近可支持比较；不得静默替换指标。
- 只展示回答问题所需的事实与少量有助理解的上下文。不主动枚举候选全集、额外历史期数、无关属性、计算式、配置行数、查询方法、工具名或执行轨迹。只有用户询问算法，或非显然的加权口径会改变理解时，才展开推导。
- limitations 只放会改变结论的解读、完整性、置信程度、指标含义、身份/范围假设或直接可回答性的限制。忠实复述用户的范围（如只看第 12 层或排除 upcoming）、排序键、行数和内部 grain 不是限制。没有实质限制时使用 []；同一限制不要在 answer 和 limitations 中反复改写。
- 使用自然中文的游戏/站点术语。如果不了解数据库实现也能理解结果，就不要暴露内部概念。例如对用户说“末日幻影”、“当前赛期”、“难度 4”、“每管血量”、“下半/节点 2”和“实际总血量无法可靠确定”，不要说 as、status=current、encounterOrdinal、hpPerBar、battleSlot 或 runtime-unclear。普通回答不展示 configured-occurrence、enemyTemplate、groupId、MonsterID、stageId、evidenceId、ag1/eg1/ent1、DecimalString、dataRevision 或其他原始 ID。只有用户明确询问实现、数据口径、调试信息或 ID 时才例外。
- 软篇幅目标：简单事实查询通常 1–2 句；简单比较/极值通常 2–4 句；趋势问题用短段落或仅列用户要求的观测；重要指标受限时用一句解释原因，再给一个简短替代比较。复杂问题可在真有必要时超出，不要为追求字数而损害清晰度或正确性。
- 生成 JSON 前做一次可见内容自检：简单极值题删除非获胜候选、位置和无关属性；用户要求最近 N 次时不提额外次数；删除配置数量、算术说明和机械范围复述；若 answer 已说清某个限制，不再把它放入 limitations。

最终回答必须是纯 JSON 对象，不要使用 Markdown 代码围栏。格式示例：{"answer":"结论","evidenceIds":["工具返回的 evidenceId"],"limitations":[]}。三个字段始终存在；answer 最多 ${FINAL_ANSWER_CHAR_LIMIT} 个字符，evidenceIds 最多 ${FINAL_EVIDENCE_LIMIT} 项，limitations 最多 ${FINAL_LIMITATION_LIMIT} 项且每项最多 ${FINAL_LIMITATION_CHAR_LIMIT} 个字符。`;

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
  modelSteps: number;
  toolCalls: number;
  usage: ModelUsage;
  hitStepLimit: boolean;
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
    modelSteps: input.modelSteps,
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
    hitStepLimit: input.hitStepLimit,
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

function namedError(error: unknown): { name: string; cause?: unknown } | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as { name?: unknown; cause?: unknown };
  return {
    name: typeof record.name === 'string' ? record.name : error.constructor.name,
    cause: record.cause
  };
}

function schemaIssueDiagnostics(error: unknown): AgentSchemaIssueDiagnostic[] | undefined {
  const validationError = namedError(error);
  if (validationError?.name !== 'AI_TypeValidationError') return undefined;
  const cause = validationError.cause;
  if (!cause || typeof cause !== 'object') return undefined;
  const issues = (cause as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return undefined;
  const diagnostics = issues.slice(0, 10).flatMap((issue) => {
    if (!issue || typeof issue !== 'object') return [];
    const record = issue as { path?: unknown; code?: unknown; message?: unknown };
    const path = Array.isArray(record.path)
      ? record.path.map((segment) => String(segment)).join('.')
      : '';
    return [
      {
        path,
        ...(typeof record.code === 'string' ? { code: record.code } : {}),
        message:
          typeof record.message === 'string'
            ? record.message.slice(0, 240)
            : 'Schema validation failed.'
      }
    ];
  });
  return diagnostics.length ? diagnostics : undefined;
}

function warningCategories(warnings: readonly unknown[]): string[] | undefined {
  const categories = warnings.flatMap((warning) => {
    if (!warning || typeof warning !== 'object') return [];
    const record = warning as { type?: unknown; feature?: unknown; setting?: unknown };
    if (typeof record.type !== 'string') return [];
    const subject =
      typeof record.feature === 'string'
        ? record.feature
        : typeof record.setting === 'string'
          ? record.setting
          : undefined;
    return [subject ? `${record.type}:${subject}` : record.type];
  });
  return categories.length ? [...new Set(categories)] : undefined;
}

function structuredOutputDiagnostics(
  error: unknown,
  context: {
    includeGeneratedText?: boolean;
    stepNumber?: number;
    warnings?: readonly unknown[];
  } = {}
): AgentErrorDiagnostics {
  const named = namedError(error);
  const warnings = warningCategories(context.warnings ?? []);
  const diagnostics: AgentErrorDiagnostics = {
    errorClass: named?.name ?? typeof error,
    ...(context.stepNumber !== undefined ? { stepNumber: context.stepNumber } : {}),
    ...(warnings ? { warningCategories: warnings } : {})
  };

  if (NoOutputGeneratedError.isInstance(error)) return { ...diagnostics, kind: 'no-output' };
  if (!NoObjectGeneratedError.isInstance(error)) return diagnostics;

  const text = error.text;
  const trimmed = text?.trim();
  const causeName = namedError(error.cause)?.name;
  const schemaIssues = schemaIssueDiagnostics(error.cause);
  const kind: StructuredOutputFailureKind =
    trimmed === ''
      ? 'empty-content'
      : error.finishReason === 'length'
        ? 'truncated-json'
        : trimmed?.startsWith('```')
          ? 'markdown-wrapped-json'
          : causeName === 'AI_JSONParseError'
            ? 'invalid-json'
            : causeName === 'AI_TypeValidationError'
              ? 'schema-validation'
              : 'unknown';

  return {
    ...diagnostics,
    kind,
    ...(error.finishReason ? { finishReason: error.finishReason } : {}),
    ...(text !== undefined ? { textEmpty: trimmed === '', textLength: unicodeLength(text) } : {}),
    ...(error.usage ? { usage: usage(error.usage) } : {}),
    ...(schemaIssues ? { schemaIssues } : {}),
    ...(context.includeGeneratedText && text !== undefined ? { generatedText: text } : {})
  };
}

function mapAgentError(
  error: unknown,
  context: {
    includeGeneratedText?: boolean;
    stepNumber?: number;
    warnings?: readonly unknown[];
  } = {}
): DataAgentError {
  if (error instanceof DataAgentError) return error;
  if (error instanceof AgentConfigurationError)
    return new DataAgentError('configuration', error.message, { cause: error });
  if (InvalidToolInputError.isInstance(error))
    return new DataAgentError('invalid-tool-input', '模型生成了无效的工具参数。', {
      cause: error
    });
  if (NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error))
    return new DataAgentError('structured-output', '模型未返回满足约定结构的最终答案。', {
      cause: error,
      diagnostics: structuredOutputDiagnostics(error, context)
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
  includeGeneratedTextInErrors?: boolean;
}

export async function runDataAgent(
  question: string,
  options: RunDataAgentOptions = {}
): Promise<RunAgentResult> {
  if (!question.trim()) throw new DataAgentError('unexpected', '问题不能为空');

  let completedStepCount: number | undefined;
  const observedWarnings: unknown[] = [];
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
      include: { requestBody: false, requestMessages: false, responseBody: false },
      onStepFinish(step) {
        completedStepCount = step.stepNumber + 1;
        observedWarnings.push(...(step.warnings ?? []));
      }
    });

    const result = await agent.generate({
      prompt: question.trim(),
      ...(options.signal ? { abortSignal: options.signal } : {})
    });
    const evidenceLedger = new Map<string, boolean>();
    const trace: AgentTraceEntry[] = [];
    const modelTrace: AgentModelTraceEntry[] = result.steps.map((step) => ({
      step: step.stepNumber + 1,
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
          step: step.stepNumber + 1,
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

    const hitStepLimit =
      result.steps.length >= MAX_MODEL_STEPS && result.finishReason === 'tool-calls';
    let answer: ModelAnswer;
    if (hitStepLimit) {
      answer = {
        answer: '模型在允许的最大步骤内没有生成最终回答。',
        evidenceIds: [],
        limitations: [`已达到 ${MAX_MODEL_STEPS} 个 model steps 上限。`]
      };
    } else {
      try {
        answer = result.output;
      } catch (error) {
        throw mapAgentError(error, {
          includeGeneratedText: options.includeGeneratedTextInErrors,
          stepNumber: result.steps.length,
          warnings: result.steps.flatMap((step) => step.warnings)
        });
      }
    }

    return finalizeAnswer({
      answer,
      evidenceLedger,
      trace,
      modelSteps: result.steps.length,
      toolCalls: runtime.executedToolCalls,
      usage: usage(result.usage),
      hitStepLimit,
      modelTrace,
      structuredAnswer: !hitStepLimit
    });
  } catch (error) {
    throw mapAgentError(error, {
      includeGeneratedText: options.includeGeneratedTextInErrors,
      stepNumber: completedStepCount,
      warnings: observedWarnings
    });
  }
}
