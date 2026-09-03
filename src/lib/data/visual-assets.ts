import manifestJson from '$lib/generated-assets/manifest.json';
import type {
  AssetAvailability,
  BrandIconKey,
  UtilityIconKey,
  VisualAssetManifest
} from '$lib/domain/visual-assets';
import type { EndgameModeIconKey } from '$lib/domain/endgame-view';
import type { NavigationIconKey } from '$lib/navigation';

const manifest = manifestJson as VisualAssetManifest;
const sets = {
  preview: new Set(manifest.characters.previews.available),
  portrait: new Set(manifest.characters.portraits.available),
  lightConePreview: new Set(manifest.lightCones.previews.available),
  lightConePortrait: new Set(manifest.lightCones.portraits.available),
  relicIcon: new Set(manifest.relics.icons.available),
  relicPiece: new Set(manifest.relics.pieces.available),
  relicPropertyIcon: new Set(manifest.relicProperties.icons.available),
  element: new Set(manifest.elements.available),
  path: new Set(manifest.paths.available),
  navigation: new Set(manifest.navigation.icons.available),
  branding: new Set(manifest.branding.icons.available),
  utility: new Set(manifest.utility.icons.available),
  endgameModeIcon: new Set(manifest.endgame.modeIcons.available)
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

export function resolveLightConePreviewAsset(
  lightConeId: string,
  source: VisualAssetManifest = manifest
): string | undefined {
  return resolveAsset(
    lightConeId,
    source.lightCones.previews,
    'light-cones/preview',
    'png',
    source === manifest ? sets.lightConePreview : undefined
  );
}

export function resolveLightConePortraitAsset(
  lightConeId: string,
  source: VisualAssetManifest = manifest
): string | undefined {
  return resolveAsset(
    lightConeId,
    source.lightCones.portraits,
    'light-cones/portrait',
    'webp',
    source === manifest ? sets.lightConePortrait : undefined
  );
}

export function resolveRelicSetIconAsset(
  relicSetId: string,
  source: VisualAssetManifest = manifest
): string | undefined {
  return resolveAsset(
    relicSetId,
    source.relics.icons,
    'relics/icons',
    'png',
    source === manifest ? sets.relicIcon : undefined
  );
}

export function resolveRelicPieceIconAsset(
  relicPieceId: string | undefined,
  source: VisualAssetManifest = manifest
): string | undefined {
  return resolveAsset(
    relicPieceId,
    source.relics.pieces,
    'relics/pieces',
    'png',
    source === manifest ? sets.relicPiece : undefined
  );
}

export function resolveRelicPropertyIconAsset(
  iconKey: string | undefined,
  source: VisualAssetManifest = manifest
): string | undefined {
  return resolveAsset(
    iconKey,
    source.relicProperties.icons,
    'relic-properties',
    'png',
    source === manifest ? sets.relicPropertyIcon : undefined
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

export function resolveNavigationIconAsset(
  iconKey: NavigationIconKey,
  source: VisualAssetManifest = manifest
): string | undefined {
  return resolveAsset(
    iconKey,
    source.navigation.icons,
    'navigation',
    'png',
    source === manifest ? sets.navigation : undefined
  );
}

export function resolveBrandIconAsset(
  iconKey: BrandIconKey,
  source: VisualAssetManifest = manifest
): string | undefined {
  return resolveAsset(
    iconKey,
    source.branding.icons,
    'branding',
    'png',
    source === manifest ? sets.branding : undefined
  );
}

export function resolveUtilityIconAsset(
  iconKey: UtilityIconKey,
  source: VisualAssetManifest = manifest
): string | undefined {
  return resolveAsset(
    iconKey,
    source.utility.icons,
    'utility',
    'png',
    source === manifest ? sets.utility : undefined
  );
}

export function resolveEndgameModeIconAsset(
  iconKey: EndgameModeIconKey,
  source: VisualAssetManifest = manifest
): string | undefined {
  return resolveAsset(
    iconKey,
    source.endgame.modeIcons,
    'endgame/modes',
    'png',
    source === manifest ? sets.endgameModeIcon : undefined
  );
}

export const getCharacterPreviewUrl = (id: string): string | undefined =>
  resolveCharacterPreviewAsset(id);
export const getCharacterPortraitUrl = (id: string): string | undefined =>
  resolveCharacterPortraitAsset(id);
export const getLightConePreviewUrl = (id: string): string | undefined =>
  resolveLightConePreviewAsset(id);
export const getLightConePortraitUrl = (id: string): string | undefined =>
  resolveLightConePortraitAsset(id);
export const getRelicSetIconUrl = (id: string): string | undefined => resolveRelicSetIconAsset(id);
export const getRelicPieceIconUrl = (id: string | undefined): string | undefined =>
  resolveRelicPieceIconAsset(id);
export const getRelicPropertyIconUrl = (iconKey: string | undefined): string | undefined =>
  resolveRelicPropertyIconAsset(iconKey);
export const getElementIconUrl = (element: string | undefined): string | undefined =>
  resolveElementIconAsset(element);
export const getPathIconUrl = (path: string | undefined): string | undefined =>
  resolvePathIconAsset(path);
export const getNavigationIconUrl = (iconKey: NavigationIconKey): string | undefined =>
  resolveNavigationIconAsset(iconKey);
export const getBrandIconUrl = (iconKey: BrandIconKey): string | undefined =>
  resolveBrandIconAsset(iconKey);
export const getUtilityIconUrl = (iconKey: UtilityIconKey): string | undefined =>
  resolveUtilityIconAsset(iconKey);
export const getEndgameModeIconUrl = (iconKey: EndgameModeIconKey): string | undefined =>
  resolveEndgameModeIconAsset(iconKey);
