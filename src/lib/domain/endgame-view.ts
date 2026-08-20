import type {
  DecimalString,
  EndgameEncounter,
  EndgameEncounterVariant,
  EndgameGroup,
  EndgameMode,
  EndgameStage,
  EnemyMechanics,
  EnemyOccurrence
} from './endgame';

export const ENDGAME_MODES = ['moc', 'pf', 'as', 'aa'] as const satisfies readonly EndgameMode[];

export const ENDGAME_MODE_META: Record<
  EndgameMode,
  { label: string; shortLabel: string; description: string }
> = {
  moc: {
    label: '混沌回忆',
    shortLabel: '混沌',
    description: '按楼层查看固定编队、波次、弱点与配置生命值。'
  },
  pf: {
    label: '虚构叙事',
    shortLabel: '虚构',
    description: '按波次查看可能出现的敌人类型，不展开运行时重复生成顺序。'
  },
  as: {
    label: '末日幻影',
    shortLabel: '末日',
    description: '以首领为中心查看各难度、队伍关卡、阶段与生命机制。'
  },
  aa: {
    label: '异相仲裁',
    shortLabel: '仲裁',
    description: '分别查看骑士关卡、普通王棋与绝境王棋的实际敌方实例。'
  }
};

export type EndgamePeriodStatus = 'current' | 'upcoming' | 'historical' | 'unknown';

export interface EndgamePeriodView {
  groupId: number;
  name: string;
  dateLabel: string;
  status: EndgamePeriodStatus;
  encounterCount: number;
}

export interface EndgameModeView {
  mode: EndgameMode;
  label: string;
  description: string;
  periods: EndgamePeriodView[];
  recommendedGroupId?: number;
}

export interface EndgameWeaknessView {
  element: string;
  name: string;
}

export interface EndgameEnemyReference {
  name?: string;
  rank?: string;
  weaknesses: EndgameWeaknessView[];
  portraitUrl?: string;
  exists: boolean;
}

export interface EndgameEnemyDetailSource {
  name?: string;
  rank?: string;
  monsters: Array<{
    monsterId: string;
    weaknesses?: EndgameWeaknessView[];
  }>;
}

export function endgameEnemyReferenceKey(monsterId: number, monsterTemplateId: number): string {
  return `${monsterTemplateId}:${monsterId}`;
}

export function resolveEndgameEnemyReference(
  detail: EndgameEnemyDetailSource,
  monsterId: number
): EndgameEnemyReference {
  const monster = detail.monsters.find((candidate) => candidate.monsterId === String(monsterId));
  if (!monster) throw new Error(`敌方百科缺少 Endgame 引用的具体 MonsterID：${monsterId}`);
  return {
    name: detail.name,
    rank: detail.rank,
    weaknesses: monster.weaknesses ?? [],
    exists: true
  };
}

export interface EnemyOccurrenceView {
  identity: string;
  monsterId: number;
  monsterTemplateId: number;
  name: string;
  enemyHref?: string;
  rank?: string;
  weaknesses: EndgameWeaknessView[];
  portraitUrl?: string;
  count?: number;
  hp: {
    exactPerBar?: DecimalString;
    roundedPerBar: string;
    phaseCount?: number;
  };
  speed: {
    exact?: DecimalString;
    rounded: string;
  };
  toughness: {
    exactPerBar?: DecimalString;
    roundedPerBar: string;
    barCount?: number;
  };
}

export interface EndgameWaveView {
  key: string;
  label: string;
  enemies: EnemyOccurrenceView[];
}

export interface EndgameStageView {
  key: string;
  index: number;
  level: number;
  waves: EndgameWaveView[];
}

export interface EndgameBattleSlotView {
  slot: number;
  stages: EndgameStageView[];
}

export interface EndgameEncounterView {
  id: string;
  label: string;
  ordinal?: number;
  variant: EndgameEncounterVariant;
  battles: EndgameBattleSlotView[];
}

export interface EndgameGroupView {
  mode: EndgameMode;
  modeLabel: string;
  period: EndgamePeriodView;
  periods: EndgamePeriodView[];
  defaultEncounterId?: string;
  encounters: EndgameEncounterView[];
}

export function isEndgameMode(value: string): value is EndgameMode {
  return ENDGAME_MODES.includes(value as EndgameMode);
}

export function formatRoundedDecimal(value: DecimalString): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error(`无效的正十进制字符串：${value}`);
  let integer = BigInt(match[1]);
  if ((match[2]?.[0] ?? '0') >= '5') integer += 1n;
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(integer);
}

export function formatExactDecimal(value: DecimalString): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error(`无效的正十进制字符串：${value}`);
  const integer = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(
    BigInt(match[1])
  );
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  return fraction ? `${integer}.${fraction}` : integer;
}

export const formatFullHp = formatRoundedDecimal;

export function formatHpWithPhases(value: DecimalString, phaseCount?: number): string {
  const hp = formatFullHp(value);
  return phaseCount && phaseCount > 1 ? `${hp} × ${phaseCount}` : hp;
}

