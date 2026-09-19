import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import EidolonCard from '../../src/lib/components/character/EidolonCard.svelte';
import SkillProgressionPanel from '../../src/lib/components/character/SkillProgressionPanel.svelte';
import TraceCardPanel from '../../src/lib/components/character/TraceCardPanel.svelte';
import PlayerStatsPanel from '../../src/lib/components/player/PlayerStatsPanel.svelte';
import LevelSlider from '../../src/lib/components/shared/LevelSlider.svelte';
import type {
  BaseStatProgression,
  Eidolon,
  RelicProperty,
  SkillProgression,
  Trace
} from '../../src/lib/domain/types';

const progression: BaseStatProgression = {
  minLevel: 1,
  maxLevel: 80,
  defaultLevel: 80,
  stages: [
    {
      fromLevel: 1,
      toLevel: 80,
      hp: { base: 100, perLevel: 10 },
      attack: { base: 50, perLevel: 5 },
      defence: { base: 40, perLevel: 4 }
    }
  ]
};

describe('Player Character controls', () => {
  it('keeps static ranges interactive and makes Player ranges truly disabled', () => {
    const staticBody = render(LevelSlider, {
      props: { id: 'static-level', label: '角色等级', value: 80, min: 1, max: 80 }
    }).body;
    const playerBody = render(LevelSlider, {
      props: {
        id: 'player-level',
        label: '角色等级',
        value: 70,
        min: 1,
        max: 80,
        interactive: false,
        detail: '晋阶 6'
      }
    }).body;

    expect(staticBody).not.toMatch(/<input[^>]*disabled/);
    expect(playerBody).toMatch(/<input[^>]*disabled/);
    expect(playerBody).toContain('Lv.70');
    expect(playerBody).toContain('晋阶 6');
    expect(playerBody).not.toMatch(/<input[^>]*\sreadonly(?:=|\s|>)/);
  });

  it('uses the Player skill level read-only and marks missing progression as unresolved', () => {
    const skillProgression: SkillProgression = {
      id: '1304001',
      availableLevels: [1, 2, 3, 4, 5, 6],
      defaultLevel: 6,
      variantIds: []
    };
    const resolved = render(SkillProgressionPanel, {
      props: {
        progression: skillProgression,
        variants: [],
        categoryLabel: '普攻',
        playerLevel: 4
      }
    }).body;
    const unresolved = render(SkillProgressionPanel, {
      props: {
        progression: skillProgression,
        variants: [],
        categoryLabel: '普攻',
        playerLevel: null
      }
    }).body;

    expect(resolved).toContain('Lv.4');
    expect(resolved).toMatch(/<input[^>]*disabled/);
    expect(unresolved).toContain('data-player-skill-state="unresolved"');
    expect(unresolved).toContain('玩家技能等级未知');
    expect(unresolved).not.toContain('<input');
  });
});

describe('Player Character presentation', () => {
  it('renders localized stats in primary-then-other DOM order with an unknown fallback', () => {
    const properties: RelicProperty[] = [
      {
        propertyType: 'HPDelta',
        name: '生命值',
        iconKey: 'IconMaxHP',
        allowedMainSlots: ['HEAD'],
        canBeSubStat: true
      },
      {
        propertyType: 'StatusProbabilityBase',
        name: '效果命中',
        iconKey: 'IconStatusProbability',
        allowedMainSlots: ['BODY'],
        canBeSubStat: true
      }
    ];
    const body = render(PlayerStatsPanel, {
      props: {
        stats: [
          {
            field: 'effect_hit',
            percent: true,
            total: '20%',
            base: null,
            addition: '20%'
          },
          { field: 'hp', percent: false, total: '3000', base: '1000', addition: '2000' },
          {
            field: 'elation_dmg',
            percent: true,
            total: '40%',
            base: null,
            addition: null
          }
        ],
        properties,
        progression,
        level: 80,
        promotion: 6,
        controlId: 'player-level'
      }
    }).body;

    expect(body).toContain('aria-pressed="true"');
    expect(body).toContain('生命值');
    expect(body).toContain('效果命中');
    expect(body).toContain('elation_dmg');
    expect(body.indexOf('data-player-stat-column="primary"')).toBeLessThan(
      body.indexOf('data-player-stat-column="other"')
    );
    expect(body).toMatch(/data-player-stat="hp"[\s\S]*IconMaxHP\.png/);
  });

  it('renders Trace states with text while static cards omit Player state metadata', () => {
    const traces: Trace[] = [
      {
        id: '1304101',
        name: '能力一',
        description: '说明',
        type: 'ability',
        sourcePointType: 3,
        prerequisiteIds: [],
        anchorOrder: 1
      },
      {
        id: '1304201',
        name: '属性一',
        description: '说明',
        type: 'stat',
        sourcePointType: 1,
        prerequisiteIds: ['1304101'],
        anchorOrder: 2
      },
      {
        id: '1304202',
        name: '属性二',
        description: '说明',
        type: 'stat',
        sourcePointType: 1,
        prerequisiteIds: ['1304101'],
        anchorOrder: 3
      }
    ];
    const playerBody = render(TraceCardPanel, {
      props: {
        traces,
        playerSkillTree: [
          { id: '1304101', level: 1 },
          { id: '1304201', level: 0 }
        ]
      }
    }).body;
    const staticBody = render(TraceCardPanel, { props: { traces } }).body;

    expect(playerBody).toContain('data-player-state="active"');
    expect(playerBody).toContain('data-player-state="inactive"');
    expect(playerBody).toContain('data-player-state="unresolved"');
    expect(playerBody).toContain('已激活');
    expect(playerBody).toContain('未激活');
    expect(playerBody).toContain('状态未知');
    expect(staticBody).not.toContain('data-player-state=');
  });

  it('shows Eidolon state only in Player mode', () => {
    const eidolon: Eidolon = {
      id: '130401',
      rank: 1,
      name: '星魂一',
      description: '说明'
    };
    const staticBody = render(EidolonCard, { props: { eidolon } }).body;
    const playerBody = render(EidolonCard, {
      props: { eidolon, playerState: 'inactive' }
    }).body;

    expect(staticBody).not.toContain('data-player-state=');
    expect(staticBody).not.toContain('未激活');
    expect(playerBody).toContain('data-player-state="inactive"');
    expect(playerBody).toContain('未激活');
  });
});
