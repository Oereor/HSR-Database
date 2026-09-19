import type { PlayerProfile } from './contract.js';

export const PLAYER_PROFILE_CACHE_TTL_MS = 5 * 60 * 1_000;

interface CachedPlayerProfile {
  data: PlayerProfile;
  fetchedAt: number;
}

export interface PlayerProfileCache {
  getOrLoad(uid: string, load: () => Promise<PlayerProfile>): Promise<PlayerProfile>;
  clear(): void;
}

export function createPlayerProfileCache(
  options: {
    now?: () => number;
    ttlMs?: number;
  } = {}
): PlayerProfileCache {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? PLAYER_PROFILE_CACHE_TTL_MS;
  const values = new Map<string, CachedPlayerProfile>();
  const inFlight = new Map<string, Promise<PlayerProfile>>();

  return {
    getOrLoad(uid, load) {
      const cached = values.get(uid);
      if (cached && now() - cached.fetchedAt < ttlMs) return Promise.resolve(cached.data);
      if (cached) values.delete(uid);

      const existing = inFlight.get(uid);
      if (existing) return existing;

      const pending = load().then((data) => {
        values.set(uid, { data, fetchedAt: now() });
        return data;
      });
      const tracked = pending.finally(() => {
        if (inFlight.get(uid) === tracked) inFlight.delete(uid);
      });
      inFlight.set(uid, tracked);
      return tracked;
    },
    clear() {
      values.clear();
      inFlight.clear();
    }
  };
}
