import { render } from 'svelte/server';
import { afterEach, describe, expect, it } from 'vitest';
import EidolonCard from '../../src/lib/components/character/EidolonCard.svelte';
import SkillProgressionPanel from '../../src/lib/components/character/SkillProgressionPanel.svelte';
import TraceCardPanel from '../../src/lib/components/character/TraceCardPanel.svelte';
import PlayerStatsPanel from '../../src/lib/components/player/PlayerStatsPanel.svelte';
import PlayerEquipmentSection from '../../src/lib/components/player/PlayerEquipmentSection.svelte';
import BaseStatsPanel from '../../src/lib/components/shared/BaseStatsPanel.svelte';
import LevelSlider from '../../src/lib/components/shared/LevelSlider.svelte';
import SuperimpositionPanel from '../../src/lib/components/light-cone/SuperimpositionPanel.svelte';
import { readBoundedInitialInteger } from '../../src/lib/domain/detail-initial-state';
import type {
  BaseStatProgression,
  Eidolon,
  RelicProperty,
  SkillProgression,
  Trace
} from '../../src/lib/domain/types';
import type { PlayerCharacter } from '../../src/lib/player/contract';
import type { PlayerEquipmentCatalog } from '../../src/lib/player/equipment';
import { getLocale, overwriteGetLocale } from '../../src/lib/paraglide/runtime.js';

const originalGetLocale = getLocale;
afterEach(() => overwriteGetLocale(originalGetLocale));

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
        leadingTag: '晋阶 6'
      }
    }).body;

    expect(staticBody).not.toMatch(/<input[^>]*disabled/);
    expect(staticBody).not.toContain('skill-effect-tag');
    expect(playerBody).toMatch(/<input[^>]*disabled/);
    expect(playerBody).toContain('Lv.70');
    expect(playerBody).toContain('晋阶 6');
    expect(playerBody).toContain('<small class="skill-effect-tag">晋阶 6</small>');
    expect(playerBody.indexOf('晋阶 6')).toBeLessThan(playerBody.indexOf('Lv.70'));
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
  it('renders equipment fallbacks, six fixed slots and accessible enhancement counts', () => {
    const character: PlayerCharacter = {
      characterId: '1304',
      progression: { rank: 0, level: 80, promotion: 6, enhanced: false },
      skillTree: [],
      lightCone: { lightConeId: '999999', level: 70, promotion: 5, rank: 2 },
      relics: [
        {
          type: 3,
          setId: '999998',
          level: 15,
          mainAffix: null,
          subAffixes: [
            {
              type: 'DefenceAddedRatio',
              display: '12.3%',
              percent: true,
              count: 3
            },
            { type: 'UnknownZero', display: '7', percent: false, count: 0 }
          ]
        }
      ],
      stats: []
    };
    const catalog: PlayerEquipmentCatalog = {
      schemaVersion: 1,
      locale: 'zh-CN',
      lightCones: [],
      relicSets: []
    };
    const recommendedProperty: RelicProperty = {
      propertyType: 'DefenceAddedRatio',
      name: '防御力',
      iconKey: 'IconDefence',
      allowedMainSlots: ['BODY'],
      canBeSubStat: true
    };
    const body = render(PlayerEquipmentSection, {
      props: {
        character,
        catalog,
        relicProperties: [recommendedProperty],
        recommendation: {
          lightCones: [],
          cavernSets: [],
          planarSets: [],
          mainStats: [],
          subStats: [recommendedProperty]
        }
      }
    }).body;

    expect(body).toContain('装备信息');
    expect(body).toContain('未知光锥 · ID 999999');
    expect(body.match(/data-player-relic-slot=/g)).toHaveLength(6);
    expect(body).toContain('未知遗器 · 套装 999998 / 类型 3');
    expect(body).not.toContain('href="/relics/999998/"');
    expect(body).toContain('主属性未知');
    expect(body).toContain('防御力');
    expect(body).toContain('×3');
    expect(body).toContain('强化 3 次');
    expect(body).not.toContain('推荐匹配');
    expect(body).not.toMatch(/>主属性<|>副属性</);
    expect(body).toContain('data-recommended="true"');
    expect(body).not.toContain('×0');
  });

  it('links known equipment to localized static details with only initial Light Cone state', () => {
    const character: PlayerCharacter = {
      characterId: '1304',
      progression: { rank: 0, level: 80, promotion: 6, enhanced: false },
      skillTree: [],
      lightCone: { lightConeId: '23023', level: 70, promotion: 5, rank: 2 },
      relics: [
        {
          type: 3,
          setId: '103',
          level: 15,
          mainAffix: { type: 'DefenceAddedRatio', display: '54.0%', percent: true },
          subAffixes: []
        }
      ],
      stats: []
    };
    const catalog: PlayerEquipmentCatalog = {
      schemaVersion: 1,
      locale: 'en',
      lightCones: [
        {
          id: '23023',
          name: 'Destiny’s Threads Forewoven',
          rarity: 4,
          path: 'Knight',
          pathName: 'Preservation'
        }
      ],
      relicSets: [
        {
          id: '103',
          name: 'Knight of Purity Palace',
          pieces: [{ id: '31033', slot: 'BODY', name: 'Knight’s Solemn Breastplate' }]
        }
      ]
    };

    overwriteGetLocale(() => 'en');
    const body = render(PlayerEquipmentSection, { props: { character, catalog } }).body;

    expect(body).toContain('href="/en/light-cones/23023/?level=70&amp;rank=2"');
    expect(body).toContain('href="/en/relics/103/"');
    expect(body).toContain('compact-entity-card__aside');
    expect(body).toContain('data-relic-icon-presentation="header"');
    expect(body).toContain('player-affix-row--main');
  });

  it('renders explicit empty equipment states without collapsing relic slots', () => {
    const character: PlayerCharacter = {
      characterId: '1304',
      progression: { rank: 0, level: 1, promotion: 0, enhanced: false },
      skillTree: [],
      lightCone: null,
      relics: [],
      stats: []
    };
    const catalog: PlayerEquipmentCatalog = {
      schemaVersion: 1,
      locale: 'zh-CN',
      lightCones: [],
      relicSets: []
    };
    const body = render(PlayerEquipmentSection, { props: { character, catalog } }).body;

    expect(body).toContain('未装备光锥');
    expect(body.match(/data-player-relic-state="empty"/g)).toHaveLength(6);
  });

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
    const props = {
      stats: [
        {
          field: 'effect_hit',
          percent: true,
          total: '20%'
        },
        { field: 'hp', percent: false, total: '3000' },
        {
          field: 'elation_dmg',
          percent: true,
          total: '40%'
        },
        {
          field: 'sp_rate',
          percent: true,
          total: '24.4%'
        }
      ],
      properties,
      progression,
      level: 80,
      promotion: 6,
      controlId: 'player-level'
    };
    const body = render(PlayerStatsPanel, { props }).body;

    expect(body).not.toContain('aria-pressed=');
    expect(body).toContain('<small class="skill-effect-tag">晋阶 6</small>');
    expect(body.indexOf('晋阶 6')).toBeLessThan(body.indexOf('Lv.80'));
    expect(body).toContain('生命值');
    expect(body).toContain('效果命中');
    expect(body).toContain('欢愉度');
    expect(body).not.toContain('elation_dmg</span>');
    expect(body).toContain('124.4%');
    expect(body.indexOf('data-player-stat-column="primary"')).toBeLessThan(
      body.indexOf('data-player-stat-column="other"')
    );
    expect(body).toMatch(/data-player-stat="hp"[\s\S]*IconMaxHP\.png/);
    expect(body).toMatch(/data-player-stat="elation_dmg"[\s\S]*IconJoy\.png/);

    overwriteGetLocale(() => 'en');
    const englishBody = render(PlayerStatsPanel, { props }).body;
    expect(englishBody).toContain('<small class="skill-effect-tag">Promotion 6</small>');
    expect(englishBody).toContain('Elation');
    expect(englishBody).not.toContain('elation_dmg</span>');
  });

  it('keeps Trace state metadata while showing text only for unresolved cards', () => {
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
    expect(playerBody).not.toContain('已激活');
    expect(playerBody).not.toContain('未激活');
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
    expect(playerBody).toContain('rank-card__content');
  });
});

