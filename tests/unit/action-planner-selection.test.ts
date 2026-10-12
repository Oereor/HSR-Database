import { describe, expect, it } from 'vitest';
import {
  configuredAllies,
  createCharacterSearch,
  selectSlotCharacter,
  type CharacterSlotDraft
} from '../../src/lib/action-planner/character-selection';
import { DEFAULT_LIMITS, simulatePlan } from '../../src/lib/action-planner/engine';
import type { PlannerCharacterOption } from '../../src/lib/action-planner/types';

const character = (
  id: string,
  name: string,
  aliases: Partial<PlannerCharacterOption> = {}
): PlannerCharacterOption => ({
  id,
  name,
  avatarId: id,
  baseSpeed: 101,
  officialAliases: [],
  playerAliases: [],
  ...aliases
});
const empty: CharacterSlotDraft = { id: 'empty', characterId: '', name: '' };

describe('planner character selection', () => {
  it('initializes both speeds, preserves edits on same-character selection and replaces identity on change', () => {
    const a = character('1', 'Synthetic A');
    const selected = selectSlotCharacter(empty, a, () => 'a');
    expect(selected).toMatchObject({ id: 'a', baseSpeed: 101, panelSpeed: 101 });
    const edited = { ...selected, baseSpeed: 120.125, panelSpeed: 160.75 };
    expect(selectSlotCharacter(edited, a, () => 'unused')).toBe(edited);
    expect(
      selectSlotCharacter(edited, character('2', 'Synthetic B', { baseSpeed: 110 }), () => 'b')
    ).toMatchObject({ id: 'b', baseSpeed: 110, panelSpeed: 110 });
    expect(
      selectSlotCharacter(edited, character('3', 'Missing', { baseSpeed: undefined }), () => 'c')
    ).toMatchObject({ baseSpeed: undefined, panelSpeed: undefined });
  });
  it('uses fixed positions and only visible allies; replaced anchors remain orphaned and numeric edits recalculate', () => {
    const a = selectSlotCharacter(empty, character('1', 'A'), () => 'a');
    const units = configuredAllies([empty, a, empty, empty]);
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ position: 1, camp: 'ally' });
    const events = [
      {
        anchor: { kind: 'action' as const, participantId: 'a', turn: 1 },
        operations: [
          {
            id: 'op',
            phase: 'preAction' as const,
            type: 'advance' as const,
            target: { kind: 'allies' as const },
            percent: 10
          }
        ]
      }
    ];
    const result = simulatePlan({
      ...DEFAULT_LIMITS,
      actors: configuredAllies([{ ...a, panelSpeed: 160.75 }]),
      events
    });
    expect(result.records[0].deltaAV).toBe(10000 / 160.75);
    const replacement = selectSlotCharacter(a, character('2', 'B'), () => 'b');
    const replay = simulatePlan({
      ...DEFAULT_LIMITS,
      actors: configuredAllies([replacement]),
      events
    });
    expect(replay.diagnostics.some(({ code }) => code === 'unreached-anchor')).toBe(true);
    expect(replay.records.every(({ anchor }) => anchor.participantId === 'b')).toBe(true);
    expect(configuredAllies([empty])).toEqual([]);
  });
  it('shares normalized exact/prefix/contains and canonical/official/player ranking', () => {
    const characters = [
      character('1', 'Other', { playerAliases: ['Trail-Blazer'] }),
      character('2', 'Trail Blazer'),
      character('3', 'Third', { officialAliases: ['Trail Blazer'] }),
      character('4', 'Trail Blazer Extra')
    ];
    const search = createCharacterSearch(characters);
    expect(search('')).toBe(characters);
    expect(search('ＴＲＡＩＬ—ＢＬＡＺＥＲ').map(({ id }) => id)).toEqual(['2', '3', '1', '4']);
    expect(search('lazer').map(({ id }) => id)).toEqual(['2', '4', '3', '1']);
    expect(search('no synthetic match')).toEqual([]);
  });
});
