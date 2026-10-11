import playerRuntimeJson from '../../../src/lib/generated/runtime/player.json' with { type: 'json' };
import type {
  CanonicalPlayerProfile,
  EnkaPlayerPipelineResult,
  PlayerFetchMetadata
} from '../../../src/lib/player/canonical.js';
import {
  assertPlayerRuntimeData,
  type PlayerRuntimeData
} from '../../../src/lib/player/runtime-data.js';
import {
  presentCanonicalPlayerProfile,
  synthesizePlayerProfile
} from '../../../src/lib/player/stat-synthesis.js';
import {
  scorePlayerCharacterBuild,
  type PlayerScoringResult
} from '../../../src/lib/server/relic-score/player.js';
import { normalizeRatingV2Build } from '../../../src/lib/relic-score/v2/normalize.js';
import { presentRatingV2 } from '../../../src/lib/relic-score/v2/presentation.js';
import { adaptEnkaProfile } from './adapter.js';
import { decodeEnkaResponse } from './decode.js';

const bundledRuntime: unknown = playerRuntimeJson;
assertPlayerRuntimeData(bundledRuntime);
export const playerRuntimeData: PlayerRuntimeData = bundledRuntime;

export function buildEnkaPlayerProfile(
  value: unknown,
  runtime: PlayerRuntimeData = playerRuntimeData,
  metadata?: PlayerFetchMetadata
): EnkaPlayerPipelineResult {
  return resolveCanonicalPlayerProfile(
    adaptEnkaProfile(decodeEnkaResponse(value)),
    runtime,
    metadata
  );
}

export function resolveCanonicalPlayerProfile(
  profile: CanonicalPlayerProfile,
  runtime: PlayerRuntimeData = playerRuntimeData,
  metadata?: PlayerFetchMetadata,
  scoreCharacter: typeof scorePlayerCharacterBuild = scorePlayerCharacterBuild
): EnkaPlayerPipelineResult {
  const scoringFailures: EnkaPlayerPipelineResult['scoringFailures'] = [];
  const scored = new Map(
    profile.characters.map((build) => {
      let result: PlayerScoringResult;
      try {
        result = scoreCharacter(build, runtime);
        if (result.diagnostic)
          scoringFailures.push({ buildId: build.buildId, diagnostic: result.diagnostic });
      } catch {
        const normalized = normalizeRatingV2Build(build, runtime);
        const input = normalized.status === 'valid' ? normalized.input : normalized.partialInput;
        result = {
          normalized,
          score: presentRatingV2(normalized, {
            build: { status: 'unavailable', reason: 'piece-unavailable' },
            pieces: input.relics.map(() => ({ status: 'unavailable', reason: 'piece-unavailable' }))
          })
        };
        scoringFailures.push({ buildId: build.buildId, diagnostic: 'SCORING_FAILED' });
      }
      return [build.buildId, result] as const;
    })
  );
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
    },
    scoringFailures,
    ...(metadata === undefined ? {} : { metadata })
  };
}
