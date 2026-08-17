import type { DecimalString } from '../../src/lib/domain/endgame.js';

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;

export function parseDecimal(value: unknown, context = 'decimal'): DecimalString {
  if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value)) {
    throw new Error(`${context} 必须是无损十进制字符串，实际为 ${JSON.stringify(value)}`);
  }
  return value as DecimalString;
}

export function decimalOf(value: unknown, context: string): DecimalString {
  if (!value || typeof value !== 'object' || !('Value' in value)) {
    throw new Error(`${context} 缺少 Value 十进制包装`);
  }
  return parseDecimal((value as { Value: unknown }).Value, `${context}.Value`);
}

interface DecimalParts {
  coefficient: bigint;
  scale: number;
}

export const INTERNAL_STANCE_PER_TOUGHNESS = 3;

function parts(value: DecimalString): DecimalParts {
  const match = DECIMAL_PATTERN.exec(value)!;
  const fraction = match[3] ?? '';
  const sign = match[1] === '-' ? -1n : 1n;
  return {
    coefficient: sign * BigInt(`${match[2]}${fraction}`),
    scale: fraction.length
  };
}

function renderParts(value: DecimalParts): DecimalString {
  const negative = value.coefficient < 0n;
  let digits = (negative ? -value.coefficient : value.coefficient).toString();
  if (value.scale > 0) {
    digits = digits.padStart(value.scale + 1, '0');
    digits = `${digits.slice(0, -value.scale)}.${digits.slice(-value.scale)}`;
  }
  return `${negative ? '-' : ''}${digits}` as DecimalString;
}

function integerPart(value: DecimalString): { whole: bigint; remainder: bigint; unit: bigint } {
  const parsed = parts(value);
  const unit = 10n ** BigInt(parsed.scale);
  return {
    whole: parsed.coefficient / unit,
    remainder: parsed.coefficient % unit,
    unit
  };
}

export function addDecimals(values: readonly DecimalString[]): DecimalString {
  if (!values.length) throw new Error('十进制加法至少需要一个加数');
  const parsed = values.map(parts);
  const scale = Math.max(...parsed.map((value) => value.scale));
  const coefficient = parsed.reduce(
    (total, value) => total + value.coefficient * 10n ** BigInt(scale - value.scale),
    0n
  );
  return renderParts({ coefficient, scale });
}

export function multiplyDecimals(values: readonly DecimalString[]): DecimalString {
  if (!values.length) throw new Error('十进制乘法至少需要一个因子');
  let coefficient = 1n;
  let scale = 0;
  for (const value of values) {
    const parsed = parts(value);
    coefficient *= parsed.coefficient;
    scale += parsed.scale;
  }
  return renderParts({ coefficient, scale });
}

export function divideDecimalByIntegerExact(
  value: DecimalString,
  divisor: number
): DecimalString | undefined {
  if (!Number.isSafeInteger(divisor) || divisor <= 0)
    throw new Error(`十进制除数必须是正安全整数，实际为 ${divisor}`);
  const parsed = parts(value);
  const integerDivisor = BigInt(divisor);
  if (parsed.coefficient % integerDivisor !== 0n) return undefined;
  return renderParts({ coefficient: parsed.coefficient / integerDivisor, scale: parsed.scale });
}

// HSR stores stance in internal units. Player-facing toughness uses one point
// per three internal units, after all encounter scaling has been resolved.
export function internalStanceToToughness(
  internalStance: DecimalString
): DecimalString | undefined {
  return divideDecimalByIntegerExact(internalStance, INTERNAL_STANCE_PER_TOUGHNESS);
}

export function compareDecimals(left: DecimalString, right: DecimalString): number {
  const a = parts(left);
  const b = parts(right);
  const scale = Math.max(a.scale, b.scale);
  const leftCoefficient = a.coefficient * 10n ** BigInt(scale - a.scale);
  const rightCoefficient = b.coefficient * 10n ** BigInt(scale - b.scale);
  return leftCoefficient < rightCoefficient ? -1 : leftCoefficient > rightCoefficient ? 1 : 0;
}

export function isWholeDecimal(value: DecimalString): boolean {
  const parsed = parts(value);
  return parsed.coefficient % 10n ** BigInt(parsed.scale) === 0n;
}

export function decimalEquals(left: DecimalString, right: DecimalString): boolean {
  const a = parts(left);
  const b = parts(right);
  const scale = Math.max(a.scale, b.scale);
  return (
    a.coefficient * 10n ** BigInt(scale - a.scale) ===
    b.coefficient * 10n ** BigInt(scale - b.scale)
  );
}

/** Truncate a non-negative decimal to the integer used by PF leader HP pools. */
export function truncateDecimalToInteger(value: DecimalString): DecimalString {
  const parsed = integerPart(value);
  if (parsed.whole < 0n || parsed.remainder < 0n)
    throw new Error(`只支持截断非负十进制，实际为 ${value}`);
  return parseDecimal(parsed.whole.toString());
}

/** Round a non-negative decimal half-up to the integer used by ordinary PF enemies. */
export function roundDecimalToInteger(value: DecimalString): DecimalString {
  const parsed = integerPart(value);
  if (parsed.whole < 0n || parsed.remainder < 0n)
    throw new Error(`只支持舍入非负十进制，实际为 ${value}`);
  const rounded = parsed.whole + (parsed.remainder * 2n >= parsed.unit ? 1n : 0n);
  return parseDecimal(rounded.toString());
}
