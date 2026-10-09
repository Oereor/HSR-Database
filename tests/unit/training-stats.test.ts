import { describe, expect, it } from 'vitest';
import {
  normalizeStatProgression,
  characterStatFields,
  lightConeStatFields
} from '../../scripts/data/stats';
import { getBaseStatsAtLevel, getPromotionAtLevel } from '../../src/lib/domain/stats';
import { derivePromotion } from '../../src/lib/domain/training/index';

for (const fields of [characterStatFields, lightConeStatFields])
  describe(`inclusive promotion stats (${fields.hpBase})`, () => {
    const maxima = [20, 30, 40, 50, 60, 70, 80];
    const rows = maxima.map((MaxLevel, promotion) => ({
      MaxLevel,
      [fields.hpBase]: { Value: 100 + promotion * 50 },
      [fields.hpAdd]: { Value: 2 },
      [fields.attackBase]: { Value: 30 + promotion * 10 },
      [fields.attackAdd]: { Value: 1 },
      [fields.defenceBase]: { Value: 10 + promotion * 5 },
      [fields.defenceAdd]: { Value: 0.5 }
    }));
    const progression = normalizeStatProgression(rows, fields);
    it('generates contiguous inclusive stages, independent of source order', () => {
      expect(normalizeStatProgression([...rows].reverse(), fields)).toEqual(progression);
      expect(progression.stages.map(({ fromLevel, toLevel }) => [fromLevel, toLevel])).toEqual([
        [1, 20],
        [21, 30],
        [31, 40],
        [41, 50],
        [51, 60],
        [61, 70],
        [71, 80]
      ]);
    });
    it('uses the same promotion as costs at every level, preserving the growth formula', () => {
      const chain = maxima.map((maxLevel, promotion) => ({ maxLevel, promotion, cost: {} }));
      for (let level = 1; level <= 80; level++) {
        const promotion = derivePromotion(chain, level);
        expect(getPromotionAtLevel(progression, level)).toBe(promotion);
        expect(getBaseStatsAtLevel(progression, level)).toEqual({
          hp: 100 + promotion * 50 + 2 * (level - 1),
          attack: 30 + promotion * 10 + level - 1,
          defence: 10 + promotion * 5 + 0.5 * (level - 1)
        });
      }
    });
  });
