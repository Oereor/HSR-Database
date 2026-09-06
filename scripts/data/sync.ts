/* eslint-disable @typescript-eslint/no-unused-vars -- legacy producer helpers retained during B3 cutover */
import { resolveEnemySkillSource, loadEnemySkillInclusionPolicy } from './enemy-skill-policy.js';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AvatarEquipmentRecommendation,
  CatalogEntry,
  Character,
  CharacterEnergy,
  CharacterProfile,
  CharacterSpecialEffectEntry,
  DataManifest,
  Enemy,
  EnemySkill,
  LightCone,
  RelicCatalogEntry,
  RelicEffectRequirement,
  RelicProperty,
  RelicSet,
  RelicSetCategory,
  RelicSlot,
  SkillExtraEffect,
  SkillVariant,
  Trace
} from '../../src/lib/domain/types.js';
import { parseTextHash } from '../../src/lib/domain/types.js';
import { rarityFromCode, relicTypeNames } from '../../src/lib/domain/constants.js';
import { isElementType, normalizeElementType } from '../../src/lib/domain/elements.js';
import {
  createTextResolver,
  loadTextMap,
  type TextDiagnosticDisposition,
  type TextSource
} from './localization.js';
import {
  addDescriptionDiagnostics,
  createDescriptionDiagnosticSummary,
  normalizeLevelledDescriptions
} from './levelled.js';
import { createMissingTextAuditCollector } from './missing-text.js';
import {
  assertDataRoot,
  assertInsideSite,
  auditRoot,
  generatedRoot,
  sourceCommit,
  staticGeneratedRoot
} from './paths.js';
import { mergeConfigSources, numberOf, readTable } from './raw.js';
import { decimalOf } from './decimal.js';
import { normalizeSkillCombatMeta } from './skill-combat.js';
import {
  buildSkillVariant,
  buildSkillCards,
  classifyAvatarSkill,
  classifyMemospriteSkill,
  isPlayerFacingSkillConfig,
  type SkillVariantInput
} from './skills.js';
import {
  normalizeSpecialEffectLinks,
  recordSpecialEffectDiagnostic,
  resolveSpecialEffectSkillLinks
} from './special-effects.js';
import {
  createAvatarSpecialSkillTreeAudit,
  indexAvatarSpecialSkillRelations,
  normalizeAvatarSpecialSkillRelations,
  resolveAvatarSpecialSkillRelations
} from './avatar-special-skills.js';
import { characterStatFields, lightConeStatFields, normalizeStatProgression } from './stats.js';
import { formatGameMarkup, formatGameText } from './text.js';
import { characterLdSourceNames, characterLdSourceSpecs } from './character-sources.js';
import { normalizeGameText } from '../../src/lib/domain/game-text.js';
import { collectEndgameSearchNames } from '../../src/lib/domain/search-index.js';
import { deriveCharacterNames } from './character-names.js';
import {
  buildSearchDocuments,
  loadPlayerAliases,
  type SearchBuildInputs
} from './search-documents.js';
import { buildEndgameData } from './endgame.js';
import { createExtraEffectResolver } from './extra-effects.js';
import { buildHomepageRecentWarpData } from './homepage.js';
import { parseGameVersion } from './source-metadata.js';
import type { CharacterDetailIconKey } from '../../src/lib/domain/character-detail-icons.js';
import { configuredCharacterDetailIconKey } from './character-detail-icons.js';
import {
  buildEnemySkillPhases,
  normalizeEnemyPhases,
  normalizeSpecialResistances,
  normalizedElementLabel,
  resolveCanonicalEnemyStats
} from './enemy-detail.js';
import { buildCharacterDomain } from './domain/character.js';
import { buildLightConeDomain } from './domain/light-cone.js';
import { buildRelicDomain } from './domain/relic.js';
import { projectCharacter } from './projection/character.js';
import { projectLightCone } from './projection/light-cone.js';
import { projectRelic } from './projection/relic.js';
import { validateSiteMessageFiles } from '../messages.js';
import { getProductionLocale } from './locale-registry.js';

type Raw = Record<string, any>;

const by = <T extends Raw>(rows: T[], key: string): Map<string, T> =>
  new Map(rows.map((row) => [String(row[key]), row]));

const grouped = <T extends Raw>(rows: T[], key: string): Map<string, T[]> => {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const id = String(row[key]);
    result.set(id, [...(result.get(id) ?? []), row]);
  }
  return result;
};

const values = (items: any[] | undefined): number[] => (items ?? []).map(numberOf);

function modifierOf(config: Raw, field: string) {
  const ratio = config[`${field}ModifyRatio`];
  const value = config[`${field}ModifyValue`];
  return {
    ratio: decimalOf(
      ratio ?? { Value: '1' },
      `MonsterConfig.${config.MonsterID}.${field}ModifyRatio`
    ),
    ...(value !== undefined && value !== null
      ? { value: decimalOf(value, `MonsterConfig.${config.MonsterID}.${field}ModifyValue`) }
      : {})
  };
}

async function resetDirectory(directory: string): Promise<void> {
  assertInsideSite(directory);
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
}

