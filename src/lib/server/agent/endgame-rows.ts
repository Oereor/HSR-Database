import type { EndgameFilter, NormalizedEndgameRow } from '../../agent/contracts.js';
import type { EndgameGroup, EndgameMode, EnemyOccurrence } from '../../domain/endgame.js';
import { getEnemyRankCategory, type EnemyRank } from '../../domain/enemy-rank.js';
import { isElementType } from '../../domain/elements.js';
import type { Enemy, Monster } from '../../domain/types.js';
import { defaultAgentDataSource, type AgentDataSource } from './data-source.js';

export const AGENT_ENDGAME_MODES = [
  'moc',
  'pf',
  'as',
  'aa'
] as const satisfies readonly EndgameMode[];

type SeasonStatus = NormalizedEndgameRow['season']['status'];

interface CandidateOccurrence {
  mode: EndgameMode;
  group: EndgameGroup;
  encounter: EndgameGroup['encounters'][number];
  battleSlot: number;
  stage: EndgameGroup['encounters'][number]['battles'][number]['stages'][number];
  stageOrdinal: number;
  waveKind: 'fixed' | 'spawn-sequence';
  waveNumberOrId: number;
  monsterGroupId: number | null;
  configuredPosition: number;
  occurrence: EnemyOccurrence;
  status: SeasonStatus;
}

export interface LoadRowsOptions {
  dataSource?: AgentDataSource;
  now?: number;
}

function parseSchedule(value: string): number {
  return Date.parse(`${value.replace(' ', 'T')}+08:00`);
}

export function getSeasonStatus(group: EndgameGroup, now = Date.now()): SeasonStatus {
  if (!group.schedule) return 'unknown';
  const begin = parseSchedule(group.schedule.begin);
  const end = parseSchedule(group.schedule.end);
  return begin <= now && now < end ? 'current' : now < begin ? 'upcoming' : 'historical';
}

function selectedModes(filter: EndgameFilter): EndgameMode[] {
  if (filter.modes) return AGENT_ENDGAME_MODES.filter((mode) => filter.modes!.includes(mode));
  if (filter.seasons?.kind === 'ids') {
    const modes = new Set(filter.seasons.seasons.map(({ mode }) => mode));
    return AGENT_ENDGAME_MODES.filter((mode) => modes.has(mode));
  }
  return [...AGENT_ENDGAME_MODES];
}

export async function selectSeasonGroups(
  filter: EndgameFilter,
  options: LoadRowsOptions = {}
): Promise<Array<{ mode: EndgameMode; group: EndgameGroup; status: SeasonStatus }>> {
  const source = options.dataSource ?? defaultAgentDataSource;
  const now = options.now ?? Date.now();
  const result: Array<{ mode: EndgameMode; group: EndgameGroup; status: SeasonStatus }> = [];
  const explicit =
    filter.seasons?.kind === 'ids'
      ? new Set(filter.seasons.seasons.map(({ mode, groupId }) => `${mode}:${groupId}`))
      : undefined;

  for (const mode of selectedModes(filter)) {
    const dataset = await source.getEndgameDataset(mode);
    let groups = dataset.groups.map((group) => ({
      mode,
      group: group as EndgameGroup,
      status: getSeasonStatus(group, now)
    }));
    if (explicit) groups = groups.filter(({ group }) => explicit.has(`${mode}:${group.groupId}`));
    if (filter.seasons?.kind === 'latest-per-mode') {
      if (!filter.seasons.includeUpcoming)
        groups = groups.filter(({ status }) => status !== 'upcoming');
      groups = groups
        .sort((left, right) => right.group.groupId - left.group.groupId)
        .slice(0, filter.seasons.count);
    }
    if (filter.statuses) groups = groups.filter(({ status }) => filter.statuses!.includes(status));
    result.push(...groups);
  }
  return result.sort(
    (left, right) =>
      AGENT_ENDGAME_MODES.indexOf(left.mode) - AGENT_ENDGAME_MODES.indexOf(right.mode) ||
      right.group.groupId - left.group.groupId
  );
}

function matchesStructuralFilter(candidate: CandidateOccurrence, filter: EndgameFilter): boolean {
  const { encounter, stage, occurrence } = candidate;
  return !(
    (filter.encounterIds && !filter.encounterIds.includes(encounter.id)) ||
    (filter.encounterOrdinals &&
      (encounter.ordinal === undefined || !filter.encounterOrdinals.includes(encounter.ordinal))) ||
    (filter.encounterVariants && !filter.encounterVariants.includes(encounter.variant)) ||
    (filter.battleSlots && !filter.battleSlots.includes(candidate.battleSlot)) ||
    (filter.stageIds && !filter.stageIds.includes(stage.stageId)) ||
    (filter.levels && !filter.levels.includes(stage.level)) ||
    (filter.waveNumbersOrIds && !filter.waveNumbersOrIds.includes(candidate.waveNumberOrId)) ||
    (filter.enemyTemplateIds && !filter.enemyTemplateIds.includes(occurrence.monsterTemplateId)) ||
    (filter.monsterIds && !filter.monsterIds.includes(occurrence.monsterId))
  );
}

