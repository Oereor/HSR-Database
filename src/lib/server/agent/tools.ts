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
      '在 HSR-Database Search V2 中解析角色、光锥、遗器或敌人的中文名称与别名，返回稳定实体 ID、匹配依据和歧义候选。',
    execute: searchEntities as ToolEntry['execute']
  },
  query_endgame: {
    schema: queryEndgameInputSchema,
    description:
      '检索、筛选、投影和排序 HSR Endgame configured-occurrence rows。适合读取具体赛期、位置、敌人身份、弱点、实例属性与机制事实；不代表 PF 运行时实际刷新。',
    execute: queryEndgame as ToolEntry['execute']
  },
  aggregate_endgame: {
    schema: aggregateEndgameInputSchema,
    description:
      '对符合条件的 Endgame configured-occurrence rows 执行受限的确定性分组和聚合，用于 row count、distinct count、min、max、avg 等跨行计算。',
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

function safeError(code: string) {
  return { error: { code, retryable: false } };
}

export async function executeAgentTool(
  name: string,
  rawArguments: string
): Promise<ToolExecutionResult> {
  if (!(name in entries)) return { ok: false, result: safeError('UNKNOWN_TOOL') };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArguments);
  } catch {
    return { ok: false, result: safeError('INVALID_JSON') };
  }
  const entry = entries[name as AgentToolName];
  const validated = entry.schema.safeParse(parsed);
  if (!validated.success)
    return {
      ok: false,
      result: safeError('INVALID_ARGUMENTS')
    };
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
      result: safeError('TOOL_EXECUTION_FAILED')
    };
  }
}
