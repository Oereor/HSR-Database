export interface AssetAvailability {
  available: string[];
  missing: string[];
}

export interface VisualAssetManifest {
  schemaVersion: 9;
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
}