function collectCandidates(
  selections: Array<{ mode: EndgameMode; group: EndgameGroup; status: SeasonStatus }>,
  filter: EndgameFilter
): CandidateOccurrence[] {
  const candidates: CandidateOccurrence[] = [];
  for (const { mode, group, status } of selections)
    for (const encounter of group.encounters)
      for (const battle of encounter.battles)
        for (const [stageIndex, stage] of battle.stages.entries()) {
          if (stage.waveModel.kind === 'fixed') {
            for (const wave of stage.waveModel.waves)
              wave.enemies.forEach((occurrence, position) => {
                const candidate: CandidateOccurrence = {
                  mode,
                  group,
                  encounter,
                  battleSlot: battle.slot,
                  stage,
                  stageOrdinal: stageIndex + 1,
                  waveKind: 'fixed',
                  waveNumberOrId: wave.wave,
                  monsterGroupId: null,
                  configuredPosition: position + 1,
                  occurrence,
                  status
                };
                if (matchesStructuralFilter(candidate, filter)) candidates.push(candidate);
              });
          } else {
            for (const wave of stage.waveModel.waves)
              for (const monsterGroup of wave.monsterGroups)
                monsterGroup.orderedEnemies.forEach((occurrence, position) => {
                  const candidate: CandidateOccurrence = {
                    mode,
                    group,
                    encounter,
                    battleSlot: battle.slot,
                    stage,
                    stageOrdinal: stageIndex + 1,
                    waveKind: 'spawn-sequence',
                    waveNumberOrId: wave.waveId,
                    monsterGroupId: monsterGroup.monsterGroupId,
                    configuredPosition: position + 1,
                    occurrence,
                    status
                  };
                  if (matchesStructuralFilter(candidate, filter)) candidates.push(candidate);
                });
          }
        }
  return candidates;
}

