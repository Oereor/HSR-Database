import { tool } from 'ai';
import {
  aggregateEndgameInputSchema,
  queryEndgameInputSchema,
  searchEntitiesInputSchema,
  selectEndgameExtremaInputSchema
} from '../../agent/contracts.js';
import { aggregateEndgame, selectEndgameExtrema } from './endgame-aggregate.js';
import { queryEndgame } from './endgame-query.js';
import { searchEntities } from './entity-resolution.js';

export const MAX_TOTAL_TOOL_CALLS = 8;

export interface AgentToolRuntime {
  executedToolCalls: number;
}

export interface AgentToolExecutors {
  searchEntities: typeof searchEntities;
  queryEndgame: typeof queryEndgame;
  aggregateEndgame: typeof aggregateEndgame;
  selectEndgameExtrema: typeof selectEndgameExtrema;
}

const DEFAULT_EXECUTORS: AgentToolExecutors = {
  searchEntities,
  queryEndgame,
  aggregateEndgame,
  selectEndgameExtrema
};

const descriptions = {
  search_entities:
    '仅用于把用户明确提到的角色、光锥、遗器或敌人名称/alias 解析成数据库 stable entity identity；问题没有具体实体名时不要调用，也不要用于枚举 Endgame 赛期敌人。enemy match 的 enemyTemplateId 只能交给 Endgame tools 的 filter.enemyTemplateIds；MonsterID 只能来自具体 Endgame Monster identity，不得由 enemyTemplateId 推断。每个 match 的 evidenceId 才是合法引用；data identity 不是 evidence ID。',
  query_endgame:
    '检索、筛选、全局排序和 drill-down HSR Endgame configured-occurrence rows；“最高的具体配置行”使用 sort + limit。include 必须只列回答所需 projection。跨行数值汇总使用 aggregate_endgame；“哪个身份/位置产生最高或最低值”使用 select_endgame_extrema。weaknessesAny 只筛选 rows。每行 evidenceId 才是合法引用；PF rows 不代表实际刷新。',
  aggregate_endgame:
    '对 Endgame configured-occurrence rows 做确定性的 rowCount、countDistinct、min、max、avg 和有限 groupBy，回答“多少、平均值或极值数值是多少”。weakness 是 bounded multi-valued explode 维度，只在按弱点类别汇总时使用。需要返回产生极值的身份/位置时改用 select_endgame_extrema。每个 group 的 evidenceId 引用该聚合结果。',
  select_endgame_extrema:
    '选择 Endgame 范围或各 group 内产生最小/最大数值的 enemyTemplate、Monster 或 location，回答“是谁/在哪里产生极值”。查全局获胜身份时必须省略 groupBy；只有需要每个独立分组的获胜者时才 groupBy，不要把 select 的身份维度重复用作 groupBy。结果保留确定性 distinct ties 及其截断信息，并同时返回极值数值。单个具体全局 top/bottom 配置行仍使用 query_endgame。每个 group 的 evidenceId 使用现有 ag1 聚合证据语义。'
} as const;

function safeError(code: string, hint: string) {
  return { error: { code, retryable: false, hint } };
}

async function executeBounded<Input>(
  runtime: AgentToolRuntime,
  input: Input,
  execute: (value: Input) => Promise<unknown>
) {
  if (runtime.executedToolCalls >= MAX_TOTAL_TOOL_CALLS)
    return safeError(
      'TOOL_CALL_LIMIT_EXCEEDED',
      'Do not call more tools; answer from the results already returned.'
    );

  runtime.executedToolCalls += 1;
  try {
    return await execute(input);
  } catch {
    return safeError(
      'TOOL_EXECUTION_FAILED',
      'The validated read-only operation failed; retry once with a smaller valid request if useful.'
    );
  }
}

export function createAgentTools(
  runtime: AgentToolRuntime,
  executors: Partial<AgentToolExecutors> = {}
) {
  const resolvedExecutors = { ...DEFAULT_EXECUTORS, ...executors };
  return {
    search_entities: tool({
      description: descriptions.search_entities,
      inputSchema: searchEntitiesInputSchema,
      execute: (input) => executeBounded(runtime, input, resolvedExecutors.searchEntities)
    }),
    query_endgame: tool({
      description: descriptions.query_endgame,
      inputSchema: queryEndgameInputSchema,
      execute: (input) => executeBounded(runtime, input, resolvedExecutors.queryEndgame)
    }),
    aggregate_endgame: tool({
      description: descriptions.aggregate_endgame,
      inputSchema: aggregateEndgameInputSchema,
      execute: (input) => executeBounded(runtime, input, resolvedExecutors.aggregateEndgame)
    }),
    select_endgame_extrema: tool({
      description: descriptions.select_endgame_extrema,
      inputSchema: selectEndgameExtremaInputSchema,
      execute: (input) => executeBounded(runtime, input, resolvedExecutors.selectEndgameExtrema)
    })
  };
}

export type AgentTools = ReturnType<typeof createAgentTools>;
