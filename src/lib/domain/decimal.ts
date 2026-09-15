import type { DecimalString } from './endgame';

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;

interface DecimalParts {
  coefficient: bigint;
  scale: number;
}

export interface DecimalAverage {
  /** Exact numerator represented by the lossless sum of the source values. */
  numerator: DecimalString;
  /** Exact denominator represented by the number of included source rows. */
  denominator: number;
  exactDecimal: DecimalString | null;
  decimalApprox: DecimalString;
  approximate: boolean;
  rounding: 'half-up-12dp';
}

export function parseDecimal(value: unknown, context = 'decimal'): DecimalString {
  if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value))
    throw new Error(`${context} 必须是无损十进制字符串，实际为 ${JSON.stringify(value)}`);
  return value as DecimalString;
}

export function decimalOf(value: unknown, context: string): DecimalString {
  if (!value || typeof value !== 'object' || !('Value' in value))
    throw new Error(`${context} 缺少 Value 十进制包装`);
  return parseDecimal((value as { Value: unknown }).Value, `${context}.Value`);
}

function parts(value: DecimalString): DecimalParts {
  const match = DECIMAL_PATTERN.exec(value);
  if (!match) throw new Error(`无效的十进制字符串：${value}`);
  const fraction = match[3] ?? '';
  const sign = match[1] === '-' ? -1n : 1n;
  return { coefficient: sign * BigInt(`${match[2]}${fraction}`), scale: fraction.length };
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

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
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
  return compareDecimals(left, right) === 0;
}

function integerPart(value: DecimalString): { whole: bigint; remainder: bigint; unit: bigint } {
  const parsed = parts(value);
  const unit = 10n ** BigInt(parsed.scale);
  return { whole: parsed.coefficient / unit, remainder: parsed.coefficient % unit, unit };
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

export const INTERNAL_STANCE_PER_TOUGHNESS = 3;

export function divideDecimalByIntegerExact(
  value: DecimalString,
  divisor: number
): DecimalString | undefined {
  if (!Number.isSafeInteger(divisor) || divisor <= 0)
    throw new Error(`十进制除数必须是正安全整数，实际为 ${divisor}`);

  const match = DECIMAL_PATTERN.exec(value);
  if (!match) throw new Error(`无效的十进制字符串：${value}`);

  const fraction = match[3] ?? '';
  const sign = match[1] === '-' ? -1n : 1n;
  const coefficient = sign * BigInt(`${match[2]}${fraction}`);
  const integerDivisor = BigInt(divisor);
  if (coefficient % integerDivisor !== 0n) return undefined;

  const negative = coefficient < 0n;
  const digits = (negative ? -coefficient : coefficient) / integerDivisor;
  let rendered = digits.toString();
  if (fraction.length > 0) {
    rendered = rendered.padStart(fraction.length + 1, '0');
    rendered = `${rendered.slice(0, -fraction.length)}.${rendered.slice(-fraction.length)}`;
  }
  return `${negative ? '-' : ''}${rendered}` as DecimalString;
}

function terminatingDecimal(value: DecimalString, divisor: number): DecimalString | undefined {
  const parsed = parts(value);
  let numerator = parsed.coefficient;
  let denominator = BigInt(divisor) * 10n ** BigInt(parsed.scale);
  const divisorGcd = greatestCommonDivisor(numerator, denominator);
  numerator /= divisorGcd;
  denominator /= divisorGcd;

  let twos = 0;
  let fives = 0;
  while (denominator % 2n === 0n) {
    denominator /= 2n;
    twos += 1;
  }
  while (denominator % 5n === 0n) {
    denominator /= 5n;
    fives += 1;
  }
  if (denominator !== 1n) return undefined;

  const scale = Math.max(twos, fives);
  const coefficient = numerator * 2n ** BigInt(scale - twos) * 5n ** BigInt(scale - fives);
  return renderParts({ coefficient, scale });
}

function divideRounded(value: DecimalString, divisor: number, scale: number): DecimalString {
  const parsed = parts(value);
  const negative = parsed.coefficient < 0n;
  const numerator = (negative ? -parsed.coefficient : parsed.coefficient) * 10n ** BigInt(scale);
  const denominator = BigInt(divisor) * 10n ** BigInt(parsed.scale);
  let coefficient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * 2n >= denominator) coefficient += 1n;
  return renderParts({ coefficient: negative ? -coefficient : coefficient, scale });
}

/**
 * Return an auditable exact sum/count ratio and a deterministic display approximation.
 * No source value passes through JavaScript number arithmetic.
 */
export function averageDecimals(values: readonly DecimalString[]): DecimalAverage {
  if (!values.length) throw new Error('十进制平均值至少需要一个输入');
  const numerator = addDecimals(values);
  const denominator = values.length;
  const exactDecimal = terminatingDecimal(numerator, denominator) ?? null;
  return {
    numerator,
    denominator,
    exactDecimal,
    decimalApprox: divideRounded(numerator, denominator, 12),
    approximate: exactDecimal === null,
    rounding: 'half-up-12dp'
  };
}

// HSR stores stance in internal units. Player-facing toughness uses one point
// per three internal units after encounter scaling has been resolved.
export function internalStanceToToughness(
  internalStance: DecimalString
): DecimalString | undefined {
  return divideDecimalByIntegerExact(internalStance, INTERNAL_STANCE_PER_TOUGHNESS);
}