describe('Light Cone detail initial state', () => {
  it('uses strict integer defaults and clamps values to the slider range', () => {
    expect(readBoundedInitialInteger(new URLSearchParams(), 'level', 80, 1, 80)).toBe(80);
    expect(readBoundedInitialInteger(new URLSearchParams('level=abc'), 'level', 80, 1, 80)).toBe(
      80
    );
    expect(readBoundedInitialInteger(new URLSearchParams('level=12.5'), 'level', 80, 1, 80)).toBe(
      80
    );
    expect(readBoundedInitialInteger(new URLSearchParams('level=0'), 'level', 80, 1, 80)).toBe(1);
    expect(readBoundedInitialInteger(new URLSearchParams('level=999'), 'level', 80, 1, 80)).toBe(
      80
    );
  });

  it('initializes both existing controls without making them read-only', () => {
    const statsBody = render(BaseStatsPanel, {
      props: { progression, controlId: 'light-cone-level', initialLevel: 37 }
    }).body;
    const superimpositionBody = render(SuperimpositionPanel, {
      props: {
        lightConeId: '23023',
        initialRank: 3,
        passive: {
          id: 'passive',
          name: '效果',
          superimposition: {
            scalingParamIndexes: [],
            levels: [1, 2, 3, 4, 5].map((level) => ({
              level,
              description: `等级 ${level}`,
              descriptionTokens: [{ type: 'text' as const, value: `等级 ${level}` }]
            }))
          }
        }
      }
    }).body;

    expect(statsBody).toContain('Lv.37');
    expect(statsBody).not.toMatch(/<input[^>]*disabled/);
    expect(superimpositionBody).toContain('Lv.3');
    expect(superimpositionBody).not.toMatch(/<input[^>]*disabled/);
  });
});
