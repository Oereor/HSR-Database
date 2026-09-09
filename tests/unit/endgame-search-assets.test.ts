import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getSearchIndex } from '../../src/lib/server/generated';
import {
  getEndgameOccurrenceShard,
  getEndgameOccurrenceTargetIds
} from '../../src/lib/server/endgame';
import { getEnemyPortraitMap } from '../../src/lib/server/enemy-assets';
import type { EndgameOccurrenceShard } from '../../src/lib/domain/search-index';

describe('Endgame Search portrait delivery', () => {
  it('prerenders every target for both public locales', async () => {
    const entries = await getEndgameOccurrenceTargetIds();
    for (const locale of ['zh-CN', 'en'] as const) {
      const index = await getSearchIndex(locale);
      expect(entries.filter((entry) => entry.locale === locale)).toEqual(
        index.endgameTargets.map(({ id }) => ({ locale, targetId: id }))
      );
    }
  });

  it('resolves portraits by template ID across all four modes without changing projected fields', async () => {
    const portraits = await getEnemyPortraitMap();
    expect(portraits.size).toBeGreaterThan(0);
    const index = await getSearchIndex('en');
    const modesWithArtwork = new Set<string>();
    let missing = 0;
    for (const target of index.endgameTargets) {
      const original = JSON.parse(
        await readFile(`src/lib/generated/views/en/endgame-occurrences/${target.id}`, 'utf8')
      ) as EndgameOccurrenceShard;
      const resolved = (await getEndgameOccurrenceShard(target.id, 'en'))!;
      for (const item of Object.values(resolved.occurrences)) {
        const expected = portraits.get(item.occurrence.monsterTemplateId);
        expect(item.occurrence.portraitUrl).toBe(expected);
        if (expected) modesWithArtwork.add(JSON.parse(item.key)[0]);
        else missing += 1;
        delete item.occurrence.portraitUrl;
      }
      // Includes unknown periods such as 1035, localized fallback text and ordering.
      expect(resolved).toEqual(original);
    }
    expect([...modesWithArtwork].sort()).toEqual(['aa', 'as', 'moc', 'pf']);
    expect(missing).toBeGreaterThan(0);
  }, 30000);

  it('gives the same existing Sam portrait to both locales and preserves missing target handling', async () => {
    const [zh, en] = await Promise.all([
      getEndgameOccurrenceShard('3024020', 'zh-CN'),
      getEndgameOccurrenceShard('3024020', 'en')
    ]);
    expect(zh).toBeDefined();
    expect(en).toBeDefined();
    expect(
      zh!.periods.find(({ mode, period }) => mode === 'moc' && period.groupId === 1035)?.period.name
    ).toBe('混沌回忆 ID 1035');
    expect(
      en!.periods.find(({ mode, period }) => mode === 'moc' && period.groupId === 1035)?.period.name
    ).toBe('MoC ID 1035');
    for (const [key, item] of Object.entries(en!.occurrences)) {
      expect(item.occurrence.portraitUrl).toBeTruthy();
      expect(item.occurrence.portraitUrl).toBe(zh!.occurrences[key].occurrence.portraitUrl);
      expect(item.occurrence.portraitUrl).toMatch(/^\/generated-enemy-assets\//);
    }
    expect(await getEndgameOccurrenceShard('../missing', 'en')).toBeUndefined();
  });
});