function mechanicsIdentity(mechanics: EnemyMechanics): string {
  return JSON.stringify([
    mechanics.phaseCount ?? null,
    mechanics.summons,
    mechanics.sharedHp,
    mechanics.restoresHp,
    mechanics.locksHp,
    mechanics.manipulatesHp,
    mechanics.effectiveTotalHpStatus
  ]);
}

export function occurrenceIdentity(occurrence: EnemyOccurrence): string {
  return JSON.stringify([
    occurrence.monsterId,
    occurrence.monsterTemplateId,
    occurrence.hp.hpBase,
    occurrence.hp.instanceRatio,
    occurrence.hp.levelRatio,
    occurrence.hp.eliteRatio,
    occurrence.hp.baseEncounterMaxHpPerBar,
    occurrence.hp.final.status,
    occurrence.hp.final.status === 'resolved'
      ? occurrence.hp.final.maxHpPerBar
      : occurrence.hp.final.reason,
    occurrence.hp.eliteGroupId,
    occurrence.hp.eliteGroupTable,
    occurrence.hp.eliteContextSource,
    occurrence.hp.eliteContextConfidence,
    occurrence.speed,
    occurrence.toughness,
    mechanicsIdentity(occurrence.mechanics)
  ]);
}

export function uniqueSpawnOccurrences(occurrences: EnemyOccurrence[]): EnemyOccurrence[] {
  const seen = new Set<string>();
  return occurrences.filter((occurrence) => {
    const identity = occurrenceIdentity(occurrence);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function mergeFixedOccurrences(
  occurrences: EnemyOccurrence[]
): Array<{ occurrence: EnemyOccurrence; count: number }> {
  const merged = new Map<string, { occurrence: EnemyOccurrence; count: number }>();
  for (const occurrence of occurrences) {
    const identity = occurrenceIdentity(occurrence);
    const current = merged.get(identity);
    if (current) current.count += 1;
    else merged.set(identity, { occurrence, count: 1 });
  }
  return [...merged.values()];
}

export function buildOccurrenceView(
  occurrence: EnemyOccurrence,
  reference?: EndgameEnemyReference,
  count?: number
): EnemyOccurrenceView {
  const mechanics = occurrence.mechanics;
  return {
    identity: occurrenceIdentity(occurrence),
    monsterId: occurrence.monsterId,
    monsterTemplateId: occurrence.monsterTemplateId,
    name: occurrence.name || reference?.name || '未知敌方单位',
    ...(reference?.exists ? { enemyHref: `/enemies/${occurrence.monsterTemplateId}` } : {}),
    ...(reference?.rank ? { rank: reference.rank } : {}),
    weaknesses: reference?.weaknesses ?? [],
    ...(reference?.portraitUrl ? { portraitUrl: reference.portraitUrl } : {}),
    ...(count && count > 1 ? { count } : {}),
    hp:
      occurrence.hp.final.status === 'resolved'
        ? {
            exactPerBar: occurrence.hp.final.maxHpPerBar,
            roundedPerBar: formatFullHp(occurrence.hp.final.maxHpPerBar),
            ...(mechanics.phaseCount ? { phaseCount: mechanics.phaseCount } : {})
          }
        : { roundedPerBar: '资料未提供' },
    speed:
      occurrence.speed.status === 'resolved'
        ? {
            exact: occurrence.speed.configuredValue,
            rounded: formatRoundedDecimal(occurrence.speed.configuredValue)
          }
        : { rounded: '资料未提供' },
    toughness:
      occurrence.toughness.display.status === 'resolved'
        ? {
            exactPerBar: occurrence.toughness.display.perBar,
            roundedPerBar: formatExactDecimal(occurrence.toughness.display.perBar),
            ...(occurrence.toughness.barCount ? { barCount: occurrence.toughness.barCount } : {})
          }
        : { roundedPerBar: '资料未提供' }
  };
}

function encounterLabel(mode: EndgameMode, encounter: EndgameEncounter): string {
  if (encounter.name) return encounter.name;
  if (encounter.ordinal)
    return mode === 'as' ? `难度 ${encounter.ordinal}` : `第 ${encounter.ordinal} 关`;
  if (encounter.variant === 'boss-hard') return '王棋·绝境';
  if (encounter.variant === 'boss-normal') return '王棋';
  return `关卡 ${encounter.id}`;
}

export function defaultEncounterId(
  mode: EndgameMode,
  encounters: EndgameEncounter[]
): string | undefined {
  if (!encounters.length) return undefined;
  if (mode === 'aa') {
    return (
      encounters.find((encounter) => encounter.variant === 'boss-normal') ??
      [...encounters]
        .filter((encounter) => encounter.variant === 'preliminary')
        .sort((a, b) => (b.ordinal ?? 0) - (a.ordinal ?? 0))[0] ??
      encounters[0]
    ).id;
  }
  return [...encounters].sort((a, b) => (b.ordinal ?? 0) - (a.ordinal ?? 0))[0].id;
}

function parseSchedule(value: string): number {
  return Date.parse(`${value.replace(' ', 'T')}+08:00`);
}

function datePart(value: string): string {
  const [date] = value.split(' ');
  return date.replaceAll('-', '/');
}

export function buildPeriodView(group: EndgameGroup, now = Date.now()): EndgamePeriodView {
  if (!group.schedule) {
    return {
      groupId: group.groupId,
      name: group.name || `数据组 ${group.groupId}`,
      dateLabel: '时间资料未提供',
      status: 'unknown',
      encounterCount: group.encounters.length
    };
  }
  const begin = parseSchedule(group.schedule.begin);
  const end = parseSchedule(group.schedule.end);
  const status: EndgamePeriodStatus =
    begin <= now && now < end ? 'current' : now < begin ? 'upcoming' : 'historical';
  return {
    groupId: group.groupId,
    name: group.name || `数据组 ${group.groupId}`,
    dateLabel: `${datePart(group.schedule.begin)} – ${datePart(group.schedule.end)}`,
    status,
    encounterCount: group.encounters.length
  };
}

export function recommendedGroupId(groups: EndgameGroup[], now = Date.now()): number | undefined {
  if (!groups.length) return undefined;
  if (groups.every((group) => !group.schedule))
    return [...groups].sort((a, b) => b.groupId - a.groupId)[0].groupId;
  const scheduled = groups.filter((group) => group.schedule);
  const current = scheduled
    .filter((group) => {
      const begin = parseSchedule(group.schedule!.begin);
      const end = parseSchedule(group.schedule!.end);
      return begin <= now && now < end;
    })
    .sort((a, b) => parseSchedule(b.schedule!.begin) - parseSchedule(a.schedule!.begin));
  if (current[0]) return current[0].groupId;
  const started = scheduled
    .filter((group) => parseSchedule(group.schedule!.begin) <= now)
    .sort((a, b) => parseSchedule(b.schedule!.begin) - parseSchedule(a.schedule!.begin));
  if (started[0]) return started[0].groupId;
  return [...scheduled].sort(
    (a, b) => parseSchedule(a.schedule!.begin) - parseSchedule(b.schedule!.begin)
  )[0]?.groupId;
}

export function buildModeView(mode: EndgameMode, groups: EndgameGroup[]): EndgameModeView {
  return {
    mode,
    label: ENDGAME_MODE_META[mode].label,
    description: ENDGAME_MODE_META[mode].description,
    periods: [...groups]
      .sort((a, b) => b.groupId - a.groupId)
      .map((group) => buildPeriodView(group)),
    recommendedGroupId: recommendedGroupId(groups)
  };
}

export function buildGroupView(
  group: EndgameGroup,
  periods: EndgamePeriodView[],
  enemyReferences: ReadonlyMap<string, EndgameEnemyReference>
): EndgameGroupView {
  const encounters = group.encounters.map((encounter) => ({
    id: encounter.id,
    label: encounterLabel(group.mode, encounter),
    ...(encounter.ordinal ? { ordinal: encounter.ordinal } : {}),
    variant: encounter.variant,
    battles: encounter.battles.map((battle) => ({
      slot: battle.slot,
      stages: battle.stages.map((stage, stageIndex) => {
        const waves = buildWaveViews(stage, enemyReferences);
        return {
          key: `${stage.stageId}-${stageIndex}`,
          index: stageIndex + 1,
          level: stage.level,
          waves
        };
      })
    }))
  }));
  return {
    mode: group.mode,
    modeLabel: ENDGAME_MODE_META[group.mode].label,
    period: buildPeriodView(group),
    periods,
    defaultEncounterId: defaultEncounterId(group.mode, group.encounters),
    encounters
  };
}

function buildWaveViews(
  stage: EndgameStage,
  enemyReferences: ReadonlyMap<string, EndgameEnemyReference>
): EndgameWaveView[] {
  if (stage.waveModel.kind === 'fixed')
    return stage.waveModel.waves.map((wave, waveIndex) => ({
      key: `fixed-${wave.wave}`,
      label: `波次 ${waveIndex + 1}`,
      enemies: mergeFixedOccurrences(wave.enemies).map(({ occurrence, count }) =>
        buildOccurrenceView(
          occurrence,
          enemyReferences.get(
            endgameEnemyReferenceKey(occurrence.monsterId, occurrence.monsterTemplateId)
          ),
          count
        )
      )
    }));
  return stage.waveModel.waves.map((wave, waveIndex) => {
    const occurrences = wave.monsterGroups.flatMap((monsterGroup) => monsterGroup.orderedEnemies);
    return {
      key: `spawn-${wave.waveId}`,
      label: `波次 ${waveIndex + 1}`,
      enemies: uniqueSpawnOccurrences(occurrences).map((occurrence) =>
        buildOccurrenceView(
          occurrence,
          enemyReferences.get(
            endgameEnemyReferenceKey(occurrence.monsterId, occurrence.monsterTemplateId)
          )
        )
      )
    };
  });
}
