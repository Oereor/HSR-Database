import type { DescriptionToken } from '../../src/lib/domain/types';

export const descriptionCases: Array<{
  id: string;
  text: string;
  tokens: DescriptionToken[];
  linesBetween: number;
}> = [
  {
    id: 'single',
    text: 'First\nSecond',
    tokens: [{ type: 'text', value: 'First\nSecond' }],
    linesBetween: 1
  },
  {
    id: 'blank',
    text: 'First\n\nSecond',
    tokens: [{ type: 'text', value: 'First\n\nSecond' }],
    linesBetween: 2
  },
  {
    id: 'cross-token',
    text: 'First\n\n<color=#123456>Second</color>',
    tokens: [
      { type: 'text', value: 'First\n' },
      { type: 'text', value: '\nSecond', color: '#123456' }
    ],
    linesBetween: 2
  },
  {
    id: 'rich',
    text: 'First\n<color=#123456><i><u>Second</u></i></color> <unbreak>50%</unbreak>',
    tokens: [
      { type: 'text', value: 'First\n' },
      { type: 'text', value: 'Second', color: '#123456', italic: true, underline: true },
      { type: 'text', value: ' ' },
      { type: 'scaling-value', value: '50%', unbreak: true }
    ],
    linesBetween: 1
  }
];

export const specialEffectTokens: DescriptionToken[] = [
  { type: 'text', value: 'Before\n' },
  {
    type: 'icon',
    value: '',
    icon: { spriteName: 'synthetic', id: 1 },
    semanticReference: 'character-special-effects:fixture'
  },
  {
    type: 'text',
    value: 'Effect',
    underline: true,
    semanticReference: 'character-special-effects:fixture'
  },
  { type: 'text', value: '\nAfter' }
];
