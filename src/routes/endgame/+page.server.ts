import { getEndgameLanding } from '$lib/server/endgame';

export const prerender = true;

export async function load({ locals }) {
  return { modes: await getEndgameLanding(locals.locale) };
}
