export function pieceNormalized(main: number, percentile: number, alpha: number): number {
  return alpha * main + (1 - alpha) * percentile;
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
