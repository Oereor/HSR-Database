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
  SearchEntry,
  SkillExtraEffect,
  SkillVariant,
  TextHash
} from '../../src/lib/domain/types.js';
import { parseTextHash } from '../../src/lib/domain/types.js';
import { rarityFromCode, relicTypeNames } from '../../src/lib/domain/constants.js';
import { isElementType, normalizeElementType } from '../../src/lib/domain/elements.js';
import { createTextResolver, loadTextMap, type TextSource } from './localization.js';
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
import { hashOf, mergeConfigSources, numberOf, readTable } from './raw.js';
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
import { gameTextToPlain, normalizeGameText } from '../../src/lib/domain/game-text.js';
import {
  buildSearchEntityEntries,
  collectEndgameSearchNames,
  GLOBAL_SEARCH_SCHEMA_VERSION,
  type GlobalSearchIndex
} from '../../src/lib/domain/search-index.js';
import { buildEndgameData } from './endgame.js';
import { createExtraEffectResolver } from './extra-effects.js';
import { buildHomepageRecentWarpData } from './homepage.js';
import { parseGameVersion } from './source-metadata.js';
import {
  buildEnemySkillPhases,
  normalizeEnemyPhases,
  normalizeEnemySkillKind,
  normalizeEnemySkillTag,
  normalizeSpecialResistances,
  normalizedElementLabel,
  resolveCanonicalEnemyStats
} from './enemy-detail.js';

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
  const commit = sourceCommit(root);
  const sourceVersion = execFileSync(
    'git',
    ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, 'log', '-1', '--pretty=%s'],
    { encoding: 'utf8', windowsHide: true }
  ).trim();
  const gameVersion = parseGameVersion(sourceVersion);

  console.log(`读取上游数据：${root}`);
  console.log(`上游版本：${commit.slice(0, 12)} · ${sourceVersion}`);
  if (!gameVersion.gameVersionFull)
    console.warn('数据版本解析失败：TurnBasedGameData HEAD subject 不符合 OSPRODWin 版本格式。');

  const missingText = createMissingTextAuditCollector();
  const text = await createTextResolver(await loadTextMap(root), (kind, identifier, textSource) => {
    missingText.record(
      kind === 'invalid-reference' ? 'D' : 'A',
      kind === 'invalid-reference' ? 'invalid-reference' : 'missing-chs-text',
      textSource,
      identifier
    );
  });
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
      return { kind: 'special', max: 0 };
    }
    const maximum = numberOf(avatar.SPNeed);
    if (!Number.isFinite(maximum) || maximum <= 0)
      throw new Error(`角色 ${avatarId} 的普通能量上限配置无效`);
    return { kind: 'standard', max: maximum };
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
  const tr = (value: unknown, textSource: TextSource, fallback = ''): string => {
    if (isEmptyTextSource(value)) missingText.record('A', 'missing-source-field', textSource);
    const resolved = text.resolveRef(value, textSource);
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
    const resolved = text.resolveSymbolic(value, textSource);
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
  const avatarProperties = by(tables.AvatarPropertyConfig, 'PropertyType');
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
  const searchSeeds: Array<{ entry: SearchEntry; hashes: TextHash[] }> = [];
  const multiplePaths = by(tables.MultiplePathAvatarConfig, 'AvatarID');

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

  const buildCharacterProfile = (
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

    const skillCards = buildSkillCards(skillVariants);
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
    const traces = [...grouped(traceRows, 'PointID').entries()]
      .filter(([pointId]) => !consumedSkillPointIds.has(pointId))
      .filter(([, rows]) => rows.some((trace) => trace.PointName || trace.PointDesc))
      .filter(([, rows]) => [1, 3, 5].includes(Number(rows[0]?.PointType)))
      .map(([pointId, rows]) => {
        const ordered = [...rows].sort((a, b) => Number(a.Level ?? 1) - Number(b.Level ?? 1));
        const representative =
          ordered.find((trace) => trace.PointName || trace.PointDesc) ?? ordered[0];
        if (ordered.length !== 1 || Number(representative.Level ?? 1) !== 1)
          throw new Error(`行迹 ${pointId} 不是预期的单级可展示节点`);
        const sourcePointType = Number(representative.PointType);
        const type = sourcePointType === 1 ? 'stat' : 'ability';
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
      .map((rank) => {
        const id = String(rank.RankID);
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
          ...(extraEffects.length ? { extraEffects } : {})
        };
      });

    return {
      energy: energyFor(config),
      skillCards,
      specialEffects,
      traces,
      eidolons
    };
  };

  for (const avatar of tables.AvatarConfig) {
    const id = String(avatar.AvatarID);
    const item = avatarItems.get(id);
    const rawName = tr(avatar.AvatarName, source('character', id, 'AvatarName'), `角色 ${id}`);
    const resolvedPathName = pathName(avatar.AvatarBaseType);
    const multiplePath = multiplePaths.get(id);
    const baseAvatarId = String(multiplePath?.BaseAvatarID ?? '');
    const name =
      baseAvatarId === '8001'
        ? `开拓者·${resolvedPathName}`
        : baseAvatarId === '1001'
          ? `三月七·${resolvedPathName}`
          : rawName;
    const resolvedFullName = tr(avatar.AvatarFullName, source('character', id, 'AvatarFullName'));
    const fullName = resolvedFullName.includes('{NICKNAME}') ? name : resolvedFullName;
    const description = tr(item?.ItemBGDesc, source('character', id, 'ItemBGDesc'));
    const promotionRows = avatarPromotions.get(id) ?? [];
    const traceRows = avatarTraces.get(id) ?? [];
    const profiles: Character['profiles'] = {
      base: buildCharacterProfile(
        avatar,
        traceRows.filter((row) => Number(row.EnhancedID ?? 0) === 0),
        avatar.AvatarBaseType,
        globalBuffRowsByProfile.get(globalBuffProfileKey(id, 'base')) ?? []
      )
    };
    const enhancedConfig = enhancedAvatars.get(id);
    if (enhancedConfig)
      profiles.enhanced = buildCharacterProfile(
        enhancedConfig,
        traceRows.filter(
          (row) => Number(row.EnhancedID ?? 0) === Number(enhancedConfig.EnhancedID)
        ),
        avatar.AvatarBaseType,
        globalBuffRowsByProfile.get(globalBuffProfileKey(id, 'enhanced')) ?? []
      );
    const catalog: CatalogEntry = {
      id,
      name,
      description,
      rarity: rarityFromCode(avatar.Rarity),
      path: avatar.AvatarBaseType,
      pathName: resolvedPathName,
      element: normalizeElementType(avatar.DamageType),
      elementName: elementName(avatar.DamageType)
    };
    characterCatalog.push(catalog);
    characters.push({
      ...catalog,
      kind: 'character',
      fullName,
      profiles,
      equipmentRecommendation: recommendationFor(id),
      baseStats: normalizeStatProgression(promotionRows, characterStatFields, {
        speed: numberOf(promotionRows[0]?.SpeedBase),
        criticalChance: numberOf(promotionRows[0]?.CriticalChance),
        criticalDamage: numberOf(promotionRows[0]?.CriticalDamage),
        aggro: numberOf(promotionRows[0]?.BaseAggro)
      })
    });
    searchSeeds.push({
      entry: {
        id,
        kind: 'character',
        name,
        href: `/characters/${id}`,
        aliases: [],
        meta: catalog.pathName
      },
      hashes: unique([hashOf(avatar.AvatarName), hashOf(avatar.AvatarFullName)].filter(defined))
    });
  }

  for (const link of resolvedAvatarSpecialEffectLinks)
    if (!ownedAvatarSpecialEffectLinks.has(link.skillId))
      recordSpecialEffectDiagnostic(specialEffectLinks.audit, {
        code: 'unowned-relation',
        source: 'AvatarSkillLink',
        identity: link.skillId,
        detail: '没有 Character profile 的 SkillList 引用该 SkillID'
      });
  for (const link of resolvedServantSpecialEffectLinks) {
    const identity = `${link.skillId}:${link.linkedAvatarId}`;
    if (!ownedServantSpecialEffectLinks.has(identity))
      recordSpecialEffectDiagnostic(specialEffectLinks.audit, {
        code: 'unowned-relation',
        source: 'AvatarServantSkillLink',
        identity,
        detail: '没有 Character profile 的 Servant relation 引用该 SkillID'
      });
  }

  const lightConeCatalog: CatalogEntry[] = [];
  const lightCones: LightCone[] = [];
  for (const equipment of tables.EquipmentConfig) {
    const id = String(equipment.EquipmentID);
    const item = equipmentItems.get(id);
    const itemFallback = tr(item?.ItemName, source('light-cone', id, 'ItemName'), `光锥 ${id}`);
    const name = tr(
      equipment.EquipmentName,
      source('light-cone', id, 'EquipmentName'),
      itemFallback
    );
    const description = tr(item?.ItemDesc, source('light-cone', id, 'ItemDesc'));
    const story = tr(item?.ItemBGDesc, source('light-cone', id, 'ItemBGDesc'));
    const passiveId = String(equipment.SkillID);
    const skillRows = equipmentSkills.get(passiveId) ?? [];
    const expectedLevels = Array.from(
      { length: Number(equipment.MaxRank) },
      (_, index) => index + 1
    );
    const actualLevels = skillRows.map((row) => Number(row.Level)).sort((a, b) => a - b);
    if (actualLevels.join(',') !== expectedLevels.join(','))
      throw new Error(
        `光锥 ${id} 的被动 ${passiveId} 叠影等级异常：${actualLevels.join(',') || '无'}`
      );
    const passiveNames = skillRows.map((row) => ({
      level: Number(row.Level),
      name: tr(
        row.SkillName,
        source('light-cone-passive', `${passiveId}:${row.Level}`, 'SkillName')
      )
    }));
    const distinctPassiveNames = unique(passiveNames.map((entry) => entry.name));
    if (distinctPassiveNames.length !== 1 || !distinctPassiveNames[0])
      throw new Error(`光锥 ${id} 的被动 ${passiveId} 在叠影等级间名称不一致或为空`);
    const passiveName = passiveNames.find((entry) => entry.level === 1)?.name;
    if (!passiveName) throw new Error(`光锥 ${id} 的被动 ${passiveId} 缺少叠影 I 名称`);
    const normalizedSuperimposition = normalizeLevelledDescriptions(
      skillRows.map((row) => ({
        level: Number(row.Level),
        params: values(row.ParamList),
        template: tr(
          row.SkillDesc,
          source('light-cone-superimposition', `${equipment.SkillID}:${row.Level}`, 'SkillDesc')
        )
      }))
    );
    collectDescriptionDiagnostics(
      'light-cone-superimposition',
      String(equipment.SkillID),
      normalizedSuperimposition.diagnostics
    );
    const promotionRows = equipmentPromotions.get(id) ?? [];
    const catalog: CatalogEntry = {
      id,
      name,
      description,
      rarity: rarityFromCode(equipment.Rarity),
      path: equipment.AvatarBaseType,
      pathName: pathName(equipment.AvatarBaseType)
    };
    lightConeCatalog.push(catalog);
    lightCones.push({
      ...catalog,
      kind: 'light-cone',
      story,
      passive: {
        id: passiveId,
        name: passiveName,
        superimposition: {
          scalingParamIndexes: normalizedSuperimposition.scalingParamIndexes,
          levels: normalizedSuperimposition.levels
        }
      },
      baseStats: normalizeStatProgression(promotionRows, lightConeStatFields)
    });
    searchSeeds.push({
      entry: {
        id,
        kind: 'light-cone',
        name,
        href: `/light-cones/${id}`,
        aliases: [],
        meta: catalog.pathName
      },
      hashes: unique([hashOf(equipment.EquipmentName), hashOf(item?.ItemName)].filter(defined))
    });
  }

  const relicCatalog: RelicCatalogEntry[] = [];
  const relics: RelicSet[] = [];
  for (const set of tables.RelicSetConfig) {
    const id = String(set.SetID);
    const name = tr(set.SetName, source('relic-set', id, 'SetName'), `遗器套装 ${id}`);
    const effects = (relicSkills.get(id) ?? []).map((skill) => {
      const required = Number(skill.RequireNum);
      if (required !== 2 && required !== 4)
        throw new Error(`遗器套装 ${id} 包含未知套装效果需求：${required}`);
      return {
        required: required as RelicEffectRequirement,
        description: formatGameText(
          trSymbolic(
            skill.SkillDesc,
            source('relic-set-effect', `${id}:${skill.RequireNum}`, 'SkillDesc')
          ),
          values(skill.AbilityParamList)
        )
      };
    });
    const pieces = (relicParts.get(id) ?? []).map((piece) => {
      const slot = normalizeRelicSlot(piece.Type, `遗器套装 ${id}`);
      const pieceId = relicPieceId(piece, `遗器套装 ${id} 的 ${slot} 部件`);
      return {
        id: pieceId,
        slot,
        name:
          trSymbolic(piece.RelicName, source('relic-piece', pieceId, 'RelicName')) ||
          `${name}·${relicTypeNames[slot] ?? slot}`,
        description: trSymbolic(piece.ItemBGDesc, source('relic-piece', pieceId, 'ItemBGDesc'))
      };
    });
    const sources = sourceTexts(set.DisplayItemID);
    const category = relicCategoryForSlots(
      pieces.map((piece) => piece.slot),
      `遗器套装 ${id}`
    );
    const effectRequirements = effects.map((effect) => effect.required);
    const catalog: RelicCatalogEntry = {
      id,
      name,
      description: effects.map((effect) => `${effect.required}件：${effect.description}`).join(' '),
      version: set.ReleaseVersion,
      category,
      effectRequirements,
      type: category,
      typeName: category === 'planar' ? '位面饰品' : '隧洞遗器'
    };
    relicCatalog.push(catalog);
    relics.push({ ...catalog, kind: 'relic', effects, pieces, sources });
    searchSeeds.push({
      entry: { id, kind: 'relic', name, href: `/relics/${id}`, aliases: [], meta: catalog.version },
      hashes: [hashOf(set.SetName)].filter(defined)
    });
  }

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
      const kindLabel = tr(skill.SkillTypeDesc, source('enemy-skill', skillId, 'SkillTypeDesc'));
      const kind = normalizeEnemySkillKind(kindLabel);
      if (kind === 'unknown')
        enemyAudit.unknownSkillKinds.push({ enemyId: id, skillId, value: kindLabel });
      const tagLabel = tr(skill.SkillTag, source('enemy-skill', skillId, 'SkillTag'));
      const tag = normalizeEnemySkillTag(tagLabel);
      if (!tag.known) enemyAudit.unknownSkillTags.push({ enemyId: id, skillId, value: tagLabel });

      const formattedDescription = formatGameMarkup(
        tr(skill.SkillDesc, source('enemy-skill', skillId, 'SkillDesc')),
        values(skill.ParamList)
      );
      collectDescriptionDiagnostics(
        'enemy-skill',
        skillId,
        formattedDescription.diagnostics.map((diagnostic) => ({ level: 1, ...diagnostic }))
      );
      const visible = Boolean(gameTextToPlain(formattedDescription.text).trim());
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
      if (weaknesses.some((weakness) => weakness.element === element))
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
      description: tr(config.MonsterIntroduction, source('enemy', id, 'MonsterIntroduction')),
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
    searchSeeds.push({
      entry: { id, kind: 'enemy', name, href: `/enemies/${id}`, aliases: [], meta: template.Rank },
      hashes: [hashOf(template.MonsterName)].filter(defined)
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
        const kindLabel = tr(skill.SkillTypeDesc, source('enemy-skill', skillId, 'SkillTypeDesc'));
        const tagLabel = tr(skill.SkillTag, source('enemy-skill', skillId, 'SkillTag'));
        const formattedDescription = formatGameMarkup(
          tr(skill.SkillDesc, source('enemy-skill', skillId, 'SkillDesc')),
          values(skill.ParamList)
        );
        const visible = Boolean(gameTextToPlain(formattedDescription.text).trim());
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
          kind: normalizeEnemySkillKind(kindLabel),
          tag: normalizeEnemySkillTag(tagLabel),
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

  console.log('构建简体中文搜索索引…');
  for (const seed of searchSeeds) {
    for (const hash of seed.hashes) {
      const value = text.resolveHash(hash, source(seed.entry.kind, seed.entry.id, 'searchAlias'));
      if (value && value !== seed.entry.name) seed.entry.aliases.push(value);
    }
    seed.entry.aliases = unique(seed.entry.aliases);
  }

  console.log('构建 Endgame 敌方实例与精确 HP…');
  // Normalize and validate every required relation before replacing the last known-good output.
  const endgame = await buildEndgameData(root, text);
  const globalSearchIndex: GlobalSearchIndex = {
    schemaVersion: GLOBAL_SEARCH_SCHEMA_VERSION,
    entities: buildSearchEntityEntries(searchSeeds.map((seed) => seed.entry)),
    endgameEnemies: collectEndgameSearchNames(endgame.datasets, (name) =>
      createHash('sha256').update(name).digest('hex').slice(0, 16)
    )
  };
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
  for (const [category, catalog] of Object.entries(catalogs)) {
    await writeJson(path.join(generatedRoot, 'catalogs', `${category}.json`), catalog);
    for (const detail of details[category as keyof typeof details]) {
      await writeJson(path.join(generatedRoot, 'details', category, `${detail.id}.json`), detail);
    }
  }
  await writeJson(path.join(generatedRoot, 'catalogs', 'relic-properties.json'), relicProperties);
  for (const [mode, dataset] of Object.entries(endgame.datasets))
    await writeJson(path.join(generatedRoot, 'endgame', `${mode}.json`), dataset);
  await writeJson(path.join(generatedRoot, 'homepage.json'), homepage);

  const manifest: DataManifest = {
    schemaVersion: 33,
    sourceCommit: commit,
    sourceVersion,
    ...gameVersion,
    generatedAt: new Date().toISOString(),
    language: 'CHS',
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
