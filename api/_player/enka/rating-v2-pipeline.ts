import type { CanonicalPlayerProfile } from '../../../src/lib/player/canonical.js';
import type { PlayerRuntimeData } from '../../../src/lib/player/runtime-data.js';
import {
  synthesizePlayerProfile,
  presentCanonicalPlayerProfile
} from '../../../src/lib/player/stat-synthesis.js';
import type { createRatingV2Scorer } from '../../../src/lib/server/relic-score/v2.js';

/** Candidate integration; production pipeline.ts remains explicitly V1 until full publication gates close. */
export function resolveRatingV2PlayerProfile(
  profile: CanonicalPlayerProfile,
  runtime: PlayerRuntimeData,
  scorer: ReturnType<typeof createRatingV2Scorer>
) {
  const scored = new Map(profile.characters.map((build) => [build.buildId, scorer(build)]));
  const canonical = synthesizePlayerProfile(profile, runtime);
  const presentation = presentCanonicalPlayerProfile(canonical, runtime);
  return {
    canonical,
    normalizedBuilds: profile.characters.map((build) => scored.get(build.buildId)!.normalized),
    presentation: {
      ...presentation,
      characters: presentation.characters.map((character) => ({
        ...character,
        relicScore: scored.get(character.buildId)!.score
      }))
    }
  };
}
