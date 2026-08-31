import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import AsBossDossier from '../../src/lib/components/endgame/as/AsBossDossier.svelte';
import EndgameNodeHeading from '../../src/lib/components/endgame/EndgameNodeHeading.svelte';
import BuffOptionGroup from '../../src/lib/components/endgame/mechanics/BuffOptionGroup.svelte';
import MechanicSectionCard from '../../src/lib/components/endgame/mechanics/MechanicSectionCard.svelte';
import AnomalyArbitrationDetailContent from '../../src/lib/components/endgame/modes/AnomalyArbitrationDetailContent.svelte';
import {
  buildEndgameWaveGroups,
  buildEndgameWaveRows,
  formatChineseOrdinal,
  type EndgameWaveGroupPresentation
} from '../../src/lib/components/endgame/presentation';
import type {
  AnomalyArbitrationEncounterView,
  AnomalyArbitrationJudgmentQuadrantView,
  ApocalypticShadowSlotGuideView,
  EndgameBattleSlotView,
  EndgameEnemyReference,
  EnemyOccurrenceView
} from '../../src/lib/domain/endgame-view';

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

function enemy(identity: string, name: string, monsterId: number): EnemyOccurrenceView {
  return {
    identity,
    monsterId,
    monsterTemplateId: monsterId,
    name,
    weaknesses: [] satisfies EndgameEnemyReference['weaknesses'],
    hp: { roundedPerBar: '1000' },
    speed: { rounded: '100' },
    toughness: { roundedPerBar: '60' }
  };
}

function arbitrationEncounter(
  variant: AnomalyArbitrationEncounterView['variant'] = 'boss-normal'
): AnomalyArbitrationEncounterView {
  return {
    mode: 'aa',
    id: `test:${variant}`,
    label: '测试王棋',
    variant,
    traits: [
      { id: 1, name: '规则甲', description: '规则甲说明' },
      { id: 2, name: '规则乙', description: '规则乙说明' }
    ],
    battles: [
      {
        slot: 1,
        stages: [
          {
            key: 'stage-aa',
            index: 1,
            level: variant === 'boss-hard' ? 120 : 100,
            waves: [
              {
                key: 'wave-aa',
                label: '波次 1',
                enemies: [enemy('aa-enemy', '测试敌人', 10)]
              }
            ]
          }
        ]
      }
    ]
  };
}

const judgmentQuadrant: AnomalyArbitrationJudgmentQuadrantView = {
  key: 'aa:test:quadrant',
  options: [
    { id: 11, order: 1, name: '象限一', description: '象限一说明' },
    { id: 12, order: 2, name: '象限二', description: '象限二说明' },
    { id: 13, order: 3, name: '象限三', description: '象限三说明' }
  ]
};

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

describe('MechanicSectionCard', () => {
  it.each([1, 2, 3])('renders %i real segments without empty slots', (count) => {
    const items = Array.from({ length: count }, (_, index) => ({
      key: index + 1,
      title: `机制 ${index + 1}`,
      description: `描述 ${index + 1}`
    }));
    const { body } = render(MechanicSectionCard, {
      props: {
        title: '战意机制',
        headingLevel: 2,
        content: { kind: 'segments', items }
      }
    });

    expect(body).toContain('<h2');
    expect(body).toContain('战意机制');
    expect(
      body.match(/mechanic-section-card__segment season-mechanic-card__segment/g) ?? []
    ).toHaveLength(count);
    expect(body.match(/<h3/g) ?? []).toHaveLength(count);
    expect(body).toContain('data-mechanic-tone="buff"');
    expect(body).not.toContain('undefined');
  });

  it('renders description content and exposes the semantic debuff tone', () => {
    const { body } = render(MechanicSectionCard, {
      props: {
        title: '棋局特性',
        headingLevel: 3,
        tone: 'debuff',
        content: { kind: 'description', description: '不利效果说明' }
      }
    });

    expect(body).toContain('<h3');
    expect(body).toContain('棋局特性');
    expect(body).toContain('不利效果说明');
    expect(body).toContain('mechanic-section-card--debuff');
    expect(body).toContain('data-mechanic-tone="debuff"');
    expect(body).not.toContain('mechanic-section-card__segment');
  });
});

