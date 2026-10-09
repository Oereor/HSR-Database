import type { SkillCard } from '../types.js';
import type { CharacterTrainingProfile, CharacterTrainingTarget } from './types.js';
import { resolveSkillProgression, resolveSkillTraining } from './index.js';

export interface SkillTrainingControl {
  key?: string;
  displayLevel: number;
  requiredPromotion?: number;
  jointLabel: boolean;
}

/** UI projections never own another copy of a paid progression target. */
export function createSkillTrainingControls(
  cards: SkillCard[],
  profile: CharacterTrainingProfile | undefined,
  target: CharacterTrainingTarget | undefined,
  pendingLevels: Record<string, number>,
  promotion: number
): Record<string, SkillTrainingControl> {
  const controls: Record<string, SkillTrainingControl> = {};
  for (const card of cards)
    for (const progression of card.progressions) {
      const variant = card.variants.find((variant) => progression.variantIds.includes(variant.id));
      const key =
        profile && variant && variant.source !== 'avatar-global-buff'
          ? resolveSkillProgression(profile, variant.id, variant.source)
          : undefined;
      const node = profile?.nodes.find((node) => node.key === key && node.kind === 'skill');
      const displayLevel = node
        ? (target?.displayLevels?.[node.key] ?? node.maxLevel)
        : (pendingLevels[progression.id] ?? progression.defaultLevel);
      const resolved = node ? resolveSkillTraining(node, displayLevel, promotion) : undefined;
      const categories = new Set(node?.bindings.map((binding) => binding.category));
      controls[progression.id] = {
        key: node?.key,
        displayLevel,
        requiredPromotion:
          resolved && resolved.requiredPromotion > promotion
            ? resolved.requiredPromotion
            : undefined,
        jointLabel: categories.size === 2 && categories.has('talent') && categories.has('assist')
      };
    }
  return controls;
}
