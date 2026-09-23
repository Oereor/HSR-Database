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
  stat: RelicStatKey;
  threshold: number;
}

export interface CharacterSoftTarget {
  stat: RelicStatKey;
  minimumThreshold: number;
  maximumThreshold: number;
}

export interface CharacterRelicScoreProfile {
  characterId: string;
  templateId: TemplateId;
  substatWeights: Partial<Record<RelicStatKey, number>>;
  hardBreakpoints: ProfileBreakpoint[];
  softTargets: CharacterSoftTarget[];
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
  schemaVersion: 3;
  profiles: CharacterRelicScoreProfile[];
}
