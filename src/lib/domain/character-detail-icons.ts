export const CHARACTER_DETAIL_ICON_KINDS = ['property', 'skill', 'skill-tree', 'rank'] as const;

export type CharacterDetailIconKind = (typeof CHARACTER_DETAIL_ICON_KINDS)[number];
export type CharacterDetailIconKey = `${CharacterDetailIconKind}--${string}`;

const keyPattern = /^(property|skill|skill-tree|rank)--([A-Za-z0-9_]+)$/;

export function characterDetailIconKey(
  kind: CharacterDetailIconKind,
  identity: string
): CharacterDetailIconKey | undefined {
  if (!/^[A-Za-z0-9_]+$/.test(identity)) return undefined;
  return `${kind}--${identity}`;
}

export function parseCharacterDetailIconKey(
  value: string
): { kind: CharacterDetailIconKind; identity: string } | undefined {
  const match = keyPattern.exec(value);
  if (!match) return undefined;
  return {
    kind: match[1] as CharacterDetailIconKind,
    identity: match[2]
  };
}
