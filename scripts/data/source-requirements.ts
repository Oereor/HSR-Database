import { characterLdSourceNames } from './character-sources.js';

export const DATA_GENERATION_TABLE_NAMES = [
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

export const ENDGAME_TABLE_NAMES = [
  'ScheduleDataChallengeMaze',
  'ScheduleDataGlobal',
  'ChallengeGroupConfig',
  'ChallengeMazeConfig',
  'ChallengeMazeTierce',
  'ScheduleDataChallengeStory',
  'ChallengeStoryGroupConfig',
  'ChallengeStoryMazeConfig',
  'ChallengeStoryMazeTierce',
  'ScheduleDataChallengeBoss',
  'ChallengeBossGroupConfig',
  'ChallengeBossMazeConfig',
  'ChallengeBossMazeTierce',
  'ChallengePeakGroupConfig',
  'ChallengePeakConfig',
  'ChallengePeakBossConfig',
  'PlaneEvent',
  'StageConfig',
  'MonsterConfig',
  'MonsterTemplateConfig',
  'HardLevelGroup',
  'EliteGroup',
  'InfiniteEliteGroup',
  'StageInfiniteGroup',
  'StageInfiniteWaveConfig',
  'StageInfiniteMonsterGroup',
  'ChallengeStoryGroupExtra',
  'ChallengeBossGroupExtra',
  'ChallengeBossMazeExtra',
  'MonsterGuideConfig',
  'MonsterGuideTag',
  'ExtraEffectConfig',
  'MazeBuff',
  'BattleEventConfig'
] as const;

export const CHARACTER_NAME_TABLE_NAMES = [
  'AvatarConfig',
  'AvatarConfigLD',
  'AvatarBaseType',
  'MultiplePathAvatarConfig',
  'FateRinOwner'
] as const;

export const ASSET_REQUIREMENT_TABLE_NAMES = ['AvatarPlayerIcon'] as const;

export const TURN_BASED_DEPLOYMENT_TABLE_NAMES = [
  ...new Set([
    ...DATA_GENERATION_TABLE_NAMES,
    ...characterLdSourceNames,
    ...ENDGAME_TABLE_NAMES,
    ...CHARACTER_NAME_TABLE_NAMES,
    ...ASSET_REQUIREMENT_TABLE_NAMES
  ])
].sort((left, right) => left.localeCompare(right));

export const TURN_BASED_TEXT_MAP_PATHS = [
  'TextMap/TextMapCHS.json',
  'TextMap/TextMapEN.json'
] as const;

export const TURN_BASED_CONFIG_PATHS = [
  'Config/ConfigCharacter/Monster/',
  'Config/ConfigAbility/Monster/',
  'Config/ConfigAbility/BattleEvent/'
] as const;

export const TURN_BASED_DEPLOYMENT_PATHS = [
  ...TURN_BASED_DEPLOYMENT_TABLE_NAMES.map((name) => `ExcelOutput/${name}.json`),
  ...TURN_BASED_TEXT_MAP_PATHS,
  ...TURN_BASED_CONFIG_PATHS
];
