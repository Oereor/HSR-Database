import { isEndgameMode } from '$lib/domain/endgame-view';

export function match(param: string): boolean {
  return isEndgameMode(param);
}
