import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import EndgameSeasonCard from '../../src/lib/components/endgame/EndgameSeasonCard.svelte';
import EndgameOverviewCard from '../../src/lib/components/endgame/EndgameOverviewCard.svelte';
import { ENDGAME_MODES } from '../../src/lib/domain/endgame-view';

vi.mock('../../src/lib/data/visual-assets', () => ({ getEndgameModeIconUrl: () => undefined }));

const name = 'SyntheticLongName'.repeat(20);

describe('Endgame overview cards', () => {
  it.each(ENDGAME_MODES)('preserves %s metadata and links without an icon', (mode) => {
    const { body } = render(EndgameOverviewCard, {
      props: {
        mode: {
          mode,
          label: 'Synthetic mode',
          description: '',
          recommendedGroupId: 42,
          periods: [
            {
              groupId: 42,
              name,
              dateLabel: 'Synthetic date',
              encounterCount: 12,
              status: 'unknown'
            }
          ]
        },
        featured: mode === 'aa'
      }
    });
    expect(body).toContain(name);
    expect(body).toContain('Synthetic date');
    expect(body).toContain(`href="/endgame/${mode}/42/"`);
    expect(body.match(/<a[ >]/g)).toHaveLength(1);
    expect(body.match(/data-slot="card"/g)).toHaveLength(1);
    expect(body).not.toContain('<button');
    expect(body).not.toContain('endgame-mode-icon');
  });
  it('keeps an empty mode linked to its archive', () => {
    const { body } = render(EndgameOverviewCard, {
      props: {
        mode: {
          mode: 'moc',
          label: 'Synthetic mode',
          description: '',
          periods: []
        }
      }
    });
    expect(body).toContain('href="/endgame/moc/"');
    expect(body).not.toContain('undefined');
  });
});

describe('Endgame season cards', () => {
  it.each(['current', 'upcoming', 'unknown', 'historical'] as const)(
    'preserves %s information and a single link',
    (variant) => {
      const { body } = render(EndgameSeasonCard, {
        props: {
          mode: 'aa',
          variant,
          period: {
            groupId: 42,
            name,
            dateLabel: 'Synthetic date',
            encounterCount: 12,
            status: variant
          }
        }
      });
      expect(body).toContain(name);
      expect(body).toContain('Synthetic date');
      expect(body).toContain('href="/endgame/aa/42/"');
      expect(body).toContain(`data-endgame-season-card="${variant}"`);
      expect(body.match(/<a[ >]/g)).toHaveLength(1);
      expect(body.match(/data-slot="card"/g)).toHaveLength(1);
      expect(body.match(/data-slot="separator"/g)).toHaveLength(1);
      expect(body.includes('endgame-season-card__watermark')).toBe(variant === 'current');
      expect(body).not.toContain('<button');
      expect(body).not.toContain('undefined');
    }
  );
});
