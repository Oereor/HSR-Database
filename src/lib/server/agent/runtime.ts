import { modelAnswerSchema, type ModelAnswer } from '../../agent/contracts.js';
import { AGENT_TOOL_DEFINITIONS, executeAgentTool, type AgentToolDefinition } from './tools.js';

export const MAX_MODEL_TURNS = 4;
export const MAX_TOTAL_TOOL_CALLS = 8;

export interface ModelToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ModelMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: ModelToolCall[] }
  | { role: 'tool'; content: string; toolCallId: string };

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
}

export interface ModelTurn {
  content: string | null;
  toolCalls: ModelToolCall[];
  usage?: ModelUsage;
}

export interface ToolCallingModelClient {
  complete(input: {
    messages: ModelMessage[];
    tools: AgentToolDefinition[];
    signal?: AbortSignal;
  }): Promise<ModelTurn>;
}

export interface AgentTraceEntry {
  turn: number;
  toolCallId: string;
  tool: string;
  validatedArgs?: unknown;
  ok: boolean;
  latencyMs: number;
  summary: {
    toolResultBytes: number;
    rows?: number;
    groups?: number;
    truncated?: boolean;
    warnings?: string[];
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
  structuredAnswer: boolean;
  hitTurnLimit: boolean;
  truncationDisclosure: {
    required: boolean;
    modelProvided: boolean;
    runtimeEnforced: boolean;
  };
}

export const DATA_AGENT_SYSTEM_PROMPT = `你是 HSR-Database 的数据分析 Agent。
所有 HSR-specific factual 或 analytical claims 必须由本轮数据库 tools 返回的数据支持，不得使用模型训练数据中的游戏知识作为事实证据。
search_entities 只解析用户明确提到的实体名称，不枚举赛期敌人；query_endgame 用于具体 occurrence rows 或 drill-down；跨行 count/distinct/min/max/avg/ranking 直接使用 aggregate_endgame，通常不要先 query。
混沌回忆/虚构叙事/末日幻影/异相仲裁分别映射为 moc/pf/as/aa；节点 1/上半与节点 2/下半分别映射为 battleSlot 1/2。
用户说首领/Boss 时使用 enemyRankCategories:["boss"]；按“谁/哪些敌人/Boss”分组时用 enemyTemplate，只有明确要求具体 MonsterID 变体时才用 monster。
latest 与 current 不同：四个模式的 latest 只按 groupId recency；current 只能由 schedule/open-state 证明。
只有 tool result 中 evidenceId 或 evidenceIds 字段的值可以引用；entity ID、MonsterID、template ID、groupId/season ID、tool call ID 都不是 evidence ID。
数据库未明确定义 difficulty、best、strongest、most suitable、recommended、value 或 design intent，且用户没有明确指定 proxy 时，核心请求不可回答：不要调用工具寻找 proxy，不要主动计算或排名，并明确说明无法回答。可以只说明“若用户指定以 HP 为代理，可另做分析”，但不得直接给出代理结果或把它表述为原概念。
数据库不足、结果 unresolved、runtime-unclear 或 truncated 时明确写入 limitations，不要猜测或连续查询无关 proxy。
最终只输出一个 JSON 对象，不要 Markdown：{"answer":"中文回答","evidenceIds":["工具返回的 evidenceId"],"limitations":["限制"]}。`;

const FINALIZATION_RETRY_PROMPT =
  '上一次返回了空内容。不要调用工具；只输出最终 JSON 对象，字段必须是 answer、evidenceIds、limitations。';

function emptyUsage(): ModelUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, cacheHitTokens: 0, cacheMissTokens: 0 };
}

function addUsage(total: ModelUsage, usage: ModelUsage | undefined): void {
  if (!usage) return;
  total.inputTokens += usage.inputTokens;
  total.outputTokens += usage.outputTokens;
  total.totalTokens += usage.totalTokens;
  total.cacheHitTokens = (total.cacheHitTokens ?? 0) + (usage.cacheHitTokens ?? 0);
  total.cacheMissTokens = (total.cacheMissTokens ?? 0) + (usage.cacheMissTokens ?? 0);
}

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

