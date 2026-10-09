export * from './types.js';
export * from './exp.js';
import { calculateTrainingExpCosts } from './exp.js';
import type {
  CharacterTrainingData,
  CharacterTrainingProfile,
  CharacterTrainingResult,
  CharacterTrainingTarget,
  Cost,
  CostSourceStep,
  LightConeTrainingData,
  LightConeTrainingResult,
  LightConeTrainingTarget,
  PromotionCostStage,
  ResolvedSkillTraining,
  TraceTransition,
  TrainingCosts,
  TrainingNode,
  TrainingSharedData
} from './types.js';

export class TrainingError extends Error {
  constructor(
    public readonly code: string,
    public readonly identity: string
  ) {
    super(`[training/${code}] ${identity}`);
    this.name = 'TrainingError';
  }
}

export function trainingInteger(value: number, identity: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || value < minimum)
    throw new TrainingError('invalid-integer', identity);
  return value;
}

export function trainingId(value: string): string {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))
    throw new TrainingError('invalid-id', String(value));
  return value;
}

export function progressionKey(avatarId: string, enhancedId: number, pointId: string): string {
  return `${trainingId(avatarId)}:${trainingInteger(enhancedId, 'enhancedId')}:${trainingId(pointId)}`;
}

export function mergeCosts(...costs: readonly Cost[]): Cost {
  const result: Cost = {};
  for (const cost of costs) {
    if (!cost || typeof cost !== 'object' || Array.isArray(cost))
      throw new TrainingError('invalid-cost', 'Cost');
    for (const [id, quantity] of Object.entries(cost)) {
      trainingId(id);
      trainingInteger(quantity, `ItemID=${id}`);
      const total = trainingInteger((result[id] ?? 0) + quantity, `ItemID=${id} sum`);
      if (total) result[id] = total;
    }
  }
  return result;
}

export function validatePromotionChain(chain: readonly PromotionCostStage[]): void {
  if (!Array.isArray(chain) || !chain.length)
    throw new TrainingError('missing-promotion-chain', 'promotion');
  let lastMax = 0;
  for (const [index, stage] of chain.entries()) {
    if (stage.promotion !== index)
      throw new TrainingError('non-contiguous-promotion', String(stage.promotion));
    trainingInteger(stage.maxLevel, `promotion=${index} maxLevel`, 1);
    if (stage.maxLevel <= lastMax)
      throw new TrainingError('non-increasing-max-level', String(index));
    mergeCosts(stage.cost);
    lastMax = stage.maxLevel;
  }
  if (Object.keys(mergeCosts(chain.at(-1)!.cost)).length)
    throw new TrainingError('terminal-promotion-cost', String(chain.length - 1));
}

export function derivePromotion(chain: readonly PromotionCostStage[], level: number): number {
  validatePromotionChain(chain);
  trainingInteger(level, 'level', 1);
  const stage = chain.find((candidate) => level <= candidate.maxLevel);
  if (!stage) throw new TrainingError('level-out-of-range', String(level));
  return stage.promotion;
}

/** Index zero is the outgoing EXP of Lv.1; the terminal row is not serialized. */
export function requiredExp(exp: readonly number[] | undefined, level: number): number {
  trainingInteger(level, 'level', 1);
  if (!Array.isArray(exp) || exp.length < level - 1)
    throw new TrainingError('missing-exp-chain', String(level));
  let total = 0;
  for (let index = 0; index < level - 1; index++) {
    trainingInteger(exp[index], `EXP level=${index + 1}`, 1);
    total = trainingInteger(total + exp[index], 'EXP sum');
  }
  return total;
}

