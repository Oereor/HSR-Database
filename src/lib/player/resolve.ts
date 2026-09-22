import { getPlayerAvatarUrl } from '$lib/data/visual-assets';
import type { CatalogEntry } from '$lib/domain/types';
import { localizedHref } from '$lib/i18n/routing';
import type { Locale } from '$lib/paraglide/runtime.js';
import { normalizePlayerUid } from './client.js';

export type PlayerUidQueryState =
  | { kind: 'idle'; input: '' }
  | { kind: 'invalid'; input: string }
  | { kind: 'valid'; input: string; uid: string };

export type PlayerBuildQueryState =
  { kind: 'absent' } | { kind: 'invalid' } | { kind: 'valid'; buildId: string };

export function readPlayerUidQuery(searchParams: URLSearchParams): PlayerUidQueryState {
  const values = searchParams.getAll('uid');
  if (values.length === 0) return { kind: 'idle', input: '' };
  const input = values[0];
  if (values.length !== 1) return { kind: 'invalid', input };
  const uid = normalizePlayerUid(input);
  return uid ? { kind: 'valid', input, uid } : { kind: 'invalid', input };
}

export function readPlayerBuildQuery(searchParams: URLSearchParams): PlayerBuildQueryState {
  const values = searchParams.getAll('build');
  if (values.length === 0) return { kind: 'absent' };
  if (values.length !== 1 || values[0] === '') return { kind: 'invalid' };
  return { kind: 'valid', buildId: values[0] };
}

export function resolvePlayerAvatar(avatarId: string | null | undefined): string | null {
  return avatarId ? (getPlayerAvatarUrl(avatarId) ?? null) : null;
}

export function createCharacterCatalogIndex(
  entries: CatalogEntry[]
): ReadonlyMap<string, CatalogEntry> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

export function resolvePlayerCharacter(
  characterId: string,
  catalog: ReadonlyMap<string, CatalogEntry>
): CatalogEntry | null {
  return catalog.get(characterId) ?? null;
}

export function playerPageHref(uid: string, locale?: Locale): string {
  const href = `/player/?${new URLSearchParams({ uid })}`;
  return locale ? localizedHref(href, locale) : localizedHref(href);
}

export function playerCharacterHref(
  characterId: string,
  uid: string,
  buildId?: string,
  locale?: Locale
): string {
  const params = new URLSearchParams({ uid });
  if (buildId) params.set('build', buildId);
  const href = `/characters/${encodeURIComponent(characterId)}/?${params}`;
  return locale ? localizedHref(href, locale) : localizedHref(href);
}
