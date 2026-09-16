import { describe, expect, it } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import {
  DATA_AGENT_INSTRUCTIONS,
  DataAgentError,
  MAX_MODEL_STEPS,
  runDataAgent
} from '../../../src/lib/server/agent/runtime';
import {
  AgentConfigurationError,
  createDeepSeekModelFromEnv
} from '../../../src/lib/server/agent/model';
import { MAX_TOTAL_TOOL_CALLS } from '../../../src/lib/server/agent/tools';

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>;

const usage = {
  inputTokens: { total: 10, noCache: 6, cacheRead: 4, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 }
};

function result(
  content: GenerateResult['content'],
  finishReason: GenerateResult['finishReason']['unified'] = 'stop'
): GenerateResult {
  return {
    content,
    finishReason: { unified: finishReason, raw: finishReason },
    usage,
    warnings: []
  };
}

function answer(value: { answer: string; evidenceIds?: string[]; limitations?: string[] }) {
  return result([
    {
      type: 'text',
      text: JSON.stringify({
        answer: value.answer,
        evidenceIds: value.evidenceIds ?? [],
        limitations: value.limitations ?? []
      })
    }
  ]);
}

function toolCall(toolCallId: string, toolName: string, input: unknown): GenerateResult {
  return result(
    [{ type: 'tool-call', toolCallId, toolName, input: JSON.stringify(input) }],
    'tool-calls'
  );
}

