import type {
  EnemySkillDamageTarget,
  EnemySkillDetailDomain
} from '../../src/lib/domain/neutral.js';
import type { DecimalString } from '../../src/lib/domain/endgame.js';
import { addDecimals, canonicalDecimal, compareDecimals, decimalEquals } from './decimal.js';

type Raw = Record<string, any>;
type Role = EnemySkillDamageTarget | 'sweep-left' | 'sweep-right';
type Marker = 'marked' | 'other-marked';
type DamageRows = NonNullable<EnemySkillDetailDomain['damage']>;

export type EnemySkillDamageDiagnostic =
  | 'damage-unresolved-value'
  | 'damage-unsupported-expression'
  | 'damage-negative-value'
  | 'damage-target-unmapped'
  | 'damage-target-degraded';

interface Hit {
  role?: Role;
  value?: DecimalString;
  product: boolean;
}

const DAMAGE_TASK = 'RPG.GameCore.DamageByAttackProperty';
const LINEAR_LISTS = new Set([
  'OnStart',
  'OnHit',
  'OnProjectileHit',
  'SuccessTaskList',
  'FailedTaskList',
  'TaskList'
]);

function raw(value: unknown): Raw | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : undefined;
}

function alias(value: unknown): string | undefined {
  return typeof value === 'string' ? value : raw(value)?.Alias;
}

function damageTarget(value: unknown): Role | undefined {
  switch (alias(value)) {
    case 'AbilityTargetEntity':
      return 'primary';
    case 'AbilityTargetAdjoinEntity':
      return 'adjacent';
    case 'AllEnemy':
      return 'all';
    case 'AllTeammate':
      return 'enemy-side';
    case 'AbilityTargetLeftEntity':
      return 'sweep-left';
    case 'AbilityTargetRightEntity':
      return 'sweep-right';
    default:
      return undefined;
  }
}

/** Preserve the reviewed marker meaning; it grants no numeric or scheduling exception. */
function reviewedMarker(skillId: string, row: Raw): Marker | undefined {
  if (skillId !== '406401207' || row.$type !== 'RPG.GameCore.Retarget') return undefined;
  switch (row.Predicate?.ModifierName?.Value) {
    case 'MMonster_W4_Serpent_01_Charge02_Target':
      return 'marked';
    case 'MMonster_W4_Serpent_01_Charge02_Target_Sub':
      return 'other-marked';
    default:
      return undefined;
  }
}

function contains(value: unknown, test: (row: Raw) => boolean): boolean {
  if (Array.isArray(value)) return value.some((child) => contains(child, test));
  const row = raw(value);
  return (
    !!row &&
    (test(row) ||
      Object.entries(row).some(([key, child]) => key !== 'Predicate' && contains(child, test)))
  );
}

export function normalizeEnemySkillMultipliers(values: readonly DecimalString[]): DecimalString[] {
  return [...values]
    .sort(compareDecimals)
    .filter((value, index, ordered) => index === 0 || !decimalEquals(value, ordered[index - 1]));
}

function extractHit(
  row: Raw,
  resolve: (value: unknown) => DecimalString | undefined,
  degraded: boolean,
  marker: Marker | undefined,
  diagnostic: (reason: EnemySkillDamageDiagnostic) => void
): Hit {
  const percentage = row.AttackProperty?.DamagePercentage;
  const resolved = resolve(percentage);
  let value = resolved;
  if (!resolved) {
    const opcode = percentage?.PostfixExpr?.OpCodes;
    diagnostic(
      opcode && !['AQAR', 'AQAAAAQR'].includes(opcode)
        ? 'damage-unsupported-expression'
        : 'damage-unresolved-value'
    );
  } else if (resolved.startsWith('-')) {
    diagnostic('damage-negative-value');
    value = undefined;
  }
  let role = marker ?? damageTarget(row.TargetType);
  // Explicit whole-side sets and reviewed marks retain their meaning after retargeting.
  if (degraded && !marker && role && !['all', 'enemy-side'].includes(role)) {
    role = undefined;
    if (value) diagnostic('damage-target-degraded');
  } else if (!role && value) diagnostic('damage-target-unmapped');
  return { role, value, product: percentage?.PostfixExpr?.OpCodes === 'AQAAAAQR' };
}

