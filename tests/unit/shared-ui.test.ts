import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SearchBar from '../../src/lib/components/search/SearchBar.svelte';
import SectionNav from '../../src/lib/components/shared/SectionNav.svelte';
import SectionHeadingFixture from '../fixtures/SectionHeadingFixture.svelte';
import BaseStatsPanel from '../../src/lib/components/shared/BaseStatsPanel.svelte';
import SkillCardPanel from '../../src/lib/components/character/SkillCardPanel.svelte';
import TraceAbilityHeading from '../../src/lib/components/character/TraceAbilityHeading.svelte';
import EidolonCard from '../../src/lib/components/character/EidolonCard.svelte';
import type { BaseStatProgression, Eidolon, SkillCard, Trace } from '../../src/lib/domain/types';

describe('SectionHeading', () => {
  it.each([
    [1, 'h2'],
    [2, 'h3'],
    [3, 'h4']
  ] as const)('maps visual level %i to a semantic %s by default', (level, tag) => {
    const { body } = render(SectionHeadingFixture, { props: { level } });

    expect(body).toMatch(new RegExp(`<${tag}[^>]*id="heading-${level}"`));
    expect(body).toContain('synthetic section heading');
  });
});

describe('SectionNav', () => {
  it('renders semantic anchors and marks the first target current during SSR', () => {
    const { body } = render(SectionNav, {
      props: {
        items: [
          { id: 'stats', label: 'synthetic stats section' },
          { id: 'skills', label: 'synthetic skills section' }
        ]
      }
    });

    expect(body).toContain('<nav');
    expect(body).toMatch(/<nav[^>]*aria-label="[^"]+"/);
    expect(body).toContain('href="#stats"');
    expect(body).toContain('href="#skills"');
    expect(body).toContain('aria-current="location"');
    expect(body).toContain('synthetic stats section');
    expect(body).toContain('synthetic skills section');
  });
});

describe('SearchBar', () => {
  it('共享 canonical route 并将 Sidebar 可见标签关联到输入框', () => {
    const { body } = render(SearchBar, {
      props: {
        id: 'global-search',
        label: 'synthetic search label',
        placeholder: 'synthetic search placeholder',
        variant: 'sidebar'
      }
    });

    expect(body).toContain('<form');
    expect(body).toContain('action="/search/"');
    expect(body).toMatch(/<label[^>]*for="global-search"[^>]*>synthetic search label<\/label>/);
    expect(body).toContain('id="global-search"');
    expect(body).toContain('name="q"');
    expect(body).toMatch(/<button[^>]*type="submit"[^>]*aria-label="[^"]+"/);
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
      displayLabel: 'synthetic skill category',
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
      name: 'synthetic trace name',
      description: 'synthetic trace description',
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
    expect(fallbackTrace).toContain('synthetic trace name');

    const eidolon: Eidolon = {
      id: '140701',
      rank: 1,
      name: 'synthetic eidolon name',
      description: 'synthetic eidolon description',
      iconKey: 'rank--140701'
    };
    const enhancedEidolon = render(EidolonCard, { props: { eidolon } }).body;
    const fallbackEidolon = render(EidolonCard, {
      props: { eidolon: { ...eidolon, iconKey: undefined } }
    }).body;
    expect(enhancedEidolon).toContain('rank-icon');
    expect(enhancedEidolon).not.toContain('rank-number');
    expect(fallbackEidolon).toContain('rank-number');
    expect(fallbackEidolon).not.toContain('rank-icon');
  });
});
