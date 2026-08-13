import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SearchEntry } from '../../src/lib/domain/types';
import { normalizeSearch, searchEntries } from '../../src/lib/search/search';

const records = JSON.parse(
  readFileSync(path.resolve('static/generated/search.json'), 'utf8')
) as SearchEntry[];

describe('搜索', () => {
  it('规范化空格与大小写', () => expect(normalizeSearch(' March 7th ')).toBe('march7th'));
  it('仅使用简体中文名称和别名', () => {
    expect(searchEntries(records, '三月')[0].id).toBe('1001');
    expect(searchEntries(records, 'march')).toEqual([]);
    expect(records.some((record) => (record as { kind: string }).kind === 'item')).toBe(false);
  });
  it('精确匹配优先', () => expect(searchEntries(records, '锋镝')[0].id).toBe('20000'));
});
