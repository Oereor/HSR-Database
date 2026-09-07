import type {
  CharacterSpecialEffectEntry,
  DescriptionToken,
  SkillCard
} from '../../src/lib/domain/types.js';

/** Reviewed upstream icon provenance. Icons belong to the profile's explicit skill links. */
const triggerSources: Readonly<
  Record<
    string,
    { avatarId: string; ids: number[]; relationKind: CharacterSpecialEffectEntry['kind'] }
  >
> = {
  AvatarCyrene: { avatarId: '1415', ids: [0], relationKind: 'servant-skill-link' },
  AvatarHimekoNova: { avatarId: '1510', ids: [0, 1], relationKind: 'avatar-skill-link' }
};
export function annotateSpecialEffectTokens(
  tokens: DescriptionToken[],
  avatarId: string,
  relations: CharacterSpecialEffectEntry[]
): DescriptionToken[] {
  const result = tokens.map((token) => ({ ...token }));
  for (let index = 0; index < result.length; index++) {
    const icon = result[index];
    if (icon.type !== 'icon' || !icon.icon) continue;
    const rule = triggerSources[icon.icon.spriteName];
    if (
      !rule ||
      rule.avatarId !== avatarId ||
      !rule.ids.includes(icon.icon.id) ||
      !relations.some((entry) => entry.kind === rule.relationKind)
    )
      throw new Error(
        `Unreviewed special effect icon relation: avatar=${avatarId}, sprite=${icon.icon.spriteName}, id=${icon.icon.id}`
      );
    if (!icon.underline || !icon.color)
      throw new Error(`Special effect trigger styling changed: ${avatarId}`);
    const reference = `character-special-effects:${avatarId}` as const;
    icon.semanticReference = reference;
    let cursor = index + 1;
    while (cursor < result.length) {
      const token = result[cursor];
      if (
        token.type === 'icon' ||
        !token.underline ||
        token.color?.toLowerCase() !== icon.color.toLowerCase()
      )
        break;
      token.semanticReference = reference;
      cursor++;
    }
    if (cursor === index + 1) throw new Error(`Special effect trigger has no label: ${avatarId}`);
    index = cursor - 1;
  }
  return result;
}
export function annotateSpecialEffectCards(
  cards: SkillCard[],
  avatarId: string,
  relations: CharacterSpecialEffectEntry[]
) {
  for (const card of cards)
    for (const variant of card.variants)
      for (const level of variant.levels)
        level.descriptionTokens = annotateSpecialEffectTokens(
          level.descriptionTokens,
          avatarId,
          relations
        );
}
