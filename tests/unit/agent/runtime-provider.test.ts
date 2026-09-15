import { describe, expect, it, vi } from 'vitest';
import { AGENT_TOOL_DEFINITIONS } from '../../../src/lib/server/agent/tools';
import {
  MAX_MODEL_TURNS,
  MAX_TOTAL_TOOL_CALLS,
  runDataAgent,
  type ModelTurn,
  type ToolCallingModelClient
} from '../../../src/lib/server/agent/runtime';
import {
  DeepSeekModelClient,
  createDeepSeekClientFromEnv
} from '../../../src/lib/server/agent/providers/deepseek';

class FakeClient implements ToolCallingModelClient {
  readonly calls = [] as Parameters<ToolCallingModelClient['complete']>[0][];
  constructor(private readonly turns: ModelTurn[]) {}
  async complete(input: Parameters<ToolCallingModelClient['complete']>[0]) {
    this.calls.push(input);
    const turn = this.turns.shift();
    if (!turn) throw new Error('fake turn missing');
    return turn;
  }
}

const toolCall = (id: string, name: string, args: unknown) => ({
  id,
  type: 'function' as const,
  function: { name, arguments: JSON.stringify(args) }
});

describe('bounded Agent runtime', () => {
  it('支持并行工具、累加 usage，并拒绝不属于本轮结果的 evidence', async () => {
    const client = new FakeClient([
      {
        content: null,
        toolCalls: [
          toolCall('a', 'search_entities', {
            query: '鸭鸭',
            locale: 'zh-CN',
            types: ['character']
          }),
          toolCall('b', 'search_entities', { query: '可可利亚', locale: 'zh-CN', types: ['enemy'] })
        ],
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
      },
      {
        content: JSON.stringify({
          answer: '完成',
          evidenceIds: ['eg1/not-returned'],
          limitations: []
        }),
        toolCalls: [],
        usage: { inputTokens: 20, outputTokens: 4, totalTokens: 24 }
      }
    ]);
    const result = await runDataAgent('解析两个名字', { client });
    expect(result).toMatchObject({
      turns: 2,
      toolCalls: 2,
      structuredAnswer: true,
      invalidEvidenceIds: ['eg1/not-returned']
    });
    expect(result.usage.totalTokens).toBe(39);
    expect(result.answer.evidenceIds).toEqual([]);
    expect(result.trace).toHaveLength(2);
    expect(client.calls[1].messages.filter(({ role }) => role === 'tool')).toHaveLength(2);
  });

  it('非法调用和超过 8 次的并行调用只返回脱敏错误码', async () => {
    const calls = Array.from({ length: 9 }, (_, index) =>
      toolCall(String(index), index === 0 ? 'read_file' : 'search_entities', {
        query: '鸭鸭',
        locale: 'zh-CN'
      })
    );
    const client = new FakeClient([
      { content: null, toolCalls: calls },
      { content: '{"answer":"停止","evidenceIds":[],"limitations":["工具受限"]}', toolCalls: [] }
    ]);
    const result = await runDataAgent('边界测试', { client });
    expect(result.toolCalls).toBe(MAX_TOTAL_TOOL_CALLS);
    expect(result.trace).toHaveLength(9);
    expect(client.calls[1].messages.map((message) => JSON.stringify(message)).join(' ')).toContain(
      'UNKNOWN_TOOL'
    );
    expect(client.calls[1].messages.map((message) => JSON.stringify(message)).join(' ')).toContain(
      'TOOL_CALL_LIMIT_EXCEEDED'
    );
    expect(
      client.calls[1].messages.map((message) => JSON.stringify(message)).join(' ')
    ).not.toContain('Authorization');
  });

  it('最多运行四个 model turns', async () => {
    const client = new FakeClient(
      Array.from({ length: MAX_MODEL_TURNS }, (_, index) => ({
        content: null,
        toolCalls: [toolCall(String(index), 'unknown', {})]
      }))
    );
    const result = await runDataAgent('永不结束', { client });
    expect(result.turns).toBe(MAX_MODEL_TURNS);
    expect(result.answer.limitations[0]).toContain('model turns');
  });

  it('保留非结构化最终文本并标记解析失败', async () => {
    const result = await runDataAgent('文本', {
      client: new FakeClient([{ content: '普通文本', toolCalls: [] }])
    });
    expect(result).toMatchObject({
      structuredAnswer: false,
      answer: { answer: '普通文本', evidenceIds: [] }
    });
  });
});

describe('DeepSeek provider mock', () => {
  it('发送固定 OpenAI-compatible contract，映射 usage 且不访问真实网络', async () => {
    let capturedUrl = '';
    let capturedRequest: RequestInit | undefined;
    const fetchMock = vi.fn(async (input: string | URL | Request, request?: RequestInit) => {
      capturedUrl = String(input);
      capturedRequest = request;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    ...toolCall('1', 'search_entities', { query: '鸭鸭', locale: 'zh-CN' }),
                    index: 0
                  }
                ]
              }
            }
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 2,
            total_tokens: 12,
            prompt_cache_hit_tokens: 4
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    const client = new DeepSeekModelClient({
      apiKey: 'secret-test-key',
      fetchImpl: fetchMock as typeof fetch
    });
    const turn = await client.complete({
      messages: [{ role: 'user', content: 'hi' }],
      tools: AGENT_TOOL_DEFINITIONS
    });
    expect(turn).toMatchObject({
      toolCalls: [{ function: { name: 'search_entities' } }],
      usage: { totalTokens: 12, cacheHitTokens: 4 }
    });
    expect(capturedUrl).toBe('https://api.deepseek.com/chat/completions');
    expect(capturedRequest?.headers).toMatchObject({ Authorization: 'Bearer secret-test-key' });
    expect(JSON.parse(String(capturedRequest?.body))).toMatchObject({
      model: 'deepseek-flash',
      tool_choice: 'auto',
      thinking: { type: 'disabled' },
      temperature: 0
    });
  });

  it('HTTP 错误与缺 key 不泄露 secret', async () => {
    expect(() => createDeepSeekClientFromEnv({})).toThrow('DEEPSEEK_API_KEY is missing');
    const client = new DeepSeekModelClient({
      apiKey: 'never-print-me',
      fetchImpl: vi.fn(async () => new Response('', { status: 401 })) as typeof fetch
    });
    await expect(client.complete({ messages: [], tools: [] })).rejects.toThrow(
      'DEEPSEEK_HTTP_ERROR_401'
    );
    await expect(client.complete({ messages: [], tools: [] })).rejects.not.toThrow(
      'never-print-me'
    );
  });

  it('用 AbortSignal 在配置的 timeout 内终止 provider mock', async () => {
    const pendingFetch = vi.fn(
      (_input: string | URL | Request, request?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          request?.signal?.addEventListener('abort', () => reject(request.signal?.reason));
        })
    );
    const client = new DeepSeekModelClient({
      apiKey: 'timeout-test',
      timeoutMs: 5,
      fetchImpl: pendingFetch as typeof fetch
    });
    await expect(client.complete({ messages: [], tools: [] })).rejects.toBeDefined();
    expect(pendingFetch).toHaveBeenCalledOnce();
  });
});
