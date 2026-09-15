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
  summary: { rows?: number; groups?: number; truncated?: boolean; warnings?: string[] };
}

export interface RunAgentResult {
  answer: ModelAnswer;
  invalidEvidenceIds: string[];
  turns: number;
  toolCalls: number;
  usage: ModelUsage;
  trace: AgentTraceEntry[];
  structuredAnswer: boolean;
}

export const DATA_AGENT_SYSTEM_PROMPT = `你是 HSR-Database 的数据分析 Agent。
所有 HSR-specific factual 或 analytical claims 必须由本轮数据库 tools 返回的数据支持，不得使用模型训练数据中的游戏知识作为事实证据。
根据任务自行选择和组合工具；跨多行计算优先使用 aggregate_endgame。
混沌/虚构/末日/仲裁分别映射为 moc/pf/as/aa；节点 2、下半和 battle slot 2 映射为 battleSlot 2。
latest 与 current 不同；四个模式的赛期新旧只按 groupId，schedule 只证明开放状态。
如果数据库不足、结果 unresolved、runtime-unclear 或 truncated，应明确说明限制，不要猜测。
最终只输出 JSON 对象：{"answer":"中文回答","evidenceIds":["工具返回的证据 ID"],"limitations":["限制"]}。`;

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

function collectEvidence(value: unknown, target: Set<string>): void {
  if (typeof value === 'string') {
    if (value.startsWith('eg1/')) target.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectEvidence(item, target));
    return;
  }
  if (value && typeof value === 'object')
    Object.values(value).forEach((item) => collectEvidence(item, target));
}

function traceSummary(result: unknown): AgentTraceEntry['summary'] {
  if (!result || typeof result !== 'object') return {};
  const record = result as Record<string, unknown>;
  const warnings = Array.isArray(record.warnings)
    ? record.warnings.flatMap((item) =>
        item && typeof item === 'object' && typeof (item as { code?: unknown }).code === 'string'
          ? [(item as { code: string }).code]
          : []
      )
    : undefined;
  return {
    ...(typeof record.returnedRows === 'number' ? { rows: record.returnedRows } : {}),
    ...(typeof record.returnedGroups === 'number' ? { groups: record.returnedGroups } : {}),
    ...(typeof record.truncated === 'boolean' ? { truncated: record.truncated } : {}),
    ...(warnings?.length ? { warnings } : {})
  };
}

function parseAnswer(content: string | null): { answer: ModelAnswer; structured: boolean } {
  if (content) {
    try {
      const parsed = modelAnswerSchema.safeParse(JSON.parse(content));
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

export async function runDataAgent(
  question: string,
  options: { client: ToolCallingModelClient; signal?: AbortSignal }
): Promise<RunAgentResult> {
  if (!question.trim()) throw new Error('问题不能为空');
  const messages: ModelMessage[] = [
    { role: 'system', content: DATA_AGENT_SYSTEM_PROMPT },
    { role: 'user', content: question.trim() }
  ];
  const evidenceIds = new Set<string>();
  const trace: AgentTraceEntry[] = [];
  const usage = emptyUsage();
  let totalToolCalls = 0;

  for (let turn = 1; turn <= MAX_MODEL_TURNS; turn += 1) {
    const modelTurn = await options.client.complete({
      messages,
      tools: AGENT_TOOL_DEFINITIONS,
      signal: options.signal
    });
    addUsage(usage, modelTurn.usage);
    messages.push({
      role: 'assistant',
      content: modelTurn.content,
      ...(modelTurn.toolCalls.length ? { toolCalls: modelTurn.toolCalls } : {})
    });
    if (!modelTurn.toolCalls.length) {
      const final = parseAnswer(modelTurn.content);
      const invalidEvidenceIds = final.answer.evidenceIds.filter((id) => !evidenceIds.has(id));
      return {
        answer: {
          ...final.answer,
          evidenceIds: final.answer.evidenceIds.filter((id) => evidenceIds.has(id))
        },
        invalidEvidenceIds,
        turns: turn,
        toolCalls: totalToolCalls,
        usage,
        trace,
        structuredAnswer: final.structured
      };
    }

    const remainingToolCalls = Math.max(0, MAX_TOTAL_TOOL_CALLS - totalToolCalls);
    const results = await Promise.all(
      modelTurn.toolCalls.map(async (toolCall, index) => {
        if (index >= remainingToolCalls) {
          const result = {
            error: {
              code: 'TOOL_CALL_LIMIT_EXCEEDED',
              retryable: false
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
      collectEvidence(executed.result, evidenceIds);
      trace.push({
        turn,
        toolCallId: executed.toolCall.id,
        tool: executed.toolCall.function.name,
        ...(executed.validatedArgs !== undefined ? { validatedArgs: executed.validatedArgs } : {}),
        ok: executed.ok,
        latencyMs: executed.latencyMs,
        summary: traceSummary(executed.result)
      });
      messages.push({
        role: 'tool',
        toolCallId: executed.toolCall.id,
        content: JSON.stringify(executed.result)
      });
    }
  }

  return {
    answer: {
      answer: '模型在允许的最大轮次内没有生成最终回答。',
      evidenceIds: [],
      limitations: [`已达到 ${MAX_MODEL_TURNS} 个 model turns 上限。`]
    },
    invalidEvidenceIds: [],
    turns: MAX_MODEL_TURNS,
    toolCalls: totalToolCalls,
    usage,
    trace,
    structuredAnswer: true
  };
}