function validateNode(node: TrainingNode): void {
  trainingId(node.pointId);
  trainingInteger(node.pointType, `${node.key} pointType`, 1);
  trainingInteger(node.maxLevel, `${node.key} maxLevel`, 1);
  if (
    !['skill', 'trace', 'default', 'fixed'].includes(node.kind) ||
    typeof node.defaultUnlock !== 'boolean'
  )
    throw new TrainingError('invalid-node-kind', node.key);
  if (!Array.isArray(node.steps) || node.steps.length !== node.maxLevel)
    throw new TrainingError('missing-node-levels', node.key);
  let lastPromotion = 0;
  for (const [index, step] of node.steps.entries()) {
    if (step.level !== index + 1) throw new TrainingError('non-contiguous-node-levels', node.key);
    trainingInteger(step.requiredPromotion, `${node.key} promotion`);
    if (step.requiredPromotion < lastPromotion)
      throw new TrainingError('non-monotonic-promotion-limit', node.key);
    lastPromotion = step.requiredPromotion;
    mergeCosts(step.cost);
  }
  const initialCost = Object.keys(mergeCosts(node.steps[0].cost)).length;
  const allCost = Object.keys(mergeCosts(...node.steps.map((step) => step.cost))).length;
  if (
    (node.kind === 'skill' &&
      (!node.defaultUnlock || node.maxLevel < 2 || initialCost || !allCost)) ||
    (node.kind === 'trace' && (node.defaultUnlock || node.maxLevel !== 1 || !initialCost)) ||
    (node.kind === 'default' && (!node.defaultUnlock || node.maxLevel !== 1 || allCost)) ||
    (node.kind === 'fixed' && (node.defaultUnlock || node.maxLevel !== 1 || allCost))
  )
    throw new TrainingError('unsupported-node-shape', node.key);
  for (const ids of [node.prerequisiteIds, node.linkedSkillIds]) {
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length)
      throw new TrainingError('duplicate-node-reference', node.key);
    ids.forEach(trainingId);
  }
  if (!Array.isArray(node.bindings)) throw new TrainingError('invalid-bindings', node.key);
  const bindings = new Set<string>();
  for (const binding of node.bindings) {
    trainingId(binding.skillId);
    const identity = `${binding.source}:${binding.skillId}`;
    if (
      bindings.has(identity) ||
      !node.linkedSkillIds.includes(binding.skillId) ||
      !['avatar', 'memosprite'].includes(binding.source) ||
      typeof binding.category !== 'string' ||
      !binding.category
    )
      throw new TrainingError('invalid-skill-binding', identity);
    bindings.add(identity);
    if (
      !Array.isArray(binding.displayLevels) ||
      !binding.displayLevels.length ||
      new Set(binding.displayLevels).size !== binding.displayLevels.length
    )
      throw new TrainingError('invalid-display-levels', identity);
    binding.displayLevels.forEach((level) => trainingInteger(level, identity, 1));
    if (node.kind === 'skill' && !binding.displayLevels.includes(node.maxLevel))
      throw new TrainingError('paid-level-not-displayable', identity);
  }
}

export function validateTrainingProfile(profile: CharacterTrainingProfile): void {
  trainingId(profile.avatarId);
  trainingInteger(profile.enhancedId, 'enhancedId');
  if (!Array.isArray(profile.nodes) || !profile.nodes.length)
    throw new TrainingError('missing-profile-nodes', profile.avatarId);
  const nodes = new Map<string, TrainingNode>();
  const skillOwners = new Map<string, string>();
  for (const node of profile.nodes) {
    validateNode(node);
    if (node.key !== progressionKey(profile.avatarId, profile.enhancedId, node.pointId))
      throw new TrainingError('profile-key-mismatch', node.key);
    if (nodes.has(node.pointId)) throw new TrainingError('duplicate-point', node.key);
    nodes.set(node.pointId, node);
    for (const binding of node.bindings) {
      const identity = `${binding.source}:${binding.skillId}`;
      if (skillOwners.has(identity)) throw new TrainingError('ambiguous-skill-owner', identity);
      skillOwners.set(identity, node.key);
    }
  }
  const visiting = new Set<string>();
  const complete = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new TrainingError('cyclic-prerequisite', id);
    if (complete.has(id)) return;
    const node = nodes.get(id);
    if (!node) throw new TrainingError('missing-prerequisite', id);
    visiting.add(id);
    for (const parent of node.prerequisiteIds) {
      if (parent === id) throw new TrainingError('self-prerequisite', id);
      visit(parent);
    }
    visiting.delete(id);
    complete.add(id);
  };
  for (const id of nodes.keys()) visit(id);
}

export function resolveSkillProgression(
  profile: CharacterTrainingProfile,
  skillId: string,
  source: 'avatar' | 'memosprite' = 'avatar'
): string {
  validateTrainingProfile(profile);
  const node = profile.nodes.find((node) =>
    node.bindings.some((binding) => binding.skillId === skillId && binding.source === source)
  );
  if (!node) throw new TrainingError('unknown-public-skill', skillId);
  return node.key;
}

