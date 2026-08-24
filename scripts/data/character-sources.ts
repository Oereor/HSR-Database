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