/** Aggregate only direct, resolved hits with a trusted role in one local linear segment. */
function localCandidates(
  hits: readonly Hit[],
  publish: (role: EnemySkillDamageTarget | undefined, value: DecimalString) => void
): void {
  const groups = new Map<Role | undefined, Hit[]>();
  for (const hit of hits) groups.set(hit.role, [...(groups.get(hit.role) ?? []), hit]);
  const left = groups.get('sweep-left') ?? [];
  const right = groups.get('sweep-right') ?? [];
  const center = groups.get('primary') ?? [];
  if (
    left.length === 1 &&
    right.length === 1 &&
    center.length === 1 &&
    left[0].value &&
    right[0].value &&
    center[0].value &&
    decimalEquals(left[0].value, center[0].value) &&
    decimalEquals(right[0].value, center[0].value)
  ) {
    publish('each-swept', center[0].value);
    groups.delete('sweep-left');
    groups.delete('sweep-right');
    groups.delete('primary');
  }
  for (const [role, group] of groups) {
    const knownRole = role === 'sweep-left' || role === 'sweep-right' ? undefined : role;
    if (knownRole && group.every((hit) => hit.value !== undefined)) {
      const sum = addDecimals(group.map((hit) => hit.value!));
      publish(knownRole, group.some((hit) => hit.product) ? canonicalDecimal(sum) : sum);
    } else {
      // Unknown targets may denote different entities; unresolved siblings forbid a partial sum.
      for (const hit of group)
        if (hit.value !== undefined)
          publish(knownRole, hit.product ? canonicalDecimal(hit.value) : hit.value);
    }
  }
}

/** Each ability/list boundary produces candidates independently, without runtime path expansion. */
export function collectEnemySkillDamage(
  abilities: readonly Raw[],
  skillId: string,
  resolve: (value: unknown) => DecimalString | undefined,
  onDiagnostic?: (reason: EnemySkillDamageDiagnostic) => void
): DamageRows {
  const candidates = new Map<EnemySkillDamageTarget | undefined, DecimalString[]>();
  const reasons = new Set<EnemySkillDamageDiagnostic>();
  const diagnostic = (reason: EnemySkillDamageDiagnostic) => reasons.add(reason);
  const publish = (role: EnemySkillDamageTarget | undefined, value: DecimalString) =>
    candidates.set(role, [...(candidates.get(role) ?? []), value]);
  const walk = (value: unknown, degraded: boolean, marker?: Marker, linear = false): void => {
    if (Array.isArray(value)) {
      if (!linear) {
        for (const child of value) walk(child, degraded, marker);
        return;
      }
      let hits: Hit[] = [];
      let targetDegraded = degraded;
      const flush = () => {
        localCandidates(hits, publish);
        hits = [];
      };
      for (const child of value) {
        const row = raw(child);
        if (row?.$type === DAMAGE_TASK) {
          const hit = extractHit(row, resolve, targetDegraded, marker, diagnostic);
          // An unmapped target must not bridge two trusted hits into one sum.
          if (!hit.role) {
            flush();
            localCandidates([hit], publish);
          } else hits.push(hit);
          continue;
        }
        const boundary = contains(
          child,
          (item) =>
            item.$type === DAMAGE_TASK ||
            /(?:Retarget|Loop|Bounce|SkillPerformFinish|StopTimeline|ForceKill)/.test(
              item.$type ?? ''
            )
        );
        if (boundary) flush();
        walk(child, targetDegraded, marker);
        if (contains(child, (item) => item.$type === 'RPG.GameCore.Retarget'))
          targetDegraded = true;
      }
      flush();
      return;
    }
    const row = raw(value);
    if (!row) return;
    if (row.$type === DAMAGE_TASK) {
      localCandidates([extractHit(row, resolve, degraded, marker, diagnostic)], publish);
      return;
    }
    const nextMarker = reviewedMarker(skillId, row) ?? marker;
    const nextDegraded = degraded || row.$type === 'RPG.GameCore.Retarget';
    for (const [key, child] of Object.entries(row)) {
      if (key === '$type' || key === 'Predicate') continue;
      const callbackDegraded =
        !!row.Name &&
        key !== 'OnStart' &&
        contains(row.OnStart, (item) => item.$type === 'RPG.GameCore.Retarget');
      walk(child, nextDegraded || callbackDegraded, nextMarker, LINEAR_LISTS.has(key));
    }
  };
  for (const ability of abilities) walk(ability, false);
  for (const reason of reasons) onDiagnostic?.(reason);
  return [...candidates].map(([role, values]) => ({
    ...(role ? { target: role } : {}),
    multipliers: normalizeEnemySkillMultipliers(values),
    scaling: 'attack'
  }));
}