export function resolveSkillTraining(
  node: TrainingNode,
  displayLevel: number,
  promotion: number
): ResolvedSkillTraining {
  validateNode(node);
  if (node.kind !== 'skill') throw new TrainingError('not-paid-skill', node.key);
  trainingInteger(displayLevel, `${node.key} displayLevel`, 1);
  trainingInteger(promotion, 'promotion');
  if (
    node.bindings.length
      ? node.bindings.some((binding) => !binding.displayLevels.includes(displayLevel))
      : displayLevel > node.maxLevel
  )
    throw new TrainingError('display-level-out-of-range', node.key);
  const paidTarget = Math.min(displayLevel, node.maxLevel);
  const allowed = node.steps.filter((step) => step.requiredPromotion <= promotion).at(-1)?.level;
  if (!allowed) throw new TrainingError('initial-skill-unreachable', node.key);
  const trainingLevel = Math.min(paidTarget, allowed);
  return {
    key: node.key,
    displayLevel,
    paidMaxLevel: node.maxLevel,
    requiredPromotion: node.steps[paidTarget - 1].requiredPromotion,
    trainingLevel,
    reasons: [
      ...(displayLevel > node.maxLevel ? ['paid-max' as const] : []),
      ...(trainingLevel < paidTarget ? ['promotion' as const] : [])
    ]
  };
}

function nodeIndex(profile: CharacterTrainingProfile): Map<string, TrainingNode> {
  validateTrainingProfile(profile);
  return new Map(profile.nodes.map((node) => [node.pointId, node]));
}

function ancestors(
  nodes: ReadonlyMap<string, TrainingNode>,
  id: string,
  found = new Set<string>()
): Set<string> {
  if (found.has(id)) return found;
  const node = nodes.get(id);
  if (!node) throw new TrainingError('unknown-point', id);
  found.add(id);
  for (const parent of node.prerequisiteIds) ancestors(nodes, parent, found);
  return found;
}

function assertTraceState(
  nodes: ReadonlyMap<string, TrainingNode>,
  activeIds: readonly string[],
  promotion?: number
): void {
  if (!Array.isArray(activeIds) || new Set(activeIds).size !== activeIds.length)
    throw new TrainingError('duplicate-active-trace', 'activeTraceIds');
  const active = new Set(activeIds);
  for (const id of active) {
    if (nodes.get(id)?.kind !== 'trace') throw new TrainingError('not-activatable-trace', id);
    for (const parent of ancestors(nodes, id)) {
      const node = nodes.get(parent)!;
      if (node.kind === 'fixed' || (node.kind === 'trace' && !active.has(parent)))
        throw new TrainingError('inactive-prerequisite', `${id}:${parent}`);
      if (promotion !== undefined && node.steps[0].requiredPromotion > promotion)
        throw new TrainingError('trace-promotion-required', parent);
    }
  }
}

const sortedIds = (ids: Iterable<string>): string[] =>
  [...ids].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

export function activateTrace(
  profile: CharacterTrainingProfile,
  activeIds: readonly string[],
  traceId: string,
  promotion: number
): TraceTransition {
  trainingInteger(promotion, 'promotion');
  const nodes = nodeIndex(profile);
  assertTraceState(nodes, activeIds, promotion);
  if (nodes.get(traceId)?.kind !== 'trace')
    throw new TrainingError('not-activatable-trace', traceId);
  const closure = ancestors(nodes, traceId);
  const blocked = [...closure].filter(
    (id) => nodes.get(id)!.steps[0].requiredPromotion > promotion
  );
  const fixed = [...closure].filter((id) => nodes.get(id)!.kind === 'fixed');
  if (blocked.length || fixed.length)
    return {
      ok: false,
      activeTraceIds: [...activeIds],
      error: {
        code: blocked.length ? 'promotion-required' : 'non-activatable-prerequisite',
        pointIds: sortedIds(blocked.length ? blocked : fixed)
      }
    };
  return {
    ok: true,
    activeTraceIds: sortedIds(
      new Set([...activeIds, ...[...closure].filter((id) => nodes.get(id)!.kind === 'trace')])
    )
  };
}

function descendants(
  nodes: ReadonlyMap<string, TrainingNode>,
  seeds: Iterable<string>
): Set<string> {
  const result = new Set(seeds);
  const successors = new Map<string, string[]>();
  for (const node of nodes.values())
    for (const parent of node.prerequisiteIds)
      successors.set(parent, [...(successors.get(parent) ?? []), node.pointId]);
  const queue = [...result];
  for (let index = 0; index < queue.length; index++)
    for (const child of successors.get(queue[index]) ?? [])
      if (!result.has(child)) {
        result.add(child);
        queue.push(child);
      }
  return result;
}

