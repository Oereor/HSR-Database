import { describe, expect, it } from 'vitest';
import {
  createCharacterPreviewControls,
  updateCharacterPreviewLevel
} from '../../src/lib/domain/character-preview';
import type { SkillCard } from '../../src/lib/domain/types';

const card = (category: SkillCard['category']): SkillCard => ({
  category,
  displayLabel: category,
  order: 0,
  variants: [],
  progressions: [{ id: 'shared', defaultLevel: 10, availableLevels: [1, 6, 10], variantIds: [] }]
});

describe('character display previews', () => {
  it('shares progression state across categories without training data', () => {
    const cards = [card('talent'), card('assist')];
    expect(createCharacterPreviewControls(cards, {}).shared.previewLevel).toBe(10);
    const levels = updateCharacterPreviewLevel(cards, {}, 'shared', 6);
    expect(createCharacterPreviewControls(cards, levels).shared).toMatchObject({
      previewLevel: 6,
      jointLabel: true
    });
    expect(createCharacterPreviewControls(cards, {}).shared.previewLevel).toBe(10);
  });
  it('rejects unknown progressions and unavailable levels', () => {
    expect(() => updateCharacterPreviewLevel([card('talent')], {}, 'missing', 1)).toThrow();
    expect(() => updateCharacterPreviewLevel([card('talent')], {}, 'shared', 2)).toThrow();
  });
});
