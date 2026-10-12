import type { EffectOperation, EffectPhase, EventAnchor } from './types';
export { targetIds } from './targeting';
export const effectPhase = (operation: EffectOperation): EffectPhase | undefined => operation.phase;
export function phaseOperations(
  operations: readonly EffectOperation[],
  phase: EffectPhase
): EffectOperation[] {
  return operations.filter((operation) => operation.phase === phase);
}
export function saveOperation(
  operations: readonly EffectOperation[],
  operation: EffectOperation,
  anchor: EventAnchor
): EffectOperation[] {
  const old = operations.find((entry) => entry.id === operation.id);
  if (old && (anchor.kind !== 'action' || old.phase === operation.phase))
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
    anchor.kind !== 'action'
      ? [...operations]
      : operations.filter((entry) => entry.phase === operation.phase);
  const neighbor = group[group.findIndex((entry) => entry.id === id) + delta];
  if (!neighbor) return [...operations];
  const next = [...operations];
  const from = next.findIndex((entry) => entry.id === id),
    to = next.findIndex((entry) => entry.id === neighbor.id);
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
