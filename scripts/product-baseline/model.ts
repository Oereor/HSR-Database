export const PRODUCT_BASELINE_FIXTURE_FORMAT_VERSION = 2 as const;

export interface ProductBaselineMetadata {
  fixtureFormatVersion: typeof PRODUCT_BASELINE_FIXTURE_FORMAT_VERSION;
  locale: 'zh-CN';
  sourceCommit: string;
  sourceVersion: string;
  assetCommit: string;
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
  enemies: StableEntityArea & {
    registries: Record<
      'templates' | 'monsters' | 'skills' | 'summons' | 'statSeries',
      Record<string, unknown>
    >;
  };
  endgame: {
    modes: Record<
      string,
      { order: string[]; groups: Record<string, unknown>; recommendations: unknown }
    >;
    registries: Record<
      'occurrences' | 'mechanics' | 'presentedOccurrences',
      Record<string, unknown>
    >;
  };
  homepage: unknown;
  search: unknown;
  unresolvedLocalization: unknown;
  characterIcons: unknown;
}

export interface ProductBaselineDifference {
  domain: string;
  entityId: string;
  path: string;
  expected: unknown;
  actual: unknown;
}
