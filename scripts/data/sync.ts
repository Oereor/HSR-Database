import { loadEnemySkillInclusionPolicy } from './enemy-skill-policy.js';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CatalogEntry,
  Character,
  DataManifest,
  GeneratedArtifactMetadata,
  RelicCatalogEntry,
  RelicProperty
} from '../../src/lib/domain/types.js';
import { parseTextHash } from '../../src/lib/domain/types.js';
import {
  createTextResolver,
  loadTextMap,
  runtimeTextSourceFromRef,
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
import { mergeConfigSources, readTable } from './raw.js';
import { classifyAvatarSkill } from './skills.js';
import { normalizeSpecialEffectLinks } from './special-effects.js';
import {
  createAvatarSpecialSkillTreeAudit,
  normalizeAvatarSpecialSkillRelations,
  resolveAvatarSpecialSkillRelations
} from './avatar-special-skills.js';
import { characterLdSourceNames, characterLdSourceSpecs } from './character-sources.js';
import { gameTextToPlain, normalizeGameText } from '../../src/lib/domain/game-text.js';
import { collectEndgameSearchTargets } from '../../src/lib/domain/search-index.js';
import { deriveCharacterNames } from './character-names.js';
import {
  buildSearchDocuments,
  loadPlayerAliases,
  type SearchBuildInputs
} from './search-documents.js';
import { buildEndgameDomain } from './endgame.js';
import { projectEndgame } from './projection/endgame.js';
import { buildHomepageRecentWarpData } from './homepage.js';
import { parseGameVersion } from './source-metadata.js';
import { buildCharacterDomain } from './domain/character.js';
import { buildLightConeDomain } from './domain/light-cone.js';
import { buildRelicDomain } from './domain/relic.js';
import { projectCharacter } from './projection/character.js';
import { projectLightCone } from './projection/light-cone.js';
import { projectRelic } from './projection/relic.js';
import { buildEnemyDomain } from './domain/enemy.js';
import { projectEnemies } from './projection/enemy.js';
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

async function resetDirectory(directory: string): Promise<void> {
  assertInsideSite(directory);
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
}

async function pathExists(target: string): Promise<boolean> {
  return access(target).then(
    () => true,
    () => false
  );
}

interface DirectoryPublication {
  target: string;
  next: string;
  previous: string;
}

export async function publishGeneratedDirectories(
  publications: DirectoryPublication[]
): Promise<void> {
  for (const publication of publications) {
    assertInsideSite(publication.target);
    assertInsideSite(publication.next);
    assertInsideSite(publication.previous);
  }
  for (const publication of publications) {
    await rm(publication.previous, { recursive: true, force: true });
  }
  const backedUp: DirectoryPublication[] = [];
  const published: DirectoryPublication[] = [];
  try {
    for (const publication of publications) {
      if (await pathExists(publication.target)) {
        await rename(publication.target, publication.previous);
        backedUp.push(publication);
      }
      await rename(publication.next, publication.target);
      published.push(publication);
    }
  } catch (error) {
    for (const publication of [...publications].reverse()) {
      if (published.includes(publication) && (await pathExists(publication.target)))
        await rm(publication.target, { recursive: true, force: true });
      if (backedUp.includes(publication) && (await pathExists(publication.previous)))
        await rename(publication.previous, publication.target);
    }
    throw error;
  }
  for (const publication of publications)
    await rm(publication.previous, { recursive: true, force: true });
}

async function publishGeneratedTrees(
  nextGeneratedRoot: string,
  nextStaticGeneratedRoot: string
): Promise<void> {
  await publishGeneratedDirectories([
    { target: generatedRoot, next: nextGeneratedRoot, previous: `${generatedRoot}.previous` },
    {
      target: staticGeneratedRoot,
      next: nextStaticGeneratedRoot,
      previous: `${staticGeneratedRoot}.previous`
    }
  ]);
}

async function verifyGeneratedArtifacts(
  artifacts: Record<string, GeneratedArtifactMetadata>,
  nextGeneratedRoot: string,
  nextStaticGeneratedRoot: string
): Promise<void> {
  for (const [logicalPath, metadata] of Object.entries(artifacts)) {
    const file = logicalPath.startsWith('static/generated/')
      ? path.join(nextStaticGeneratedRoot, logicalPath.slice('static/generated/'.length))
      : path.join(nextGeneratedRoot, logicalPath);
    const serialized = await readFile(file);
    if (
      serialized.byteLength !== metadata.bytes ||
      createHash('sha256').update(serialized).digest('hex') !== metadata.sha256
    )
      throw new Error(`Generated artifact failed pre-publication validation: ${logicalPath}`);
    JSON.parse(serialized.toString('utf8'));
  }
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
  const symbolicResult = text.resolve({
    kind: 'direct',
    ref: { kind: 'symbolic', key: 'RelicDesc_1012' },
    provenance: source('relic-set', '101', 'RelicSetSkillConfig.SkillDesc')
  });
  const hashResult = text.resolve({
    kind: 'direct',
    ref: { kind: 'hash', hash: parseTextHash('12720770977431568614')! },
    provenance: source('regression', 'RelicDesc_1012', 'expectedHash')
  });
  if (
    symbolicResult.status !== 'available' ||
    hashResult.status !== 'available' ||
    symbolicResult.value !== hashResult.value
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
    const runtimeSource = runtimeTextSourceFromRef(value, textSource);
    const result = runtimeSource
      ? text.resolve(runtimeSource, { diagnosticDisposition: disposition })
      : { status: 'absent' as const };
    const resolved = result.status === 'available' ? result.value : '';
    auditResolvedText(resolved, textSource);
    return normalizeGameText(resolved || fallback);
  };
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
  const monsterSkillRows = by(tables.MonsterSkillConfig, 'SkillID');
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

  const enemyDomainBuild = buildEnemyDomain({
    tables: tableSubset([
      'MonsterTemplateConfig',
      'MonsterConfig',
      'MonsterSkillConfig',
      'DamageType',
      'HardLevelGroup',
      'EliteGroup'
    ]),
    inclusionPolicy: await loadEnemySkillInclusionPolicy()
  });
  const enemyDomainsById = new Map(enemyDomainBuild.enemies.map((enemy) => [enemy.id, enemy]));
  const projectedEnemies = projectEnemies(enemyDomainBuild.enemies, {
    resolver: text,
    enemiesById: enemyDomainsById,
    extraEffectsById,
    elementNameFallbacks: {
      Physical: '物理',
      Fire: '火',
      Ice: '冰',
      Lightning: '雷',
      Wind: '风',
      Quantum: '量子',
      Imaginary: '虚数'
    },
    onDescriptionDiagnostics: (entity, id, diagnostics) =>
      collectDescriptionDiagnostics(entity, id, diagnostics),
    onUnresolvedExtraEffect: (enemyId, skillId, extraEffectId) =>
      enemyDomainBuild.audit.unresolvedExtraEffects.push({ enemyId, skillId, extraEffectId })
  });
  const enemies = projectedEnemies.enemies;
  const enemyCatalog = projectedEnemies.catalog;
  const enemyAudit = enemyDomainBuild.audit;

  console.log('构建 Endgame 敌方实例与精确 HP…');
  // Normalize and validate every required relation before replacing the last known-good output.
  const endgameDomain = await buildEndgameDomain(root);
  const endgame = projectEndgame(endgameDomain, {
    resolver: text,
    enemyNamesByTemplateId: new Map(enemies.map((enemy) => [enemy.id, enemy.name])),
    extraEffectsById
  });
  const searchInputs: SearchBuildInputs = {
    official: officialCharacterNames,
    catalogs: {
      character: characterCatalog.map(({ id, name }) => ({ id, name })),
      'light-cone': lightConeCatalog.map(({ id, name }) => ({ id, name })),
      relic: relicCatalog.map(({ id, name }) => ({ id, name })),
      enemy: enemyCatalog.map(({ id, name }) => ({ id, name }))
    },
    endgameTargets: collectEndgameSearchTargets(
      endgameDomain.datasets,
      new Map(enemies.map((enemy) => [enemy.id, enemy.name]))
    )
  };
  const globalSearchIndex = buildSearchDocuments(searchInputs, await loadPlayerAliases());
  const homepage = buildHomepageRecentWarpData(
    tables.GachaBasicInfo,
    characterCatalog,
    lightConeCatalog
  );

  const nextGeneratedRoot = `${generatedRoot}.next`;
  const nextStaticGeneratedRoot = `${staticGeneratedRoot}.next`;
  await resetDirectory(nextGeneratedRoot);
  await resetDirectory(nextStaticGeneratedRoot);
  await mkdir(auditRoot, { recursive: true });

  const catalogs = {
    characters: characterCatalog,
    'light-cones': lightConeCatalog,
    relics: relicCatalog,
    enemies: enemyCatalog
  };
  const details = { characters, 'light-cones': lightCones, relics, enemies };
  const artifacts: Record<string, GeneratedArtifactMetadata> = {};
  const writeArtifact = async (
    root: string,
    relative: string,
    value: unknown,
    metadata: Pick<GeneratedArtifactMetadata, 'locale'> = {},
    logicalPath = relative
  ): Promise<void> => {
    const serialized = `${JSON.stringify(value)}\n`;
    await writeJson(path.join(root, ...relative.split('/')), value);
    const schemaVersion =
      value && typeof value === 'object' && 'schemaVersion' in value
        ? Number((value as { schemaVersion: unknown }).schemaVersion)
        : undefined;
    artifacts[logicalPath] = {
      bytes: Buffer.byteLength(serialized),
      sha256: createHash('sha256').update(serialized).digest('hex'),
      ...metadata,
      ...(Number.isSafeInteger(schemaVersion) ? { schemaVersion } : {})
    };
  };
  const writeViewArtifacts = async (): Promise<void> => {
    for (const category of Object.keys(catalogs)) {
      const catalog = catalogs[category as keyof typeof catalogs];
      await writeArtifact(nextGeneratedRoot, `views/zh-CN/catalogs/${category}.json`, catalog, {
        locale: 'zh-CN'
      });
      for (const detail of details[category as keyof typeof details])
        await writeArtifact(
          nextGeneratedRoot,
          `views/zh-CN/details/${category}/${detail.id}.json`,
          detail,
          { locale: 'zh-CN' }
        );
    }
    await writeArtifact(
      nextGeneratedRoot,
      'views/zh-CN/catalogs/relic-properties.json',
      relicProperties,
      { locale: 'zh-CN' }
    );
    for (const [mode, dataset] of Object.entries(endgame.datasets))
      await writeArtifact(nextGeneratedRoot, `views/zh-CN/endgame/${mode}.json`, dataset, {
        locale: 'zh-CN'
      });
    await writeArtifact(nextGeneratedRoot, 'views/zh-CN/homepage.json', homepage, {
      locale: 'zh-CN'
    });
  };
  await writeViewArtifacts();
  await writeArtifact(nextGeneratedRoot, 'views/zh-CN/search-inputs.json', searchInputs, {
    locale: 'zh-CN'
  });
  await writeArtifact(
    nextStaticGeneratedRoot,
    'zh-CN/search.json',
    globalSearchIndex,
    { locale: 'zh-CN' },
    'static/generated/zh-CN/search.json'
  );
  const dataRevision = createHash('sha256')
    .update(JSON.stringify({ sourceCommit: commit, textMapDigest, artifacts }))
    .digest('hex');

  const manifest: DataManifest = {
    schemaVersion: 41,
    sourceCommit: commit,
    sourceVersion,
    ...gameVersion,
    locale: locale.locale,
    textMapCode: locale.textMapCode,
    textMapDigest,
    dataRevision,
    artifacts,
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
  await verifyGeneratedArtifacts(artifacts, nextGeneratedRoot, nextStaticGeneratedRoot);
  await writeJson(path.join(nextGeneratedRoot, 'manifest.json'), manifest);
  await publishGeneratedTrees(nextGeneratedRoot, nextStaticGeneratedRoot);
  await writeJson(path.join(auditRoot, 'latest.json'), {
    ...manifest,
    generatedAt: new Date().toISOString(),
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
