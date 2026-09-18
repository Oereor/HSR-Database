import type { MiHoMoDependencies, PlayerProfile } from './contract.js';
import { PlayerApiError } from './errors.js';
import { parsePlayerProfile } from './parse.js';

const upstreamBaseUrl = 'https://api.mihomo.me/sr_info_parsed';
const userAgent = 'HSR-Database-PlayerInfo/1.0 (+https://hsrarchive.cc)';
const defaultTimeoutMs = 10_000;
const inFlight = new Map<string, Promise<PlayerProfile>>();

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isSafeInteger(seconds) ? seconds : undefined;
  }

  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - now) / 1_000));
}

async function isQueueTimeout(response: Response): Promise<boolean> {
  try {
    const value = (await response.json()) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const detail = (value as Record<string, unknown>).detail;
    return typeof detail === 'string' && /queue\s*timeout/i.test(detail);
  } catch {
    return false;
  }
}

export async function fetchPlayerProfile(
  uid: string,
  dependencies: MiHoMoDependencies = {}
): Promise<PlayerProfile> {
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const timeoutMs = dependencies.timeoutMs ?? defaultTimeoutMs;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = new URL(`${upstreamBaseUrl}/${encodeURIComponent(uid)}`);
  url.searchParams.set('version', 'v2');
  url.searchParams.set('language', 'cn');

  try {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': userAgent
        },
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        throw new PlayerApiError('UPSTREAM_TIMEOUT');
      }
      throw new PlayerApiError('UPSTREAM_UNAVAILABLE');
    }

    if (response.status === 404) throw new PlayerApiError('PLAYER_NOT_FOUND');
    if (response.status === 429) {
      throw new PlayerApiError(
        'RATE_LIMITED',
        parseRetryAfter(response.headers.get('Retry-After'), dependencies.now?.())
      );
    }
    if (response.status >= 500 && (await isQueueTimeout(response))) {
      throw new PlayerApiError('UPSTREAM_TIMEOUT');
    }
    if (!response.ok) throw new PlayerApiError('UPSTREAM_UNAVAILABLE');

    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new PlayerApiError('UPSTREAM_INVALID_RESPONSE');
    }
    return parsePlayerProfile(value);
  } finally {
    clearTimeout(timeout);
  }
}

export function getPlayerProfile(
  uid: string,
  dependencies: MiHoMoDependencies = {}
): Promise<PlayerProfile> {
  const existing = inFlight.get(uid);
  if (existing !== undefined) return existing;

  const pending = fetchPlayerProfile(uid, dependencies);
  const tracked = pending.finally(() => {
    if (inFlight.get(uid) === tracked) inFlight.delete(uid);
  });
  inFlight.set(uid, tracked);
  return tracked;
}
