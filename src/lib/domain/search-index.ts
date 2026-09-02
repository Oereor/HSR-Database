import type { EndgameMode, EndgameModeDataset } from './endgame';
import {
  ENDGAME_MODES,
  presentedStageWaves,
  type EndgameEnemyGridItem,
  type EndgamePeriodView
} from './endgame-view';
import { gameTextToPlain } from './game-text';
import type { EntityKind, SearchEntry } from './types';

export const GLOBAL_SEARCH_SCHEMA_VERSION = 1 as const;

export const normalizeSearch = (value: string): string =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s·•・—_\-/]+/g, '');

export const normalizeSearchLabel = (value: string): string =>
  normalizeSearch(gameTextToPlain(value));

export interface GlobalSearchEntityEntry {
  kind: EntityKind;
  id: string;
  name: string;
  normalizedLabels: string[];
}

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
  normalizedName: string;
  locators: EndgameOccurrenceLocator[];
}

export interface GlobalSearchIndex {
  schemaVersion: typeof GLOBAL_SEARCH_SCHEMA_VERSION;
  entities: GlobalSearchEntityEntry[];
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

export function buildSearchEntityEntries(entries: SearchEntry[]): GlobalSearchEntityEntry[] {
  return entries.map(({ kind, id, name, aliases }) => ({
    kind,
    id,
    name,
    normalizedLabels: [...new Set([name, ...aliases].map(normalizeSearchLabel).filter(Boolean))]
  }));
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
                    normalizedName: normalizeSearchLabel(name),
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
