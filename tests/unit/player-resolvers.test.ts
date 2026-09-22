import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '../../src/lib/domain/types';
import {
  createCharacterCatalogIndex,
  playerCharacterHref,
  playerPageHref,
  readPlayerBuildQuery,
  readPlayerUidQuery,
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
      '/characters/1304/?uid=168902602'
    );
    expect(playerCharacterHref('1304', '168902602', undefined, 'en')).toBe(
      '/en/characters/1304/?uid=168902602'
    );
    expect(playerCharacterHref('1304', '168902602', 'area:assist:position:1:order:0', 'en')).toBe(
      '/en/characters/1304/?uid=168902602&build=area%3Aassist%3Aposition%3A1%3Aorder%3A0'
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