describe('AI SDK ToolLoopAgent runtime', () => {
  it('instructions 保留 HSR 领域语义、proxy 边界和意图解析', () => {
    expect(DATA_AGENT_INSTRUCTIONS).toContain('moc/pf/as/aa');
    expect(DATA_AGENT_INSTRUCTIONS).toContain('battleSlot 1/2');
    expect(DATA_AGENT_INSTRUCTIONS).toContain('enemyRankCategories:["boss"]');
    expect(DATA_AGENT_INSTRUCTIONS).toContain('latest');
    expect(DATA_AGENT_INSTRUCTIONS).toContain('difficulty');
    expect(DATA_AGENT_INSTRUCTIONS).toContain('intended scope');
    expect(DATA_AGENT_INSTRUCTIONS).toContain('请求澄清');
  });

  it('支持无工具的结构化终答，并通过 SDK 传递 reasoning 配置', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: answer({
        answer: '数据库没有客观难度定义，无法判断哪一期最难。',
        limitations: ['未定义 objective difficulty。']
      })
    });
    const response = await runDataAgent('最近几期混沌回忆哪一期最难？', {
      model,
      thinkingMode: 'low'
    });
    expect(response).toMatchObject({ turns: 1, toolCalls: 0, structuredAnswer: true });
    expect(response.answer.answer).toContain('无法判断');
    expect(model.doGenerateCalls[0].reasoning).toBe('low');
  });

  it('顺序执行多步工具，把结果传回下一步并只接受 ledger evidence', async () => {
    let call = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        call += 1;
        if (call === 1)
          return toolCall('search', 'search_entities', {
            query: '鸭鸭',
            locale: 'zh-CN',
            types: ['character']
          });
        if (call === 2) {
          expect(JSON.stringify(options.prompt)).toContain('ent1/character/1101');
          return toolCall('query', 'query_endgame', {
            locale: 'zh-CN',
            filter: { seasons: { kind: 'ids', seasons: [{ mode: 'as', groupId: 3020 }] } },
            include: ['location'],
            limit: 1
          });
        }
        expect(JSON.stringify(options.prompt)).toContain('tool-result');
        return answer({
          answer: '完成',
          evidenceIds: ['ent1/character/1101', 'not-an-evidence-id']
        });
      }
    });
    const response = await runDataAgent('先解析名称再查询', { model });
    expect(response).toMatchObject({ turns: 3, toolCalls: 2, structuredAnswer: true });
    expect(response.answer.evidenceIds).toEqual(['ent1/character/1101']);
    expect(response.invalidEvidenceIds).toEqual(['not-an-evidence-id']);
    expect(response.trace.map(({ tool }) => tool)).toEqual(['search_entities', 'query_endgame']);
    expect(response.usage).toMatchObject({ inputTokens: 30, outputTokens: 15, totalTokens: 45 });
  });

  it('由 SDK 校验非法工具输入，并将错误传回模型以便恢复', async () => {
    let call = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        call += 1;
        if (call === 1)
          return toolCall('invalid', 'search_entities', {
            query: '',
            locale: 'zh-CN',
            types: ['enemy']
          });
        expect(JSON.stringify(options.prompt)).toMatch(/tool-error|Invalid input/i);
        return answer({ answer: '已说明无法执行该查询。' });
      }
    });
    const response = await runDataAgent('非法输入', { model });
    expect(response.structuredAnswer).toBe(true);
    expect(response.trace).toEqual([
      expect.objectContaining({
        tool: 'search_entities',
        ok: false,
        errorCode: 'INVALID_ARGUMENTS'
      })
    ]);
  });

  it('将确定性工具错误转换为安全结果，并允许模型恢复', async () => {
    let call = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        call += 1;
        if (call === 1)
          return toolCall('failed', 'search_entities', {
            query: '鸭鸭',
            locale: 'zh-CN',
            types: ['character']
          });
        const prompt = JSON.stringify(options.prompt);
        expect(prompt).toContain('TOOL_EXECUTION_FAILED');
        expect(prompt).not.toContain('private executor detail');
        return answer({ answer: '数据工具执行失败，无法完成查询。' });
      }
    });
    const response = await runDataAgent('工具错误', {
      model,
      toolExecutors: {
        searchEntities: async () => {
          throw new Error('private executor detail');
        }
      }
    });
    expect(response.structuredAnswer).toBe(true);
    expect(response.trace).toContainEqual(
      expect.objectContaining({
        tool: 'search_entities',
        ok: false,
        errorCode: 'TOOL_EXECUTION_FAILED'
      })
    );
  });

  it('保留工具截断限制与 evidence', async () => {
    let call = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        call += 1;
        if (call === 1)
          return toolCall('query', 'query_endgame', {
            locale: 'zh-CN',
            filter: { seasons: { kind: 'ids', seasons: [{ mode: 'as', groupId: 3020 }] } },
            include: ['enemy-identity'],
            limit: 1
          });
        const evidenceId = JSON.stringify(options.prompt).match(/eg1\/[a-f0-9]{64}/)?.[0];
        if (!evidenceId) throw new Error('mock did not receive query evidence');
        return answer({ answer: '完成', evidenceIds: [evidenceId] });
      }
    });
    const response = await runDataAgent('截断验证', { model });
    expect(response.invalidEvidenceIds).toEqual([]);
    expect(response.truncationDisclosure).toEqual({
      required: true,
      modelProvided: false,
      runtimeEnforced: true
    });
    expect(response.answer.limitations).toContain('用于结论的工具结果已截断，答案可能不完整。');
  });

  it('在四个 SDK steps 后安全停止，不把未完成 tool call 当成终答', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: Array.from({ length: MAX_MODEL_STEPS }, (_, index) =>
        toolCall(`call-${index}`, 'search_entities', {
          query: '鸭鸭',
          locale: 'zh-CN',
          types: ['character']
        })
      )
    });
    const response = await runDataAgent('持续调用工具', { model });
    expect(response).toMatchObject({
      turns: MAX_MODEL_STEPS,
      toolCalls: MAX_MODEL_STEPS,
      structuredAnswer: false,
      hitTurnLimit: true
    });
    expect(response.answer.answer).toContain('没有生成最终回答');
  });

  it('单次运行最多执行八个工具', async () => {
    const calls = Array.from({ length: MAX_TOTAL_TOOL_CALLS + 1 }, (_, index) => ({
      type: 'tool-call' as const,
      toolCallId: `call-${index}`,
      toolName: 'search_entities',
      input: JSON.stringify({ query: '鸭鸭', locale: 'zh-CN', types: ['character'] })
    }));
    const model = new MockLanguageModelV4({
      doGenerate: [result(calls, 'tool-calls'), answer({ answer: '已达到工具限额。' })]
    });
    const response = await runDataAgent('工具数量上限', { model });
    expect(response.toolCalls).toBe(MAX_TOTAL_TOOL_CALLS);
    expect(response.trace).toHaveLength(MAX_TOTAL_TOOL_CALLS + 1);
    expect(response.trace).toContainEqual(
      expect.objectContaining({ ok: false, errorCode: 'TOOL_CALL_LIMIT_EXCEEDED' })
    );
  });

  it('将非法结构化终答映射为安全错误', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: result([{ type: 'text', text: 'not json' }])
    });
    await expect(runDataAgent('非法终答', { model })).rejects.toMatchObject({
      code: 'structured-output',
      safeMessage: '模型未返回满足约定结构的最终答案。'
    });
  });

  it('将 SDK timeout 映射为安全错误', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: ({ abortSignal }) =>
        new Promise<GenerateResult>((_resolve, reject) => {
          abortSignal?.addEventListener('abort', () => reject(abortSignal.reason), { once: true });
        })
    });
    await expect(
      runDataAgent('超时', {
        model,
        timeout: { totalMs: 20, stepMs: 20, toolMs: 20 }
      })
    ).rejects.toMatchObject({ code: 'timeout', safeMessage: 'Agent 请求超时或已取消。' });
  });
});

describe('official DeepSeek provider configuration', () => {
  it('保留 key、base URL 与默认 model 边界', () => {
    expect(() => createDeepSeekModelFromEnv({})).toThrow(AgentConfigurationError);
    expect(() =>
      createDeepSeekModelFromEnv({ DEEPSEEK_API_KEY: 'secret', DEEPSEEK_BASE_URL: 'file:///tmp' })
    ).toThrow('must use http or https');
    const model = createDeepSeekModelFromEnv({ DEEPSEEK_API_KEY: 'secret' });
    expect(model).toMatchObject({ provider: 'deepseek.chat', modelId: 'deepseek-flash' });
  });

  it('配置错误通过 runtime 只暴露安全信息', async () => {
    await expect(runDataAgent('问题', { environment: {} })).rejects.toBeInstanceOf(DataAgentError);
    await expect(runDataAgent('问题', { environment: {} })).rejects.toMatchObject({
      code: 'configuration',
      safeMessage: 'DEEPSEEK_API_KEY is missing'
    });
  });
});
