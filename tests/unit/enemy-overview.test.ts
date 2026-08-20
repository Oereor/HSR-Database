import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getEnemyRankCategory,
  getEnemyRankLabel,
  normalizeEnemyRankFilter
} from '../../src/lib/domain/enemy-overview';
import type { Enemy, EnemyCatalogEntry } from '../../src/lib/domain/types';
import { getEnemyPortraitMap } from '../../src/lib/server/enemy-assets';

const generatedRoot = path.join(process.cwd(), 'src', 'lib', 'generated');

describe('Enemy Overview presentation', () => {
  it('将五种 raw Rank 稳定映射为三类中文语义', () => {
    expect(['Minion', 'MinionLv2'].map(getEnemyRankCategory)).toEqual(['normal', 'normal']);
    expect(getEnemyRankCategory('Elite')).toBe('elite');
    expect(['LittleBoss', 'BigBoss'].map(getEnemyRankLabel)).toEqual(['首领敌人', '首领敌人']);
    expect(normalizeEnemyRankFilter('MinionLv2')).toBe('normal');
    expect(normalizeEnemyRankFilter('elite')).toBe('elite');
  });

  it('每个目录弱点都来自对应 Template 的 defaultMonster', async () => {
    const catalog = JSON.parse(
      await readFile(path.join(generatedRoot, 'catalogs', 'enemies.json'), 'utf8')
    ) as EnemyCatalogEntry[];
    expect(catalog).toHaveLength(613);
    for (const entry of catalog) {
      const detail = JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'enemies', `${entry.id}.json`), 'utf8')
      ) as Enemy;
      expect(entry.weaknesses, entry.id).toEqual(detail.defaultMonster.weaknesses);
    }
  });

  it('Overview 只取得本地 Enemy URL，已知缺图 Template 保持 undefined', async () => {
    const portraits = await getEnemyPortraitMap();
    expect(portraits.get(1002015)).toMatch(/^\/generated-enemy-assets\/icons\/Monster_\d+\.webp$/);
    expect(portraits.get(2002020)).toBeUndefined();
  });
});
