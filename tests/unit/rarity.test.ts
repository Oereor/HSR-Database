import { describe, expect, it } from 'vitest';
import { getRarityColor } from '../../src/lib/domain/rarity';

describe('rarity presentation', () => {
  it.each([
    [5, '#ffd700'],
    [4, '#c77dff'],
    [3, '#6090ff']
  ])('maps %s-star rarity to its shared presentation color', (rarity, color) => {
    expect(getRarityColor(rarity)).toBe(color);
  });

  it('leaves unsupported and missing rarities unstyled', () => {
    expect(getRarityColor(2)).toBeUndefined();
    expect(getRarityColor(undefined)).toBeUndefined();
  });
});
