import type { PlannerCharacterOption, ActorConfig } from './types';
import { normalizeSearchDocument } from '../search/documents';
import { normalizeSearch } from '../search/normalization';
import { bestSearchEvidence, compareSearchMatches } from '../search/ranking';

export interface CharacterSlotDraft {
  id: string;
  characterId: string;
  name: string;
  baseSpeed?: number;
  panelSpeed?: number;
}

export function selectSlotCharacter(
  slot: CharacterSlotDraft,
  character: PlannerCharacterOption,
  nextId: () => string
): CharacterSlotDraft {
  if (slot.characterId === character.id) return slot;
  return {
    id: nextId(),
    characterId: character.id,
    name: character.name,
    baseSpeed: character.baseSpeed,
    panelSpeed: character.baseSpeed
  };
}

export function configuredAllies(slots: CharacterSlotDraft[]): ActorConfig[] {
  return slots.flatMap((slot, position) =>
    slot.characterId
      ? [
          {
            id: slot.id,
            name: slot.name,
            kind: 'actor' as const,
            category: 'character' as const,
            camp: 'ally' as const,
            position,
            baseSpeed: slot.baseSpeed ?? NaN,
            panelSpeed: slot.panelSpeed ?? NaN
          }
        ]
      : []
  );
}

/** Reuse shared matching/ranking directly; no global service or search shards. */
export function createCharacterSearch(characters: PlannerCharacterOption[]) {
  const normalized = characters.map((character) =>
    normalizeSearchDocument({
      key: `character:${character.id}`,
      target: { kind: 'character', id: character.id },
      canonicalName: character.name,
      officialAliases: character.officialAliases,
      playerAliases: character.playerAliases
    })
  );
  const byId = new Map(characters.map((character) => [character.id, character]));
  return (query: string): PlannerCharacterOption[] => {
    const needle = normalizeSearch(query);
    if (!needle) return characters;
    return normalized
      .flatMap((entry) => {
        const evidence = bestSearchEvidence(entry, needle);
        return evidence ? [{ normalized: entry, evidence }] : [];
      })
      .sort(compareSearchMatches)
      .map(({ normalized }) => byId.get(normalized.document.target.id)!);
  };
}
