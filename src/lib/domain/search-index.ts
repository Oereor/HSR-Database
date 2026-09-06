import type { EndgameMode, EndgameModeDataset, EnemyOccurrence } from './endgame';
import {
  ENDGAME_MODES,
  presentedStageWaves,
  type EndgameEnemyGridItem,
  type EndgamePeriodView
} from './endgame-view';
import type { SearchDocumentBundle } from '../search/documents.js';
export { SEARCH_DOCUMENT_SCHEMA_VERSION as GLOBAL_SEARCH_SCHEMA_VERSION } from '../search/documents.js';

export type SearchLocale = 'zh-CN' | 'en';

export interface EndgameOccurrenceLocator {
  mode: EndgameMode;
  groupId: number;
  encounterId: string;
  battleSlot: number;
  stageId: number;
  wave: { kind: 'fixed'; number: number } | { kind: 'spawn-sequence'; infiniteWaveId: number };
  monsterId: number;
}

export interface EndgameOccurrenceOrder {
  encounter: number;
  battle: number;
  stage: number;
  wave: number;
  card: number;
}

export interface EndgameOccurrenceReference {
  locator: EndgameOccurrenceLocator;
  order: EndgameOccurrenceOrder;
}

export interface EndgameSearchTargetEntry {
  id: string;
  name: string;
  occurrences: EndgameOccurrenceReference[];
}

export interface GlobalSearchIndex extends SearchDocumentBundle {
  locale: SearchLocale;
  endgameTargets: EndgameSearchTargetEntry[];
}

export interface EndgameOccurrenceShardPeriod {
  mode: EndgameMode;
  period: EndgamePeriodView;
}

export interface EndgameOccurrenceShard {
  schemaVersion: 2;
  locale: SearchLocale;
  target: { kind: 'endgame'; id: string };
  periods: EndgameOccurrenceShardPeriod[];
  occurrences: Record<string, EndgameEnemyGridItem>;
}

export function endgameOccurrenceLocatorKey(locator: EndgameOccurrenceLocator): string {
  return JSON.stringify([
    locator.mode,
    locator.groupId,
    locator.encounterId,
    locator.battleSlot,
    locator.stageId,
    locator.wave.kind,
    locator.wave.kind === 'fixed' ? locator.wave.number : locator.wave.infiniteWaveId,
    locator.monsterId
  ]);
}

/** Enumerate presented cards with stable structural identity and separate display ordering. */
export function collectEndgameSearchOccurrences(datasets: Record<EndgameMode, EndgameModeDataset>) {
  const entries: Array<{
    occurrence: EnemyOccurrence;
    reference: EndgameOccurrenceReference;
  }> = [];
  const identities = new Set<string>();
  for (const mode of ENDGAME_MODES) {
    for (const group of [...datasets[mode].groups].sort((a, b) => b.groupId - a.groupId)) {
      group.encounters.forEach((encounter, encounterIndex) =>
        encounter.battles.forEach((battle, battleIndex) =>
          battle.stages.forEach((stage, stageIndex) => {
            const presented = presentedStageWaves(stage);
            presented.forEach((wave, waveIndex) =>
              wave.forEach(({ occurrence }, cardIndex) => {
                const locator: EndgameOccurrenceLocator = {
                  mode,
                  groupId: group.groupId,
                  encounterId: encounter.id,
                  battleSlot: battle.slot,
                  stageId: stage.stageId,
                  wave:
                    stage.waveModel.kind === 'fixed'
                      ? { kind: 'fixed', number: stage.waveModel.waves[waveIndex].wave }
                      : {
                          kind: 'spawn-sequence',
                          infiniteWaveId: stage.waveModel.waves[waveIndex].waveId
                        },
                  monsterId: occurrence.monsterId
                };
                const key = endgameOccurrenceLocatorKey(locator);
                if (identities.has(key))
                  throw new Error(`Duplicate presented Endgame occurrence locator: ${key}`);
                identities.add(key);
                entries.push({
                  occurrence,
                  reference: {
                    locator,
                    order: {
                      encounter: encounterIndex,
                      battle: battleIndex,
                      stage: stageIndex,
                      wave: waveIndex,
                      card: cardIndex
                    }
                  }
                });
              })
            );
          })
        )
      );
    }
  }
  return entries;
}

export function collectEndgameSearchTargets(
  datasets: Record<EndgameMode, EndgameModeDataset>,
  namesByTemplateId: ReadonlyMap<string, string>
): EndgameSearchTargetEntry[] {
  const byTemplate = new Map<string, EndgameSearchTargetEntry>();
  for (const { occurrence, reference } of collectEndgameSearchOccurrences(datasets)) {
    const id = String(occurrence.monsterTemplateId);
    const name = namesByTemplateId.get(id)?.trim();
    if (!name)
      throw new Error(
        `Missing projected Enemy name for Endgame template ${id}: ${endgameOccurrenceLocatorKey(reference.locator)}`
      );
    let entry = byTemplate.get(id);
    if (!entry) {
      entry = { id, name, occurrences: [] };
      byTemplate.set(id, entry);
    } else if (entry.name !== name) {
      throw new Error(`Inconsistent projected Enemy name for Endgame template ${id}`);
    }
    entry.occurrences.push(reference);
  }
  return [...byTemplate.values()].sort((a, b) => Number(a.id) - Number(b.id));
}
