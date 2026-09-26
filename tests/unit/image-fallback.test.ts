import { render } from 'svelte/server';
import { afterEach, describe, expect, it } from 'vitest';
import AssetImage from '../../src/lib/components/shared/AssetImage.svelte';
import DetailArtwork from '../../src/lib/components/shared/DetailArtwork.svelte';
import EntityOverviewCard from '../../src/lib/components/shared/EntityOverviewCard.svelte';
import RelicIcon from '../../src/lib/components/relic/RelicIcon.svelte';
import SemanticIconLabel from '../../src/lib/components/shared/SemanticIconLabel.svelte';
import InlineGameTextToken from '../../src/lib/components/shared/InlineGameTextToken.svelte';
import { getLocale, overwriteGetLocale } from '../../src/lib/paraglide/runtime.js';

const originalLocale = getLocale;
afterEach(() => overwriteGetLocale(originalLocale));

describe('shared image rendering', () => {
  it('preserves the URL, alt and native image attributes without a wrapper', () => {
    const { body } = render(AssetImage, {
      props: { src: '/synthetic.png', alt: 'Synthetic entity', width: 48, loading: 'lazy' }
    });
    expect(body).toContain('src="/synthetic.png"');
    expect(body).toContain('alt="Synthetic entity"');
    expect(body).toContain('width="48"');
    expect(body).toContain('loading="lazy"');
    expect(body).not.toMatch(/<(?:div|span)\b/);
  });

  it.each([undefined, null, '', ' \t\n'])('does not request an absent source: %s', (src) => {
    const { body } = render(AssetImage, { props: { src, alt: 'Synthetic entity' } });
    expect(body).not.toContain('<img');
    expect(body).toMatch(/data-image-fallback[^>]*>\?<\/span>/);
    expect(body).toContain('role="img"');
    expect(body).toContain('aria-label="Synthetic entity"');
  });

  it('silently omits decorative images and hides redundant image semantics', () => {
    expect(render(AssetImage, { props: { decorative: true } }).body).not.toMatch(/<(img|span)/);
    const hidden = render(AssetImage, { props: { alt: '' } }).body;
    expect(hidden).toContain('aria-hidden="true"');
    expect(hidden).not.toContain('role="img"');
    for (const ariaHidden of [false, 'false'] as const) {
      expect(
        render(AssetImage, {
          props: { alt: 'Synthetic entity', 'aria-hidden': ariaHidden }
        }).body
      ).toContain('aria-label="Synthetic entity"');
    }
    for (const ariaHidden of [true, 'true'] as const) {
      expect(
        render(AssetImage, {
          props: { alt: 'Synthetic entity', 'aria-hidden': ariaHidden }
        }).body
      ).not.toContain('aria-label=');
    }
  });

  it.each(['zh-CN', 'en'] as const)('uses the same placeholder in %s', (locale) => {
    overwriteGetLocale(() => locale);
    expect(render(AssetImage).body).toMatch(/data-image-fallback[^>]*>\?<\/span>/);
  });
});

describe('migrated image slots', () => {
  it('keeps overview metadata and replaces whitespace sources during SSR', () => {
    const { body } = render(EntityOverviewCard, {
      props: { href: '/synthetic/', imageUrl: ' ', imageAlt: 'Synthetic entity' }
    });
    expect(body).toContain('href="/synthetic/"');
    expect(body).toContain('data-image-missing="true"');
    expect(body).toContain('entity-overview-card__content');
    expect(body).toContain('data-image-fallback');
    expect(body).not.toContain('<img');
  });

  it('keeps missing detail artwork and relic media slots visible', () => {
    const detail = render(DetailArtwork, {
      props: { source: undefined, width: 376, height: 512, fit: 'contain', alt: 'Synthetic enemy' }
    }).body;
    const relic = render(RelicIcon, {
      props: { source: undefined, alt: 'Synthetic piece', presentation: 'piece' }
    }).body;
    expect(detail).toContain('data-artwork-available="false"');
    expect(detail).toContain('data-image-fallback');
    expect(relic).toContain('data-relic-icon-presentation="piece"');
    expect(relic).toContain('aria-label="Synthetic piece"');
    expect(relic).toContain('data-image-fallback');
  });

  it('distinguishes icon-only meaning from supporting labelled icons', () => {
    const props = { kind: 'element' as const, code: undefined, label: 'Synthetic element' };
    const supporting = render(SemanticIconLabel, { props }).body;
    const identity = render(SemanticIconLabel, { props: { ...props, showLabel: false } }).body;
    expect(supporting).not.toContain('data-image-fallback');
    expect(supporting).toContain('Synthetic element');
    expect(identity).toContain('aria-label="Synthetic element"');
    expect(identity).toContain('data-icon-missing="true"');
    expect(identity).toContain('data-image-fallback');
  });

  it('uses the shared placeholder for unresolved inline content images', () => {
    const body = render(InlineGameTextToken, {
      props: { token: { value: '', icon: { spriteName: 'SyntheticSprite', id: 0 } } }
    }).body;
    expect(body).toContain('data-game-icon="SyntheticSprite"');
    expect(body).toContain('data-image-fallback');
    expect(body).not.toContain('✦');
  });
});