export function deactivateTrace(
  profile: CharacterTrainingProfile,
  activeIds: readonly string[],
  traceId: string
): string[] {
  const nodes = nodeIndex(profile);
  assertTraceState(nodes, activeIds);
  if (nodes.get(traceId)?.kind !== 'trace')
    throw new TrainingError('not-activatable-trace', traceId);
  const removed = descendants(nodes, [traceId]);
  return sortedIds(activeIds.filter((id) => !removed.has(id)));
}

function targetProfile(
  data: CharacterTrainingData,
  target: Pick<CharacterTrainingTarget, 'avatarId' | 'enhancedId'>
): CharacterTrainingProfile {
  if (target.avatarId !== data.avatarId)
    throw new TrainingError('avatar-mismatch', target.avatarId);
  trainingInteger(target.enhancedId, 'enhancedId');
  const profile = data.profiles.find((profile) => profile.enhancedId === target.enhancedId);
  if (!profile || profile.avatarId !== data.avatarId)
    throw new TrainingError('unknown-profile', `${target.avatarId}:${target.enhancedId}`);
  validateTrainingProfile(profile);
  return profile;
}

function normalizeSkills(
  profile: CharacterTrainingProfile,
  levels: Record<string, number>,
  promotion: number
): ResolvedSkillTraining[] {
  if (!levels || typeof levels !== 'object' || Array.isArray(levels))
    throw new TrainingError('invalid-display-target', profile.avatarId);
  const nodes = profile.nodes.filter((node) => node.kind === 'skill');
  if (Object.keys(levels).some((key) => !nodes.some((node) => node.key === key)))
    throw new TrainingError('unknown-skill-target', Object.keys(levels).join(','));
  return nodes.map((node) => resolveSkillTraining(node, levels[node.key] ?? 1, promotion));
}

export function createInitialCharacterTrainingTarget(
  data: CharacterTrainingData,
  enhancedId: number
): Required<CharacterTrainingTarget> {
  const profile = targetProfile(data, { avatarId: data.avatarId, enhancedId });
  return {
    avatarId: data.avatarId,
    enhancedId,
    level: 1,
    displayLevels: Object.fromEntries(
      profile.nodes.filter((node) => node.kind === 'skill').map((node) => [node.key, 1])
    ),
    activeTraceIds: []
  };
}

export function createDefaultCharacterTrainingTarget(
  data: CharacterTrainingData,
  enhancedId: number
): Required<CharacterTrainingTarget> {
  const target = createInitialCharacterTrainingTarget(data, enhancedId);
  validatePromotionChain(data.promotions);
  const profile = targetProfile(data, target);
  const level = data.promotions.at(-1)!.maxLevel;
  const promotion = derivePromotion(data.promotions, level);
  let activeTraceIds: string[] = [];
  for (const node of profile.nodes.filter((node) => node.kind === 'trace')) {
    const transition = activateTrace(profile, activeTraceIds, node.pointId, promotion);
    if (!transition.ok)
      throw new TrainingError(transition.error.code, transition.error.pointIds.join(','));
    activeTraceIds = transition.activeTraceIds;
  }
  return {
    ...target,
    level,
    activeTraceIds,
    displayLevels: Object.fromEntries(
      profile.nodes.filter((node) => node.kind === 'skill').map((node) => [node.key, node.maxLevel])
    )
  };
}

export function reconcileCharacterLevel(
  data: CharacterTrainingData,
  target: CharacterTrainingTarget,
  level: number
): Required<CharacterTrainingTarget> {
  const profile = targetProfile(data, target);
  const oldPromotion = derivePromotion(data.promotions, target.level);
  const promotion = derivePromotion(data.promotions, level);
  const nodes = nodeIndex(profile);
  const active = target.activeTraceIds ?? [];
  assertTraceState(nodes, active, oldPromotion);
  normalizeSkills(profile, target.displayLevels ?? {}, oldPromotion);
  const removed = descendants(
    nodes,
    [...nodes.values()]
      .filter((node) => node.steps[0].requiredPromotion > promotion)
      .map((node) => node.pointId)
  );
  const skills = normalizeSkills(profile, target.displayLevels ?? {}, promotion);
  return {
    ...target,
    level,
    displayLevels: Object.fromEntries(skills.map((skill) => [skill.key, skill.displayLevel])),
    activeTraceIds: sortedIds(active.filter((id) => !removed.has(id)))
  };
}

