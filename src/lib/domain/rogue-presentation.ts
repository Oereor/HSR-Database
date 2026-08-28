import type {
  RoguePresentationTier,
  RogueRawBlessingCategory,
  RogueRawFormulaCategory
} from './rogue';

const COLORS = {
  common: '#9797a1',
  rare: '#6695c8',
  gold: '#c4a275'
} as const;

export function blessingTier(category: RogueRawBlessingCategory): RoguePresentationTier {
  const map = {
    Common: { stars: 1, color: COLORS.common },
    Rare: { stars: 2, color: COLORS.rare },
    Legendary: { stars: 3, color: COLORS.gold }
  } as const;
  return { ...map[category], source: 'ordinary-blessing' };
}

export function equationTier(category: RogueRawFormulaCategory): RoguePresentationTier {
  if (category === 'PathEcho') return { stars: 4, color: COLORS.gold, source: 'critical-equation' };
  const map = {
    Rare: { stars: 1, color: COLORS.common },
    Epic: { stars: 2, color: COLORS.rare },
    Legendary: { stars: 3, color: COLORS.gold }
  } as const;
  return { ...map[category], source: 'ordinary-equation' };
}

export function resonanceTier(): RoguePresentationTier {
  return { stars: 3, color: COLORS.gold, source: 'resonance' };
}
