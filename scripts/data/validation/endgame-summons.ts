import { isDeepStrictEqual } from 'node:util';
import type {
  DecimalString,
  EliteGroupTable,
  EndgameDatasetByMode,
  EndgameModeDataset,
  EndgameStage,
  EnemyOccurrence,
  SummonedEnemyOccurrence
} from '../../../src/lib/domain/endgame.js';
import { supportsEndgameSummons } from '../../../src/lib/domain/endgame.js';
import {
  addDecimals,
  decimalEquals,
  decimalOf,
  internalStanceToToughness,
  multiplyDecimals,
  parseDecimal
} from '../decimal.js';
import { readTable } from '../raw.js';
import { createEnemyPhaseHpResolver } from '../enemy-phase-hp.js';
import {
  createSummonTaskResolver,
  directSummonIds,
  resolveSummonContext
} from '../endgame-summons.js';

type Raw = Record<string, any>;

function* placements(dataset: EndgameModeDataset): Generator<{
  stage: EndgameStage;
  enemy: EnemyOccurrence;
  waveId: number;
  monsterGroupId?: number;
  position: number;
}> {
  for (const group of dataset.groups)
    for (const encounter of group.encounters)
      for (const battle of encounter.battles)
        for (const stage of battle.stages) {
          const model = stage.waveModel;
          if (model.kind === 'fixed') {
            for (const wave of model.waves)
              for (const [position, enemy] of wave.enemies.entries())
                yield { stage, enemy, waveId: wave.wave, position };
          } else {
            for (const wave of model.waves)
              for (const spawn of wave.monsterGroups)
                for (const [position, enemy] of spawn.orderedEnemies.entries())
                  yield {
                    stage,
                    enemy,
                    waveId: wave.waveId,
                    monsterGroupId: spawn.monsterGroupId,
                    position
                  };
          }
        }
}

/** Artifact-only checks used by the build-input gate. */
export function assertSummonArtifacts(
  dataset: EndgameModeDataset,
  nameFor: (target: SummonedEnemyOccurrence) => string | undefined
) {
  for (const { stage, enemy } of placements(dataset)) {
    if (enemy.summonTargets === undefined) continue;
    const fail = (message: string) => {
      throw new Error(
        `${dataset.mode} stage=${stage.stageId} monster=${enemy.monsterId} summonTargets: ${message}`
      );
    };
    if (!supportsEndgameSummons(dataset.mode, stage.waveModel.kind)) fail('invalid owner');
    if (!Array.isArray(enemy.summonTargets) || !enemy.summonTargets.length)
      fail('invalid collection');
    let previous = -1;
    for (const target of enemy.summonTargets) {
      const index = enemy.mechanics.summons.indexOf(target.monsterId);
      if (
        index <= previous ||
        'summonTargets' in target ||
        'mechanics' in target ||
        'occurrenceId' in target
      )
        fail(`invalid target or declaration order ${target.monsterId}`);
      previous = index;
      const name = nameFor(target);
      if (!name || name !== target.name)
        fail(`concrete target ${target.monsterId} does not match the locale enemy artifact`);
      if (
        target.context?.level !== stage.level ||
        target.context.hardLevelGroup !== stage.hardLevelGroup ||
        target.context.source !== 'summoner-occurrence' ||
        target.context.eliteContextSource !== enemy.hp.eliteContextSource ||
        target.context.confidence !== 'inferred' ||
        !Array.isArray(target.context.eliteCandidates) ||
        !target.context.eliteCandidates.every(
          (candidate) =>
            Number.isSafeInteger(candidate.id) &&
            candidate.id > 0 &&
            (candidate.table === 'elite' ||
              candidate.table === 'infinite-elite' ||
              (candidate.table === null && target.context.eliteSelection === 'unresolved')) &&
            (candidate.source === 'task-override' ||
              (candidate.source === 'summoner-occurrence' &&
                candidate.id === enemy.hp.eliteGroupId &&
                candidate.table === enemy.hp.eliteGroupTable))
        ) ||
        new Set(target.context.eliteCandidates.map(({ id, table }) => `${table}:${id}`)).size !==
          target.context.eliteCandidates.length ||
        (!target.context.eliteCandidates.length &&
          target.context.eliteSelection !== 'unresolved') ||
        !['inherited', 'task-override', 'compare-candidates', 'unresolved'].includes(
          target.context.eliteSelection
        )
      )
        fail(`invalid context for ${target.monsterId}`);
      if (
        !['configured', 'shared', 'unresolved'].includes(target.hp?.status) ||
        (target.hp.status !== 'configured' && ('factors' in target.hp || 'phases' in target.hp))
      )
        fail(`invalid HP resolution for ${target.monsterId}`);
    }
  }
}

