import type {
  EnemySkillDamageTarget,
  EnemySkillDetailDomain
} from '../../src/lib/domain/neutral.js';
import type { DecimalString } from '../../src/lib/domain/endgame.js';
import { normalizedActionShift, resolveSkillValue } from './enemy-skill-params.js';

type Raw = Record<string, any>;

// Phase 1 only publishes traces checked in the investigation report. The task parser
// remains structural; this gate prevents unreviewed Ability branches becoming facts.
const VERIFIED_DAMAGE_SKILLS = new Set([
  '102201001',
  '100204001',
  '100203001',
  '100203003',
  '200401003',
  '100402001',
  '100402002',
  '100402004',
  '201201001',
  '201201002',
  '401301001',
  '401301002',
  '406401201',
  '406401207'
]);

interface Task {
  raw: Raw;
  conditional: boolean;
  marker?: 'marked' | 'other-marked';
  abilityName: string;
}

export interface SkillSemanticSource {
  monsterId: string;
  skillId: string;
  triggerKey: string;
  params: ReadonlyMap<string, readonly (DecimalString | undefined)[]>;
  character: Raw;
  ability: Raw;
  statusesByModifier: ReadonlyMap<string, string>;
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

function tasksFor(ability: Raw, triggerKey: string, skillId: string): Task[] {
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
  const result: Task[] = [];
  const walk = (
    value: unknown,
    abilityName: string,
    conditional: boolean,
    marker?: Task['marker']
  ): void => {
    if (Array.isArray(value)) {
      for (const child of value) walk(child, abilityName, conditional, marker);
      return;
    }
    const row = asRaw(value);
    if (!row) return;
    if (typeof row.$type === 'string') result.push({ raw: row, conditional, marker, abilityName });
    let nextMarker = marker;
    if (skillId === '406401207' && row.$type === 'RPG.GameCore.Retarget') {
      const modifier = row.Predicate?.ModifierName?.Value;
      if (modifier === 'MMonster_W4_Serpent_01_Charge02_Target') nextMarker = 'marked';
      if (modifier === 'MMonster_W4_Serpent_01_Charge02_Target_Sub') nextMarker = 'other-marked';
    }
    for (const [key, child] of Object.entries(row)) {
      if (key === '$type' || key === 'Predicate') continue;
      walk(
        child,
        abilityName,
        conditional || key === 'SuccessTaskList' || key === 'FailedTaskList' || key === 'TaskList',
        nextMarker
      );
    }
  };
  for (const row of Array.isArray(ability.AbilityList) ? ability.AbilityList : [])
    if (names.has(row.Name)) walk(row, row.Name, false);
  return result;
}

function damageRows(
  skillId: string,
  tasks: readonly Task[],
  resolve: (value: unknown) => DecimalString | undefined
): NonNullable<EnemySkillDetailDomain['damage']> {
  const occurrences = new Map<
    EnemySkillDamageTarget | 'sweep-edge',
    Array<{ ratio?: DecimalString; abilityName: string }>
  >();
  for (const task of tasks) {
    if (task.raw.$type !== 'RPG.GameCore.DamageByAttackProperty') continue;
    const rawTarget = alias(task.raw.TargetType);
    if (task.conditional && !task.marker && skillId !== '201201002') continue;
    const role =
      rawTarget === 'AbilityTargetLeftEntity' || rawTarget === 'AbilityTargetRightEntity'
        ? 'sweep-edge'
        : (task.marker ?? target(task.raw.TargetType));
    if (!role || role === 'self') continue;
    const resolved = resolve(task.raw.AttackProperty?.DamagePercentage);
    const ratio = resolved && !resolved.startsWith('-') ? resolved : undefined;
    occurrences.set(role, [
      ...(occurrences.get(role) ?? []),
      { ratio, abilityName: task.abilityName }
    ]);
  }
  const rows: NonNullable<EnemySkillDetailDomain['damage']> = [];
  const edges = occurrences.get('sweep-edge') ?? [];
  const centers = occurrences.get('primary') ?? [];
  // A sweep is one hit per position, not three hits against the same target.
  if (
    edges.length === 2 &&
    centers.length === 1 &&
    centers[0].ratio &&
    edges.every((edge) => edge.ratio === centers[0].ratio)
  ) {
    rows.push({ target: 'each-swept', totals: [centers[0].ratio], scaling: 'attack' });
    occurrences.delete('primary');
  }
  for (const [role, hits] of occurrences) {
    if (role === 'sweep-edge' || !hits.length || !hits[0].ratio) continue;
    if (hits.some((hit) => hit.ratio !== hits[0].ratio)) continue;
    if (new Set(hits.map((hit) => hit.abilityName)).size !== hits.length) continue;
    rows.push({ target: role, totals: [hits[0].ratio], scaling: 'attack' });
  }
  return rows;
}

export function parseEnemySkillDetail(
  source: SkillSemanticSource
): EnemySkillDetailDomain | undefined {
  const linkedAbility = {
    ...source.ability,
    characterSkillAbilities: source.character.SkillAbilityList,
    characterSkills: source.character.SkillList
  };
  const tasks = tasksFor(linkedAbility, source.triggerKey, source.skillId);
  if (!tasks.length) return undefined;
  const floats = source.character.DynamicValues?.Floats ?? {};
  const resolve = (value: unknown) => resolveSkillValue(value, source.params, floats);
  const damage = VERIFIED_DAMAGE_SKILLS.has(source.skillId)
    ? damageRows(source.skillId, tasks, resolve)
    : [];
  const statusCandidates: Array<{
    statusId: string;
    role: EnemySkillDamageTarget | 'self';
    chance?: DecimalString;
  }> = [];
  const actionShifts: NonNullable<EnemySkillDetailDomain['actionShifts']> = [];
  for (const { raw, conditional } of tasks) {
    if (raw.$type === 'RPG.GameCore.AddModifier') {
      const statusId = source.statusesByModifier.get(String(raw.ModifierName?.Value ?? ''));
      const role = target(raw.TargetType);
      if (!statusId || !role) continue;
      const chance = resolve(raw.Chance);
      statusCandidates.push({
        statusId,
        role,
        ...(chance && !chance.startsWith('-') ? { chance } : {})
      });
    }
    if (raw.$type === 'RPG.GameCore.ModifyActionDelay' && !conditional) {
      const value = resolve(raw.AddNormalizedValue);
      const shift = value && normalizedActionShift(value);
      if (shift) actionShifts.push(shift);
    }
  }
  const uniqueApplications: NonNullable<EnemySkillDetailDomain['applications']> = [
    ...new Map(statusCandidates.map((candidate) => [candidate.statusId, candidate])).values()
  ].flatMap(({ statusId, role, chance }) =>
    chance ? [{ baseChance: chance, statusId, ...(role === 'self' ? {} : { target: role }) }] : []
  );
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
