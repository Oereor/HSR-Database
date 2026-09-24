import {
  generateCharacterProfile,
  profileInputDigest,
  type ProfileOverrideConfig
} from './profiles.js';
import type { loadProfileInputs } from './validate.js';

type ProfileInputs = Awaited<ReturnType<typeof loadProfileInputs>>;

export function currentReviewSummary(inputs: ProfileInputs, characterId: string) {
  const character = inputs.characters.find((item) => item.id === characterId);
  if (!character) throw new Error(`[relic-score/review] unknown character ${characterId}`);
  const override = inputs.overrides.overrides[characterId];
  const profile = generateCharacterProfile(
    character,
    inputs.templates,
    override,
    inputs.sourceCommit
  );
  return {
    characterId,
    templateId: profile.templateId,
    substatWeights: profile.substatWeights,
    softTargets: profile.softTargets,
    hardBreakpoints: profile.hardBreakpoints,
    inputDigest: profileInputDigest(character, inputs.templates, override),
    reviewedInputDigest: override?.reviewedInputDigest ?? null,
    reviewStatus: profile.metadata.reviewStatus
  };
}

export function approveCurrentReview(
  inputs: ProfileInputs,
  characterId: string
): ProfileOverrideConfig {
  const summary = currentReviewSummary(inputs, characterId);
  const updated = structuredClone(inputs.overrides);
  updated.overrides[characterId] = {
    ...(updated.overrides[characterId] ?? {}),
    reviewedInputDigest: summary.inputDigest
  };
  return updated;
}
