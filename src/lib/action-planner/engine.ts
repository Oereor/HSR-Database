import { phaseOperations } from './effect-config';
import type {
  ActionRecord,
  Diagnostic,
  DiagnosticCode,
  EffectOperation,
  EventAnchor,
  QueueSnapshot,
  SimulationPlan,
  SimulationResult,
  SimulationState,
  Target,
  UnitState
} from './types';

export const FULL_AG = 10000;
export const DEFAULT_LIMITS = { maxActions: 60, maxAV: 600 } as const;
export const HARD_LIMITS = { maxActions: 500, maxAV: 100000 } as const;
export const anchorKey = (anchor: EventAnchor): string =>
  anchor.kind === 'start' ? 'start' : `action:${encodeURIComponent(anchor.unitId)}:${anchor.turn}`;
export const modifierId = (operationId: string, unitId: string): string =>
  `${encodeURIComponent(operationId)}::${encodeURIComponent(unitId)}`;

class SimulationError extends Error {
  constructor(public diagnostic: Diagnostic) {
    super(diagnostic.code);
  }
}
function fail(code: DiagnosticCode, unitId?: string): never {
  throw new SimulationError({ code, severity: 'error', ...(unitId ? { unitId } : {}) });
}
function finite(value: number): number {
  if (!Number.isFinite(value)) fail('non-finite');
  return value;
}
export function effectiveSpeed(unit: UnitState): number {
  const speed = finite(
    unit.panelSpeed +
      unit.modifiers.reduce(
        (sum, buff) =>
          finite(sum + (buff.mode === 'flat' ? buff.amount : (unit.baseSpeed * buff.amount) / 100)),
        0
      )
  );
  if (speed <= 0) fail('invalid-speed', unit.id);
  return speed;
}
export function cloneState(state: SimulationState): SimulationState {
  return {
    ...state,
    units: state.units.map((unit) => ({
      ...unit,
      modifiers: unit.modifiers.map((buff) => ({ ...buff }))
    }))
  };
}
export function orderedUnits(state: SimulationState): UnitState[] {
  return state.units
    .filter((unit) => unit.id !== state.activeUnitId)
    .sort((a, b) => {
      const difference = a.remainingAG / effectiveSpeed(a) - b.remainingAG / effectiveSpeed(b);
      if (difference !== 0) return difference;
      if (a.remainingAG === 0 && b.remainingAG === 0) {
        if (a.zeroBatch !== b.zeroBatch) return b.zeroBatch - a.zeroBatch;
        if (a.zeroBatch && a.zeroOrder !== b.zeroOrder) return a.zeroOrder - b.zeroOrder;
      }
      return (
        (a.camp === b.camp ? 0 : a.camp === 'ally' ? -1 : 1) ||
        a.position - b.position ||
        a.id.localeCompare(b.id)
      );
    });
}
export function queueSnapshot(state: SimulationState): QueueSnapshot {
  return {
    elapsedAV: state.elapsedAV,
    completedActions: state.completedActions,
    queue: orderedUnits(state).map((unit) => ({
      unitId: unit.id,
      name: unit.name,
      camp: unit.camp,
      turn: unit.turns + 1,
      remainingAG: unit.remainingAG,
      remainingAV: finite(unit.remainingAG / effectiveSpeed(unit)),
      effectiveSpeed: effectiveSpeed(unit),
      modifiers: unit.modifiers.map((buff) => ({ ...buff }))
    }))
  };
}

