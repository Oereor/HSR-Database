import type { DecimalString } from './endgame';

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;

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

// HSR stores stance in internal units. Player-facing toughness uses one point
// per three internal units after encounter scaling has been resolved.
export function internalStanceToToughness(
  internalStance: DecimalString
): DecimalString | undefined {
  return divideDecimalByIntegerExact(internalStance, INTERNAL_STANCE_PER_TOUGHNESS);
}
