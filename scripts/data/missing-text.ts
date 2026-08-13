import type { TextSource } from './localization.js';

export type MissingTextCategory = 'A' | 'B' | 'C' | 'D';

export interface MissingTextSample extends TextSource {
  reason: string;
  identifier: string;
}

export interface MissingTextGroup {
  reason: string;
  entity: string;
  field: string;
  count: number;
}

export interface MissingTextCategorySummary {
  count: number;
  groups: MissingTextGroup[];
  samples: MissingTextSample[];
}

export type MissingTextAudit = Record<MissingTextCategory, MissingTextCategorySummary>;

export interface MissingTextAuditCollector {
  record(
    category: MissingTextCategory,
    reason: string,
    source: TextSource,
    identifier?: string
  ): void;
  getSummary(): MissingTextAudit;
}

const categories: MissingTextCategory[] = ['A', 'B', 'C', 'D'];
const MAX_SAMPLES = 20;

export function createMissingTextAuditCollector(): MissingTextAuditCollector {
  const entries = new Map<MissingTextCategory, Map<string, MissingTextSample>>(
    categories.map((category) => [category, new Map()])
  );

  const record: MissingTextAuditCollector['record'] = (
    category,
    reason,
    source,
    identifier = ''
  ) => {
    const sample = { ...source, reason, identifier };
    const key = [reason, source.entity, source.id ?? '', source.field, identifier].join('\u0000');
    entries.get(category)!.set(key, sample);
  };

  const getSummary = (): MissingTextAudit =>
    Object.fromEntries(
      categories.map((category) => {
        const samples = [...entries.get(category)!.values()];
        const groups = new Map<string, MissingTextGroup>();
        for (const sample of samples) {
          const key = [sample.reason, sample.entity, sample.field].join('\u0000');
          const group = groups.get(key) ?? {
            reason: sample.reason,
            entity: sample.entity,
            field: sample.field,
            count: 0
          };
          group.count += 1;
          groups.set(key, group);
        }
        return [
          category,
          {
            count: samples.length,
            groups: [...groups.values()].sort(
              (a, b) => b.count - a.count || a.entity.localeCompare(b.entity)
            ),
            samples: samples.slice(0, MAX_SAMPLES)
          }
        ];
      })
    ) as MissingTextAudit;

  return { record, getSummary };
}
