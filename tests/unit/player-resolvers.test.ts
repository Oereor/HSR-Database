import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '../../src/lib/domain/types';
import {
  createCharacterCatalogIndex,
  playerCharacterHref,
  playerPageHref,
  readPlayerBuildQuery,
  readPlayerUidQuery,
  resolveDetailBackTarget,
  resolvePlayerAvatar,
  resolvePlayerCharacter
} from '../../src/lib/player/resolve';

describe('Player local resolvers and routing', () => {
  it('resolves known local avatars and gracefully handles null or unknown ids', () => {
    expect(resolvePlayerAvatar('201001')).toBe('/generated-assets/player-avatars/201001.png');
    expect(resolvePlayerAvatar('999999')).toBeNull();
    expect(resolvePlayerAvatar(null)).toBeNull();
  });

  it('resolves catalog identities without changing Player character order', () => {
    const entries: CatalogEntry[] = [
      { id: '1001', name: '三月七' },
      { id: '8007', name: '开拓者' }
    ];
    const index = createCharacterCatalogIndex(entries);
    expect(
      ['8007', '9999', '1001'].map((id) => resolvePlayerCharacter(id, index)?.id ?? null)
    ).toEqual(['8007', null, '1001']);
  });

  it('builds locale-aware canonical Player and Character links', () => {
    expect(playerPageHref('168902602', 'zh-CN')).toBe('/player/?uid=168902602');
    expect(playerPageHref('168902602', 'en')).toBe('/en/player/?uid=168902602');
    expect(playerCharacterHref('1304', '168902602', undefined, 'zh-CN')).toBe(
      '/characters/1304/?uid=168902602&from=player'
    );
    expect(playerCharacterHref('1304', '168902602', undefined, 'en')).toBe(
      '/en/characters/1304/?uid=168902602&from=player'
    );
    expect(playerCharacterHref('1304', '168902602', 'area:assist:position:1:order:0', 'en')).toBe(
      '/en/characters/1304/?uid=168902602&build=area%3Aassist%3Aposition%3A1%3Aorder%3A0&from=player'
    );
  });

  it('distinguishes missing, valid, invalid and duplicate UID query states', () => {
    expect(readPlayerUidQuery(new URLSearchParams())).toEqual({ kind: 'idle', input: '' });
    expect(readPlayerUidQuery(new URLSearchParams('uid=%20123%20'))).toEqual({
      kind: 'valid',
      input: ' 123 ',
      uid: '123'
    });
    expect(readPlayerUidQuery(new URLSearchParams('uid=abc'))).toEqual({
      kind: 'invalid',
      input: 'abc'
    });
    expect(readPlayerUidQuery(new URLSearchParams('uid=1&uid=2'))).toEqual({
      kind: 'invalid',
      input: '1'
    });
  });

  it('distinguishes absent, valid and invalid build query states', () => {
    expect(readPlayerBuildQuery(new URLSearchParams())).toEqual({ kind: 'absent' });
    expect(readPlayerBuildQuery(new URLSearchParams('build=area%3Aassist%3Aorder%3A0'))).toEqual({
      kind: 'valid',
      buildId: 'area:assist:order:0'
    });
    expect(readPlayerBuildQuery(new URLSearchParams('build='))).toEqual({ kind: 'invalid' });
    expect(readPlayerBuildQuery(new URLSearchParams('build=a&build=b'))).toEqual({
      kind: 'invalid'
    });
  });
});

describe.each(['zh-CN', 'en'] as const)('Detail back targets in %s', (locale) => {
  const prefix = locale === 'en' ? '/en' : '';

  it.each(['100000001', '100000002'])('returns to the explicit Player source %s', (uid) => {
    const href = playerCharacterHref('1304', uid, 'area:showcase:position:1:order:0', locale);
    const params = new URL(href, 'https://example.test').searchParams;
    const before = params.toString();
    expect(resolveDetailBackTarget('characters', params, locale)).toEqual({
      kind: 'player',
      href: `${prefix}/player/?uid=${uid}`
    });
    expect(params.get('uid')).toBe(uid);
    expect(readPlayerBuildQuery(params)).toEqual({
      kind: 'valid',
      buildId: 'area:showcase:position:1:order:0'
    });
    expect(params.toString()).toBe(before);
  });

  it.each([
    '',
    'uid=100000001',
    'uid=100000001&build=example',
    'from=player',
    'from=player&uid=',
    'from=player&uid=abc',
    'from=player&uid=1&uid=2',
    'from=player&uid=1&uid=1',
    'from=player&from=player&uid=1',
    'from=player&from=characters&uid=1',
    'from=characters&uid=1',
    'from=&uid=1',
    'from=PLAYER&uid=1',
    'from=https%3A%2F%2Fevil.example%2F&uid=1',
    'from=%2F%2Fevil.example%2F&uid=1',
    'from=player&uid=https%3A%2F%2Fevil.example%2F'
  ])('falls back to the character list for %s', (query) => {
    expect(resolveDetailBackTarget('characters', new URLSearchParams(query), locale)).toEqual({
      kind: 'list',
      href: `${prefix}/characters/`
    });
  });

  it.each(['', 'level=70&rank=2', 'from=player&uid=100000001&level=70&rank=2'])(
    'keeps Light Cones on their own list for %s',
    (query) => {
      expect(resolveDetailBackTarget('light-cones', new URLSearchParams(query), locale)).toEqual({
        kind: 'list',
        href: `${prefix}/light-cones/`
      });
    }
  );

  it('normalizes the UID using the existing query reader', () => {
    expect(
      resolveDetailBackTarget(
        'characters',
        new URLSearchParams('from=player&uid=%20123%20'),
        locale
      )
    ).toEqual({ kind: 'player', href: `${prefix}/player/?uid=123` });
  });
});