function traceSummary(result: unknown, toolResultBytes: number): AgentTraceEntry['summary'] {
  if (!result || typeof result !== 'object') return { toolResultBytes };
  const record = result as Record<string, unknown>;
  const warnings = Array.isArray(record.warnings)
    ? record.warnings.flatMap((item) =>
        item && typeof item === 'object' && typeof (item as { code?: unknown }).code === 'string'
          ? [(item as { code: string }).code]
          : []
      )
    : undefined;
  return {
    toolResultBytes,
    ...(typeof record.returnedRows === 'number' ? { rows: record.returnedRows } : {}),
    ...(typeof record.returnedGroups === 'number' ? { groups: record.returnedGroups } : {}),
    ...(typeof record.truncated === 'boolean' ? { truncated: record.truncated } : {}),
    ...(warnings?.length ? { warnings } : {})
  };
}

function parseAnswer(content: string | null): { answer: ModelAnswer; structured: boolean } {
  const trimmed = content?.trim() ?? '';
  const fenced = /^```json[\t ]*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  const candidate = fenced?.[1] ?? trimmed;
  if (candidate) {
    try {
      const parsed = modelAnswerSchema.safeParse(JSON.parse(candidate));
      if (parsed.success) return { answer: parsed.data, structured: true };
    } catch {
      // Fall through to the explicit baseline fallback.
    }
  }
  return {
    answer: {
      answer: content?.trim() || '模型未返回最终回答。',
      evidenceIds: [],
      limitations: ['模型未返回约定的结构化 JSON 最终答案。']
    },
    structured: false
  };
}

function hasTruncationDisclosure(limitations: readonly string[]): boolean {
  return limitations.some((limitation) => /截断|不完整|返回上限|payload|truncat/i.test(limitation));
}

function finalizeAnswer(input: {
  parsed: { answer: ModelAnswer; structured: boolean };
  evidenceLedger: Map<string, boolean>;
  trace: AgentTraceEntry[];
  turns: number;
  toolCalls: number;
  usage: ModelUsage;
  hitTurnLimit: boolean;
}): RunAgentResult {
  const invalidEvidenceIds = [
    ...new Set(input.parsed.answer.evidenceIds.filter((id) => !input.evidenceLedger.has(id)))
  ];
  const acceptedEvidenceIds = [
    ...new Set(input.parsed.answer.evidenceIds.filter((id) => input.evidenceLedger.has(id)))
  ];
  const anyTruncatedResult = input.trace.some(({ summary }) => summary.truncated === true);
  const citedTruncatedResult = acceptedEvidenceIds.some(
    (id) => input.evidenceLedger.get(id) === true
  );
  const truncationRequired =
    citedTruncatedResult || (!acceptedEvidenceIds.length && anyTruncatedResult);
  const modelProvided = hasTruncationDisclosure(input.parsed.answer.limitations);
  const runtimeEnforced = truncationRequired && !modelProvided;
  if (runtimeEnforced)
    for (const entry of input.trace)
      if (entry.summary.truncated) entry.runtimeEnforcedLimitation = true;
  return {
    answer: {
      ...input.parsed.answer,
      evidenceIds: acceptedEvidenceIds,
      limitations: runtimeEnforced
        ? [...input.parsed.answer.limitations, '用于结论的工具结果已截断，答案可能不完整。']
        : input.parsed.answer.limitations
    },
    invalidEvidenceIds,
    turns: input.turns,
    toolCalls: input.toolCalls,
    usage: input.usage,
    trace: input.trace,
    structuredAnswer: input.parsed.structured,
    hitTurnLimit: input.hitTurnLimit,
    truncationDisclosure: {
      required: truncationRequired,
      modelProvided,
      runtimeEnforced
    }
  };
}

export async function runDataAgent(
  question: string,
  options: { client: ToolCallingModelClient; signal?: AbortSignal }
): Promise<RunAgentResult> {
  if (!question.trim()) throw new Error('问题不能为空');
  const messages: ModelMessage[] = [
    { role: 'system', content: DATA_AGENT_SYSTEM_PROMPT },
    { role: 'user', content: question.trim() }
  ];
  const evidenceLedger = new Map<string, boolean>();
  const trace: AgentTraceEntry[] = [];
  const usage = emptyUsage();
  let totalToolCalls = 0;
  let finalizationOnly = false;
  let finalizationRetryUsed = false;

  for (let turn = 1; turn <= MAX_MODEL_TURNS; turn += 1) {
    const modelTurn = await options.client.complete({
      messages,
      tools: finalizationOnly ? [] : AGENT_TOOL_DEFINITIONS,
      signal: options.signal
    });
    addUsage(usage, modelTurn.usage);
    messages.push({
      role: 'assistant',
      content: modelTurn.content,
      ...(modelTurn.toolCalls.length ? { toolCalls: modelTurn.toolCalls } : {})
    });
    if (finalizationOnly && modelTurn.toolCalls.length) {
      return finalizeAnswer({
        parsed: parseAnswer(null),
        evidenceLedger,
        trace,
        turns: turn,
        toolCalls: totalToolCalls,
        usage,
        hitTurnLimit: false
      });
    }
    if (!modelTurn.toolCalls.length) {
      if (!modelTurn.content?.trim() && !finalizationRetryUsed && turn < MAX_MODEL_TURNS) {
        finalizationRetryUsed = true;
        finalizationOnly = true;
        messages.push({ role: 'user', content: FINALIZATION_RETRY_PROMPT });
        continue;
      }
      return finalizeAnswer({
        parsed: parseAnswer(modelTurn.content),
        evidenceLedger,
        trace,
        turns: turn,
        toolCalls: totalToolCalls,
        usage,
        hitTurnLimit: false
      });
    }

    const remainingToolCalls = Math.max(0, MAX_TOTAL_TOOL_CALLS - totalToolCalls);
    const results = await Promise.all(
      modelTurn.toolCalls.map(async (toolCall, index) => {
        if (index >= remainingToolCalls) {
          const result = {
            error: {
              code: 'TOOL_CALL_LIMIT_EXCEEDED',
              retryable: false,
              hint: 'Do not call more tools; answer from the results already returned.'
            }
          };
          return { toolCall, result, ok: false, latencyMs: 0 };
        }
        totalToolCalls += 1;
        const started = performance.now();
        const executed = await executeAgentTool(
          toolCall.function.name,
          toolCall.function.arguments
        );
        return {
          toolCall,
          result: executed.result,
          validatedArgs: executed.validatedArgs,
          ok: executed.ok,
          latencyMs: Math.round(performance.now() - started)
        };
      })
    );
    for (const executed of results) {
      const serializedResult = JSON.stringify(executed.result);
      collectEvidence(executed.result, evidenceLedger);
      trace.push({
        turn,
        toolCallId: executed.toolCall.id,
        tool: executed.toolCall.function.name,
        ...(executed.validatedArgs !== undefined ? { validatedArgs: executed.validatedArgs } : {}),
        ok: executed.ok,
        latencyMs: executed.latencyMs,
        summary: traceSummary(executed.result, Buffer.byteLength(serializedResult, 'utf8'))
      });
      messages.push({
        role: 'tool',
        toolCallId: executed.toolCall.id,
        content: serializedResult
      });
    }
  }

  return finalizeAnswer({
    parsed: {
      answer: {
        answer: '模型在允许的最大轮次内没有生成最终回答。',
        evidenceIds: [],
        limitations: [`已达到 ${MAX_MODEL_TURNS} 个 model turns 上限。`]
      },
      structured: true
    },
    evidenceLedger,
    trace,
    turns: MAX_MODEL_TURNS,
    toolCalls: totalToolCalls,
    usage,
    hitTurnLimit: true
  });
}
