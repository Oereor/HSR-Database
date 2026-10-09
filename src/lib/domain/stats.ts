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
  const stage = progression.stages[getPromotionAtLevel(progression, level)];
  return {
    hp: calculate(stage, 'hp', level),
    attack: calculate(stage, 'attack', level),
    defence: calculate(stage, 'defence', level)
  };
}

/** Stages are ordered, contiguous, inclusive intervals generated from raw MaxLevel. */
export function getPromotionAtLevel(
  progression: BaseStatProgression,
  requestedLevel: number
): number {
  const level = Math.min(
    progression.maxLevel,
    Math.max(progression.minLevel, Math.round(requestedLevel))
  );
  const promotion = progression.stages.findIndex(
    (stage) => level >= stage.fromLevel && level <= stage.toLevel
  );
  if (promotion < 0) throw new Error(`Missing base stat stage for level ${level}`);
  return promotion;
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
