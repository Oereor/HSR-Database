import { Charset, Document } from 'flexsearch';
import { describe, expect, it } from 'vitest';

type RecordForIndex = {
  key: string;
  canonical: string;
  officialAliases: { value: string }[];
  playerAliases: { value: string }[];
};

function createIndex(records: RecordForIndex[]) {
  const index = new Document<RecordForIndex>({
    tokenize: 'full',
    // HSR removes whitespace first. Override Exact's default punctuation splitting.
    encoder: { ...Charset.Exact, split: /\s+/u },
    document: {
      id: 'key',
      index: ['canonical', 'officialAliases[]:value', 'playerAliases[]:value']
    }
  });
  records.forEach((record) => index.add(record));
  return index;
}

describe('FlexSearch 0.8.212 published release contract', () => {
  it('full + Exact preserves continuous Chinese, Latin, punctuation and array boundaries', () => {
    const records: RecordForIndex[] = [
      {
        key: 'a',
        canonical: '丹恒饮月',
        officialAliases: [{ value: '甲乙' }, { value: '丙丁' }],
        playerAliases: []
      },
      {
        key: 'b',
        canonical: '银狼lv.999',
        officialAliases: [],
        playerAliases: [{ value: '测试甲' }]
      },
      { key: 'c', canonical: '火花大会@official(完整)', officialAliases: [], playerAliases: [] },
      { key: 'd', canonical: '可可利亚(幻象)', officialAliases: [], playerAliases: [] },
      { key: 'e', canonical: '可可利亚,虚妄之母(幻象)', officialAliases: [], playerAliases: [] }
    ];
    const index = createIndex(records);
    for (const query of [
      '丹恒饮月',
      '丹恒',
      '恒饮',
      '饮月',
      'lv.999',
      '.999',
      '99',
      '@official',
      '(完整)',
      '甲乙',
      '乙丙',
      '可可利亚(幻象)',
      '测试甲',
      '饮恒',
      '不存在'
    ]) {
      const expected = records
        .filter((record) =>
          [
            record.canonical,
            ...record.officialAliases.map(({ value }) => value),
            ...record.playerAliases.map(({ value }) => value)
          ].some((label) => label.includes(query))
        )
        .map(({ key }) => key)
        .sort();
      const actual = [
        ...new Set(
          index
            .search(query, { limit: records.length, offset: 0, suggest: false })
            .flatMap(({ result }) => result)
        )
      ].sort();
      expect(actual, query).toEqual(expected);
    }
  });

  it.each([81, 101, 1205])('retrieves the full key set of %i documents across fields', (count) => {
    const records = Array.from({ length: count }, (_, i) => ({
      key: String(i),
      canonical: `测试${i}`,
      officialAliases: [{ value: `测试别名${i}` }],
      playerAliases: [{ value: `玩家测试${i}` }]
    }));
    const index = createIndex(records);
    const results = index.search('测试', { limit: records.length, offset: 0, suggest: false });
    for (const { result } of results)
      expect(new Set(result)).toEqual(new Set(records.map(({ key }) => key)));
    expect(results).toHaveLength(3);
    if (count > 100) expect(index.search('测试')[0].result).toHaveLength(100);
  });
});
