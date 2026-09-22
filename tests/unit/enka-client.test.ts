import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createEnkaPlayerClient, ENKA_USER_AGENT } from '../../api/_player/enka/client';

const fixture = JSON.parse(
  readFileSync('tests/fixtures/enka/phase1-player.sanitized.json', 'utf8')
);

describe('Enka HTTP client', () => {
  it('sends the custom UA, caches for upstream ttl and marks cache hits', async () => {
    let now = 1_000;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('User-Agent')).toBe(ENKA_USER_AGENT);
      return Response.json(fixture);
    });
    const client = createEnkaPlayerClient({ fetchImpl, now: () => now });
    const first = await client.fetchPlayerProfile('100000001');
    now += 59_000;
    const second = await client.fetchPlayerProfile('100000001');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first.metadata.cacheHit).toBe(false);
    expect(second.metadata.cacheHit).toBe(true);
    expect(second.metadata.ttl).toBe(60);
  });

  it('single-flights concurrent requests', async () => {
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => (release = resolve));
    const fetchImpl = vi.fn(() => pending);
    const client = createEnkaPlayerClient({ fetchImpl });
    const first = client.fetchPlayerProfile('100000001');
    const second = client.fetchPlayerProfile('100000001');
    release(Response.json(fixture));
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('single-flights ttl=0 responses without caching the completed result', async () => {
    const noCacheFixture = { ...fixture, ttl: 0 };
    let release!: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => (release = resolve));
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValue(Response.json(noCacheFixture));
    const client = createEnkaPlayerClient({ fetchImpl });
    const first = client.fetchPlayerProfile('100000001');
    const concurrent = client.fetchPlayerProfile('100000001');
    release(Response.json(noCacheFixture));
    await Promise.all([first, concurrent]);
    await client.fetchPlayerProfile('100000001');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries a transient failure once but never retries 429', async () => {
    const transient = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json(fixture));
    await expect(
      createEnkaPlayerClient({ fetchImpl: transient }).fetchPlayerProfile('100000001')
    ).resolves.toMatchObject({ profile: { uid: '100000001' } });
    expect(transient).toHaveBeenCalledTimes(2);

    const limited = vi.fn(async () =>
      Response.json({}, { status: 429, headers: { 'Retry-After': '17' } })
    );
    await expect(
      createEnkaPlayerClient({ fetchImpl: limited }).fetchPlayerProfile('100000001')
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 17 });
    expect(limited).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, 'INVALID_UID'],
    [404, 'PLAYER_NOT_FOUND'],
    [424, 'UPSTREAM_UNAVAILABLE']
  ])('maps HTTP %s to %s without retry', async (status, code) => {
    const fetchImpl = vi.fn(async () => new Response(null, { status }));
    await expect(
      createEnkaPlayerClient({ fetchImpl }).fetchPlayerProfile('100000001')
    ).rejects.toMatchObject({ code });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries timeouts once and then exposes the stable timeout code', async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    });
    await expect(
      createEnkaPlayerClient({ fetchImpl, timeoutMs: 1 }).fetchPlayerProfile('100000001')
    ).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
