export const PRODUCT_BASELINE_FIXTURE_FORMAT_VERSION = 2 as const;

export interface ProductBaselineMetadata {
  fixtureFormatVersion: typeof PRODUCT_BASELINE_FIXTURE_FORMAT_VERSION;
  locale: 'zh-CN';
  approvalReason?: string;
}

export interface StableEntityArea {
  order: string[];
  entities: Record<string, unknown>;
}

export interface ProductBaselineCapture {
  metadata: ProductBaselineMetadata;
  characters: StableEntityArea;
  lightCones: StableEntityArea;
  relics: StableEntityArea & { properties: unknown };
  enemies: StableEntityArea;
  endgame: {
    modes: Record<
      string,
      { order: string[]; groups: Record<string, unknown>; recommendations: unknown }
    >;
  };
  homepage: unknown;
  search: unknown;
  unresolvedLocalization: unknown;
}

export interface ProductBaselineDifference {
  domain: string;
  entityId: string;
  path: string;
  expected: unknown;
  actual: unknown;
}
