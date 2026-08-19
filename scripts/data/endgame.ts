import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import type {
  DecimalString,
  EliteContextSource,
  EliteGroupTable,
  EndgameBattleSlot,
  EndgameEncounter,
  EndgameGroup,
  EndgameManifestSummary,
  EndgameMode,
  EndgameModeDataset,
  EndgameStage,
  EnemyMechanics,
  EnemyOccurrence,
  PureFictionMechanicEvidence,
  PureFictionWaveMechanic,
  ResolvedInternalStance,
  ResolvedEnemyStat,
  SpawnWave,
  SpawnWaveParam
} from '../../src/lib/domain/endgame.js';
import type { TextResolver, TextSource } from './localization.js';
import {
  compareDecimals,
  decimalEquals,
  decimalOf,
  internalStanceToToughness,
  isWholeDecimal,
  multiplyDecimals,
  parseDecimal
} from './decimal.js';
import { resolveEnemyConfiguredStat, resolveEnemyInternalStance } from './enemy-stats.js';
import { readRaw, readTable } from './raw.js';
import { resolvePureFictionFinalHp, resolvePureFictionHpModifier } from './pure-fiction-hp.js';

type Id = number;

interface HashRef {
  Hash: string;
}

interface ChallengeGroupRow {
  GroupID: Id;
  GroupName?: HashRef;
  ScheduleDataID?: Id;
  TierceID?: Id;
  MazeBuffID?: Id;
}

interface ChallengeConfigRow {
  ID: Id;
  GroupID: Id;
  Name?: HashRef;
  Floor?: number;
  EventIDList1?: Id[];
  EventIDList2?: Id[];
  MazeBuffID?: Id;
}

interface ChallengeStoryGroupExtraRow {
  GroupID: Id;
  SubMazeBuffList?: Id[];
}

interface MazeBuffRow {
  ID: Id;
  InBattleBindingKey?: string;
  ParamList?: unknown[];
}

interface TierceRow {
  PHFMCACHFIJ: Id;
  DLCKKJFMJOB: Id;
  HFIAAGAKFMD?: Id[];
}

interface ScheduleRow {
  ID: Id;
  BeginTime: string;
  EndTime: string;
}

interface PlaneEventRow {
  EventID: Id;
  StageID?: Id;
}

interface StageDataEntry {
  BFLIFKBEOPJ?: string;
  MNDFOPKBHKP?: string;
}

interface StageRow {
  StageID: Id;
  HardLevelGroup: Id;
  Level: number;
  EliteGroup?: Id;
  StageAbilityConfig?: unknown[];
  StageConfigData?: StageDataEntry[];
  MonsterList?: Array<Record<string, Id>>;
}

interface MonsterRow {
  MonsterID: Id;
  MonsterTemplateID: Id;
  HPModifyRatio: unknown;
  SpeedModifyRatio?: unknown;
  SpeedModifyValue?: unknown;
  StanceModifyRatio?: unknown;
  StanceModifyValue?: unknown;
  EliteGroup?: Id;
  SummonIDList?: Id[];
}

interface MonsterTemplateRow {
  MonsterTemplateID: Id;
  MonsterName?: HashRef;
  HPBase: unknown;
  SpeedBase?: unknown;
  StanceBase?: unknown;
  StanceCount?: number;
  JsonConfig?: string;
  AIPath?: string;
  Rank?: string;
}

interface HardLevelRow {
  HardLevelGroup: Id;
  Level: number;
  HPRatio: unknown;
  SpeedRatio: unknown;
  StanceRatio: unknown;
}

interface EliteRow {
  EliteGroup: Id;
  HPRatio: unknown;
  SpeedRatio: unknown;
  StanceRatio: unknown;
}

interface InfiniteGroupRow {
  WaveGroupID: Id;
  WaveIDList?: Id[];
}

interface InfiniteWaveRow {
  InfiniteWaveID: Id;
  MonsterGroupIDList?: Id[];
  MaxMonsterCount?: number;
  MaxTeammateCount?: number;
  Ability?: string;
  ParamList?: unknown[];
  ClearPreviousAbility?: boolean;
}

interface InfiniteMonsterGroupRow {
  InfiniteMonsterGroupID: Id;
  MonsterList?: Id[];
  EliteGroup: Id;
}

interface PeakGroupRow {
  ID: Id;
  Title?: HashRef;
  PreLevelIDList?: Id[];
  BossLevelID: Id;
}

interface PeakConfigRow {
  ID: Id;
  Title?: HashRef;
  EventIDList?: Id[];
}

interface PeakBossRow {
  ID: Id;
  HardTitle?: HashRef;
  HardEventIDList?: Id[];
}

export interface EndgameDiagnosticSample {
  code: string;
  message: string;
  context: Record<string, string | number | undefined>;
}

export interface EndgameAudit {
  coreErrors: { count: number; samples: EndgameDiagnosticSample[] };
  warnings: { count: number; samples: EndgameDiagnosticSample[] };
  inferredMonsterEliteFallbacks: number;
  mechanics: {
    characterConfigsMissing: number;
    abilityConfigsMissing: number;
  };
  stanceConversion: {
    totalOccurrences: number;
    resolvedInternal: number;
    missingInternal: number;
    resolvedDisplay: number;
    nonDivisibleByThree: number;
    conversionUnavailable: number;
    multiBarOccurrences: number;
    nonPositiveDisplay: number;
    minDisplayed?: DecimalString;
    maxDisplayed?: DecimalString;
    samples: Array<{
      mode: EndgameMode;
      monsterId: number;
      monsterTemplateId: number;
      name?: string;
      resolvedInternal?: DecimalString;
      displayedPerBar?: DecimalString;
      reason: string;
    }>;
  };
  summary: EndgameManifestSummary;
}

export interface EndgameBuildResult {
  datasets: Record<EndgameMode, EndgameModeDataset>;
  audit: EndgameAudit;
}

const SCHEMA_VERSION = 18 as const;
const MODES: EndgameMode[] = ['moc', 'pf', 'as', 'aa'];
const MAX_SAMPLES = 20;
const PF_ROUNDING_METADATA = {
  ordinary: 'half-up',
  leader: 'truncate',
  leaderRanks: ['LittleBoss', 'BigBoss']
} as const;

function integer(value: unknown, context: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`${context} 不是安全整数：${String(value)}`);
  return result;
}

export function buildUniqueIndex<T>(
  rows: readonly T[],
  keyOf: (row: T) => string | number,
  label: string
): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    const key = String(keyOf(row));
    if (result.has(key)) throw new Error(`${label} 存在重复键：${key}`);
    result.set(key, row);
  }
  return result;
}

function groupBy<T>(rows: readonly T[], keyOf: (row: T) => string | number): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const key = String(keyOf(row));
    result.set(key, [...(result.get(key) ?? []), row]);
  }
  return result;
}

