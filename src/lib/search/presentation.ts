import type { EndgameSearchOccurrence, EndgameSearchSeasonResult } from './endgame.js';

export const SEARCH_DISPLAY_BATCH = 100;

export interface EndgameSearchEncounterMetadata {
  label: string;
  waveCountsBySlot: Partial<Record<number, readonly number[]>>;
}

export type EndgameSearchSeasonMetadata = Record<string, EndgameSearchEncounterMetadata>;

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
  node?: number;
  stage?: number;
  wave?: number;
  enemies: EndgameSearchOccurrence[];
}

interface SearchEncounter {
  id: string;
  positions: Map<string, SearchEncounterPosition>;
}

function searchPosition(
  { locator, order }: EndgameSearchOccurrence,
  info: EndgameSearchEncounterMetadata | undefined
): Pick<SearchEncounterPosition, 'node' | 'stage' | 'wave'> {
  const { battleSlot, mode } = locator;
  const stageCounts = info?.waveCountsBySlot[battleSlot];
  const waveCount = stageCounts?.[order.stage];
  if (!info || !stageCounts || waveCount === undefined || order.wave >= waveCount)
    return { node: battleSlot, stage: order.stage + 1, wave: order.wave + 1 };

  const node = Object.keys(info.waveCountsBySlot).length > 1 ? battleSlot : undefined;
  if (mode === 'as') {
    return {
      node,
      stage: stageCounts.length > 1 ? order.stage + 1 : undefined,
      wave: waveCount > 1 ? order.wave + 1 : undefined
    };
  }

  // The detail page numbers the waves continuously across all stages in a node.
  const totalWaves = stageCounts.reduce((total, count) => total + count, 0);
  const precedingWaves = stageCounts
    .slice(0, order.stage)
    .reduce((total, count) => total + count, 0);
  return { node, wave: totalWaves > 1 ? precedingWaves + order.wave + 1 : undefined };
}

/** Group an already ordered, windowed season by the same identity used by its detail page. */
export function groupEndgameSearchEncounters(
  enemies: EndgameSearchOccurrence[],
  metadata?: EndgameSearchSeasonMetadata
) {
  const encounters = new Map<string, SearchEncounter>();
  for (const enemy of enemies) {
    const { encounterId, battleSlot, stageId, wave } = enemy.locator;
    const encounter = encounters.get(encounterId) ?? { id: encounterId, positions: new Map() };
    encounters.set(encounterId, encounter);
    const key = JSON.stringify([battleSlot, stageId, wave]);
    const position = encounter.positions.get(key) ?? {
      key,
      ...searchPosition(enemy, metadata?.[encounterId]),
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
