import type {
  CharacterDomain,
  NeutralCharacterProfile,
  NeutralExtraEffect,
  NeutralSkillCombatLevel,
  NeutralSkillVariant,
  NeutralSpecialEffectRelation,
  NeutralTrace
} from '../../../src/lib/domain/neutral.js';
import { rarityFromCode } from '../../../src/lib/domain/constants.js';
import { parseTextHash } from '../../../src/lib/domain/types.js';
import { configuredCharacterDetailIconKey } from '../character-detail-icons.js';
import { characterStatFields, normalizeStatProgression } from '../stats.js';
import {
  classifyAvatarSkill,
  classifyMemospriteSkill,
  isPlayerFacingSkillConfig
} from '../skills.js';
import { normalizeSpecialEffectLinks } from '../special-effects.js';
import {
  byId,
  decimalString,
  parameterized,
  params,
  rows,
  textSource,
  type Raw
} from './shared.js';

export interface CharacterSource {
  tables: Record<string, unknown>;
}

const list = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.trim() ? value.trim().split(/\s+/) : [];
  return [];
};
const ids = (value: unknown): string[] => list(value).map(String);
const unique = <T>(values: T[]): T[] => [...new Set(values)];

function buildSkillVariant(
  skillId: string,
  skillRows: Raw[],
  order: number,
  source: NeutralSkillVariant['source'],
  progressionId: string | undefined,
  visibility: 'visible' | 'hidden'
): NeutralSkillVariant | undefined {
  const ordered = [...skillRows].sort((a, b) => Number(a.Level ?? 1) - Number(b.Level ?? 1));
  const first = ordered[0];
  if (!first) return undefined;
  const category =
    source === 'memosprite' ? classifyMemospriteSkill(first) : classifyAvatarSkill(first);
  if (!category) return undefined;
  const combatLevels: NeutralSkillCombatLevel[] = ordered.map((row) => ({
    level: Number(row.Level ?? 1),
    ...(typeof row.SkillEffect === 'string' && row.SkillEffect
      ? { effectCode: row.SkillEffect }
      : {}),
    ...(textSource(row.SkillNeed)
      ? { specialResourceSource: parameterized(row.SkillNeed, row.ParamList) }
      : {}),
    ...(Number.isFinite(Number(decimalString(row.BPNeed)))
      ? { bpNeed: Number(decimalString(row.BPNeed)) }
      : {}),
    ...(Number.isFinite(Number(decimalString(row.BPAdd)))
      ? { bpAdd: Number(decimalString(row.BPAdd)) }
      : {}),
    ...(Number.isFinite(Number(decimalString(row.SPBase)))
      ? { spBase: Number(decimalString(row.SPBase)) }
      : {}),
    ...(Number.isFinite(Number(decimalString(row.StanceDamageDisplay)))
      ? { stanceDamageDisplay: Number(decimalString(row.StanceDamageDisplay)) }
      : {}),
    ...(Array.isArray(row.ShowStanceList) ? { showStanceList: params(row.ShowStanceList) } : {})
  }));
  return {
    id: skillId,
    category,
    order,
    source,
    attackType: typeof first.AttackType === 'string' ? first.AttackType : undefined,
    nameSource: textSource(first.SkillName) ?? parameterized(first.SkillName, []),
    typeSource: textSource(first.SkillTypeDesc),
    visibility,
    iconPath: typeof first.SkillIcon === 'string' ? first.SkillIcon : undefined,
    levels: ordered.map((row) => ({
      level: Number(row.Level ?? 1),
      descriptionSource: parameterized(row.SkillDesc, row.ParamList),
      params: params(row.ParamList)
    })),
    combatLevels,
    progressionId,
    extraEffectIds: unique([...ids(first.ExtraEffectIDList), ...ids(first.SimpleExtraEffectIDList)])
  };
}

