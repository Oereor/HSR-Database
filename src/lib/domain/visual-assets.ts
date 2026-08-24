export interface AssetAvailability {
  available: string[];
  missing: string[];
}

export interface VisualAssetManifest {
  schemaVersion: 4;
  sourceCommit?: string;
  generatedAt: string;
  characters: {
    previews: AssetAvailability;
    portraits: AssetAvailability;
  };
  lightCones: {
    previews: AssetAvailability;
  };
  elements: AssetAvailability;
  paths: AssetAvailability;
}
