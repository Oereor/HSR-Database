import {
  characterDetailIconKey,
  type CharacterDetailIconKind,
  type CharacterDetailIconKey
} from '../../src/lib/domain/character-detail-icons.js';

export function configuredCharacterDetailIconKey(
  kind: CharacterDetailIconKind,
  identity: string,
  configuredPath: unknown,
  context: string
): CharacterDetailIconKey | undefined {
  if (typeof configuredPath !== 'string' || !configuredPath.trim()) return undefined;
  const key = characterDetailIconKey(kind, identity);
  if (!key) throw new Error(`${context} 包含非法 icon identity：${identity}`);
  return key;
}
