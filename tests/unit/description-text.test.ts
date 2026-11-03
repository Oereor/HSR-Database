import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import DescriptionText from '../../src/lib/components/shared/DescriptionText.svelte';
import { formatDescription } from '../../scripts/data/text';
import { descriptionCases, specialEffectTokens } from '../fixtures/description-text';

// Component SSR must retain the original token contents; CSS controls their line layout.
describe('DescriptionText SSR', () => {
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
