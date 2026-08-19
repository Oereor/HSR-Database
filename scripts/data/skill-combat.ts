import { gameTextToPlain, normalizeGameText } from '../../src/lib/domain/game-text.js';
import type {
  KnownSkillEffect,
  SkillCombatMeta,
  SkillExtraEffect,
  SkillStanceDisplay
} from '../../src/lib/domain/types.js';

export const SKILL_EFFECT_LABELS: Record<KnownSkillEffect, string> = {
  SingleAttack: '单攻',
  Blast: '扩散',
  AoEAttack: '群攻',
  Bounce: '弹射',
  Enhance: '强化',
  Impair: '妨害',
  Support: '辅助',
  Defence: '防御',
  Restore: '回复',
  Summon: '召唤',
  MazeAttack: '秘技攻击'
};

export interface SkillCombatInput {
  skillEffect?: unknown;
  specialResource?: string;
  bpNeed?: number;
  bpAdd?: number;
  spBase?: number;
  stanceDamageDisplay?: number;
  showStanceList?: unknown;
  extraEffects?: SkillExtraEffect[];
}

const positive = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const stanceTypes: SkillStanceDisplay['type'][] = ['single', 'aoe', 'blast'];

const numericValue = (value: unknown): number => {
  if (value && typeof value === 'object' && 'Value' in value)
    return Number((value as { Value: unknown }).Value);
  return Number(value);
};

export function normalizeStanceDisplay(value: unknown): SkillStanceDisplay[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const display = value.slice(0, stanceTypes.length).flatMap((entry, index) => {
    const raw = numericValue(entry);
    return Number.isFinite(raw) && raw > 0 ? [{ type: stanceTypes[index], value: raw / 3 }] : [];
  });
  return display.length ? display : undefined;
}

export function normalizeSkillCombatMeta(input: SkillCombatInput): SkillCombatMeta {
  if (positive(input.bpNeed) && positive(input.bpAdd)) {
    throw new Error('技能同时具有正 BPNeed 和 BPAdd，不能推测净变化');
  }

  const effectCode = typeof input.skillEffect === 'string' ? input.skillEffect.trim() : '';
  const knownEffect = effectCode in SKILL_EFFECT_LABELS;
  const normalizedResource = normalizeGameText(input.specialResource ?? '').trim();
  const hasSpecialResource = gameTextToPlain(normalizedResource).trim().length > 0;
  const stanceDisplay = normalizeStanceDisplay(input.showStanceList);

  return {
    ...(effectCode
      ? {
          effect: {
            code: effectCode,
            label: knownEffect ? SKILL_EFFECT_LABELS[effectCode as KnownSkillEffect] : effectCode,
            known: knownEffect
          }
        }
      : {}),
    ...(hasSpecialResource ? { specialResource: normalizedResource } : {}),
    ...(positive(input.bpNeed)
      ? { battlePointDelta: -input.bpNeed }
      : positive(input.bpAdd)
        ? { battlePointDelta: input.bpAdd }
        : {}),
    ...(positive(input.spBase) ? { energyGain: input.spBase } : {}),
    ...(stanceDisplay ? { stanceDisplay } : {}),
    ...(!stanceDisplay && positive(input.stanceDamageDisplay)
      ? { toughnessDamage: input.stanceDamageDisplay }
      : {}),
    ...(input.extraEffects?.length ? { extraEffects: input.extraEffects } : {})
  };
}
