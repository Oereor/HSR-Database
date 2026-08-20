import manifestJson from '$lib/generated-assets/manifest.json';
import type { AssetAvailability, VisualAssetManifest } from '$lib/domain/visual-assets';

const manifest = manifestJson as VisualAssetManifest;
const sets = {
  preview: new Set(manifest.characters.previews.available),
  portrait: new Set(manifest.characters.portraits.available),
  element: new Set(manifest.elements.available),
  path: new Set(manifest.paths.available)
};

function resolveAsset(
  value: string | undefined,
  availability: AssetAvailability,
  directory: string,
  extension: 'png' | 'webp',
  cache?: Set<string>
): string | undefined {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
  const available = cache ?? new Set(availability.available);
  return available.has(value)
    ? `/generated-assets/${directory}/${encodeURIComponent(value)}.${extension}`
    : undefined;
}

export function resolveCharacterPreviewAsset(
  characterId: string,
  source: VisualAssetManifest = manifest
): string | undefined {
  return resolveAsset(
    characterId,
    source.characters.previews,
    'characters/preview',
    'png',
    source === manifest ? sets.preview : undefined
  );
}

export function resolveCharacterPortraitAsset(
  characterId: string,
  source: VisualAssetManifest = manifest
): string | undefined {
  return resolveAsset(
    characterId,
    source.characters.portraits,
    'characters/portrait',
    'webp',
    source === manifest ? sets.portrait : undefined
  );
}

export function resolveElementIconAsset(
  element: string | undefined,
  source: VisualAssetManifest = manifest
): string | undefined {
  return resolveAsset(
    element,
    source.elements,
    'elements',
    'png',
    source === manifest ? sets.element : undefined
  );
}

export function resolvePathIconAsset(
  path: string | undefined,
  source: VisualAssetManifest = manifest
): string | undefined {
  return resolveAsset(
    path,
    source.paths,
    'paths',
    'png',
    source === manifest ? sets.path : undefined
  );
}

export const getCharacterPreviewUrl = (id: string): string | undefined =>
  resolveCharacterPreviewAsset(id);
export const getCharacterPortraitUrl = (id: string): string | undefined =>
  resolveCharacterPortraitAsset(id);
export const getElementIconUrl = (element: string | undefined): string | undefined =>
  resolveElementIconAsset(element);
export const getPathIconUrl = (path: string | undefined): string | undefined =>
  resolvePathIconAsset(path);
