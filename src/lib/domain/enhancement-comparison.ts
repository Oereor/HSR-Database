import type { CharacterDetailIconKey } from './character-detail-icons.js';
import type { DescriptionToken, SkillCategory, TextHash, TraceType } from './types.js';

export const ENHANCEMENT_COMPARISON_SCHEMA = 2;
export const ENHANCEMENT_COMPARISON_ROUTE_ID = '/characters/[id]/enhancement-comparison';
export const COMPARISON_CATEGORIES = ['skills', 'traces', 'eidolons'] as const;
export type ComparisonCategory = (typeof COMPARISON_CATEGORIES)[number];
export type ComparisonFilter = 'all' | ComparisonCategory;

export type AvailableComparisonText = { kind: 'available'; tokens: DescriptionToken[] };
export type ComparisonText = AvailableComparisonText | { kind: 'unavailable' };

export interface ComparisonSkillLevel {
  level: number;
  before: AvailableComparisonText;
  after: AvailableComparisonText;
}

export interface ComparisonSide {
  id: string;
  name: DescriptionToken[];
  description: ComparisonText;
}

export type ComparisonItemKind =
  | {
      category: 'skills';
      skillCategory: SkillCategory;
      level: number | null;
      additionalLevels: ComparisonSkillLevel[];
    }
  | { category: 'traces'; traceType: TraceType }
  | { category: 'eidolons'; rank: number };

export interface OfficialComparisonSource {
  kind: 'official';
  declarationId: string;
  pointId?: string;
  hashes: Record<string, TextHash>;
}

export type ComparisonItem = ComparisonItemKind & {
  key: string;
  label: string;
  iconKey?: CharacterDetailIconKey;
} & (
    | {
        status: 'modified';
        source: OfficialComparisonSource;
        before: ComparisonSide;
        after: ComparisonSide;
        comments: DescriptionToken[][];
      }
    | {
        status: 'modified';
        source: { kind: 'profile' };
        before: ComparisonSide;
        after: ComparisonSide;
      }
    | { status: 'added'; source: { kind: 'structure' }; before: null; after: ComparisonSide }
    | { status: 'removed'; source: { kind: 'structure' }; before: ComparisonSide; after: null }
  );

export interface EnhancementComparison {
  schemaVersion: typeof ENHANCEMENT_COMPARISON_SCHEMA;
  locale: 'zh-CN' | 'en';
  avatarId: string;
  enhancedId: string;
  name: DescriptionToken[];
  seasonId?: string;
  summary: DescriptionToken[][];
  items: ComparisonItem[];
}

export const enhancementComparisonArtifact = (locale: string, id: string) =>
  `views/${locale}/enhancement-comparisons/${id}.json`;

export const enhancementComparisonPath = (id: string) => `/characters/${id}/enhancement-comparison`;

export const enhancementCharacterPath = (id: string, baseForm: boolean) =>
  `/characters/${id}/${baseForm ? '?enhanced=0' : ''}`;

export function visibleComparisonText(tokens: readonly DescriptionToken[]): string {
  return tokens
    .map((token) => (token.icon ? `[icon:${token.icon.spriteName}:${token.icon.id}]` : token.value))
    .join('');
}
