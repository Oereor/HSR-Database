export interface AssetAvailability {
  available: string[];
  missing: string[];
}

export const BRAND_ICON_KEYS = ['train-party'] as const;
export type BrandIconKey = (typeof BRAND_ICON_KEYS)[number];

export interface VisualAssetManifest {
  schemaVersion: 11;
  sourceCommit?: string;
  generatedAt: string;
  characters: {
    previews: AssetAvailability;
    portraits: AssetAvailability;
  };
  lightCones: {
    previews: AssetAvailability;
    portraits: AssetAvailability;
  };
  relics: {
    icons: AssetAvailability;
    pieces: AssetAvailability;
  };
  relicProperties: {
    icons: AssetAvailability;
  };
  elements: AssetAvailability;
  paths: AssetAvailability;
  navigation: {
    icons: AssetAvailability;
  };
  branding: {
    icons: AssetAvailability;
  };
  endgame: {
    modeIcons: AssetAvailability;
  };
}
