import type { PlayerStatTarget } from '../player/property-semantics.js';
import type { RelicStatKey } from './stat-registry.js';

export type TemplateId =
  | 'direct-dps'
  | 'direct-support'
  | 'break'
  | 'dot-dps'
  | 'debuff-support'
  | 'sustain'
  | 'hybrid-direct-break';
export type InferenceConfidence = 'high' | 'medium' | 'low';
export type ReviewStatus = 'reviewed' | 'unreviewed' | 'needs-review';

export interface ProfileBreakpoint {
  stat: PlayerStatTarget;
  value: number;
}

export interface ProfileTarget {
  stat: PlayerStatTarget;
  value: number;
}

export interface ProfileCurve {
  stat: PlayerStatTarget;
  points: Array<{ value: number; utility: number }>;
}

export interface CharacterRelicScoreProfile {
  characterId: string;
  templateId: TemplateId;
  substatWeights: Partial<Record<RelicStatKey, number>>;
  hardBreakpoints: ProfileBreakpoint[];
  statTargets: ProfileTarget[];
  statCurves: ProfileCurve[];
  metadata: {
    inferenceConfidence: InferenceConfidence;
    reviewStatus: ReviewStatus;
    reviewReasons: string[];
    inputDigest: string;
    reviewedInputDigest: string | null;
    generatorVersion: number;
    sourceCommit: string;
  };
}

export interface CharacterProfileArtifact {
  schemaVersion: 1;
  profiles: CharacterRelicScoreProfile[];
}
