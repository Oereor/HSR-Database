import type { DecimalString } from '../../src/lib/domain/endgame.js';
import { multiplyDecimals, parseDecimal } from './decimal.js';

type Raw = Record<string, any>;

function decimal(value: unknown): DecimalString | undefined {
  const source = value && typeof value === 'object' && 'Value' in value ? value.Value : value;
  try {
    return parseDecimal(String(source));
  } catch {
    return undefined;
  }
}

/** The supplied override positions replace base positions; absent positions retain their base value. */
export function effectiveSkillParams(skill: Raw, monster: Raw): Array<DecimalString | undefined> {
  const skillId = String(skill.SkillID);
  const base = (Array.isArray(skill.ParamList) ? skill.ParamList : []).map(decimal);
  const matches = (
    Array.isArray(monster.OverrideSkillParams) ? monster.OverrideSkillParams : []
  ).filter((row: Raw) => String(row.BOKJJKFCFME) === skillId);
  if (matches.length > 1) return [];
  const override = matches[0]?.PBLPLDJKPEI;
  if (matches.length && !Array.isArray(override)) return [];
  for (const [index, value] of (override ?? []).entries()) base[index] = decimal(value);
  return base;
}

/** Only direct SkillParam reads and the verified hash-times-fixed shape are supported. */
export function resolveSkillValue(
  value: unknown,
  params: ReadonlyMap<string, readonly (DecimalString | undefined)[]>,
  dynamicFloats: Raw
): DecimalString | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Raw;
  if (source.IsDynamic === false) return decimal(source.FixedValue);
  if (source.IsDynamic !== true) return undefined;
  const expression = source.PostfixExpr;
  if (
    (expression?.OpCodes !== 'AQAR' && expression?.OpCodes !== 'AQAAAAQR') ||
    !Array.isArray(expression.DynamicHashes) ||
    expression.DynamicHashes.length !== 1
  )
    return undefined;
  if (expression.OpCodes === 'AQAR') {
    if ((expression.FixedValues?.length ?? 0) !== 0) return undefined;
  } else if (
    Object.keys(expression).length !== 3 ||
    !Number.isSafeInteger(expression.DynamicHashes[0]) ||
    !Array.isArray(expression.FixedValues) ||
    expression.FixedValues.length !== 1
  )
    return undefined;
  const read = dynamicFloats[String(expression.DynamicHashes[0])]?.ReadInfo;
  if (read?.Type !== 'SkillParam' || typeof read.TriggerKey !== 'string') return undefined;
  // A shared dynamic key may legitimately read another trigger's parameters (e.g. bounce).
  const values = params.get(read.TriggerKey);
  if (!values || !Number.isSafeInteger(read.Index) || read.Index < 0) return undefined;
  const param = values[read.Index];
  if (!param || expression.OpCodes === 'AQAR') return param;
  const fixed = expression.FixedValues[0];
  if (
    !fixed ||
    typeof fixed !== 'object' ||
    Array.isArray(fixed) ||
    Object.keys(fixed).length !== 1 ||
    !('Value' in fixed)
  )
    return undefined;
  const factor = decimal(fixed);
  return factor ? multiplyDecimals([param, factor]) : undefined;
}

export function normalizedActionShift(
  value: DecimalString
): { kind: 'advance' | 'delay'; ratio: DecimalString } | undefined {
  if (/^-?0+(?:\.0+)?$/.test(value)) return undefined;
  if (value.startsWith('-')) {
    const ratio = parseDecimal(value.slice(1));
    return { kind: 'advance', ratio };
  }
  return { kind: 'delay', ratio: value };
}
