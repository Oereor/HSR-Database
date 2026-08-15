export type DecimalString = string & { readonly __decimalString: unique symbol };

export type EndgameMode = 'moc' | 'pf' | 'as' | 'aa';
export type EliteGroupTable = 'elite' | 'infinite-elite';
export type EliteContextSource = 'stage' | 'spawn-group' | 'monster-fallback';

export interface EnemyHpFactors {
  hpBase: DecimalString;
  instanceRatio: DecimalString;
  levelRatio: DecimalString;
  eliteRatio: DecimalString;
  configuredMaxHpPerBar: DecimalString;
  eliteGroupId: number;
  eliteGroupTable: EliteGroupTable;
  eliteContextSource: EliteContextSource;
  eliteContextConfidence: 'verified' | 'inferred';
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

export interface SpawnWave {
  waveId: number;
  monsterGroups: SpawnMonsterGroup[];
  maxMonsterCount?: number;
  maxTeammateCount?: number;
  ability?: string;
  params: DecimalString[];
  clearPreviousAbility?: boolean;
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

export interface EndgameGroup {
  mode: EndgameMode;
  groupId: number;
  name?: string;
  schedule?: { begin: string; end: string };
  encounters: EndgameEncounter[];
}

export interface EndgameModeDataset {
  schemaVersion: 14;
  mode: EndgameMode;
  groups: EndgameGroup[];
}

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