function buildProfile(
  avatar: Raw,
  tables: Record<string, unknown>,
  traceRows: Raw[],
  enhancedId: number,
  avatarSkills: Map<string, Raw[]>,
  servantSkills: Map<string, Raw[]>,
  specialLinks: ReturnType<typeof normalizeSpecialEffectLinks>,
  properties: Map<string, Raw>
): NeutralCharacterProfile {
  const progressionBySkill = new Map<string, string>();
  for (const row of traceRows)
    for (const skillId of ids(row.LevelUpSkillID))
      progressionBySkill.set(skillId, String(row.PointID));
  const skills: NeutralSkillVariant[] = [];
  for (const [order, skillId] of ids(avatar.SkillList).entries()) {
    const skillRows = avatarSkills.get(skillId) ?? [];
    const visible = isPlayerFacingSkillConfig(skillRows, `AvatarSkillConfig.${skillId}`)
      ? 'visible'
      : 'hidden';
    const variant = buildSkillVariant(
      skillId,
      skillRows,
      order,
      'avatar',
      progressionBySkill.get(skillId),
      visible
    );
    if (variant) skills.push(variant);
    for (const [index, buff] of rows(tables, 'AvatarGlobalBuffConfig')
      .filter(
        (row) => String(row.AvatarID) === String(avatar.AvatarID) && String(row.SkillID) === skillId
      )
      .entries()) {
      const category = classifyAvatarSkill(skillRows[0] ?? {});
      if (!category) continue;
      skills.push({
        id: `${skillId}:global-buff:${index + 1}`,
        category,
        order: order + (index + 1) / 100,
        source: 'avatar-global-buff',
        nameSource: textSource(buff.Name) ?? {
          kind: 'direct',
          ref: { kind: 'symbolic', key: `global-buff:${skillId}:name` }
        },
        levels: [
          {
            level: 1,
            descriptionSource: parameterized(buff.Desc, buff.ParamList),
            params: params(buff.ParamList)
          }
        ],
        combatLevels: [
          {
            level: 1,
            ...(typeof buff.SkillEffect === 'string' ? { effectCode: buff.SkillEffect } : {})
          }
        ],
        progressionId: undefined,
        extraEffectIds: unique([
          ...ids(buff.ExtraEffectIDList),
          ...ids(buff.SimpleExtraEffectIDList)
        ])
      });
    }
  }
  for (const relation of rows(tables, 'AvatarSpecialSkillTree').filter(
    (row) => String(row.AvatarID) === String(avatar.AvatarID)
  )) {
    const skillId = String(relation.ShowSkill);
    const existing = skills.find((skill) => skill.id === skillId);
    if (existing) {
      existing.visibility = 'visible';
      continue;
    }
    const skillRows = avatarSkills.get(skillId) ?? [];
    const variant = buildSkillVariant(
      skillId,
      skillRows,
      skills.length,
      'avatar',
      progressionBySkill.get(skillId),
      'visible'
    );
    if (variant) skills.push(variant);
  }
  const servantConfigs = rows(tables, 'AvatarServantConfig').filter((servant) =>
    ids(servant.SkillIDList).some((skillId) =>
      traceRows.some(
        (trace) => Number(trace.PointType) === 4 && ids(trace.LevelUpSkillID).includes(skillId)
      )
    )
  );
  let servantOrder = 100000;
  for (const servant of servantConfigs) {
    for (const [index, skillId] of ids(servant.SkillIDList).entries()) {
      const skillRows = servantSkills.get(skillId) ?? [];
      const visible = isPlayerFacingSkillConfig(skillRows, `AvatarServantSkillConfig.${skillId}`)
        ? 'visible'
        : 'hidden';
      const variant = buildSkillVariant(
        skillId,
        skillRows,
        servantOrder + index,
        'memosprite',
        progressionBySkill.get(skillId),
        visible
      );
      if (variant) skills.push(variant);
    }
    servantOrder += ids(servant.SkillIDList).length;
  }
  const traceGroups = new Map<string, Raw[]>();
  for (const row of traceRows) {
    if (Number(row.EnhancedID ?? 0) !== enhancedId) continue;
    const id = String(row.PointID);
    traceGroups.set(id, [...(traceGroups.get(id) ?? []), row]);
  }
  const traces: NeutralTrace[] = [...traceGroups.values()].flatMap((group) => {
    const row =
      [...group]
        .sort((a, b) => Number(a.Level ?? 1) - Number(b.Level ?? 1))
        .find((candidate) => candidate.PointName || candidate.PointDesc) ?? group[0];
    if (!row || ![1, 3, 5].includes(Number(row.PointType))) return [];
    const propertyType = Array.isArray(row.StatusAddList)
      ? String((row.StatusAddList[0] as Raw | undefined)?.PropertyType ?? '') || undefined
      : undefined;
    const property = propertyType ? properties.get(propertyType) : undefined;
    const anchor = /^Point(\d+)$/.exec(String(row.AnchorType ?? ''));
    return [
      {
        id: String(row.PointID),
        type: Number(row.PointType) === 1 ? 'stat' : 'ability',
        propertyType,
        sourcePointType: Number(row.PointType ?? 0),
        prerequisiteIds: ids(row.PrePoint),
        nameSource: textSource(row.PointName),
        descriptionSource: parameterized(row.PointDesc, row.ParamList),
        params: params(row.ParamList),
        iconPath: typeof row.IconPath === 'string' ? row.IconPath : undefined,
        promotionLimit:
          row.AvatarPromotionLimit === undefined ? undefined : Number(row.AvatarPromotionLimit),
        anchorOrder: anchor ? Number(anchor[1]) : undefined,
        statDescriptionSource: textSource(property?.PropertyNameSkillTree),
        statValues: Array.isArray(row.StatusAddList)
          ? params(row.StatusAddList.map((status: Raw) => status.Value))
          : undefined,
        extraEffectIds: unique([...ids(row.ExtraEffectIDList), ...ids(row.SimpleExtraEffectIDList)])
      }
    ];
  });
  const ranks = byId(rows(tables, 'AvatarRankConfig'), 'RankID');
  const eidolons = ids(avatar.RankIDList).flatMap((rankId) => {
    const rank = ranks.get(rankId);
    if (!rank) return [];
    return [
      {
        id: rankId,
        rank: Number(rank.Rank ?? 0),
        nameSource: textSource(rank.Name),
        descriptionSource: parameterized(rank.Desc, rank.Param),
        params: params(rank.Param),
        extraEffectIds: unique([
          ...ids(rank.ExtraEffectIDList),
          ...ids(rank.SimpleExtraEffectIDList)
        ]),
        iconPath: typeof rank.IconPath === 'string' ? rank.IconPath : undefined
      }
    ];
  });
  const profileSkillIds = new Set(skills.map((skill) => skill.id));
  const relations: NeutralSpecialEffectRelation[] = [
    ...specialLinks.avatar
      .filter(
        (link) =>
          profileSkillIds.has(link.skillId) ||
          link.linkedAvatarIds.includes(String(avatar.AvatarID)) ||
          link.simplifiedLinkedAvatarIds.includes(String(avatar.AvatarID))
      )
      .map((link) => ({
        kind: 'avatar-skill-link' as const,
        skillId: link.skillId,
        linkedAvatarIds: link.linkedAvatarIds,
        simplifiedLinkedAvatarIds: link.simplifiedLinkedAvatarIds,
        order: link.sourceOrder
      })),
    ...specialLinks.servant
      .filter((link) => profileSkillIds.has(link.skillId))
      .map((link) => ({
        kind: 'servant-skill-link' as const,
        skillId: link.skillId,
        order: link.order,
        linkedAvatarId: link.linkedAvatarId,
        tarotFigurePath: link.tarotFigurePath,
        tarotIconPath: link.tarotIconPath
      }))
  ];
  const specialIds = new Set(
    rows(tables, 'AvatarUltraSkillConfig')
      .filter((row) => row.UltraSkillType === 'SpecialSP')
      .map((row) => String(row.AvatarID))
  );
  const avatarId = String(avatar.AvatarID);
  for (let index = 0; index < skills.length; index += 1) {
    const skill = skills[index];
    const progressionRow = skill.progressionId
      ? traceRows.find((row) => String(row.PointID) === skill.progressionId)
      : undefined;
    if (progressionRow && typeof progressionRow.IconPath === 'string')
      skills[index] = {
        ...skill,
        progressionIconPath: progressionRow.IconPath,
        progressionPointType: Number(progressionRow.PointType ?? 0)
      };
  }
  return {
    energy: specialIds.has(avatarId)
      ? {
          kind: 'special',
          max: 0,
          iconCode: 'SpecialMaxSP',
          iconPath:
            typeof properties.get('SpecialMaxSP')?.IconPath === 'string'
              ? String(properties.get('SpecialMaxSP')?.IconPath)
              : undefined
        }
      : {
          kind: 'standard',
          max: Number(decimalString(avatar.SPNeed)),
          iconCode: 'MaxSP',
          iconPath:
            typeof properties.get('MaxSP')?.IconPath === 'string'
              ? String(properties.get('MaxSP')?.IconPath)
              : undefined
        },
    skills,
    traces,
    eidolons,
    specialEffects: relations
  };
}

