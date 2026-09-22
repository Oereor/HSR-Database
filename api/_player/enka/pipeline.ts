import playerRuntimeJson from '../../../src/lib/generated/runtime/player.json';
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
  metadata?: PlayerFetchMetadata
): EnkaPlayerPipelineResult {
  const canonical = synthesizePlayerProfile(profile, runtime);
  return {
    canonical,
    presentation: presentCanonicalPlayerProfile(canonical, runtime),
    ...(metadata === undefined ? {} : { metadata })
  };
}
