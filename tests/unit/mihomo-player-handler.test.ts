import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { parseRetryAfter } from '../../api/_player/mihomo';
import { handlePlayerRequest } from '../../api/player';

const fixtureRoot = path.resolve('tests/fixtures/mihomo');
let playerFixture: unknown;
let queueTimeoutFixture: string;
let rateLimitFixture: string;

function request(query = '?uid=100000001', method = 'GET'): Request {
  return new Request(`https://hsrarchive.cc/api/player/${query}`, { method });
}

function playerResponse(): Response {
  return Response.json(playerFixture);
}

async function errorBody(response: Response): Promise<{
  error: { code: string; retryable: boolean; retryAfterSeconds?: number };
}> {
  return (await response.json()) as {
    error: { code: string; retryable: boolean; retryAfterSeconds?: number };
  };
}

beforeAll(async () => {
  [playerFixture, queueTimeoutFixture, rateLimitFixture] = await Promise.all([
    readFile(path.join(fixtureRoot, 'phase1-player-response.synthetic.json'), 'utf8').then(
      (value) => JSON.parse(value) as unknown
    ),
    readFile(path.join(fixtureRoot, 'phase1-queue-timeout.synthetic.json'), 'utf8'),
    readFile(path.join(fixtureRoot, 'phase1-rate-limit.synthetic.json'), 'utf8')
  ]);
});