const by = (rows: Raw[], field: string) => new Map(rows.map((row) => [row[field], row]));

function configuredStat(
  stat: 'Speed' | 'Stance',
  template: Raw,
  monster: Raw,
  hard: Raw,
  elite: Raw
) {
  if (template[`${stat}Base`]?.Value === undefined) return undefined;
  return multiplyDecimals([
    addDecimals([
      multiplyDecimals([
        decimalOf(template[`${stat}Base`], stat),
        parseDecimal(monster[`${stat}ModifyRatio`]?.Value ?? '1')
      ]),
      parseDecimal(monster[`${stat}ModifyValue`]?.Value ?? '0')
    ]),
    decimalOf(hard[`${stat}Ratio`], stat),
    decimalOf(elite[`${stat}Ratio`], stat)
  ]);
}

function consensus(values: (DecimalString | undefined)[]) {
  const first = values[0];
  return first !== undefined &&
    values.every((value) => value !== undefined && decimalEquals(first, value))
    ? first
    : undefined;
}

/** Reopen placement, table and variant sources before checking candidate arithmetic. */
export async function validateSummonSemantics(
  root: string,
  datasets: EndgameDatasetByMode,
  raw: { templates: Raw[]; monsters: Raw[]; hardLevels: Raw[]; elites: Raw[]; skills: Raw[] }
) {
  const [
    stageRows,
    eventRows,
    waveGroupRows,
    waveRows,
    spawnRows,
    infiniteEliteRows,
    invasions,
    invasionBuffs,
    mazeBuffs,
    battleEventRows
  ] = await Promise.all(
    [
      'StageConfig',
      'PlaneEvent',
      'StageInfiniteGroup',
      'StageInfiniteWaveConfig',
      'StageInfiniteMonsterGroup',
      'InfiniteEliteGroup',
      'StageInvasionConfig',
      'StageInvasionBuff',
      'MazeBuff',
      'BattleEventConfig'
    ].map((name) => readTable<Raw>(root, name))
  );
  const stages = by(stageRows, 'StageID');
  const events = new Map<number, Set<number>>();
  for (const { EventID, StageID } of eventRows) {
    if (!StageID) continue;
    if (!events.has(EventID)) events.set(EventID, new Set());
    events.get(EventID)!.add(StageID);
  }
  const waveGroups = by(waveGroupRows, 'WaveGroupID');
  const waves = by(waveRows, 'InfiniteWaveID');
  const spawnGroups = by(spawnRows, 'InfiniteMonsterGroupID');
  const invasionByStage = by(invasions, 'StageID');
  const invasionBuffById = by(invasionBuffs, 'InvasionID');
  const firstMazeBuff = by(
    mazeBuffs.filter((row) => (row.Lv ?? 1) === 1),
    'ID'
  );

  const templates = by(raw.templates, 'MonsterTemplateID');
  const monsters = by(raw.monsters, 'MonsterID');
  const hardLevels = new Map(
    raw.hardLevels.map((row) => [`${row.HardLevelGroup}:${row.Level}`, row])
  );
  const elites = {
    elite: by(raw.elites, 'EliteGroup'),
    'infinite-elite': by(infiniteEliteRows, 'EliteGroup')
  };
  const tablesFor = (id: number) =>
    (Object.keys(elites) as EliteGroupTable[]).filter((table) => elites[table].has(id));
  const taskEvidence = createSummonTaskResolver(
    root,
    raw.skills,
    battleEventRows.map(({ BattleEventID, AbilityList }) => ({ BattleEventID, AbilityList }))
  );
  const phaseHp = createEnemyPhaseHpResolver(root, raw.skills);

  for (const dataset of Object.values(datasets))
    for (const { stage, enemy, waveId, monsterGroupId, position } of placements(dataset)) {
      const fail = (property: string): never => {
        throw new Error(
          `Invalid ${dataset.mode} summon ${stage.stageId}:${enemy.monsterId} ${property}`
        );
      };
      const actual = enemy.summonTargets ?? [];
      if (!supportsEndgameSummons(dataset.mode, stage.waveModel.kind)) {
        if (enemy.summonTargets !== undefined) fail('unsupported mode or wave');
        continue;
      }
      const owner = monsters.get(enemy.monsterId)!;
      const rawIds = (owner.SummonIDList ?? []).filter(Number.isSafeInteger);
      if (!rawIds.length && !actual.length) continue;
      const rawStage = stages.get(stage.stageId) ?? fail('raw StageConfig');
      if (
        events.get(stage.eventId)?.size !== 1 ||
        !events.get(stage.eventId)?.has(stage.stageId) ||
        rawStage.Level !== stage.level ||
        rawStage.HardLevelGroup !== stage.hardLevelGroup
      )
        fail('PlaneEvent or StageConfig scaling');
      let contextualEliteId: number | undefined = rawStage.EliteGroup;
      if (stage.waveModel.kind === 'spawn-sequence') {
        const groupRefs = (rawStage.StageConfigData ?? []).filter(
          (row: Raw) => row.BFLIFKBEOPJ === '_StageInfiniteGroup'
        );
        const group = waveGroups.get(stage.waveModel.waveGroupId);
        const spawn = spawnGroups.get(monsterGroupId);
        if (
          groupRefs.length !== 1 ||
          Number(groupRefs[0].MNDFOPKBHKP) !== stage.waveModel.waveGroupId ||
          !group?.WaveIDList?.includes(waveId) ||
          !waves.get(waveId)?.MonsterGroupIDList?.includes(monsterGroupId) ||
          spawn?.MonsterList?.[position] !== enemy.monsterId
        )
          fail('AA spawn placement');
        contextualEliteId = spawn!.EliteGroup;
      } else {
        const ids = Object.entries(rawStage.MonsterList?.[waveId - 1] ?? {})
          .sort(([a], [b]) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))
          .map(([, id]) => Number(id))
          .filter((id) => id > 0);
        if (ids[position] !== enemy.monsterId) fail('fixed placement');
      }
      const id = contextualEliteId || owner.EliteGroup;
      const [table, ...otherTables] = tablesFor(id);
      const source = contextualEliteId
        ? monsterGroupId === undefined
          ? 'stage'
          : 'spawn-group'
        : 'monster-fallback';
      if (
        !table ||
        otherTables.length ||
        (source !== 'spawn-group' && table !== 'elite') ||
        id !== enemy.hp.eliteGroupId ||
        table !== enemy.hp.eliteGroupTable ||
        source !== enemy.hp.eliteContextSource
      )
        fail('actor EliteGroup table or source');
      const evidence = await taskEvidence(
        owner,
        templates.get(owner.MonsterTemplateID)?.JsonConfig
      );
      const expectedIds = directSummonIds(
        rawIds,
        enemy.monsterId,
        evidence,
        (id) => templates.has(monsters.get(id)?.MonsterTemplateID),
        () => {}
      );
      if (
        !isDeepStrictEqual(enemy.mechanics.summons, rawIds) ||
        !isDeepStrictEqual(
          actual.map((target) => target.monsterId),
          expectedIds
        )
      )
        fail('declaration');

      const hard =
        hardLevels.get(`${rawStage.HardLevelGroup}:${rawStage.Level}`) ?? fail('HardLevelGroup');
      const invasion = invasionByStage.get(stage.stageId);
      const invasionBuff = invasionBuffById.get(invasion?.InvasionID);
      const voracity = firstMazeBuff
        .get(invasionBuff?.MazeBuffID)
        ?.InBattleBindingKey?.match(/^ChallengePeakBattle_GluttonyAbility_LV([1-9]\d*)$/);
      for (const target of actual) {
        const monster = monsters.get(target.monsterId)!;
        const template = templates.get(monster.MonsterTemplateID)!;
        const policy = resolveSummonContext(
          enemy.monsterId,
          target.monsterId,
          { id, table },
          evidence,
          tablesFor
        );
        if (
          target.monsterTemplateId !== monster.MonsterTemplateID ||
          !isDeepStrictEqual(target.context.eliteCandidates, policy.eliteCandidates) ||
          target.context.eliteSelection !== policy.eliteSelection ||
          !isDeepStrictEqual(target.context.evidence ?? [], policy.evidence)
        )
          fail('provenance');
        const voracityLevel =
          voracity &&
          invasion?.MonsterInvasionList?.some((row: Raw) => row.DBLDCKODNEN === target.monsterId)
            ? Number(voracity[1])
            : undefined;
        if (target.voracityLevel !== voracityLevel) fail(`Voracity ${target.monsterId}`);

        const candidates = policy.eliteCandidates.map(({ id, table }) => {
          const row = table && elites[table].get(id);
          if (!row) return undefined;
          const factors = [template.HPBase, monster.HPModifyRatio, hard.HPRatio, row.HPRatio];
          const hp = factors.every(
            (factor) =>
              typeof factor?.Value === 'string' && /^[+-]?\d+(?:\.\d+)?$/.test(factor.Value)
          )
            ? factors.map((factor) => decimalOf(factor, 'summon HP factor'))
            : undefined;
          return {
            hp,
            speed: configuredStat('Speed', template, monster, hard, row),
            stance: configuredStat('Stance', template, monster, hard, row)
          };
        });
        const hp = consensus(
          candidates.map((candidate) => candidate?.hp && multiplyDecimals(candidate.hp))
        );
        const hpStatus = policy.shared
          ? 'shared'
          : hp !== undefined && !policy.unresolved.has('hp')
            ? 'configured'
            : 'unresolved';
        if (target.hp.status !== hpStatus) fail(`HP availability ${target.monsterId}`);
        if (target.hp.status === 'configured') {
          const { hpBase, instanceRatio, levelRatio, eliteRatio, baseEncounterMaxHpPerBar } =
            target.hp.factors;
          if (
            !isDeepStrictEqual(
              [hpBase, instanceRatio, levelRatio, eliteRatio],
              candidates[0]?.hp
            ) ||
            !decimalEquals(hp!, baseEncounterMaxHpPerBar)
          )
            fail(`HP factors ${target.monsterId}`);
          const expected = await phaseHp(monster, template, {
            status: 'resolved',
            source: 'base-encounter',
            rounding: 'display-half-up',
            maxHpPerBar: baseEncounterMaxHpPerBar
          });
          if (!isDeepStrictEqual(target.hp.phases, expected)) fail(`phase HP ${target.monsterId}`);
        }
        const speed = policy.unresolved.has('speed')
          ? undefined
          : consensus(candidates.map((candidate) => candidate?.speed));
        if (
          target.speed.status === 'resolved'
            ? speed === undefined || !decimalEquals(speed, target.speed.configuredValue)
            : speed !== undefined
        )
          fail(`Speed ${target.monsterId}`);
        const stance = policy.unresolved.has('toughness')
          ? undefined
          : consensus(candidates.map((candidate) => candidate?.stance));
        const actualStance = target.toughness.internalStance;
        if (
          actualStance.status === 'resolved'
            ? stance === undefined || !decimalEquals(stance, actualStance.resolvedInternal)
            : stance !== undefined
        )
          fail(`Stance ${target.monsterId}`);
        const display = target.toughness.display;
        if (
          (display.status === 'resolved' ? parseDecimal(display.perBar) : undefined) !==
          (stance === undefined ? undefined : internalStanceToToughness(stance))
        )
          fail(`Stance conversion ${target.monsterId}`);
      }
    }
}
