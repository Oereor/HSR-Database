import type { MainStatStatus } from './main-stat-policy.js';

export function pieceContributions(
  status: MainStatStatus,
  completion: number,
  percentile: number,
  alpha: number
) {
  const mainCompletion = status === 'agnostic' ? null : status === 'accepted' ? completion : 0;
  const mainContribution = alpha * (mainCompletion ?? 0);
  const subContribution = (status === 'agnostic' ? 1 : 1 - alpha) * percentile;
  return {
    mainCompletion,
    mainContribution,
    subContribution,
    pieceNormalized: mainContribution + subContribution
  };
}

/** Kept for the historical calibration tools; runtime consumes contributions. */
export function pieceNormalized(main: number, percentile: number, alpha: number): number {
  return pieceContributions('accepted', main, percentile, alpha).pieceNormalized;
}

export function coreBuildScore(
  statCompletion: number,
  setIntegrity: number,
  statShare: number
): number {
  return 100 * (statShare * statCompletion + (1 - statShare) * setIntegrity);
}

export function normalizedStatCompletion(
  statCompletion: number,
  progress: number,
  failureRatio: number,
  hasSoftTarget: boolean,
  hasHardBreakpoint: boolean,
  baseStatWeight: number,
  softTargetWeight: number,
  hardBreakpointWeight: number
): number {
  const softWeight = hasSoftTarget ? softTargetWeight : 0;
  const hardWeight = hasHardBreakpoint ? hardBreakpointWeight : 0;
  return (
    (baseStatWeight * statCompletion + softWeight * progress + hardWeight * (1 - failureRatio)) /
    (baseStatWeight + softWeight + hardWeight)
  );
}
