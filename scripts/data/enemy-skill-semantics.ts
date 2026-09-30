import type {
  EnemySkillDamageTarget,
  EnemySkillDetailDomain
} from '../../src/lib/domain/neutral.js';
import type { DecimalString } from '../../src/lib/domain/endgame.js';
import { addDecimals, canonicalDecimal, compareDecimals, decimalEquals } from './decimal.js';
import { normalizedActionShift, resolveSkillValue } from './enemy-skill-params.js';

type Raw = Record<string, any>;

export type EnemySkillDamageDiagnostic =
  | 'damage-no-supported-task'
  | 'damage-not-linear'
  | 'damage-conditional'
  | 'damage-multiple-abilities'
  | 'damage-unresolved-value'
  | 'damage-unsupported-target'
  | 'damage-runtime-mutation';

export type EnemySkillChanceDiagnostic =
  'chance-unresolved' | 'chance-unsupported-target' | 'chance-ambiguous-application';

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

function tasksFor(ability: Raw, triggerKey: string, skillId: string): Task[] {
  const names = linkedAbilityNames(ability, triggerKey);
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

// These two reviewed traces have skill-specific activation/marker semantics that are
// narrower than generic conditional-path aggregation. Keep them explicit and tested.
function reviewedConditionalDamageRows(
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

interface DamageOccurrence {
  raw: Raw;
  abilityName: string;
  topLevelIndex?: number;
  role?: EnemySkillDamageTarget | 'sweep-left' | 'sweep-right' | 'self';
}

export function normalizeEnemySkillTotals(values: readonly DecimalString[]): DecimalString[] {
  return [...values]
    .sort(compareDecimals)
    .filter((value, index, ordered) => index === 0 || !decimalEquals(value, ordered[index - 1]));
}

function structuralDamageRows(
  ability: Raw,
  triggerKey: string,
  resolve: (value: unknown) => DecimalString | undefined,
  diagnostic?: (reason: EnemySkillDamageDiagnostic) => void
): NonNullable<EnemySkillDetailDomain['damage']> {
  const names = linkedAbilityNames(ability, triggerKey);
  const linked = (Array.isArray(ability.AbilityList) ? ability.AbilityList : []).filter(
    (row: Raw) => names.has(row.Name)
  );
  const occurrences: DamageOccurrence[] = [];
  const unsafeAbilities = new Map<string, EnemySkillDamageDiagnostic>();
  const walk = (value: unknown, abilityName: string, topLevelIndex?: number): void => {
    if (Array.isArray(value)) {
      for (const child of value) walk(child, abilityName);
      return;
    }
    const row = asRaw(value);
    if (!row) return;
    if (row.$type === 'RPG.GameCore.DamageByAttackProperty') {
      const rawTarget = alias(row.TargetType);
      occurrences.push({
        raw: row,
        abilityName,
        topLevelIndex,
        role:
          rawTarget === 'AbilityTargetLeftEntity'
            ? 'sweep-left'
            : rawTarget === 'AbilityTargetRightEntity'
              ? 'sweep-right'
              : target(row.TargetType)
      });
    }
    for (const [key, child] of Object.entries(row)) {
      if (key !== '$type' && key !== 'Predicate') walk(child, abilityName);
    }
  };
  for (const row of linked) {
    const abilityName = String(row.Name);
    for (const [key, value] of Object.entries(row)) {
      if (key === 'OnStart' && Array.isArray(value)) {
        for (const [index, task] of value.entries()) {
          const direct = asRaw(task)?.$type === 'RPG.GameCore.DamageByAttackProperty';
          walk(task, abilityName, direct ? index : undefined);
        }
      } else if (key !== 'Name') {
        walk(value, abilityName);
      }
    }
    const onStart = Array.isArray(row.OnStart) ? row.OnStart : [];
    const lastDamage = Math.max(
      -1,
      ...occurrences
        .filter((hit) => hit.abilityName === abilityName && hit.topLevelIndex !== undefined)
        .map((hit) => hit.topLevelIndex!)
    );
    for (const task of onStart.slice(0, lastDamage + 1)) {
      const found = new Set<string>();
      const inspect = (value: unknown): void => {
        if (Array.isArray(value)) return value.forEach(inspect);
        const item = asRaw(value);
        if (!item) return;
        if (typeof item.$type === 'string') found.add(item.$type);
        for (const [key, child] of Object.entries(item)) if (key !== 'Predicate') inspect(child);
      };
      inspect(task);
      if ([...found].some((type) => /(?:SetDynamicValue|Retarget)/.test(type)))
        unsafeAbilities.set(abilityName, 'damage-runtime-mutation');
      else if ([...found].some((type) => /(?:LoopExecuteTaskList|SkillPerformFinish)/.test(type)))
        unsafeAbilities.set(abilityName, 'damage-not-linear');
    }
  }
  if (!occurrences.length) {
    diagnostic?.('damage-no-supported-task');
    return [];
  }
  if (occurrences.some((hit) => !hit.role || hit.role === 'self')) {
    diagnostic?.('damage-unsupported-target');
    return [];
  }
  const byRole = new Map<string, DamageOccurrence[]>();
  for (const hit of occurrences) byRole.set(hit.role!, [...(byRole.get(hit.role!) ?? []), hit]);
  const rows: NonNullable<EnemySkillDetailDomain['damage']> = [];
  const rejected = new Set<EnemySkillDamageDiagnostic>();
  const accept = (role: EnemySkillDamageTarget, hits: DamageOccurrence[]) => {
    const abilities = new Set(hits.map((hit) => hit.abilityName));
    const reason =
      abilities.size > 1
        ? 'damage-multiple-abilities'
        : hits.some((hit) => hit.topLevelIndex === undefined)
          ? 'damage-conditional'
          : unsafeAbilities.get(hits[0].abilityName);
    if (reason) {
      rejected.add(reason);
      return;
    }
    const values = hits.map((hit) => resolve(hit.raw.AttackProperty?.DamagePercentage));
    if (values.some((value) => !value || value.startsWith('-'))) {
      rejected.add('damage-unresolved-value');
      return;
    }
    const total = addDecimals(values as DecimalString[]);
    // Keep pre-existing direct-value spelling stable; new products use a canonical total.
    const hasProduct = hits.some(
      (hit) => hit.raw.AttackProperty?.DamagePercentage?.PostfixExpr?.OpCodes === 'AQAAAAQR'
    );
    rows.push({
      target: role,
      totals: normalizeEnemySkillTotals([hasProduct ? canonicalDecimal(total) : total]),
      scaling: 'attack'
    });
  };
  const left = byRole.get('sweep-left') ?? [];
  const right = byRole.get('sweep-right') ?? [];
  if (left.length || right.length) {
    const center = byRole.get('primary') ?? [];
    const sweep = [...left, ...center, ...right];
    const values = sweep.map((hit) => resolve(hit.raw.AttackProperty?.DamagePercentage));
    if (
      left.length === 1 &&
      right.length === 1 &&
      center.length === 1 &&
      new Set(sweep.map((hit) => hit.abilityName)).size === 1 &&
      sweep.every((hit) => hit.topLevelIndex !== undefined) &&
      !unsafeAbilities.has(sweep[0].abilityName) &&
      values.every((value) => value && !value.startsWith('-')) &&
      values.every((value) => decimalEquals(value!, values[0]!))
    ) {
      rows.push({
        target: 'each-swept',
        totals: normalizeEnemySkillTotals([values[0]!]),
        scaling: 'attack'
      });
    } else rejected.add('damage-not-linear');
    byRole.delete('primary');
  }
  for (const [role, hits] of byRole) {
    if (role === 'sweep-left' || role === 'sweep-right') continue;
    accept(role as EnemySkillDamageTarget, hits);
  }
  for (const reason of rejected) diagnostic?.(reason);
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
  const damage =
    source.skillId === '201201002' || source.skillId === '406401207'
      ? reviewedConditionalDamageRows(source.skillId, tasks, resolve)
      : structuralDamageRows(linkedAbility, source.triggerKey, resolve, source.onDamageDiagnostic);
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
