import { isEndgameMode } from '$lib/domain/endgame-view';
import { getEndgameGroup, getEndgameGroupEntries } from '$lib/server/endgame';
import { error } from '@sveltejs/kit';

export const prerender = true;
export const entries = getEndgameGroupEntries;

export async function load({ params }) {
  if (!isEndgameMode(params.mode) || !/^\d+$/.test(params.groupId)) error(404, '终局赛期不存在');
  const group = await getEndgameGroup(params.mode, Number(params.groupId));
  if (!group) error(404, '终局赛期不存在');
  return { group };
}