async function writeJson(file: string, value: unknown): Promise<void> {
  assertInsideSite(file);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value)}\n`, 'utf8');
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function defined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

export async function syncData(): Promise<DataManifest> {
  const root = assertDataRoot();
  const locale = getProductionLocale();
  const commit = sourceCommit(root);
  const sourceVersion = execFileSync(
    'git',
    ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, 'log', '-1', '--pretty=%s'],
    { encoding: 'utf8', windowsHide: true }
  ).trim();
  const gameVersion = parseGameVersion(sourceVersion);
  const siteMessages = await validateSiteMessageFiles();

  console.log(`读取上游数据：${root}`);
  console.log(`上游版本：${commit.slice(0, 12)} · ${sourceVersion}`);
  if (!gameVersion.gameVersionFull)
    console.warn('数据版本解析失败：TurnBasedGameData HEAD subject 不符合 OSPRODWin 版本格式。');

  const missingText = createMissingTextAuditCollector();
  const textMap = await loadTextMap(root, locale.textMapCode);
  const textMapDigest = createHash('sha256').update(JSON.stringify(textMap)).digest('hex');
  const text = await createTextResolver(
    { locale: locale.locale, textMapCode: locale.textMapCode },
    textMap,
    (kind, identifier, textSource) => {
      missingText.record(
        kind === 'invalid-reference' ? 'D' : 'A',
        kind === 'invalid-reference' ? 'invalid-reference' : 'missing-chs-text',
        textSource,
        identifier
      );
    }
  );
  const descriptionDiagnostics = createDescriptionDiagnosticSummary();
  const unknownSkillEffects = new Set<string>();
  const source = (entity: string, id: string | number, field: string): TextSource => ({
    entity,
    id: String(id),
    field
  });
  const collectDescriptionDiagnostics = (
    entity: string,
    id: string,
    diagnostics: Parameters<typeof addDescriptionDiagnostics>[3]
  ): void => {
    addDescriptionDiagnostics(descriptionDiagnostics, entity, id, diagnostics);
    for (const diagnostic of diagnostics)
      missingText.record(
        diagnostic.code === 'invalid-param' ? 'D' : 'B',
        diagnostic.code === 'invalid-param'
          ? 'invalid-description-parameter'
          : 'unsupported-description-parameter',
        source(entity, id, `Level.${diagnostic.level}`),
        diagnostic.placeholder
      );
  };
  if (
    text.resolveSymbolic(
      'RelicDesc_1012',
      source('relic-set', '101', 'RelicSetSkillConfig.SkillDesc')
    ) !==
    text.resolveHash(
      parseTextHash('12720770977431568614')!,
      source('regression', 'RelicDesc_1012', 'expectedHash')
    )
  ) {
    throw new Error('XXHash64 文本键校验失败：RelicDesc_1012');
  }

  const tableNames = [
    'AvatarConfig',
    'AvatarConfigEnhanced',
    'AvatarEnhancedSkill',
    'AvatarEnhancedSkillTree',
    'AvatarEnhancedRank',
    'AvatarUltraSkillConfig',
    'GridFightFrontSpecialSP',
    'MultiplePathAvatarConfig',
    'ItemConfigAvatar',
    'AvatarBaseType',
    'DamageType',
    'AvatarSkillConfig',
    'AvatarSkillLink',
    'AvatarSpecialSkillTree',
    'AvatarGlobalBuffConfig',
    'AvatarServantConfig',
    'AvatarServantSkillConfig',
    'AvatarServantSkillLink',
    'AvatarSkillTreeConfig',
    'AvatarRankConfig',
    'AvatarPromotionConfig',
    'AvatarPropertyConfig',
    'EquipmentConfig',
    'GachaBasicInfo',
    'ItemConfigEquipment',
    'EquipmentSkillConfig',
    'EquipmentPromotionConfig',
    'RelicSetConfig',
    'RelicSetSkillConfig',
    'RelicDataInfo',
    'RelicBaseType',
    'RelicMainAffixConfig',
    'RelicSubAffixConfig',
    'AvatarEquipRecommend',
    'AvatarRelicRecommend',
    'ItemComefrom',
    'MonsterTemplateConfig',
    'MonsterConfig',
    'MonsterSkillConfig',
    'HardLevelGroup',
    'EliteGroup',
    'ExtraEffectConfig',
    'ChallengeBossMazeExtra',
    'MonsterGuideConfig',
    'MonsterGuideTag'
  ] as const;
  const loaded = await Promise.all(tableNames.map((name) => readTable<Raw>(root, name)));
  const regularTables = Object.fromEntries(
    tableNames.map((name, index) => [name, loaded[index]])
  ) as Record<(typeof tableNames)[number], Raw[]>;
  const ldTableNames = characterLdSourceNames;
  const ldLoaded = await Promise.all(ldTableNames.map((name) => readTable<Raw>(root, name)));
  const ldTables = Object.fromEntries(
    ldTableNames.map((name, index) => [name, ldLoaded[index]])
  ) as Record<(typeof ldTableNames)[number], Raw[]>;
  const tables = { ...regularTables };
  for (const spec of characterLdSourceSpecs)
    tables[spec.tableName] = mergeConfigSources(
      spec.tableName,
      [
        { name: `${spec.tableName}.json`, rows: regularTables[spec.tableName] },
        { name: `${spec.additionalName}.json`, rows: ldTables[spec.additionalName] }
      ],
      spec.identityOf
    );

  const avatarProperties = by(tables.AvatarPropertyConfig, 'PropertyType');
  const propertyIconKey = (propertyType: string): CharacterDetailIconKey | undefined =>
    configuredCharacterDetailIconKey(
      'property',
      propertyType,
      avatarProperties.get(propertyType)?.IconPath,
      `AvatarPropertyConfig.${propertyType}`
    );
  const baseStatIconKeys = (entries: ReadonlyArray<readonly [string, string]>) =>
    Object.fromEntries(
      entries.flatMap(([field, propertyType]) => {
        const iconKey = propertyIconKey(propertyType);
        return iconKey ? [[field, iconKey]] : [];
      })
    );

  const specialEnergyAvatarIds = new Set(
    tables.AvatarUltraSkillConfig.filter((row) => row.UltraSkillType === 'SpecialSP').map((row) =>
      String(row.AvatarID)
    )
  );
  const specialEnergyRowsFor = (avatarId: string): Raw[] =>
    tables.GridFightFrontSpecialSP.filter((row) => {
      const roleId = String(row.RoleID ?? '');
      const variantSuffix = roleId.slice(avatarId.length);
      return roleId === avatarId || (roleId.startsWith(avatarId) && /^\d$/.test(variantSuffix));
    });
  const energyFor = (avatar: Raw): CharacterEnergy => {
    const avatarId = String(avatar.AvatarID);
    if (specialEnergyAvatarIds.has(avatarId)) {
      const configuredRows = specialEnergyRowsFor(avatarId);
      if (
        !configuredRows.length ||
        configuredRows.some((row) => {
          const maximum = numberOf(row.MaxSpecialSP);
          return !Number.isFinite(maximum) || maximum <= 0;
        })
      )
        throw new Error(`角色 ${avatarId} 的特殊能量上限配置无效`);
      const iconKey = propertyIconKey('SpecialMaxSP');
      return {
        kind: 'special',
        max: 0,
        ...(iconKey ? { iconKey } : {})
      };
    }
    const maximum = numberOf(avatar.SPNeed);
    if (!Number.isFinite(maximum) || maximum <= 0)
      throw new Error(`角色 ${avatarId} 的普通能量上限配置无效`);
    const iconKey = propertyIconKey('MaxSP');
    return {
      kind: 'standard',
      max: maximum,
      ...(iconKey ? { iconKey } : {})
    };
  };

  const isEmptyTextSource = (value: unknown): boolean =>
    value === undefined ||
    value === null ||
    value === '' ||
    (typeof value === 'object' && Object.keys(value).length === 0);
  const auditResolvedText = (value: string, textSource: TextSource): void => {
    if (/<icon\b/i.test(value))
      missingText.record('B', 'unsupported-icon-markup', textSource, '<icon>');
  };
  const tr = (
    value: unknown,
    textSource: TextSource,
    fallback = '',
    disposition: TextDiagnosticDisposition = {
      requirement: fallback ? 'required' : 'optional',
      visibility: fallback ? 'emitted' : 'hidden',
      fallbackUsed: !!fallback,
      productRouteReachability: 'reachable'
    }
  ): string => {
    if (isEmptyTextSource(value)) missingText.record('A', 'missing-source-field', textSource);
    const resolved = text.resolveRef(value, textSource, disposition);
    auditResolvedText(resolved, textSource);
    return normalizeGameText(resolved || fallback);
  };
  const trSymbolic = (value: unknown, textSource: TextSource, fallback = ''): string => {
    if (isEmptyTextSource(value)) {
      missingText.record('A', 'missing-source-field', textSource);
      return fallback;
    }
    if (typeof value !== 'string') {
      missingText.record('B', 'unsupported-symbolic-reference', textSource, JSON.stringify(value));
      return fallback;
    }
    const result = text.resolve(
      { kind: 'direct', ref: { kind: 'symbolic', key: value }, provenance: textSource },
      {
        diagnosticDisposition: {
          requirement: fallback ? 'required' : 'optional',
          visibility: fallback ? 'emitted' : 'hidden',
          fallbackUsed: !!fallback,
          productRouteReachability: 'reachable'
        }
      }
    );
    const resolved = result.status === 'available' ? result.value : '';
    auditResolvedText(resolved, textSource);
    return normalizeGameText(resolved || fallback);
  };
  const avatarItems = by(tables.ItemConfigAvatar, 'ID');
  const equipmentItems = by(tables.ItemConfigEquipment, 'ID');
  const equipmentRows = by(tables.EquipmentConfig, 'EquipmentID');
  const pathRows = by(tables.AvatarBaseType, 'ID');
  const damageRows = by(tables.DamageType, 'ID');
  const itemSources = grouped(tables.ItemComefrom, 'ID');
  // These are complete raw indexes. HideInUI is a standard-presentation rule and must
  // never be applied while building either lookup.
  const avatarSkillById = grouped(tables.AvatarSkillConfig, 'SkillID');
  const avatarConfigsById = by(tables.AvatarConfig, 'AvatarID');
  const avatarGlobalBuffs = grouped(tables.AvatarGlobalBuffConfig, 'AvatarID');
  const servantSkillById = grouped(tables.AvatarServantSkillConfig, 'SkillID');
  const avatarTraces = grouped(tables.AvatarSkillTreeConfig, 'AvatarID');
  const avatarRanks = by(tables.AvatarRankConfig, 'RankID');
  const avatarPromotions = grouped(tables.AvatarPromotionConfig, 'AvatarID');
  const equipmentSkills = grouped(tables.EquipmentSkillConfig, 'SkillID');
  const equipmentPromotions = grouped(tables.EquipmentPromotionConfig, 'EquipmentID');
  const relicSkills = grouped(tables.RelicSetSkillConfig, 'SetID');
  const relicParts = grouped(tables.RelicDataInfo, 'SetID');
  const relicSetRows = by(tables.RelicSetConfig, 'SetID');
  const relicBaseTypes = by(
    tables.RelicBaseType.filter((row) => row.Type),
    'Type'
  );
  const equipmentRecommendations = by(tables.AvatarEquipRecommend, 'AvatarID');
  const relicRecommendations = by(tables.AvatarRelicRecommend, 'AvatarID');
  const monsterRows = by(tables.MonsterConfig, 'MonsterID');
  const monsterTemplates = by(tables.MonsterTemplateConfig, 'MonsterTemplateID');
  const monsterSkillRows = by(tables.MonsterSkillConfig, 'SkillID');
  const hardLevelRows = grouped(tables.HardLevelGroup, 'HardLevelGroup');
  const eliteRows = by(tables.EliteGroup, 'EliteGroup');
  const avatarSpecialSkillTreeAudit = createAvatarSpecialSkillTreeAudit();
  const avatarSpecialSkillRelations = resolveAvatarSpecialSkillRelations(
    normalizeAvatarSpecialSkillRelations(
      tables.AvatarSpecialSkillTree,
      avatarSpecialSkillTreeAudit
    ),
    {
      avatarConfigsById,
      avatarSkillIds: new Set(avatarSkillById.keys()),
      traceRowsByAvatarId: avatarTraces
    },
    avatarSpecialSkillTreeAudit
  );
  const avatarSpecialSkillRelationsByAvatar = indexAvatarSpecialSkillRelations(
    avatarSpecialSkillRelations
  );
  const specialEffectLinks = normalizeSpecialEffectLinks(
    tables.AvatarSkillLink,
    tables.AvatarServantSkillLink
  );
  const resolvedAvatarSpecialEffectLinks = resolveSpecialEffectSkillLinks(
    specialEffectLinks.avatar,
    'AvatarSkillLink',
    new Set(avatarSkillById.keys()),
    specialEffectLinks.audit
  );
  const resolvedServantSpecialEffectLinks = resolveSpecialEffectSkillLinks(
    specialEffectLinks.servant,
    'AvatarServantSkillLink',
    new Set(servantSkillById.keys()),
    specialEffectLinks.audit
  );
  const ownedAvatarSpecialEffectLinks = new Set<string>();
  const ownedServantSpecialEffectLinks = new Set<string>();

  const extraEffectIdsOf = (row: Raw): string[] =>
    unique(
      [
        ...(Array.isArray(row.ExtraEffectIDList) ? row.ExtraEffectIDList : []),
        ...(Array.isArray(row.SimpleExtraEffectIDList) ? row.SimpleExtraEffectIDList : [])
      ].map(String)
    );

  const extraEffectResolver = createExtraEffectResolver(tables.ExtraEffectConfig, tr, {
    onUnresolved: (extraEffectId, textSource) =>
      missingText.record('C', 'unresolved-relation', textSource, `extra-effect:${extraEffectId}`),
    onDescriptionDiagnostics: (extraEffectId, diagnostics, textSource) => {
      collectDescriptionDiagnostics(
        textSource.entity,
        extraEffectId,
        diagnostics.map((diagnostic) => ({ level: 1, ...diagnostic }))
      );
    }
  });

  const resolveExtraEffects = (
    rawIds: unknown[],
    ownerEntity: string,
    ownerId: string,
    onUnresolved?: (extraEffectId: string) => void
  ): SkillExtraEffect[] => {
    const ids = unique(rawIds.map(String));
    if (!onUnresolved)
      return extraEffectResolver.resolve(ids, {
        ownerEntity,
        ownerId,
        field: 'ExtraEffectIDList'
      });
    const resolvable = ids.filter((extraEffectId) => {
      if (extraEffectResolver.has(extraEffectId)) return true;
      onUnresolved(extraEffectId);
      return false;
    });
    return extraEffectResolver.resolve(resolvable, {
      ownerEntity,
      ownerId,
      field: 'ExtraEffectIDList'
    });
  };
  const enhancedAvatars = by(tables.AvatarConfigEnhanced, 'AvatarID');

  if (enhancedAvatars.size !== tables.AvatarConfigEnhanced.length)
    throw new Error('AvatarConfigEnhanced 存在重复 AvatarID');

  const enhancedTraceExists = (avatarId: unknown, pointId: unknown): boolean => {
    const config = enhancedAvatars.get(String(avatarId));
    return (
      !!config &&
      (avatarTraces.get(String(avatarId)) ?? []).some(
        (row) =>
          String(row.PointID) === String(pointId) &&
          Number(row.EnhancedID ?? 0) === Number(config.EnhancedID)
      )
    );
  };

  for (const config of tables.AvatarConfigEnhanced) {
    const avatarId = String(config.AvatarID);
    if (!tables.AvatarConfig.some((avatar) => String(avatar.AvatarID) === avatarId))
      throw new Error(`加强配置引用了未知角色：${avatarId}`);
    for (const skillId of config.SkillList ?? [])
      if (!avatarSkillById.has(String(skillId)))
        throw new Error(`角色 ${avatarId} 的加强技能不存在：${skillId}`);
    for (const rankId of config.RankIDList ?? [])
      if (!avatarRanks.has(String(rankId)))
        throw new Error(`角色 ${avatarId} 的加强星魂不存在：${rankId}`);
    if (
      !(avatarTraces.get(avatarId) ?? []).some(
        (row) => Number(row.EnhancedID) === Number(config.EnhancedID)
      )
    )
      throw new Error(`角色 ${avatarId} 缺少 EnhancedID=${config.EnhancedID} 的加强行迹`);
  }

  for (const declaration of tables.AvatarEnhancedSkill) {
    const config = enhancedAvatars.get(String(declaration.AvatarID));
    if (
      !config ||
      !(config.SkillList ?? []).map(String).includes(String(declaration.SkillID)) ||
      !avatarSkillById.has(String(declaration.SkillID)) ||
      !enhancedTraceExists(declaration.AvatarID, declaration.SkillTreeID)
    )
      throw new Error(`无效的加强技能声明：${declaration.AvatarID}:${declaration.SkillID}`);
  }
  for (const declaration of tables.AvatarEnhancedSkillTree)
    if (!enhancedTraceExists(declaration.AvatarID, declaration.SkillTreeID))
      throw new Error(`无效的加强行迹声明：${declaration.AvatarID}:${declaration.SkillTreeID}`);
  for (const declaration of tables.AvatarEnhancedRank) {
    const config = enhancedAvatars.get(String(declaration.AvatarID));
    if (
      !config ||
      !(config.RankIDList ?? []).map(String).includes(String(declaration.RankID)) ||
      !avatarRanks.has(String(declaration.RankID))
    )
      throw new Error(`无效的加强星魂声明：${declaration.AvatarID}:${declaration.RankID}`);
  }

  type CharacterProfileMode = 'base' | 'enhanced';
  const globalBuffProfileKey = (avatarId: string, mode: CharacterProfileMode): string =>
    `${avatarId}:${mode}`;
  const globalBuffRowsByProfile = new Map<string, Raw[]>();
  for (const [avatarId, globalBuffRows] of avatarGlobalBuffs) {
    const avatar = tables.AvatarConfig.find((row) => String(row.AvatarID) === avatarId);
    if (!avatar) throw new Error(`AvatarGlobalBuffConfig 引用了未知角色：${avatarId}`);
    const profileConfigs: Array<{ mode: CharacterProfileMode; config: Raw }> = [
      { mode: 'base', config: avatar }
    ];
    const enhanced = enhancedAvatars.get(avatarId);
    if (enhanced) profileConfigs.push({ mode: 'enhanced', config: enhanced });
    for (const globalBuff of globalBuffRows) {
      const skillId = String(globalBuff.SkillID);
      const skillCategory = classifyAvatarSkill(avatarSkillById.get(skillId)?.[0] ?? {});
      const matches = profileConfigs.filter(
        ({ config }) =>
          (config.SkillList ?? []).map(String).includes(skillId) && skillCategory === 'talent'
      );
      if (matches.length !== 1)
        throw new Error(
          `角色 ${avatarId} 的 AvatarGlobalBuffConfig.SkillID=${skillId} 应唯一关联一个 Talent，实际 ${matches.length} 个`
        );
      const key = globalBuffProfileKey(avatarId, matches[0].mode);
      globalBuffRowsByProfile.set(key, [...(globalBuffRowsByProfile.get(key) ?? []), globalBuff]);
    }
  }

  const missingRelation = (
    entity: string,
    id: string | number,
    field: string,
    targetType: string,
    targetId: unknown,
    exists: boolean
  ): void => {
    if (!exists)
      missingText.record(
        'C',
        'unresolved-relation',
        source(entity, id, field),
        `${targetType}:${String(targetId)}`
      );
  };
  for (const avatar of tables.AvatarConfig) {
    for (const skillId of avatar.SkillList ?? [])
      missingRelation(
        'character',
        avatar.AvatarID,
        'SkillList',
        'character-skill',
        skillId,
        avatarSkillById.has(String(skillId))
      );
    for (const rankId of avatar.RankIDList ?? [])
      missingRelation(
        'character',
        avatar.AvatarID,
        'RankIDList',
        'character-eidolon',
        rankId,
        avatarRanks.has(String(rankId))
      );
  }
  for (const equipment of tables.EquipmentConfig)
    missingRelation(
      'light-cone',
      equipment.EquipmentID,
      'SkillID',
      'light-cone-superimposition',
      equipment.SkillID,
      equipmentSkills.has(String(equipment.SkillID))
    );
  for (const piece of tables.RelicDataInfo)
    missingRelation(
      'relic-piece',
      piece.ID ?? `${piece.SetID}:${piece.Type}`,
      'SetID',
      'relic-set',
      piece.SetID,
      relicSetRows.has(String(piece.SetID))
    );
  for (const config of tables.MonsterConfig)
    for (const skillId of config.SkillList ?? [])
      missingRelation(
        'enemy',
        config.MonsterID,
        'SkillList',
        'enemy-skill',
        skillId,
        monsterSkillRows.has(String(skillId))
      );
  const pathName = (id: string): string =>
    tr(pathRows.get(id)?.BaseTypeText, source('path', id, 'BaseTypeText'), id);
  const elementName = (id: string): string =>
    tr(damageRows.get(id)?.DamageTypeName, source('element', id, 'DamageTypeName'), id);
  const sourceTexts = (id: string | number): string[] =>
    unique(
      (itemSources.get(String(id)) ?? [])
        .map((row) => tr(row.Desc, source('item-source', id, 'Desc')))
        .filter(Boolean)
    );

  const relicSlots = ['HEAD', 'HAND', 'BODY', 'FOOT', 'NECK', 'OBJECT'] as const;
  const cavernSlots = new Set<RelicSlot>(['HEAD', 'HAND', 'BODY', 'FOOT']);
  const planarSlots = new Set<RelicSlot>(['NECK', 'OBJECT']);
  const normalizeRelicSlot = (value: unknown, context: string): RelicSlot => {
    const slot = String(value ?? '');
    if (!(relicSlots as readonly string[]).includes(slot))
      throw new Error(`${context} 包含未知遗器槽位：${slot}`);
    return slot as RelicSlot;
  };
  const relicCategoryForSlots = (slots: RelicSlot[], context: string): RelicSetCategory => {
    if (slots.length && slots.every((slot) => cavernSlots.has(slot))) return 'cavern';
    if (slots.length && slots.every((slot) => planarSlots.has(slot))) return 'planar';
    throw new Error(`${context} 的遗器部件槽位无法归入单一套装分类：${slots.join(',')}`);
  };
  const relicCategoryForSet = (setId: string): RelicSetCategory =>
    relicCategoryForSlots(
      (relicParts.get(setId) ?? []).map((piece) =>
        normalizeRelicSlot(piece.Type, `遗器套装 ${setId}`)
      ),
      `遗器套装 ${setId}`
    );

  const relicPieceId = (piece: Raw, context: string): string => {
    const id =
      typeof piece.RelicName === 'string' ? /_(\d+)$/.exec(piece.RelicName)?.[1] : undefined;
    if (!id) throw new Error(`${context} 的 RelicName 缺少稳定的遗器部件 ID`);
    return id;
  };

  const mainAffixPropertyTypes = new Set(
    tables.RelicMainAffixConfig.map((row) => String(row.Property ?? '')).filter(Boolean)
  );
  const subAffixPropertyTypes = new Set(
    tables.RelicSubAffixConfig.map((row) => String(row.Property ?? '')).filter(Boolean)
  );
  const relicPropertyTypes = unique([...mainAffixPropertyTypes, ...subAffixPropertyTypes]).sort(
    (a, b) => a.localeCompare(b)
  );
  const relicProperties: RelicProperty[] = relicPropertyTypes.map((propertyType) => {
    const property = avatarProperties.get(propertyType);
    if (!property) throw new Error(`遗器属性 ${propertyType} 无法关联 AvatarPropertyConfig`);
    const allowedMainSlots = relicSlots.filter((slot) =>
      (relicBaseTypes.get(slot)?.ValidPropertyList ?? []).map(String).includes(propertyType)
    );
    if (mainAffixPropertyTypes.has(propertyType) && !allowedMainSlots.length)
      throw new Error(`遗器主属性 ${propertyType} 没有合法槽位`);
    const iconName = path.posix.basename(String(property.IconPath ?? '').replaceAll('\\', '/'));
    const iconKey = /^[A-Za-z0-9_-]+\.png$/i.test(iconName)
      ? iconName.replace(/\.png$/i, '')
      : undefined;
    return {
      propertyType,
      name: tr(
        property.PropertyNameRelic ?? property.PropertyName,
        source('relic-property', propertyType, 'PropertyNameRelic'),
        propertyType
      ),
      ...(iconKey ? { iconKey } : {}),
      allowedMainSlots,
      canBeSubStat: subAffixPropertyTypes.has(propertyType)
    };
  });
  const relicPropertiesByType = new Map(
    relicProperties.map((property) => [property.propertyType, property])
  );

  const recommendationSlots = [
    ['BODY', 'PropertyList3'],
    ['FOOT', 'PropertyList4'],
    ['NECK', 'PropertyList5'],
    ['OBJECT', 'PropertyList6']
  ] as const;
  const recommendationIds = (value: unknown, context: string): string[] => {
    if (!Array.isArray(value)) throw new Error(`${context} 不是数组`);
    const ids = value.map(String);
    if (new Set(ids).size !== ids.length) throw new Error(`${context} 包含重复引用`);
    return ids;
  };
  const recommendationFor = (avatarId: string): AvatarEquipmentRecommendation => {
    const equipment = equipmentRecommendations.get(avatarId);
    const relic = relicRecommendations.get(avatarId);
    if (!equipment || !relic) throw new Error(`角色 ${avatarId} 缺少完整装备推荐配置`);
    const lightConeIds = recommendationIds(
      equipment.EquipmentList,
      `角色 ${avatarId} EquipmentList`
    );
    for (const id of lightConeIds)
      if (!equipmentRows.has(id)) throw new Error(`角色 ${avatarId} 推荐了未知光锥 ${id}`);
    const cavernSetIds = recommendationIds(relic.Set4IDList, `角色 ${avatarId} Set4IDList`);
    const planarSetIds = recommendationIds(relic.Set2IDList, `角色 ${avatarId} Set2IDList`);
    for (const id of cavernSetIds) {
      if (!relicSetRows.has(id)) throw new Error(`角色 ${avatarId} 推荐了未知遗器套装 ${id}`);
      if (relicCategoryForSet(id) !== 'cavern')
        throw new Error(`角色 ${avatarId} 的隧洞遗器推荐 ${id} 分类错误`);
    }
    for (const id of planarSetIds) {
      if (!relicSetRows.has(id)) throw new Error(`角色 ${avatarId} 推荐了未知遗器套装 ${id}`);
      if (relicCategoryForSet(id) !== 'planar')
        throw new Error(`角色 ${avatarId} 的位面饰品推荐 ${id} 分类错误`);
    }
    const mainStatOptions = recommendationSlots.map(([slot, field]) => {
      const propertyTypes = recommendationIds(relic[field], `角色 ${avatarId} ${field}`);
      if (!propertyTypes.length) throw new Error(`角色 ${avatarId} 的 ${slot} 推荐主属性为空`);
      for (const propertyType of propertyTypes) {
        const property = relicPropertiesByType.get(propertyType);
        if (!property) throw new Error(`角色 ${avatarId} 推荐了未知遗器属性 ${propertyType}`);
        if (!property.allowedMainSlots.includes(slot))
          throw new Error(`角色 ${avatarId} 的 ${propertyType} 不能用于 ${slot}`);
      }
      return { slot, propertyTypes };
    });
    const subStatPropertyTypes = recommendationIds(
      relic.SubAffixPropertyList,
      `角色 ${avatarId} SubAffixPropertyList`
    );
    for (const propertyType of subStatPropertyTypes) {
      const property = relicPropertiesByType.get(propertyType);
      if (!property?.canBeSubStat)
        throw new Error(`角色 ${avatarId} 推荐了非法副属性 ${propertyType}`);
    }
    return {
      avatarId,
      lightConeIds,
      cavernSetIds,
      planarSetIds,
      mainStatOptions,
      subStatPropertyTypes
    };
  };

  const characterCatalog: CatalogEntry[] = [];
  const characters: Character[] = [];
  const characterNames = await deriveCharacterNames(root, commit, text);

  const traceStatDescription = (row: Raw, pointId: string): string =>
    (row.StatusAddList ?? [])
      .map((status: Raw, index: number) => {
        const propertyType = String(status.PropertyType ?? '');
        const property = avatarProperties.get(propertyType);
        if (!property) {
          missingText.record(
            'C',
            'unresolved-trace-property',
            source('character-trace', pointId, `StatusAddList.${index}.PropertyType`),
            propertyType
          );
          return '';
        }
        if (status.Value === undefined || status.Value === null) {
          missingText.record(
            'D',
            'invalid-trace-property-value',
            source('character-trace', pointId, `StatusAddList.${index}.Value`),
            propertyType
          );
          return '';
        }
        const value = numberOf(status.Value);
        if (!Number.isFinite(value)) {
          missingText.record(
            'D',
            'invalid-trace-property-value',
            source('character-trace', pointId, `StatusAddList.${index}.Value`),
            String(status.Value)
          );
          return '';
        }
        const template = tr(
          property.PropertyNameSkillTree,
          source('avatar-property', propertyType, 'PropertyNameSkillTree')
        );
        if (!template) {
          missingText.record(
            'C',
            'unresolved-trace-property-template',
            source('character-trace', pointId, `StatusAddList.${index}.PropertyType`),
            propertyType
          );
          return '';
        }
        return formatGameText(template, [value]);
      })
      .filter(Boolean)
      .join('；');

  const progressionIdsFor = (traceRows: Raw[]): Map<string, string> => {
    const result = new Map<string, string>();
    for (const [pointId, rows] of grouped(traceRows, 'PointID'))
      for (const skillId of rows[0]?.LevelUpSkillID ?? []) result.set(String(skillId), pointId);
    return result;
  };

  const normalizeSkillVariant = (
    skillId: string | number,
    rows: Raw[],
    order: number,
    skillSource: SkillVariant['source'],
    progressionId: string | undefined,
    category: SkillVariantInput['category']
  ): SkillVariantInput => {
    const ordered = [...rows].sort((a, b) => Number(a.Level ?? 1) - Number(b.Level ?? 1));
    const first = ordered[0] ?? {};
    const normalized = normalizeLevelledDescriptions(
      ordered.map((level) => ({
        level: Number(level.Level ?? 1),
        params: values(level.ParamList),
        template: tr(
          level.SkillDesc,
          source(`${skillSource}-skill`, `${skillId}:${level.Level ?? 1}`, 'SkillDesc')
        )
      }))
    );
    collectDescriptionDiagnostics(`${skillSource}-skill`, String(skillId), normalized.diagnostics);
    const combatMetaLevels = ordered.map((level) => {
      const formattedResource = formatGameMarkup(
        isEmptyTextSource(level.SkillNeed)
          ? ''
          : tr(
              level.SkillNeed,
              source(`${skillSource}-skill`, `${skillId}:${level.Level ?? 1}`, 'SkillNeed')
            ),
        values(level.ParamList)
      );
      collectDescriptionDiagnostics(
        `${skillSource}-skill-resource`,
        String(skillId),
        formattedResource.diagnostics.map((diagnostic) => ({
          level: Number(level.Level ?? 1),
          ...diagnostic
        }))
      );
      const combatMeta = normalizeSkillCombatMeta({
        skillEffect: level.SkillEffect,
        specialResource: formattedResource.text,
        bpNeed: numberOf(level.BPNeed),
        bpAdd: numberOf(level.BPAdd),
        spBase: numberOf(level.SPBase),
        stanceDamageDisplay: numberOf(level.StanceDamageDisplay),
        showStanceList: level.ShowStanceList,
        extraEffects: resolveExtraEffects(
          extraEffectIdsOf(level),
          `${skillSource}-skill`,
          String(skillId)
        )
      });
      if (combatMeta.effect && !combatMeta.effect.known)
        unknownSkillEffects.add(combatMeta.effect.code);
      return { level: Number(level.Level ?? 1), combatMeta };
    });
    return {
      id: String(skillId),
      name: tr(
        first.SkillName,
        source(`${skillSource}-skill`, skillId, 'SkillName'),
        `技能 ${skillId}`
      ),
      type: tr(
        first.SkillTypeDesc,
        source(`${skillSource}-skill`, skillId, 'SkillTypeDesc'),
        first.AttackType ?? ''
      ),
      order,
      source: skillSource,
      progressionId: normalized.levels.length > 1 ? (progressionId ?? `skill:${skillId}`) : null,
      scalingParamIndexes: normalized.scalingParamIndexes,
      levels: normalized.levels,
      attackType: first.AttackType,
      combatMetaLevels,
      category
    };
  };

  const normalizeGlobalBuffVariant = (
    row: Raw,
    occurrence: number,
    order: number,
    category: SkillVariantInput['category']
  ): SkillVariantInput => {
    const skillId = String(row.SkillID);
    const variantId = `${skillId}:global-buff:${occurrence}`;
    const normalized = normalizeLevelledDescriptions([
      {
        level: 1,
        params: values(row.ParamList),
        template: tr(row.Desc, source('avatar-global-buff', variantId, 'Desc'))
      }
    ]);
    collectDescriptionDiagnostics('avatar-global-buff', variantId, normalized.diagnostics);
    const extraEffects = resolveExtraEffects(
      extraEffectIdsOf(row),
      'avatar-global-buff',
      variantId
    );
    return {
      id: variantId,
      name: tr(row.Name, source('avatar-global-buff', variantId, 'Name'), `技能 ${skillId}`),
      order,
      source: 'avatar-global-buff',
      progressionId: null,
      scalingParamIndexes: normalized.scalingParamIndexes,
      levels: normalized.levels,
      combatMetaLevels: [
        {
          level: 1,
          combatMeta: normalizeSkillCombatMeta({ extraEffects })
        }
      ],
      category
    };
  };

  /* legacy character profile builder removed in B3.1; projection is domain-owned
  const removedCharacterPresentationBuilder = (
    config: Raw,
    traceRows: Raw[],
    avatarBaseType: string,
    globalBuffRows: Raw[]
  ): CharacterProfile => {
    const avatarId = String(config.AvatarID);
    const progressionBySkill = progressionIdsFor(traceRows);
    const skillVariants: SkillVariantInput[] = [];
    const specialEffects: CharacterSpecialEffectEntry[] = [];
    const profileAvatarSkillIds = new Set((config.SkillList ?? []).map(String));
    const explicitlyShownSkillIds = new Set(
      (avatarSpecialSkillRelationsByAvatar.get(avatarId) ?? []).map(
        (relation) => relation.showSkillId
      )
    );
    for (const link of resolvedAvatarSpecialEffectLinks) {
      if (!profileAvatarSkillIds.has(link.skillId)) continue;
      ownedAvatarSpecialEffectLinks.add(link.skillId);
      const rows = avatarSkillById.get(link.skillId) ?? [];
      const category = classifyAvatarSkill(rows[0] ?? {});
      if (!category) {
        recordSpecialEffectDiagnostic(specialEffectLinks.audit, {
          code: 'malformed-relation',
          source: 'AvatarSkillLink',
          identity: link.skillId,
          detail: '显式引用的 Avatar Skill 无法分类，已跳过'
        });
        continue;
      }
      specialEffects.push({
        kind: 'avatar-skill-link',
        skill: buildSkillVariant(
          normalizeSkillVariant(
            link.skillId,
            rows,
            link.sourceOrder,
            'avatar',
            progressionBySkill.get(link.skillId),
            category
          )
        ),
        linkedAvatarIds: link.linkedAvatarIds,
        simplifiedLinkedAvatarIds: link.simplifiedLinkedAvatarIds
      });
    }
    const globalBuffsBySkill = grouped(globalBuffRows, 'SkillID');
    for (const [order, skillId] of (config.SkillList ?? []).entries()) {
      const rows = avatarSkillById.get(String(skillId)) ?? [];
      const matchingGlobalBuffs = globalBuffsBySkill.get(String(skillId)) ?? [];
      const includeByDefault = isPlayerFacingSkillConfig(rows, `AvatarSkillConfig.${skillId}`);
      const includeBySpecialSkillTree = explicitlyShownSkillIds.has(String(skillId));
      const includeAvatarSkill = includeByDefault || includeBySpecialSkillTree;
      if (!includeAvatarSkill && !matchingGlobalBuffs.length) continue;
      const first = rows[0] ?? {};
      const category = classifyAvatarSkill(first);
      if (!category) {
        if (String(first.AttackType ?? '') !== 'MazeNormal')
          missingText.record(
            'D',
            'unclassified-skill',
            source('character-skill', skillId, 'AttackType'),
            String(first.AttackType ?? first.SkillTriggerKey ?? '')
          );
        continue;
      }
      if (includeAvatarSkill)
        skillVariants.push(
          normalizeSkillVariant(
            skillId,
            rows,
            order,
            'avatar',
            progressionBySkill.get(String(skillId)),
            category
          )
        );
      for (const [index, globalBuff] of matchingGlobalBuffs.entries())
        skillVariants.push(
          normalizeGlobalBuffVariant(
            globalBuff,
            index + 1,
            order + (index + 1) / (matchingGlobalBuffs.length + 1),
            category
          )
        );
    }

    const servantPointIds = new Set<string>();
    const typeFourSkillIds = new Set(
      traceRows
        .filter((row) => Number(row.PointType) === 4)
        .flatMap((row) => row.LevelUpSkillID ?? [])
        .map(String)
    );
    const matchedServants = tables.AvatarServantConfig.filter((servant) =>
      (servant.SkillIDList ?? []).some((skillId: number) => typeFourSkillIds.has(String(skillId)))
    );
    if (avatarBaseType === 'Memory' && typeFourSkillIds.size && !matchedServants.length)
      missingText.record(
        'C',
        'unresolved-servant-relation',
        source('character', avatarId, 'AvatarSkillTreeConfig.PointType4'),
        [...typeFourSkillIds].join(',')
      );
    const profileServantSkillIds = new Set(
      matchedServants.flatMap((servant) => (servant.SkillIDList ?? []).map(String))
    );
    for (const link of resolvedServantSpecialEffectLinks) {
      if (!profileServantSkillIds.has(link.skillId)) continue;
      const relationIdentity = `${link.skillId}:${link.linkedAvatarId}`;
      ownedServantSpecialEffectLinks.add(relationIdentity);
      const rows = servantSkillById.get(link.skillId) ?? [];
      const category = classifyMemospriteSkill(rows[0] ?? {});
      if (!category) {
        recordSpecialEffectDiagnostic(specialEffectLinks.audit, {
          code: 'malformed-relation',
          source: 'AvatarServantSkillLink',
          identity: relationIdentity,
          detail: '显式引用的 Servant Skill 无法分类，已跳过'
        });
        continue;
      }
      specialEffects.push({
        kind: 'servant-skill-link',
        skill: buildSkillVariant(
          normalizeSkillVariant(
            link.skillId,
            rows,
            link.order,
            'memosprite',
            progressionBySkill.get(link.skillId),
            category
          )
        ),
        order: link.order,
        linkedAvatarId: link.linkedAvatarId,
        tarotFigurePath: link.tarotFigurePath,
        tarotIconPath: link.tarotIconPath
      });
    }
    let servantOrder = Number.MAX_SAFE_INTEGER / 2;
    for (const servant of matchedServants) {
      for (const [order, skillId] of (servant.SkillIDList ?? []).entries()) {
        const rows = servantSkillById.get(String(skillId)) ?? [];
        if (!isPlayerFacingSkillConfig(rows, `AvatarServantSkillConfig.${skillId}`)) continue;
        const category = classifyMemospriteSkill(rows[0] ?? {});
        if (!category) {
          missingText.record(
            'D',
            'unclassified-memosprite-skill',
            source('memosprite-skill', skillId, 'AttackType'),
            String(rows[0]?.AttackType ?? rows[0]?.SkillTriggerKey ?? '')
          );
          continue;
        }
        const progressionId = progressionBySkill.get(String(skillId));
        if (progressionId) servantPointIds.add(progressionId);
        skillVariants.push(
          normalizeSkillVariant(
            skillId,
            rows,
            servantOrder + order,
            'memosprite',
            progressionId,
            category
          )
        );
      }
      servantOrder += (servant.SkillIDList ?? []).length;
    }

    const traceRowsByPoint = grouped(traceRows, 'PointID');
    const rowsForSkill = (skillId: string): Raw[] =>
      avatarSkillById.get(skillId) ?? servantSkillById.get(skillId) ?? [];
    const categoryForSkill = (skillId: string) => {
      const rows = rowsForSkill(skillId);
      return avatarSkillById.has(skillId)
        ? classifyAvatarSkill(rows[0] ?? {})
        : classifyMemospriteSkill(rows[0] ?? {});
    };
    const configuredSkillIconPath = (skillId: string): string | undefined => {
      const paths = new Set(
        rowsForSkill(skillId)
          .map((row) => row.SkillIcon)
          .filter((value): value is string => typeof value === 'string' && !!value.trim())
      );
      if (paths.size > 1) throw new Error(`技能 ${skillId} 的 SkillIcon 在等级记录之间不一致`);
      return [...paths][0];
    };
    const canonicalSkillIconKey = (
      card: ReturnType<typeof buildSkillCards>[number]
    ): CharacterDetailIconKey | undefined => {
      const progressionId = card.progressions[0]?.id;
      if (progressionId) {
        const progressionRows = traceRowsByPoint.get(progressionId) ?? [];
        const representative = progressionRows[0];
        const progressionIcon = representative?.IconPath;
        const memberCategories = new Set(
          (representative?.LevelUpSkillID ?? [])
            .map(String)
            .filter((skillId: string) => {
              const rows = rowsForSkill(skillId);
              return rows.length && isPlayerFacingSkillConfig(rows, `SkillConfig.${skillId}`);
            })
            .map(categoryForSkill)
            .filter(defined)
        );
        const progressionMatchesVisibleVariant = card.variants.some(
          (variant) => configuredSkillIconPath(variant.id) === progressionIcon
        );
        if (
          progressionIcon &&
          ((memberCategories.size === 1 && memberCategories.has(card.category)) ||
            progressionMatchesVisibleVariant)
        )
          return configuredCharacterDetailIconKey(
            'skill-tree',
            progressionId,
            progressionIcon,
            `AvatarSkillTreeConfig.${progressionId}`
          );
      }
      const canonicalVariant = card.variants.find((variant) => configuredSkillIconPath(variant.id));
      return canonicalVariant
        ? configuredCharacterDetailIconKey(
            'skill',
            canonicalVariant.id,
            configuredSkillIconPath(canonicalVariant.id),
            `SkillConfig.${canonicalVariant.id}`
          )
        : undefined;
    };
    const skillCards = buildSkillCards(skillVariants).map((card) => {
      const iconKey = canonicalSkillIconKey(card);
      return iconKey ? { ...card, iconKey } : card;
    });
    const displayedSkillIds = new Set(skillVariants.map((variant) => variant.id));
    const consumedSkillPointIds = new Set(
      [...grouped(traceRows, 'PointID').entries()]
        .filter(([, rows]) =>
          (rows[0]?.LevelUpSkillID ?? []).some((skillId: number) =>
            displayedSkillIds.has(String(skillId))
          )
        )
        .filter(([, rows]) => Number(rows[0]?.PointType) === 4)
        .map(([pointId]) => pointId)
    );
    for (const pointId of servantPointIds) consumedSkillPointIds.add(pointId);
    const traces = [...traceRowsByPoint.entries()]
      .filter(([pointId]) => !consumedSkillPointIds.has(pointId))
      .filter(([, rows]) => rows.some((trace) => trace.PointName || trace.PointDesc))
      .filter(([, rows]) => [1, 3, 5].includes(Number(rows[0]?.PointType)))
      .map(([pointId, rows]): Trace => {
        const ordered = [...rows].sort((a, b) => Number(a.Level ?? 1) - Number(b.Level ?? 1));
        const representative =
          ordered.find((trace) => trace.PointName || trace.PointDesc) ?? ordered[0];
        if (ordered.length !== 1 || Number(representative.Level ?? 1) !== 1)
          throw new Error(`行迹 ${pointId} 不是预期的单级可展示节点`);
        const sourcePointType = Number(representative.PointType);
        const type = sourcePointType === 1 ? 'stat' : 'ability';
        const propertyTypes = unique<string>(
          (representative.StatusAddList ?? [])
            .map((status: Raw) => String(status.PropertyType ?? ''))
            .filter(Boolean)
        );
        if (type === 'stat' && propertyTypes.length !== 1)
          throw new Error(`属性行迹 ${pointId} 应唯一关联一个 PropertyType`);
        const propertyType = propertyTypes[0];
        const iconKey =
          type === 'stat'
            ? propertyIconKey(propertyType)
            : configuredCharacterDetailIconKey(
                'skill-tree',
                pointId,
                representative.IconPath,
                `AvatarSkillTreeConfig.${pointId}`
              );
        const anchorMatch = /^Point(\d+)$/.exec(String(representative.AnchorType ?? ''));
        if (!anchorMatch) throw new Error(`行迹 ${pointId} 缺少有效 AnchorType`);
        const params = values(representative.ParamList);
        const localizedDescription = formatGameMarkup(
          trSymbolic(representative.PointDesc, source('character-trace', pointId, 'PointDesc')),
          params
        );
        collectDescriptionDiagnostics(
          'character-trace',
          pointId,
          localizedDescription.diagnostics.map((diagnostic) => ({ level: 1, ...diagnostic }))
        );
        const extraEffects = resolveExtraEffects(
          extraEffectIdsOf(representative),
          'character-trace',
          pointId
        );
        return {
          id: pointId,
          name: trSymbolic(
            representative.PointName,
            source('character-trace', pointId, 'PointName'),
            `行迹 ${pointId}`
          ),
          description: localizedDescription.text || traceStatDescription(representative, pointId),
          type,
          ...(iconKey ? { iconKey } : {}),
          ...(propertyType ? { propertyType } : {}),
          sourcePointType,
          prerequisiteIds: (representative.PrePoint ?? []).map((id: number) => String(id)),
          ...(representative.AvatarPromotionLimit !== undefined
            ? { promotionLimit: Number(representative.AvatarPromotionLimit) }
            : {}),
          anchorOrder: Number(anchorMatch[1]),
          ...(extraEffects.length ? { extraEffects } : {})
        };
      });
    const eidolons = (config.RankIDList ?? [])
      .map((rankId: number) => avatarRanks.get(String(rankId)))
      .filter(Boolean)
      .map((rank: Raw) => {
        const id = String(rank.RankID);
        const iconKey = configuredCharacterDetailIconKey(
          'rank',
          id,
          rank.IconPath,
          `AvatarRankConfig.${id}`
        );
        const description = formatGameMarkup(
          trSymbolic(rank.Desc, source('character-eidolon', id, 'Desc')),
          values(rank.Param)
        );
        collectDescriptionDiagnostics(
          'character-eidolon',
          id,
          description.diagnostics.map((diagnostic) => ({ level: 1, ...diagnostic }))
        );
        const extraEffects = resolveExtraEffects(extraEffectIdsOf(rank), 'character-eidolon', id);
        return {
          id,
          rank: Number(rank.Rank),
          name: trSymbolic(rank.Name, source('character-eidolon', id, 'Name'), `星魂 ${rank.Rank}`),
          description: description.text,
          ...(iconKey ? { iconKey } : {}),
          ...(extraEffects.length ? { extraEffects } : {})
        };
      });

    annotateSpecialEffectCards(skillCards, avatarId, specialEffects);
    return {
      energy: energyFor(config),
      skillCards,
      specialEffects,
      traces,
      eidolons
    };
  };

  */
  const allTables = tables as Record<string, Raw[]>;
  const tableSubset = (names: readonly string[]): Record<string, Raw[]> =>
    Object.fromEntries(names.map((name) => [name, allTables[name] ?? []]));
  const lightConeDomains = buildLightConeDomain({
    tables: tableSubset([
      'EquipmentConfig',
      'EquipmentSkillConfig',
      'EquipmentPromotionConfig',
      'ItemConfigEquipment',
      'AvatarBaseType',
      'AvatarPropertyConfig'
    ])
  });
  const lightCones = lightConeDomains.map((domain) =>
    projectLightCone(domain, { locale: locale.locale, resolver: text })
  );
  const lightConeCatalog: CatalogEntry[] = lightCones.map(
    ({ kind: _kind, story: _story, passive: _passive, baseStats: _baseStats, ...catalog }) =>
      catalog
  );
  const relicDomains = buildRelicDomain({
    tables: tableSubset([
      'RelicSetConfig',
      'RelicSetSkillConfig',
      'RelicDataInfo',
      'RelicBaseType',
      'RelicMainAffixConfig',
      'RelicSubAffixConfig',
      'ItemComefrom'
    ])
  });
  const relics = relicDomains.map((domain) =>
    projectRelic(domain, {
      locale: locale.locale,
      resolver: text,
      categoryLabels: {
        cavern: siteMessages.relic_category_cavern,
        planar: siteMessages.relic_category_planar
      },
      formatEffectSummary: (required, description) =>
        siteMessages.relic_effect_summary
          .replace('{required}', String(required))
          .replace('{description}', description)
    })
  );
  const relicCatalog: RelicCatalogEntry[] = relics.map(
    ({ kind: _kind, effects: _effects, pieces: _pieces, sources: _sources, ...catalog }) => catalog
  );

  const characterDomainSource = tableSubset([
    'AvatarConfig',
    'AvatarConfigEnhanced',
    'AvatarConfigLD',
    'AvatarEnhancedSkill',
    'AvatarEnhancedSkillTree',
    'AvatarEnhancedRank',
    'AvatarUltraSkillConfig',
    'GridFightFrontSpecialSP',
    'MultiplePathAvatarConfig',
    'FateRinOwner',
    'ItemConfigAvatar',
    'AvatarBaseType',
    'DamageType',
    'AvatarSkillConfig',
    'AvatarSkillLink',
    'AvatarSpecialSkillTree',
    'AvatarSkillTreeConfig',
    'AvatarRankConfig',
    'AvatarPromotionConfig',
    'AvatarPropertyConfig',
    'AvatarServantConfig',
    'AvatarServantSkillConfig',
    'AvatarServantSkillLink',
    'AvatarGlobalBuffConfig',
    'AvatarEquipRecommend',
    'AvatarRelicRecommend',
    'EquipmentConfig',
    'RelicSetConfig',
    'RelicDataInfo',
    'ExtraEffectConfig'
  ]);
  const characterDomains = buildCharacterDomain({ tables: characterDomainSource });
  const projectedCharacters = characterDomains.map((domain) =>
    projectCharacter(domain, { locale: 'zh-CN', resolver: text })
  );
  characters.splice(0, characters.length, ...projectedCharacters);
  characterCatalog.splice(
    0,
    characterCatalog.length,
    ...projectedCharacters.map(
      ({ id, name, baseName, description, rarity, path, pathName, element, elementName }) => ({
        id,
        name,
        baseName,
        description,
        rarity,
        path,
        pathName,
        element,
        elementName
      })
    )
  );

  const enemyCatalog: import('../../src/lib/domain/types.js').EnemyCatalogEntry[] = [];
  const enemies: Enemy[] = [];
  const enemyAudit = {
    canonicalJoin: { resolved: 0, missing: [] as string[] },
    unknownSkillKinds: [] as Array<{ enemyId: string; skillId: string; value: string }>,
    unknownSkillTags: [] as Array<{ enemyId: string; skillId: string; value: string }>,
    unknownElements: [] as Array<{ enemyId: string; field: string; value: string }>,
    weaknessResistanceConflicts: [] as Array<{ enemyId: string; element: string; value: number }>,
    unknownDebuffResist: [] as Array<{ enemyId: string; key: string }>,
    unresolvedSummons: [] as Array<{ enemyId: string; monsterId: string }>,
    unresolvedSkills: [] as Array<{ enemyId: string; skillId: string }>,
    unresolvedExtraEffects: [] as Array<{
      enemyId: string;
      skillId: string;
      extraEffectId: string;
    }>,
    missingAttributes: {
      speedBase: [] as string[],
      stanceBase: [] as string[],
      statusResistanceBase: [] as string[]
    }
  };

  const inclusionPolicy = await loadEnemySkillInclusionPolicy();
  const enemyText = {
    ...text,
    resolveRef: (ref: unknown, textSource: TextSource, disposition?: TextDiagnosticDisposition) =>
      tr(ref, textSource, '', disposition)
  };
  // Classification and inclusion are identical for canonical and concrete variants.
  const resolveEnemySkill = (skill: Raw, enemyId: string) =>
    resolveEnemySkillSource(
      skill,
      { enemyId, skillId: String(skill.SkillID) },
      enemyText,
      inclusionPolicy
    );

  const canonicalEnemyName = (templateId: string): string => {
    const targetTemplate = monsterTemplates.get(templateId);
    const targetConfig = monsterRows.get(templateId);
    return tr(
      targetTemplate?.MonsterName,
      source('enemy', templateId, 'MonsterTemplateConfig.MonsterName'),
      tr(
        targetConfig?.MonsterName,
        source('enemy', templateId, 'MonsterConfig.MonsterName'),
        `敌人 ${templateId}`
      )
    );
  };

  for (const template of tables.MonsterTemplateConfig) {
    const id = String(template.MonsterTemplateID);
    const config = monsterRows.get(id);
    if (!config || String(config.MonsterTemplateID) !== id) {
      enemyAudit.canonicalJoin.missing.push(id);
      throw new Error(`敌人 ${id} 缺少 MonsterID == MonsterTemplateID 的 canonical MonsterConfig`);
    }
    enemyAudit.canonicalJoin.resolved += 1;
    const configName = tr(
      config.MonsterName,
      source('enemy', id, 'MonsterConfig.MonsterName'),
      `敌人 ${id}`
    );
    const name = tr(
      template.MonsterName,
      source('enemy', id, 'MonsterTemplateConfig.MonsterName'),
      configName
    );
    const skills: EnemySkill[] = [];
    const phaseInputs: Array<{ id: string; phases: number[]; visible: boolean }> = [];
    const seenSkillIds = new Set<string>();
    for (const rawSkillId of config.SkillList ?? []) {
      const skillId = String(rawSkillId);
      const skill = monsterSkillRows.get(skillId);
      if (!skill) {
        enemyAudit.unresolvedSkills.push({ enemyId: id, skillId });
        continue;
      }
      if (seenSkillIds.has(skillId)) continue;
      seenSkillIds.add(skillId);
      const phases = normalizeEnemyPhases(skill.PhaseList);
      const { kindLabel, kind, tag, visible, formattedDescription, localizedTextStatus } =
        resolveEnemySkill(skill, id);
      collectDescriptionDiagnostics(
        'enemy-skill',
        skillId,
        formattedDescription.diagnostics.map((diagnostic) => ({ level: 1, ...diagnostic }))
      );
      phaseInputs.push({ id: skillId, phases, visible });
      if (!visible) continue;
      let damageType;
      if (skill.DamageType !== undefined) {
        const rawElement = String(skill.DamageType);
        const element = normalizeElementType(rawElement);
        if (!isElementType(element))
          enemyAudit.unknownElements.push({
            enemyId: id,
            field: `skill:${skillId}`,
            value: rawElement
          });
        else damageType = { element, name: elementName(rawElement) };
      }

      const extraEffects = resolveExtraEffects(
        extraEffectIdsOf(skill),
        'enemy-skill',
        skillId,
        (extraEffectId) =>
          enemyAudit.unresolvedExtraEffects.push({ enemyId: id, skillId, extraEffectId })
      );
      skills.push({
        id: skillId,
        name: tr(skill.SkillName, source('enemy-skill', skillId, 'SkillName'), `技能 ${skillId}`),
        description: formattedDescription.text,
        kind,
        kindLabel,
        localizedTextStatus,
        tag,
        ...(damageType ? { damageType } : {}),
        phases,
        extraEffects
      });
    }
    const skillPhases = buildEnemySkillPhases(phaseInputs);

    const weaknesses = (config.StanceWeakList ?? []).flatMap((rawElement: unknown) => {
      const sourceElement = String(rawElement);
      const element = normalizeElementType(sourceElement);
      if (!isElementType(element)) {
        enemyAudit.unknownElements.push({
          enemyId: id,
          field: 'StanceWeakList',
          value: sourceElement
        });
        return [];
      }
      return [{ element, name: elementName(sourceElement) }];
    });
    const resistances = (config.DamageTypeResistance ?? []).flatMap((resistance: Raw) => {
      const sourceElement = String(resistance.DamageType);
      const element = normalizeElementType(sourceElement);
      const value = numberOf(resistance.Value);
      if (!isElementType(element)) {
        enemyAudit.unknownElements.push({
          enemyId: id,
          field: 'DamageTypeResistance',
          value: sourceElement
        });
        return [];
      }
      if (value === 0) return [];
      if (weaknesses.some((weakness: { element: string }) => weakness.element === element))
        enemyAudit.weaknessResistanceConflicts.push({ enemyId: id, element, value });
      return [{ element, name: elementName(sourceElement), value }];
    });
    const special = normalizeSpecialResistances(config.DebuffResist);
    for (const key of special.unknownKeys)
      enemyAudit.unknownDebuffResist.push({ enemyId: id, key });

    const summons = [];
    const seenSummonTemplates = new Set<string>();
    for (const rawSummonId of config.SummonIDList ?? []) {
      const monsterId = String(rawSummonId);
      const summonConfig = monsterRows.get(monsterId);
      const monsterTemplateId = String(summonConfig?.MonsterTemplateID ?? '');
      const summonTemplate = monsterTemplates.get(monsterTemplateId);
      if (!summonConfig || !summonTemplate) {
        enemyAudit.unresolvedSummons.push({ enemyId: id, monsterId });
        continue;
      }
      if (seenSummonTemplates.has(monsterTemplateId)) continue;
      seenSummonTemplates.add(monsterTemplateId);
      summons.push({
        monsterId,
        monsterTemplateId,
        name: canonicalEnemyName(monsterTemplateId),
        rank: String(summonTemplate.Rank ?? ''),
        weaknesses: (summonConfig.StanceWeakList ?? []).flatMap((rawElement: unknown) => {
          const sourceElement = String(rawElement);
          const element = normalizeElementType(sourceElement);
          return isElementType(element) ? [{ element, name: elementName(sourceElement) }] : [];
        }),
        href: `/enemies/${monsterTemplateId}`
      });
    }

    const hardLevels = hardLevelRows.get(String(config.HardLevelGroup)) ?? [];
    const elite = eliteRows.get(String(config.EliteGroup));
    if (!hardLevels.length || !elite)
      throw new Error(
        `敌人 ${id} 缺少等级属性配置：HardLevelGroup=${config.HardLevelGroup}, EliteGroup=${config.EliteGroup}`
      );
    if (template.SpeedBase === undefined) enemyAudit.missingAttributes.speedBase.push(id);
    if (template.StanceBase === undefined) enemyAudit.missingAttributes.stanceBase.push(id);
    if (template.StatusResistanceBase === undefined)
      enemyAudit.missingAttributes.statusResistanceBase.push(id);
    const catalog: import('../../src/lib/domain/types.js').EnemyCatalogEntry = {
      id,
      name,
      description: tr(config.MonsterIntroduction, source('enemy', id, 'MonsterIntroduction'), '', {
        requirement: 'optional',
        visibility: 'emitted',
        fallbackUsed: true,
        productRouteReachability: 'reachable'
      }),
      type: template.Rank,
      typeName: template.Rank,
      weaknesses
    };
    const canonicalMonster = {
      monsterId: id,
      monsterTemplateId: id,
      hardLevelGroup: String(config.HardLevelGroup),
      eliteGroup: String(config.EliteGroup),
      modifiers: {
        hp: modifierOf(config, 'HP'),
        attack: modifierOf(config, 'Attack'),
        defence: modifierOf(config, 'Defence'),
        speed: modifierOf(config, 'Speed'),
        stance: modifierOf(config, 'Stance')
      },
      stats: resolveCanonicalEnemyStats(template, config, hardLevels, elite),
      weaknesses,
      resistances,
      specialResistances: special.values,
      summons,
      skills,
      skillPhases
    };
    enemyCatalog.push(catalog);
    enemies.push({
      ...catalog,
      kind: 'enemy',
      rank: template.Rank,
      template: {
        monsterTemplateId: id,
        name,
        rank: template.Rank,
        baseStats: {
          hp: decimalOf(template.HPBase, `MonsterTemplate.${id}.HPBase`),
          attack: decimalOf(template.AttackBase, `MonsterTemplate.${id}.AttackBase`),
          defence: decimalOf(template.DefenceBase, `MonsterTemplate.${id}.DefenceBase`),
          criticalDamage: decimalOf(
            template.CriticalDamageBase,
            `MonsterTemplate.${id}.CriticalDamageBase`
          ),
          ...(template.SpeedBase !== undefined
            ? { speed: decimalOf(template.SpeedBase, `MonsterTemplate.${id}.SpeedBase`) }
            : {}),
          ...(template.StanceBase !== undefined
            ? { stance: decimalOf(template.StanceBase, `MonsterTemplate.${id}.StanceBase`) }
            : {}),
          ...(template.StatusResistanceBase !== undefined
            ? {
                effectResistance: decimalOf(
                  template.StatusResistanceBase,
                  `MonsterTemplate.${id}.StatusResistanceBase`
                )
              }
            : {})
        }
      },
      monsters: [canonicalMonster],
      defaultMonsterId: id,
      defaultMonster: canonicalMonster,
      // Kept only for the Endgame reference view until that consumer is migrated.
      weaknesses: canonicalMonster.weaknesses
    });
  }

  // Build the explicit Template -> Monster relation.
  for (const enemy of enemies) {
    const templateId = enemy.id;
    const template = monsterTemplates.get(templateId);
    if (!template) continue;
    const configs = tables.MonsterConfig.filter(
      (row) => String(row.MonsterTemplateID) === templateId
    );
    enemy.monsters = configs.map((config) => {
      if (String(config.MonsterID) === templateId) return enemy.defaultMonster;
      const levels = hardLevelRows.get(String(config.HardLevelGroup)) ?? [];
      const elite = eliteRows.get(String(config.EliteGroup));
      const stats = elite
        ? resolveCanonicalEnemyStats(template, config, levels, elite)
        : { ...enemy.defaultMonster.stats };
      const weaknesses = (config.StanceWeakList ?? []).flatMap((rawElement: unknown) => {
        const sourceElement = String(rawElement);
        const element = normalizeElementType(sourceElement);
        return isElementType(element) ? [{ element, name: elementName(sourceElement) }] : [];
      });
      const resistances = (config.DamageTypeResistance ?? []).flatMap((resistance: Raw) => {
        const sourceElement = String(resistance.DamageType);
        const element = normalizeElementType(sourceElement);
        const value = numberOf(resistance.Value);
        return isElementType(element) && value !== 0
          ? [{ element, name: elementName(sourceElement), value }]
          : [];
      });
      const specialResistances = normalizeSpecialResistances(config.DebuffResist).values;
      const variantSkills: EnemySkill[] = [];
      const variantPhaseInputs: Array<{ id: string; phases: number[]; visible: boolean }> = [];
      for (const rawSkillId of config.SkillList ?? []) {
        const skillId = String(rawSkillId);
        const skill = monsterSkillRows.get(skillId);
        if (!skill) continue;
        const phases = normalizeEnemyPhases(skill.PhaseList);
        const { kindLabel, kind, tag, visible, formattedDescription, localizedTextStatus } =
          resolveEnemySkill(skill, String(config.MonsterID));
        variantPhaseInputs.push({ id: skillId, phases, visible });
        if (!visible) continue;
        const damageType =
          skill.DamageType === undefined
            ? undefined
            : normalizedElementLabel(skill.DamageType, normalizeElementType, elementName);
        variantSkills.push({
          id: skillId,
          name: tr(skill.SkillName, source('enemy-skill', skillId, 'SkillName'), `技能 ${skillId}`),
          description: formattedDescription.text,
          kind,
          kindLabel,
          localizedTextStatus,
          tag,
          ...(damageType ? { damageType } : {}),
          phases,
          extraEffects: resolveExtraEffects(extraEffectIdsOf(skill), 'enemy-skill', skillId)
        });
      }
      const variantSummons = (config.SummonIDList ?? []).flatMap((rawSummonId: unknown) => {
        const monsterId = String(rawSummonId);
        const summonConfig = monsterRows.get(monsterId);
        const summonTemplateId = String(summonConfig?.MonsterTemplateID ?? '');
        const summonTemplate = monsterTemplates.get(summonTemplateId);
        return summonConfig && summonTemplate
          ? [
              {
                monsterId,
                monsterTemplateId: summonTemplateId,
                name: canonicalEnemyName(summonTemplateId),
                rank: String(summonTemplate.Rank ?? ''),
                weaknesses: (summonConfig.StanceWeakList ?? []).flatMap((rawElement: unknown) => {
                  const sourceElement = String(rawElement);
                  const element = normalizeElementType(sourceElement);
                  return isElementType(element)
                    ? [{ element, name: elementName(sourceElement) }]
                    : [];
                }),
                href: `/enemies/${summonTemplateId}`
              }
            ]
          : [];
      });
      return {
        monsterId: String(config.MonsterID),
        monsterTemplateId: templateId,
        hardLevelGroup: String(config.HardLevelGroup ?? ''),
        ...(config.EliteGroup !== undefined ? { eliteGroup: String(config.EliteGroup) } : {}),
        modifiers: {
          hp: modifierOf(config, 'HP'),
          attack: modifierOf(config, 'Attack'),
          defence: modifierOf(config, 'Defence'),
          speed: modifierOf(config, 'Speed'),
          stance: modifierOf(config, 'Stance')
        },
        stats,
        weaknesses,
        resistances,
        specialResistances,
        summons: variantSummons,
        skills: variantSkills,
        skillPhases: buildEnemySkillPhases(variantPhaseInputs)
      };
    });
  }

  console.log('构建 Endgame 敌方实例与精确 HP…');
  // Normalize and validate every required relation before replacing the last known-good output.
  const endgame = await buildEndgameData(root, text);
  const searchInputs: SearchBuildInputs = {
    official: characterNames.snapshot,
    catalogs: {
      character: characterCatalog.map(({ id, name }) => ({ id, name })),
      'light-cone': lightConeCatalog.map(({ id, name }) => ({ id, name })),
      relic: relicCatalog.map(({ id, name }) => ({ id, name })),
      enemy: enemyCatalog.map(({ id, name }) => ({ id, name }))
    },
    endgameEnemies: collectEndgameSearchNames(endgame.datasets, (name) =>
      createHash('sha256').update(name).digest('hex').slice(0, 16)
    )
  };
  const globalSearchIndex = buildSearchDocuments(searchInputs, await loadPlayerAliases());
  const homepage = buildHomepageRecentWarpData(
    tables.GachaBasicInfo,
    characterCatalog,
    lightConeCatalog
  );

  await resetDirectory(generatedRoot);
  await resetDirectory(staticGeneratedRoot);
  await mkdir(auditRoot, { recursive: true });

  const catalogs = {
    characters: characterCatalog,
    'light-cones': lightConeCatalog,
    relics: relicCatalog,
    enemies: enemyCatalog
  };
  const details = { characters, 'light-cones': lightCones, relics, enemies };
  const viewPayload = { catalogs, details, relicProperties, endgame: endgame.datasets, homepage };
  const viewSerialized = JSON.stringify(viewPayload);
  const viewDigest = createHash('sha256').update(viewSerialized).digest('hex');
  const neutralPayload = {
    schemaVersion: 1,
    parserVersion: 'neutral-domain-1',
    sourceCommit: commit,
    domains: {
      characters: characterDomainSource,
      'light-cones': tableSubset([
        'EquipmentConfig',
        'EquipmentSkillConfig',
        'EquipmentPromotionConfig',
        'ItemConfigEquipment',
        'AvatarBaseType',
        'AvatarPropertyConfig'
      ]),
      relics: tableSubset([
        'RelicSetConfig',
        'RelicSetSkillConfig',
        'RelicDataInfo',
        'RelicBaseType',
        'RelicMainAffixConfig',
        'RelicSubAffixConfig',
        'ItemComefrom'
      ]),
      enemies: tableSubset([
        'MonsterTemplateConfig',
        'MonsterConfig',
        'MonsterSkillConfig',
        'MonsterGuideConfig',
        'MonsterGuideTag',
        'HardLevelGroup',
        'EliteGroup',
        'ExtraEffectConfig'
      ]),
      endgame: tableSubset([
        'ChallengeGroupConfig',
        'ChallengeMazeConfig',
        'ChallengeStoryGroupConfig',
        'ChallengeStoryMazeConfig',
        'ChallengeStoryGroupExtra',
        'ChallengeBossGroupConfig',
        'ChallengeBossMazeConfig',
        'ChallengeBossGroupExtra',
        'ChallengeBossMazeExtra',
        'ChallengePeakConfig',
        'ChallengePeakBossConfig',
        'MazeBuff',
        'MonsterGuideConfig',
        'MonsterGuideTag'
      ])
    }
  };
  const sourceShards = {
    characters: neutralPayload.domains.characters,
    'light-cones': neutralPayload.domains['light-cones'],
    relics: neutralPayload.domains.relics,
    enemies: neutralPayload.domains.enemies,
    endgame: neutralPayload.domains.endgame
  };
  const domainArtifacts = { characters: characterDomains };
  const domainMeta = Object.fromEntries(
    Object.entries(domainArtifacts).map(([name, value]) => {
      const serialized = JSON.stringify(value);
      const sourceSerialized = JSON.stringify(sourceShards[name as keyof typeof sourceShards]);
      return [
        name,
        {
          schemaVersion: value[0]?.schemaVersion ?? 4,
          builderVersion: `domain-builder-${value[0]?.schemaVersion ?? 3}`,
          sourceDigest: createHash('sha256').update(sourceSerialized).digest('hex'),
          contentDigest: createHash('sha256').update(serialized).digest('hex'),
          bytes: Buffer.byteLength(`${serialized}\n`),
          sha256: createHash('sha256').update(`${serialized}\n`).digest('hex'),
          recordCount: value.length
        }
      ];
    })
  );
  const sourceShardMeta = Object.fromEntries(
    Object.entries(sourceShards).map(([name, shard]) => {
      const serialized = `${JSON.stringify(shard)}\n`;
      return [
        name,
        {
          bytes: Buffer.byteLength(serialized),
          sha256: createHash('sha256').update(serialized).digest('hex'),
          contentDigest: createHash('sha256').update(JSON.stringify(shard)).digest('hex'),
          sourceCommit: commit
        }
      ];
    })
  );
  const neutralSerialized = JSON.stringify(neutralPayload);
  const neutralDigest = createHash('sha256').update(neutralSerialized).digest('hex');
  const artifactMeta = (relative: string, serialized: string) => ({
    [relative]: {
      bytes: Buffer.byteLength(serialized),
      sha256: createHash('sha256').update(serialized).digest('hex')
    }
  });
  const neutralArtifactManifest = {
    schemaVersion: 1 as const,
    parserVersion: 'neutral-domain-1',
    sourceCommit: commit,
    contentDigest: neutralDigest,
    artifacts: {
      ...artifactMeta('neutral/source.json', `${neutralSerialized}\n`),
      ...Object.fromEntries(
        Object.entries(domainArtifacts)
          .map(([name, value]) =>
            Object.entries(
              artifactMeta(`neutral/domains/${name}.json`, `${JSON.stringify(value)}\n`)
            ).map(([key, meta]) => [key, meta])
          )
          .flat()
      )
    },
    sourceShards: sourceShardMeta,
    domains: domainMeta
  };
  const viewManifest = {
    schemaVersion: 2 as const,
    locale: locale.locale,
    textMapCode: locale.textMapCode,
    projectionVersion: 'chs-view-4',
    neutralDigest,
    contentDigest: viewDigest,
    textMapDigest,
    domainDigests: { characters: domainMeta.characters.contentDigest },
    neutralSourceDigests: {
      characters: domainMeta.characters.sourceDigest,
      lightCones: createHash('sha256')
        .update(JSON.stringify(sourceShards['light-cones']))
        .digest('hex'),
      relics: createHash('sha256').update(JSON.stringify(sourceShards.relics)).digest('hex')
    }
  };
  const writeViewArtifacts = async (base: string, compatibility = false): Promise<void> => {
    const categories = compatibility ? ['characters', 'enemies'] : Object.keys(catalogs);
    for (const category of categories) {
      const catalog = catalogs[category as keyof typeof catalogs];
      await writeJson(path.join(base, 'catalogs', `${category}.json`), catalog);
      for (const detail of details[category as keyof typeof details])
        await writeJson(path.join(base, 'details', category, `${detail.id}.json`), detail);
    }
    if (!compatibility)
      await writeJson(path.join(base, 'catalogs', 'relic-properties.json'), relicProperties);
    for (const [mode, dataset] of Object.entries(endgame.datasets))
      await writeJson(path.join(base, 'endgame', `${mode}.json`), dataset);
    await writeJson(path.join(base, 'homepage.json'), homepage);
  };
  await writeJson(path.join(generatedRoot, 'neutral', 'source.json'), neutralPayload);
  for (const [name, shard] of Object.entries(sourceShards))
    await writeJson(path.join(generatedRoot, 'neutral', 'source', `${name}.json`), shard);
  for (const [name, domain] of Object.entries(domainArtifacts))
    await writeJson(path.join(generatedRoot, 'neutral', 'domains', `${name}.json`), domain);
  // Keep the old paths as a short-lived CHS compatibility projection while loaders migrate.
  await writeViewArtifacts(generatedRoot, true);
  await writeViewArtifacts(path.join(generatedRoot, 'views', 'zh-CN'));

  const manifest: DataManifest = {
    schemaVersion: 40,
    sourceCommit: commit,
    sourceVersion,
    ...gameVersion,
    generatedAt: new Date().toISOString(),
    language: 'CHS',
    neutral: neutralArtifactManifest,
    view: viewManifest,
    migration: {
      characters: { domain: 'neutral-domain-4', productionView: 'neutral-projector-4' },
      lightCones: { domain: 'neutral-domain-3', productionView: 'neutral-projector-3' },
      relics: { domain: 'neutral-domain-3', productionView: 'neutral-projector-3' },
      enemies: { productionView: 'compatibility-projector' },
      endgame: { productionView: 'compatibility-projector' }
    },
    counts: {
      characters: characters.length,
      lightCones: lightCones.length,
      relics: relics.length,
      relicProperties: relicProperties.length,
      enemies: enemies.length
    },
    routes: {
      characters: characters.map((item) => item.id),
      'light-cones': lightCones.map((item) => item.id),
      relics: relics.map((item) => item.id),
      enemies: enemies.map((item) => item.id)
    },
    endgame: endgame.audit.summary
  };
  await writeJson(path.join(generatedRoot, 'manifest.json'), manifest);
  await writeJson(path.join(generatedRoot, 'neutral', 'manifest.json'), neutralArtifactManifest);
  await writeJson(path.join(generatedRoot, 'views', 'zh-CN', 'manifest.json'), viewManifest);
  await writeJson(path.join(generatedRoot, 'search-inputs.json'), searchInputs);
  await writeJson(path.join(staticGeneratedRoot, 'search.json'), globalSearchIndex);
  await writeJson(path.join(staticGeneratedRoot, 'meta.json'), manifest);
  await writeJson(path.join(auditRoot, 'latest.json'), {
    ...manifest,
    upstreamTables: Object.fromEntries([
      ...tableNames.map((name) => [name, regularTables[name].length] as const),
      ...ldTableNames.map((name) => [name, ldTables[name].length] as const)
    ]),
    textDiagnostics: text.getDiagnostics(),
    descriptionDiagnostics,
    skillCombatAudit: {
      unknownEffects: [...unknownSkillEffects].sort()
    },
    avatarSpecialSkillTreeAudit,
    specialEffectAudit: specialEffectLinks.audit,
    enemyAudit,
    endgameAudit: endgame.audit,
    missingTextAudit: missingText.getSummary(),
    notes: {
      images: '上游仅包含 SpriteOutput 路径，不包含图片二进制文件。',
      license: '上游仓库未检测到 LICENSE 或 NOTICE，生成数据不提交。'
    }
  });
  if (unknownSkillEffects.size)
    console.warn(`数据警告：未知 SkillEffect：${[...unknownSkillEffects].sort().join(', ')}`);
  if (specialEffectLinks.audit.diagnostics.length)
    console.warn(
      `数据警告：Character Special Effect relation 存在 ${specialEffectLinks.audit.diagnostics.length} 条诊断，详见 data/audit/latest.json。`
    );
  if (avatarSpecialSkillTreeAudit.diagnostics.length)
    console.warn(
      `数据警告：AvatarSpecialSkillTree relation 存在 ${avatarSpecialSkillTreeAudit.diagnostics.length} 条诊断，详见 data/audit/latest.json。`
    );
  console.log(`同步完成：${JSON.stringify(manifest.counts)}`);
  return manifest;
}

if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  await syncData();
}
