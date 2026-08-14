import { isEndgameMode } from '$lib/domain/endgame-view';
import { getEndgameMode } from '$lib/server/endgame';
import { error } from '@sveltejs/kit';

export const prerender = true;
export const entries = () => ['moc', 'pf', 'as', 'aa'].map((mode) => ({ mode }));

export async function load({ params }) {
  if (!isEndgameMode(params.mode)) error(404, '终局模式不存在');
  return { mode: await getEndgameMode(params.mode) };
}
