import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { readFileSync } from 'node:fs';
import TraceEntryContent from '../../src/lib/components/character/TraceEntryContent.svelte';
import EidolonCard from '../../src/lib/components/character/EidolonCard.svelte';
import { formatDescription, formatGameMarkup } from '../../scripts/data/text';
import { gameTextToPlain } from '../../src/lib/domain/game-text';
import type { Character, Trace, Eidolon } from '../../src/lib/domain/types';

const template = 'Literal 7: #1[i]; <u><i>#2[i]</i></u>; <color=#123456>#3[i]</color>\nline';
const params = [3, 4, 9];
const description = formatGameMarkup(template, params).text;
const descriptionTokens = formatDescription(template, params).descriptionTokens;
const effect = {
  id: 'synthetic-effect',
  name: 'Synthetic effect',
  description: formatGameMarkup('Effect #1[i]', [5]).text,
  descriptionTokens: formatDescription('Effect #1[i]', [5]).descriptionTokens
};
const trace: Trace = {
  id: 'synthetic-trace',
  name: 'Synthetic trace',
  description,
  descriptionTokens,
  type: 'ability',
  sourcePointType: 3,
  prerequisiteIds: [],
  anchorOrder: 1,
  extraEffects: [effect]
};
const eidolon: Eidolon = {
  id: 'synthetic-eidolon',
  rank: 1,
  name: 'Synthetic eidolon',
  description,
  descriptionTokens,
  extraEffects: [effect]
};

describe('character card parameter rendering', () => {
  for (const kind of ['trace', 'eidolon'] as const) {
    const renderCard = (accent?: string, legacy = false) => {
      const content = legacy
        ? {
            descriptionTokens: undefined,
            extraEffects: [{ ...effect, descriptionTokens: undefined }]
          }
        : {};
      return kind === 'trace'
        ? render(TraceEntryContent, {
            props: { trace: { ...trace, ...content }, characterAccent: accent }
          }).body
        : render(EidolonCard, {
            props: { eidolon: { ...eidolon, ...content }, characterAccent: accent }
          }).body;
    };
    it(`${kind} colors parameters and explanations while preserving literal text and markup`, () => {
      const html = renderCard('#abcdef');
      expect(html.match(/color: var\(--character-accent\)/g)).toHaveLength(3);
      expect(html).toMatch(/>Literal 7: <\/span>/);
      expect(html).toMatch(
        /<u[^>]*style="color: var\(--character-accent\);?"[^>]*><em>4<\/em><\/u>/
      );
      expect(html).toMatch(/style="color: #123456;?"[^>]*>9/);
      expect(html).toContain('\nline');
    });
    it(`${kind} retains no-accent and legacy-description fallbacks`, () => {
      expect(renderCard()).not.toContain('var(--character-accent)');
      const legacy = renderCard('#abcdef', true);
      expect(legacy).not.toContain('var(--character-accent)');
      expect(legacy).toContain('Literal 7: 3; ');
      expect(legacy).toMatch(/<u[^>]*><em>4<\/em><\/u>/);
    });
  }
});

it.each(['zh-CN', 'en'])(
  'retains parameter tokens in generated %s character descriptions',
  (locale) => {
    for (const id of ['1001', '1103', '1407']) {
      const character = JSON.parse(
        readFileSync(`src/lib/generated/views/${locale}/details/characters/${id}.json`, 'utf8')
      ) as Character;
      for (const profile of Object.values(character.profiles)) {
        if (!profile) continue;
        for (const entries of [profile.traces, profile.eidolons]) {
          expect(
            entries.some((entry) =>
              entry.descriptionTokens?.some((token) => token.type === 'fixed-param')
            )
          ).toBe(true);
          for (const entry of entries) {
            for (const description of [entry, ...(entry.extraEffects ?? [])]) {
              expect(description.descriptionTokens).toBeDefined();
              expect(
                description
                  .descriptionTokens!.map((token) => token.value)
                  .join('')
                  .trim()
              ).toBe(gameTextToPlain(description.description).trim());
            }
          }
        }
      }
    }
  }
);
