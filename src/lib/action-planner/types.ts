export type Camp = 'ally' | 'enemy';

interface ParticipantDefinitionBase {
  name: string;
  iconUrl?: string;
  initialAG?: number;
}
export interface ActorDefinition extends ParticipantDefinitionBase {
  kind: 'actor';
  category?: 'character' | 'enemy' | 'summon' | 'memosprite' | 'custom';
  camp: Camp;
  baseSpeed: number;
  panelSpeed: number;
  actionLimit?: number | null;
}
export interface ScheduledEventDefinition extends ParticipantDefinitionBase {
  kind: 'scheduledEvent';
  speed: number;
}
export type ParticipantDefinition = ActorDefinition | ScheduledEventDefinition;
export interface ActorConfig extends ActorDefinition {
  id: string;
  position: number;
}
export type NodeAnchor =
  | { kind: 'action'; participantId: string; turn: number }
  | { kind: 'trigger'; participantId: string };
export type EventAnchor = { kind: 'start' } | NodeAnchor;
export type Target =
  { kind: 'participants'; participantIds: string[] } | { kind: 'allies' } | { kind: 'enemies' };
export type EffectPhase = 'preAction' | 'postAction';
export type SpeedDuration =
  { kind: 'turns'; turns: number | null } | { kind: 'countdown'; name: string; speed: number };
export type EffectOperation = { id: string; phase?: EffectPhase } & (
  | { type: 'advance'; target: Target; percent: number }
  | { type: 'delay'; target: Target; percent: number }
  | { type: 'immediatelyAct'; target: Target }
  | {
      type: 'addSpeedModifier';
      target: Target;
      mode: 'flat' | 'percent';
      amount: number;
      duration: SpeedDuration;
    }
  | { type: 'spawnParticipant'; participant: ParticipantDefinition }
);
export type TargetedOperation = Exclude<EffectOperation, { type: 'spawnParticipant' }>;
export interface PlanEvent {
  anchor: EventAnchor;
  operations: EffectOperation[];
}
export interface SimulationPlan {
  actors: ActorConfig[];
  events: PlanEvent[];
  maxNodes: number;
  maxAV: number;
}
export interface SpeedModifierInstance {
  id: string;
  operationId: string;
  mode: 'flat' | 'percent';
  amount: number;
  lifetime:
    { kind: 'turns'; remainingTurns: number | null } | { kind: 'countdown'; participantId: string };
}
interface QueueState {
  id: string;
  remainingAG: number;
  order: number;
  zeroBatch: number;
  zeroOrder: number;
}
export interface ActorState extends ActorDefinition, QueueState {
  turns: number;
  modifiers: SpeedModifierInstance[];
}
export interface ScheduledEventState extends ScheduledEventDefinition, QueueState {}
export type ParticipantState = ActorState | ScheduledEventState;
export interface ParticipantInfo {
  id: string;
  kind: ParticipantDefinition['kind'];
  name: string;
  iconUrl?: string;
  camp?: Camp;
}
export interface SimulationState {
  participants: ParticipantState[];
  elapsedAV: number;
  completedNodes: number;
  completedActions: number;
  batch: number;
  nextOrder: number;
  issuedParticipantIds: Set<string>;
  activeParticipantId?: string;
}
export type DiagnosticCode =
  | 'invalid-input'
  | 'invalid-target'
  | 'duplicate-participant'
  | 'invalid-speed'
  | 'non-finite'
  | 'missing-target'
  | 'active-target'
  | 'unreached-anchor'
  | 'no-participants';
export interface Diagnostic {
  code: DiagnosticCode;
  severity: 'error' | 'warning' | 'info';
  anchor?: EventAnchor;
  operationId?: string;
  participantId?: string;
}
export interface QueueEntry extends ParticipantInfo {
  anchor: NodeAnchor;
  remainingAG: number;
  remainingAV: number;
  effectiveSpeed: number;
  modifiers: SpeedModifierInstance[];
}
export interface QueueSnapshot {
  elapsedAV: number;
  completedNodes: number;
  completedActions: number;
  queue: QueueEntry[];
}
export interface NodeRecord extends ParticipantInfo {
  anchor: NodeAnchor;
  elapsedAV: number;
  deltaAV: number;
  effectiveSpeed: number;
  beforeEffects: SimulationState;
}
export interface SimulationResult {
  records: NodeRecord[];
  snapshots: QueueSnapshot[];
  startState?: SimulationState;
  participants: ParticipantInfo[];
  diagnostics: Diagnostic[];
  stopReason: 'nodes' | 'av' | 'error' | 'empty';
}
export interface PlannerCharacterOption {
  id: string;
  name: string;
  baseSpeed?: number;
  avatarId: string;
  officialAliases: string[];
  playerAliases: string[];
}
