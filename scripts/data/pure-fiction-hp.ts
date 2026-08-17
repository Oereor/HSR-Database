import type {
  DecimalString,
  EnemyHpFinalResolution,
  PureFictionHpModifier
} from '../../src/lib/domain/endgame.js';
import {
  addDecimals,
  compareDecimals,
  multiplyDecimals,
  parseDecimal,
  roundDecimalToInteger,
  truncateDecimalToInteger
} from './decimal.js';

export const PURE_FICTION_WAVE_HP_ABILITY = 'FantasticStory_Wave_Ability_0001' as const;

export interface PureFictionHpTrace {
  runtimeLevelRatio: DecimalString;
  runtimeBaseMaxHpPerBar: DecimalString;
  unroundedFinalMaxHpPerBar: DecimalString;
  roundingRole: 'ordinary' | 'leader';
}

function f32Decimal(value: DecimalString): DecimalString {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`PF HardLevel HPRatio 无法转换为单精度：${value}`);
  return parseDecimal(String(Math.fround(number)), 'PF HardLevel HPRatio f32');
}

export function resolvePureFictionHpModifier(
  ability: string | undefined,
  params: readonly unknown[]
): PureFictionHpModifier {
  if (!ability) {
    if (params.length) return { status: 'unresolved', reason: 'pf-params-without-ability' };
    return {
      status: 'resolved',
      source: 'identity',
      hpAddedRatio: parseDecimal('0'),
      totalRatio: parseDecimal('1')
    };
  }
  if (!params.length) return { status: 'unresolved', reason: 'pf-ability-without-params', ability };
  if (ability !== PURE_FICTION_WAVE_HP_ABILITY)
    return { status: 'unresolved', reason: 'unsupported-pf-wave-ability', ability };
  if (params.length !== 2)
    return { status: 'unresolved', reason: 'invalid-pf-wave-param-count', ability };

  let hpAddedRatio: DecimalString;
  let totalRatio: DecimalString;
  try {
    hpAddedRatio = parseDecimal(params[1], 'PF HPAddedRatio');
    totalRatio = addDecimals([parseDecimal('1'), hpAddedRatio]);
  } catch {
    return { status: 'unresolved', reason: 'invalid-pf-hp-added-ratio', ability };
  }
  if (
    compareDecimals(hpAddedRatio, parseDecimal('0')) < 0 ||
    compareDecimals(totalRatio, parseDecimal('0')) <= 0
  )
    return { status: 'unresolved', reason: 'invalid-pf-hp-added-ratio', ability };
  return {
    status: 'resolved',
    source: 'wave-ability',
    ability: PURE_FICTION_WAVE_HP_ABILITY,
    hpAddedRatio,
    totalRatio,
    paramIndex: 1
  };
}

export function isPureFictionLeaderRank(rank: string | undefined): boolean {
  return rank === 'LittleBoss' || rank === 'BigBoss';
}

export function resolvePureFictionFinalHp(input: {
  hpBase: DecimalString;
  instanceRatio: DecimalString;
  levelRatio: DecimalString;
  eliteRatio: DecimalString;
  baseEncounterMaxHpPerBar: DecimalString;
  rank?: string;
  modifier: PureFictionHpModifier;
}): { final: EnemyHpFinalResolution; trace?: PureFictionHpTrace } {
  if (input.modifier.status === 'unresolved')
    return { final: { status: 'unresolved', reason: input.modifier.reason } };

  const runtimeLevelRatio = f32Decimal(input.levelRatio);
  const runtimeBaseMaxHpPerBar = multiplyDecimals([
    input.hpBase,
    input.instanceRatio,
    runtimeLevelRatio,
    input.eliteRatio
  ]);
  const unroundedFinalMaxHpPerBar = multiplyDecimals([
    runtimeBaseMaxHpPerBar,
    input.modifier.totalRatio
  ]);
  const leader = isPureFictionLeaderRank(input.rank);
  const maxHpPerBar = leader
    ? truncateDecimalToInteger(unroundedFinalMaxHpPerBar)
    : roundDecimalToInteger(unroundedFinalMaxHpPerBar);
  return {
    final: {
      status: 'resolved',
      maxHpPerBar,
      source: 'pure-fiction-wave',
      rounding: leader ? 'truncate' : 'half-up'
    },
    trace: {
      runtimeLevelRatio,
      runtimeBaseMaxHpPerBar,
      unroundedFinalMaxHpPerBar,
      roundingRole: leader ? 'leader' : 'ordinary'
    }
  };
}
