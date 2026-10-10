import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { handlePlayerRequest } from '../../api/player.js';
import { createEnkaPlayerClient } from '../../api/_player/enka/client.js';
import {
  handleLocalPlayerRequest,
  playerMockEnabled,
  validateMockFileNames
} from '../../scripts/dev/player-mock.js';

describe('localhost player mock', () => {
  it('rejects duplicate identities and ignores non-exact filenames', () => {
    expect(() => validateMockFileNames(['100000001-Enka.json', '100000001-enka.json'])).toThrow(
      'Duplicate'
    );
    expect(
      validateMockFileNames([
        '100000001-Enka.json',
        '../100000002-Enka.json',
        '100000002-MiHoMo.json',
        '1000000010-Enka.json'
      ])
    ).toEqual(['100000001-Enka.json']);
  });
  it('is explicitly enabled only in local development', () => {
    const env = { PLAYER_MOCK_ENABLED: '1' };
    expect(playerMockEnabled('serve', 'development', env)).toBe(true);
    for (const [command, mode, extra] of [
      ['build', 'development', {}],
      ['serve', 'production', {}],
      ['serve', 'development', { CI: '1' }],
      ['serve', 'development', { VERCEL: '1' }],
      ['serve', 'development', { NODE_ENV: 'production' }]
    ] as const)
      expect(playerMockEnabled(command, mode, { ...env, ...extra })).toBe(false);
    expect(playerMockEnabled('serve', 'development', {})).toBe(false);
  });
  it('uses the production handler, reads fresh bytes and hides invalid file diagnostics', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'hsr-player-mock-'));
    const file = path.join(directory, '100000001-Enka.json');
    const deps = { handle: handlePlayerRequest, createClient: createEnkaPlayerClient };
    const request = (uid = '100000001', method = 'GET') =>
      new Request(`http://127.0.0.1/api/player/?uid=${uid}`, { method });
    try {
      const fixture = await readFile('tests/fixtures/enka/phase1-player.sanitized.json', 'utf8');
      await writeFile(file, fixture);
      const response = await handleLocalPlayerRequest(request(), directory, deps);
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.has('Vercel-CDN-Cache-Control')).toBe(false);
      const body = await response.json();
      expect(body.characters[0].relicScore).toMatchObject({
        version: 3,
        algorithmVersion: 2,
        build: { status: 'available' }
      });
      await writeFile(file, '{invalid private payload');
      const invalid = await handleLocalPlayerRequest(request(), directory, deps);
      expect(invalid.status).toBe(502);
      expect(await invalid.text()).not.toMatch(/private|hsr-player|payload/);
      await writeFile(file, fixture.replace('100000001', '100000002'));
      expect((await handleLocalPlayerRequest(request(), directory, deps)).status).toBe(502);
      expect((await handleLocalPlayerRequest(request('../private'), directory, deps)).status).toBe(
        400
      );
      expect((await handleLocalPlayerRequest(request('100000003'), directory, deps)).status).toBe(
        404
      );
      expect(
        (await handleLocalPlayerRequest(request('100000001', 'POST'), directory, deps)).status
      ).toBe(405);
      await writeFile(file, fixture);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
