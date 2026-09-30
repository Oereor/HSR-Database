import type {
  EnemySkillDamageTarget,
  EnemySkillDetailDomain
} from '../../src/lib/domain/neutral.js';
import type { DecimalString } from '../../src/lib/domain/endgame.js';
import { decimalEquals } from './decimal.js';
import { normalizedActionShift, resolveSkillValue } from './enemy-skill-params.js';

import { collectEnemySkillDamage, type EnemySkillDamageDiagnostic } from './enemy-skill-damage.js';
export type { EnemySkillDamageDiagnostic } from './enemy-skill-damage.js';
export { normalizeEnemySkillMultipliers } from './enemy-skill-damage.js';

type Raw = Record<string, any>;

export type EnemySkillChanceDiagnostic =
  'chance-unresolved' | 'chance-unsupported-target' | 'chance-ambiguous-application';

interface Task {
  raw: Raw;
  conditional: boolean;
}

export interface SkillSemanticSource {
  monsterId: string;
  skillId: string;
  triggerKey: string;
  params: ReadonlyMap<string, readonly (DecimalString | undefined)[]>;
  character: Raw;
  ability: Raw;
  statusesByModifier: ReadonlyMap<string, string>;
  onDamageDiagnostic?: (reason: EnemySkillDamageDiagnostic) => void;
  onChanceDiagnostic?: (reason: EnemySkillChanceDiagnostic) => void;
}

function asRaw(value: unknown): Raw | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : undefined;
}

function alias(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return asRaw(value)?.Alias;
}

function target(value: unknown): EnemySkillDamageTarget | 'self' | undefined {
  switch (alias(value)) {
    case 'AbilityTargetEntity':
      return 'primary';
    case 'AbilityTargetAdjoinEntity':
      return 'adjacent';
    case 'AllEnemy':
      return 'all';
    case 'AllTeammate':
      return 'enemy-side';
    case 'Caster':
      return 'self';
    default:
      return undefined;
  }
}

function linkedAbilityNames(ability: Raw, triggerKey: string): Set<string> {
  const names = new Set<string>();
  for (const row of Array.isArray(ability.characterSkillAbilities)
    ? ability.characterSkillAbilities
    : [])
    if (row.Skill === triggerKey)
      for (const name of Array.isArray(row.AbilityList) ? row.AbilityList : [])
        if (typeof name === 'string') names.add(name);
  const entry = (Array.isArray(ability.characterSkills) ? ability.characterSkills : []).find(
    (row: Raw) => row.Name === triggerKey
  )?.EntryAbility;
  if (typeof entry === 'string') names.add(entry);
  return names;
}

/** Preserve the existing Chance/action-shift traversal independently of damage candidates. */
function tasksFor(ability: Raw, triggerKey: string): Task[] {
  const names = linkedAbilityNames(ability, triggerKey);
  const result: Task[] = [];
  const walk = (value: unknown, conditional: boolean): void => {
    if (Array.isArray(value)) {
      for (const child of value) walk(child, conditional);
      return;
    }
    const row = asRaw(value);
    if (!row) return;
    if (typeof row.$type === 'string') result.push({ raw: row, conditional });
    for (const [key, child] of Object.entries(row)) {
      if (key === '$type' || key === 'Predicate') continue;
      walk(
        child,
        conditional || key === 'SuccessTaskList' || key === 'FailedTaskList' || key === 'TaskList'
      );
    }
  };
  for (const row of Array.isArray(ability.AbilityList) ? ability.AbilityList : [])
    if (names.has(row.Name)) walk(row, false);
  return result;
}

