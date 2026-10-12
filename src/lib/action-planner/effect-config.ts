import type { EffectOperation, EffectPhase, EventAnchor, Target, UnitConfig } from './types';

/** The original engine resolved all operations before resetting the action gauge. */
export const effectPhase = (operation: EffectOperation): EffectPhase =>
  operation.phase ?? 'preAction';

export function phaseOperations(operations: readonly EffectOperation[], phase: EffectPhase) {
  return operations.filter((operation) => effectPhase(operation) === phase);
}

export function targetIds(target: Target, units: readonly UnitConfig[]): string[] {
  return target.kind === 'units'
    ? [...target.unitIds]
    : units
        .filter((unit) => unit.camp === (target.kind === 'allies' ? 'ally' : 'enemy'))
        .map((unit) => unit.id);
}

export function saveOperation(
  operations: readonly EffectOperation[],
  operation: EffectOperation,
  anchor: EventAnchor
): EffectOperation[] {
  const old = operations.find((entry) => entry.id === operation.id);
  if (old && (anchor.kind === 'start' || effectPhase(old) === effectPhase(operation)))
    return operations.map((entry) => (entry.id === operation.id ? operation : entry));
  return [...operations.filter((entry) => entry.id !== operation.id), operation];
}

export function moveOperation(
  operations: readonly EffectOperation[],
  id: string,
  delta: -1 | 1,
  anchor: EventAnchor
): EffectOperation[] {
  const operation = operations.find((entry) => entry.id === id);
  if (!operation) return [...operations];
  const group =
    anchor.kind === 'start' ? [...operations] : phaseOperations(operations, effectPhase(operation));
  const neighbor = group[group.findIndex((entry) => entry.id === id) + delta];
  if (!neighbor) return [...operations];
  const next = [...operations];
  const from = next.findIndex((entry) => entry.id === id);
  const to = next.findIndex((entry) => entry.id === neighbor.id);
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
