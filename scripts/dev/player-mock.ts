import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import type { handlePlayerRequest } from '../../api/player.js';
import type { createEnkaPlayerClient } from '../../api/_player/enka/client.js';

type Dependencies = {
  handle: typeof handlePlayerRequest;
  createClient: typeof createEnkaPlayerClient;
};
const jsonError = (code: string, status: number) =>
  Response.json(
    { error: { code, retryable: status >= 500 } },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
const inside = (root: string, file: string) => {
  const relative = path.relative(root, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

export function validateMockFileNames(names: readonly string[]): string[] {
  const files = names.filter((name) => /^\d{9}-Enka\.json$/i.test(name));
  const identities = new Set<string>();
  for (const file of files) {
    const identity = file.slice(0, 9);
    if (identities.has(identity)) throw new Error('Duplicate mock identity');
    identities.add(identity);
  }
  return files;
}

/** Fresh file read and client for every request; never calls the network. */
export async function handleLocalPlayerRequest(
  request: Request,
  directory: string,
  deps: Dependencies
): Promise<Response> {
  if (request.method !== 'GET') return deps.handle(request, { log: () => {} });
  const values = new URL(request.url).searchParams.getAll('uid');
  if (values.length !== 1 || !/^\d{9}$/.test(values[0])) return jsonError('INVALID_UID', 400);
  const uid = values[0];
  let payload: string;
  try {
    const root = await realpath(directory);
    const files = validateMockFileNames(await readdir(root));
    const name = files.find((file) => file === `${uid}-Enka.json`);
    if (!name) return jsonError('PLAYER_NOT_FOUND', 404);
    const file = await realpath(path.join(root, name));
    if (!inside(root, file)) return jsonError('UPSTREAM_INVALID_RESPONSE', 502);
    payload = await readFile(file, 'utf8');
    const value = JSON.parse(payload) as { uid?: unknown; detailInfo?: { uid?: unknown } };
    if (
      !value ||
      String(value.uid) !== uid ||
      (value.detailInfo?.uid !== undefined && String(value.detailInfo.uid) !== uid)
    )
      return jsonError('UPSTREAM_INVALID_RESPONSE', 502);
  } catch {
    return jsonError('UPSTREAM_INVALID_RESPONSE', 502);
  }
  const response = await deps.handle(request, {
    client: deps.createClient({
      fetchImpl: async () =>
        new Response(payload, { headers: { 'Content-Type': 'application/json' } })
    }),
    log: () => {}
  });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.delete('Vercel-CDN-Cache-Control');
  response.headers.delete('CDN-Cache-Control');
  return response;
}

export function playerMockEnabled(command: string, mode: string, env: NodeJS.ProcessEnv): boolean {
  return (
    command === 'serve' &&
    mode === 'development' &&
    env.PLAYER_MOCK_ENABLED === '1' &&
    !env.CI &&
    !env.VERCEL &&
    env.NODE_ENV !== 'production'
  );
}

export function localPlayerMock(directory: string): Plugin {
  return {
    name: 'localhost-player-mock',
    apply: 'serve',
    configureServer(server) {
      if (server.config.server.host !== '127.0.0.1' && server.config.server.host !== 'localhost')
        throw new Error('Player mock requires localhost');
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        if (!['/api/player', '/api/player/'].includes(url.pathname)) return next();
        try {
          if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')) {
            res.writeHead(403);
            res.end();
            return;
          }
          const api = (await server.ssrLoadModule('/api/player.ts')) as {
            handlePlayerRequest: typeof handlePlayerRequest;
          };
          const client = (await server.ssrLoadModule('/api/_player/enka/client.ts')) as {
            createEnkaPlayerClient: typeof createEnkaPlayerClient;
          };
          const response = await handleLocalPlayerRequest(
            new Request(url, { method: req.method }),
            directory,
            { handle: api.handlePlayerRequest, createClient: client.createEnkaPlayerClient }
          );
          res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
          res.end(await response.text());
        } catch {
          res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: { code: 'UPSTREAM_UNAVAILABLE', retryable: true } }));
        }
      });
    }
  };
}
