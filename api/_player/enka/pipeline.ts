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
import { normalizePlayerBuildInput } from '../../../src/lib/relic-score/normalize.js';
import { unavailableRelicScore } from '../../../src/lib/relic-score/presentation.js';
import { scorePlayerCharacterBuild } from '../../../src/lib/server/relic-score/player.js';
import { relicSlotFromNumber } from '../../../src/lib/relic-score/reference.js';
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
  const profile = adaptEnkaProfile(decodeEnkaResponse(value));
  return resolveCanonicalPlayerProfile(profile, runtime, metadata);
}

export function resolveCanonicalPlayerProfile(
  profile: CanonicalPlayerProfile,
  runtime: PlayerRuntimeData = playerRuntimeData,
  metadata?: PlayerFetchMetadata,
  scoreCharacter: typeof scorePlayerCharacterBuild = scorePlayerCharacterBuild
): EnkaPlayerPipelineResult {
  const canonical = synthesizePlayerProfile(profile, runtime);
  const scoringFailures: EnkaPlayerPipelineResult['scoringFailures'] = [];
  const normalizedBuilds = canonical.characters.map((character) => {
    try {
      return normalizePlayerBuildInput(character, runtime);
    } catch (error) {
      scoringFailures.push({
        buildId: character.build.buildId,
        diagnostic: error instanceof Error ? error.message : String(error)
      });
      return { status: 'unavailable' as const, reason: 'SYNTHESIS_FAILED' as const };
    }
  });
  const scoresByBuildId = new Map(
    canonical.characters.map((character, index) => {
      try {
        return [
          character.build.buildId,
          scoreCharacter(normalizedBuilds[index], character.build.avatarId)
        ] as const;
      } catch (error) {
        scoringFailures.push({
          buildId: character.build.buildId,
          diagnostic: error instanceof Error ? error.message : String(error)
        });
        return [
          character.build.buildId,
          unavailableRelicScore(
            'score-unavailable',
            character.build.relics.flatMap((relic) => {
              const slot = relicSlotFromNumber(relic.type);
              return slot ? [slot] : [];
            })
          )
        ] as const;
      }
    })
  );
  const presentation = presentCanonicalPlayerProfile(canonical, runtime);
  return {
    canonical,
    normalizedBuilds,
    presentation: {
      ...presentation,
      characters: presentation.characters.map((character) => ({
        ...character,
        relicScore: scoresByBuildId.get(character.buildId)
      }))
    },
    scoringFailures,
    ...(metadata === undefined ? {} : { metadata })
  };
}
