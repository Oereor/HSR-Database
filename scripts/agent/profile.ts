import { fingerprintTools } from 'ai';
import { z } from 'zod';
import {
  AGENT_STEP_TIMEOUT_MS,
  AGENT_TOOL_TIMEOUT_MS,
  AGENT_TOTAL_TIMEOUT_MS,
  DATA_AGENT_INSTRUCTIONS,
  MAX_MODEL_STEPS
} from '../../src/lib/server/agent/runtime.js';
import {
  aggregateEndgameInputSchema,
  queryEndgameInputSchema,
  searchEntitiesInputSchema,
  selectEndgameExtremaInputSchema
} from '../../src/lib/agent/contracts.js';
import {
  aggregateEndgame,
  selectEndgameExtrema
} from '../../src/lib/server/agent/endgame-aggregate.js';
import { queryEndgame } from '../../src/lib/server/agent/endgame-query.js';
import { searchEntities } from '../../src/lib/server/agent/entity-resolution.js';
import { createAgentTools, MAX_TOTAL_TOOL_CALLS } from '../../src/lib/server/agent/tools.js';

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
    },
    select_endgame_extrema: {
      description: agentTools.select_endgame_extrema.description,
      inputSchema: z.toJSONSchema(selectEndgameExtremaInputSchema)
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
  const extrema = await selectEndgameExtrema(
    selectEndgameExtremaInputSchema.parse({
      locale: 'zh-CN',
      filter: { modes: ['pf'], statuses: ['current'], encounterOrdinals: [4] },
      groupBy: [],
      extrema: [{ op: 'argMax', field: 'hpPerBar', select: ['enemyTemplate'], as: 'highestHp' }]
    })
  );
  const toolResultBytes = [bytes(search), bytes(query), bytes(aggregate), bytes(extrema)];
  const simulatedMessages = [
    { role: 'system', content: DATA_AGENT_INSTRUCTIONS },
    { role: 'user', content: '代表性离线 profile' },
    { role: 'tool', tool_call_id: 'search', content: JSON.stringify(search) },
    { role: 'tool', tool_call_id: 'query', content: JSON.stringify(query) },
    { role: 'tool', tool_call_id: 'aggregate', content: JSON.stringify(aggregate) },
    { role: 'tool', tool_call_id: 'extrema', content: JSON.stringify(extrema) }
  ];
  const toolDefinitions = Object.fromEntries(
    Object.entries(toolManifest).map(([name, definition]) => [
      name,
      {
        definitionBytes: bytes(definition),
        descriptionBytes: bytes(definition.description),
        jsonSchemaBytes: bytes(definition.inputSchema)
      }
    ])
  );
  const largestTool = Object.entries(toolDefinitions).sort(
    ([, left], [, right]) => right.definitionBytes - left.definitionBytes
  )[0];
  console.log(
    JSON.stringify(
      {
        realModelCalls: 0,
        limits: {
          maxModelSteps: MAX_MODEL_STEPS,
          maxTotalToolCalls: MAX_TOTAL_TOOL_CALLS,
          totalTimeoutMs: AGENT_TOTAL_TIMEOUT_MS,
          stepTimeoutMs: AGENT_STEP_TIMEOUT_MS,
          toolTimeoutMs: AGENT_TOOL_TIMEOUT_MS
        },
        systemInstructionsBytes: bytes(DATA_AGENT_INSTRUCTIONS),
        toolDefinitionMetrics: {
          count: Object.keys(toolManifest).length,
          totalBytes: bytes(toolManifest),
          largest: { name: largestTool[0], bytes: largestTool[1].definitionBytes },
          byTool: toolDefinitions,
          metricBranches: { aggregate_endgame: 5, select_endgame_extrema: 2 }
        },
        toolFingerprints,
        toolResults: [
          resultSummary('search-entity-ambiguity', search),
          resultSummary('query-moc-default-window', query),
          resultSummary('aggregate-moc-boss-frequency', aggregate),
          resultSummary('extrema-current-pf-floor-four', extrema)
        ],
        totalToolResultBytes: toolResultBytes.reduce((sum, value) => sum + value, 0),
        simulatedMessageHistoryBytesByStep: simulatedMessages.map((_, index) =>
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
