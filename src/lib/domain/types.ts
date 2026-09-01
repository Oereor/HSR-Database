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

export interface InlineGameTextIcon {
  spriteName: string;
  id: number;
  width?: number;
  height?: number;
}

export interface DescriptionToken {
  type: 'text' | 'scaling-value' | 'icon';
  value: string;
  icon?: InlineGameTextIcon;
  color?: string;
  italic?: boolean;
  underline?: boolean;
  unbreak?: boolean;
}

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

export type SkillStanceDisplayType = 'single' | 'aoe' | 'blast';

export interface SkillStanceDisplay {
  type: SkillStanceDisplayType;
  value: number;
}

export interface ExtraEffect {
  id: string;
  name: string;
  description: string;
}

export type SkillExtraEffect = ExtraEffect;

export interface SkillCombatMeta {
  effect?: SemanticTag;
  specialResource?: string;
  battlePointDelta?: number;
  energyGain?: number;
  stanceDisplay?: SkillStanceDisplay[];
  toughnessDamage?: number;
  extraEffects?: SkillExtraEffect[];
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
  source: 'avatar' | 'memosprite' | 'avatar-global-buff';
  progressionId: string | null;
  scalingParamIndexes: number[];
  levels: LevelledDescription[];
  attackType?: string;
  combatMeta: SkillCombatMeta;
}

export interface AvatarSkillSpecialEffectEntry {
  kind: 'avatar-skill-link';
  skill: SkillVariant;
  linkedAvatarIds: string[];
  simplifiedLinkedAvatarIds: string[];
}

export interface ServantSkillSpecialEffectEntry {
  kind: 'servant-skill-link';
  skill: SkillVariant;
  order: number;
  linkedAvatarId: string;
  tarotFigurePath: string;
  tarotIconPath: string;
}

export type CharacterSpecialEffectEntry =
  AvatarSkillSpecialEffectEntry | ServantSkillSpecialEffectEntry;

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

export interface LightConePassiveSkill {
  id: string;
  name: string;
  superimposition: SuperimpositionEffect;
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
  extraEffects?: SkillExtraEffect[];
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
  extraEffects?: SkillExtraEffect[];
}

export interface CharacterProfile {
  energy: CharacterEnergy;
  skillCards: SkillCard[];
  specialEffects: CharacterSpecialEffectEntry[];
  traces: Trace[];
  eidolons: Eidolon[];
}

export type RelicSlot = 'HEAD' | 'HAND' | 'BODY' | 'FOOT' | 'NECK' | 'OBJECT';
export type RelicSetCategory = 'cavern' | 'planar';
export type RelicEffectRequirement = 2 | 4;

export interface RelicProperty {
  propertyType: string;
  name: string;
  iconKey?: string;
  allowedMainSlots: RelicSlot[];
  canBeSubStat: boolean;
}

export interface RelicMainStatRecommendation {
  slot: Extract<RelicSlot, 'BODY' | 'FOOT' | 'NECK' | 'OBJECT'>;
  propertyTypes: string[];
}

export interface AvatarEquipmentRecommendation {
  avatarId: string;
  lightConeIds: string[];
  cavernSetIds: string[];
  planarSetIds: string[];
  mainStatOptions: RelicMainStatRecommendation[];
  subStatPropertyTypes: string[];
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

export interface EnemyCatalogEntry extends CatalogEntry {
  type: string;
  weaknesses: ElementLabel[];
}

export interface Character extends CatalogEntry {
  kind: 'character';
  fullName?: string;
  profiles: {
    base: CharacterProfile;
    enhanced?: CharacterProfile;
  };
  baseStats: BaseStatProgression;
  equipmentRecommendation: AvatarEquipmentRecommendation;
}

export interface LightCone extends CatalogEntry {
  kind: 'light-cone';
  story?: string;
  passive: LightConePassiveSkill;
  baseStats: BaseStatProgression;
}

export interface RelicCatalogEntry extends CatalogEntry {
  category: RelicSetCategory;
  effectRequirements: RelicEffectRequirement[];
}

export interface RelicSet extends RelicCatalogEntry {
  kind: 'relic';
  effects: Array<{ required: RelicEffectRequirement; description: string }>;
  pieces: Array<{ id: string; slot: RelicSlot; name: string; description: string }>;
  sources: string[];
}

export interface Enemy extends CatalogEntry {
  kind: 'enemy';
  rank: string;
  /** Template-owned identity and base configuration. */
  template: MonsterTemplate;
  /** All concrete MonsterConfig records for this template. */
  monsters: Monster[];
  /** Canonical MonsterID used by the current detail page compatibility view. */
  defaultMonsterId: string;
  defaultMonster: Monster;
  /** @deprecated Endgame compatibility projection; use defaultMonster elsewhere. */
  weaknesses: ElementLabel[];
}

export interface EnemyTemplateBaseStats {
  hp: import('./endgame.js').DecimalString;
  attack: import('./endgame.js').DecimalString;
  defence: import('./endgame.js').DecimalString;
  criticalDamage: import('./endgame.js').DecimalString;
  speed?: import('./endgame.js').DecimalString;
  stance?: import('./endgame.js').DecimalString;
  effectResistance?: import('./endgame.js').DecimalString;
}

/** Data owned by MonsterTemplateConfig, independent of a concrete battle record. */
export interface MonsterTemplate {
  monsterTemplateId: string;
  name: string;
  rank: string;
  baseStats: EnemyTemplateBaseStats;
}

export interface EnemyMonsterStatModifier {
  ratio: import('./endgame.js').DecimalString;
  value?: import('./endgame.js').DecimalString;
}

export interface EnemyMonsterStatModifiers {
  hp: EnemyMonsterStatModifier;
  attack: EnemyMonsterStatModifier;
  defence: EnemyMonsterStatModifier;
  speed: EnemyMonsterStatModifier;
  stance: EnemyMonsterStatModifier;
}

/** Data owned by one MonsterConfig, including its behavior and instance modifiers. */
export interface Monster {
  monsterId: string;
  monsterTemplateId: string;
  hardLevelGroup: string;
  eliteGroup?: string;
  modifiers: EnemyMonsterStatModifiers;
  stats: EnemyStatProgression;
  weaknesses: ElementLabel[];
  resistances: Array<ElementLabel & { value: number }>;
  specialResistances: EnemySpecialResistance[];
  summons: EnemySummonReference[];
  skills: EnemySkill[];
  skillPhases: EnemySkillPhase[];
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
  rank: string;
  weaknesses: ElementLabel[];
  href: string;
}

export type EnemyExtraEffect = SkillExtraEffect;

export interface EnemySkillPhase {
  index: number;
  skillIds: string[];
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

export interface HomepageRecentWarpData {
  schemaVersion: 1;
  avatarUps: Array<{ gachaId: number; avatarId: string }>;
  weaponUps: Array<{ gachaId: number; equipmentId: string }>;
}

export interface DataManifest {
  schemaVersion: number;
  sourceCommit: string;
  sourceVersion: string;
  gameVersionFull: string | null;
  gameVersion: string | null;
  generatedAt: string;
  language: 'CHS';
  counts: Record<'characters' | 'lightCones' | 'relics' | 'relicProperties' | 'enemies', number>;
  routes: Record<'characters' | 'light-cones' | 'relics' | 'enemies', string[]>;
  endgame: import('./endgame.js').EndgameManifestSummary;
}
