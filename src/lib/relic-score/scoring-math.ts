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

export function finalBuildScore(
  core: number,
  progress: number,
  failureRatio: number,
  maxBonus: number,
  maxPenalty: number
): number {
  return Math.min(100, Math.max(0, core + maxBonus * progress - maxPenalty * failureRatio));
}
