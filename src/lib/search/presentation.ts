import type { EndgameSearchSeasonResult } from './endgame.js';

export const SEARCH_DISPLAY_BATCH = 100;

/** A single mode-wide window in the existing season/locator order. */
export function windowEndgameSeasons(
  seasons: EndgameSearchSeasonResult[],
  limit: number
): EndgameSearchSeasonResult[] {
  let remaining = limit;
  const visible: EndgameSearchSeasonResult[] = [];
  for (const season of seasons) {
    if (remaining <= 0) break;
    const enemies = season.enemies.slice(0, remaining);
    visible.push({ ...season, enemies });
    remaining -= enemies.length;
  }
  return visible;
}
