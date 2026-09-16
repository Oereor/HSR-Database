import { describe, expect, it, vi } from 'vitest';
import { AGENT_TOOL_DEFINITIONS } from '../../../src/lib/server/agent/tools';
import {
  MAX_MODEL_TURNS,
  MAX_TOTAL_TOOL_CALLS,
  DATA_AGENT_SYSTEM_PROMPT,
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
  it('system protocol 固定 mode、latest/current、battle slot 与 proxy 边界', () => {
    expect(DATA_AGENT_SYSTEM_PROMPT).toContain('moc/pf/as/aa');
    expect(DATA_AGENT_SYSTEM_PROMPT).toContain('latest 与 current 不同');
    expect(DATA_AGENT_SYSTEM_PROMPT).toContain('battleSlot 1/2');
    expect(DATA_AGENT_SYSTEM_PROMPT).toContain('enemyRankCategories:["boss"]');
    expect(DATA_AGENT_SYSTEM_PROMPT).toContain('分组时用 enemyTemplate');
    expect(DATA_AGENT_SYSTEM_PROMPT).toContain('difficulty');
    expect(DATA_AGENT_SYSTEM_PROMPT).toContain('不要调用工具寻找 proxy');
    expect(DATA_AGENT_SYSTEM_PROMPT).toContain('逻辑、数学和完整性前提');
    expect(DATA_AGENT_SYSTEM_PROMPT).toContain('不得为了制造可回答结果而静默改变');
    expect(DATA_AGENT_SYSTEM_PROMPT).toContain('普通用户回答必须使用游戏/站点/domain 术语');
    expect(DATA_AGENT_SYSTEM_PROMPT).toContain('enemyTemplateId 只交给 enemyTemplateIds');
    expect(DATA_AGENT_SYSTEM_PROMPT).toContain('global top/bottom');
  });

  it('fake model 可对未定义概念直接 abstain 而不触发 proxy tool calls', async () => {
    const client = new FakeClient([
      {
        content: JSON.stringify({
          answer: '数据库没有客观难度定义，无法判断哪一期最难。',
          evidenceIds: [],
          limitations: ['未定义 objective difficulty。']
        }),
        toolCalls: []
      }
    ]);
    const result = await runDataAgent('最近几期混沌回忆哪一期最难？', { client });
    expect(result.toolCalls).toBe(0);
    expect(result.answer.answer).toContain('无法判断');
  });

  it('支持并行工具、累加 usage，并只接受显式 evidence 字段', async () => {
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
          evidenceIds: ['ent1/character/1101', '1101', 'eg1/not-returned'],
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
      invalidEvidenceIds: ['1101', 'eg1/not-returned']
    });
    expect(result.usage.totalTokens).toBe(39);
    expect(result.answer.evidenceIds).toEqual(['ent1/character/1101']);
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
      client: new FakeClient([
        { content: '普通文本', toolCalls: [] },
        { content: '仍然不是 JSON', toolCalls: [] }
      ])
    });
    expect(result).toMatchObject({
      structuredAnswer: false,
      answer: { answer: '模型未返回满足结构化最终答案契约的回答。', evidenceIds: [] }
    });
  });

  it('接受 raw JSON 和单层 json fence，但不从 prose 中提取 JSON', async () => {
    const fenced = await runDataAgent('fenced', {
      client: new FakeClient([
        {
          content: '```json\n{"answer":"完成","evidenceIds":[],"limitations":[]}\n```',
          toolCalls: []
        }
      ])
    });
    expect(fenced.structuredAnswer).toBe(true);
    const prose = await runDataAgent('prose', {
      client: new FakeClient([
        {
          content: '结果如下：{"answer":"完成","evidenceIds":[],"limitations":[]}',
          toolCalls: []
        },
        {
          content: '仍然是 prose：{"answer":"完成","evidenceIds":[],"limitations":[]}',
          toolCalls: []
        }
      ])
    });
    expect(prose.structuredAnswer).toBe(false);
  });

  it('终答数组去重并 cap，answer 超限只做一次 finalization retry', async () => {
    const client = new FakeClient([
      {
        content: JSON.stringify({ answer: 'x'.repeat(801), evidenceIds: [], limitations: [] }),
        toolCalls: []
      },
      {
        content: JSON.stringify({
          answer: '完成',
          evidenceIds: [],
          limitations: ['限制', '限制', 'a', 'b', 'c', 'd', 'e']
        }),
        toolCalls: []
      }
    ]);
    const result = await runDataAgent('bounded', { client });
    expect(result.answer.limitations).toEqual(['限制', 'a', 'b', 'c', 'd']);
    expect(result.finalization).toMatchObject({
      retryUsed: true,
      retryReason: 'answer-too-long',
      limitationsDeduplicated: 1,
      limitationsCapped: 1
    });
    expect(client.calls[1].tools).toEqual([]);
  });

  it('空 content 只做一次无 tools finalization retry', async () => {
    const client = new FakeClient([
      { content: '', toolCalls: [] },
      {
        content: '{"answer":"完成","evidenceIds":[],"limitations":[]}',
        toolCalls: []
      }
    ]);
    const result = await runDataAgent('empty retry', { client });
    expect(result).toMatchObject({ turns: 2, structuredAnswer: true });
    expect(client.calls).toHaveLength(2);
    expect(client.calls[0].tools).toHaveLength(3);
    expect(client.calls[1].tools).toEqual([]);
  });

  it('截断结果被引用而模型遗漏限制时由 runtime 显式保留', async () => {
    class TruncationClient implements ToolCallingModelClient {
      calls = 0;
      async complete(input: Parameters<ToolCallingModelClient['complete']>[0]) {
        this.calls += 1;
        if (this.calls === 1)
          return {
            content: null,
            toolCalls: [
              toolCall('q', 'query_endgame', {
                locale: 'zh-CN',
                filter: {
                  seasons: { kind: 'ids', seasons: [{ mode: 'as', groupId: 3020 }] }
                },
                include: ['enemy-identity'],
                limit: 1
              })
            ]
          };
        const toolMessage = input.messages.findLast((message) => message.role === 'tool');
        if (!toolMessage || toolMessage.role !== 'tool') throw new Error('tool result missing');
        const evidenceId = JSON.parse(toolMessage.content).rows[0].evidenceId as string;
        return {
          content: JSON.stringify({ answer: '完成', evidenceIds: [evidenceId], limitations: [] }),
          toolCalls: []
        };
      }
    }
    const result = await runDataAgent('truncation', { client: new TruncationClient() });
    expect(result.truncationDisclosure).toEqual({
      required: true,
      modelProvided: false,
      runtimeEnforced: true
    });
    expect(result.answer.limitations).toContain('用于结论的工具结果已截断，答案可能不完整。');
    expect(result.trace[0]).toMatchObject({ runtimeEnforcedLimitation: true });
    expect(result.trace[0].summary.toolResultBytes).toBeGreaterThan(0);
  });

  it('runtime ledger 接受 aggregate-result evidence', async () => {
    class AggregateLedgerClient implements ToolCallingModelClient {
      calls = 0;
      async complete(input: Parameters<ToolCallingModelClient['complete']>[0]) {
        this.calls += 1;
        if (this.calls === 1)
          return {
            content: null,
            toolCalls: [
              toolCall('a', 'aggregate_endgame', {
                locale: 'zh-CN',
                filter: {
                  seasons: { kind: 'ids', seasons: [{ mode: 'as', groupId: 3020 }] }
                },
                groupBy: [],
                metrics: [{ op: 'rowCount', as: 'rows' }],
                limit: 1
              })
            ]
          };
        const toolMessage = input.messages.findLast((message) => message.role === 'tool');
        if (!toolMessage || toolMessage.role !== 'tool') throw new Error('tool result missing');
        const evidenceId = JSON.parse(toolMessage.content).groups[0].evidenceId as string;
        return {
          content: JSON.stringify({ answer: '完成', evidenceIds: [evidenceId], limitations: [] }),
          toolCalls: []
        };
      }
    }
    const result = await runDataAgent('aggregate ledger', { client: new AggregateLedgerClient() });
    expect(result.invalidEvidenceIds).toEqual([]);
    expect(result.answer.evidenceIds[0]).toMatch(/^ag1\/[a-f0-9]{64}$/);
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
      response_format: { type: 'json_object' },
      temperature: 0
    });
  });

  it('thinking-low 映射 effort、完整 replay reasoning 并映射 reasoning usage', async () => {
    let capturedRequest: RequestInit | undefined;
    const fetchMock = vi.fn(async (_input: string | URL | Request, request?: RequestInit) => {
      capturedRequest = request;
      return new Response(
        JSON.stringify({
          model: 'deepseek-flash',
          system_fingerprint: 'fp-test',
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: '',
                reasoning_content: 'next reasoning',
                tool_calls: []
              }
            }
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 7,
            total_tokens: 17,
            completion_tokens_details: { reasoning_tokens: 5 }
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    const client = new DeepSeekModelClient({
      apiKey: 'test',
      thinkingMode: 'low',
      fetchImpl: fetchMock as typeof fetch
    });
    const turn = await client.complete({
      messages: [
        {
          role: 'assistant',
          content: '',
          reasoningContent: 'prior reasoning',
          toolCalls: [toolCall('x', 'search_entities', { query: '鸭鸭', locale: 'zh-CN' })]
        }
      ],
      tools: AGENT_TOOL_DEFINITIONS
    });
    const body = JSON.parse(String(capturedRequest?.body));
    expect(body).toMatchObject({ thinking: { type: 'enabled' }, reasoning_effort: 'low' });
    expect(body).not.toHaveProperty('temperature');
    expect(body.messages[0].reasoning_content).toBe('prior reasoning');
    expect(turn).toMatchObject({
      reasoningContent: 'next reasoning',
      usage: { reasoningTokens: 5 },
      metadata: { systemFingerprint: 'fp-test' }
    });
  });

  it('thinking-low 缺失 reasoning content/replay 时显式失败', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { role: 'assistant', content: '{}' } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    const client = new DeepSeekModelClient({
      apiKey: 'test',
      thinkingMode: 'low',
      fetchImpl: fetchMock as typeof fetch
    });
    await expect(client.complete({ messages: [], tools: [] })).rejects.toThrow(
      'DEEPSEEK_MISSING_REASONING_CONTENT'
    );
    await expect(
      client.complete({
        messages: [{ role: 'assistant', content: null }],
        tools: AGENT_TOOL_DEFINITIONS
      })
    ).rejects.toThrow('DEEPSEEK_MISSING_REASONING_REPLAY');
  });

  it('finalization-only request 不携带 tools 并强制 tool_choice none', async () => {
    let capturedRequest: RequestInit | undefined;
    const fetchMock = vi.fn(async (_input: string | URL | Request, request?: RequestInit) => {
      capturedRequest = request;
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: '{"answer":"ok"}' } }]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    const client = new DeepSeekModelClient({
      apiKey: 'test',
      fetchImpl: fetchMock as typeof fetch
    });
    await client.complete({ messages: [{ role: 'user', content: 'finalize' }], tools: [] });
    const body = JSON.parse(String(capturedRequest?.body));
    expect(body).not.toHaveProperty('tools');
    expect(body.tool_choice).toBe('none');
    expect(body.response_format).toEqual({ type: 'json_object' });
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
