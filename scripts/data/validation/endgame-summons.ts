import { isDeepStrictEqual } from 'node:util';
import type {
  EndgameModeDataset,
  EndgameStage,
  EnemyOccurrence,
  SummonedEnemyOccurrence
} from '../../../src/lib/domain/endgame.js';
import { decimalEquals, internalStanceToToughness, parseDecimal } from '../decimal.js';
import { createEnemyPhaseHpResolver } from '../enemy-phase-hp.js';
import {
  resolveEndgameHpBase,
  resolveEnemyConfiguredStat,
  resolveEnemyInternalStance
} from '../enemy-stats.js';
import {
  createSummonTaskResolver,
  directSummonIds,
  resolveSummonContext
} from '../endgame-summons.js';

type Raw = Record<string, any>;

function* placements(
  dataset: EndgameModeDataset
): Generator<{ stage: EndgameStage; enemy: EnemyOccurrence }> {
  for (const group of dataset.groups)
    for (const encounter of group.encounters ?? [])
      for (const battle of encounter.battles)
        for (const stage of battle.stages) {
          const enemies =
            stage.waveModel.kind === 'fixed'
              ? stage.waveModel.waves.flatMap((wave) => wave.enemies)
              : stage.waveModel.waves.flatMap((wave) =>
                  wave.monsterGroups.flatMap((group) => group.orderedEnemies)
                );
          for (const enemy of enemies) yield { stage, enemy };
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
    if (dataset.mode !== 'moc' || stage.waveModel.kind !== 'fixed') fail('invalid owner');
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
        !Array.isArray(target.context.eliteGroupIds) ||
        !target.context.eliteGroupIds.every((id) => Number.isSafeInteger(id) && id > 0) ||
        new Set(target.context.eliteGroupIds).size !== target.context.eliteGroupIds.length ||
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

/** Reopen the variant, level and group inputs used by the emitted relation. */
export async function validateSummonSemantics(
  root: string,
  dataset: EndgameModeDataset,
  raw: {
    templates: Raw[];
    monsters: Raw[];
    hardLevels: Raw[];
    elites: Raw[];
    skills: Raw[];
  }
) {
  const templates = new Map(raw.templates.map((row) => [row.MonsterTemplateID, row]));
  const monsters = new Map(raw.monsters.map((row) => [row.MonsterID, row]));
  const hardLevels = new Map(
    raw.hardLevels.map((row) => [`${row.HardLevelGroup}:${row.Level}`, row])
  );
  const elites = new Map(raw.elites.map((row) => [row.EliteGroup, row]));
  const taskEvidence = createSummonTaskResolver(root, raw.skills);
  const phaseHp = createEnemyPhaseHpResolver(root, raw.skills);
  for (const { stage, enemy } of placements(dataset)) {
    const owner = monsters.get(enemy.monsterId)!;
    const rawIds = owner.SummonIDList ?? [];
    const actual = enemy.summonTargets ?? [];
    if (!rawIds.length && !actual.length) continue;
    const evidence = await taskEvidence(owner, templates.get(owner.MonsterTemplateID)?.JsonConfig);
    const expectedIds = directSummonIds(
      rawIds,
      enemy.monsterId,
      evidence,
      (id) => templates.has(monsters.get(id)?.MonsterTemplateID),
      () => {}
    );
    const fail = (property: string) => {
      throw new Error(`Invalid MoC summon ${stage.stageId}:${enemy.monsterId} ${property}`);
    };
    if (
      !isDeepStrictEqual(
        actual.map((target) => target.monsterId),
        expectedIds
      )
    )
      fail('declaration');
    for (const target of actual) {
      const monster = monsters.get(target.monsterId)!;
      const template = templates.get(monster.MonsterTemplateID)!;
      const policy = resolveSummonContext(
        enemy.monsterId,
        target.monsterId,
        enemy.hp.eliteGroupId,
        enemy.hp.eliteContextSource,
        monster.EliteGroup,
        evidence
      );
      if (
        target.monsterTemplateId !== monster.MonsterTemplateID ||
        !isDeepStrictEqual(target.context.eliteGroupIds, policy.eliteGroupIds) ||
        target.context.eliteSelection !== policy.eliteSelection ||
        !isDeepStrictEqual(target.context.evidence ?? [], policy.evidence)
      )
        fail('provenance');
      if ((target.hp.status === 'shared') !== policy.shared) fail('shared HP');
      if (policy.unresolved.has('hp') && !policy.shared && target.hp.status !== 'unresolved')
        fail('runtime HP');
      const hard = hardLevels.get(`${stage.hardLevelGroup}:${stage.level}`)!;
      for (const [index, group] of policy.eliteGroupIds.entries()) {
        const elite = elites.get(group);
        if (!elite) continue;
        if (target.hp.status === 'configured') {
          const factors = resolveEndgameHpBase(
            template.HPBase,
            monster.HPModifyRatio,
            hard.HPRatio,
            elite.HPRatio
          );
          if (
            !decimalEquals(
              factors.baseEncounterMaxHpPerBar,
              target.hp.factors.baseEncounterMaxHpPerBar
            ) ||
            (index === 0 && !isDeepStrictEqual(factors, target.hp.factors))
          )
            fail('HP factors');
        }
        if (target.speed.status === 'resolved') {
          const speed = resolveEnemyConfiguredStat('Speed', {
            base: template.SpeedBase,
            instanceRatio: monster.SpeedModifyRatio,
            instanceValue: monster.SpeedModifyValue,
            levelRatio: hard.SpeedRatio,
            eliteRatio: elite.SpeedRatio
          });
          if (
            policy.unresolved.has('speed') ||
            speed.status !== 'resolved' ||
            !decimalEquals(speed.configuredValue, target.speed.configuredValue)
          )
            fail('Speed');
        }
        const actualStance = target.toughness.internalStance;
        if (actualStance.status === 'resolved') {
          const stance = resolveEnemyInternalStance({
            base: template.StanceBase,
            instanceRatio: monster.StanceModifyRatio,
            instanceValue: monster.StanceModifyValue,
            levelRatio: hard.StanceRatio,
            eliteRatio: elite.StanceRatio
          });
          const display = target.toughness.display;
          if (
            policy.unresolved.has('toughness') ||
            stance.status !== 'resolved' ||
            !decimalEquals(stance.resolvedInternal, actualStance.resolvedInternal) ||
            (display.status === 'resolved' ? parseDecimal(display.perBar) : undefined) !==
              internalStanceToToughness(actualStance.resolvedInternal)
          )
            fail('Stance');
        }
      }
      if (target.hp.status === 'configured') {
        const expected = await phaseHp(monster, template, {
          status: 'resolved',
          source: 'base-encounter',
          rounding: 'display-half-up',
          maxHpPerBar: target.hp.factors.baseEncounterMaxHpPerBar
        });
        if (!isDeepStrictEqual(target.hp.phases, expected)) fail('phase HP');
      }
    }
  }
}
