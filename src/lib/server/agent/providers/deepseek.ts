import { z } from 'zod';
import type { ModelMessage, ModelTurn, ToolCallingModelClient } from '../runtime.js';
import { agentThinkingModeSchema, type AgentThinkingMode } from '../../../agent/contracts.js';

export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-flash';
export const DEEPSEEK_REQUEST_TIMEOUT_MS = 60_000;

const toolCallSchema = z
  .object({
    id: z.string(),
    type: z.literal('function'),
    function: z.object({ name: z.string(), arguments: z.string() }).strict()
  })
  .passthrough();

const responseSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            finish_reason: z.string().optional(),
            message: z
              .object({
                content: z.string().nullable(),
                role: z.literal('assistant'),
                reasoning_content: z.string().nullable().optional(),
                tool_calls: z.array(toolCallSchema).optional()
              })
              .passthrough()
          })
          .passthrough()
      )
      .min(1),
    model: z.string().optional(),
    system_fingerprint: z.string().optional(),
    usage: z
      .object({
        prompt_tokens: z.number().int().nonnegative(),
        completion_tokens: z.number().int().nonnegative(),
        total_tokens: z.number().int().nonnegative(),
        prompt_cache_hit_tokens: z.number().int().nonnegative().optional(),
        prompt_cache_miss_tokens: z.number().int().nonnegative().optional(),
        completion_tokens_details: z
          .object({ reasoning_tokens: z.number().int().nonnegative().optional() })
          .passthrough()
          .optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

export interface DeepSeekClientOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  thinkingMode?: AgentThinkingMode;
}

function providerMessage(message: ModelMessage, replayReasoning: boolean) {
  if (message.role === 'assistant')
    return {
      role: message.role,
      content: message.content,
      ...(replayReasoning && message.reasoningContent !== undefined
        ? { reasoning_content: message.reasoningContent }
        : {}),
      ...(message.toolCalls ? { tool_calls: message.toolCalls } : {})
    };
  if (message.role === 'tool')
    return { role: message.role, content: message.content, tool_call_id: message.toolCallId };
  return message;
}

export class DeepSeekModelClient implements ToolCallingModelClient {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #model: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #thinkingMode: AgentThinkingMode;

  constructor(options: DeepSeekClientOptions) {
    if (!options.apiKey.trim()) throw new Error('DEEPSEEK_API_KEY is missing');
    const url = new URL(options.baseUrl ?? DEFAULT_DEEPSEEK_BASE_URL);
    if (url.protocol !== 'https:' && url.protocol !== 'http:')
      throw new Error('DEEPSEEK_BASE_URL must use http or https');
    this.#apiKey = options.apiKey;
    this.#baseUrl = url.toString().replace(/\/$/, '');
    this.#model = options.model?.trim() || DEFAULT_DEEPSEEK_MODEL;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? DEEPSEEK_REQUEST_TIMEOUT_MS;
    this.#thinkingMode = agentThinkingModeSchema.parse(options.thinkingMode ?? 'off');
  }

  async complete(input: Parameters<ToolCallingModelClient['complete']>[0]): Promise<ModelTurn> {
    if (
      this.#thinkingMode === 'low' &&
      input.tools.length &&
      input.messages.some(
        (message) => message.role === 'assistant' && message.reasoningContent === undefined
      )
    )
      throw new Error('DEEPSEEK_MISSING_REASONING_REPLAY');
    const timeoutSignal = AbortSignal.timeout(this.#timeoutMs);
    const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
    const response = await this.#fetch(`${this.#baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        'Content-Type': 'application/json'
      },
      signal,
      body: JSON.stringify({
        model: this.#model,
        messages: input.messages.map((message) =>
          providerMessage(message, this.#thinkingMode === 'low' && input.tools.length > 0)
        ),
        ...(input.tools.length
          ? { tools: input.tools, tool_choice: 'auto' }
          : { tool_choice: 'none' }),
        ...(this.#thinkingMode === 'off'
          ? { thinking: { type: 'disabled' }, temperature: 0 }
          : { thinking: { type: 'enabled' }, reasoning_effort: 'low' }),
        response_format: { type: 'json_object' },
        max_tokens: 2048
      })
    });
    if (!response.ok) throw new Error(`DEEPSEEK_HTTP_ERROR_${response.status}`);
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) {
      const diagnostics = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.') || 'response'}:${issue.code}`)
        .join(',');
      throw new Error(`DEEPSEEK_INVALID_RESPONSE:${diagnostics}`);
    }
    const message = parsed.data.choices[0].message;
    if (this.#thinkingMode === 'low' && typeof message.reasoning_content !== 'string')
      throw new Error('DEEPSEEK_MISSING_REASONING_CONTENT');
    const usage = parsed.data.usage;
    return {
      content: message.content,
      ...(typeof message.reasoning_content === 'string'
        ? { reasoningContent: message.reasoning_content }
        : {}),
      metadata: {
        model: parsed.data.model ?? this.#model,
        ...(parsed.data.system_fingerprint
          ? { systemFingerprint: parsed.data.system_fingerprint }
          : {}),
        ...(parsed.data.choices[0].finish_reason
          ? { finishReason: parsed.data.choices[0].finish_reason }
          : {})
      },
      toolCalls: (message.tool_calls ?? []).map((call) => ({
        id: call.id,
        type: call.type,
        function: call.function
      })),
      ...(usage
        ? {
            usage: {
              inputTokens: usage.prompt_tokens,
              outputTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
              ...(usage.completion_tokens_details?.reasoning_tokens !== undefined
                ? { reasoningTokens: usage.completion_tokens_details.reasoning_tokens }
                : {}),
              ...(usage.prompt_cache_hit_tokens !== undefined
                ? { cacheHitTokens: usage.prompt_cache_hit_tokens }
                : {}),
              ...(usage.prompt_cache_miss_tokens !== undefined
                ? { cacheMissTokens: usage.prompt_cache_miss_tokens }
                : {})
            }
          }
        : {})
    };
  }
}

export function createDeepSeekClientFromEnv(
  environment: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
  thinkingMode: AgentThinkingMode = 'off'
): DeepSeekModelClient {
  return new DeepSeekModelClient({
    apiKey: environment.DEEPSEEK_API_KEY ?? '',
    baseUrl: environment.DEEPSEEK_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL,
    model: environment.DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_MODEL,
    thinkingMode,
    ...(fetchImpl ? { fetchImpl } : {})
  });
}
