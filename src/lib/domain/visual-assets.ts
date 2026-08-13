export interface AssetAvailability {
  available: string[];
  missing: string[];
}

export interface VisualAssetManifest {
  schemaVersion: 2;
  sourceCommit?: string;
  generatedAt: string;
  characters: {
    avatars: AssetAvailability;
    portraits: AssetAvailability;
  };
  elements: AssetAvailability;
  paths: AssetAvailability;
}
