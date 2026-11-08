import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'svelte';
import { render } from 'svelte/server';
import TooltipHost from '../fixtures/TooltipHost.svelte';
import SearchBar from '../../src/lib/components/search/SearchBar.svelte';
import SectionNav from '../../src/lib/components/shared/SectionNav.svelte';
import SectionHeadingFixture from '../fixtures/SectionHeadingFixture.svelte';
import BaseStatsPanel from '../../src/lib/components/shared/BaseStatsPanel.svelte';
import SkillCardPanel from '../../src/lib/components/character/SkillCardPanel.svelte';
import TraceAbilityHeading from '../../src/lib/components/character/TraceAbilityHeading.svelte';
import EidolonCard from '../../src/lib/components/character/EidolonCard.svelte';
import type { BaseStatProgression, Eidolon, SkillCard, Trace } from '../../src/lib/domain/types';
import { getCharacterDetailIconUrl } from '../../src/lib/data/visual-assets';
import { m } from '../../src/lib/paraglide/messages.js';

vi.mock('../../src/lib/paraglide/messages.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/paraglide/messages.js')>();
  return {
    ...actual,
    m: {
      ...actual.m,
      player_character_promotion: vi.fn(
        ({ promotion }: { promotion: number }) => `synthetic promotion ${promotion}`
      )
    }
  };
});

afterEach(() => vi.clearAllMocks());

describe('BaseStatsPanel promotion tag', () => {
  const maxima = [20, 30, 40, 50, 60, 70, 80];
  const progression: BaseStatProgression = {
    minLevel: 1,
    maxLevel: 80,
    defaultLevel: 80,
    stages: maxima.map((toLevel, index) => ({
      fromLevel: index === 0 ? 1 : maxima[index - 1] + 1,
      toLevel,
      hp: { base: 100, perLevel: 1 },
      attack: { base: 50, perLevel: 1 },
      defence: { base: 40, perLevel: 1 }
    }))
  };

  it.each([
    [undefined, 80, 6],
    [20, 20, 0],
    [21, 21, 1],
    [37, 37, 2]
  ])('derives the promotion from level %s', (level, displayed, promotion) => {
    const { body } = render(BaseStatsPanel, {
      props: {
        progression,
        controlId: 'synthetic-level',
        showPromotion: true,
        ...(level === undefined ? {} : { level })
      }
    });
    expect(m.player_character_promotion).toHaveBeenCalledWith({ promotion });
    expect(body).toContain(`synthetic promotion ${promotion}`);
    expect(body).toContain(`Lv.${displayed}`);
  });

  it.each([undefined, false])('hides promotion unless enabled (%s)', (showPromotion) => {
    const { body } = render(BaseStatsPanel, {
      props: {
        progression,
        controlId: 'synthetic-level',
        ...(showPromotion === undefined ? {} : { showPromotion })
      }
    });
    expect(m.player_character_promotion).not.toHaveBeenCalled();
  });

  it('keeps the empty state without computing a promotion for missing stages', () => {
    const { body } = render(BaseStatsPanel, {
      props: {
        progression: { ...progression, stages: [] },
        controlId: 'synthetic-level',
        showPromotion: true
      }
    });
    expect(body).toContain('data-placeholder');
    expect(body).not.toContain('skill-effect-tag');
    expect(body).not.toContain('type="range"');
    expect(m.player_character_promotion).not.toHaveBeenCalled();
  });
});

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
  it('共享 canonical route 并将 Sidebar 无障碍标签关联到输入框', () => {
    const { body } = render(TooltipHost<ComponentProps<typeof SearchBar>>, {
      props: {
        component: SearchBar,
        props: {
          id: 'global-search',
          label: 'synthetic search label',
          placeholder: 'synthetic search placeholder',
          variant: 'sidebar'
        }
      }
    });

    expect(body).toContain('<form');
    expect(body).toContain('action="/search/"');
    expect(body).toMatch(/<label[^>]*for="global-search"[^>]*>synthetic search label<\/label>/);
    expect(body).toContain('id="global-search"');
    expect(body).toContain('name="q"');
    const submit = body.slice(body.indexOf('<button'), body.indexOf('</button>'));
    expect(submit).toContain('type="submit"');
    expect(submit).toMatch(/aria-label="[^"]+"/);
  });
});

describe('Character detail icon enrichment', () => {
  it('基础属性在 resolver 成功时输出对应图片', () => {
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
    for (const key of [
      'property--MaxHP',
      'property--Attack',
      'property--Defence',
      'property--MaxSP'
    ] as const) {
      const url = getCharacterDetailIconUrl(key);
      expect(url).toBeDefined();
      expect(withIcons).toContain(`src="${url}"`);
    }
    expect(withoutIcons).not.toContain('<img ');
  });

  it('技能变体使用自己的图标，缺图时仍提供技能名称和占位', () => {
    const iconKey = 'skill-tree--1407002';
    const card: SkillCard = {
      category: 'skill',
      displayLabel: 'synthetic skill category',
      order: 1,
      progressions: [],
      variants: [
        {
          id: 'synthetic-variant',
          name: 'Synthetic variant',
          order: 0,
          source: 'avatar',
          progressionId: null,
          scalingParamIndexes: [],
          levels: [],
          combatMeta: {},
          iconKey
        }
      ]
    };
    const url = getCharacterDetailIconUrl(iconKey);
    expect(url).toBeDefined();
    expect(render(SkillCardPanel, { props: { card } }).body).toContain(`src="${url}"`);
    const fallback = render(SkillCardPanel, {
      props: {
        card: {
          ...card,
          variants: card.variants.map((variant) => ({ ...variant, iconKey: undefined }))
        }
      }
    }).body;
    expect(fallback).not.toContain('<img ');
    expect(fallback).toContain('data-image-fallback');
    expect(fallback).toContain('Synthetic variant');
  });

  it('能力与星魂缺图时保留信息并使用共享图片占位', () => {
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
    const traceIcon = getCharacterDetailIconUrl(trace.iconKey);
    expect(traceIcon).toBeDefined();
    expect(enhancedTrace).toContain(`src="${traceIcon}"`);
    expect(fallbackTrace).not.toContain('<img ');
    expect(fallbackTrace).toContain('synthetic trace name');
    expect(fallbackTrace).toContain('data-image-fallback');

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
    const eidolonIcon = getCharacterDetailIconUrl(eidolon.iconKey);
    expect(eidolonIcon).toBeDefined();
    expect(enhancedEidolon).toContain(`src="${eidolonIcon}"`);
    expect(fallbackEidolon).toContain('data-image-fallback');
    expect(fallbackEidolon).not.toContain('<img ');
    expect(fallbackEidolon).toContain('synthetic eidolon name');
  });
});
