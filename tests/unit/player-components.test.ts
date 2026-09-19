import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import PlayerHero from '../../src/lib/components/player/PlayerHero.svelte';
import PlayerUidForm from '../../src/lib/components/player/PlayerUidForm.svelte';
import UnknownPlayerCharacterCard from '../../src/lib/components/player/UnknownPlayerCharacterCard.svelte';
import type { PlayerProfile } from '../../src/lib/player/contract';

const profile: PlayerProfile = {
  uid: '100000001',
  nickname: 'Synthetic Player',
  level: 70,
  worldLevel: 6,
  avatar: null,
  signature: 'Line one\nLine two',
  characterCount: null,
  lightConeCount: 0,
  achievementCount: null,
  characters: []
};

describe('Player presentation components', () => {
  it('renders all Hero metadata and distinguishes null counts from zero', () => {
    const body = render(PlayerHero, { props: { profile, avatarUrl: null } }).body;
    expect(body).toContain('Synthetic Player');
    expect(body).toContain('Line one\nLine two');
    expect(body).toContain('100000001');
    expect(body).toMatch(/player-hero__avatar[\s\S]*role="img"[^>]*aria-label="[^"]+"/);
    const values = [...body.matchAll(/<dd[^>]*>([\s\S]*?)<\/dd>/g)].map((match) =>
      match[1].replaceAll(/<!--[\s\S]*?-->/g, '')
    );
    expect(values.filter((value) => value === '-')).toHaveLength(2);
    expect(values).toContain('0');
  });

  it('links an accessible validation error and disables submission while busy', () => {
    const body = render(PlayerUidForm, {
      props: { value: 'abc', busy: true, errorMessage: 'synthetic validation error' }
    }).body;
    expect(body).toContain('inputmode="numeric"');
    expect(body).toContain('aria-describedby="player-uid-error"');
    expect(body).toContain('aria-invalid="true"');
    expect(body).toMatch(/<button[^>]*disabled/);
  });

  it('renders unknown characters as non-linking cards with their upstream id', () => {
    const body = render(UnknownPlayerCharacterCard, { props: { characterId: '1999' } }).body;
    expect(body).toMatch(/class="unknown-character(?:\s|")/);
    expect(body).toMatch(/<h3[^>]*>[^<]+<\/h3>/);
    expect(body).toContain('1999');
    expect(body).not.toContain('<a ');
  });
});