function isFileNotFound(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

type DetailResolution =
  | { status: 'resolved'; detail: Enemy; monster: Monster }
  | { status: 'unresolved'; reason: 'missing-template-detail' | 'missing-monster'; detail?: Enemy };

async function resolveDetails(
  candidates: readonly CandidateOccurrence[],
  source: AgentDataSource
): Promise<Map<string, DetailResolution>> {
  const identities = new Map<string, { templateId: number; monsterId: number }>();
  for (const { occurrence } of candidates)
    identities.set(`${occurrence.monsterTemplateId}:${occurrence.monsterId}`, {
      templateId: occurrence.monsterTemplateId,
      monsterId: occurrence.monsterId
    });
  const details = new Map<number, Enemy | 'missing'>();
  await Promise.all(
    [...new Set([...identities.values()].map(({ templateId }) => templateId))].map(
      async (templateId) => {
        try {
          details.set(templateId, await source.getEnemyDetail(templateId));
        } catch (error) {
          if (!isFileNotFound(error)) throw error;
          details.set(templateId, 'missing');
        }
      }
    )
  );
  const resolved = new Map<string, DetailResolution>();
  for (const [key, { templateId, monsterId }] of identities) {
    const detail = details.get(templateId);
    if (!detail || detail === 'missing') {
      resolved.set(key, { status: 'unresolved', reason: 'missing-template-detail' });
      continue;
    }
    const monster = detail.monsters.find((candidate) => candidate.monsterId === String(monsterId));
    resolved.set(
      key,
      monster
        ? { status: 'resolved', detail, monster }
        : { status: 'unresolved', reason: 'missing-monster', detail }
    );
  }
  return resolved;
}

export function evidenceIdFor(candidate: CandidateOccurrence): string {
  const { occurrence } = candidate;
  return [
    'eg1',
    candidate.mode,
    candidate.group.groupId,
    encodeURIComponent(candidate.encounter.id),
    candidate.battleSlot,
    candidate.stage.stageId,
    candidate.waveKind,
    candidate.waveNumberOrId,
    candidate.monsterGroupId ?? '-',
    candidate.configuredPosition,
    occurrence.monsterId
  ].join('/');
}

function normalizeCandidate(
  candidate: CandidateOccurrence,
  detail: DetailResolution
): NormalizedEndgameRow {
  const { occurrence, group, encounter, stage } = candidate;
  const resolved = detail.status === 'resolved' ? detail : undefined;
  const rawRank = resolved?.detail.rank;
  const rank = rawRank && getEnemyRankCategory(rawRank) ? (rawRank as EnemyRank) : null;
  return {
    evidenceId: evidenceIdFor(candidate),
    grain: 'configured-occurrence',
    mode: candidate.mode,
    season: {
      groupId: group.groupId,
      name: group.name ?? null,
      begin: group.schedule?.begin ?? null,
      end: group.schedule?.end ?? null,
      status: candidate.status,
      recencyBasis: 'group-id'
    },
    encounter: {
      id: encounter.id,
      configId: encounter.configId,
      name: encounter.name ?? null,
      ordinal: encounter.ordinal ?? null,
      variant: encounter.variant
    },
    battleSlot: candidate.battleSlot,
    stage: { stageId: stage.stageId, ordinal: candidate.stageOrdinal, level: stage.level },
    wave: {
      kind: candidate.waveKind,
      numberOrId: candidate.waveNumberOrId,
      monsterGroupId: candidate.monsterGroupId,
      configuredPosition: candidate.configuredPosition
    },
    enemy: {
      monsterId: occurrence.monsterId,
      templateId: occurrence.monsterTemplateId,
      name: occurrence.name ?? resolved?.detail.name ?? detail.detail?.name ?? null,
      detailStatus: detail.status,
      detailReason: detail.status === 'unresolved' ? detail.reason : null,
      rank,
      rankCategory: getEnemyRankCategory(rank ?? undefined) ?? null,
      weaknesses: (resolved?.monster.weaknesses ?? []).filter(({ element }) =>
        isElementType(element)
      ) as NormalizedEndgameRow['enemy']['weaknesses'],
      resistances: (resolved?.monster.resistances ?? [])
        .filter(({ value }) => Number.isFinite(value))
        .map(({ element, name, value }) => ({ element, name, value: String(value) })),
      specialResistances: resolved?.monster.specialResistances ?? []
    },
    stats: {
      hpPerBar: occurrence.hp.final.status === 'resolved' ? occurrence.hp.final.maxHpPerBar : null,
      hpStatus: occurrence.hp.final.status,
      hpReason: occurrence.hp.final.status === 'unresolved' ? occurrence.hp.final.reason : null,
      speed: occurrence.speed.status === 'resolved' ? occurrence.speed.configuredValue : null,
      speedStatus: occurrence.speed.status,
      speedReason: occurrence.speed.status === 'unavailable' ? occurrence.speed.reason : null,
      toughnessPerBar:
        occurrence.toughness.display.status === 'resolved'
          ? occurrence.toughness.display.perBar
          : null,
      toughnessStatus: occurrence.toughness.display.status,
      toughnessReason:
        occurrence.toughness.display.status === 'unavailable'
          ? occurrence.toughness.display.reason
          : null,
      toughnessBarCount: occurrence.toughness.barCount ?? null,
      toughnessRuntimeStatus: occurrence.toughness.runtimeStatus,
      phaseCount: occurrence.mechanics.phaseCount ?? null,
      effectiveTotalHp: occurrence.mechanics.effectiveTotalHp ?? null,
      effectiveTotalHpStatus: occurrence.mechanics.effectiveTotalHpStatus
    },
    mechanics: occurrence.mechanics
  };
}

function matchesDetailFilter(row: NormalizedEndgameRow, filter: EndgameFilter): boolean {
  return !(
    (filter.enemyRanks &&
      (row.enemy.rank === null || !filter.enemyRanks.includes(row.enemy.rank))) ||
    (filter.enemyRankCategories &&
      (row.enemy.rankCategory === null ||
        !filter.enemyRankCategories.includes(row.enemy.rankCategory))) ||
    (filter.weaknessesAny &&
      !row.enemy.weaknesses.some(({ element }) => filter.weaknessesAny!.includes(element)))
  );
}

export async function loadEndgameRows(
  filter: EndgameFilter,
  options: LoadRowsOptions = {}
): Promise<NormalizedEndgameRow[]> {
  const source = options.dataSource ?? defaultAgentDataSource;
  const selections = await selectSeasonGroups(filter, options);
  const candidates = collectCandidates(selections, filter);
  const details = await resolveDetails(candidates, source);
  const rows = candidates
    .map((candidate) => {
      const occurrence = candidate.occurrence;
      const detail = details.get(`${occurrence.monsterTemplateId}:${occurrence.monsterId}`);
      if (!detail) throw new Error('Endgame detail resolution invariant failed');
      return normalizeCandidate(candidate, detail);
    })
    .filter((row) => matchesDetailFilter(row, filter));
  const identities = new Set<string>();
  for (const row of rows) {
    if (identities.has(row.evidenceId))
      throw new Error(`Duplicate Agent evidence ID: ${row.evidenceId}`);
    identities.add(row.evidenceId);
  }
  return rows;
}
