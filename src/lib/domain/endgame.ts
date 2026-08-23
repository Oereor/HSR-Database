import type { ExtraEffect } from './types';

export type DecimalString = string & { readonly __decimalString: unique symbol };

export type EndgameMode = 'moc' | 'pf' | 'as' | 'aa';
export type EliteGroupTable = 'elite' | 'infinite-elite';
export type EliteContextSource = 'stage' | 'spawn-group' | 'monster-fallback';

/** Low-level parsed MazeBuff data. Gameplay ownership stays in each mode model below. */
export interface ResolvedMazeBuff {
  id: number;
  name?: string;
  nameHash?: string;
  description?: string;
  descriptionHash?: string;
  params: DecimalString[];
  upstreamIconPath?: string;
  bindingKey?: string;
}

/** Thin config provenance for audit/debugging; it intentionally carries no gameplay meaning. */
export interface EndgameConfigProvenance {
  table:
    | 'ChallengeGroupConfig'
    | 'ChallengeMazeConfig'
    | 'ChallengeStoryGroupConfig'
    | 'ChallengeStoryMazeConfig'
    | 'ChallengeStoryGroupExtra'
    | 'ChallengeBossGroupConfig'
    | 'ChallengeBossMazeConfig'
    | 'ChallengeBossGroupExtra'
    | 'ChallengeBossMazeExtra'
    | 'MonsterGuideConfig'
    | 'ChallengePeakConfig'
    | 'ChallengePeakBossConfig'
    | 'StageConfig';
  ownerId: number;
  field: string;
  arrayIndex?: number;
}

export type EnemyHpFinalResolution =
  | {
      status: 'resolved';
      maxHpPerBar: DecimalString;
      source: 'base-encounter' | 'pure-fiction-wave';
      rounding: 'display-half-up' | 'half-up' | 'truncate';
    }
  | {
      status: 'unresolved';
      reason:
        | 'pf-ability-without-params'
        | 'pf-params-without-ability'
        | 'unsupported-pf-wave-ability'
        | 'invalid-pf-wave-param-count'
        | 'invalid-pf-hp-added-ratio';
    };

export interface EnemyHpFactors {
  hpBase: DecimalString;
  instanceRatio: DecimalString;
  levelRatio: DecimalString;
  eliteRatio: DecimalString;
  baseEncounterMaxHpPerBar: DecimalString;
  final: EnemyHpFinalResolution;
  eliteGroupId: number;
  eliteGroupTable: EliteGroupTable;
  eliteContextSource: EliteContextSource;
  eliteContextConfidence: 'verified' | 'inferred';
}

export type PureFictionHpModifier =
  | {
      status: 'resolved';
      source: 'identity';
      hpAddedRatio: DecimalString;
      totalRatio: DecimalString;
    }
  | {
      status: 'resolved';
      source: 'wave-ability';
      ability: 'FantasticStory_Wave_Ability_0001';
      hpAddedRatio: DecimalString;
      totalRatio: DecimalString;
      paramIndex: 1;
    }
  | {
      status: 'unresolved';
      reason: Extract<EnemyHpFinalResolution, { status: 'unresolved' }>['reason'];
      ability?: string;
    };

export type PureFictionMechanicEvidence =
  | {
      status: 'resolved';
      bindingKey: string;
      sourceMazeBuffId: number;
    }
  | {
      status: 'unconfirmed';
      reason:
        | 'missing-group-extra'
        | 'missing-binding-key'
        | 'missing-core-maze-buff'
        | 'ability-body-missing'
        | 'mechanic-marker-missing'
        | 'percentage-expression-unresolved';
      bindingKey?: string;
      sourceMazeBuffId?: number;
    };

export interface PureFictionWaveMechanic {
  hpModifier: PureFictionHpModifier;
  rounding: {
    ordinary: 'half-up';
    leader: 'truncate';
    leaderRanks: readonly ['LittleBoss', 'BigBoss'];
  };
  hpParentChild: PureFictionMechanicEvidence;
  killTransfer: PureFictionMechanicEvidence & { percentage?: DecimalString };
}

export type EnemyStatUnavailableReason = 'missing-base' | 'invalid-reference';

export type ResolvedEnemyStat =
  | {
      status: 'resolved';
      base: DecimalString;
      instanceRatio: DecimalString;
      instanceValue: DecimalString;
      levelRatio: DecimalString;
      eliteRatio: DecimalString;
      configuredValue: DecimalString;
    }
  | {
      status: 'unavailable';
      reason: EnemyStatUnavailableReason;
    };

