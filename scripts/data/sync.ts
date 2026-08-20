import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CatalogEntry,
  Character,
  CharacterEnergy,
  CharacterProfile,
  DataManifest,
  Enemy,
  EnemySkill,
  LightCone,
  RelicSet,
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
import { hashOf, numberOf, readTable } from './raw.js';
import { decimalOf } from './decimal.js';
import { normalizeSkillCombatMeta } from './skill-combat.js';
import {
  buildSkillCards,
  classifyAvatarSkill,
  classifyMemospriteSkill,
  type SkillVariantInput
} from './skills.js';
import { characterStatFields, lightConeStatFields, normalizeStatProgression } from './stats.js';
import { formatGameMarkup, formatGameText } from './text.js';
import { gameTextToPlain, normalizeGameText } from '../../src/lib/domain/game-text.js';
import { buildEndgameData } from './endgame.js';
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

// Product display override confirmed against AvatarServantConfig and AvatarServantSkillConfig.
// 1140712 is a hidden implementation duplicate of the public memosprite talent 1140706.
const memospriteDisplayOverrides = new Map([['1140712', '1140706']]);

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

  console.log(`读取上游数据：${root}`);
  console.log(`上游版本：${commit.slice(0, 12)} · ${sourceVersion}`);

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
    'AvatarServantConfig',
    'AvatarServantSkillConfig',
    'AvatarSkillTreeConfig',
    'AvatarRankConfig',
    'AvatarPromotionConfig',
    'AvatarPropertyConfig',
    'EquipmentConfig',
    'ItemConfigEquipment',
    'EquipmentSkillConfig',
    'EquipmentPromotionConfig',
    'RelicSetConfig',
    'RelicSetSkillConfig',
    'RelicDataInfo',
    'ItemComefrom',
    'MonsterTemplateConfig',
    'MonsterConfig',
    'MonsterSkillConfig',
    'HardLevelGroup',
    'EliteGroup',
    'ExtraEffectConfig'
  ] as const;
  const loaded = await Promise.all(tableNames.map((name) => readTable<Raw>(root, name)));
  const tables = Object.fromEntries(
    tableNames.map((name, index) => [name, loaded[index]])
  ) as Record<(typeof tableNames)[number], Raw[]>;

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
  const pathRows = by(tables.AvatarBaseType, 'ID');
  const damageRows = by(tables.DamageType, 'ID');
  const itemSources = grouped(tables.ItemComefrom, 'ID');
  const avatarSkills = grouped(tables.AvatarSkillConfig, 'SkillID');
  const servantSkills = grouped(tables.AvatarServantSkillConfig, 'SkillID');
  const avatarTraces = grouped(tables.AvatarSkillTreeConfig, 'AvatarID');
  const avatarRanks = by(tables.AvatarRankConfig, 'RankID');
  const avatarPromotions = grouped(tables.AvatarPromotionConfig, 'AvatarID');
  const avatarProperties = by(tables.AvatarPropertyConfig, 'PropertyType');
  const equipmentSkills = grouped(tables.EquipmentSkillConfig, 'SkillID');
  const equipmentPromotions = grouped(tables.EquipmentPromotionConfig, 'EquipmentID');
  const relicSkills = grouped(tables.RelicSetSkillConfig, 'SetID');
  const relicParts = grouped(tables.RelicDataInfo, 'SetID');
  const relicSetRows = by(tables.RelicSetConfig, 'SetID');
  const monsterRows = by(tables.MonsterConfig, 'MonsterID');
  const monsterTemplates = by(tables.MonsterTemplateConfig, 'MonsterTemplateID');
  const monsterSkillRows = by(tables.MonsterSkillConfig, 'SkillID');
  const hardLevelRows = grouped(tables.HardLevelGroup, 'HardLevelGroup');
  const eliteRows = by(tables.EliteGroup, 'EliteGroup');
  const extraEffectRows = by(tables.ExtraEffectConfig, 'ExtraEffectID');

  const extraEffectIdsOf = (row: Raw): string[] =>
    unique(
      [
        ...(Array.isArray(row.ExtraEffectIDList) ? row.ExtraEffectIDList : []),
        ...(Array.isArray(row.SimpleExtraEffectIDList) ? row.SimpleExtraEffectIDList : [])
      ].map(String)
    );

  const resolveExtraEffects = (
    rawIds: unknown[],
    ownerEntity: string,
    ownerId: string,
    onUnresolved?: (extraEffectId: string) => void
  ): SkillExtraEffect[] =>
    unique(rawIds.map(String)).flatMap((extraEffectId) => {
      const extra = extraEffectRows.get(extraEffectId);
      if (!extra) {
        onUnresolved?.(extraEffectId);
        if (!onUnresolved)
          missingText.record(
            'C',
            'unresolved-relation',
            source(ownerEntity, ownerId, 'ExtraEffectIDList'),
            `extra-effect:${extraEffectId}`
          );
        return [];
      }
      const formatted = formatGameMarkup(
        tr(
          extra.ExtraEffectDesc,
          source(`${ownerEntity}-extra-effect`, extraEffectId, 'ExtraEffectDesc')
        ),
        values(extra.DescParamList)
      );
      collectDescriptionDiagnostics(
        `${ownerEntity}-extra-effect`,
        extraEffectId,
        formatted.diagnostics.map((diagnostic) => ({ level: 1, ...diagnostic }))
      );
      const name = tr(
        extra.ExtraEffectName,
        source(`${ownerEntity}-extra-effect`, extraEffectId, 'ExtraEffectName')
      );
      if (!gameTextToPlain(name).trim() || !gameTextToPlain(formatted.text).trim()) return [];
      return [
        {
          id: extraEffectId,
          name,
          description: formatted.text
        }
      ];
    });
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
      if (!avatarSkills.has(String(skillId)))
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
      !avatarSkills.has(String(declaration.SkillID)) ||
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
        avatarSkills.has(String(skillId))
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
      skillTag: hashOf(first.SkillTag),
      skillIcon: typeof first.SkillIcon === 'string' ? first.SkillIcon : undefined,
      category
    };
  };

  const buildCharacterProfile = (
    config: Raw,
    traceRows: Raw[],
    avatarBaseType: string
  ): CharacterProfile => {
    const avatarId = String(config.AvatarID);
    const progressionBySkill = progressionIdsFor(traceRows);
    const skillVariants: SkillVariantInput[] = [];
    for (const [order, skillId] of (config.SkillList ?? []).entries()) {
      const rows = avatarSkills.get(String(skillId)) ?? [];
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
    let servantOrder = Number.MAX_SAFE_INTEGER / 2;
    for (const servant of matchedServants) {
      for (const [order, skillId] of (servant.SkillIDList ?? []).entries()) {
        const rows = servantSkills.get(String(skillId)) ?? [];
        const category = classifyMemospriteSkill(rows[0] ?? {});
        const publicTalentId = memospriteDisplayOverrides.get(String(skillId));
        if (publicTalentId) {
          const duplicate = rows[0] ?? {};
          const publicTalent = servantSkills.get(publicTalentId)?.[0] ?? {};
          const duplicateTag = hashOf(duplicate.SkillTag);
          const publicTalentTag = hashOf(publicTalent.SkillTag);
          const validOverride =
            category === 'memosprite-skill' &&
            duplicate.HideInUI === true &&
            classifyMemospriteSkill(publicTalent) === 'memosprite-talent' &&
            !!duplicateTag &&
            duplicateTag === publicTalentTag &&
            !!duplicate.SkillIcon &&
            duplicate.SkillIcon === publicTalent.SkillIcon;
          if (!validOverride)
            missingText.record(
              'D',
              'invalid-memosprite-display-override',
              source('memosprite-skill', skillId, 'DisplayOverride'),
              publicTalentId
            );
          else continue;
        }
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
        avatar.AvatarBaseType
      )
    };
    const enhancedConfig = enhancedAvatars.get(id);
    if (enhancedConfig)
      profiles.enhanced = buildCharacterProfile(
        enhancedConfig,
        traceRows.filter(
          (row) => Number(row.EnhancedID ?? 0) === Number(enhancedConfig.EnhancedID)
        ),
        avatar.AvatarBaseType
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
    const skillRows = equipmentSkills.get(String(equipment.SkillID)) ?? [];
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
      superimposition: {
        scalingParamIndexes: normalizedSuperimposition.scalingParamIndexes,
        levels: normalizedSuperimposition.levels
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

  const relicCatalog: CatalogEntry[] = [];
  const relics: RelicSet[] = [];
  for (const set of tables.RelicSetConfig) {
    const id = String(set.SetID);
    const name = tr(set.SetName, source('relic-set', id, 'SetName'), `遗器套装 ${id}`);
    const effects = (relicSkills.get(id) ?? []).map((skill) => ({
      required: Number(skill.RequireNum),
      description: formatGameText(
        trSymbolic(
          skill.SkillDesc,
          source('relic-set-effect', `${id}:${skill.RequireNum}`, 'SkillDesc')
        ),
        values(skill.AbilityParamList)
      )
    }));
    const pieces = (relicParts.get(id) ?? []).map((piece) => ({
      type: relicTypeNames[piece.Type] ?? piece.Type,
      name:
        trSymbolic(
          piece.RelicName,
          source('relic-piece', piece.ID ?? `${id}:${piece.Type}`, 'RelicName')
        ) || `${name}·${relicTypeNames[piece.Type] ?? piece.Type}`,
      description: trSymbolic(
        piece.ItemBGDesc,
        source('relic-piece', piece.ID ?? `${id}:${piece.Type}`, 'ItemBGDesc')
      )
    }));
    const sources = sourceTexts(set.DisplayItemID);
    const catalog: CatalogEntry = {
      id,
      name,
      description: effects.map((effect) => `${effect.required}件：${effect.description}`).join(' '),
      version: set.ReleaseVersion,
      type: pieces.some((piece) => piece.type === '位面球') ? 'planar' : 'cavern',
      typeName: pieces.some((piece) => piece.type === '位面球') ? '位面饰品' : '隧洞遗器'
    };
    relicCatalog.push(catalog);
    relics.push({ ...catalog, kind: 'relic', effects, pieces, sources });
    searchSeeds.push({
      entry: { id, kind: 'relic', name, href: `/relics/${id}`, aliases: [], meta: catalog.version },
      hashes: [hashOf(set.SetName)].filter(defined)
    });
  }

  const enemyCatalog: CatalogEntry[] = [];
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
      if (!summonConfig || !monsterTemplates.has(monsterTemplateId)) {
        enemyAudit.unresolvedSummons.push({ enemyId: id, monsterId });
        continue;
      }
      if (seenSummonTemplates.has(monsterTemplateId)) continue;
      seenSummonTemplates.add(monsterTemplateId);
      summons.push({
        monsterId,
        monsterTemplateId,
        name: canonicalEnemyName(monsterTemplateId),
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
    const catalog: CatalogEntry = {
      id,
      name,
      description: tr(config.MonsterIntroduction, source('enemy', id, 'MonsterIntroduction')),
      type: template.Rank,
      typeName: template.Rank
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
      // Kept until the next UI migration; these are a projection of defaultMonster.
      stats: canonicalMonster.stats,
      weaknesses: canonicalMonster.weaknesses,
      resistances: canonicalMonster.resistances,
      specialResistances: canonicalMonster.specialResistances,
      summons: canonicalMonster.summons,
      skills: canonicalMonster.skills,
      skillPhases: canonicalMonster.skillPhases
    });
    searchSeeds.push({
      entry: { id, kind: 'enemy', name, href: `/enemies/${id}`, aliases: [], meta: template.Rank },
      hashes: [hashOf(template.MonsterName)].filter(defined)
    });
  }

  // Build the explicit Template -> Monster relation. The legacy top-level fields above
  // remain the canonical/default Monster projection for the existing detail UI.
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
        : { ...enemy.stats };
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
        return summonConfig && monsterTemplates.has(summonTemplateId)
          ? [
              {
                monsterId,
                monsterTemplateId: summonTemplateId,
                name: canonicalEnemyName(summonTemplateId),
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
  for (const [mode, dataset] of Object.entries(endgame.datasets))
    await writeJson(path.join(generatedRoot, 'endgame', `${mode}.json`), dataset);

  const manifest: DataManifest = {
    schemaVersion: 19,
    sourceCommit: commit,
    sourceVersion,
    generatedAt: new Date().toISOString(),
    language: 'CHS',
    counts: {
      characters: characters.length,
      lightCones: lightCones.length,
      relics: relics.length,
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
  await writeJson(
    path.join(staticGeneratedRoot, 'search.json'),
    searchSeeds.map((seed) => seed.entry)
  );
  await writeJson(path.join(staticGeneratedRoot, 'meta.json'), manifest);
  await writeJson(path.join(auditRoot, 'latest.json'), {
    ...manifest,
    upstreamTables: Object.fromEntries(tableNames.map((name) => [name, tables[name].length])),
    textDiagnostics: text.getDiagnostics(),
    descriptionDiagnostics,
    skillCombatAudit: {
      unknownEffects: [...unknownSkillEffects].sort()
    },
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
  console.log(`同步完成：${JSON.stringify(manifest.counts)}`);
  return manifest;
}

if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  await syncData();
}
