import { gameTextToPlain } from '../../src/lib/domain/game-text.js';
import type { NeutralTextSource } from '../../src/lib/domain/neutral.js';
import { trailblazerGender, trailblazerNickname } from '../../src/lib/domain/trailblazer.js';
import {
  CHARACTER_NAMING_POLICY_VERSION,
  type CharacterNameSnapshot
} from '../../src/lib/search/name-metadata.js';
import {
  compareSearchText,
  hasNamePlaceholder,
  normalizeSearch,
  SEARCH_NORMALIZATION_VERSION
} from '../../src/lib/search/normalization.js';
import {
  createTextResolver,
  loadTextMap,
  runtimeTextSourceFromRef,
  type TextProjectionContext,
  type TextResolver
} from './localization.js';
import { getPublicLocale } from './locale-registry.js';
import { requiredText } from './projection/shared.js';
import { hashOf, mergeConfigSources, readTable } from './raw.js';

interface AvatarNameRow {
  AvatarID: number | string;
  AvatarName: unknown;
}

interface NamingOwnerRow {
  PHFMCACHFIJ: string;
  OENAMINOLLF: unknown;
}

export function avatarNameTextContext(
  id: string,
  text: TextResolver,
  context: Pick<TextProjectionContext, 'gender' | 'nickname'> = {}
): Pick<TextProjectionContext, 'gender' | 'nickname'> {
  const gender = trailblazerGender(id);
  return gender ? { gender, nickname: trailblazerNickname(text.locale, gender) } : context;
}

export function resolveAvatarName(
  id: string,
  text: TextResolver,
  source: NeutralTextSource | undefined,
  context?: Pick<TextProjectionContext, 'gender' | 'nickname'>
): string {
  return requiredText(
    text,
    source,
    { domain: 'character', entityId: id, field: 'name' },
    avatarNameTextContext(id, text, context)
  );
}

function resolveTrailblazerGroupName(rows: NamingOwnerRow[], text: TextResolver) {
  const [match, ...rest] = rows.filter((row) => row.PHFMCACHFIJ === 'Trailblazer');
  const textHash = hashOf(match?.OENAMINOLLF);
  if (rest.length || textHash !== '4036035618718239522')
    throw new Error('FateRinOwner.Trailblazer.OENAMINOLLF provenance requires review');
  const provenance = { entity: 'character-group-name', id: '8001', field: 'OENAMINOLLF' };
  const value = gameTextToPlain(
    requiredText(text, runtimeTextSourceFromRef(match.OENAMINOLLF, provenance), {
      domain: provenance.entity,
      entityId: provenance.id,
      field: provenance.field
    })
  );
  if (!normalizeSearch(value) || hasNamePlaceholder(value))
    throw new Error('Trailblazer group name is missing');
  return {
    value,
    sourceKind: 'official-group-name' as const,
    table: 'FateRinOwner',
    recordId: 'Trailblazer',
    field: provenance.field,
    textHash
  };
}

export function buildCharacterNames(
  avatars: AvatarNameRow[],
  ldAvatars: AvatarNameRow[],
  text: TextResolver,
  sourceCommit: string,
  namingOwners: NamingOwnerRow[] = []
) {
  const merged = mergeConfigSources(
    'AvatarConfig',
    [
      { name: 'AvatarConfig', rows: avatars },
      { name: 'AvatarConfigLD', rows: ldAvatars }
    ],
    (row) => String(row.AvatarID)
  );
  const ordinaryIds = new Set(avatars.map((row) => String(row.AvatarID)));
  const snapshot: CharacterNameSnapshot = {
    schemaVersion: 1,
    normalizationVersion: SEARCH_NORMALIZATION_VERSION,
    namingPolicyVersion: CHARACTER_NAMING_POLICY_VERSION,
    sourceCommit,
    characters: {}
  };
  const displayNames: Record<string, string> = {};
  const groupName = merged.some(({ AvatarID }) => trailblazerGender(String(AvatarID)))
    ? resolveTrailblazerGroupName(namingOwners, text)
    : undefined;
  for (const avatar of [...merged].sort((a, b) =>
    compareSearchText(String(a.AvatarID), String(b.AvatarID))
  )) {
    const id = String(avatar.AvatarID);
    const table = ordinaryIds.has(id) ? 'AvatarConfig' : 'AvatarConfigLD';
    const source = runtimeTextSourceFromRef(avatar.AvatarName, {
      entity: 'character',
      id,
      field: 'AvatarName'
    });
    const displayName = resolveAvatarName(id, text, source);
    const textHash = hashOf(avatar.AvatarName);
    const canonicalName = gameTextToPlain(displayName);
    if (!textHash || !normalizeSearch(canonicalName) || hasNamePlaceholder(canonicalName))
      throw new Error(`角色 ${id} canonicalName 无效`);
    const gender = trailblazerGender(id);
    displayNames[id] = displayName;
    snapshot.characters[id] = {
      canonicalName,
      canonicalSource: {
        table,
        recordId: id,
        field: 'AvatarName',
        textHash,
        policy: gender ? 'trailblazer-nickname' : 'avatar-name'
      },
      officialAliases: gender && groupName ? [groupName] : []
    };
  }
  return { snapshot, displayNames };
}

export async function deriveCharacterNames(root: string, commit: string, resolver?: TextResolver) {
  const locale = getPublicLocale();
  const [avatars, ldAvatars, text, namingOwners] = await Promise.all([
    readTable<AvatarNameRow>(root, 'AvatarConfig'),
    readTable<AvatarNameRow>(root, 'AvatarConfigLD'),
    resolver ??
      loadTextMap(root, locale.textMapCode).then((map) =>
        createTextResolver({ locale: locale.locale, textMapCode: locale.textMapCode }, map)
      ),
    readTable<NamingOwnerRow>(root, 'FateRinOwner')
  ]);
  return buildCharacterNames(avatars, ldAvatars, text, commit, namingOwners);
}
