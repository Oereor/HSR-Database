import { z } from 'zod';

export const AgentToolNameSchema = z.enum([
  'search_entities',
  'query_endgame',
  'aggregate_endgame',
  'select_endgame_extrema'
]);
export type AgentToolName = z.infer<typeof AgentToolNameSchema>;
