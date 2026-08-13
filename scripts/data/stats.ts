import type { BaseStatProgression, PromotionStage } from '../../src/lib/domain/types.js';
import { numberOf } from './raw.js';

type Raw = Record<string, any>;

interface StatFields {
  hpBase: string;
  hpAdd: string;
  attackBase: string;
  attackAdd: string;
  defenceBase: string;
  defenceAdd: string;
}

export function normalizeStatProgression(
  rows: Raw[],
  fields: StatFields,
  fixed?: BaseStatProgression['fixed']
): BaseStatProgression {
  const ordered = [...rows].sort((a, b) => Number(a.MaxLevel) - Number(b.MaxLevel));
  const stages: PromotionStage[] = ordered.map((row, index) => ({
    // At an ascension boundary the product intentionally shows the highest reached promotion.
    fromLevel: index === 0 ? 1 : Number(ordered[index - 1].MaxLevel),
    toLevel: index === ordered.length - 1 ? Number(row.MaxLevel) : Number(row.MaxLevel) - 1,
    hp: { base: numberOf(row[fields.hpBase]), perLevel: numberOf(row[fields.hpAdd]) },
    attack: {
      base: numberOf(row[fields.attackBase]),
      perLevel: numberOf(row[fields.attackAdd])
    },
    defence: {
      base: numberOf(row[fields.defenceBase]),
      perLevel: numberOf(row[fields.defenceAdd])
    }
  }));
  return {
    minLevel: 1,
    maxLevel: stages.at(-1)?.toLevel ?? 80,
    defaultLevel: stages.at(-1)?.toLevel ?? 80,
    stages,
    fixed
  };
}

export const characterStatFields: StatFields = {
  hpBase: 'HPBase',
  hpAdd: 'HPAdd',
  attackBase: 'AttackBase',
  attackAdd: 'AttackAdd',
  defenceBase: 'DefenceBase',
  defenceAdd: 'DefenceAdd'
};

export const lightConeStatFields: StatFields = {
  hpBase: 'BaseHP',
  hpAdd: 'BaseHPAdd',
  attackBase: 'BaseAttack',
  attackAdd: 'BaseAttackAdd',
  defenceBase: 'BaseDefence',
  defenceAdd: 'BaseDefenceAdd'
};