function costResult(
  exp: readonly number[] | undefined,
  level: number,
  steps: CostSourceStep[],
  shared: TrainingSharedData,
  kind: 'character' | 'light-cone'
): TrainingCosts {
  const bySource = (source: CostSourceStep['source']): Cost =>
    mergeCosts(...steps.filter((step) => step.source === source).map((step) => step.cost));
  const promotionCost = bySource('promotion');
  const skillCost = bySource('skill');
  const traceCost = bySource('trace');
  const expCosts = calculateTrainingExpCosts(kind, shared, requiredExp(exp, level));
  const totalKnownCost = mergeCosts(promotionCost, skillCost, traceCost);
  return {
    ...expCosts,
    promotionCost,
    skillCost,
    traceCost,
    totalKnownCost,
    totalCost: mergeCosts(totalKnownCost, expCosts.expItemCost, expCosts.expCreditCost),
    steps,
    precision: {
      requiredExp: 'exact-from-configuration',
      knownCosts: 'exact-from-configuration',
      expItemConsumption: 'exact-under-greedy-strategy',
      expCreditCost: 'exact-under-greedy-strategy'
    }
  };
}

export function calculateCharacterTrainingTarget(
  data: CharacterTrainingData,
  shared: TrainingSharedData,
  target: CharacterTrainingTarget
): CharacterTrainingResult {
  const profile = targetProfile(data, target);
  const promotion = derivePromotion(data.promotions, target.level);
  const skills = normalizeSkills(profile, target.displayLevels ?? {}, promotion);
  const activeTraceIds = target.activeTraceIds ?? [];
  assertTraceState(nodeIndex(profile), activeTraceIds, promotion);
  const steps: CostSourceStep[] = data.promotions.slice(0, promotion).map((stage) => ({
    source: 'promotion',
    promotion: stage.promotion,
    cost: mergeCosts(stage.cost)
  }));
  for (const skill of skills) {
    const node = profile.nodes.find((node) => node.key === skill.key)!;
    for (const step of node.steps.slice(1, skill.trainingLevel))
      steps.push({
        source: 'skill',
        key: node.key,
        level: step.level,
        cost: mergeCosts(step.cost)
      });
  }
  for (const id of sortedIds(activeTraceIds)) {
    const node = profile.nodes.find((node) => node.pointId === id)!;
    steps.push({ source: 'trace', key: node.key, level: 1, cost: mergeCosts(node.steps[0].cost) });
  }
  return {
    ...costResult(shared.characterExp[data.expGroup], target.level, steps, shared, 'character'),
    target: {
      avatarId: target.avatarId,
      enhancedId: target.enhancedId,
      level: target.level,
      promotion,
      displayLevels: Object.fromEntries(skills.map((skill) => [skill.key, skill.displayLevel])),
      activeTraceIds: sortedIds(activeTraceIds)
    },
    skills,
    diagnostics: skills
      .filter((skill) => skill.displayLevel !== skill.trainingLevel)
      .map((skill) => ({
        code: 'display-training-difference',
        key: skill.key,
        displayLevel: skill.displayLevel,
        trainingLevel: skill.trainingLevel,
        reasons: [...skill.reasons]
      }))
  };
}

export function calculateLightConeTrainingTarget(
  data: LightConeTrainingData,
  shared: TrainingSharedData,
  target: LightConeTrainingTarget
): LightConeTrainingResult {
  if (target.equipmentId !== data.equipmentId)
    throw new TrainingError('equipment-mismatch', target.equipmentId);
  const promotion = derivePromotion(data.promotions, target.level);
  const steps: CostSourceStep[] = data.promotions.slice(0, promotion).map((stage) => ({
    source: 'promotion',
    promotion: stage.promotion,
    cost: mergeCosts(stage.cost)
  }));
  return {
    ...costResult(shared.lightConeExp[data.expGroup], target.level, steps, shared, 'light-cone'),
    target: { equipmentId: target.equipmentId, level: target.level, promotion }
  };
}

export function createInitialLightConeTrainingTarget(
  data: LightConeTrainingData
): LightConeTrainingTarget {
  return { equipmentId: data.equipmentId, level: 1 };
}

export function createDefaultLightConeTrainingTarget(
  data: LightConeTrainingData
): LightConeTrainingTarget {
  validatePromotionChain(data.promotions);
  return { equipmentId: data.equipmentId, level: data.promotions.at(-1)!.maxLevel };
}
