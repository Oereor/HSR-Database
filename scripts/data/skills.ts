import type {
  SkillCard,
  SkillCategory,
  SkillCombatMeta,
  SkillProgression,
  SkillVariant
} from '../../src/lib/domain/types.js';

export interface StructuredSkillFields {
  AttackType?: unknown;
  SkillTriggerKey?: unknown;
}

export interface SkillVisibilityFields {
  HideInUI?: boolean;
}

export function isPlayerFacingSkillConfig(
  rows: SkillVisibilityFields[],
  identity: string
): boolean {
  const visibilityStates = new Set(rows.map((row) => row.HideInUI === true));
  if (visibilityStates.size > 1)
    throw new Error(`技能 ${identity} 的 HideInUI 在等级记录之间不一致`);
  return !visibilityStates.has(true);
}

const categoryOrder: SkillCategory[] = [
  'basic',
  'skill',
  'ultimate',
  'talent',
  'memosprite-skill',
  'memosprite-talent',
  'elation-skill',
  'assist',
  'technique'
];

const categoryLabels: Record<SkillCategory, string> = {
  basic: '普攻',
  skill: '战技',
  ultimate: '终结技',
  talent: '天赋',
  technique: '秘技',
  'memosprite-skill': '忆灵技',
  'memosprite-talent': '忆灵天赋',
  'elation-skill': '欢愉技',
  assist: '助战技'
};

export function classifyAvatarSkill(row: StructuredSkillFields): SkillCategory | undefined {
  switch (String(row.AttackType ?? '')) {
    case 'Normal':
      return 'basic';
    case 'BPSkill':
      return 'skill';
    case 'Ultra':
      return 'ultimate';
    case 'Maze':
      return 'technique';
    case 'MazeNormal':
      return undefined;
    case 'ElationDamage':
      return 'elation-skill';
    case 'Assist':
      return 'assist';
    default:
      return String(row.SkillTriggerKey ?? '').startsWith('SkillP') ? 'talent' : undefined;
  }
}

export function classifyMemospriteSkill(
  row: StructuredSkillFields
): 'memosprite-skill' | 'memosprite-talent' | undefined {
  if (String(row.AttackType ?? '') === 'Servant') return 'memosprite-skill';
  if (String(row.SkillTriggerKey ?? '').startsWith('SkillP')) return 'memosprite-talent';
  return undefined;
}

export interface SkillVariantInput extends Omit<SkillVariant, 'combatMeta'> {
  category: SkillCategory;
  combatMetaLevels: Array<{ level: number; combatMeta: SkillCombatMeta }>;
}

export function buildSkillCards(inputs: SkillVariantInput[]): SkillCard[] {
  const groups = new Map<SkillCategory, SkillVariantInput[]>();
  for (const input of inputs)
    groups.set(input.category, [...(groups.get(input.category) ?? []), input]);

  return categoryOrder.flatMap((category, order) => {
    const variants = [...(groups.get(category) ?? [])].sort((a, b) => a.order - b.order);
    if (!variants.length) return [];
    const progressionIds = [
      ...new Set(
        variants.map((variant) => variant.progressionId).filter((id): id is string => !!id)
      )
    ];
    const progressions: SkillProgression[] = progressionIds.map((id) => {
      const members = variants.filter((variant) => variant.progressionId === id);
      const availableLevels = intersectLevels(
        members.map((variant) => variant.levels.map((l) => l.level))
      );
      const desired = ['basic', 'memosprite-skill', 'memosprite-talent'].includes(category)
        ? 6
        : 10;
      return {
        id,
        availableLevels,
        defaultLevel: closestAvailableLevel(availableLevels, desired),
        variantIds: members.map((variant) => variant.id)
      };
    });
    return [
      {
        category,
        displayLabel: categoryLabels[category],
        order,
        progressions,
        variants: variants.map(buildSkillVariant)
      }
    ];
  });
}

export function buildSkillVariant(input: SkillVariantInput): SkillVariant {
  const metadataSignatures = new Set(
    input.combatMetaLevels.map((entry) => JSON.stringify(entry.combatMeta))
  );
  if (metadataSignatures.size > 1) {
    throw new Error(`技能 ${input.id} 的战斗元数据会随等级变化，不能折叠为 Variant 级数据`);
  }
  return {
    id: input.id,
    name: input.name,
    type: input.type,
    order: input.order,
    source: input.source,
    progressionId: input.progressionId,
    scalingParamIndexes: input.scalingParamIndexes,
    levels: input.levels,
    attackType: input.attackType,
    combatMeta: input.combatMetaLevels[0]?.combatMeta ?? {}
  };
}

function intersectLevels(collections: number[][]): number[] {
  if (!collections.length) return [];
  return [...new Set(collections[0])]
    .filter((level) => collections.every((levels) => levels.includes(level)))
    .sort((a, b) => a - b);
}

function closestAvailableLevel(levels: number[], desired: number): number {
  if (!levels.length) return 1;
  return levels.reduce((best, level) =>
    Math.abs(level - desired) < Math.abs(best - desired) ? level : best
  );
}
