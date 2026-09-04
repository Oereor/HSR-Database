import { Charset, Document } from 'flexsearch';
import type { NormalizedSearchDocument } from './documents.js';

type IndexedNameDocument = {
  key: string;
  canonical: string;
  officialAliases: { value: string }[];
  playerAliases: { value: string }[];
};

/** FlexSearch knows retrieval only. All strings have already passed HSR normalization. */
export function createFlexSearchAdapter(documents: readonly NormalizedSearchDocument[]) {
  const index = new Document<IndexedNameDocument>({
    tokenize: 'full',
    // HSR removes whitespace first. Override Exact's default punctuation splitting.
    encoder: { ...Charset.Exact, split: /\s+/u },
    document: {
      id: 'key',
      index: ['canonical', 'officialAliases[]:value', 'playerAliases[]:value']
    }
  });
  const keys = new Set<string>();
  for (const entry of documents) {
    if (keys.has(entry.document.key))
      throw new Error(`重复 SearchDocument key：${entry.document.key}`);
    keys.add(entry.document.key);
    index.add({
      key: entry.document.key,
      canonical: entry.canonical,
      officialAliases: entry.labels
        .filter(({ nameKind }) => nameKind === 'official')
        .map(({ normalized }) => ({ value: normalized })),
      playerAliases: entry.labels
        .filter(({ nameKind }) => nameKind === 'player')
        .map(({ normalized }) => ({ value: normalized }))
    });
  }
  return {
    search(query: string): Set<string> {
      if (!query || !keys.size) return new Set();
      const results = index.search(query, { limit: keys.size, offset: 0, suggest: false });
      return new Set(results.flatMap(({ result }) => result.map(String)));
    }
  };
}
