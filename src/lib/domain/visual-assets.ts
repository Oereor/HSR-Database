export interface AssetAvailability {
  available: string[];
  missing: string[];
}

export interface VisualAssetManifest {
  schemaVersion: 5;
  sourceCommit?: string;
  generatedAt: string;
  characters: {
    previews: AssetAvailability;
    portraits: AssetAvailability;
  };
  lightCones: {
    previews: AssetAvailability;
  };
  relics: {
    icons: AssetAvailability;
  };
  relicProperties: {
    icons: AssetAvailability;
  };
  elements: AssetAvailability;
  paths: AssetAvailability;
}