export function parseEnemySkillDetail(
  source: SkillSemanticSource
): EnemySkillDetailDomain | undefined {
  const linkedAbility: Raw = {
    ...source.ability,
    characterSkillAbilities: source.character.SkillAbilityList,
    characterSkills: source.character.SkillList
  };
  const tasks = tasksFor(linkedAbility, source.triggerKey);
  if (!tasks.length) return undefined;
  const floats = source.character.DynamicValues?.Floats ?? {};
  const resolve = (value: unknown) => resolveSkillValue(value, source.params, floats);
  const names = linkedAbilityNames(linkedAbility, source.triggerKey);
  const damage = collectEnemySkillDamage(
    (Array.isArray(linkedAbility.AbilityList) ? linkedAbility.AbilityList : []).filter((row: Raw) =>
      names.has(row.Name)
    ),
    source.skillId,
    resolve,
    source.onDamageDiagnostic
  );
  const statusCandidates: Array<{
    modifierName: string;
    statusId?: string;
    role: EnemySkillDamageTarget | 'self';
    chance: DecimalString;
  }> = [];
  const invalidApplications = new Set<string>();
  const actionShifts: NonNullable<EnemySkillDetailDomain['actionShifts']> = [];
  for (const { raw, conditional } of tasks) {
    if (raw.$type === 'RPG.GameCore.AddModifier' && raw.Chance !== undefined) {
      const modifierName = String(raw.ModifierName?.Value ?? '');
      const role = target(raw.TargetType);
      if (!modifierName) {
        source.onChanceDiagnostic?.('chance-ambiguous-application');
        continue;
      }
      if (!role) {
        source.onChanceDiagnostic?.('chance-unsupported-target');
        continue;
      }
      const chance = resolve(raw.Chance);
      const key = `${modifierName}:${role}`;
      if (!chance || chance.startsWith('-')) {
        invalidApplications.add(key);
        source.onChanceDiagnostic?.('chance-unresolved');
        continue;
      }
      statusCandidates.push({
        modifierName,
        ...(source.statusesByModifier.has(modifierName)
          ? { statusId: source.statusesByModifier.get(modifierName)! }
          : {}),
        role,
        chance
      });
    }
    if (raw.$type === 'RPG.GameCore.ModifyActionDelay' && !conditional) {
      const value = resolve(raw.AddNormalizedValue);
      const shift = value && normalizedActionShift(value);
      if (shift) actionShifts.push(shift);
    }
  }
  const candidatesByIdentity = new Map<string, typeof statusCandidates>();
  for (const candidate of statusCandidates) {
    const key = `${candidate.modifierName}:${candidate.role}`;
    candidatesByIdentity.set(key, [...(candidatesByIdentity.get(key) ?? []), candidate]);
  }
  const settled: typeof statusCandidates = [];
  for (const [key, candidates] of candidatesByIdentity) {
    if (
      invalidApplications.has(key) ||
      candidates.some((candidate) => !decimalEquals(candidate.chance, candidates[0].chance))
    ) {
      source.onChanceDiagnostic?.('chance-ambiguous-application');
      continue;
    }
    settled.push(candidates[0]);
  }
  const distinct: typeof settled = [];
  for (const candidate of settled) {
    if (
      !distinct.some(
        (existing) =>
          existing.statusId === candidate.statusId &&
          existing.role === candidate.role &&
          decimalEquals(existing.chance, candidate.chance)
      )
    )
      distinct.push(candidate);
  }
  const uniqueApplications: NonNullable<EnemySkillDetailDomain['applications']> = [];
  for (const candidate of distinct) {
    const competitors = distinct.filter(
      (other) => other !== candidate && other.role === candidate.role
    );
    if (
      !candidate.statusId &&
      competitors.some((other) => !decimalEquals(other.chance, candidate.chance))
    ) {
      source.onChanceDiagnostic?.('chance-ambiguous-application');
      continue;
    }
    uniqueApplications.push({
      baseChance: candidate.chance,
      ...(candidate.statusId ? { statusId: candidate.statusId } : {}),
      ...(candidate.role === 'self' ? {} : { target: candidate.role })
    });
  }
  const uniqueShifts = [
    ...new Map(actionShifts.map((shift) => [`${shift.kind}:${shift.ratio}`, shift])).values()
  ];
  if (!damage.length && !uniqueApplications.length && uniqueShifts.length !== 1) return undefined;
  return {
    ...(damage.length ? { damage } : {}),
    ...(uniqueApplications.length ? { applications: uniqueApplications } : {}),
    ...(uniqueShifts.length === 1 ? { actionShifts: uniqueShifts } : {})
  };
}
