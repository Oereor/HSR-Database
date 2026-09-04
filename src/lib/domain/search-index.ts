import type { EndgameMode, EndgameModeDataset } from './endgame';
import {
  ENDGAME_MODES,
  presentedStageWaves,
  type EndgameEnemyGridItem,
  type EndgamePeriodView
} from './endgame-view';
import type { SearchDocumentBundle } from '../search/documents.js';
export { SEARCH_DOCUMENT_SCHEMA_VERSION as GLOBAL_SEARCH_SCHEMA_VERSION } from '../search/documents.js';
export { normalizeSearch, normalizeSearchLabel } from '../search/normalization.js';

export interface EndgameOccurrenceLocator {
  mode: EndgameMode;
  groupId: number;
  encounterIndex: number;
  battleIndex: number;
  stageIndex: number;
  waveIndex: number;
  occurrenceIndex: number;
}

export interface EndgameSearchNameEntry {
  entryId: string;
  name: string;
  locators: EndgameOccurrenceLocator[];
}

export interface GlobalSearchIndex extends SearchDocumentBundle {
  endgameEnemies: EndgameSearchNameEntry[];
}

export interface EndgameOccurrenceShardPeriod {
  mode: EndgameMode;
  period: EndgamePeriodView;
}

export interface EndgameOccurrenceShard {
  schemaVersion: 1;
  entryId: string;
  periods: EndgameOccurrenceShardPeriod[];
  occurrences: Record<string, EndgameEnemyGridItem>;
}

export function endgameOccurrenceLocatorKey(locator: EndgameOccurrenceLocator): string {
  return [
    locator.mode,
    locator.groupId,
    locator.encounterIndex,
    locator.battleIndex,
    locator.stageIndex,
    locator.waveIndex,
    locator.occurrenceIndex
  ].join(':');
}

export function collectEndgameSearchNames(
  datasets: Record<EndgameMode, EndgameModeDataset>,
  entryIdForName: (name: string) => string
): EndgameSearchNameEntry[] {
  const byName = new Map<string, EndgameSearchNameEntry>();
  for (const mode of ENDGAME_MODES) {
    for (const group of [...datasets[mode].groups].sort((a, b) => b.groupId - a.groupId)) {
      group.encounters.forEach((encounter, encounterIndex) =>
        encounter.battles.forEach((battle, battleIndex) =>
          battle.stages.forEach((stage, stageIndex) =>
            presentedStageWaves(stage).forEach((wave, waveIndex) =>
              wave.forEach(({ occurrence }, occurrenceIndex) => {
                const name = occurrence.name?.trim();
                if (!name) return;
                let entry = byName.get(name);
                if (!entry) {
                  entry = {
                    entryId: entryIdForName(name),
                    name,
                    locators: []
                  };
                  byName.set(name, entry);
                }
                entry.locators.push({
                  mode,
                  groupId: group.groupId,
                  encounterIndex,
                  battleIndex,
                  stageIndex,
                  waveIndex,
                  occurrenceIndex
                });
              })
            )
          )
        )
      );
    }
  }
  return [...byName.values()];
}
