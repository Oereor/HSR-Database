import type { EntityKind } from '../domain/types.js';
import { normalizeSearchLabel } from './normalization.js';

export const SEARCH_DOCUMENT_SCHEMA_VERSION = 2 as const;
export type SearchTarget =
  { kind: EntityKind; id: string } | { kind: 'endgame-name'; entryId: string };

export interface SearchDocument {
  key: string;
  target: SearchTarget;
  canonicalName: string;
  officialAliases: string[];
  playerAliases: string[];
}

export interface SearchDocumentBundle {
  schemaVersion: typeof SEARCH_DOCUMENT_SCHEMA_VERSION;
  normalizationVersion: number;
  namingPolicyVersion: number;
  sourceCommit: string;
  metadataDigest: string;
  documents: SearchDocument[];
}

export type NameKind = 'canonical' | 'official' | 'player';
export type MatchKind = 'exact' | 'prefix' | 'contains';
export interface MatchEvidence {
  documentKey: string;
  nameKind: NameKind;
  matchKind: MatchKind;
  matchedLabel: string;
}
export interface NormalizedSearchDocument {
  document: SearchDocument;
  canonical: string;
  labels: { nameKind: NameKind; value: string; normalized: string }[];
}

export const searchTargetKey = (target: SearchTarget): string =>
  `${target.kind}:${target.kind === 'endgame-name' ? target.entryId : target.id}`;

export function normalizeSearchDocument(document: SearchDocument): NormalizedSearchDocument {
  return {
    document,
    canonical: normalizeSearchLabel(document.canonicalName),
    labels: (
      [
        ['canonical', [document.canonicalName]],
        ['official', document.officialAliases],
        ['player', document.playerAliases]
      ] as const
    ).flatMap(([nameKind, values]) =>
      values.map((value) => ({ nameKind, value, normalized: normalizeSearchLabel(value) }))
    )
  };
}
