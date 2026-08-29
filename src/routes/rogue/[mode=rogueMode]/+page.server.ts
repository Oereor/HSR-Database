import { error } from '@sveltejs/kit';
import { isRogueMode, ROGUE_MODES } from '$lib/domain/rogue';
import { getRogueSuPage } from '$lib/server/rogue';

export const prerender = true;
export const entries = () => ROGUE_MODES.filter((mode) => mode !== 'du').map((mode) => ({ mode }));

export async function load({ params }) {
  if (!isRogueMode(params.mode) || params.mode === 'du') error(404, 'Rogue 模式不存在');
  return { rogue: await getRogueSuPage(params.mode) };
}
