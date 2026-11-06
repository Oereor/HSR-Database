import type { SkillCard } from './types';

/** Display-only state: no training shard, promotion or cost dependencies. */
export interface SkillPreviewControl {
  key?: string;
  previewLevel: number;
  jointLabel: boolean;
  requiredPromotion?: number;
}

export function createCharacterPreviewControls(
  cards: SkillCard[],
  levels: Readonly<Record<string, number>>
): Record<string, SkillPreviewControl> {
  const controls: Record<string, SkillPreviewControl> = {};
  for (const card of cards)
    for (const progression of card.progressions) {
      const previewLevel = levels[progression.id] ?? progression.defaultLevel;
      if (!progression.availableLevels.includes(previewLevel))
        throw new Error(`Invalid preview level: ${progression.id}:${previewLevel}`);
      controls[progression.id] = {
        key: progression.id,
        previewLevel,
        jointLabel:
          cards.filter((candidate) =>
            candidate.progressions.some((item) => item.id === progression.id)
          ).length > 1
      };
    }
  return controls;
}

export function updateCharacterPreviewLevel(
  cards: SkillCard[],
  levels: Readonly<Record<string, number>>,
  progressionId: string,
  level: number
): Record<string, number> {
  if (!cards.some((card) => card.progressions.some((item) => item.id === progressionId)))
    throw new Error(`Unknown skill progression: ${progressionId}`);
  const next = { ...levels, [progressionId]: level };
  createCharacterPreviewControls(cards, next);
  return next;
}
