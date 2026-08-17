export type EntityKind = 'character' | 'light-cone' | 'relic' | 'enemy';

declare const textHashBrand: unique symbol;

/** A validated decimal TextMap identifier that never passes through JavaScript `number`. */
export type TextHash = string & { readonly [textHashBrand]: 'TextHash' };

export function parseTextHash(value: unknown): TextHash | undefined {
  return typeof value === 'string' && /^\d+$/.test(value) ? (value as TextHash) : undefined;
}

export interface TextReference {
  Hash: TextHash;
}

export type DescriptionToken =
  { type: 'text'; value: string } | { type: 'scaling-value'; value: string };

export interface LevelledDescription {
  level: number;
  description: string;
  descriptionTokens: DescriptionToken[];
  params: number[];
}

export interface Skill {
  id: string;
  name: string;
  type?: string;
  scalingParamIndexes: number[];
  levels: LevelledDescription[];
}

export type SkillCategory =
  | 'basic'
  | 'skill'
  | 'ultimate'
  | 'talent'
  | 'technique'
  | 'memosprite-skill'
  | 'memosprite-talent'
  | 'elation-skill'
  | 'assist';

export type KnownSkillEffect =
  | 'SingleAttack'
  | 'Blast'
  | 'AoEAttack'
  | 'Bounce'
  | 'Enhance'
  | 'Impair'
  | 'Support'
  | 'Defence'
  | 'Restore'
  | 'Summon'
  | 'MazeAttack';

export interface SkillCombatMeta {
  effect?: SemanticTag;
  specialResource?: string;
  battlePointDelta?: number;
  energyGain?: number;
  toughnessDamage?: number;
}

export interface SemanticTag {
  code: string;
  label: string;
  known: boolean;
}

export interface SkillVariant {
  id: string;
  name: string;
  type?: string;
  order: number;
  source: 'avatar' | 'memosprite';
  progressionId: string | null;
  scalingParamIndexes: number[];
  levels: LevelledDescription[];
  attackType?: string;
  combatMeta: SkillCombatMeta;
}

export interface SkillProgression {
  id: string;
  availableLevels: number[];
  defaultLevel: number;
  variantIds: string[];
}

export interface SkillCard {
  category: SkillCategory;
  displayLabel: string;
  order: number;
  progressions: SkillProgression[];
  variants: SkillVariant[];
}

export interface SuperimpositionEffect {
  scalingParamIndexes: number[];
  levels: LevelledDescription[];
}

export type TraceType = 'stat' | 'ability';

export interface Trace {
  id: string;
  name: string;
  description: string;
  type: TraceType;
  sourcePointType: number;
  prerequisiteIds: string[];
  promotionLimit?: number;
  anchorOrder: number;
}

export interface StatGrowth {
  base: number;
  perLevel: number;
}

export interface PromotionStage {
  fromLevel: number;
  toLevel: number;
  hp: StatGrowth;
  attack: StatGrowth;
  defence: StatGrowth;
}

export interface BaseStatProgression {
  minLevel: number;
  maxLevel: number;
  defaultLevel: number;
  stages: PromotionStage[];
  fixed?: {
    speed?: number;
    criticalChance?: number;
    criticalDamage?: number;
    aggro?: number;
  };
}

export type CharacterEnergy = { kind: 'standard'; max: number } | { kind: 'special'; max: 0 };

export interface Eidolon {
  id: string;
  rank: number;
  name: string;
  description: string;
}

export interface CharacterProfile {
  energy: CharacterEnergy;
  skillCards: SkillCard[];
  traces: Trace[];
  eidolons: Eidolon[];
}

export interface ElementLabel {
  element: string;
  name: string;
}

export interface CatalogEntry {
  id: string;
  name: string;
  description?: string;
  rarity?: number;
  path?: string;
  pathName?: string;
  element?: string;
  elementName?: string;
  version?: string;
  type?: string;
  typeName?: string;
}

export interface Character extends CatalogEntry {
  kind: 'character';
  fullName?: string;
  profiles: {
    base: CharacterProfile;
    enhanced?: CharacterProfile;
  };
  baseStats: BaseStatProgression;
}

export interface LightCone extends CatalogEntry {
  kind: 'light-cone';
  story?: string;
  superimposition: SuperimpositionEffect;
  baseStats: BaseStatProgression;
}

export interface RelicSet extends CatalogEntry {
  kind: 'relic';
  effects: Array<{ required: number; description: string }>;
  pieces: Array<{ type: string; name: string; description: string }>;
  sources: string[];
}

export interface Enemy extends CatalogEntry {
  kind: 'enemy';
  rank: string;
  stats: EnemyStatProgression;
  weaknesses: ElementLabel[];
  resistances: Array<ElementLabel & { value: number }>;
  specialResistances: EnemySpecialResistance[];
  summons: EnemySummonReference[];
  skills: EnemySkill[];
}

export type EnemyStatValue =
  | { status: 'resolved'; value: import('./endgame.js').DecimalString }
  | { status: 'unavailable'; reason: 'missing-base' | 'invalid-reference' };

export interface EnemyLevelStats {
  level: number;
  hp: EnemyStatValue;
  attack: EnemyStatValue;
  defence: EnemyStatValue;
  speed: EnemyStatValue;
  toughness: EnemyStatValue;
  effectHit: EnemyStatValue;
  effectResistance: EnemyStatValue;
}

export interface EnemyStatProgression {
  minLevel: number;
  maxLevel: number;
  defaultLevel: number;
  levels: EnemyLevelStats[];
}

export interface EnemySpecialResistance {
  code: string;
  label: string;
  value: import('./endgame.js').DecimalString;
}

export interface EnemySummonReference {
  monsterId: string;
  monsterTemplateId: string;
  name: string;
  href: string;
}

export interface EnemyExtraEffect {
  id: string;
  name: string;
  description: string;
}

export interface EnemySkill {
  id: string;
  name: string;
  description: string;
  kind: 'skill' | 'talent' | 'unknown';
  tag: SemanticTag;
  damageType?: ElementLabel;
  phases: number[];
  extraEffects: EnemyExtraEffect[];
}

export interface SearchEntry {
  id: string;
  kind: EntityKind;
  name: string;
  href: string;
  aliases: string[];
  meta?: string;
}

export interface DataManifest {
  schemaVersion: number;
  sourceCommit: string;
  sourceVersion: string;
  generatedAt: string;
  language: 'CHS';
  counts: Record<'characters' | 'lightCones' | 'relics' | 'enemies', number>;
  routes: Record<'characters' | 'light-cones' | 'relics' | 'enemies', string[]>;
  endgame: import('./endgame.js').EndgameManifestSummary;
}
