import type { SkillCard, Trace } from '../types.js';
import { gameTextToPlain } from '../game-text.js';
import { groupTracesForDisplay } from '../trace-groups.js';
import type {
  CharacterTrainingProfile,
  CharacterTrainingResult,
  LightConeTrainingResult,
  ResolvedSkillTraining,
  Cost
} from './types.js';
import {
  mergeCosts,
  resolveSkillProgression,
  allowedSkillTrainingLevels,
  TrainingError
} from './index.js';

export interface SkillPreviewControl {
  key?: string;
  previewLevel: number;
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

export interface TrainingSkillTarget {
  jointLabel: boolean;
  iconKey?: SkillCard['iconKey'];
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
  skills: ResolvedSkillTraining[],
  promotion: number
): TrainingSkillTarget[] {
  const paidNodes = new Map(
    profile?.nodes.filter((node) => node.kind === 'skill').map((node) => [node.key, node])
  );
  const resolved = new Map(skills.map((skill) => [skill.key, skill]));
  const targets = new Map<string, TrainingSkillTarget>();
  for (const card of cards) {
    for (const progression of card.progressions) {
      const key = skillProgressionKey(card, progression.id, profile);
      const node = key ? paidNodes.get(key) : undefined;
      const skill = node ? resolved.get(node.key) : undefined;
      if (!node || !skill) continue;
      const previous = targets.get(node.key);
      if (previous) {
        const labels = new Set([...previous.categoryLabel.split(' / '), card.displayLabel]);
        previous.categoryLabel = [...labels].join(' / ');
        previous.iconKey ??= card.iconKey;
        continue;
      }
      const variants =
        card.progressions.length > 1
          ? card.variants.filter((variant) => progression.variantIds.includes(variant.id))
          : [];
      targets.set(node.key, {
        jointLabel: hasJointLabel(node),
        iconKey: card.iconKey,
        key: node.key,
        pointId: node.pointId,
        categoryLabel: card.displayLabel,
        variantLabel: variants.length
          ? [...new Set(variants.map((variant) => gameTextToPlain(variant.name)))].join(' / ')
          : undefined,
        availableLevels: allowedSkillTrainingLevels(node, promotion),
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

function skillProgressionKey(
  card: SkillCard,
  progressionId: string,
  profile: CharacterTrainingProfile | undefined
): string | undefined {
  const progression = card.progressions.find((candidate) => candidate.id === progressionId);
  const variant = card.variants.find((candidate) => progression?.variantIds.includes(candidate.id));
  return profile && variant && variant.source !== 'avatar-global-buff'
    ? resolveSkillProgression(profile, variant.id, variant.source)
    : undefined;
}

function hasJointLabel(node: CharacterTrainingProfile['nodes'][number]): boolean {
  const categories = new Set(node.bindings.map((binding) => binding.category));
  return categories.size === 2 && categories.has('talent') && categories.has('assist');
}

/** Preview is independent of the paid target, before and after its shard arrives. */
export function createSkillPreviewControls(
  cards: SkillCard[],
  profile: CharacterTrainingProfile | undefined,
  previewLevels: Record<string, number>,
  pendingLevels: Record<string, number>,
  promotion: number
): Record<string, SkillPreviewControl> {
  const controls: Record<string, SkillPreviewControl> = {};
  for (const card of cards)
    for (const progression of card.progressions) {
      const key = skillProgressionKey(card, progression.id, profile);
      const node = profile?.nodes.find(
        (candidate) => candidate.key === key && candidate.kind === 'skill'
      );
      const previewLevel =
        (key ? previewLevels[key] : undefined) ??
        pendingLevels[progression.id] ??
        node?.maxLevel ??
        progression.defaultLevel;
      if (
        !progression.availableLevels.includes(previewLevel) ||
        node?.bindings.some((binding) => !binding.displayLevels.includes(previewLevel))
      )
        throw new TrainingError('preview-level-out-of-range', key ?? progression.id);
      // The tag describes the normal promotion requirement; it never changes preview or cost.
      const requiredPromotion = node?.steps
        .filter((step) => step.level <= previewLevel)
        .at(-1)?.requiredPromotion;
      controls[progression.id] = {
        key: node?.key,
        previewLevel,
        requiredPromotion:
          requiredPromotion !== undefined && requiredPromotion > promotion
            ? requiredPromotion
            : undefined,
        jointLabel: node
          ? hasJointLabel(node)
          : cards.some(
              (candidate) =>
                candidate.category === 'talent' &&
                candidate.progressions.some((item) => item.id === progression.id)
            ) &&
            cards.some(
              (candidate) =>
                candidate.category === 'assist' &&
                candidate.progressions.some((item) => item.id === progression.id)
            )
      };
    }
  return controls;
}

/** Resolve pending public progression edits through the current profile's real bindings. */
export function initializeSkillPreviewLevels(
  cards: SkillCard[],
  profile: CharacterTrainingProfile,
  pendingLevels: Record<string, number>
): Record<string, number> {
  const controls = createSkillPreviewControls(cards, profile, {}, pendingLevels, 0);
  return Object.fromEntries(
    Object.values(controls)
      .filter((control) => control.key)
      .map((control) => [control.key!, control.previewLevel])
  );
}
