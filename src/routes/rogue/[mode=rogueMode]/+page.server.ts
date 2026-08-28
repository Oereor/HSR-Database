import { error } from '@sveltejs/kit';
import { isRogueMode, ROGUE_MODES } from '$lib/domain/rogue';
import { getRoguePage } from '$lib/server/rogue';

export const prerender = true;
export const entries = () => ROGUE_MODES.map((mode) => ({ mode }));

export async function load({ params }) {
  if (!isRogueMode(params.mode)) error(404, 'Rogue 模式不存在');
  return { rogue: await getRoguePage(params.mode) };
}
