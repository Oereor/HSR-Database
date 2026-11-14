import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import DescriptionText from '../../src/lib/components/shared/DescriptionText.svelte';
import { formatDescription, formatGameMarkup } from '../../scripts/data/text';
import { descriptionCases, specialEffectTokens } from '../fixtures/description-text';

// Component SSR must retain the original token contents; CSS controls their line layout.
describe('DescriptionText SSR', () => {
  it('retains fixed parameter identity without coloring ordinary numbers or leaking markup', () => {
    const source = 'Literal 7: <u><i>#1[i]</i></u> / #2[i]% / <color=#123456>#3[i]</color>';
    const result = formatDescription(source, [3, 0.5, 9], new Set([1]));
    expect(
      result.descriptionTokens.filter((t) => t.type === 'fixed-param').map((t) => t.value)
    ).toEqual(['3', '9']);
    expect(result.descriptionTokens.find((t) => t.type === 'scaling-value')?.value).toBe('50%');
    expect(result.descriptionTokens[0]).toEqual({ type: 'text', value: 'Literal 7: ' });
    const colored = render(DescriptionText, {
      props: { tokens: result.descriptionTokens, characterAccent: '#abcdef' }
    }).body;
    expect(colored).toContain('var(--character-accent)');
    expect(colored).toMatch(/style="color: #123456;?"[^>]*>9/);
    const generic = render(DescriptionText, { props: { tokens: result.descriptionTokens } }).body;
    expect(generic).not.toContain('var(--character-accent)');
    expect(formatGameMarkup(source, [3, 0.5, 9]).text).not.toContain('fixed-param');
    expect(result.description).not.toContain('fixed-param');
  });
  it.each(descriptionCases)(
    'preserves $id newlines and uses the existing GameText wrapper',
    ({ tokens }) => {
      const { body } = render(DescriptionText, { props: { tokens } });
      expect(body).toContain('<span class="game-text">');
      for (const token of tokens) expect(body).toContain(token.value);
      expect((body.match(/\n/g) ?? []).length).toBe(
        tokens
          .map((token) => token.value)
          .join('')
          .split('\n').length - 1
      );
    }
  );

  it('keeps rich markup, scaling, unbreak and safe text escaping', () => {
    const tokens = [...descriptionCases[3].tokens, { type: 'text' as const, value: '<unsafe>&' }];
    const { body } = render(DescriptionText, { props: { tokens } });
    expect(body).toMatch(/<u[^>]*data-game-color="#123456"[^>]*><em>Second<\/em><\/u>/);
    expect(body).toMatch(/<span[^>]*description-token--unbreak[^>]*scaling-value[^>]*>50%<\/span>/);
    expect(body).toContain('&lt;unsafe>&amp;');
  });

  it('renders a single Ruby annotation over a base with mixed token styles', () => {
    const { descriptionTokens } = formatDescription(
      '{RUBY_B#Rank & tier}<i>Rank</i> #1[i]{RUBY_E#}',
      [3],
      new Set([0])
    );
    const { body } = render(DescriptionText, { props: { tokens: descriptionTokens } });
    expect(body.match(/<ruby\b/g)).toHaveLength(1);
    expect(body).toMatch(
      /<ruby\b[\s\S]*<em>Rank<\/em>[\s\S]*scaling-value[^>]*>3<\/span>[\s\S]*<rt[^>]*>Rank &amp; tier<\/rt>[\s\S]*<\/ruby>/
    );
  });

  it('retains the special effect button and surrounding line breaks', () => {
    const { body } = render(DescriptionText, {
      props: {
        tokens: specialEffectTokens,
        specialEffectsAvailable: true,
        onOpenSpecialEffects: () => {}
      }
    });
    expect(body.match(/<button[ >]/g)).toHaveLength(1);
    expect(body).toContain('special-effect-trigger');
    expect(body).toContain('Before\n');
    expect(body).toContain('\nAfter');
  });

  it('keeps internal blank lines through normalization, formatting and styled token boundaries', () => {
    const formatted = formatDescription(
      'First\\n<color=#abcdef>\\nSecond</color> #1[i]%',
      [0.5],
      new Set([0])
    );
    expect(formatted.description).toBe('First\n\nSecond 50%');
    expect(formatted.descriptionTokens.map((token) => token.value).join('')).toBe(
      formatted.description
    );
    expect(formatted.diagnostics).toEqual([]);
  });
});