describe('player Function handler', () => {
  it('returns the narrow DTO and sends only the fixed upstream request contract', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(playerResponse());
    const response = await handlePlayerRequest(request('?uid=%20100000001%20'), { fetchImpl });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate');
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe(
      'public, s-maxage=300, stale-while-revalidate=600'
    );
    expect(await response.json()).toMatchObject({
      uid: '100000001',
      characters: expect.any(Array)
    });
    expect(fetchImpl).toHaveBeenCalledOnce();

    const [input, init] = fetchImpl.mock.calls[0];
    const upstream = new URL(String(input));
    const headers = new Headers(init?.headers);
    expect(upstream.origin + upstream.pathname).toBe(
      'https://api.mihomo.me/sr_info_parsed/100000001'
    );
    expect(upstream.searchParams.get('version')).toBe('v2');
    expect(upstream.searchParams.get('language')).toBe('cn');
    expect(upstream.searchParams.has('is_force_update')).toBe(false);
    expect(upstream.searchParams.has('force')).toBe(false);
    expect(init?.method).toBe('GET');
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('User-Agent')).toBe('HSR-Database-PlayerInfo/1.0 (+https://hsrarchive.cc)');
    expect([...headers.keys()].sort()).toEqual(['accept', 'user-agent']);
  });

  it.each(['', '?uid=', '?uid=abc', '?uid=123&uid=456'])(
    'rejects invalid UID query %s without calling upstream',
    async (query) => {
      const fetchImpl = vi.fn<typeof fetch>();
      const response = await handlePlayerRequest(request(query), { fetchImpl });

      expect(response.status).toBe(400);
      expect(await errorBody(response)).toEqual({
        error: { code: 'INVALID_UID', retryable: false }
      });
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])(
    'rejects %s with JSON 405 and Allow: GET',
    async (method) => {
      const response = await handlePlayerRequest(request('?uid=100000001', method));

      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('GET');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await errorBody(response)).toEqual({
        error: { code: 'METHOD_NOT_ALLOWED', retryable: false }
      });
    }
  );

  it.each([
    [404, 'PLAYER_NOT_FOUND', false],
    [500, 'UPSTREAM_UNAVAILABLE', true],
    [503, 'UPSTREAM_UNAVAILABLE', true],
    [403, 'UPSTREAM_UNAVAILABLE', true]
  ] as const)('maps upstream %i to %s', async (status, code, retryable) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status }));
    const response = await handlePlayerRequest(request(`?uid=1000000${status}`), { fetchImpl });

    expect(response.status).toBe(code === 'PLAYER_NOT_FOUND' ? 404 : 503);
    expect(await errorBody(response)).toEqual({ error: { code, retryable } });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('maps rate limiting and standard Retry-After values without leaking the body', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(rateLimitFixture, {
        status: 429,
        headers: { 'Retry-After': '17', 'Content-Type': 'application/json' }
      })
    );
    const response = await handlePlayerRequest(request('?uid=100000429'), { fetchImpl });
    const body = await errorBody(response);

    expect(response.status).toBe(429);
    expect(body).toEqual({
      error: { code: 'RATE_LIMITED', retryable: true, retryAfterSeconds: 17 }
    });
    expect(JSON.stringify(body)).not.toContain('Too many requests');
    expect(parseRetryAfter('Fri, 18 Sep 2026 12:00:10 GMT', Date.UTC(2026, 8, 18, 12))).toBe(10);
    expect(parseRetryAfter('not-a-date')).toBeUndefined();
    expect(parseRetryAfter('999999999999999999999')).toBeUndefined();
  });

  it('recognizes an upstream queue timeout without exposing its detail', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(queueTimeoutFixture, {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    const response = await handlePlayerRequest(request('?uid=100000500'), { fetchImpl });
    const body = await errorBody(response);

    expect(response.status).toBe(504);
    expect(body).toEqual({ error: { code: 'UPSTREAM_TIMEOUT', retryable: true } });
    expect(JSON.stringify(body)).not.toContain('support channel');
  });

  it('maps AbortError and the local timeout signal to UPSTREAM_TIMEOUT', async () => {
    const aborted = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('private abort detail', 'AbortError'));
    const abortedResponse = await handlePlayerRequest(request('?uid=100000504'), {
      fetchImpl: aborted
    });
    expect(await errorBody(abortedResponse)).toEqual({
      error: { code: 'UPSTREAM_TIMEOUT', retryable: true }
    });

    const waitsForAbort = vi.fn<typeof fetch>((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('timed out', 'AbortError'));
        });
      });
    });
    const timeoutResponse = await handlePlayerRequest(request('?uid=100000505'), {
      fetchImpl: waitsForAbort,
      timeoutMs: 1
    });
    expect(timeoutResponse.status).toBe(504);
    expect(await errorBody(timeoutResponse)).toEqual({
      error: { code: 'UPSTREAM_TIMEOUT', retryable: true }
    });
  });

  it('maps network failures to UPSTREAM_UNAVAILABLE without exposing exceptions', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('private DNS detail'));
    const response = await handlePlayerRequest(request('?uid=100000503'), { fetchImpl });
    const body = await errorBody(response);

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: { code: 'UPSTREAM_UNAVAILABLE', retryable: true } });
    expect(JSON.stringify(body)).not.toContain('private DNS detail');
  });

  it.each([
    ['invalid JSON', () => new Response('{', { status: 200 })],
    [
      'invalid projected schema',
      () =>
        Response.json({
          ...(playerFixture as Record<string, unknown>),
          player: { ...((playerFixture as Record<string, unknown>).player as object), level: '70' }
        })
    ]
  ])('maps a 200 %s response to UPSTREAM_INVALID_RESPONSE', async (_label, upstream) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstream());
    const response = await handlePlayerRequest(request(`?uid=100000502${_label.length}`), {
      fetchImpl
    });

    expect(response.status).toBe(502);
    expect(await errorBody(response)).toEqual({
      error: { code: 'UPSTREAM_INVALID_RESPONSE', retryable: true }
    });
  });

  it('deduplicates concurrent requests per UID and clears the entry after settlement', async () => {
    let resolveFirst!: (response: Response) => void;
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce(playerResponse());

    const first = handlePlayerRequest(request('?uid=100000777'), { fetchImpl });
    const second = handlePlayerRequest(request('?uid=100000777'), { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledOnce();

    resolveFirst(playerResponse());
    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);

    const thirdResponse = await handlePlayerRequest(request('?uid=100000777'), { fetchImpl });
    expect(thirdResponse.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
