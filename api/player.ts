import { jsonResponse, PlayerApiError, playerErrorResponse } from './_player/errors.js';
import { createEnkaPlayerClient, type EnkaPlayerClient } from './_player/enka/client.js';
import { playerRuntimeData, resolveCanonicalPlayerProfile } from './_player/enka/pipeline.js';
import type { scorePlayerCharacterBuild } from '../src/lib/server/relic-score/player.js';

const successHeaders = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Vercel-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
};

const defaultEnkaClient = createEnkaPlayerClient();

interface PlayerLogEvent {
  event:
    | 'upstream_error'
    | 'rate_limit'
    | 'timeout'
    | 'decode_error'
    | 'unknown_entity'
    | 'synthesis_failure'
    | 'scoring_failure'
    | 'display_area_drift';
  code?: string;
  diagnostic?: string;
  sourceId?: string;
  area?: string;
}

export interface PlayerHandlerDependencies {
  client?: EnkaPlayerClient;
  log?: (event: PlayerLogEvent) => void;
  scoreCharacter?: typeof scorePlayerCharacterBuild;
}

function defaultLog(event: PlayerLogEvent): void {
  console.warn(JSON.stringify({ scope: 'player', ...event }));
}

function upstreamLogEvent(code: PlayerApiError['code']): PlayerLogEvent['event'] {
  if (code === 'RATE_LIMITED') return 'rate_limit';
  if (code === 'UPSTREAM_TIMEOUT') return 'timeout';
  if (code === 'UPSTREAM_INVALID_RESPONSE') return 'decode_error';
  return 'upstream_error';
}

function readUid(request: Request): string | null {
  const values = new URL(request.url).searchParams.getAll('uid');
  if (values.length !== 1) return null;
  const uid = values[0].trim();
  return uid !== '' && /^\d+$/.test(uid) ? uid : null;
}

export async function handlePlayerRequest(
  request: Request,
  dependencies: PlayerHandlerDependencies = {}
): Promise<Response> {
  if (request.method !== 'GET') {
    return jsonResponse({ error: { code: 'METHOD_NOT_ALLOWED', retryable: false } }, 405, {
      Allow: 'GET',
      'Cache-Control': 'no-store'
    });
  }

  const uid = readUid(request);
  if (uid === null) return playerErrorResponse(new PlayerApiError('INVALID_UID'));

  try {
    const fetched = await (dependencies.client ?? defaultEnkaClient).fetchPlayerProfile(uid);
    const result = resolveCanonicalPlayerProfile(
      fetched.profile,
      playerRuntimeData,
      fetched.metadata,
      dependencies.scoreCharacter
    );
    const log = dependencies.log ?? defaultLog;
    for (const failure of result.scoringFailures)
      log({ event: 'scoring_failure', sourceId: failure.buildId, diagnostic: failure.diagnostic });
    for (const character of result.canonical.characters) {
      if (character.build.display.area === 'unknown')
        log({ event: 'display_area_drift', area: character.build.display.area });
      if (character.status === 'failed') log({ event: 'synthesis_failure' });
      for (const diagnostic of character.diagnostics)
        log({
          event: 'unknown_entity',
          code: diagnostic.code,
          sourceId: diagnostic.sourceId
        });
    }
    return jsonResponse(result.presentation, 200, successHeaders);
  } catch (error) {
    const resolved =
      error instanceof PlayerApiError ? error : new PlayerApiError('UPSTREAM_UNAVAILABLE');
    (dependencies.log ?? defaultLog)({
      event: upstreamLogEvent(resolved.code),
      code: resolved.code,
      ...(resolved.diagnostic === undefined ? {} : { diagnostic: resolved.diagnostic })
    });
    return playerErrorResponse(resolved);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    return handlePlayerRequest(request);
  }
};
