import { isRogueMode } from '$lib/domain/rogue';

export function match(param: string): boolean {
  return isRogueMode(param);
}
