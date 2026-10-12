import { describe, expect, it } from 'vitest';
import {
  futureActionCard,
  participantLabels,
  queueActionCard,
  summarizeEffects
} from '../../src/lib/action-planner/presentation';
import type { NodeRecord, EffectOperation, QueueEntry } from '../../src/lib/action-planner/types';

const advance: EffectOperation = {
  id: 'advance',
  type: 'advance',
  target: { kind: 'allies' },
  percent: 25
};
const add: EffectOperation = {
  id: 'add',
  type: 'addSpeedModifier',
  target: { kind: 'allies' },
  mode: 'flat',
  amount: 20,
  duration: { kind: 'turns', turns: 2 }
};
describe('action card presentation', () => {
  it('omits empty summaries and groups configured operations without changing their order', () => {
    expect(summarizeEffects([])).toBeUndefined();
    for (const operation of [
      advance,
      { ...advance, type: 'delay' as const },
      { id: 'immediate', type: 'immediatelyAct' as const, target: { kind: 'enemies' as const } }
    ]) {
      expect(summarizeEffects([operation])).toEqual({ kind: operation.type, count: 1 });
    }
    const operations = Object.freeze([
      Object.freeze(add),
      Object.freeze({ ...add, id: 'second', duration: { kind: 'turns' as const, turns: null } })
    ]);
    expect(summarizeEffects(operations)).toEqual({ kind: 'speed', count: 2 });
    expect(operations.map(({ id }) => id)).toEqual(['add', 'second']);
    expect(summarizeEffects([advance, add])).toEqual({ kind: 'mixed', count: 2 });
  });

  it('preserves natural-action anchors, exact numbers and input record order', () => {
    const record: NodeRecord = {
      id: 'unit',
      kind: 'actor',
      name: 'Synthetic',
      anchor: { kind: 'action', participantId: 'unit', turn: 3 },
      elapsedAV: 10000 / 134,
      deltaAV: 10000 / 217,
      effectiveSpeed: 217.12345,
      beforeEffects: {
        participants: [],
        elapsedAV: 0,
        completedActions: 0,
        completedNodes: 0,
        batch: 0,
        nextOrder: 0,
        issuedParticipantIds: new Set()
      }
    };
    Object.freeze(record);
    const records = [record, { ...record, anchor: { ...record.anchor, turn: 4 }, deltaAV: 0 }];
    const cards = records.map((item) => futureActionCard(item));
    expect(cards.map(({ anchor }) => anchor)).toEqual(records.map(({ anchor }) => anchor));
    expect(cards[0]).toMatchObject({
      kind: 'future',
      elapsedAV: record.elapsedAV,
      deltaAV: record.deltaAV,
      effectiveSpeed: record.effectiveSpeed
    });
    expect(cards[0].anchor).toEqual(record.anchor);
    expect(cards[1]).toHaveProperty('deltaAV', 0);
  });

  it('maps a pending entry to its next stable anchor and remaining AV without inventing elapsed AV', () => {
    const entry: QueueEntry = {
      id: 'pending',
      kind: 'actor',
      name: 'Synthetic',
      camp: 'ally',
      anchor: { kind: 'action', participantId: 'pending', turn: 7 },
      remainingAG: 4321.98765,
      remainingAV: 4321.98765 / 134,
      effectiveSpeed: 134,
      modifiers: [
        {
          id: 'op:pending',
          operationId: 'op',
          mode: 'percent',
          amount: 10.125,
          lifetime: { kind: 'turns', remainingTurns: 2 }
        }
      ]
    };
    const original = structuredClone(entry);
    const card = queueActionCard(entry);
    expect(card).toMatchObject({
      kind: 'queue',
      anchor: { kind: 'action', participantId: entry.id, turn: 7 },
      remainingAV: entry.remainingAV
    });
    expect(card).not.toHaveProperty('elapsedAV');
    expect(card).not.toHaveProperty('deltaAV');
    expect(card).toHaveProperty('modifiers', entry.modifiers);
    expect(entry).toEqual(original);
  });
  it('disambiguates same-name instances by stable identity without depending on queue order', () => {
    const catalog = Object.freeze([
      Object.freeze({
        id: 'b',
        kind: 'actor' as const,
        name: 'Synthetic shared',
        camp: 'enemy' as const
      }),
      Object.freeze({
        id: 'a',
        kind: 'actor' as const,
        name: 'Synthetic shared',
        camp: 'ally' as const
      }),
      Object.freeze({ id: 'c', kind: 'scheduledEvent' as const, name: 'Synthetic unique' })
    ]);
    const format = (name: string, index: number) => `synthetic-label:${name}:${index}`;
    const labels = participantLabels(catalog, format);
    expect(labels.get('a')).toBe('synthetic-label:Synthetic shared:1');
    expect(labels.get('b')).toBe('synthetic-label:Synthetic shared:2');
    expect(labels.get('c')).toBe('Synthetic unique');
    const reversed = participantLabels([...catalog].reverse(), format);
    for (const participant of catalog)
      expect(reversed.get(participant.id)).toBe(labels.get(participant.id));
    expect(catalog.map((item) => item.id)).toEqual(['b', 'a', 'c']);
  });
});
