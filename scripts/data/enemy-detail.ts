import type {
  ElementLabel,
  EnemyLevelStats,
  EnemySkillPhase,
  EnemySpecialResistance,
  EnemyStatProgression,
  EnemyStatValue,
  SemanticTag
} from '../../src/lib/domain/types.js';
import type { DecimalString } from '../../src/lib/domain/endgame.js';
import { addDecimals, decimalOf, internalStanceToToughness, parseDecimal } from './decimal.js';
import { resolveEnemyConfiguredStat, type EnemyConfiguredStatSources } from './enemy-stats.js';

type Raw = Record<string, any>;

const SKILL_TAG_CODES: Record<string, string> = {
  天赋: 'Talent',
  单攻: 'SingleAttack',
  群攻: 'AoEAttack',
  蓄力: 'Charge',
  召唤: 'Summon',
  强化: 'Enhance',
  其他: 'Other',
  妨害: 'Impair',
  扩散: 'Blast',
  辅助: 'Support',
  弹射: 'Bounce',
  锁定: 'LockOn',
  分摊: 'Shared',
  横扫: 'Sweep',
  防御: 'Defence',
  回复: 'Restore',
  扫射: 'Barrage'
};

const SPECIAL_RESISTANCE_LABELS: Record<string, string> = {
  STAT_CTRL: '控制抵抗',
  STAT_CTRL_Frozen: '冻结抵抗',
  STAT_Confine: '禁锢抵抗',
  STAT_Entangle: '纠缠抵抗',
  STAT_DOT_Burn: '灼烧抵抗',
  STAT_DOT_Electric: '触电抵抗',
  STAT_DOT_Poison: '风化抵抗'
};

export const enemySkillTagCodes = SKILL_TAG_CODES;
export const enemySpecialResistanceLabels = SPECIAL_RESISTANCE_LABELS;

export function normalizeEnemySkillKind(label: string): 'skill' | 'talent' | 'unknown' {
  if (label === '技能') return 'skill';
  if (label === '天赋') return 'talent';
  return 'unknown';
}

export function normalizeEnemySkillTag(label: string): SemanticTag {
  const code = SKILL_TAG_CODES[label];
  return { code: code ?? label ?? 'Unknown', label: label || '未知', known: Boolean(code) };
}

export function normalizeEnemyPhases(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.map(Number).filter((phase) => Number.isSafeInteger(phase) && phase > 0))
  ].sort((left, right) => left - right);
}

export interface EnemySkillPhaseInput {
  id: string;
  phases: number[];
  visible: boolean;
}

export function buildEnemySkillPhases(skills: EnemySkillPhaseInput[]): EnemySkillPhase[] {
  const normalizedSkills = skills.map((skill) => ({
    ...skill,
    phases: normalizeEnemyPhases(skill.phases)
  }));
  const explicitPhases = [...new Set(normalizedSkills.flatMap((skill) => skill.phases))].sort(
    (left, right) => left - right
  );
  const phaseIndexes = explicitPhases.length ? explicitPhases : [1];

  return phaseIndexes.map((index) => {
    const skillIds: string[] = [];
    const seen = new Set<string>();
    for (const skill of normalizedSkills) {
      if (!skill.visible || seen.has(skill.id)) continue;
      if (skill.phases.length && !skill.phases.includes(index)) continue;
      seen.add(skill.id);
      skillIds.push(skill.id);
    }
    return { index, skillIds };
  });
}

export function normalizeSpecialResistances(value: unknown): {
  values: EnemySpecialResistance[];
  unknownKeys: string[];
} {
  const values: EnemySpecialResistance[] = [];
  const unknownKeys: string[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    const code = String(item && typeof item === 'object' ? item.Key : item);
    const label = SPECIAL_RESISTANCE_LABELS[code];
    if (!label) unknownKeys.push(code);
    else if (!values.some((entry) => entry.code === code))
      values.push({
        code,
        label,
        value: optionalDecimal(
          item && typeof item === 'object' ? item.Value : undefined,
          '0',
          `DebuffResist.${code}`
        )
      });
  }
  return { values, unknownKeys };
}

