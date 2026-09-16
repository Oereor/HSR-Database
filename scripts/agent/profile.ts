import { fingerprintTools } from 'ai';
import { z } from 'zod';
import { DATA_AGENT_INSTRUCTIONS } from '../../src/lib/server/agent/runtime.js';
import {
  aggregateEndgameInputSchema,
  queryEndgameInputSchema,
  searchEntitiesInputSchema
} from '../../src/lib/agent/contracts.js';
import { aggregateEndgame } from '../../src/lib/server/agent/endgame-aggregate.js';
import { queryEndgame } from '../../src/lib/server/agent/endgame-query.js';
import { searchEntities } from '../../src/lib/server/agent/entity-resolution.js';
import { createAgentTools } from '../../src/lib/server/agent/tools.js';

function bytes(value: unknown): number {
  return Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
}

function resultSummary(name: string, result: Record<string, unknown>) {
  return {
    name,
    bytes: bytes(result),
    rows: typeof result.returnedRows === 'number' ? result.returnedRows : undefined,
    groups: typeof result.returnedGroups === 'number' ? result.returnedGroups : undefined,
    truncated: typeof result.truncated === 'boolean' ? result.truncated : undefined
  };
}

async function main() {
  const agentTools = createAgentTools({ executedToolCalls: 0 });
  const toolManifest = {
    search_entities: {
      description: agentTools.search_entities.description,
      inputSchema: z.toJSONSchema(searchEntitiesInputSchema)
    },
    query_endgame: {
      description: agentTools.query_endgame.description,
      inputSchema: z.toJSONSchema(queryEndgameInputSchema)
    },
    aggregate_endgame: {
      description: agentTools.aggregate_endgame.description,
      inputSchema: z.toJSONSchema(aggregateEndgameInputSchema)
    }
  };
  const toolFingerprints = await fingerprintTools(agentTools);
  const search = await searchEntities(
    searchEntitiesInputSchema.parse({
      query: '可可利亚',
      locale: 'zh-CN',
      types: ['enemy']
    })
  );
  const query = await queryEndgame(
    queryEndgameInputSchema.parse({
      locale: 'zh-CN',
      filter: {
        seasons: { kind: 'ids', seasons: [{ mode: 'moc', groupId: 1033 }] }
      },
      include: ['location', 'enemy-identity']
    })
  );
  const aggregate = await aggregateEndgame(
    aggregateEndgameInputSchema.parse({
      locale: 'zh-CN',
      filter: {
        modes: ['moc'],
        seasons: { kind: 'latest-per-mode', count: 10, includeUpcoming: false },
        enemyRankCategories: ['boss']
      },
      groupBy: ['enemyTemplate'],
      metrics: [{ op: 'countDistinct', field: 'seasonKey', as: 'seasonCount' }],
      sort: [{ by: 'metric', metric: 'seasonCount', direction: 'desc' }]
    })
  );
  const toolResultBytes = [bytes(search), bytes(query), bytes(aggregate)];
  const simulatedMessages = [
    { role: 'system', content: DATA_AGENT_INSTRUCTIONS },
    { role: 'user', content: '代表性离线 profile' },
    { role: 'tool', tool_call_id: 'search', content: JSON.stringify(search) },
    { role: 'tool', tool_call_id: 'query', content: JSON.stringify(query) },
    { role: 'tool', tool_call_id: 'aggregate', content: JSON.stringify(aggregate) }
  ];
  console.log(
    JSON.stringify(
      {
        realModelCalls: 0,
        systemPromptBytes: bytes(DATA_AGENT_INSTRUCTIONS),
        toolDefinitionsBytes: bytes(toolManifest),
        toolFingerprints,
        toolResults: [
          resultSummary('search-entity-ambiguity', search),
          resultSummary('query-moc-default-window', query),
          resultSummary('aggregate-moc-boss-frequency', aggregate)
        ],
        totalToolResultBytes: toolResultBytes.reduce((sum, value) => sum + value, 0),
        simulatedMessageHistoryBytesByTurn: simulatedMessages.map((_, index) =>
          bytes({
            tools: toolManifest,
            messages: simulatedMessages.slice(0, index + 1)
          })
        )
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Agent profile failed');
  process.exitCode = 1;
});
