import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import CompactEntityCard from '../../src/lib/components/shared/CompactEntityCard.svelte';
import PresetSection from '../../src/lib/components/action-planner/PresetSection.svelte';
import EquipmentRecommendationSection from '../../src/lib/components/character/EquipmentRecommendationSection.svelte';

// Synthetic site copy verifies locale routing without pinning mutable production text.
vi.mock('../../src/lib/paraglide/messages.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/lib/paraglide/messages.js')>();
  return {
    ...original,
    m: {
      ...original.m,
      ...Object.fromEntries(
        ['vonwacq', 'eagle', 'dance'].map((kind) => [
          `planner_preset_${kind}_effect`,
          (_inputs: unknown, options: { locale: string }) => `synthetic-${kind}-${options.locale}`
        ])
      )
    }
  };
});

describe('shared compact card semantics', () => {
  it('preserves the default link, article and missing-image behavior', () => {
    const link = render(CompactEntityCard, {
      props: { href: '/synthetic/', imageUrl: '/synthetic.png' }
    }).body;
    expect(link).toMatch(/<a[^>]*href="\/synthetic\/"/);
    expect(link).toContain('compact-entity-card__arrow');
    expect(link).not.toContain('aria-pressed');
    expect(link).not.toContain('compact-entity-card--wrap');
    const article = render(CompactEntityCard).body;
    expect(article).toContain('<article');
    expect(article).toContain('data-image-missing="true"');
    expect(article).toContain('data-image-fallback');
  });

  it('renders a native selectable button without navigation or submission semantics', () => {
    const button = render(CompactEntityCard, {
      props: { asButton: true, selected: true, disabled: true, wrapTitle: true, href: '/unused/' }
    }).body;
    expect(button).toMatch(/<button[^>]*type="button"[^>]*disabled[^>]*aria-pressed="true"/);
    expect(button).toContain('compact-entity-card--selected');
    expect(button).toContain('compact-entity-card--wrap');
    expect(button).not.toContain('href=');
    expect(button).not.toContain('compact-entity-card__arrow');
  });

  it('keeps recommendation links, rarity and path slots through the default shared card', () => {
    const body = render(EquipmentRecommendationSection, {
      props: {
        recommendation: {
          lightCones: [
            {
              id: 'synthetic',
              name: 'synthetic cone',
              rarity: 4,
              path: 'Warrior',
              pathName: 'synthetic path'
            }
          ],
          cavernSets: [],
          planarSets: [],
          mainStats: [],
          subStats: []
        }
      }
    }).body;
    expect(body).toMatch(/<a[^>]*href="\/light-cones\/synthetic\/"/);
    expect(body).toContain('synthetic cone');
    expect(body).toContain('synthetic path');
    expect(body).toContain('rarity-stars');
    expect(body).toContain('compact-entity-card__tertiary');
    expect(body).not.toContain('aria-pressed');
  });
});

describe('preset panel projection', () => {
  const units = [
    {
      id: 'unit',
      name: 'synthetic unit',
      kind: 'actor' as const,
      camp: 'ally' as const,
      position: 0,
      baseSpeed: 100,
      panelSpeed: 100
    }
  ];
  const props = {
    anchor: { kind: 'start' as const },
    participants: units,
    avatar: () => undefined,
    presets: { vonwacq: 'synthetic vonwacq', eagle: 'synthetic eagle', dance: 'synthetic dance' },
    selectedPreset: undefined,
    onSelect: vi.fn()
  };

  it.each(['zh-CN', 'en'] as const)(
    'renders two-level preset buttons and explicit %s copy',
    (locale) => {
      const body = render(PresetSection, { props: { ...props, locale } }).body;
      const expected = {
        vonwacq: '/generated-assets/relics/icons/308.png',
        eagle: '/generated-assets/relics/icons/110.png',
        dance: '/generated-assets/light-cones/preview/21018.png'
      };
      for (const [kind, src] of Object.entries(expected)) {
        const card = body.match(
          new RegExp(`<button[^>]*data-testid="preset-${kind}"[^>]*>[\\s\\S]*?</button>`)
        )?.[0];
        expect(card).toBeDefined();
        expect(card).toContain(`src="${src}"`);
        expect(card).toContain(`synthetic ${kind}`);
        expect(card).toContain(`synthetic-${kind}-${locale}`);
        expect(card).toContain('compact-entity-card__secondary');
        expect(card).not.toMatch(/disabled|rarity-stars|__tertiary|__arrow|href=/);
      }
      expect(body).not.toContain('preset-superimposition');
      expect(props.onSelect).not.toHaveBeenCalled();
    }
  );

  it('retains the start-node restriction and disables presets without targets', () => {
    const action = render(PresetSection, {
      props: { ...props, locale: 'en', anchor: { kind: 'action', participantId: 'unit', turn: 1 } }
    }).body;
    expect(action).toMatch(/<button[^>]*data-testid="preset-vonwacq"[^>]*disabled/);
    const empty = render(PresetSection, {
      props: { ...props, locale: 'en', participants: [] }
    }).body;
    for (const kind of ['vonwacq', 'eagle', 'dance'])
      expect(empty).toMatch(new RegExp(`<button[^>]*data-testid="preset-${kind}"[^>]*disabled`));
  });
});