export type ResolvedInternalStance =
  | {
      status: 'resolved';
      baseInternal: DecimalString;
      instanceRatio: DecimalString;
      instanceValueInternal: DecimalString;
      hardLevelRatio: DecimalString;
      eliteRatio: DecimalString;
      resolvedInternal: DecimalString;
    }
  | {
      status: 'unavailable';
      reason: EnemyStatUnavailableReason;
    };

export type EnemyToughnessDisplay =
  | { status: 'resolved'; perBar: DecimalString }
  | {
      status: 'unavailable';
      reason: EnemyStatUnavailableReason | 'non-terminating-unit-conversion';
    };

export interface EnemyToughnessStat {
  internalStance: ResolvedInternalStance;
  display: EnemyToughnessDisplay;
  barCount?: number;
  runtimeStatus: 'static' | 'runtime-unclear';
}

export interface EnemyMechanics {
  phaseCount?: number;
  summons: number[];
  sharedHp: boolean;
  restoresHp: boolean;
  locksHp: boolean;
  manipulatesHp: boolean;
  characterConfig?: string;
  abilityConfig?: string;
  abilityReferences: string[];
  effectiveTotalHp?: DecimalString;
  effectiveTotalHpStatus: 'static' | 'inferred' | 'runtime-unclear';
}

export interface EnemyOccurrence {
  monsterId: number;
  monsterTemplateId: number;
  name?: string;
  hp: EnemyHpFactors;
  speed: ResolvedEnemyStat;
  toughness: EnemyToughnessStat;
  mechanics: EnemyMechanics;
}

export interface FixedWave {
  wave: number;
  enemies: EnemyOccurrence[];
}

export interface FixedWaveModel {
  kind: 'fixed';
  waves: FixedWave[];
}

export interface SpawnMonsterGroup {
  monsterGroupId: number;
  orderedEnemies: EnemyOccurrence[];
}

export type SpawnWaveParam =
  DecimalString | { status: 'invalid'; reason: 'missing-decimal-value' | 'invalid-decimal-value' };

export interface SpawnWave {
  waveId: number;
  monsterGroups: SpawnMonsterGroup[];
  maxMonsterCount?: number;
  maxTeammateCount?: number;
  ability?: string;
  params: SpawnWaveParam[];
  clearPreviousAbility?: boolean;
  pureFictionMechanic?: PureFictionWaveMechanic;
}

export interface SpawnSequenceWaveModel {
  kind: 'spawn-sequence';
  waveGroupId: number;
  waves: SpawnWave[];
}

export type EndgameWaveModel = FixedWaveModel | SpawnSequenceWaveModel;

export interface EndgameStage {
  eventId: number;
  stageId: number;
  level: number;
  hardLevelGroup: number;
  stageAbilities: string[];
  previewMonsterIds: number[];
  waveModel: EndgameWaveModel;
}

export interface EndgameBattleSlot {
  slot: number;
  stages: EndgameStage[];
}

export type EndgameEncounterVariant = 'floor' | 'preliminary' | 'boss-normal' | 'boss-hard';

export interface EndgameEncounter {
  id: string;
  configId: number;
  name?: string;
  ordinal?: number;
  variant: EndgameEncounterVariant;
  battles: EndgameBattleSlot[];
}

export interface MocMemoryTurbulence {
  buff: ResolvedMazeBuff;
  provenance: EndgameConfigProvenance;
  groupReference?: {
    mazeBuffId: number;
    provenance: EndgameConfigProvenance;
  };
}

export interface MocEncounter extends EndgameEncounter {
  memoryTurbulence?: MocMemoryTurbulence;
}

export interface PureFictionBaseMechanic {
  mazeBuffId: number;
  display?: ResolvedMazeBuff;
  provenance: EndgameConfigProvenance;
}

export interface PureFictionBattleWillMechanic {
  buff: ResolvedMazeBuff;
  provenance: EndgameConfigProvenance;
}

export interface PureFictionCacophonyOption {
  order: number;
  buff: ResolvedMazeBuff;
  provenance: EndgameConfigProvenance;
}

export interface PureFictionCacophony {
  key: string;
  selectCount: 1;
  options: PureFictionCacophonyOption[];
  provenance: EndgameConfigProvenance;
}

export interface PureFictionEncounter extends EndgameEncounter {
  baseMechanic?: PureFictionBaseMechanic;
}

export interface ApocalypticShadowStageBinding {
  slot: number;
  eventId: number;
  stageId: number;
  mazeBuffId: number;
  provenance: EndgameConfigProvenance;
}

