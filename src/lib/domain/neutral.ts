import type { TextHash } from './types.js';
import type { DecimalString } from './endgame.js';
import type { CharacterDetailIconKey } from './character-detail-icons.js';

export type NeutralTextSource =
  | {
      kind: 'direct';
      ref: { kind: 'hash'; hash: TextHash } | { kind: 'symbolic'; key: string; hash?: TextHash };
    }
  | {
      kind: 'parameterized';
      ref: { kind: 'hash'; hash: TextHash } | { kind: 'symbolic'; key: string; hash?: TextHash };
      params: readonly DecimalString[];
    };

export interface NeutralStatGrowth {
  base: number;
  perLevel: number;
}

export interface NeutralPromotionStage {
  fromLevel: number;
  toLevel: number;
  hp: NeutralStatGrowth;
  attack: NeutralStatGrowth;
  defence: NeutralStatGrowth;
}

export interface NeutralStatProgression {
  minLevel: number;
  maxLevel: number;
  defaultLevel: number;
  stages: NeutralPromotionStage[];
  fixed?: Record<string, number>;
  iconKeys?: Partial<Record<'hp' | 'attack' | 'defence' | 'speed', CharacterDetailIconKey>>;
}

export interface NeutralEnergy {
  kind: 'standard' | 'special';
  max: number;
  iconCode?: string;
  iconPath?: string;
}

export interface NeutralSkillLevel {
  level: number;
  descriptionSource?: NeutralTextSource;
  params: readonly DecimalString[];
}

export interface NeutralSkillVariant {
  id: string;
  category: string;
  order: number;
  source: 'avatar' | 'memosprite' | 'avatar-global-buff';
  attackType?: string;
  nameSource?: NeutralTextSource;
  typeSource?: NeutralTextSource;
  visibility?: 'visible' | 'hidden';
  iconPath?: string;
  levels: NeutralSkillLevel[];
  combatLevels?: NeutralSkillCombatLevel[];
  progressionId?: string;
  progressionIconPath?: string;
  progressionPointType?: number;
  extraEffectIds: string[];
}

export interface NeutralSkillCombatLevel {
  level: number;
  effectCode?: string;
  specialResourceSource?: NeutralTextSource;
  bpNeed?: number;
  bpAdd?: number;
  spBase?: number;
  stanceDamageDisplay?: number;
  showStanceList?: readonly DecimalString[];
}

export interface NeutralSkillProgression {
  id: string;
  variantIds: string[];
  availableLevels: number[];
  defaultLevel: number;
}

export interface NeutralTrace {
  id: string;
  type: 'stat' | 'ability';
  propertyType?: string;
  sourcePointType: number;
  prerequisiteIds: string[];
  nameSource?: NeutralTextSource;
  descriptionSource?: NeutralTextSource;
  params: readonly DecimalString[];
  iconPath?: string;
  promotionLimit?: number;
  anchorOrder?: number;
  statDescriptionSource?: NeutralTextSource;
  statValues?: readonly DecimalString[];
  extraEffectIds?: string[];
}

export interface NeutralEidolon {
  id: string;
  rank: number;
  nameSource?: NeutralTextSource;
  descriptionSource?: NeutralTextSource;
  params: readonly DecimalString[];
  extraEffectIds: string[];
  iconPath?: string;
}

export type NeutralSpecialEffectRelation =
  | {
      kind: 'avatar-skill-link';
      skillId: string;
      linkedAvatarIds: string[];
      simplifiedLinkedAvatarIds: string[];
      order?: number;
    }
  | {
      kind: 'servant-skill-link';
      skillId: string;
      order: number;
      linkedAvatarId: string;
      tarotFigurePath: string;
      tarotIconPath: string;
    };

export interface NeutralExtraEffect {
  id: string;
  nameSource?: NeutralTextSource;
  descriptionSource?: NeutralTextSource;
  params: readonly DecimalString[];
  iconPath?: string;
}

export interface NeutralCharacterProfile {
  energy: NeutralEnergy;
  skills: NeutralSkillVariant[];
  traces: NeutralTrace[];
  eidolons: NeutralEidolon[];
  specialEffects: NeutralSpecialEffectRelation[];
}

export interface NeutralEquipmentRecommendation {
  lightConeIds: string[];
  cavernSetIds: string[];
  planarSetIds: string[];
  mainStatOptions: Array<{ slot: string; propertyTypes: string[] }>;
  subStatPropertyTypes: string[];
}

export interface CharacterNamingEvidence {
  avatarName?: NeutralTextSource;
  fullName?: NeutralTextSource;
  baseNameSource?: NeutralTextSource;
}

export interface CharacterDomain {
  id: string;
  baseAvatarId?: string;
  gender?: 'female' | 'male';
  pathCode: string;
  elementCode: string;
  rarity: number;
  stats: NeutralStatProgression;
  equipmentRecommendation: NeutralEquipmentRecommendation;
  naming: CharacterNamingEvidence;
  assetKeys: Record<string, string>;
  descriptionSource?: NeutralTextSource;
  pathNameSource?: NeutralTextSource;
  elementNameSource?: NeutralTextSource;
  profiles: { base: NeutralCharacterProfile; enhanced?: NeutralCharacterProfile };
}

export interface LightConeDomain {
  schemaVersion: 3;
  id: string;
  rarity: number;
  pathCode: string;
  nameSource?: NeutralTextSource;
  itemNameSource?: NeutralTextSource;
  descriptionSource?: NeutralTextSource;
  pathNameSource?: NeutralTextSource;
  stats: NeutralStatProgression;
  passive: {
    id: string;
    nameSource?: NeutralTextSource;
    levels: NeutralSkillLevel[];
  };
  storySource?: NeutralTextSource;
  assetKeys: Record<string, string>;
}

export interface NeutralRelicPiece {
  id: string;
  slot: string;
  slotNameSource?: NeutralTextSource;
  nameSource?: NeutralTextSource;
  descriptionSource?: NeutralTextSource;
}

export interface NeutralRelicEffect {
  required: 2 | 4;
  descriptionSource?: NeutralTextSource;
  params: readonly DecimalString[];
  propertyCodes: string[];
}

export interface RelicSetDomain {
  schemaVersion: 3;
  id: string;
  category: 'cavern' | 'planar';
  pieces: NeutralRelicPiece[];
  effects: NeutralRelicEffect[];
  requirements: Array<2 | 4>;
  propertyCodes: string[];
  releaseVersion?: string;
  assetKeys: Record<string, string>;
  nameSource?: NeutralTextSource;
  sourceLabelSources: NeutralTextSource[];
}
