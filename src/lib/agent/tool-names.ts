import { z } from 'zod';

export const AgentToolNameSchema = z.enum([
  'search_entities',
  'query_endgame',
  'aggregate_endgame'
]);
export type AgentToolName = z.infer<typeof AgentToolNameSchema>;