class Diagnostics {
  private readonly warningKeys = new Set<string>();
  readonly warnings: EndgameDiagnosticSample[] = [];
  warningCount = 0;
  inferredMonsterEliteFallbacks = 0;
  characterConfigsMissing = 0;
  abilityConfigsMissing = 0;

  fail(code: string, message: string, context: EndgameDiagnosticSample['context']): never {
    const rendered = Object.entries(context)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
    throw new Error(`[Endgame:${code}] ${message}${rendered ? ` (${rendered})` : ''}`);
  }

  warn(code: string, message: string, context: EndgameDiagnosticSample['context']): void {
    const key = JSON.stringify([code, context]);
    if (this.warningKeys.has(key)) return;
    this.warningKeys.add(key);
    this.warningCount += 1;
    if (this.warnings.length < MAX_SAMPLES) this.warnings.push({ code, message, context });
  }
}

interface Tables {
  schedules: Record<'moc' | 'pf' | 'as', ScheduleRow[]>;
  groups: Record<'moc' | 'pf' | 'as', ChallengeGroupRow[]>;
  configs: Record<'moc' | 'pf' | 'as', ChallengeConfigRow[]>;
  tierces: Record<'moc' | 'pf' | 'as', TierceRow[]>;
  peakGroups: PeakGroupRow[];
  peakConfigs: PeakConfigRow[];
  peakBosses: PeakBossRow[];
  planeEvents: PlaneEventRow[];
  stages: StageRow[];
  monsters: MonsterRow[];
  templates: MonsterTemplateRow[];
  hardLevels: HardLevelRow[];
  elites: EliteRow[];
  infiniteElites: EliteRow[];
  infiniteGroups: InfiniteGroupRow[];
  infiniteWaves: InfiniteWaveRow[];
  infiniteMonsterGroups: InfiniteMonsterGroupRow[];
  storyGroupExtras: ChallengeStoryGroupExtraRow[];
  mazeBuffs: MazeBuffRow[];
}

async function loadTables(root: string): Promise<Tables> {
  const names = [
    'ScheduleDataChallengeMaze',
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
    'MazeBuff'
  ] as const;
  const loaded = await Promise.all(names.map((name) => readTable(root, name)));
  const table = Object.fromEntries(names.map((name, index) => [name, loaded[index]])) as Record<
    (typeof names)[number],
    never[]
  >;
  return {
    schedules: {
      moc: table.ScheduleDataChallengeMaze,
      pf: table.ScheduleDataChallengeStory,
      as: table.ScheduleDataChallengeBoss
    },
    groups: {
      moc: table.ChallengeGroupConfig,
      pf: table.ChallengeStoryGroupConfig,
      as: table.ChallengeBossGroupConfig
    },
    configs: {
      moc: table.ChallengeMazeConfig,
      pf: table.ChallengeStoryMazeConfig,
      as: table.ChallengeBossMazeConfig
    },
    tierces: {
      moc: table.ChallengeMazeTierce,
      pf: table.ChallengeStoryMazeTierce,
      as: table.ChallengeBossMazeTierce
    },
    peakGroups: table.ChallengePeakGroupConfig,
    peakConfigs: table.ChallengePeakConfig,
    peakBosses: table.ChallengePeakBossConfig,
    planeEvents: table.PlaneEvent,
    stages: table.StageConfig,
    monsters: table.MonsterConfig,
    templates: table.MonsterTemplateConfig,
    hardLevels: table.HardLevelGroup,
    elites: table.EliteGroup,
    infiniteElites: table.InfiniteEliteGroup,
    infiniteGroups: table.StageInfiniteGroup,
    infiniteWaves: table.StageInfiniteWaveConfig,
    infiniteMonsterGroups: table.StageInfiniteMonsterGroup,
    storyGroupExtras: table.ChallengeStoryGroupExtra,
    mazeBuffs: table.MazeBuff
  };
}

interface MechanicsScan {
  phaseCount?: number;
  sharedHp: boolean;
  restoresHp: boolean;
  locksHp: boolean;
  manipulatesHp: boolean;
  manipulatesStance: boolean;
  characterConfig?: string;
  abilityConfig?: string;
  abilityReferences: string[];
  complete: boolean;
}

const STANCE_RUNTIME_OPERATION_TYPES = new Set([
  'RPG.GameCore.LockStance',
  'RPG.GameCore.ResetStance',
  'RPG.GameCore.SetBossHPStanceChangeType',
  'RPG.GameCore.SetStanceCount',
  'RPG.GameCore.TriggerStanceCountDown'
]);

function collectOperationTypes(value: unknown, result: string[]): void {
  if (Array.isArray(value)) {
    for (const child of value) collectOperationTypes(child, result);
  } else if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    if (typeof row.$type === 'string') result.push(row.$type);
    for (const child of Object.values(row)) collectOperationTypes(child, result);
  }
}

function collectAbilityReferences(config: Record<string, unknown>): string[] {
  const values: string[] = [];
  for (const item of Array.isArray(config.AbilityList) ? config.AbilityList : [])
    if (typeof item === 'string' && item) values.push(item);
  for (const skill of Array.isArray(config.SkillAbilityList) ? config.SkillAbilityList : []) {
    if (!skill || typeof skill !== 'object') continue;
    for (const item of Array.isArray((skill as Record<string, unknown>).AbilityList)
      ? ((skill as Record<string, unknown>).AbilityList as unknown[])
      : [])
      if (typeof item === 'string' && item) values.push(item);
  }
  return [...new Set(values)].sort();
}

