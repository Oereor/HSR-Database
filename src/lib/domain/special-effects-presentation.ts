import type { CatalogEntry, CharacterSpecialEffectEntry, DescriptionToken } from './types.js';
import {
  staticTrailblazerText,
  withTrailblazerGender,
  type TrailblazerGender
} from './trailblazer.js';

export type DescriptionPresentationSegment =
  | { kind: 'text'; tokens: DescriptionToken[] }
  | { kind: 'special-effect-trigger'; tokens: DescriptionToken[] };

export interface SpecialEffectLinkedAvatarPresentation {
  sourceAvatarId: string;
  displayAvatarId: string;
  displayName: string;
}

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
    const token = tokens[index];
    if (!token.semanticReference || token.type !== 'icon') {
      plain.push(token);
      index++;
      continue;
    }
    const candidate = [token];
    let cursor = index + 1;
    while (
      cursor < tokens.length &&
      tokens[cursor].type !== 'icon' &&
      tokens[cursor].semanticReference === token.semanticReference
    ) {
      candidate.push(tokens[cursor++]);
    }
    flushPlain();
    segments.push({ kind: 'special-effect-trigger', tokens: candidate });
    index = cursor;
  }
  flushPlain();
  return segments;
}

export function resolveSpecialEffectLinkedAvatarPresentation(input: {
  ownerCharacterId: string;
  entryKind: CharacterSpecialEffectEntry['kind'];
  sourceAvatarId: string;
  targets: ReadonlyMap<string, CatalogEntry>;
  trailblazerPreference?: TrailblazerGender;
}): SpecialEffectLinkedAvatarPresentation {
  const { ownerCharacterId, entryKind, sourceAvatarId, targets, trailblazerPreference } = input;
  const displayAvatarId = trailblazerPreference
    ? withTrailblazerGender(sourceAvatarId, trailblazerPreference)
    : sourceAvatarId;
  const target = targets.get(displayAvatarId);
  const useBaseName =
    ownerCharacterId === '1510' &&
    entryKind === 'avatar-skill-link' &&
    (sourceAvatarId === '1001' || sourceAvatarId === '1224');
  return {
    sourceAvatarId,
    displayAvatarId,
    displayName: requireName(
      target && trailblazerPreference
        ? staticTrailblazerText(target, trailblazerPreference)
        : target,
      useBaseName
    )
  };
}

function requireName(target: CatalogEntry | undefined, base: boolean): string {
  const name = base ? target?.baseName : target?.name;
  if (!name) throw new Error('Special effect linked avatar naming projection is missing');
  return name;
}
