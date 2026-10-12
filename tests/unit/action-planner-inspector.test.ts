import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import EffectEditor from '../../src/lib/components/action-planner/EffectEditor.svelte';
import ActionCard from '../../src/lib/components/action-planner/ActionCard.svelte';
import { anchorKey, simulatePlan, spawnedParticipantId } from '../../src/lib/action-planner/engine';
import { futureActionCard } from '../../src/lib/action-planner/presentation';
import type { SimulationPlan } from '../../src/lib/action-planner/types';
const callbacks = {
  onChange: vi.fn(),
  nextId: () => 'draft',
  avatar: () => undefined,
  presets: {},
  locale: 'en' as const
};

describe('dynamic participant Inspector projections', () => {
  it('renders a selectable trigger and one operation window, with creation configuration read-only', () => {
    const id = spawnedParticipantId('timer');
    const plan: SimulationPlan = {
      actors: [],
      maxNodes: 2,
      maxAV: 200,
      events: [
        {
          anchor: { kind: 'start' },
          operations: [
            {
              id: 'timer',
              type: 'spawnParticipant',
              participant: { kind: 'scheduledEvent', name: 'Synthetic timer', speed: 100 }
            }
          ]
        },
        {
          anchor: { kind: 'trigger', participantId: id },
          operations: [
            {
              id: 'child',
              type: 'spawnParticipant',
              participant: {
                kind: 'actor',
                name: 'Synthetic child',
                camp: 'ally',
                baseSpeed: 100,
                panelSpeed: 100,
                actionLimit: 1,
                initialAG: 0
              }
            }
          ]
        }
      ]
    };
    const result = simulatePlan(plan),
      record = result.records[0];
    const onSelect = vi.fn();
    const card = render(ActionCard, {
      props: { locale: 'en', card: futureActionCard(record), onSelect }
    }).body;
    expect(card).toContain(`data-anchor="${anchorKey(record.anchor)}"`);
    expect(card).not.toContain('data-turn=');
    expect(card).toContain('Synthetic timer');
    const editor = render(EffectEditor, {
      props: {
        ...callbacks,
        anchor: record.anchor,
        operations: plan.events[1].operations,
        context: record.beforeEffects,
        participants: record.beforeEffects.participants,
        catalog: result.participants
      }
    }).body;
    expect(editor).toContain('data-phase-group="system"');
    expect(editor).not.toContain('data-phase-group="preAction"');
    expect(editor).not.toContain('data-phase-group="postAction"');
    expect(editor).toMatch(/<button[^>]*data-testid="edit-effect"[^>]*disabled/);
    expect(editor).toContain('data-testid="move-effect-up"');
    expect(editor).toContain('data-testid="delete-effect"');
    expect(callbacks.onChange).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('displays camp targets at each operation position rather than from future participant definitions', () => {
    const plan: SimulationPlan = {
      actors: [
        {
          id: 'a',
          kind: 'actor',
          name: 'Synthetic existing',
          camp: 'ally',
          position: 0,
          baseSpeed: 100,
          panelSpeed: 100
        }
      ],
      maxNodes: 1,
      maxAV: 200,
      events: [
        {
          anchor: { kind: 'start' },
          operations: [
            { id: 'before', type: 'advance', target: { kind: 'allies' }, percent: 0 },
            {
              id: 'child',
              type: 'spawnParticipant',
              participant: {
                kind: 'actor',
                name: 'Synthetic created',
                camp: 'ally',
                baseSpeed: 100,
                panelSpeed: 100
              }
            },
            { id: 'after', type: 'advance', target: { kind: 'allies' }, percent: 0 }
          ]
        }
      ]
    };
    const result = simulatePlan(plan);
    const body = render(EffectEditor, {
      props: {
        ...callbacks,
        anchor: { kind: 'start' },
        operations: plan.events[0].operations,
        participants: plan.actors,
        context: result.startState,
        catalog: result.participants
      }
    }).body;
    const before = body
      .split('data-operation-id="before"')[1]
      .split('data-operation-id="child"')[0];
    const after = body.split('data-operation-id="after"')[1];
    expect(before).toContain('title="Synthetic existing"');
    expect(before).not.toContain('title="Synthetic created"');
    expect(after).toContain('title="Synthetic existing"');
    expect(after).toContain('title="Synthetic created"');
  });
});
