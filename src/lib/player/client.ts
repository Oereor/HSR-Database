import { createPlayerProfileCache } from './cache.js';
import type { PlayerErrorCode, PlayerErrorResponse, PlayerProfile } from './contract.js';

const PLAYER_ERROR_CODES = new Set<PlayerErrorCode>([
  'INVALID_UID',
  'PLAYER_NOT_FOUND',
  'RATE_LIMITED',
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_UNAVAILABLE',
  'UPSTREAM_INVALID_RESPONSE'
]);

export class PlayerApiError extends Error {
  readonly code: PlayerErrorCode;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(code: PlayerErrorCode, retryable: boolean, retryAfterSeconds?: number) {
    super(code);
    this.name = 'PlayerApiError';
    this.code = code;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function normalizePlayerUid(value: string): string | null {
  const uid = value.trim();
  return uid !== '' && /^\d+$/.test(uid) ? uid : null;
}

function parseErrorResponse(value: unknown): PlayerErrorResponse['error'] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const error = (value as Record<string, unknown>).error;
  if (!error || typeof error !== 'object' || Array.isArray(error)) return null;
  const record = error as Record<string, unknown>;
  if (
    typeof record.code !== 'string' ||
    !PLAYER_ERROR_CODES.has(record.code as PlayerErrorCode) ||
    typeof record.retryable !== 'boolean'
  ) {
    return null;
  }
  if (
    record.retryAfterSeconds !== undefined &&
    (!Number.isSafeInteger(record.retryAfterSeconds) || Number(record.retryAfterSeconds) < 0)
  ) {
    return null;
  }
  return {
    code: record.code as PlayerErrorCode,
    retryable: record.retryable,
    ...(record.retryAfterSeconds === undefined
      ? {}
      : { retryAfterSeconds: Number(record.retryAfterSeconds) })
  };
}

export interface PlayerProfileClient {
  fetchPlayerProfile(uid: string): Promise<PlayerProfile>;
  clear(): void;
}

export function createPlayerProfileClient(
  options: {
    fetchImpl?: typeof fetch;
    now?: () => number;
    ttlMs?: number;
  } = {}
): PlayerProfileClient {
  const cache = createPlayerProfileCache({ now: options.now, ttlMs: options.ttlMs });

  async function request(uid: string): Promise<PlayerProfile> {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    let response: Response;
    try {
      response = await fetchImpl(`/api/player/?${new URLSearchParams({ uid })}`, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });
    } catch {
      throw new PlayerApiError('UPSTREAM_UNAVAILABLE', true);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new PlayerApiError('UPSTREAM_INVALID_RESPONSE', true);
    }

    if (!response.ok) {
      const error = parseErrorResponse(body);
      if (!error) throw new PlayerApiError('UPSTREAM_INVALID_RESPONSE', true);
      throw new PlayerApiError(error.code, error.retryable, error.retryAfterSeconds);
    }

    return body as PlayerProfile;
  }

  return {
    fetchPlayerProfile(value) {
      const uid = normalizePlayerUid(value);
      if (!uid) return Promise.reject(new PlayerApiError('INVALID_UID', false));
      return cache.getOrLoad(uid, () => request(uid));
    },
    clear: () => cache.clear()
  };
}

const defaultClient = createPlayerProfileClient();

export const fetchPlayerProfile = (uid: string): Promise<PlayerProfile> =>
  defaultClient.fetchPlayerProfile(uid);
