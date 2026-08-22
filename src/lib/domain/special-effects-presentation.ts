import type { CatalogEntry, CharacterSpecialEffectEntry, DescriptionToken } from './types.js';

export type DescriptionPresentationSegment =
  | { kind: 'text'; tokens: DescriptionToken[] }
  | { kind: 'special-effect-trigger'; tokens: DescriptionToken[] };

export interface SpecialEffectLinkedAvatarPresentation {
  sourceAvatarId: string;
  displayAvatarId: string;
  displayName: string;
}

const specialEffectLabel = '特殊效果';

export function segmentSpecialEffectTriggers(
  tokens: DescriptionToken[],
  specialEffectsAvailable: boolean
): DescriptionPresentationSegment[] {
  if (!specialEffectsAvailable) return tokens.length ? [{ kind: 'text', tokens }] : [];
  const segments: DescriptionPresentationSegment[] = [];
  let plain: DescriptionToken[] = [];
  const flushPlain = () => {
    if (plain.length) segments.push({ kind: 'text', tokens: plain });
    plain = [];
  };

  for (let index = 0; index < tokens.length;) {
    const icon = tokens[index];
    if (icon.type !== 'icon' || !icon.icon || !icon.underline || !icon.color) {
      plain.push(icon);
      index += 1;
      continue;
    }
    const candidate = [icon];
    let cursor = index + 1;
    while (cursor < tokens.length) {
      const token = tokens[cursor];
      if (
        token.type === 'icon' ||
        !token.underline ||
        token.color?.toLowerCase() !== icon.color.toLowerCase()
      )
        break;
      candidate.push(token);
      cursor += 1;
    }
    if (
      candidate
        .slice(1)
        .map((token) => token.value)
        .join('') !== specialEffectLabel
    ) {
      plain.push(icon);
      index += 1;
      continue;
    }
    flushPlain();
    segments.push({ kind: 'special-effect-trigger', tokens: candidate });
    index = cursor;
  }
  flushPlain();
  return segments;
}

/** Product-specific identities used only inside Character Special Effect relation metadata. */
export function resolveSpecialEffectLinkedAvatarPresentation(input: {
  ownerCharacterId: string;
  entryKind: CharacterSpecialEffectEntry['kind'];
  sourceAvatarId: string;
  sourceTarget?: CatalogEntry;
}): SpecialEffectLinkedAvatarPresentation {
  const { ownerCharacterId, entryKind, sourceAvatarId, sourceTarget } = input;

  if (
    ownerCharacterId === '1415' &&
    entryKind === 'servant-skill-link' &&
    sourceAvatarId === '8007'
  )
    return {
      sourceAvatarId,
      displayAvatarId: '8008',
      displayName: sourceTarget?.name ?? '开拓者·记忆'
    };

  if (ownerCharacterId === '1510' && entryKind === 'avatar-skill-link') {
    if (sourceAvatarId === '8001')
      return { sourceAvatarId, displayAvatarId: '8002', displayName: '开拓者' };
    if (sourceAvatarId === '1001' || sourceAvatarId === '1224')
      return { sourceAvatarId, displayAvatarId: sourceAvatarId, displayName: '三月七' };
  }

  return {
    sourceAvatarId,
    displayAvatarId: sourceAvatarId,
    displayName: sourceTarget?.name ?? sourceAvatarId
  };
}
