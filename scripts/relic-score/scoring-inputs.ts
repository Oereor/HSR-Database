import { loadFarmingInputs } from './farming-inputs.js';
import { loadProfileInputs, validateCurrentProfiles } from './validate.js';
import type { BenchmarkInputs } from './benchmark-core.js';

export async function loadScoringInputs(): Promise<BenchmarkInputs> {
  const [artifact, profileInputs, farming] = await Promise.all([
    validateCurrentProfiles(),
    loadProfileInputs(),
    loadFarmingInputs()
  ]);
  return {
    runtime: farming.runtime,
    model: farming.model,
    profiles: artifact.profiles,
    recommendations: profileInputs.characters.map((character) => character.equipmentRecommendation)
  };
}
