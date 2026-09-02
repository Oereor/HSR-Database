import { json } from '@sveltejs/kit';
import { getEndgameOccurrenceEntryIds, getEndgameOccurrenceShard } from '$lib/server/endgame';
import type { RequestHandler } from './$types';

export const prerender = true;
export const entries = getEndgameOccurrenceEntryIds;

export const GET: RequestHandler = async ({ params }) => {
  const shard = await getEndgameOccurrenceShard(params.entryId);
  return shard ? json(shard) : new Response('Not found', { status: 404 });
};