describe('Endgame shared detail primitives', () => {
  it('renders the shared node heading with Chinese ordinals at h3', () => {
    const { body } = render(EndgameNodeHeading, { props: { slot: 3 } });

    expect(body).toContain('<h3');
    expect(body).toContain('节点三');
  });

  it.each([1, 2, 3])('renders %i informational buff tiles without empty slots', (count) => {
    const options = Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      order: index + 1,
      name: `公理 ${index + 1}`,
      description: `描述 ${index + 1}`
    }));
    const { body } = render(BuffOptionGroup, {
      props: {
        title: '终焉公理',
        options,
        headingLevel: 4,
        headingScale: 'medium'
      }
    });

    expect(body).toContain('<h4');
    expect(body).toContain('终焉公理');
    expect(body.match(/data-buff-option-tile/g) ?? []).toHaveLength(count);
    expect(body.match(/<h5/g) ?? []).toHaveLength(count);
    expect(body).not.toContain('undefined');
  });
});

describe('AA shared detail composition', () => {
  it('inserts the optional quadrant between traits and waves without changing shared primitives', () => {
    const { body } = render(AnomalyArbitrationDetailContent, {
      props: { encounter: arbitrationEncounter('boss-normal'), judgmentQuadrant }
    });

    const traitsIndex = body.indexOf('data-endgame-mechanics="chess-traits"');
    const quadrantIndex = body.indexOf('data-endgame-mechanics="judgment-quadrant"');
    const wavesIndex = body.indexOf('data-aa-waves');
    expect(traitsIndex).toBeGreaterThanOrEqual(0);
    expect(quadrantIndex).toBeGreaterThan(traitsIndex);
    expect(wavesIndex).toBeGreaterThan(quadrantIndex);
    expect(body.match(/data-buff-option-tile/g) ?? []).toHaveLength(3);
    expect(body).toContain('data-mechanic-tone="debuff"');
    expect(body).toContain('data-wave-level="100"');
    expect(body).not.toContain('type="radio"');
    expect(body).not.toContain('type="checkbox"');
  });

  it('uses the same composition for a knight and naturally omits the quadrant', () => {
    const { body } = render(AnomalyArbitrationDetailContent, {
      props: { encounter: arbitrationEncounter('preliminary') }
    });

    expect(body).toContain('data-aa-stage-detail');
    expect(body).toContain('data-endgame-mechanics="chess-traits"');
    expect(body).not.toContain('data-endgame-mechanics="judgment-quadrant"');
    expect(body).toContain('data-aa-waves');
  });

  it('keeps hard-mode levels data-driven', () => {
    const { body } = render(AnomalyArbitrationDetailContent, {
      props: { encounter: arbitrationEncounter('boss-hard'), judgmentQuadrant }
    });

    expect(body).toContain('data-wave-level="120"');
    expect(body).toContain('data-endgame-enemy-level="120"');
  });
});

describe('AS boss dossier', () => {
  it('preserves source order, stage levels, multiple bosses, traits and nested effects', () => {
    const stages: EndgameBattleSlotView['stages'] = [
      {
        key: 'stage-a',
        index: 1,
        level: 60,
        waves: [
          {
            key: 'wave-a',
            label: '波次 1',
            enemies: [enemy('a', '首领甲', 1), enemy('b', '首领乙', 2)]
          }
        ]
      },
      {
        key: 'stage-b',
        index: 2,
        level: 90,
        waves: [
          {
            key: 'wave-b',
            label: '波次 1',
            enemies: [enemy('c', '首领丙', 3)]
          }
        ]
      }
    ];
    const bossGuide: ApocalypticShadowSlotGuideView = {
      key: 'guide',
      traits: [
        {
          id: 1,
          order: 1,
          name: '测试特性',
          description: '一段足够长的测试说明。',
          linkedEffects: [
            { id: 'effect-a', name: '效果甲', description: '甲说明' },
            { id: 'effect-b', name: '效果乙', description: '乙说明' }
          ]
        }
      ]
    };
    const { body } = render(AsBossDossier, { props: { stages, bossGuide } });

    expect(body.indexOf('首领甲')).toBeLessThan(body.indexOf('首领乙'));
    expect(body.indexOf('首领乙')).toBeLessThan(body.indexOf('首领丙'));
    expect(body.match(/data-endgame-enemy-level="60"/g) ?? []).toHaveLength(2);
    expect(body.match(/data-endgame-enemy-level="90"/g) ?? []).toHaveLength(1);
    expect(body.match(/data-as-boss-source-group/g) ?? []).toHaveLength(2);
    expect(body).toContain('首领特性');
    expect(body).toContain('测试特性');
    expect(body.indexOf('effect-a')).toBeLessThan(body.indexOf('effect-b'));
    expect(body.match(/data-stage-effect-explanations/g) ?? []).toHaveLength(1);
  });
});