export interface CharacterDomainBuild {
  characters: CharacterDomain[];
  extraEffects: NeutralExtraEffect[];
}

export function buildCharacterDomain(source: CharacterSource): CharacterDomainBuild {
  const tables = source.tables;
  const avatars = [
    ...rows(tables, 'AvatarConfig'),
    ...rows(tables, 'AvatarConfigLD').filter(
      (avatar) =>
        !rows(tables, 'AvatarConfig').some(
          (base) => String(base.AvatarID) === String(avatar.AvatarID)
        )
    )
  ];
  const avatarsById = byId(avatars, 'AvatarID');
  const items = byId(rows(tables, 'ItemConfigAvatar'), 'ID');
  const paths = byId(rows(tables, 'AvatarBaseType'), 'ID');
  const elements = byId(rows(tables, 'DamageType'), 'ID');
  const properties = byId(rows(tables, 'AvatarPropertyConfig'), 'PropertyType');
  const equipment = byId(rows(tables, 'AvatarEquipRecommend'), 'AvatarID');
  const relic = byId(rows(tables, 'AvatarRelicRecommend'), 'AvatarID');
  const avatarSkills = new Map<string, Raw[]>();
  for (const row of rows(tables, 'AvatarSkillConfig')) {
    const id = String(row.SkillID);
    avatarSkills.set(id, [...(avatarSkills.get(id) ?? []), row]);
  }
  const servantSkills = new Map<string, Raw[]>();
  for (const row of rows(tables, 'AvatarServantSkillConfig')) {
    const id = String(row.SkillID);
    servantSkills.set(id, [...(servantSkills.get(id) ?? []), row]);
  }
  const tracesByAvatar = new Map<string, Raw[]>();
  for (const row of rows(tables, 'AvatarSkillTreeConfig')) {
    const id = String(row.AvatarID);
    tracesByAvatar.set(id, [...(tracesByAvatar.get(id) ?? []), row]);
  }
  const enhanced = byId(rows(tables, 'AvatarConfigEnhanced'), 'AvatarID');
  const multiplePaths = byId(rows(tables, 'MultiplePathAvatarConfig'), 'AvatarID');
  const specialLinks = normalizeSpecialEffectLinks(
    rows(tables, 'AvatarSkillLink'),
    rows(tables, 'AvatarServantSkillLink')
  );
  const extraEffects: NeutralExtraEffect[] = rows(tables, 'ExtraEffectConfig').map((row) => ({
    id: String(row.ExtraEffectID),
    nameSource: textSource(row.ExtraEffectName),
    descriptionSource: parameterized(row.ExtraEffectDesc, row.DescParamList),
    params: params(row.DescParamList),
    iconPath: typeof row.ExtraEffectIconPath === 'string' ? row.ExtraEffectIconPath : undefined
  }));
  const characters = avatars.map((avatar) => {
    const id = String(avatar.AvatarID);
    const traceRows = tracesByAvatar.get(id) ?? [];
    const enhancedConfig = enhanced.get(id);
    const baseAvatarId =
      avatar.BaseAvatarID !== undefined
        ? String(avatar.BaseAvatarID)
        : multiplePaths.get(id)?.BaseAvatarID === undefined
          ? undefined
          : String(multiplePaths.get(id)?.BaseAvatarID);
    const baseProfile = buildProfile(
      avatar,
      tables,
      traceRows,
      0,
      avatarSkills,
      servantSkills,
      specialLinks,
      properties
    );
    const enhancedProfile = enhancedConfig
      ? buildProfile(
          enhancedConfig,
          tables,
          traceRows,
          Number(enhancedConfig.EnhancedID ?? 0),
          avatarSkills,
          servantSkills,
          specialLinks,
          properties
        )
      : undefined;
    const promotionRows = rows(tables, 'AvatarPromotionConfig').filter(
      (row) => String(row.AvatarID) === id
    );
    const recommendation = equipment.get(id);
    const relicRecommendation = relic.get(id);
    return {
      id,
      baseAvatarId,
      gender:
        avatar.Gender === 'Female' || avatar.Gender === 'female'
          ? 'female'
          : avatar.Gender === 'Male' || avatar.Gender === 'male'
            ? 'male'
            : undefined,
      pathCode: String(avatar.AvatarBaseType ?? ''),
      elementCode: String(avatar.DamageType ?? ''),
      rarity: rarityFromCode(String(avatar.Rarity ?? '')) ?? 0,
      stats: {
        ...normalizeStatProgression(promotionRows, characterStatFields, {
          speed: Number(decimalString(promotionRows[0]?.SpeedBase)),
          criticalChance: Number(decimalString(promotionRows[0]?.CriticalChance)),
          criticalDamage: Number(decimalString(promotionRows[0]?.CriticalDamage)),
          aggro: Number(decimalString(promotionRows[0]?.BaseAggro))
        }),
        iconKeys: Object.fromEntries(
          [
            ['hp', 'MaxHP'],
            ['attack', 'Attack'],
            ['defence', 'Defence'],
            ['speed', 'Speed']
          ].flatMap(([field, propertyType]) => {
            const key = configuredCharacterDetailIconKey(
              'property',
              propertyType,
              properties.get(propertyType)?.IconPath,
              `AvatarPropertyConfig.${propertyType}`
            );
            return key ? [[field, key]] : [];
          })
        )
      },
      profiles: { base: baseProfile, ...(enhancedProfile ? { enhanced: enhancedProfile } : {}) },
      equipmentRecommendation: {
        lightConeIds: ids(recommendation?.EquipmentList),
        cavernSetIds: ids(relicRecommendation?.Set4IDList),
        planarSetIds: ids(relicRecommendation?.Set2IDList),
        mainStatOptions: [
          ['BODY', 'PropertyList3'],
          ['FOOT', 'PropertyList4'],
          ['NECK', 'PropertyList5'],
          ['OBJECT', 'PropertyList6']
        ].map(([slot, field]) => ({ slot, propertyTypes: ids(relicRecommendation?.[field]) })),
        subStatPropertyTypes: ids(relicRecommendation?.SubAffixPropertyList)
      },
      naming: {
        avatarName: textSource(avatar.AvatarName),
        fullName: textSource(avatar.AvatarFullName),
        ...(baseAvatarId === '8001'
          ? {
              baseNameSource: {
                kind: 'direct',
                ref: { kind: 'hash', hash: parseTextHash('4036035618718239522')! }
              }
            }
          : baseAvatarId && baseAvatarId !== id
            ? { baseNameSource: textSource(avatarsById.get(baseAvatarId)?.AvatarName) }
            : {})
      },
      assetKeys: { avatarId: id },
      descriptionSource: textSource(items.get(id)?.ItemBGDesc),
      pathNameSource: textSource(paths.get(String(avatar.AvatarBaseType))?.BaseTypeText),
      elementNameSource: textSource(elements.get(String(avatar.DamageType))?.DamageTypeName)
    } satisfies CharacterDomain;
  });
  return { characters, extraEffects };
}
