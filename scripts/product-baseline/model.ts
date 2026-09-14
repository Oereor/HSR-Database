export const PRODUCT_BASELINE_FIXTURE_FORMAT_VERSION = 3 as const;

export interface ProductBaselineMetadata {
  fixtureFormatVersion: typeof PRODUCT_BASELINE_FIXTURE_FORMAT_VERSION;
  locale: 'zh-CN';
  approvalReason?: string;
}

export interface ProductBaselineCapture {
  metadata: ProductBaselineMetadata;
  characters: Record<string, unknown>;
  lightCones: Record<string, unknown>;
  relics: Record<string, unknown>;
  enemies: Record<string, unknown>;
  endgame: {
    modes: Record<string, Record<string, unknown>>;
    boundaries: unknown[];
  };
  homepage: unknown;
  search: unknown;
}

export interface ProductBaselineDifference {
  domain: string;
  entityId: string;
  path: string;
  expected: unknown;
  actual: unknown;
}
