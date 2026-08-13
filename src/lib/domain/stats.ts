import type { BaseStatProgression, PromotionStage } from './types';

export interface BaseStats {
  hp: number;
  attack: number;
  defence: number;
}

export function getBaseStatsAtLevel(
  progression: BaseStatProgression,
  requestedLevel: number
): BaseStats {
  if (!progression.stages.length) return { hp: 0, attack: 0, defence: 0 };
  const level = Math.min(
    progression.maxLevel,
    Math.max(progression.minLevel, Math.round(requestedLevel))
  );
  const stage =
    [...progression.stages].reverse().find((candidate) => level >= candidate.fromLevel) ??
    progression.stages[0];
  return {
    hp: calculate(stage, 'hp', level),
    attack: calculate(stage, 'attack', level),
    defence: calculate(stage, 'defence', level)
  };
}

function calculate(stage: PromotionStage, key: keyof BaseStats, level: number): number {
  const growth = stage[key];
  return stableNumber(growth.base + growth.perLevel * (level - 1));
}

function stableNumber(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function formatBaseStat(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(Math.round(value));
}
