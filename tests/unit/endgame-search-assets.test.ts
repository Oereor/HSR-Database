import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getSearchIndex } from '../../src/lib/server/generated';
import {
  getEndgameGroup,
  getEndgameOccurrenceShard,
  getEndgameOccurrenceTargetIds
} from '../../src/lib/server/endgame';
import { getEnemyPortraitMap } from '../../src/lib/server/enemy-assets';
import type { EndgameOccurrenceShard } from '../../src/lib/domain/search-index';

describe('Endgame Search portrait delivery', () => {
  it('delivers identical phase HP through serialized English and server-built Chinese shards', async () => {
    const shards = await Promise.all(
      ['zh-CN', 'en'].map((locale) =>
        getEndgameOccurrenceShard('4035010', locale as 'zh-CN' | 'en')
      )
    );
    const hp = shards.map((shard) =>
      Object.values(shard!.occurrences).map((item) => item.occurrence.hp)
    );
    expect(hp[0]).toEqual(hp[1]);
    expect(hp[0]).toHaveLength(2);
    expect(
      hp[0].every((item) => item.display === 'phases' && item.phases?.every((p) => p.exact))
    ).toBe(true);
    expect(
      hp[0]
        .flatMap((item) => item.phases!)
        .every((p) => Object.keys(p).every((key) => ['phase', 'exact', 'rounded'].includes(key)))
    ).toBe(true);
  });
  it('keeps cached enemy references isolated by locale', async () => {
    const [zh, en] = await Promise.all([
      getEndgameGroup('moc', 1034, 'zh-CN'),
      getEndgameGroup('moc', 1034, 'en')
    ]);
    expect(zh).toBeDefined();
    expect(en).toBeDefined();
    const occurrences = (group: NonNullable<typeof zh>) =>
      group.encounters
        .flatMap((encounter) => encounter.battles)
        .flatMap((battle) => battle.stages)
        .flatMap((stage) => stage.waves)
        .flatMap((wave) => wave.enemies);
    const zhEnemies = new Map(occurrences(zh!).map((enemy) => [enemy.identity, enemy]));
    const pair = occurrences(en!).find((enemy) => zhEnemies.get(enemy.identity)?.weaknesses.length);
    expect(pair).toBeDefined();
    const zhWeaknesses = zhEnemies.get(pair!.identity)!.weaknesses;
    expect(pair!.weaknesses.map(({ element }) => element)).toEqual(
      zhWeaknesses.map(({ element }) => element)
    );
    expect(pair!.weaknesses.map(({ name }) => name)).not.toEqual(
      zhWeaknesses.map(({ name }) => name)
    );
  });

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
    expect(zh!.periods.map(({ mode, period }) => [mode, period.groupId])).toEqual(
      en!.periods.map(({ mode, period }) => [mode, period.groupId])
    );
    expect(zh!.periods.every(({ period }) => period.name.length > 0)).toBe(true);
    expect(en!.periods.every(({ period }) => period.name.length > 0)).toBe(true);
    for (const [key, item] of Object.entries(en!.occurrences)) {
      expect(item.occurrence.portraitUrl).toBeTruthy();
      expect(item.occurrence.portraitUrl).toBe(zh!.occurrences[key].occurrence.portraitUrl);
      expect(item.occurrence.portraitUrl).toMatch(/^\/generated-enemy-assets\//);
    }
    expect(await getEndgameOccurrenceShard('../missing', 'en')).toBeUndefined();
  }, 30000);
});
