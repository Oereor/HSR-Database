import type { RelicSlot } from '../../domain/types.js';
import { isRelicStatKey, relicStatSemantics, type RelicStatKey } from '../stat-registry.js';

export interface MainWeightOverride {
  characterId: string;
  slot: RelicSlot;
  key: RelicStatKey;
  preference: number;
  reason: string;
}
export interface AgnosticSlotOverride {
  characterId: string;
  slot: RelicSlot;
  reason: string;
}
export interface RatingV2Exceptions {
  mainWeights: MainWeightOverride[];
  agnosticSlots: AgnosticSlotOverride[];
}
export interface RatingV2Overrides extends RatingV2Exceptions {
  schemaVersion: 1;
  sourceCommit: string;
  basis: string;
}
function exact(value: unknown, fields: string[]): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== fields.sort().join()
  )
    throw new Error('Invalid Rating V2 override fields');
}
export function assertRatingV2Overrides(
  value: unknown,
  characterIds: readonly string[],
  sourceCommit: string
): asserts value is RatingV2Overrides {
  exact(value, ['schemaVersion', 'sourceCommit', 'basis', 'mainWeights', 'agnosticSlots']);
  if (
    value.schemaVersion !== 1 ||
    value.sourceCommit !== sourceCommit ||
    !/^[a-f0-9]{40}$/.test(sourceCommit) ||
    typeof value.basis !== 'string' ||
    !value.basis.trim() ||
    !Array.isArray(value.mainWeights) ||
    !Array.isArray(value.agnosticSlots)
  )
    throw new Error('Invalid/stale Rating V2 override policy');
  const ids = new Set(characterIds);
  const seen = new Set<string>();
  for (const [kind, entries] of [
    ['main', value.mainWeights],
    ['agnostic', value.agnosticSlots]
  ] as const) {
    for (const entry of entries) {
      exact(
        entry,
        kind === 'main'
          ? ['characterId', 'slot', 'key', 'preference', 'reason']
          : ['characterId', 'slot', 'reason']
      );
      if (
        typeof entry.characterId !== 'string' ||
        !ids.has(entry.characterId) ||
        typeof entry.slot !== 'string' ||
        !['BODY', 'FOOT', 'NECK', 'OBJECT'].includes(entry.slot) ||
        typeof entry.reason !== 'string' ||
        !entry.reason.trim()
      )
        throw new Error('Unknown/unreasoned Rating V2 override');
      const identity = `${entry.characterId}:${entry.slot}`;
      if (seen.has(identity)) throw new Error('Duplicate/conflicting Rating V2 override');
      seen.add(identity);
      if (
        kind === 'main' &&
        (typeof entry.key !== 'string' ||
          !isRelicStatKey(entry.key) ||
          relicStatSemantics(entry.key).mainSlots.length !== 1 ||
          !relicStatSemantics(entry.key).mainSlots.includes(entry.slot as RelicSlot) ||
          typeof entry.preference !== 'number' ||
          !Number.isFinite(entry.preference) ||
          entry.preference < 0 ||
          entry.preference > 1)
      )
        throw new Error('Invalid/scopeless Rating V2 main override');
    }
  }
}

export function exceptionsFor(policy: RatingV2Exceptions, characterId: string): RatingV2Exceptions {
  return {
    mainWeights: policy.mainWeights.filter((entry) => entry.characterId === characterId),
    agnosticSlots: policy.agnosticSlots.filter((entry) => entry.characterId === characterId)
  };
}
