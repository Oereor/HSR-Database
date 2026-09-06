import { resolveEnemySkillSource, loadEnemySkillInclusionPolicy } from './enemy-skill-policy.js';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CatalogEntry,
  Character,
  DataManifest,
  Enemy,
  EnemySkill,
  RelicCatalogEntry,
  RelicProperty,
  SkillExtraEffect
} from '../../src/lib/domain/types.js';
import { parseTextHash } from '../../src/lib/domain/types.js';
import { isElementType, normalizeElementType } from '../../src/lib/domain/elements.js';
import {
  createTextResolver,
  loadTextMap,
  type TextDiagnosticDisposition,
  type TextSource
} from './localization.js';
import { addDescriptionDiagnostics, createDescriptionDiagnosticSummary } from './levelled.js';
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
import { classifyAvatarSkill } from './skills.js';
import { normalizeSpecialEffectLinks } from './special-effects.js';
import {
  createAvatarSpecialSkillTreeAudit,
  normalizeAvatarSpecialSkillRelations,
  resolveAvatarSpecialSkillRelations
} from './avatar-special-skills.js';
import { characterLdSourceNames, characterLdSourceSpecs } from './character-sources.js';
import { gameTextToPlain, normalizeGameText } from '../../src/lib/domain/game-text.js';
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
  const damageRows = by(tables.DamageType, 'ID');
  // These are complete raw indexes. HideInUI is a standard-presentation rule and must
  // never be applied while building either lookup.
  const avatarSkillById = grouped(tables.AvatarSkillConfig, 'SkillID');
  const avatarConfigsById = by(tables.AvatarConfig, 'AvatarID');
  const avatarGlobalBuffs = grouped(tables.AvatarGlobalBuffConfig, 'AvatarID');
  const avatarTraces = grouped(tables.AvatarSkillTreeConfig, 'AvatarID');
  const avatarRanks = by(tables.AvatarRankConfig, 'RankID');
  const equipmentSkills = grouped(tables.EquipmentSkillConfig, 'SkillID');
  const relicSetRows = by(tables.RelicSetConfig, 'SetID');
  const relicBaseTypes = by(
    tables.RelicBaseType.filter((row) => row.Type),
    'Type'
  );
  const monsterRows = by(tables.MonsterConfig, 'MonsterID');
  const monsterTemplates = by(tables.MonsterTemplateConfig, 'MonsterTemplateID');
  const monsterSkillRows = by(tables.MonsterSkillConfig, 'SkillID');
  const hardLevelRows = grouped(tables.HardLevelGroup, 'HardLevelGroup');
  const eliteRows = by(tables.EliteGroup, 'EliteGroup');
  const avatarSpecialSkillTreeAudit = createAvatarSpecialSkillTreeAudit();
  resolveAvatarSpecialSkillRelations(
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
  const specialEffectLinks = normalizeSpecialEffectLinks(
    tables.AvatarSkillLink,
    tables.AvatarServantSkillLink
  );

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
  const elementName = (id: string): string =>
    tr(damageRows.get(id)?.DamageTypeName, source('element', id, 'DamageTypeName'), id);

  const relicSlots = ['HEAD', 'HAND', 'BODY', 'FOOT', 'NECK', 'OBJECT'] as const;
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
  const characterCatalog: CatalogEntry[] = [];
  const characters: Character[] = [];
  const characterNames = await deriveCharacterNames(root, commit, text);

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
  const lightConeCatalog: CatalogEntry[] = lightCones.map((lightCone) => {
    const catalog: Partial<typeof lightCone> = { ...lightCone };
    delete catalog.kind;
    delete catalog.story;
    delete catalog.passive;
    delete catalog.baseStats;
    return catalog as CatalogEntry;
  });
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
  const relicCatalog: RelicCatalogEntry[] = relics.map((relic) => {
    const catalog: Partial<typeof relic> = { ...relic };
    delete catalog.kind;
    delete catalog.effects;
    delete catalog.pieces;
    delete catalog.sources;
    return catalog as RelicCatalogEntry;
  });

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
  const characterBuild = buildCharacterDomain({ tables: characterDomainSource });
  const characterDomains = characterBuild.characters;
  const extraEffectsById = new Map(
    characterBuild.extraEffects.map((effect) => [effect.id, effect])
  );
  for (const domain of characterDomains) {
    const references = new Set(
      [...domain.profiles.base.skills, ...(domain.profiles.enhanced?.skills ?? [])].flatMap(
        (skill) => skill.extraEffectIds
      )
    );
    for (const trace of [
      ...domain.profiles.base.traces,
      ...(domain.profiles.enhanced?.traces ?? [])
    ])
      for (const id of trace.extraEffectIds ?? []) references.add(id);
    for (const eidolon of [
      ...domain.profiles.base.eidolons,
      ...(domain.profiles.enhanced?.eidolons ?? [])
    ])
      for (const id of eidolon.extraEffectIds) references.add(id);
    for (const id of references)
      if (!extraEffectsById.has(id))
        throw new Error(`角色 ${domain.id} 引用了未知 ExtraEffect ${id}`);
  }
  const projectedCharacters = characterDomains.map((domain) =>
    projectCharacter(domain, { locale: 'zh-CN', resolver: text, extraEffectsById })
  );
  const projectedCharacterNames = new Map(
    projectedCharacters.map((character) => [character.id, character])
  );
  for (const [id, names] of Object.entries(characterNames.snapshot.characters)) {
    const projected = projectedCharacterNames.get(id);
    if (!projected || names.canonicalName !== gameTextToPlain(projected.name))
      throw new Error(
        `角色 ${id} canonical name 与 Character projection 不一致: ${names.canonicalName} != ${projected ? gameTextToPlain(projected.name) : '<missing>'}`
      );
  }
  const officialCharacterNames = {
    ...characterNames.snapshot,
    characters: Object.fromEntries(
      Object.entries(characterNames.snapshot.characters).map(([id, names]) => [
        id,
        { ...names, canonicalName: gameTextToPlain(projectedCharacterNames.get(id)!.name) }
      ])
    )
  };
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
    official: officialCharacterNames,
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
      ...artifactMeta('neutral/source.json', `${neutralSerialized}\n`)
    },
    sourceShards: sourceShardMeta
  };
  const viewManifest = {
    schemaVersion: 2 as const,
    locale: locale.locale,
    textMapCode: locale.textMapCode,
    projectionVersion: 'chs-view-4',
    neutralDigest,
    contentDigest: viewDigest,
    textMapDigest,
    domainDigests: {},
    neutralSourceDigests: {
      characters: sourceShardMeta.characters.contentDigest,
      lightCones: createHash('sha256')
        .update(JSON.stringify(sourceShards['light-cones']))
        .digest('hex'),
      relics: createHash('sha256').update(JSON.stringify(sourceShards.relics)).digest('hex')
    }
  };
  const writeViewArtifacts = async (base: string, compatibility = false): Promise<void> => {
    const categories = compatibility ? ['enemies'] : Object.keys(catalogs);
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
  // Keep only the untouched Enemy compatibility paths while remaining domains migrate.
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
