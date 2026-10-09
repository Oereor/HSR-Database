import type { SkillCard, Trace } from '../types.js';
import { gameTextToPlain } from '../game-text.js';
import { groupTracesForDisplay } from '../trace-groups.js';
import type {
  CharacterTrainingProfile,
  CharacterTrainingTarget,
  CharacterTrainingResult,
  LightConeTrainingResult,
  ResolvedSkillTraining,
  Cost
} from './types.js';
import { mergeCosts, resolveSkillProgression, resolveSkillTraining } from './index.js';

export interface SkillTrainingControl {
  key?: string;
  displayLevel: number;
  requiredPromotion?: number;
  jointLabel: boolean;
}

export interface TrainingLevelControl {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  promotion: number;
}

export interface TrainingSkillTarget extends SkillTrainingControl {
  key: string;
  pointId: string;
  categoryLabel: string;
  variantLabel?: string;
  availableLevels: number[];
  trainingLevel: number;
}

export interface TrainingExpenseCosts {
  upgrade: Cost;
  promotion: Cost;
  skillTrace?: Cost;
  total: Cost;
}

/** One target control per paid canonical node, in the existing skill-card order. */
export function createTrainingSkillTargets(
  cards: SkillCard[],
  profile: CharacterTrainingProfile | undefined,
  controls: Record<string, SkillTrainingControl> | undefined,
  skills: ResolvedSkillTraining[]
): TrainingSkillTarget[] {
  const paidNodes = new Map(
    profile?.nodes.filter((node) => node.kind === 'skill').map((node) => [node.key, node])
  );
  const resolved = new Map(skills.map((skill) => [skill.key, skill]));
  const targets = new Map<string, TrainingSkillTarget>();
  for (const card of cards) {
    for (const progression of card.progressions) {
      const control = controls?.[progression.id];
      const node = control?.key ? paidNodes.get(control.key) : undefined;
      const skill = node ? resolved.get(node.key) : undefined;
      if (!node || !skill || !control) continue;
      const previous = targets.get(node.key);
      if (previous) {
        const labels = new Set([...previous.categoryLabel.split(' / '), card.displayLabel]);
        previous.categoryLabel = [...labels].join(' / ');
        continue;
      }
      const variants =
        card.progressions.length > 1
          ? card.variants.filter((variant) => progression.variantIds.includes(variant.id))
          : [];
      targets.set(node.key, {
        ...control,
        key: node.key,
        pointId: node.pointId,
        categoryLabel: card.displayLabel,
        variantLabel: variants.length
          ? [...new Set(variants.map((variant) => gameTextToPlain(variant.name)))].join(' / ')
          : undefined,
        availableLevels: progression.availableLevels,
        trainingLevel: skill.trainingLevel
      });
    }
  }
  return [...targets.values()];
}

/** Display ordering is reused only for presentation; DAG transitions remain in the cost domain. */
export function createTrainingTraceSummary(
  traces: Trace[],
  profile: CharacterTrainingProfile | undefined,
  activeTraceIds: readonly string[]
): Trace[] {
  const paidIds = new Set(
    profile?.nodes.filter((node) => node.kind === 'trace').map((node) => node.pointId)
  );
  const activeIds = new Set(activeTraceIds);
  const groups = groupTracesForDisplay(traces);
  return [
    ...groups.abilityGroups.flatMap((group) => [group.ability, ...group.stats]),
    ...groups.specialAbilities,
    ...groups.standaloneStats
  ].filter((trace) => paidIds.has(trace.id) && activeIds.has(trace.id));
}

/** Expense groups are presentation projections; the domain's total remains authoritative. */
export function createTrainingExpenseCosts(
  result: CharacterTrainingResult | LightConeTrainingResult
): TrainingExpenseCosts {
  return {
    upgrade: mergeCosts(result.expItemCost, result.expCreditCost),
    promotion: result.promotionCost,
    skillTrace: 'skills' in result ? mergeCosts(result.skillCost, result.traceCost) : undefined,
    total: result.totalCost
  };
}

/** UI projections never own another copy of a paid progression target. */
export function createSkillTrainingControls(
  cards: SkillCard[],
  profile: CharacterTrainingProfile | undefined,
  target: CharacterTrainingTarget | undefined,
  pendingLevels: Record<string, number>,
  promotion: number
): Record<string, SkillTrainingControl> {
  const controls: Record<string, SkillTrainingControl> = {};
  for (const card of cards)
    for (const progression of card.progressions) {
      const variant = card.variants.find((variant) => progression.variantIds.includes(variant.id));
      const key =
        profile && variant && variant.source !== 'avatar-global-buff'
          ? resolveSkillProgression(profile, variant.id, variant.source)
          : undefined;
      const node = profile?.nodes.find((node) => node.key === key && node.kind === 'skill');
      const displayLevel = node
        ? (target?.displayLevels?.[node.key] ?? node.maxLevel)
        : (pendingLevels[progression.id] ?? progression.defaultLevel);
      const resolved = node ? resolveSkillTraining(node, displayLevel, promotion) : undefined;
      const categories = new Set(node?.bindings.map((binding) => binding.category));
      controls[progression.id] = {
        key: node?.key,
        displayLevel,
        requiredPromotion:
          resolved && resolved.requiredPromotion > promotion
            ? resolved.requiredPromotion
            : undefined,
        jointLabel: categories.size === 2 && categories.has('talent') && categories.has('assist')
      };
    }
  return controls;
}