function optionalDecimal(value: unknown, fallback: '0' | '1', label: string): DecimalString {
  if (
    value === undefined ||
    value === null ||
    (typeof value === 'object' && !Array.isArray(value) && !('Value' in value))
  )
    return parseDecimal(fallback);
  return decimalOf(value, label);
}

function publicValue(
  label: string,
  sources: EnemyConfiguredStatSources,
  transform?: (value: DecimalString) => DecimalString | undefined
): EnemyStatValue {
  try {
    const resolved = resolveEnemyConfiguredStat(label, sources);
    if (resolved.status === 'unavailable') return resolved;
    const value = transform ? transform(resolved.configuredValue) : resolved.configuredValue;
    return value
      ? { status: 'resolved', value }
      : { status: 'unavailable', reason: 'invalid-reference' };
  } catch {
    return { status: 'unavailable', reason: 'invalid-reference' };
  }
}

function statusValue(value: DecimalString): EnemyStatValue {
  return { status: 'resolved', value };
}

export function resolveCanonicalEnemyStats(
  template: Raw,
  config: Raw,
  hardLevels: Raw[],
  elite: Raw
): EnemyStatProgression {
  const levels: EnemyLevelStats[] = [...hardLevels]
    .sort((left, right) => Number(left.Level) - Number(right.Level))
    .map((hardLevel) => {
      const scaled = (
        label: string,
        base: unknown,
        ratio: unknown,
        value: unknown,
        hardRatio: unknown,
        eliteRatio: unknown,
        transform?: (resolved: DecimalString) => DecimalString | undefined
      ) =>
        publicValue(
          label,
          {
            base,
            instanceRatio: ratio,
            instanceValue: value,
            levelRatio: hardRatio,
            eliteRatio
          },
          transform
        );
      const effectHit = optionalDecimal(
        hardLevel.StatusProbability,
        '0',
        `HardLevel.${hardLevel.Level}.StatusProbability`
      );
      const effectResistance = addDecimals([
        optionalDecimal(template.StatusResistanceBase, '0', 'StatusResistanceBase'),
        optionalDecimal(
          hardLevel.StatusResistance,
          '0',
          `HardLevel.${hardLevel.Level}.StatusResistance`
        )
      ]);
      return {
        level: Number(hardLevel.Level),
        hp: scaled(
          'HP',
          template.HPBase,
          config.HPModifyRatio,
          config.HPModifyValue,
          hardLevel.HPRatio,
          elite.HPRatio
        ),
        attack: scaled(
          'Attack',
          template.AttackBase,
          config.AttackModifyRatio,
          config.AttackModifyValue,
          hardLevel.AttackRatio,
          elite.AttackRatio
        ),
        defence: scaled(
          'Defence',
          template.DefenceBase,
          config.DefenceModifyRatio,
          config.DefenceModifyValue,
          hardLevel.DefenceRatio,
          elite.DefenceRatio
        ),
        speed: scaled(
          'Speed',
          template.SpeedBase,
          config.SpeedModifyRatio,
          config.SpeedModifyValue,
          hardLevel.SpeedRatio,
          elite.SpeedRatio
        ),
        toughness: scaled(
          'Stance',
          template.StanceBase,
          config.StanceModifyRatio,
          config.StanceModifyValue,
          hardLevel.StanceRatio,
          elite.StanceRatio,
          internalStanceToToughness
        ),
        effectHit: statusValue(effectHit),
        effectResistance: statusValue(effectResistance)
      };
    });

  return {
    minLevel: levels.at(0)?.level ?? 1,
    maxLevel: levels.at(-1)?.level ?? 100,
    defaultLevel: levels.some((row) => row.level === 95) ? 95 : (levels.at(-1)?.level ?? 95),
    levels
  };
}

export function normalizedElementLabel(
  rawElement: unknown,
  normalize: (element: string | undefined) => string | undefined,
  label: (element: string) => string
): ElementLabel | undefined {
  const source = String(rawElement ?? '');
  const element = normalize(source);
  return element ? { element, name: label(source) } : undefined;
}
