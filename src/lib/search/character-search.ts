import type { CatalogEntry } from '../domain/types.js';
import {
  isVisibleStaticCharacter,
  staticTrailblazerText,
  trailblazerGender,
  type TrailblazerGender
} from '../domain/trailblazer.js';

export function alternateTrailblazerSearchName(entry: CatalogEntry): string | undefined {
  const gender = trailblazerGender(entry.id);
  if (!gender) return;
  const alternate = staticTrailblazerText(entry, gender === 'male' ? 'female' : 'male').name;
  return alternate === entry.name ? undefined : alternate;
}

export function staticCharacterSearchEntry(
  entry: CatalogEntry,
  gender: TrailblazerGender,
  idQuery: string
): CatalogEntry[] {
  if (entry.id === idQuery) return [entry];
  return isVisibleStaticCharacter(entry.id, gender) ? [staticTrailblazerText(entry, gender)] : [];
}
