import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import Inspector from '../../src/lib/components/action-planner/Inspector.svelte';
import EffectCard from '../../src/lib/components/action-planner/EffectCard.svelte';
import TargetGrid from '../../src/lib/components/action-planner/TargetGrid.svelte';
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
  it('renders a selectable trigger and one operation window, with editable creation configuration', () => {
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
    const editor = render(Inspector, {
      props: {
        ...callbacks,
        anchor: record.anchor,
        operations: plan.events[1].operations,
        context: record.beforeEffects,
        catalog: result.participants
      }
    }).body;
    expect(editor).toContain('data-phase-group="system"');
    expect(editor).not.toContain('data-phase-group="preAction"');
    expect(editor).not.toContain('data-phase-group="postAction"');
    expect(editor).not.toMatch(/<button[^>]*data-testid="edit-effect"[^>]*disabled/);
    expect(editor).toContain('role="tablist"');
    expect(editor).toContain('aria-controls="inspector-participant-panel"');
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
    const body = render(Inspector, {
      props: {
        ...callbacks,
        anchor: { kind: 'start' },
        operations: plan.events[0].operations,
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
  it('keeps unavailable anchors editable without inventing runtime targets from the catalog', () => {
    const operation = {
      id: 'orphan-effect',
      type: 'advance' as const,
      target: { kind: 'allies' as const },
      percent: 50,
      phase: 'preAction' as const
    };
    const body = render(Inspector, {
      props: {
        ...callbacks,
        anchor: { kind: 'action', participantId: 'removed', turn: 2 },
        operations: [operation],
        catalog: [{ id: 'future', kind: 'actor', name: 'Synthetic future', camp: 'ally' }]
      }
    }).body;
    expect(body).not.toContain('data-testid="preset-target"');
    expect(body).not.toContain('title="Synthetic future"');
    expect(body).toContain('data-operation-id="orphan-effect"');
    expect(callbacks.onChange).not.toHaveBeenCalled();
  });
  it('renders editable countdown speed cards and identity-based labels without adding catalog targets', () => {
    const participants = [
      { id: 'a', kind: 'actor' as const, camp: 'ally' as const, name: 'Synthetic shared' },
      { id: 'b', kind: 'actor' as const, camp: 'ally' as const, name: 'Synthetic shared' }
    ];
    const labels = new Map([
      ['a', 'Synthetic first'],
      ['b', 'Synthetic second']
    ]);
    const grid = render(TargetGrid, {
      props: {
        participants,
        labels,
        selectedIds: ['b'],
        avatar: callbacks.avatar,
        onToggle: vi.fn()
      }
    }).body;
    expect(grid).toContain('aria-label="Synthetic first"');
    expect(grid).toContain('aria-label="Synthetic second"');
    expect(grid).toMatch(/aria-pressed="true"[^>]*data-unit-id="b"/);
    const card = render(EffectCard, {
      props: {
        locale: 'en',
        labels,
        operation: {
          id: 'clock',
          type: 'addSpeedModifier',
          target: { kind: 'participants', participantIds: ['b'] },
          mode: 'flat',
          amount: 60,
          duration: { kind: 'countdown', name: 'Synthetic clock', speed: 70 }
        },
        participants,
        catalog: participants,
        avatar: callbacks.avatar,
        onEdit: vi.fn(),
        onMove: vi.fn(),
        onDelete: vi.fn()
      }
    }).body;
    expect(card).not.toMatch(/<button[^>]*data-testid="edit-effect"[^>]*disabled/);
    expect(card).toContain('Synthetic clock');
    expect(card).toContain('aria-label="Synthetic second"');
    expect(card).not.toContain('readonly');
  });
});
