import { json } from '@sveltejs/kit';
import { getEndgameOccurrenceShard, getEndgameOccurrenceTargetIds } from '$lib/server/endgame';
import type { RequestHandler } from './$types';

export const prerender = true;
export const entries = getEndgameOccurrenceTargetIds;

export const GET: RequestHandler = async ({ params }) => {
  const shard = await getEndgameOccurrenceShard(params.targetId, 'zh-CN');
  return shard ? json(shard) : new Response('Not found', { status: 404 });
};
