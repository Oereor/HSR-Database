import type { CharacterRelicScoreProfile } from '../../../src/lib/relic-score/profile-types.js';
import type { AvatarEquipmentRecommendation } from '../../../src/lib/domain/types.js';
import { loadFarmingInputs } from '../../../scripts/relic-score/farming-inputs.js';

/** Synthetic reviewed fixture, independent of the production approval lifecycle.
 * Its utility weights match the existing 1310 prototype distribution. */
export async function loadFixtureScoringInputs() {
  const farming = await loadFarmingInputs();
  const profile: CharacterRelicScoreProfile = {
    characterId: '1310',
    templateId: 'break',
    substatWeights: { AttackAddedRatio: 0.75, BreakDamageAddedRatioBase: 1.25, SpeedDelta: 1 },
    softTargets: [],
    hardBreakpoints: [],
    metadata: {
      reviewStatus: 'reviewed',
      inferenceConfidence: 'high',
      reviewReasons: [],
      inputDigest: 'a'.repeat(64),
      reviewedInputDigest: 'a'.repeat(64),
      generatorVersion: 4,
      sourceCommit: 'a'.repeat(40)
    }
  };
  const recommendation: AvatarEquipmentRecommendation = {
    avatarId: '1310',
    lightConeIds: [],
    cavernSetIds: ['119'],
    planarSetIds: ['316'],
    mainStatOptions: [
      { slot: 'BODY', propertyTypes: ['AttackAddedRatio'] },
      { slot: 'FOOT', propertyTypes: ['SpeedDelta'] },
      { slot: 'NECK', propertyTypes: ['AttackAddedRatio'] },
      { slot: 'OBJECT', propertyTypes: ['BreakDamageAddedRatioBase'] }
    ],
    subStatPropertyTypes: ['AttackAddedRatio', 'BreakDamageAddedRatioBase', 'SpeedDelta']
  };
  return { ...farming, profiles: [profile], recommendations: [recommendation] };
}
