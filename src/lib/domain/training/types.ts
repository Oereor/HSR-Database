export type ItemId = string;
export type Cost = Record<ItemId, number>;
export type ProgressionKey = string;

export interface PromotionCostStage {
  promotion: number;
  maxLevel: number;
  cost: Cost;
}

export interface TrainingStep {
  level: number;
  requiredPromotion: number;
  cost: Cost;
}

export interface TrainingSkillBinding {
  skillId: string;
  category: string;
  source: 'avatar' | 'memosprite';
  displayLevels: number[];
}

export interface TrainingNode {
  key: ProgressionKey;
  pointId: string;
  pointType: number;
  kind: 'skill' | 'trace' | 'default' | 'fixed';
  defaultUnlock: boolean;
  maxLevel: number;
  prerequisiteIds: string[];
  linkedSkillIds: string[];
  bindings: TrainingSkillBinding[];
  steps: TrainingStep[];
}

export interface CharacterTrainingProfile {
  avatarId: string;
  enhancedId: number;
  nodes: TrainingNode[];
}

export interface CharacterTrainingData {
  schemaVersion: 1;
  avatarId: string;
  expGroup: string;
  promotions: PromotionCostStage[];
  profiles: CharacterTrainingProfile[];
}

export interface LightConeTrainingData {
  schemaVersion: 1;
  equipmentId: string;
  expGroup: string;
  promotions: PromotionCostStage[];
}

export interface MaterialIdentity {
  id: ItemId;
  mainType: string;
  subType: string;
  rarity: string;
  iconKey: string;
}

export interface MaterialView extends MaterialIdentity {
  name: string;
}

export interface MaterialCatalog {
  schemaVersion: 1;
  locale: 'zh-CN' | 'en';
  materials: MaterialView[];
}

export interface MaterialDetail {
  id: ItemId;
  description?: string;
  backgroundDescription?: string;
}

export interface MaterialDetailCatalog {
  schemaVersion: 1;
  locale: 'zh-CN' | 'en';
  materials: MaterialDetail[];
}

export interface TrainingSharedData {
  schemaVersion: 1;
  characterExp: Record<string, number[]>;
  lightConeExp: Record<string, number[]>;
  materials: MaterialIdentity[];
  characterExpItems: Array<{ itemId: ItemId; exp: number }>;
  lightConeExpItems: Array<{ itemId: ItemId; exp: number; creditCost: number }>;
  characterExpCreditDivisor: number;
}

export interface CharacterTrainingTarget {
  avatarId: string;
  enhancedId: number;
  level: number;
  trainingLevels?: Record<ProgressionKey, number>;
  activeTraceIds?: string[];
}

export interface LightConeTrainingTarget {
  equipmentId: string;
  level: number;
}

export interface ResolvedSkillTraining {
  key: ProgressionKey;
  paidMaxLevel: number;
  requiredPromotion: number;
  trainingLevel: number;
}

export interface CostSourceStep {
  source: 'promotion' | 'skill' | 'trace';
  promotion?: number;
  key?: ProgressionKey;
  level?: number;
  cost: Cost;
}

export interface ExpConversion {
  strategy: 'descending-exp-greedy';
  requiredExp: number;
  suppliedExp: number;
  overflowExp: number;
  expItemCost: Cost;
  expItems: Array<{ itemId: ItemId; exp: number; count: number; suppliedExp: number }>;
}

export interface TrainingExpCosts extends ExpConversion {
  expCreditCost: Cost;
}

export interface TrainingCosts extends TrainingExpCosts {
  promotionCost: Cost;
  skillCost: Cost;
  traceCost: Cost;
  totalKnownCost: Cost;
  totalCost: Cost;
  steps: CostSourceStep[];
  precision: {
    requiredExp: 'exact-from-configuration';
    knownCosts: 'exact-from-configuration';
    expItemConsumption: 'exact-under-greedy-strategy';
    expCreditCost: 'exact-under-greedy-strategy';
  };
}

export interface CharacterTrainingResult extends TrainingCosts {
  target: Required<CharacterTrainingTarget> & { promotion: number };
  skills: ResolvedSkillTraining[];
}

export interface LightConeTrainingResult extends TrainingCosts {
  target: LightConeTrainingTarget & { promotion: number };
}

export type TraceTransition =
  | { ok: true; activeTraceIds: string[] }
  | {
      ok: false;
      activeTraceIds: string[];
      error: { code: 'promotion-required' | 'non-activatable-prerequisite'; pointIds: string[] };
    };
