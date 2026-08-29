import { getRogueDuPage } from '$lib/server/rogue';

export const prerender = true;

export async function load() {
  return { rogue: await getRogueDuPage() };
}