export function validatePlan(plan: SimulationPlan): Diagnostic[] {
  const invalid = (): Diagnostic[] => [{ code: 'invalid-input', severity: 'error' }];
  if (
    !Number.isInteger(plan.maxActions) ||
    plan.maxActions < 1 ||
    plan.maxActions > HARD_LIMITS.maxActions ||
    !Number.isFinite(plan.maxAV) ||
    plan.maxAV <= 0 ||
    plan.maxAV > HARD_LIMITS.maxAV
  )
    return invalid();
  const unitIds = new Set<string>();
  const positions = new Set<string>();
  for (const unit of plan.units) {
    const position = `${unit.camp}:${unit.position}`;
    if (
      !unit.id ||
      unitIds.has(unit.id) ||
      positions.has(position) ||
      !['ally', 'enemy'].includes(unit.camp) ||
      !Number.isInteger(unit.position) ||
      unit.position < 0 ||
      !Number.isFinite(unit.baseSpeed) ||
      unit.baseSpeed <= 0 ||
      !Number.isFinite(unit.panelSpeed) ||
      unit.panelSpeed <= 0
    )
      return invalid();
    unitIds.add(unit.id);
    positions.add(position);
  }
  const keys = new Set<string>();
  const operationIds = new Set<string>();
  for (const event of plan.events) {
    if (
      !['start', 'action'].includes(event.anchor.kind) ||
      (event.anchor.kind === 'action' &&
        (!event.anchor.unitId || !Number.isInteger(event.anchor.turn) || event.anchor.turn < 1))
    )
      return invalid();
    const key = anchorKey(event.anchor);
    if (keys.has(key)) return invalid();
    keys.add(key);
    for (const op of event.operations) {
      if (!op.id || operationIds.has(op.id)) return invalid();
      operationIds.add(op.id);
      // Runtime callers may still supply JSON created with the original engine.
      if ((op as { type: string }).type === 'removeSpeedModifier')
        return [
          {
            code: 'unsupported-legacy-operation',
            severity: 'error',
            anchor: event.anchor,
            operationId: op.id
          }
        ];
      if (
        (op.phase !== undefined && !['preAction', 'postAction'].includes(op.phase)) ||
        (event.anchor.kind === 'start' && op.phase !== undefined)
      )
        return invalid();
      if (
        !['advance', 'delay', 'immediatelyAct', 'addSpeedModifier'].includes(op.type) ||
        !op.target ||
        !['units', 'allies', 'enemies'].includes(op.target.kind) ||
        (op.target.kind === 'units' &&
          (!op.target.unitIds.length ||
            op.target.unitIds.some((id) => !id) ||
            new Set(op.target.unitIds).size !== op.target.unitIds.length))
      )
        return invalid();
      if (
        (op.type === 'advance' || op.type === 'delay') &&
        (!Number.isFinite(op.percent) || op.percent < 0)
      )
        return invalid();
      if (
        op.type === 'addSpeedModifier' &&
        (!['flat', 'percent'].includes(op.mode) ||
          !Number.isFinite(op.amount) ||
          (op.turns !== null && (!Number.isSafeInteger(op.turns) || op.turns < 1)))
      )
        return invalid();
    }
  }
  return [];
}
export function createInitialState(plan: SimulationPlan): SimulationState {
  const errors = validatePlan(plan);
  if (errors.length) throw new SimulationError(errors[0]);
  return {
    elapsedAV: 0,
    completedActions: 0,
    batch: 0,
    units: plan.units.map((unit) => ({
      ...unit,
      remainingAG: FULL_AG,
      turns: 0,
      modifiers: [],
      zeroBatch: 0,
      zeroOrder: 0
    }))
  };
}
function resolveTargets(state: SimulationState, target: Target): UnitState[] | undefined {
  if (target.kind === 'units') {
    if (target.unitIds.some((id) => !state.units.some((unit) => unit.id === id))) return undefined;
    return state.units.filter((unit) => target.unitIds.includes(unit.id));
  }
  return state.units.filter((unit) => unit.camp === (target.kind === 'allies' ? 'ally' : 'enemy'));
}

/** Each operation commits atomically to a cloned state. */
export function applyOperations(
  input: SimulationState,
  operations: EffectOperation[],
  anchor: EventAnchor
): { state: SimulationState; diagnostics: Diagnostic[] } {
  let state = cloneState(input);
  const diagnostics: Diagnostic[] = [];
  for (const op of operations) {
    const next = cloneState(state);
    const warning = (code: DiagnosticCode, unitId?: string) =>
      diagnostics.push({ code, severity: 'warning', anchor, operationId: op.id, unitId });
    try {
      if ((op as { type: string }).type === 'removeSpeedModifier')
        fail('unsupported-legacy-operation');
      const targets = resolveTargets(next, op.target);
      if (!targets?.length) {
        warning('missing-target');
        continue;
      }
      if (op.type === 'addSpeedModifier') {
        for (const unit of targets)
          unit.modifiers.push({
            id: modifierId(op.id, unit.id),
            operationId: op.id,
            mode: op.mode,
            amount: op.amount,
            remainingTurns: op.turns
          });
      } else {
        const targetIds = new Set(targets.map((unit) => unit.id));
        const group = orderedUnits(next).filter((unit) => targetIds.has(unit.id));
        if (targetIds.has(next.activeUnitId ?? '')) warning('active-target', next.activeUnitId);
        for (const unit of group) {
          unit.remainingAG =
            op.type === 'immediatelyAct'
              ? 0
              : Math.max(
                  0,
                  finite(
                    unit.remainingAG +
                      ((op.type === 'advance' ? -1 : 1) * FULL_AG * op.percent) / 100
                  )
                );
          if (unit.remainingAG > 0) {
            unit.zeroBatch = 0;
            unit.zeroOrder = 0;
          }
        }
        if (op.type === 'immediatelyAct' || (op.type === 'advance' && op.percent > 0)) {
          const zeros = group.filter((unit) => unit.remainingAG === 0);
          if (zeros.length) {
            next.batch++;
            zeros.forEach((unit, i) => {
              unit.zeroBatch = next.batch;
              unit.zeroOrder = i;
            });
          }
        }
      }
      for (const unit of next.units) {
        effectiveSpeed(unit);
        finite(unit.remainingAG / effectiveSpeed(unit));
      }
      state = next;
    } catch (error) {
      if (error instanceof SimulationError)
        throw new SimulationError({ ...error.diagnostic, anchor, operationId: op.id });
      throw error;
    }
  }
  return { state, diagnostics };
}

