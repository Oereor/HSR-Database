import { jsonResponse, PlayerApiError, playerErrorResponse } from './_player/errors.js';
import { getPlayerProfile, type MiHoMoDependencies } from './_player/mihomo.js';

const successHeaders = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Vercel-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
};

function readUid(request: Request): string | null {
  const values = new URL(request.url).searchParams.getAll('uid');
  if (values.length !== 1) return null;
  const uid = values[0].trim();
  return uid !== '' && /^\d+$/.test(uid) ? uid : null;
}

export async function handlePlayerRequest(
  request: Request,
  dependencies: MiHoMoDependencies = {}
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
    return jsonResponse(await getPlayerProfile(uid, dependencies), 200, successHeaders);
  } catch (error) {
    return playerErrorResponse(
      error instanceof PlayerApiError ? error : new PlayerApiError('UPSTREAM_UNAVAILABLE')
    );
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    return handlePlayerRequest(request);
  }
};