function companionAbilityPath(characterConfig: string): string {
  return characterConfig
    .replace('Config/ConfigCharacter/Monster/', 'Config/ConfigAbility/Monster/')
    .replace('_Config', '_Ability');
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function buildEndgameData(
  root: string,
  text: TextResolver
): Promise<EndgameBuildResult> {
  const tables = await loadTables(root);
  const diagnostics = new Diagnostics();
  const context = (mode: EndgameMode, extra: Record<string, string | number | undefined>) => ({
    mode,
    ...extra
  });
  const localized = (
    ref: unknown,
    entity: string,
    id: number,
    field: string
  ): string | undefined => {
    const source: TextSource = { entity, id: String(id), field };
    return text.resolveRef(ref, source) || undefined;
  };

  const resolveConfiguredStat = (
    label: 'Speed' | 'Stance',
    baseSource: unknown,
    instanceRatioSource: unknown,
    instanceValueSource: unknown,
    levelRatioSource: unknown,
    eliteRatioSource: unknown,
    contextData: EndgameDiagnosticSample['context']
  ): ResolvedEnemyStat => {
    try {
      const resolved = resolveEnemyConfiguredStat(label, {
        base: baseSource,
        instanceRatio: instanceRatioSource,
        instanceValue: instanceValueSource,
        levelRatio: levelRatioSource,
        eliteRatio: eliteRatioSource
      });
      if (resolved.status === 'unavailable')
        diagnostics.warn(
          `missing-${label.toLowerCase()}-base`,
          `${label}Base 缺失，无法生成当前实例属性`,
          contextData
        );
      return resolved;
    } catch (error) {
      diagnostics.warn(
        `invalid-${label.toLowerCase()}-base`,
        error instanceof Error ? error.message : `${label}Base 无法解析`,
        contextData
      );
      return { status: 'unavailable', reason: 'invalid-reference' };
    }
  };

  const resolveInternalStance = (
    baseSource: unknown,
    instanceRatioSource: unknown,
    instanceValueSource: unknown,
    levelRatioSource: unknown,
    eliteRatioSource: unknown,
    contextData: EndgameDiagnosticSample['context']
  ): ResolvedInternalStance => {
    try {
      const resolved = resolveEnemyInternalStance({
        base: baseSource,
        instanceRatio: instanceRatioSource,
        instanceValue: instanceValueSource,
        levelRatio: levelRatioSource,
        eliteRatio: eliteRatioSource
      });
      if (resolved.status === 'unavailable')
        diagnostics.warn(
          'missing-stance-base',
          'StanceBase 缺失，无法生成当前实例属性',
          contextData
        );
      return resolved;
    } catch (error) {
      diagnostics.warn(
        'invalid-stance-base',
        error instanceof Error ? error.message : 'StanceBase 无法解析',
        contextData
      );
      return { status: 'unavailable', reason: 'invalid-reference' };
    }
  };

  const stages = buildUniqueIndex(tables.stages, (row) => row.StageID, 'StageConfig.StageID');
  const monsters = buildUniqueIndex(
    tables.monsters,
    (row) => row.MonsterID,
    'MonsterConfig.MonsterID'
  );
  const templates = buildUniqueIndex(
    tables.templates,
    (row) => row.MonsterTemplateID,
    'MonsterTemplateConfig.MonsterTemplateID'
  );
  const hardLevels = buildUniqueIndex(
    tables.hardLevels,
    (row) => `${row.HardLevelGroup}:${row.Level}`,
    'HardLevelGroup.(group,level)'
  );
  const elites = buildUniqueIndex(tables.elites, (row) => row.EliteGroup, 'EliteGroup.EliteGroup');
  const infiniteElites = buildUniqueIndex(
    tables.infiniteElites,
    (row) => row.EliteGroup,
    'InfiniteEliteGroup.EliteGroup'
  );
  const infiniteGroups = buildUniqueIndex(
    tables.infiniteGroups,
    (row) => row.WaveGroupID,
    'StageInfiniteGroup.WaveGroupID'
  );
  const infiniteWaves = buildUniqueIndex(
    tables.infiniteWaves,
    (row) => row.InfiniteWaveID,
    'StageInfiniteWaveConfig.InfiniteWaveID'
  );
  const infiniteMonsterGroups = buildUniqueIndex(
    tables.infiniteMonsterGroups,
    (row) => row.InfiniteMonsterGroupID,
    'StageInfiniteMonsterGroup.InfiniteMonsterGroupID'
  );
  const planeEvents = groupBy(tables.planeEvents, (row) => row.EventID);
  const storyGroupExtras = buildUniqueIndex(
    tables.storyGroupExtras,
    (row) => row.GroupID,
    'ChallengeStoryGroupExtra.GroupID'
  );
  // MazeBuff IDs may have multiple level rows; PF mechanic provenance only needs
  // their stable binding key, so retain every level instead of inventing a winner.
  const mazeBuffs = groupBy(tables.mazeBuffs, (row) => row.ID);
  const mechanicsByTemplate = new Map<number, Promise<MechanicsScan>>();

  type PfGroupMechanic = Pick<PureFictionWaveMechanic, 'hpParentChild' | 'killTransfer'>;
  const pfGroupMechanics = new Map<number, Promise<PfGroupMechanic>>();
  const abilityBodies = new Map<string, Promise<Record<string, unknown> | undefined>>();
  let battleEventLayouts: Promise<string[]> | undefined;

  const findAbilityBody = (abilityName: string): Promise<Record<string, unknown> | undefined> => {
    const cached = abilityBodies.get(abilityName);
    if (cached) return cached;
    const pending = (async () => {
      const directory = path.join(root, 'Config', 'ConfigAbility', 'BattleEvent');
      battleEventLayouts ??= readdir(directory).then((files) =>
        files.filter((file) => file.endsWith('.layout.json')).sort()
      );
      for (const layoutFile of await battleEventLayouts) {
        const relativeLayout = path.posix.join(
          'Config/ConfigAbility/BattleEvent',
          layoutFile.replaceAll('\\', '/')
        );
        const layout = await readRaw<Record<string, unknown>>(root, relativeLayout);
        if (!JSON.stringify(layout).includes(`"UniqueName":"${abilityName}"`)) continue;
        const relativeBody = relativeLayout.replace('.layout.json', '.json');
        if (!(await fileExists(path.join(root, relativeBody)))) return undefined;
        const body = await readRaw<Record<string, unknown>>(root, relativeBody);
        const definitions = Array.isArray(body.AbilityList) ? body.AbilityList : [];
        return definitions.some(
          (entry) =>
            !!entry &&
            typeof entry === 'object' &&
            (entry as Record<string, unknown>).Name === abilityName
        )
          ? body
          : undefined;
      }
      return undefined;
    })();
    abilityBodies.set(abilityName, pending);
    return pending;
  };

  const resolvePfGroupMechanic = (groupId: number): Promise<PfGroupMechanic> => {
    const cached = pfGroupMechanics.get(groupId);
    if (cached) return cached;
    const pending = (async (): Promise<PfGroupMechanic> => {
      const extra = storyGroupExtras.get(String(groupId));
      if (!extra) {
        const evidence: PureFictionMechanicEvidence = {
          status: 'unconfirmed',
          reason: 'missing-group-extra'
        };
        return { hpParentChild: evidence, killTransfer: evidence };
      }
      const bindingKeys = (extra.SubMazeBuffList ?? [])
        .flatMap((id) => mazeBuffs.get(String(id)) ?? [])
        .map((row) => row.InBattleBindingKey)
        .filter((value): value is string => !!value);
      const prefixes = [
        ...new Set(
          bindingKeys
            .map((value) => /^(FantasticStory_BaseAbility_\d+)/.exec(value)?.[1])
            .filter((value): value is string => !!value)
        )
      ];
      if (prefixes.length !== 1) {
        const evidence: PureFictionMechanicEvidence = {
          status: 'unconfirmed',
          reason: 'missing-binding-key'
        };
        return { hpParentChild: evidence, killTransfer: evidence };
      }
      const bindingKey = prefixes[0];
      const coreBuff = tables.mazeBuffs.find((row) => row.InBattleBindingKey === bindingKey);
      if (!coreBuff) {
        const evidence: PureFictionMechanicEvidence = {
          status: 'unconfirmed',
          reason: 'missing-core-maze-buff',
          bindingKey
        };
        return { hpParentChild: evidence, killTransfer: evidence };
      }
      const source = { bindingKey, sourceMazeBuffId: coreBuff.ID };
      const body = await findAbilityBody(bindingKey);
      if (!body) {
        const evidence: PureFictionMechanicEvidence = {
          status: 'unconfirmed',
          reason: 'ability-body-missing',
          ...source
        };
        return { hpParentChild: evidence, killTransfer: evidence };
      }
      const serialized = JSON.stringify(body);
      const hpParentChild: PureFictionMechanicEvidence = serialized.includes(
        'Modifier_FantasticStory_HPParentChild'
      )
        ? { status: 'resolved', ...source }
        : { status: 'unconfirmed', reason: 'mechanic-marker-missing', ...source };
      const hasKillTransferMarkers =
        serialized.includes('OnListenCharacterDie') &&
        serialized.includes('SetDynamicValueByProperty') &&
        serialized.includes('MaxHP') &&
        serialized.includes('DamageByAttackProperty') &&
        serialized.includes('TrueDamage');
      const killTransfer: PureFictionMechanicEvidence = {
        status: 'unconfirmed',
        reason: hasKillTransferMarkers
          ? 'percentage-expression-unresolved'
          : 'mechanic-marker-missing',
        ...source
      };
      return { hpParentChild, killTransfer };
    })();
    pfGroupMechanics.set(groupId, pending);
    return pending;
  };

  const scanMechanics = (template: MonsterTemplateRow): Promise<MechanicsScan> => {
    const cached = mechanicsByTemplate.get(template.MonsterTemplateID);
    if (cached) return cached;
    const pending = (async (): Promise<MechanicsScan> => {
      const result: MechanicsScan = {
        sharedHp: false,
        restoresHp: false,
        locksHp: false,
        manipulatesHp: false,
        manipulatesStance: false,
        abilityReferences: [],
        complete: true
      };
      if (!template.JsonConfig) {
        result.complete = false;
        diagnostics.characterConfigsMissing += 1;
        diagnostics.warn('missing-character-config-reference', '敌人模板没有 JsonConfig', {
          monsterTemplateId: template.MonsterTemplateID
        });
        return result;
      }
      result.characterConfig = template.JsonConfig;
      const characterFile = path.join(root, template.JsonConfig);
      if (!(await fileExists(characterFile))) {
        result.complete = false;
        diagnostics.characterConfigsMissing += 1;
        diagnostics.warn('missing-character-config', '无法读取敌人角色配置', {
          monsterTemplateId: template.MonsterTemplateID,
          path: template.JsonConfig
        });
        return result;
      }
      const character = await readRaw<Record<string, unknown>>(root, template.JsonConfig);
      const phaseCount = integer(character.MaxMonsterPhase ?? 0, 'MaxMonsterPhase');
      if (phaseCount > 0) result.phaseCount = phaseCount;
      result.abilityReferences = collectAbilityReferences(character);
      const abilityPath = companionAbilityPath(template.JsonConfig);
      if (!(await fileExists(path.join(root, abilityPath)))) {
        result.complete = false;
        diagnostics.abilityConfigsMissing += 1;
        diagnostics.warn('missing-ability-config', '无法确定或读取 companion ability 配置', {
          monsterTemplateId: template.MonsterTemplateID,
          path: abilityPath
        });
        return result;
      }
      result.abilityConfig = abilityPath;
      const ability = await readRaw<Record<string, unknown>>(root, abilityPath);
      const operationTypes: string[] = [];
      collectOperationTypes(ability, operationTypes);
      result.sharedHp = operationTypes.some((type) => type.endsWith('.DefineHPSharedGroup'));
      result.locksHp = operationTypes.some((type) => type.endsWith('LockHP'));
      result.manipulatesHp = operationTypes.some((type) =>
        /\.(?:SetHP|LockHP|DefineHPSharedGroup|ModifyHP|AddHP)$/.test(type)
      );
      result.manipulatesStance = operationTypes.some((type) =>
        STANCE_RUNTIME_OPERATION_TYPES.has(type)
      );
      const setHpNodes: Record<string, unknown>[] = [];
      const collectSetHp = (value: unknown): void => {
        if (Array.isArray(value)) for (const child of value) collectSetHp(child);
        else if (value && typeof value === 'object') {
          const row = value as Record<string, unknown>;
          if (row.$type === 'RPG.GameCore.SetHP') setHpNodes.push(row);
          for (const child of Object.values(row)) collectSetHp(child);
        }
      };
      collectSetHp(ability);
      result.restoresHp = setHpNodes.some((node) => {
        const ratio = (node.ModifyRatio as Record<string, unknown> | undefined)?.FixedValue;
        try {
          return decimalEquals(decimalOf(ratio, 'SetHP.ModifyRatio.FixedValue'), parseDecimal('1'));
        } catch {
          return false;
        }
      });
      return result;
    })();
    mechanicsByTemplate.set(template.MonsterTemplateID, pending);
    return pending;
  };

  const resolveElite = (
    mode: EndgameMode,
    eliteGroupId: number,
    contextSource: EliteContextSource,
    contextData: Record<string, string | number | undefined>
  ): { row: EliteRow; table: EliteGroupTable } => {
    const elite = elites.get(String(eliteGroupId));
    const infinite = infiniteElites.get(String(eliteGroupId));
    if (elite && infinite)
      diagnostics.fail('ambiguous-elite-group', 'EliteGroup 同时命中两张表', {
        ...context(mode, contextData),
        eliteGroupId
      });
    if (contextSource !== 'spawn-group' && infinite && !elite)
      diagnostics.fail('invalid-fixed-elite-source', '固定关卡 EliteGroup 只能来自 EliteGroup 表', {
        ...context(mode, contextData),
        eliteGroupId
      });
    if (!elite && !infinite)
      diagnostics.fail('missing-elite-group', '找不到 EliteGroup', {
        ...context(mode, contextData),
        eliteGroupId
      });
    return elite ? { row: elite, table: 'elite' } : { row: infinite!, table: 'infinite-elite' };
  };

  const buildOccurrence = async (
    mode: EndgameMode,
    stage: StageRow,
    monsterId: number,
    contextualEliteGroupId: number | undefined,
    contextSource: Exclude<EliteContextSource, 'monster-fallback'>,
    contextData: Record<string, string | number | undefined>,
    hasExternalMechanics: boolean,
    pfHpModifier?: PureFictionWaveMechanic['hpModifier']
  ): Promise<EnemyOccurrence> => {
    const monster =
      monsters.get(String(monsterId)) ??
      diagnostics.fail('missing-monster', '找不到实际 MonsterID', {
        ...context(mode, contextData),
        stageId: stage.StageID,
        monsterId
      });
    const template =
      templates.get(String(monster.MonsterTemplateID)) ??
      diagnostics.fail('missing-monster-template', 'MonsterID 引用了不存在的模板', {
        ...context(mode, contextData),
        stageId: stage.StageID,
        monsterId,
        monsterTemplateId: monster.MonsterTemplateID
      });
    const hard =
      hardLevels.get(`${stage.HardLevelGroup}:${stage.Level}`) ??
      diagnostics.fail('missing-hard-level', '找不到 HardLevelGroup 与 Level 组合', {
        ...context(mode, contextData),
        stageId: stage.StageID,
        hardLevelGroup: stage.HardLevelGroup,
        level: stage.Level
      });

    let eliteGroupId = contextualEliteGroupId;
    let actualContextSource: EliteContextSource = contextSource;
    let confidence: 'verified' | 'inferred' = 'verified';
    if (!eliteGroupId) {
      eliteGroupId = monster.EliteGroup;
      actualContextSource = 'monster-fallback';
      confidence = 'inferred';
      if (!eliteGroupId)
        diagnostics.fail('missing-elite-context', '关卡和 MonsterConfig 均未提供 EliteGroup', {
          ...context(mode, contextData),
          stageId: stage.StageID,
          monsterId
        });
      diagnostics.inferredMonsterEliteFallbacks += 1;
    }
    const resolvedEliteGroupId =
      eliteGroupId ?? diagnostics.fail('missing-elite-context', '无法确定 EliteGroup', contextData);
    const elite = resolveElite(mode, resolvedEliteGroupId, actualContextSource, {
      ...contextData,
      stageId: stage.StageID,
      monsterId
    });
    const hpBase = decimalOf(
      template.HPBase,
      `MonsterTemplate ${template.MonsterTemplateID}.HPBase`
    );
    const instanceRatio = decimalOf(monster.HPModifyRatio, `Monster ${monsterId}.HPModifyRatio`);
    const levelRatio = decimalOf(
      hard.HPRatio,
      `HardLevel ${stage.HardLevelGroup}:${stage.Level}.HPRatio`
    );
    const eliteRatio = decimalOf(elite.row.HPRatio, `EliteGroup ${resolvedEliteGroupId}.HPRatio`);
    const baseEncounterMaxHpPerBar = multiplyDecimals([
      hpBase,
      instanceRatio,
      levelRatio,
      eliteRatio
    ]);
    const finalHp =
      mode === 'pf' && pfHpModifier
        ? resolvePureFictionFinalHp({
            hpBase,
            instanceRatio,
            levelRatio,
            eliteRatio,
            baseEncounterMaxHpPerBar,
            rank: template.Rank,
            modifier: pfHpModifier
          }).final
        : {
            status: 'resolved' as const,
            maxHpPerBar: baseEncounterMaxHpPerBar,
            source: 'base-encounter' as const,
            rounding: 'display-half-up' as const
          };
    const scan = await scanMechanics(template);
    const statContext = {
      ...context(mode, contextData),
      stageId: stage.StageID,
      monsterId,
      monsterTemplateId: template.MonsterTemplateID
    };
    const speed = resolveConfiguredStat(
      'Speed',
      template.SpeedBase,
      monster.SpeedModifyRatio,
      monster.SpeedModifyValue,
      hard.SpeedRatio,
      elite.row.SpeedRatio,
      statContext
    );
    const internalStance = resolveInternalStance(
      template.StanceBase,
      monster.StanceModifyRatio,
      monster.StanceModifyValue,
      hard.StanceRatio,
      elite.row.StanceRatio,
      statContext
    );
    const displayedToughness =
      internalStance.status === 'resolved'
        ? internalStanceToToughness(internalStance.resolvedInternal)
        : undefined;
    if (internalStance.status === 'resolved' && displayedToughness === undefined)
      diagnostics.warn(
        'non-terminating-stance-conversion',
        'resolved internal stance 无法精确换算为玩家韧性',
        { ...statContext, resolvedInternal: internalStance.resolvedInternal }
      );
    let barCount: number | undefined;
    if (template.StanceCount !== undefined) {
      barCount = integer(
        template.StanceCount,
        `MonsterTemplate ${template.MonsterTemplateID}.StanceCount`
      );
      if (barCount < 1)
        diagnostics.fail('invalid-stance-count', 'StanceCount 必须为正整数', {
          ...statContext,
          stanceCount: barCount
        });
    }
    const summons = (monster.SummonIDList ?? []).map((id) => integer(id, 'SummonIDList'));
    const unclear =
      !scan.complete ||
      (scan.phaseCount ?? 1) > 1 ||
      summons.length > 0 ||
      scan.sharedHp ||
      scan.restoresHp ||
      scan.locksHp ||
      scan.manipulatesHp ||
      hasExternalMechanics;
    const mechanics: EnemyMechanics = {
      ...(scan.phaseCount ? { phaseCount: scan.phaseCount } : {}),
      summons,
      sharedHp: scan.sharedHp,
      restoresHp: scan.restoresHp,
      locksHp: scan.locksHp,
      manipulatesHp: scan.manipulatesHp,
      ...(scan.characterConfig ? { characterConfig: scan.characterConfig } : {}),
      ...(scan.abilityConfig ? { abilityConfig: scan.abilityConfig } : {}),
      abilityReferences: scan.abilityReferences,
      ...(unclear || finalHp.status === 'unresolved'
        ? {}
        : { effectiveTotalHp: finalHp.maxHpPerBar }),
      effectiveTotalHpStatus:
        unclear || finalHp.status === 'unresolved' ? 'runtime-unclear' : 'static'
    };
    return {
      monsterId,
      monsterTemplateId: monster.MonsterTemplateID,
      name: localized(
        template.MonsterName,
        'endgame-enemy',
        monster.MonsterTemplateID,
        'MonsterName'
      ),
      hp: {
        hpBase,
        instanceRatio,
        levelRatio,
        eliteRatio,
        baseEncounterMaxHpPerBar,
        final: finalHp,
        eliteGroupId: resolvedEliteGroupId,
        eliteGroupTable: elite.table,
        eliteContextSource: actualContextSource,
        eliteContextConfidence: confidence
      },
      speed,
      toughness: {
        internalStance,
        display:
          displayedToughness !== undefined
            ? { status: 'resolved', perBar: displayedToughness }
            : {
                status: 'unavailable',
                reason:
                  internalStance.status === 'unavailable'
                    ? internalStance.reason
                    : 'non-terminating-unit-conversion'
              },
        ...(barCount ? { barCount } : {}),
        runtimeStatus: !scan.complete || scan.manipulatesStance ? 'runtime-unclear' : 'static'
      },
      mechanics
    };
  };

  const resolveStage = (
    mode: EndgameMode,
    eventId: number,
    contextData: Record<string, string | number | undefined>
  ): StageRow => {
    const candidates = planeEvents.get(String(eventId)) ?? [];
    const stageIds = [...new Set(candidates.map((row) => row.StageID).filter(Boolean))] as number[];
    if (stageIds.length !== 1)
      diagnostics.fail('invalid-plane-event', 'EventID 必须解析到唯一 StageID', {
        ...context(mode, contextData),
        eventId,
        resolvedStageCount: stageIds.length
      });
    const stage =
      stages.get(String(stageIds[0])) ??
      diagnostics.fail('missing-stage', 'PlaneEvent 引用了不存在的 StageID', {
        ...context(mode, contextData),
        eventId,
        stageId: stageIds[0]
      });
    return stage;
  };

  const stageAbilityNames = (stage: StageRow): string[] =>
    (stage.StageAbilityConfig ?? []).flatMap((entry) => {
      if (typeof entry === 'string' && entry) return [entry];
      if (entry && typeof entry === 'object') return [JSON.stringify(entry)];
      return [];
    });

  const previewMonsterIds = (stage: StageRow): number[] =>
    (stage.MonsterList ?? []).flatMap((wave) =>
      Object.entries(wave)
        .sort(
          ([left], [right]) => Number(left.replace(/\D/g, '')) - Number(right.replace(/\D/g, ''))
        )
        .map(([, id]) => integer(id, 'StageConfig.MonsterList'))
        .filter((id) => id > 0)
    );

  const buildFixedStage = async (
    mode: EndgameMode,
    eventId: number,
    contextData: Record<string, string | number | undefined>
  ): Promise<EndgameStage> => {
    const stage = resolveStage(mode, eventId, contextData);
    const abilities = stageAbilityNames(stage);
    const waves = await Promise.all(
      (stage.MonsterList ?? []).map(async (wave, index) => ({
        wave: index + 1,
        enemies: await Promise.all(
          Object.entries(wave)
            .sort(
              ([left], [right]) =>
                Number(left.replace(/\D/g, '')) - Number(right.replace(/\D/g, ''))
            )
            .map(([, id]) => integer(id, 'StageConfig.MonsterList'))
            .filter((id) => id > 0)
            .map((monsterId, position) =>
              buildOccurrence(
                mode,
                stage,
                monsterId,
                stage.EliteGroup,
                'stage',
                { ...contextData, eventId, wave: index + 1, position: position + 1 },
                abilities.length > 0
              )
            )
        )
      }))
    );
    return {
      eventId,
      stageId: stage.StageID,
      level: integer(stage.Level, 'StageConfig.Level'),
      hardLevelGroup: integer(stage.HardLevelGroup, 'StageConfig.HardLevelGroup'),
      stageAbilities: abilities,
      previewMonsterIds: previewMonsterIds(stage),
      waveModel: { kind: 'fixed', waves }
    };
  };

  const infiniteGroupIdOf = (
    mode: EndgameMode,
    stage: StageRow,
    contextData: Record<string, string | number | undefined>
  ): number => {
    const matches = (stage.StageConfigData ?? []).filter(
      (entry) => entry.BFLIFKBEOPJ === '_StageInfiniteGroup'
    );
    if (matches.length !== 1)
      diagnostics.fail('invalid-infinite-group-reference', '关卡必须包含唯一 _StageInfiniteGroup', {
        ...context(mode, contextData),
        stageId: stage.StageID,
        referenceCount: matches.length
      });
    return integer(matches[0].MNDFOPKBHKP, 'StageConfigData._StageInfiniteGroup');
  };

  const buildSpawnStage = async (
    mode: EndgameMode,
    eventId: number,
    contextData: Record<string, string | number | undefined>
  ): Promise<EndgameStage> => {
    const stage = resolveStage(mode, eventId, contextData);
    const waveGroupId = infiniteGroupIdOf(mode, stage, { ...contextData, eventId });
    const waveGroup =
      infiniteGroups.get(String(waveGroupId)) ??
      diagnostics.fail('missing-infinite-group', '找不到 StageInfiniteGroup', {
        ...context(mode, contextData),
        eventId,
        stageId: stage.StageID,
        waveGroupId
      });
    const abilities = stageAbilityNames(stage);
    const waves: SpawnWave[] = [];
    for (const waveId of waveGroup.WaveIDList ?? []) {
      const wave =
        infiniteWaves.get(String(waveId)) ??
        diagnostics.fail('missing-infinite-wave', '找不到 StageInfiniteWaveConfig', {
          ...context(mode, contextData),
          stageId: stage.StageID,
          waveGroupId,
          waveId
        });
      const params: SpawnWaveParam[] = (wave.ParamList ?? []).map((value, index) => {
        try {
          return decimalOf(value, `InfiniteWave ${waveId}.ParamList[${index}]`);
        } catch (error) {
          return {
            status: 'invalid',
            reason:
              error instanceof Error && error.message.includes('缺少 Value')
                ? 'missing-decimal-value'
                : 'invalid-decimal-value'
          };
        }
      });
      const pfHpModifier =
        mode === 'pf' ? resolvePureFictionHpModifier(wave.Ability, params) : undefined;
      if (pfHpModifier?.status === 'unresolved')
        diagnostics.warn('unresolved-pf-wave-hp', 'PF 波次 HP modifier 无法可靠解析', {
          ...context(mode, contextData),
          eventId,
          stageId: stage.StageID,
          waveId,
          ability: wave.Ability,
          reason: pfHpModifier.reason
        });
      let pureFictionMechanic: PureFictionWaveMechanic | undefined;
      if (mode === 'pf') {
        const groupId = integer(contextData.groupId, 'PF context.groupId');
        const groupMechanic = await resolvePfGroupMechanic(groupId);
        pureFictionMechanic = {
          hpModifier: pfHpModifier!,
          rounding: PF_ROUNDING_METADATA,
          ...groupMechanic
        };
        for (const [mechanic, evidence] of [
          ['hp-parent-child', groupMechanic.hpParentChild],
          ['kill-transfer', groupMechanic.killTransfer]
        ] as const)
          if (evidence.status === 'unconfirmed' && evidence.reason === 'ability-body-missing')
            diagnostics.warn(
              `unconfirmed-pf-${mechanic}`,
              `PF ${mechanic} 的当前 ability body 缺失，保留为 unconfirmed`,
              {
                groupId,
                bindingKey: evidence.bindingKey,
                sourceMazeBuffId: evidence.sourceMazeBuffId
              }
            );
      }
      const monsterGroups = [];
      for (const monsterGroupId of wave.MonsterGroupIDList ?? []) {
        const monsterGroup =
          infiniteMonsterGroups.get(String(monsterGroupId)) ??
          diagnostics.fail('missing-infinite-monster-group', '找不到 StageInfiniteMonsterGroup', {
            ...context(mode, contextData),
            stageId: stage.StageID,
            waveId,
            monsterGroupId
          });
        const orderedEnemies = await Promise.all(
          (monsterGroup.MonsterList ?? []).map((monsterId, position) =>
            buildOccurrence(
              mode,
              stage,
              integer(monsterId, 'StageInfiniteMonsterGroup.MonsterList'),
              integer(monsterGroup.EliteGroup, 'StageInfiniteMonsterGroup.EliteGroup'),
              'spawn-group',
              {
                ...contextData,
                eventId,
                waveId,
                monsterGroupId,
                position: position + 1
              },
              abilities.length > 0 || !!wave.Ability,
              pfHpModifier
            )
          )
        );
        monsterGroups.push({ monsterGroupId, orderedEnemies });
      }
      waves.push({
        waveId,
        monsterGroups,
        ...(wave.MaxMonsterCount === undefined
          ? {}
          : { maxMonsterCount: integer(wave.MaxMonsterCount, 'MaxMonsterCount') }),
        ...(wave.MaxTeammateCount === undefined
          ? {}
          : { maxTeammateCount: integer(wave.MaxTeammateCount, 'MaxTeammateCount') }),
        ...(wave.Ability ? { ability: wave.Ability } : {}),
        params,
        ...(wave.ClearPreviousAbility === undefined
          ? {}
          : { clearPreviousAbility: wave.ClearPreviousAbility }),
        ...(pureFictionMechanic ? { pureFictionMechanic } : {})
      });
    }
    return {
      eventId,
      stageId: stage.StageID,
      level: integer(stage.Level, 'StageConfig.Level'),
      hardLevelGroup: integer(stage.HardLevelGroup, 'StageConfig.HardLevelGroup'),
      stageAbilities: abilities,
      previewMonsterIds: previewMonsterIds(stage),
      waveModel: { kind: 'spawn-sequence', waveGroupId, waves }
    };
  };

  const buildSlots = async (
    mode: EndgameMode,
    eventLists: number[][],
    contextData: Record<string, string | number | undefined>
  ): Promise<EndgameBattleSlot[]> =>
    Promise.all(
      eventLists
        .map((events, index) => ({ events, slot: index + 1 }))
        .filter(({ events }) => events.length > 0)
        .map(async ({ events, slot }) => ({
          slot,
          stages: await Promise.all(
            events.map((eventId) =>
              mode === 'pf' || mode === 'aa'
                ? buildSpawnStage(mode, eventId, { ...contextData, slot })
                : buildFixedStage(mode, eventId, { ...contextData, slot })
            )
          )
        }))
    );

  const datasets = {} as Record<EndgameMode, EndgameModeDataset>;
  for (const mode of ['moc', 'pf', 'as'] as const) {
    const schedules = buildUniqueIndex(tables.schedules[mode], (row) => row.ID, `${mode} schedule`);
    const configsByGroup = groupBy(tables.configs[mode], (row) => row.GroupID);
    const tierces = buildUniqueIndex(
      tables.tierces[mode],
      (row) => row.PHFMCACHFIJ,
      `${mode} tierce`
    );
    const groups: EndgameGroup[] = [];
    for (const group of [...tables.groups[mode]].sort((a, b) => a.GroupID - b.GroupID)) {
      const tierce = group.TierceID ? tierces.get(String(group.TierceID)) : undefined;
      if (group.TierceID && !tierce)
        diagnostics.fail('missing-tierce', 'Group.TierceID 无法解析', {
          mode,
          groupId: group.GroupID,
          tierceId: group.TierceID
        });
      const configRows = [...(configsByGroup.get(String(group.GroupID)) ?? [])].sort(
        (a, b) => (a.Floor ?? a.ID) - (b.Floor ?? b.ID)
      );
      if (tierce && !configRows.some((row) => row.ID === tierce.DLCKKJFMJOB))
        diagnostics.fail('invalid-tierce-parent', 'Tierce 父配置不属于当前 Group', {
          mode,
          groupId: group.GroupID,
          tierceId: group.TierceID,
          parentConfigId: tierce.DLCKKJFMJOB
        });
      const encounters: EndgameEncounter[] = [];
      for (const config of configRows) {
        const eventLists = [config.EventIDList1 ?? [], config.EventIDList2 ?? []];
        if (tierce?.DLCKKJFMJOB === config.ID) eventLists.push(tierce.HFIAAGAKFMD ?? []);
        encounters.push({
          id: String(config.ID),
          configId: config.ID,
          name: localized(config.Name, `${mode}-encounter`, config.ID, 'Name'),
          ...(config.Floor === undefined ? {} : { ordinal: config.Floor }),
          variant: 'floor',
          battles: await buildSlots(mode, eventLists, {
            groupId: group.GroupID,
            configId: config.ID
          })
        });
      }
      const schedule = group.ScheduleDataID
        ? schedules.get(String(group.ScheduleDataID))
        : undefined;
      if (group.ScheduleDataID && !schedule)
        diagnostics.fail('missing-schedule', 'Group.ScheduleDataID 无法解析', {
          mode,
          groupId: group.GroupID,
          scheduleId: group.ScheduleDataID
        });
      groups.push({
        mode,
        groupId: group.GroupID,
        name: localized(group.GroupName, `${mode}-group`, group.GroupID, 'GroupName'),
        ...(schedule ? { schedule: { begin: schedule.BeginTime, end: schedule.EndTime } } : {}),
        encounters
      });
    }
    datasets[mode] = { schemaVersion: SCHEMA_VERSION, mode, groups };
  }

  const peakConfigs = buildUniqueIndex(
    tables.peakConfigs,
    (row) => row.ID,
    'ChallengePeakConfig.ID'
  );
  const peakBosses = buildUniqueIndex(
    tables.peakBosses,
    (row) => row.ID,
    'ChallengePeakBossConfig.ID'
  );
  const aaGroups: EndgameGroup[] = [];
  for (const group of [...tables.peakGroups].sort((a, b) => a.ID - b.ID)) {
    const encounters: EndgameEncounter[] = [];
    for (const [index, configId] of (group.PreLevelIDList ?? []).entries()) {
      const config =
        peakConfigs.get(String(configId)) ??
        diagnostics.fail('missing-peak-level', '找不到 AA preliminary 配置', {
          mode: 'aa',
          groupId: group.ID,
          configId
        });
      encounters.push({
        id: `${configId}:preliminary`,
        configId,
        name: localized(config.Title, 'aa-encounter', configId, 'Title'),
        ordinal: index + 1,
        variant: 'preliminary',
        battles: await buildSlots('aa', [config.EventIDList ?? []], {
          groupId: group.ID,
          configId,
          variant: 'preliminary'
        })
      });
    }
    const bossConfig =
      peakConfigs.get(String(group.BossLevelID)) ??
      diagnostics.fail('missing-peak-boss', '找不到 AA boss normal 配置', {
        mode: 'aa',
        groupId: group.ID,
        configId: group.BossLevelID
      });
    encounters.push({
      id: `${group.BossLevelID}:normal`,
      configId: group.BossLevelID,
      name: localized(bossConfig.Title, 'aa-encounter', group.BossLevelID, 'Title'),
      variant: 'boss-normal',
      battles: await buildSlots('aa', [bossConfig.EventIDList ?? []], {
        groupId: group.ID,
        configId: group.BossLevelID,
        variant: 'boss-normal'
      })
    });
    const hard =
      peakBosses.get(String(group.BossLevelID)) ??
      diagnostics.fail('missing-peak-hard-boss', '找不到 AA boss hard 配置', {
        mode: 'aa',
        groupId: group.ID,
        configId: group.BossLevelID
      });
    encounters.push({
      id: `${group.BossLevelID}:hard`,
      configId: group.BossLevelID,
      name: localized(hard.HardTitle, 'aa-encounter', group.BossLevelID, 'HardTitle'),
      variant: 'boss-hard',
      battles: await buildSlots('aa', [hard.HardEventIDList ?? []], {
        groupId: group.ID,
        configId: group.BossLevelID,
        variant: 'boss-hard'
      })
    });
    aaGroups.push({
      mode: 'aa',
      groupId: group.ID,
      name: localized(group.Title, 'aa-group', group.ID, 'Title'),
      encounters
    });
  }
  datasets.aa = { schemaVersion: SCHEMA_VERSION, mode: 'aa', groups: aaGroups };

  const summary = Object.fromEntries(
    MODES.map((mode) => {
      const groups = datasets[mode].groups;
      const encounters = groups.flatMap((group) => group.encounters);
      const battleSlots = encounters.flatMap((encounter) => encounter.battles);
      const stages = battleSlots.flatMap((battle) => battle.stages);
      const occurrences = stages.flatMap((stage) =>
        stage.waveModel.kind === 'fixed'
          ? stage.waveModel.waves.flatMap((wave) => wave.enemies)
          : stage.waveModel.waves.flatMap((wave) =>
              wave.monsterGroups.flatMap((group) => group.orderedEnemies)
            )
      );
      return [
        mode,
        {
          groups: groups.length,
          encounters: encounters.length,
          battleSlots: battleSlots.length,
          stages: stages.length,
          occurrences: occurrences.length
        }
      ];
    })
  ) as EndgameManifestSummary['modes'];

  const stanceConversion: EndgameAudit['stanceConversion'] = {
    totalOccurrences: 0,
    resolvedInternal: 0,
    missingInternal: 0,
    resolvedDisplay: 0,
    nonDivisibleByThree: 0,
    conversionUnavailable: 0,
    multiBarOccurrences: 0,
    nonPositiveDisplay: 0,
    samples: []
  };
  const zero = parseDecimal('0');
  for (const mode of MODES) {
    const occurrences = datasets[mode].groups
      .flatMap((group) => group.encounters)
      .flatMap((encounter) => encounter.battles)
      .flatMap((battle) => battle.stages)
      .flatMap((stage) =>
        stage.waveModel.kind === 'fixed'
          ? stage.waveModel.waves.flatMap((wave) => wave.enemies)
          : stage.waveModel.waves.flatMap((wave) =>
              wave.monsterGroups.flatMap((group) => group.orderedEnemies)
            )
      );
    for (const occurrence of occurrences) {
      stanceConversion.totalOccurrences += 1;
      if ((occurrence.toughness.barCount ?? 1) > 1) stanceConversion.multiBarOccurrences += 1;
      const internal = occurrence.toughness.internalStance;
      if (internal.status === 'unavailable') {
        stanceConversion.missingInternal += 1;
        continue;
      }
      stanceConversion.resolvedInternal += 1;
      const display = occurrence.toughness.display;
      if (display.status === 'unavailable') {
        stanceConversion.nonDivisibleByThree += 1;
        stanceConversion.conversionUnavailable += 1;
        if (stanceConversion.samples.length < MAX_SAMPLES)
          stanceConversion.samples.push({
            mode,
            monsterId: occurrence.monsterId,
            monsterTemplateId: occurrence.monsterTemplateId,
            ...(occurrence.name ? { name: occurrence.name } : {}),
            resolvedInternal: internal.resolvedInternal,
            reason: display.reason
          });
        continue;
      }
      stanceConversion.resolvedDisplay += 1;
      if (!isWholeDecimal(display.perBar)) {
        stanceConversion.nonDivisibleByThree += 1;
        if (stanceConversion.samples.length < MAX_SAMPLES)
          stanceConversion.samples.push({
            mode,
            monsterId: occurrence.monsterId,
            monsterTemplateId: occurrence.monsterTemplateId,
            ...(occurrence.name ? { name: occurrence.name } : {}),
            resolvedInternal: internal.resolvedInternal,
            displayedPerBar: display.perBar,
            reason: 'displayed-toughness-is-not-an-integer'
          });
      }
      if (compareDecimals(display.perBar, zero) <= 0) {
        stanceConversion.nonPositiveDisplay += 1;
        if (stanceConversion.samples.length < MAX_SAMPLES)
          stanceConversion.samples.push({
            mode,
            monsterId: occurrence.monsterId,
            monsterTemplateId: occurrence.monsterTemplateId,
            ...(occurrence.name ? { name: occurrence.name } : {}),
            resolvedInternal: internal.resolvedInternal,
            displayedPerBar: display.perBar,
            reason: 'displayed-toughness-is-not-positive'
          });
      }
      if (
        stanceConversion.minDisplayed === undefined ||
        compareDecimals(display.perBar, stanceConversion.minDisplayed) < 0
      )
        stanceConversion.minDisplayed = display.perBar;
      if (
        stanceConversion.maxDisplayed === undefined ||
        compareDecimals(display.perBar, stanceConversion.maxDisplayed) > 0
      )
        stanceConversion.maxDisplayed = display.perBar;
    }
  }

  return {
    datasets,
    audit: {
      coreErrors: { count: 0, samples: [] },
      warnings: { count: diagnostics.warningCount, samples: diagnostics.warnings },
      inferredMonsterEliteFallbacks: diagnostics.inferredMonsterEliteFallbacks,
      mechanics: {
        characterConfigsMissing: diagnostics.characterConfigsMissing,
        abilityConfigsMissing: diagnostics.abilityConfigsMissing
      },
      stanceConversion,
      summary: { modes: summary }
    }
  };
}
