export type Camp = 'ally' | 'enemy';

export interface UnitConfig {
  id: string;
  name: string;
  camp: Camp;
  position: number;
  baseSpeed: number;
  panelSpeed: number;
}

export type EventAnchor = { kind: 'start' } | { kind: 'action'; unitId: string; turn: number };
export type Target =
  { kind: 'units'; unitIds: string[] } | { kind: 'allies' } | { kind: 'enemies' };
export type EffectOperation =
  | { id: string; type: 'advance'; target: Target; percent: number }
  | { id: string; type: 'delay'; target: Target; percent: number }
  | { id: string; type: 'immediatelyAct'; target: Target }
  | {
      id: string;
      type: 'addSpeedModifier';
      target: Target;
      mode: 'flat' | 'percent';
      amount: number;
      turns: number;
    }
  | { id: string; type: 'removeSpeedModifier'; instanceIds: string[] };

export interface PlanEvent {
  anchor: EventAnchor;
  operations: EffectOperation[];
}
export interface SimulationPlan {
  units: UnitConfig[];
  events: PlanEvent[];
  maxActions: number;
  maxAV: number;
}
export interface SpeedModifierInstance {
  id: string;
  operationId: string;
  mode: 'flat' | 'percent';
  amount: number;
  remainingTurns: number;
}
export interface UnitState extends UnitConfig {
  remainingAG: number;
  turns: number;
  modifiers: SpeedModifierInstance[];
  zeroBatch: number;
  zeroOrder: number;
}
export interface SimulationState {
  units: UnitState[];
  elapsedAV: number;
  completedActions: number;
  batch: number;
  activeUnitId?: string;
}
export type DiagnosticCode =
  | 'invalid-input'
  | 'invalid-speed'
  | 'non-finite'
  | 'missing-target'
  | 'missing-modifier'
  | 'active-target'
  | 'unreached-anchor'
  | 'no-units';
export interface Diagnostic {
  code: DiagnosticCode;
  severity: 'error' | 'warning' | 'info';
  anchor?: EventAnchor;
  operationId?: string;
  unitId?: string;
}
export interface QueueEntry {
  unitId: string;
  name: string;
  camp: Camp;
  turn: number;
  remainingAG: number;
  remainingAV: number;
  effectiveSpeed: number;
  modifiers: SpeedModifierInstance[];
}
export interface QueueSnapshot {
  elapsedAV: number;
  completedActions: number;
  queue: QueueEntry[];
}
export interface ActionRecord {
  anchor: Extract<EventAnchor, { kind: 'action' }>;
  elapsedAV: number;
  deltaAV: number;
  effectiveSpeed: number;
  beforeEffects: SimulationState;
}
export interface SimulationResult {
  records: ActionRecord[];
  snapshots: QueueSnapshot[];
  startState?: SimulationState;
  diagnostics: Diagnostic[];
  stopReason: 'actions' | 'av' | 'error' | 'empty';
}
export interface PlannerCharacterOption {
  id: string;
  name: string;
  baseSpeed?: number;
  avatarId: string;
  officialAliases: string[];
  playerAliases: string[];
}
