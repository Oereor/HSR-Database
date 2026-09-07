import { json } from '@sveltejs/kit';
import { getEndgameOccurrenceShard, getEndgameOccurrenceTargetIds } from '$lib/server/endgame';
import { isLocale } from '$lib/paraglide/runtime.js';
import type { RequestHandler } from './$types';

export const prerender = true;
export const entries = getEndgameOccurrenceTargetIds;

export const GET: RequestHandler = async ({ params }) => {
  if (!isLocale(params.locale)) return new Response('Not found', { status: 404 });
  const shard = await getEndgameOccurrenceShard(params.targetId, params.locale);
  return shard ? json(shard) : new Response('Not found', { status: 404 });
};
