import type { EndgameSearchOccurrence, EndgameSearchSeasonResult } from './endgame.js';

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

interface SearchEncounterPosition {
  key: string;
  node: number;
  stage: number;
  wave: number;
  enemies: EndgameSearchOccurrence[];
}

interface SearchEncounter {
  id: string;
  positions: Map<string, SearchEncounterPosition>;
}

/** Group an already ordered, windowed season by the same identity used by its detail page. */
export function groupEndgameSearchEncounters(enemies: EndgameSearchOccurrence[]) {
  const encounters = new Map<string, SearchEncounter>();
  for (const enemy of enemies) {
    const { encounterId, battleSlot, stageId, wave } = enemy.locator;
    const encounter = encounters.get(encounterId) ?? { id: encounterId, positions: new Map() };
    encounters.set(encounterId, encounter);
    const key = JSON.stringify([battleSlot, stageId, wave]);
    const position = encounter.positions.get(key) ?? {
      key,
      node: battleSlot,
      stage: enemy.order.stage + 1,
      wave: enemy.order.wave + 1,
      enemies: []
    };
    position.enemies.push(enemy);
    encounter.positions.set(key, position);
  }
  return [...encounters.values()].map(({ id, positions }) => ({
    id,
    positions: [...positions.values()]
  }));
}
