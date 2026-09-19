import { describe, expect, it, vi } from 'vitest';
import {
  PlayerApiError,
  createPlayerProfileClient,
  normalizePlayerUid
} from '../../src/lib/player/client';
import type { PlayerProfile } from '../../src/lib/player/contract';

const profile: PlayerProfile = {
  uid: '100000001',
  nickname: 'Synthetic Player',
  level: 70,
  worldLevel: 6,
  avatar: null,
  signature: '',
  characterCount: null,
  lightConeCount: 0,
  achievementCount: 888,
  characters: []
};

const playerResponse = () => Response.json(profile);

describe('browser Player client', () => {
  it('normalizes numeric UIDs without imposing a fixed length', () => {
    expect(normalizePlayerUid(' 123 ')).toBe('123');
    expect(normalizePlayerUid('')).toBeNull();
    expect(normalizePlayerUid('12a3')).toBeNull();
  });

  it('requests the canonical same-origin endpoint and returns the shared DTO', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(playerResponse());
    const client = createPlayerProfileClient({ fetchImpl });

    await expect(client.fetchPlayerProfile('100000001')).resolves.toEqual(profile);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/player/?uid=100000001');
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'GET' });
  });

  it('parses typed BFF errors including Retry-After metadata', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'RATE_LIMITED', retryable: true, retryAfterSeconds: 17 } },
          { status: 429 }
        )
      );
    const client = createPlayerProfileClient({ fetchImpl });

    const error = await client.fetchPlayerProfile('100000429').catch((value) => value);
    expect(error).toBeInstanceOf(PlayerApiError);
    expect(error).toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
      retryAfterSeconds: 17
    });
  });

  it.each([
    ['malformed JSON', new Response('{', { status: 503 })],
    ['malformed envelope', Response.json({ message: 'private upstream detail' }, { status: 503 })]
  ])('maps a %s error response to UPSTREAM_INVALID_RESPONSE', async (_label, response) => {
    const client = createPlayerProfileClient({
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response)
    });

    await expect(client.fetchPlayerProfile('100000503')).rejects.toMatchObject({
      code: 'UPSTREAM_INVALID_RESPONSE',
      retryable: true
    });
  });

  it('maps browser network failures without exposing the original exception', async () => {
    const client = createPlayerProfileClient({
      fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new Error('private DNS detail'))
    });

    await expect(client.fetchPlayerProfile('100000503')).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      retryable: true,
      message: 'UPSTREAM_UNAVAILABLE'
    });
  });

  it('deduplicates in-flight requests and caches successful responses', async () => {
    let resolveResponse!: (response: Response) => void;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        })
    );
    const client = createPlayerProfileClient({ fetchImpl });

    const first = client.fetchPlayerProfile('100000001');
    const second = client.fetchPlayerProfile('100000001');
    expect(fetchImpl).toHaveBeenCalledOnce();
    resolveResponse(playerResponse());
    await expect(Promise.all([first, second])).resolves.toEqual([profile, profile]);
    await expect(client.fetchPlayerProfile('100000001')).resolves.toEqual(profile);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('expires cached profiles after five minutes', async () => {
    let now = 1_000;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => playerResponse());
    const client = createPlayerProfileClient({ fetchImpl, now: () => now });

    await client.fetchPlayerProfile('100000001');
    now += 5 * 60 * 1_000 - 1;
    await client.fetchPlayerProfile('100000001');
    expect(fetchImpl).toHaveBeenCalledOnce();
    now += 1;
    await client.fetchPlayerProfile('100000001');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
