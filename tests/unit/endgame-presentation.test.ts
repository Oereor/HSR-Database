import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SeasonMechanicCard from '../../src/lib/components/endgame/mechanics/SeasonMechanicCard.svelte';
import {
  buildEndgameWaveGroups,
  buildEndgameWaveRows,
  formatChineseOrdinal,
  type EndgameWaveGroupPresentation
} from '../../src/lib/components/endgame/presentation';
import type { EndgameBattleSlotView } from '../../src/lib/domain/endgame-view';

function waveGroup(ordinal: number, enemyCount: number): EndgameWaveGroupPresentation {
  return {
    key: `group-${ordinal}`,
    level: 95,
    ordinal,
    wave: {
      key: `wave-${ordinal}`,
      label: `波次 ${ordinal}`,
      enemies: Array.from({ length: enemyCount }, (_, index) => ({
        identity: `enemy-${ordinal}-${index}`
      })) as EndgameWaveGroupPresentation['wave']['enemies']
    }
  };
}

describe('Endgame presentation', () => {
  it('formats positive ordinals as Chinese numerals with a safe fallback', () => {
    expect([1, 2, 3, 10, 11, 20, 99].map(formatChineseOrdinal)).toEqual([
      '一',
      '二',
      '三',
      '十',
      '十一',
      '二十',
      '九十九'
    ]);
    expect(formatChineseOrdinal(0)).toBe('0');
    expect(formatChineseOrdinal(100)).toBe('100');
  });

  it('flattens legacy stages into ordered wave groups while preserving each stage level', () => {
    const battle: EndgameBattleSlotView = {
      slot: 1,
      stages: [
        {
          key: 'stage-a',
          index: 1,
          level: 45,
          waves: [{ key: 'wave-a', label: '波次 1', enemies: [] }]
        },
        {
          key: 'stage-b',
          index: 2,
          level: 46,
          waves: [{ key: 'wave-b', label: '波次 1', enemies: [] }]
        }
      ]
    };

    expect(
      buildEndgameWaveGroups(battle).map(({ key, level, ordinal, wave }) => ({
        key,
        level,
        ordinal,
        wave: wave.key
      }))
    ).toEqual([
      { key: 'stage-a:wave-a', level: 45, ordinal: 1, wave: 'wave-a' },
      { key: 'stage-b:wave-b', level: 46, ordinal: 2, wave: 'wave-b' }
    ]);
  });

  it.each([
    [[2, 2], [[1, 2]]],
    [
      [3, 2],
      [[1], [2]]
    ],
    [[1, 2], [[1, 2]]],
    [[1, 1], [[1, 2]]],
    [
      [1, 1, 1],
      [[1, 2], [3]]
    ]
  ] as const)('packs paired wave groups atomically for %j enemies', (counts, expected) => {
    const rows = buildEndgameWaveRows(
      counts.map((count, index) => waveGroup(index + 1, count)),
      'paired'
    );
    expect(rows.map((row) => row.groups.map((group) => group.ordinal))).toEqual(expected);
    expect(rows.every((row) => row.groups.length <= 2)).toBe(true);
  });

  it('keeps every wave group on its own row for stacked layouts', () => {
    const rows = buildEndgameWaveRows(
      [waveGroup(1, 4), waveGroup(2, 3), waveGroup(3, 3)],
      'stacked'
    );
    expect(rows.map((row) => row.groups.map((group) => group.ordinal))).toEqual([[1], [2], [3]]);
  });
});

describe('SeasonMechanicCard', () => {
  it.each([1, 2, 3])('renders %i real segments without empty slots', (count) => {
    const items = Array.from({ length: count }, (_, index) => ({
      key: index + 1,
      title: `机制 ${index + 1}`,
      description: `描述 ${index + 1}`
    }));
    const { body } = render(SeasonMechanicCard, {
      props: {
        title: '战意机制',
        headingLevel: 2,
        content: { kind: 'segments', items }
      }
    });

    expect(body).toContain('<h2');
    expect(body).toContain('战意机制');
    expect(body.match(/<article class="season-mechanic-card__segment/g) ?? []).toHaveLength(count);
    expect(body.match(/<h3/g) ?? []).toHaveLength(count);
    expect(body).not.toContain('undefined');
  });
});
