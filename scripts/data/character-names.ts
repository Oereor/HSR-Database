import { gameTextToPlain, normalizeGameText } from '../../src/lib/domain/game-text.js';
import {
  CHARACTER_NAMING_POLICY_VERSION,
  type CharacterNameSnapshot,
  type NameTextSource
} from '../../src/lib/search/name-metadata.js';
import {
  compareSearchText,
  hasNamePlaceholder,
  normalizeSearch,
  SEARCH_NORMALIZATION_VERSION
} from '../../src/lib/search/normalization.js';
import { createTextResolver, loadTextMap, type TextResolver } from './localization.js';
import { hashOf, mergeConfigSources, readTable } from './raw.js';

interface AvatarNameRow {
  AvatarID: number | string;
  AvatarName: unknown;
  AvatarBaseType: string;
}
interface PathRow {
  ID: string;
  BaseTypeText: unknown;
}
interface MultiplePathRow {
  AvatarID: number | string;
  BaseAvatarID: number | string;
}

interface NamingOwnerRow {
  PHFMCACHFIJ: string;
  OENAMINOLLF: unknown;
}

export function resolveTrailblazerBaseName(rows: NamingOwnerRow[], text: TextResolver): string {
  const matches = rows.filter((row) => row.PHFMCACHFIJ === 'Trailblazer');
  if (matches.length !== 1 || hashOf(matches[0].OENAMINOLLF) !== '4036035618718239522')
    throw new Error('FateRinOwner.Trailblazer.OENAMINOLLF provenance requires review');
  const name = normalizeGameText(
    text.resolveRef(matches[0].OENAMINOLLF, {
      entity: 'character-base-name',
      id: '8001',
      field: 'FateRinOwner.Trailblazer.OENAMINOLLF'
    })
  );
  if (!name || hasNamePlaceholder(name)) throw new Error('Trailblazer base name is missing');
  return name;
}

export function buildCharacterNames(
  avatars: AvatarNameRow[],
  ldAvatars: AvatarNameRow[],
  paths: PathRow[],
  multiplePaths: MultiplePathRow[],
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
  const pathsById = new Map(paths.map((row) => [String(row.ID), row]));
  const multiById = new Map(multiplePaths.map((row) => [String(row.AvatarID), row]));
  const snapshot: CharacterNameSnapshot = {
    schemaVersion: 1,
    normalizationVersion: SEARCH_NORMALIZATION_VERSION,
    namingPolicyVersion: CHARACTER_NAMING_POLICY_VERSION,
    sourceCommit,
    characters: {}
  };
  const displayNames: Record<string, string> = {};
  const baseNames: Record<string, string> = {};
  for (const avatar of [...merged].sort((a, b) =>
    compareSearchText(String(a.AvatarID), String(b.AvatarID))
  )) {
    const id = String(avatar.AvatarID);
    const table = ordinaryIds.has(id) ? 'AvatarConfig' : 'AvatarConfigLD';
    const rawName = normalizeGameText(
      text.resolveRef(avatar.AvatarName, { entity: 'character', id, field: 'AvatarName' })
    );
    const textHash = hashOf(avatar.AvatarName);
    if (!textHash || !rawName) throw new Error(`角色 ${id} 缺少 canonical AvatarName/CHS`);
    const source: NameTextSource = { table, recordId: id, field: 'AvatarName', textHash };
    const baseAvatarId = String(multiById.get(id)?.BaseAvatarID ?? '');
    const isMultiplePath = baseAvatarId === '8001' || baseAvatarId === '1001';
    const path = pathsById.get(avatar.AvatarBaseType);
    const pathHash = hashOf(path?.BaseTypeText);
    const pathName = isMultiplePath
      ? text.resolveRef(path?.BaseTypeText, {
          entity: 'path',
          id: avatar.AvatarBaseType,
          field: 'BaseTypeText'
        })
      : '';
    if (isMultiplePath && (!pathHash || !pathName)) throw new Error(`角色 ${id} 缺少命途名称`);
    const baseName =
      baseAvatarId === '8001' ? resolveTrailblazerBaseName(namingOwners, text) : rawName;
    baseNames[id] = gameTextToPlain(baseName);
    const displayName = isMultiplePath ? `${baseName}·${pathName}` : rawName;
    const canonicalName = gameTextToPlain(displayName);
    if (!normalizeSearch(canonicalName) || hasNamePlaceholder(canonicalName))
      throw new Error(`角色 ${id} canonicalName 无效`);
    displayNames[id] = displayName;
    // Explicit reviewed provenance rule. Other differing raw names are NOT aliases.
    const officialBaseName = (id === '1001' || id === '1224') && baseAvatarId === '1001';
    const reviewedMarchHashes: Record<string, string> = {
      '1001': '6186714091647966180',
      '1224': '16417870574330506928'
    };
    if (officialBaseName && textHash !== reviewedMarchHashes[id])
      throw new Error(`角色 ${id} official-base-name 规则需要重新审阅`);
    snapshot.characters[id] = {
      canonicalName,
      canonicalSource: {
        ...source,
        policy: isMultiplePath ? 'multiple-path' : 'avatar-name',
        ...(isMultiplePath
          ? {
              baseAvatarId,
              path: {
                table: 'AvatarBaseType',
                recordId: avatar.AvatarBaseType,
                field: 'BaseTypeText',
                textHash: pathHash!
              }
            }
          : {})
      },
      officialAliases: officialBaseName
        ? [{ value: gameTextToPlain(rawName), sourceKind: 'official-base-name', ...source }]
        : []
    };
  }
  return { snapshot, displayNames, baseNames };
}

export async function deriveCharacterNames(root: string, commit: string, resolver?: TextResolver) {
  const [avatars, ldAvatars, paths, multiplePaths, text, namingOwners] = await Promise.all([
    readTable<AvatarNameRow>(root, 'AvatarConfig'),
    readTable<AvatarNameRow>(root, 'AvatarConfigLD'),
    readTable<PathRow>(root, 'AvatarBaseType'),
    readTable<MultiplePathRow>(root, 'MultiplePathAvatarConfig'),
    resolver ?? loadTextMap(root).then(createTextResolver),
    readTable<NamingOwnerRow>(root, 'FateRinOwner')
  ]);
  return buildCharacterNames(avatars, ldAvatars, paths, multiplePaths, text, commit, namingOwners);
}
