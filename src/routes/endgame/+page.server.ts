import { getEndgameLanding } from '$lib/server/endgame';

export const prerender = true;

export async function load() {
  return { modes: await getEndgameLanding() };
}