export function stepSimulation(
  input: SimulationState,
  operations: EffectOperation[]
): { state: SimulationState; record: ActionRecord; diagnostics: Diagnostic[] } {
  let state = cloneState(input);
  const active = orderedUnits(state)[0];
  if (!active) fail('invalid-input');
  const speed = effectiveSpeed(active);
  const deltaAV = finite(active.remainingAG / speed);
  state.elapsedAV = finite(state.elapsedAV + deltaAV);
  for (const unit of state.units) {
    const consumed = finite(deltaAV * effectiveSpeed(unit));
    const residual = unit.remainingAG - consumed;
    // Normalize only subtraction roundoff, never manufacture an ordering epsilon in AV.
    const tolerance = Number.EPSILON * 8 * Math.max(FULL_AG, unit.remainingAG, consumed);
    unit.remainingAG = residual <= tolerance ? 0 : residual;
    if (unit.remainingAG > 0) {
      unit.zeroBatch = 0;
      unit.zeroOrder = 0;
    }
  }
  active.remainingAG = 0;
  const anchor: ActionRecord['anchor'] = {
    kind: 'action',
    unitId: active.id,
    turn: active.turns + 1
  };
  const durationSnapshot = new Set(active.modifiers.map((buff) => buff.id));
  state.activeUnitId = active.id;
  const record: ActionRecord = {
    anchor,
    elapsedAV: state.elapsedAV,
    deltaAV,
    effectiveSpeed: speed,
    beforeEffects: cloneState(state)
  };
  // Missing phases preserve the original engine's pre-reset behavior.
  const before = applyOperations(state, phaseOperations(operations, 'preAction'), anchor);
  state = before.state;
  const reset = state.units.find((unit) => unit.id === active.id)!;
  reset.turns++;
  reset.remainingAG = FULL_AG;
  reset.zeroBatch = 0;
  reset.zeroOrder = 0;
  delete state.activeUnitId;
  const after = applyOperations(state, phaseOperations(operations, 'postAction'), anchor);
  state = after.state;
  const finished = state.units.find((unit) => unit.id === active.id)!;
  finished.modifiers = finished.modifiers.filter((buff) => {
    if (buff.remainingTurns === null) return true;
    if (durationSnapshot.has(buff.id)) buff.remainingTurns--;
    return buff.remainingTurns > 0;
  });
  try {
    // Expiry changes speed, never the gauge or zero-queue priority set by post-action effects.
    finite(finished.remainingAG / effectiveSpeed(finished));
  } catch (error) {
    if (error instanceof SimulationError)
      throw new SimulationError({ ...error.diagnostic, anchor });
    throw error;
  }
  state.completedActions++;
  return { state, record, diagnostics: [...before.diagnostics, ...after.diagnostics] };
}

export function simulatePlan(plan: SimulationPlan): SimulationResult {
  const result: SimulationResult = {
    records: [],
    snapshots: [],
    diagnostics: validatePlan(plan),
    stopReason: 'error'
  };
  if (result.diagnostics.length) return result;
  const reached = new Set<string>();
  const events = new Map(plan.events.map((event) => [anchorKey(event.anchor), event.operations]));
  try {
    let state = createInitialState(plan);
    result.startState = cloneState(state);
    reached.add('start');
    const initial = applyOperations(state, events.get('start') ?? [], { kind: 'start' });
    state = initial.state;
    result.diagnostics.push(...initial.diagnostics);
    result.snapshots.push(queueSnapshot(state));
    result.stopReason = state.units.length ? 'actions' : 'empty';
    if (!state.units.length) result.diagnostics.push({ code: 'no-units', severity: 'info' });
    while (state.units.length && state.completedActions < plan.maxActions) {
      const next = orderedUnits(state)[0];
      if (finite(state.elapsedAV + next.remainingAG / effectiveSpeed(next)) > plan.maxAV) {
        result.stopReason = 'av';
        break;
      }
      const anchor: EventAnchor = { kind: 'action', unitId: next.id, turn: next.turns + 1 };
      const step = stepSimulation(state, events.get(anchorKey(anchor)) ?? []);
      const snapshot = queueSnapshot(step.state);
      reached.add(anchorKey(anchor));
      state = step.state;
      result.records.push(step.record);
      result.snapshots.push(snapshot);
      result.diagnostics.push(...step.diagnostics);
    }
  } catch (error) {
    if (!(error instanceof SimulationError)) throw error;
    result.stopReason = 'error';
    result.diagnostics.push(error.diagnostic);
  }
  for (const event of plan.events)
    if (event.operations.length && !reached.has(anchorKey(event.anchor)))
      result.diagnostics.push({
        code: 'unreached-anchor',
        severity: 'warning',
        anchor: event.anchor
      });
  return result;
}
