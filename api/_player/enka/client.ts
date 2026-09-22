import type {
  CanonicalPlayerProfile,
  PlayerFetchResult
} from '../../../src/lib/player/canonical.js';
import { PlayerApiError } from '../errors.js';
import { parseRetryAfter } from '../mihomo.js';
import { adaptEnkaProfile } from './adapter.js';
import { decodeEnkaResponse } from './decode.js';

export interface EnkaClientDependencies {
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

interface CachedResult {
  result: PlayerFetchResult<CanonicalPlayerProfile>;
  expiresAt: number;
}

const upstreamBaseUrl = 'https://enka.network/api/hsr/uid';
export const ENKA_USER_AGENT = 'HSR-Database-PlayerInfo (+https://hsrarchive.cc)';
const defaultTimeoutMs = 10_000;

class TransientEnkaError extends Error {
  constructor(readonly code: 'UPSTREAM_TIMEOUT' | 'UPSTREAM_UNAVAILABLE') {
    super(code);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function fetchAttempt(
  uid: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  now: () => number
): Promise<PlayerFetchResult<CanonicalPlayerProfile>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetchImpl(`${upstreamBaseUrl}/${encodeURIComponent(uid)}/`, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': ENKA_USER_AGENT },
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error))
        throw new TransientEnkaError('UPSTREAM_TIMEOUT');
      throw new TransientEnkaError('UPSTREAM_UNAVAILABLE');
    }

    if (response.status === 400) throw new PlayerApiError('INVALID_UID');
    if (response.status === 404) throw new PlayerApiError('PLAYER_NOT_FOUND');
    if (response.status === 429)
      throw new PlayerApiError(
        'RATE_LIMITED',
        parseRetryAfter(response.headers.get('Retry-After'), now())
      );
    if ([500, 502, 503, 504].includes(response.status))
      throw new TransientEnkaError('UPSTREAM_UNAVAILABLE');
    if (response.status === 424 || !response.ok) throw new PlayerApiError('UPSTREAM_UNAVAILABLE');

    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new PlayerApiError('UPSTREAM_INVALID_RESPONSE');
    }
    const decoded = decodeEnkaResponse(value);
    return {
      profile: adaptEnkaProfile(decoded),
      metadata: {
        ...(decoded.region === undefined ? {} : { region: decoded.region }),
        ...(decoded.ttl === undefined ? {} : { ttl: decoded.ttl }),
        fetchedAt: now(),
        cacheHit: false
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

export interface EnkaPlayerClient {
  fetchPlayerProfile(uid: string): Promise<PlayerFetchResult<CanonicalPlayerProfile>>;
  clear(): void;
}

export function createEnkaPlayerClient(
  dependencies: EnkaClientDependencies = {}
): EnkaPlayerClient {
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const now = dependencies.now ?? Date.now;
  const timeoutMs = dependencies.timeoutMs ?? defaultTimeoutMs;
  const cache = new Map<string, CachedResult>();
  const inFlight = new Map<string, Promise<PlayerFetchResult<CanonicalPlayerProfile>>>();

  const load = async (uid: string): Promise<PlayerFetchResult<CanonicalPlayerProfile>> => {
    let lastTransient: TransientEnkaError | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await fetchAttempt(uid, fetchImpl, timeoutMs, now);
      } catch (error) {
        if (!(error instanceof TransientEnkaError)) throw error;
        lastTransient = error;
      }
    }
    throw new PlayerApiError(lastTransient?.code ?? 'UPSTREAM_UNAVAILABLE');
  };

  return {
    fetchPlayerProfile(uid) {
      const cached = cache.get(uid);
      if (cached && now() < cached.expiresAt)
        return Promise.resolve({
          ...cached.result,
          metadata: { ...cached.result.metadata, cacheHit: true }
        });
      if (cached) cache.delete(uid);

      const active = inFlight.get(uid);
      if (active) return active;

      const pending = load(uid).then((result) => {
        const ttl = result.metadata.ttl ?? 0;
        if (ttl > 0) cache.set(uid, { result, expiresAt: result.metadata.fetchedAt + ttl * 1_000 });
        return result;
      });
      const tracked = pending.finally(() => {
        if (inFlight.get(uid) === tracked) inFlight.delete(uid);
      });
      inFlight.set(uid, tracked);
      return tracked;
    },
    clear() {
      cache.clear();
      inFlight.clear();
    }
  };
}
