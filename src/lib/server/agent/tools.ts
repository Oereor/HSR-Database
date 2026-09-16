import { tool } from 'ai';
import {
  aggregateEndgameInputSchema,
  queryEndgameInputSchema,
  searchEntitiesInputSchema
} from '../../agent/contracts.js';
import { aggregateEndgame } from './endgame-aggregate.js';
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
}

const DEFAULT_EXECUTORS: AgentToolExecutors = {
  searchEntities,
  queryEndgame,
  aggregateEndgame
};

const descriptions = {
  search_entities:
    '仅用于把用户明确提到的角色、光锥、遗器或敌人名称/alias 解析成数据库 stable entity identity；问题没有具体实体名时不要调用，也不要用于枚举 Endgame 赛期敌人。enemy match 的 enemyTemplateId 只能交给 query_endgame/aggregate_endgame filter.enemyTemplateIds；MonsterID 只能来自具体 Endgame Monster identity，不得由 enemyTemplateId 推断。每个 match 的 evidenceId 才是合法引用；data identity 不是 evidence ID。',
  query_endgame:
    '直接检索、筛选、全局排序和 drill-down HSR Endgame configured-occurrence rows；单个具体全局 top/bottom row 使用 sort + limit。include 必须只列回答所需 projection。跨多行 count/distinct/min/max/avg 或分组内 extrema 应使用 aggregate_endgame。weaknessesAny 只筛选具有指定弱点的 rows，不代表按弱点分类。每行 evidenceId 才是合法引用；MonsterID、templateId、groupId/seasonId 都不是 evidence ID。PF rows 不代表实际刷新。',
  aggregate_endgame:
    '直接对 Endgame configured-occurrence rows 做确定性的 rowCount、countDistinct、min、max、avg、argMin/argMax 和有限 groupBy。weakness 是 bounded multi-valued explode 维度：一行对每个不同弱点组各贡献一次；只有用户要按弱点类别比较/汇总时才使用。argMin/argMax 在每个 aggregate group 内返回数值极值、bounded associated identity/location 和并列；单个具体全局 top/bottom row 应用 query_endgame。每个 group 的 evidenceId 引用该聚合结果；其他 data ID 都不是 evidence ID。'
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
    })
  };
}

export type AgentTools = ReturnType<typeof createAgentTools>;