export interface ApocalypticShadowAftertaste {
  buff: ResolvedMazeBuff;
  provenance: EndgameConfigProvenance;
  groupReference?: {
    mazeBuffId: number;
    provenance: EndgameConfigProvenance;
  };
  stageBindings: ApocalypticShadowStageBinding[];
}

export interface ApocalypticShadowAxiomOption {
  order: number;
  buff: ResolvedMazeBuff;
  provenance: EndgameConfigProvenance;
}

export interface ApocalypticShadowAxiomSet {
  key: string;
  slot: number;
  selectCount: 1;
  options: ApocalypticShadowAxiomOption[];
  provenance: EndgameConfigProvenance;
}

export interface ApocalypticShadowBossTrait {
  tagId: number;
  order: number;
  requiredDifficulty: number;
  name: string;
  nameHash?: string;
  description: string;
  descriptionHash?: string;
  params: DecimalString[];
  linkedEffects: ExtraEffect[];
  provenance: EndgameConfigProvenance;
}

export interface ApocalypticShadowSlotGuide {
  key: string;
  slot: number;
  guideMonsterId: number;
  difficulty: number;
  traits: ApocalypticShadowBossTrait[];
  provenance: EndgameConfigProvenance;
}

export interface ApocalypticShadowEncounter extends EndgameEncounter {
  aftertaste?: ApocalypticShadowAftertaste;
  bossGuides: ApocalypticShadowSlotGuide[];
}

export interface AnomalyArbitrationTrait {
  buff: ResolvedMazeBuff;
  provenance: EndgameConfigProvenance;
}

export interface AnomalyArbitrationQuadrantOption {
  order: number;
  buff: ResolvedMazeBuff;
  provenance: EndgameConfigProvenance;
}

export interface AnomalyArbitrationJudgmentQuadrant {
  key: string;
  bossConfigId: number;
  selectCount: 1;
  options: AnomalyArbitrationQuadrantOption[];
  provenance: EndgameConfigProvenance;
}

export interface AnomalyArbitrationEncounter extends EndgameEncounter {
  traits: AnomalyArbitrationTrait[];
  judgmentQuadrantKey?: string;
}

interface EndgameGroupBase<TMode extends EndgameMode, TEncounter extends EndgameEncounter> {
  mode: TMode;
  groupId: number;
  name?: string;
  schedule?: { begin: string; end: string };
  encounters: TEncounter[];
}

export type MocGroup = EndgameGroupBase<'moc', MocEncounter>;

export interface PureFictionGroup extends EndgameGroupBase<'pf', PureFictionEncounter> {
  groupBaseMechanic?: PureFictionBaseMechanic;
  battleWillMechanics: PureFictionBattleWillMechanic[];
  cacophony?: PureFictionCacophony;
}

export interface ApocalypticShadowGroup extends EndgameGroupBase<'as', ApocalypticShadowEncounter> {
  axiomSets: ApocalypticShadowAxiomSet[];
}

export interface AnomalyArbitrationGroup extends EndgameGroupBase<
  'aa',
  AnomalyArbitrationEncounter
> {
  judgmentQuadrant?: AnomalyArbitrationJudgmentQuadrant;
}

export type EndgameGroup =
  MocGroup | PureFictionGroup | ApocalypticShadowGroup | AnomalyArbitrationGroup;

interface EndgameModeDatasetBase<TMode extends EndgameMode, TGroup extends EndgameGroup> {
  schemaVersion: 22;
  mode: TMode;
  groups: TGroup[];
}

export type MocModeDataset = EndgameModeDatasetBase<'moc', MocGroup>;
export type PureFictionModeDataset = EndgameModeDatasetBase<'pf', PureFictionGroup>;
export type ApocalypticShadowModeDataset = EndgameModeDatasetBase<'as', ApocalypticShadowGroup>;
export type AnomalyArbitrationModeDataset = EndgameModeDatasetBase<'aa', AnomalyArbitrationGroup>;

export interface EndgameDatasetByMode {
  moc: MocModeDataset;
  pf: PureFictionModeDataset;
  as: ApocalypticShadowModeDataset;
  aa: AnomalyArbitrationModeDataset;
}

export type EndgameModeDataset = EndgameDatasetByMode[EndgameMode];

export interface EndgameModeSummary {
  groups: number;
  encounters: number;
  battleSlots: number;
  stages: number;
  occurrences: number;
}

export interface EndgameManifestSummary {
  modes: Record<EndgameMode, EndgameModeSummary>;
}
