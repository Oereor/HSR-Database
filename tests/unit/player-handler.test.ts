import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createEnkaPlayerClient, ENKA_USER_AGENT } from '../../api/_player/enka/client';
import { PlayerApiError } from '../../api/_player/errors';
import { handlePlayerRequest } from '../../api/player';
import { buildEnkaPlayerProfile, playerRuntimeData } from '../../api/_player/enka/pipeline';
import { presentCanonicalPlayerProfile } from '../../src/lib/player/stat-synthesis';

let fixture: Record<string, unknown>;

function request(query = '?uid=100000001', method = 'GET'): Request {
  return new Request(`https://hsrarchive.cc/api/player/${query}`, { method });
}

async function errorBody(response: Response): Promise<{
  error: { code: string; retryable: boolean; retryAfterSeconds?: number };
}> {
  return (await response.json()) as {
    error: { code: string; retryable: boolean; retryAfterSeconds?: number };
  };
}

beforeAll(async () => {
  fixture = JSON.parse(
    await readFile('tests/fixtures/enka/phase1-player.sanitized.json', 'utf8')
  ) as Record<string, unknown>;
});

describe('Enka player Function handler', () => {
  it('serves a profile with an unascended light cone from the compatibility fixture', async () => {
    const source = JSON.parse(
      await readFile('tests/fixtures/enka/compatibility-missing-promotion.sanitized.json', 'utf8')
    ) as { detailInfo: { avatarDetailList: Array<{ equipment?: Record<string, unknown> }> } };
    const log = vi.fn();
    const fetchImpl = vi.fn(async () => Response.json(source));
    const client = createEnkaPlayerClient({ fetchImpl });
    const response = await handlePlayerRequest(request('?uid=100000101'), { client, log });
    const body = (await response.json()) as { uid: string; characters: unknown[] };

    expect(response.status).toBe(200);
    expect(body.uid).toBe('100000101');
    expect(body.characters).toHaveLength(7);
    expect(log).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'decode_error' }));
    expect(JSON.stringify(body)).not.toContain(
      'detailInfo.avatarDetailList[4].equipment.promotion'
    );

    source.detailInfo.avatarDetailList[4].equipment!.promotion = null;
    const invalidResponse = await handlePlayerRequest(request('?uid=100000101'), {
      client: createEnkaPlayerClient({ fetchImpl: vi.fn(async () => Response.json(source)) }),
      log
    });
    const invalidBody = await errorBody(invalidResponse);
    expect(invalidResponse.status).toBe(502);
    expect(invalidBody).toMatchObject({ error: { code: 'UPSTREAM_INVALID_RESPONSE' } });
    expect(JSON.stringify(invalidBody)).not.toContain(
      'detailInfo.avatarDetailList[4].equipment.promotion'
    );
    expect(log).toHaveBeenCalledWith({
      event: 'decode_error',
      code: 'UPSTREAM_INVALID_RESPONSE',
      diagnostic: 'detailInfo.avatarDetailList[4].equipment.promotion'
    });
  });

  it('runs the Enka pipeline and preserves the public response contract', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(fixture));
    const log = vi.fn();
    const response = await handlePlayerRequest(request('?uid=%20100000001%20'), {
      client: createEnkaPlayerClient({ fetchImpl }),
      log
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate');
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe(
      'public, s-maxage=300, stale-while-revalidate=600'
    );
    const body = (await response.json()) as {
      uid: string;
      characters: Array<Record<string, unknown>>;
    };
    expect(body.uid).toBe('100000001');
    expect(body.characters).toHaveLength(6);
    expect(body.characters[0]).toMatchObject({
      buildId: expect.stringContaining('area:assist:'),
      display: { area: 'assist', sourceOrder: 0 },
      stats: expect.any(Array)
    });
    expect(body.characters[0].relicScore).toMatchObject({
      version: 1,
      build: { status: 'available', score: expect.any(Number) },
      pieces: { HEAD: { status: 'available', score: expect.any(Number) } }
    });
    const withoutScores = structuredClone(body);
    withoutScores.characters.forEach((character) => delete character.relicScore);
    expect(withoutScores).toEqual(
      presentCanonicalPlayerProfile(buildEnkaPlayerProfile(fixture).canonical, playerRuntimeData)
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [input, init] = fetchImpl.mock.calls[0];
    expect(String(input)).toBe('https://enka.network/api/hsr/uid/100000001/');
    expect(new Headers(init?.headers).get('User-Agent')).toBe(ENKA_USER_AGENT);
    expect(log).not.toHaveBeenCalled();
  });

  it('returns a successful profile when no characters are public', async () => {
    const empty = structuredClone(fixture) as {
      detailInfo: Record<string, unknown>;
    };
    empty.detailInfo.avatarDetailList = [];
    const response = await handlePlayerRequest(request(), {
      client: createEnkaPlayerClient({ fetchImpl: vi.fn(async () => Response.json(empty)) }),
      log: vi.fn()
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ uid: '100000001', characters: [] });
  });

  it('serves a privacy-restricted profile with no showcased characters or records', async () => {
    const sparse = structuredClone(fixture) as { detailInfo: Record<string, unknown> };
    delete sparse.detailInfo.avatarDetailList;
    delete sparse.detailInfo.recordInfo;
    const log = vi.fn();
    const response = await handlePlayerRequest(request(), {
      client: createEnkaPlayerClient({ fetchImpl: vi.fn(async () => Response.json(sparse)) }),
      log
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      uid: '100000001',
      characters: [],
      characterCount: null,
      lightConeCount: null,
      achievementCount: null
    });
    expect(log).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'decode_error' }));
  });

  it.each(['', '?uid=', '?uid=abc', '?uid=123&uid=456'])(
    'rejects invalid UID query %s without calling upstream',
    async (query) => {
      const fetchPlayerProfile = vi.fn();
      const response = await handlePlayerRequest(request(query), {
        client: { fetchPlayerProfile, clear: vi.fn() },
        log: vi.fn()
      });

      expect(response.status).toBe(400);
      expect(await errorBody(response)).toEqual({
        error: { code: 'INVALID_UID', retryable: false }
      });
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(fetchPlayerProfile).not.toHaveBeenCalled();
    }
  );

  it('keeps method and typed-error envelopes stable without leaking diagnostics', async () => {
    const methodResponse = await handlePlayerRequest(request('?uid=100000001', 'POST'));
    expect(methodResponse.status).toBe(405);
    expect(methodResponse.headers.get('Allow')).toBe('GET');

    const log = vi.fn();
    const response = await handlePlayerRequest(request('?uid=100000429'), {
      client: {
        fetchPlayerProfile: vi.fn(async () => {
          throw new PlayerApiError('RATE_LIMITED', 17, 'private diagnostic');
        }),
        clear: vi.fn()
      },
      log
    });
    const body = await errorBody(response);
    expect(response.status).toBe(429);
    expect(body).toEqual({
      error: { code: 'RATE_LIMITED', retryable: true, retryAfterSeconds: 17 }
    });
    expect(JSON.stringify(body)).not.toContain('private diagnostic');
    expect(log).toHaveBeenCalledWith({
      event: 'rate_limit',
      code: 'RATE_LIMITED',
      diagnostic: 'private diagnostic'
    });
  });

  it.each([
    ['UPSTREAM_TIMEOUT', 'timeout'],
    ['UPSTREAM_INVALID_RESPONSE', 'decode_error'],
    ['UPSTREAM_UNAVAILABLE', 'upstream_error']
  ] as const)('logs %s with the %s event taxonomy', async (code, event) => {
    const log = vi.fn();
    await handlePlayerRequest(request(), {
      client: {
        fetchPlayerProfile: vi.fn(async () => {
          throw new PlayerApiError(code);
        }),
        clear: vi.fn()
      },
      log
    });

    expect(log).toHaveBeenCalledWith({ event, code });
  });

  it('keeps unknown entities visible and emits structured synthesis diagnostics', async () => {
    const source = structuredClone(fixture) as {
      detailInfo: { avatarDetailList: Array<Record<string, unknown>> };
    };
    source.detailInfo.avatarDetailList[0].avatarId = 999999;
    const log = vi.fn();
    const response = await handlePlayerRequest(request(), {
      client: createEnkaPlayerClient({ fetchImpl: vi.fn(async () => Response.json(source)) }),
      log
    });
    const body = (await response.json()) as {
      characters: Array<{ characterId: string; stats: unknown[] }>;
    };

    expect(response.status).toBe(200);
    expect(body.characters[0]).toMatchObject({ characterId: '999999', stats: [] });
    expect(log.mock.calls).toEqual(
      expect.arrayContaining([
        [{ event: 'synthesis_failure' }],
        [{ event: 'unknown_entity', code: 'UNKNOWN_AVATAR', sourceId: '999999' }]
      ])
    );
  });

  it('isolates an unexpected scoring failure from a successful Player Info response', async () => {
    const log = vi.fn();
    const response = await handlePlayerRequest(request(), {
      client: createEnkaPlayerClient({ fetchImpl: vi.fn(async () => Response.json(fixture)) }),
      scoreCharacter: () => {
        throw new Error('private scoring diagnostic');
      },
      log
    });
    const body = (await response.json()) as {
      characters: Array<{ relicScore: { build: unknown; pieces: Record<string, unknown> } }>;
    };
    expect(response.status).toBe(200);
    expect(body.characters[0].relicScore.build).toEqual({
      status: 'unavailable',
      reason: 'score-unavailable'
    });
    expect(body.characters[0].relicScore.pieces.HEAD).toEqual({
      status: 'unavailable',
      reason: 'score-unavailable'
    });
    expect(JSON.stringify(body)).not.toContain('private scoring diagnostic');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'scoring_failure',
        diagnostic: 'private scoring diagnostic'
      })
    );
  });
});
