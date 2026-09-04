import { compareSearchText, hasNamePlaceholder, normalizeSearchLabel } from './normalization.js';

export const CHARACTER_NAMING_POLICY_VERSION = 1 as const;
export interface NameTextSource {
  table: string;
  recordId: string;
  field: string;
  textHash: string;
}
export interface OfficialCharacterNames {
  canonicalName: string;
  canonicalSource: NameTextSource & {
    policy: 'avatar-name' | 'multiple-path';
    baseAvatarId?: string;
    path?: NameTextSource;
  };
  officialAliases: Array<NameTextSource & { value: string; sourceKind: 'official-base-name' }>;
}
export interface CharacterNameSnapshot {
  schemaVersion: 1;
  normalizationVersion: number;
  namingPolicyVersion: typeof CHARACTER_NAMING_POLICY_VERSION;
  sourceCommit: string;
  characters: Record<string, OfficialCharacterNames>;
}
export interface PlayerAliasMetadata {
  schemaVersion: 1;
  characters: Record<string, { playerAliases: string[] }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validatePlayerAliases(
  value: unknown,
  official: CharacterNameSnapshot
): PlayerAliasMetadata {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isRecord(value.characters) ||
    Object.keys(value).some((key) => !['schemaVersion', 'characters'].includes(key))
  )
    throw new Error('player alias metadata schema 无效');
  const characters: PlayerAliasMetadata['characters'] = {};
  for (const id of Object.keys(value.characters).sort(compareSearchText)) {
    const names = Object.hasOwn(official.characters, id) ? official.characters[id] : undefined;
    if (!/^\d+$/.test(id) || !names) throw new Error(`player alias 引用了不存在的 AvatarID：${id}`);
    const row = value.characters[id];
    if (
      !isRecord(row) ||
      !Array.isArray(row.playerAliases) ||
      Object.keys(row).some((key) => key !== 'playerAliases')
    )
      throw new Error(`角色 ${id} playerAliases 必须为 string[]`);
    const seen = new Set(
      [names.canonicalName, ...names.officialAliases.map(({ value }) => value)].map(
        normalizeSearchLabel
      )
    );
    const aliases: string[] = [];
    for (const alias of row.playerAliases) {
      if (
        typeof alias !== 'string' ||
        !alias.trim() ||
        !normalizeSearchLabel(alias) ||
        hasNamePlaceholder(alias) ||
        /<[^>]*>/.test(alias)
      )
        throw new Error(`角色 ${id} 包含无效 player alias：${String(alias)}`);
      const normalized = normalizeSearchLabel(alias);
      if (seen.has(normalized))
        throw new Error(`角色 ${id} player alias 重复或与正式名称重复：${alias}`);
      seen.add(normalized);
      aliases.push(alias.trim());
    }
    characters[id] = { playerAliases: aliases.sort(compareSearchText) };
  }
  return { schemaVersion: 1, characters };
}
