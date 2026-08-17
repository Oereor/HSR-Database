import type {
  DecimalString,
  ResolvedEnemyStat,
  ResolvedInternalStance
} from '../../src/lib/domain/endgame.js';
import { addDecimals, decimalOf, multiplyDecimals, parseDecimal } from './decimal.js';

export interface EnemyConfiguredStatSources {
  base: unknown;
  instanceRatio: unknown;
  instanceValue: unknown;
  levelRatio: unknown;
  eliteRatio: unknown;
}

function wrappedDecimalOr(value: unknown, fallback: '0' | '1', label: string): DecimalString {
  if (
    value === undefined ||
    value === null ||
    (typeof value === 'object' && !Array.isArray(value) && !('Value' in value))
  )
    return parseDecimal(fallback);
  return decimalOf(value, label);
}

/** Shared lossless enemy stat resolver used by Endgame occurrences and canonical enemy details. */
export function resolveEnemyConfiguredStat(
  label: string,
  sources: EnemyConfiguredStatSources
): ResolvedEnemyStat {
  if (
    !sources.base ||
    typeof sources.base !== 'object' ||
    Array.isArray(sources.base) ||
    !('Value' in sources.base)
  )
    return { status: 'unavailable', reason: 'missing-base' };

  const base = decimalOf(sources.base, `${label}Base`);
  const instanceRatio = wrappedDecimalOr(sources.instanceRatio, '1', `${label}ModifyRatio`);
  const instanceValue = wrappedDecimalOr(sources.instanceValue, '0', `${label}ModifyValue`);
  const levelRatio = decimalOf(sources.levelRatio, `HardLevel.${label}Ratio`);
  const eliteRatio = decimalOf(sources.eliteRatio, `EliteGroup.${label}Ratio`);
  const configuredValue = multiplyDecimals([
    addDecimals([multiplyDecimals([base, instanceRatio]), instanceValue]),
    levelRatio,
    eliteRatio
  ]);
  return {
    status: 'resolved',
    base,
    instanceRatio,
    instanceValue,
    levelRatio,
    eliteRatio,
    configuredValue
  };
}

export function resolveEnemyInternalStance(
  sources: EnemyConfiguredStatSources
): ResolvedInternalStance {
  const resolved = resolveEnemyConfiguredStat('Stance', sources);
  if (resolved.status === 'unavailable') return resolved;
  return {
    status: 'resolved',
    baseInternal: resolved.base,
    instanceRatio: resolved.instanceRatio,
    instanceValueInternal: resolved.instanceValue,
    hardLevelRatio: resolved.levelRatio,
    eliteRatio: resolved.eliteRatio,
    resolvedInternal: resolved.configuredValue
  };
}
