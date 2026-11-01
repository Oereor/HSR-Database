import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
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
