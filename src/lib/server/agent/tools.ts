import { z } from 'zod';
import {
  aggregateEndgameInputSchema,
  queryEndgameInputSchema,
  searchEntitiesInputSchema
} from '../../agent/contracts.js';
import { aggregateEndgame } from './endgame-aggregate.js';
import { queryEndgame } from './endgame-query.js';
import { searchEntities } from './entity-resolution.js';
import type { AgentToolName } from '../../agent/tool-names.js';

export type { AgentToolName } from '../../agent/tool-names.js';

export interface AgentToolDefinition {
  type: 'function';
  function: {
    name: AgentToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
}

type ToolEntry = {
  schema: z.ZodType;
  description: string;
  execute: (input: never) => Promise<unknown>;
};

const entries: Record<AgentToolName, ToolEntry> = {
  search_entities: {
    schema: searchEntitiesInputSchema,
    description:
      '仅用于把用户明确提到的角色、光锥、遗器或敌人名称/alias 解析成数据库 stable entity identity；问题没有具体实体名时不要调用，也不要用于枚举 Endgame 赛期敌人。enemy match 的 enemyTemplateId 只能交给 query_endgame/aggregate_endgame filter.enemyTemplateIds；MonsterID 只能来自具体 Endgame Monster identity，不得由 enemyTemplateId 推断。每个 match 的 evidenceId 才是合法引用；data identity 不是 evidence ID。',
    execute: searchEntities as ToolEntry['execute']
  },
  query_endgame: {
    schema: queryEndgameInputSchema,
    description:
      '直接检索、筛选、全局排序和 drill-down HSR Endgame configured-occurrence rows；单个具体全局 top/bottom row 使用 sort + limit。include 必须只列回答所需 projection。跨多行 count/distinct/min/max/avg 或分组内 extrema 应使用 aggregate_endgame。weaknessesAny 只筛选具有指定弱点的 rows，不代表按弱点分类。每行 evidenceId 才是合法引用；MonsterID、templateId、groupId/seasonId 都不是 evidence ID。PF rows 不代表实际刷新。',
    execute: queryEndgame as ToolEntry['execute']
  },
  aggregate_endgame: {
    schema: aggregateEndgameInputSchema,
    description:
      '直接对 Endgame configured-occurrence rows 做确定性的 rowCount、countDistinct、min、max、avg、argMin/argMax 和有限 groupBy。weakness 是 bounded multi-valued explode 维度：一行对每个不同弱点组各贡献一次；只有用户要按弱点类别比较/汇总时才使用。argMin/argMax 在每个 aggregate group 内返回数值极值、bounded associated identity/location 和并列；单个具体全局 top/bottom row 应用 query_endgame。每个 group 的 evidenceId 引用该聚合结果；其他 data ID 都不是 evidence ID。',
    execute: aggregateEndgame as ToolEntry['execute']
  }
};

export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = (
  Object.entries(entries) as Array<[AgentToolName, ToolEntry]>
).map(([name, entry]) => ({
  type: 'function',
  function: {
    name,
    description: entry.description,
    parameters: z.toJSONSchema(entry.schema, {
      target: 'draft-7',
      unrepresentable: 'any'
    }) as Record<string, unknown>
  }
}));

export interface ToolExecutionResult {
  ok: boolean;
  validatedArgs?: unknown;
  result: unknown;
}

function safeError(code: string, hint: string, path?: string) {
  return { error: { code, retryable: false, hint, ...(path ? { path } : {}) } };
}

export async function executeAgentTool(
  name: string,
  rawArguments: string
): Promise<ToolExecutionResult> {
  if (!(name in entries))
    return {
      ok: false,
      result: safeError(
        'UNKNOWN_TOOL',
        'Allowed tools: search_entities, query_endgame, aggregate_endgame.'
      )
    };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArguments);
  } catch {
    return {
      ok: false,
      result: safeError('INVALID_JSON', 'Tool arguments must be one valid JSON object.')
    };
  }
  const entry = entries[name as AgentToolName];
  const validated = entry.schema.safeParse(parsed);
  if (!validated.success) {
    const issue = validated.error.issues[0];
    const path = issue?.path.map(String).join('.') || undefined;
    const allowedValues =
      issue && 'values' in issue && Array.isArray(issue.values)
        ? issue.values.filter((value) => ['string', 'number', 'boolean'].includes(typeof value))
        : [];
    return {
      ok: false,
      result: safeError(
        'INVALID_ARGUMENTS',
        allowedValues.length
          ? `Use one of the allowed values: ${allowedValues.join(', ')}.`
          : 'Correct the required field, type, range, or strict object shape shown by the tool schema.',
        path
      )
    };
  }
  try {
    return {
      ok: true,
      validatedArgs: validated.data,
      result: await entry.execute(validated.data as never)
    };
  } catch {
    return {
      ok: false,
      validatedArgs: validated.data,
      result: safeError(
        'TOOL_EXECUTION_FAILED',
        'The validated read-only operation failed; retry once with a smaller valid request if useful.'
      )
    };
  }
}
