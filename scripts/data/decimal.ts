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

function parts(value: DecimalString): DecimalParts {
  const match = DECIMAL_PATTERN.exec(value)!;
  const fraction = match[3] ?? '';
  const sign = match[1] === '-' ? -1n : 1n;
  return {
    coefficient: sign * BigInt(`${match[2]}${fraction}`),
    scale: fraction.length
  };
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
  const negative = coefficient < 0n;
  let digits = (negative ? -coefficient : coefficient).toString();
  if (scale > 0) {
    digits = digits.padStart(scale + 1, '0');
    digits = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  }
  return `${negative ? '-' : ''}${digits}` as DecimalString;
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
