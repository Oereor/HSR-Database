import { mergeConfigSources, readTable } from './raw.js';

type RawRecord = Record<string, any>;

export const characterLdSourceSpecs = [
  {
    tableName: 'AvatarConfig',
    additionalName: 'AvatarConfigLD',
    identityOf: (row: RawRecord) => String(row.AvatarID)
  },
  {
    tableName: 'ItemConfigAvatar',
    additionalName: 'ItemConfigAvatarLD',
    identityOf: (row: RawRecord) => String(row.ID)
  },
  {
    tableName: 'AvatarSkillConfig',
    additionalName: 'AvatarSkillConfigLD',
    identityOf: (row: RawRecord) => `${String(row.SkillID)}:${String(row.Level ?? 1)}`
  },
  {
    tableName: 'AvatarSkillTreeConfig',
    additionalName: 'AvatarSkillTreeConfigLD',
    identityOf: (row: RawRecord) =>
      `${String(row.PointID)}:${String(row.EnhancedID ?? 0)}:${String(row.Level ?? 1)}`
  },
  {
    tableName: 'AvatarRankConfig',
    additionalName: 'AvatarRankConfigLD',
    identityOf: (row: RawRecord) => String(row.RankID)
  },
  {
    tableName: 'AvatarPromotionConfig',
    additionalName: 'AvatarPromotionConfigLD',
    identityOf: (row: RawRecord) => `${String(row.AvatarID)}:${String(row.MaxLevel)}`
  },
  {
    tableName: 'AvatarEquipRecommend',
    additionalName: 'AvatarEquipRecommendLD',
    identityOf: (row: RawRecord) => String(row.AvatarID)
  },
  {
    tableName: 'AvatarRelicRecommend',
    additionalName: 'AvatarRelicRecommendLD',
    identityOf: (row: RawRecord) => String(row.AvatarID)
  }
] as const;

export const characterLdSourceNames = [
  'AvatarConfigLD',
  'ItemConfigAvatarLD',
  'AvatarSkillConfigLD',
  'AvatarSkillTreeConfigLD',
  'AvatarRankConfigLD',
  'AvatarPromotionConfigLD',
  'AvatarEquipRecommendLD',
  'AvatarRelicRecommendLD'
] as const;

export const characterDomainTableNames = [
  'AvatarConfig',
  'AvatarConfigEnhanced',
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
] as const;

export async function loadCharacterDomainTables(
  root: string
): Promise<Record<string, RawRecord[]>> {
  const [regular, additional] = await Promise.all([
    Promise.all(characterDomainTableNames.map((name) => readTable<RawRecord>(root, name))),
    Promise.all(characterLdSourceNames.map((name) => readTable<RawRecord>(root, name)))
  ]);
  const tables = Object.fromEntries(
    characterDomainTableNames.map((name, index) => [name, regular[index]])
  ) as Record<string, RawRecord[]>;
  const additionalByName = new Map(
    characterLdSourceNames.map((name, index) => [name, additional[index]] as const)
  );
  for (const spec of characterLdSourceSpecs) {
    const extra = additionalByName.get(spec.additionalName) ?? [];
    tables[spec.tableName] = mergeConfigSources(
      spec.tableName,
      [
        { name: `${spec.tableName}.json`, rows: tables[spec.tableName] ?? [] },
        { name: `${spec.additionalName}.json`, rows: extra }
      ],
      spec.identityOf
    );
  }
  return tables;
}
