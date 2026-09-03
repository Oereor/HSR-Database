import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SearchBar from '../../src/lib/components/SearchBar.svelte';
import SectionNav from '../../src/lib/components/SectionNav.svelte';
import SectionHeadingFixture from '../fixtures/SectionHeadingFixture.svelte';
import BaseStatsPanel from '../../src/lib/components/BaseStatsPanel.svelte';
import SkillCardPanel from '../../src/lib/components/SkillCardPanel.svelte';
import TraceAbilityHeading from '../../src/lib/components/TraceAbilityHeading.svelte';
import EidolonCard from '../../src/lib/components/EidolonCard.svelte';
import type { BaseStatProgression, Eidolon, SkillCard, Trace } from '../../src/lib/domain/types';

describe('SectionHeading', () => {
  it.each([
    [1, 'h2'],
    [2, 'h3'],
    [3, 'h4']
  ] as const)('maps visual level %i to a semantic %s by default', (level, tag) => {
    const { body } = render(SectionHeadingFixture, { props: { level } });

    expect(body).toMatch(new RegExp(`<${tag}[^>]*id="heading-${level}"`));
    expect(body).toContain('统一标题');
  });
});

describe('SectionNav', () => {
  it('renders semantic anchors and marks the first target current during SSR', () => {
    const { body } = render(SectionNav, {
      props: {
        items: [
          { id: 'stats', label: '属性' },
          { id: 'skills', label: '技能' }
        ]
      }
    });

    expect(body).toContain('<nav');
    expect(body).toContain('aria-label="详情章节"');
    expect(body).toContain('href="#stats"');
    expect(body).toContain('href="#skills"');
    expect(body).toContain('aria-current="location"');
    expect(body).toContain('属性');
    expect(body).toContain('技能');
  });
});

describe('SearchBar', () => {
  it('共享 canonical route 并将 Sidebar 可见标签关联到输入框', () => {
    const { body } = render(SearchBar, {
      props: {
        id: 'global-search',
        label: '全局搜索',
        placeholder: '搜索角色、光锥…',
        variant: 'sidebar'
      }
    });

    expect(body).toContain('<form');
    expect(body).toContain('action="/search"');
    expect(body).toMatch(/<label[^>]*for="global-search"[^>]*>全局搜索<\/label>/);
    expect(body).toContain('id="global-search"');
    expect(body).toContain('name="q"');
    expect(body).toContain('aria-label="开始搜索"');
  });
});

describe('Character detail icon enrichment', () => {
  it('基础属性与技能标题仅在 resolver 成功时输出图片', () => {
    const progression: BaseStatProgression = {
      minLevel: 1,
      maxLevel: 1,
      defaultLevel: 1,
      stages: [
        {
          fromLevel: 1,
          toLevel: 1,
          hp: { base: 100, perLevel: 0 },
          attack: { base: 50, perLevel: 0 },
          defence: { base: 40, perLevel: 0 }
        }
      ],
      iconKeys: {
        hp: 'property--MaxHP',
        attack: 'property--Attack',
        defence: 'property--Defence'
      }
    };
    const withIcons = render(BaseStatsPanel, {
      props: {
        progression,
        controlId: 'character-level',
        energy: { kind: 'standard', max: 120, iconKey: 'property--MaxSP' }
      }
    }).body;
    const withoutIcons = render(BaseStatsPanel, {
      props: {
        progression: { ...progression, iconKeys: undefined },
        controlId: 'light-cone-level'
      }
    }).body;
    expect(withIcons.match(/<img /g)).toHaveLength(4);
    expect(withIcons).toContain('/generated-assets/character-details/icons/property/IconMaxHP.png');
    expect(withIcons).toContain(
      '/generated-assets/character-details/icons/property/IconAttack.png'
    );
    expect(withIcons).toContain(
      '/generated-assets/character-details/icons/property/IconDefence.png'
    );
    expect(withoutIcons).not.toContain('<img ');

    const card: SkillCard = {
      category: 'skill',
      displayLabel: '战技',
      order: 1,
      iconKey: 'skill-tree--1407002',
      progressions: [],
      variants: []
    };
    expect(render(SkillCardPanel, { props: { card } }).body).toContain(
      '/generated-assets/character-details/icons/skill/1407_skill.png'
    );
    expect(
      render(SkillCardPanel, { props: { card: { ...card, iconKey: undefined } } }).body
    ).not.toContain('<img ');
  });

  it('能力与星魂缺图时完整恢复原数字/文字布局', () => {
    const trace: Trace = {
      id: '8007501',
      name: '未完的尾声',
      description: '测试',
      type: 'ability',
      iconKey: 'skill-tree--8007501',
      sourcePointType: 5,
      prerequisiteIds: [],
      anchorOrder: 21
    };
    const enhancedTrace = render(TraceAbilityHeading, { props: { trace } }).body;
    const fallbackTrace = render(TraceAbilityHeading, {
      props: { trace: { ...trace, iconKey: undefined } }
    }).body;
    expect(enhancedTrace).toContain('8007_basic_atk2.png');
    expect(fallbackTrace).not.toContain('<img ');
    expect(fallbackTrace).toContain('未完的尾声');

    const eidolon: Eidolon = {
      id: '140701',
      rank: 1,
      name: '雪地的圣女，付记忆入殓',
      description: '测试',
      iconKey: 'rank--140701'
    };
    const enhancedEidolon = render(EidolonCard, { props: { eidolon } }).body;
    const fallbackEidolon = render(EidolonCard, {
      props: { eidolon: { ...eidolon, iconKey: undefined } }
    }).body;
    expect(enhancedEidolon).toContain('星魂 1');
    expect(enhancedEidolon).toContain('rank-icon');
    expect(enhancedEidolon).not.toContain('rank-number');
    expect(fallbackEidolon).toContain('rank-number');
    expect(fallbackEidolon).not.toContain('rank-icon');
    expect(fallbackEidolon).not.toContain('星魂 1');
  });
});
