import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCharacterNames, deriveCharacterNames } from '../../scripts/data/character-names';
import { checkOfficialSnapshot, serializeCharacterNames } from '../../scripts/data/search-names';
import {
  buildSearchDocuments,
  ensureSearchDocuments,
  type SearchBuildInputs
} from '../../scripts/data/search-documents';
import {
  validatePlayerAliases,
  type CharacterNameSnapshot,
  type PlayerAliasMetadata
} from '../../src/lib/search/name-metadata';
import { createTextResolver } from '../../scripts/data/localization';
import { createGlobalSearchService } from '../../src/lib/search/search';
import { serializePlayerAliases, syncPlayerAliasSkeleton } from '../../scripts/data/player-aliases';
import { normalizeSearchDocument } from '../../src/lib/search/documents';
import { createFlexSearchAdapter } from '../../src/lib/search/flexsearch-adapter';

const snapshot = JSON.parse(
  readFileSync('data/search/character-official-names.generated.json', 'utf8')
) as CharacterNameSnapshot;
const inputs = JSON.parse(
  readFileSync('src/lib/generated/search-inputs.json', 'utf8')
) as SearchBuildInputs;
const manual = (characters: unknown) => ({ schemaVersion: 1, characters });
const completeManual = (
  overrides: PlayerAliasMetadata['characters'] = {}
): PlayerAliasMetadata => ({
  schemaVersion: 1,
  characters: {
    ...Object.fromEntries(
      Object.keys(snapshot.characters).map((id) => [id, { playerAliases: [] }])
    ),
    ...overrides
  }
});

describe('Character search metadata', () => {
  it('derives the tracked snapshot deterministically from the same pinned data', async () => {
    const root = path.resolve(process.env.HSR_DATA_ROOT ?? '../TurnBasedGameData');
    const derived = await deriveCharacterNames(root, snapshot.sourceCommit);
    expect(serializeCharacterNames(derived.snapshot)).toBe(serializeCharacterNames(snapshot));
    expect(Object.keys(snapshot.characters)).toHaveLength(97);
    expect(snapshot.characters['1001'].canonicalName).toBe('三月七·存护');
    expect(snapshot.characters['1224'].canonicalName).toBe('三月七·巡猎');
    expect(snapshot.characters['1213'].canonicalName).toBe('丹恒•饮月');
    expect(snapshot.characters['1002'].canonicalName).toBe('丹恒');
    expect(snapshot.characters['1506'].canonicalName).toBe('银狼LV.999');
    expect(derived.displayNames['1506']).toContain('<unbreak>');
    for (const id of ['1014', '1015', '1508', '1509'])
      expect(snapshot.characters[id].canonicalSource.table).toBe('AvatarConfigLD');
    expect(snapshot.characters['1014'].canonicalName).toBe('Saber');
    expect(snapshot.characters['1015'].canonicalName).toBe('Archer');
    expect(snapshot.characters['8005'].canonicalName).toBe(
      snapshot.characters['8006'].canonicalName
    );
    for (let id = 8001; id <= 8010; id++)
      expect(snapshot.characters[String(id)].canonicalName).toMatch(/^开拓者·/);
    const aliases = Object.entries(snapshot.characters).flatMap(([id, names]) =>
      names.officialAliases.map((alias) => ({ id, ...alias }))
    );
    expect(aliases.map(({ id, value, sourceKind }) => ({ id, value, sourceKind }))).toEqual([
      { id: '1001', value: '三月七', sourceKind: 'official-base-name' },
      { id: '1224', value: '三月七', sourceKind: 'official-base-name' }
    ]);
    expect(aliases[0].textHash).toBe('6186714091647966180');
    expect(JSON.stringify(snapshot)).not.toContain('{NICKNAME}');
    expect(snapshot.characters['7213']).toBeUndefined();
    expect(snapshot.characters['1100101']).toBeUndefined();
    expect(Object.keys(snapshot.characters).some((id) => !/^\d+$/.test(id))).toBe(false);
  });

  it('does not infer aliases from another string or merge conflicting AvatarIDs', async () => {
    const text = await createTextResolver({ '1': '甲角色', '2': '巡猎', '3': '乙角色' });
    const a = {
      AvatarID: 10,
      AvatarName: { Hash: '1' },
      AvatarBaseType: 'Rogue',
      AvatarFullName: { Hash: '3' },
      AvatarVOTag: 'resource-tag'
    };
    const names = buildCharacterNames(
      [a],
      [],
      [{ ID: 'Rogue', BaseTypeText: { Hash: '2' } }],
      [],
      text,
      'fixture'
    );
    expect(names.snapshot.characters['10'].officialAliases).toEqual([]);
    expect(() =>
      buildCharacterNames([a], [{ ...a, AvatarName: { Hash: '3' } }], [], [], text, 'fixture')
    ).toThrow('冲突');
    expect(() =>
      buildCharacterNames([{ ...a, AvatarName: { Hash: '999' } }], [], [], [], text, 'fixture')
    ).toThrow('canonical');
  });

  it.each([
    manual({ '999999': { playerAliases: ['测试别名'] } }),
    manual({ '1001': { playerAliases: '测试别名' } }),
    manual({ '1001': { playerAliases: [''] } }),
    manual({ '1001': { playerAliases: [' —_/- '] } }),
    manual({ '1001': { playerAliases: ['{NICKNAME}'] } }),
    manual({ '1001': { playerAliases: ['测试', '测试'] } }),
    manual({ '1001': { playerAliases: ['测试甲', '测试-甲'] } }),
    manual({ '1001': { playerAliases: ['三月七'] } }),
    manual({ '1001': { playerAliases: ['三月七存护'] } }),
    manual({ '1001': { playerAliases: [1] } })
  ])('rejects invalid/duplicate metadata without silently dropping entries', (value) => {
    expect(() => validatePlayerAliases(value, snapshot)).toThrow();
  });

  it('allows the same synthetic player alias on two real targets and searches all match qualities', () => {
    const value = completeManual({
      '1001': { playerAliases: ['测试专用别名'] },
      '1224': { playerAliases: ['测试专用别名'] }
    });
    const bundle = buildSearchDocuments(inputs, value);
    const service = createGlobalSearchService(bundle, {
      characters: inputs.catalogs.character.map((row) => ({ ...row, rarity: 4 })),
      lightCones: [],
      relics: [],
      enemies: []
    });
    for (const q of ['测试专用别名', '测试专', '专用'])
      expect(service.search(q).results.characters.map(({ id }) => id)).toEqual(
        expect.arrayContaining(['1001', '1224'])
      );
  });

  it('detects snapshot mismatch without rewriting it', async () => {
    const dir = await mkdtemp(path.resolve('data/audit/hsr-search-snapshot-'));
    try {
      const file = path.join(dir, 'snapshot.json');
      await writeFile(file, '{}\n');
      await expect(checkOfficialSnapshot(snapshot, file)).rejects.toThrow(
        'data:search-names:update'
      );
      expect(await readFile(file, 'utf8')).toBe('{}\n');
      await writeFile(file, serializeCharacterNames(snapshot));
      await expect(checkOfficialSnapshot(snapshot, file)).resolves.toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rebuilds only runtime search on an alias-only edit and rejects invalid offline aliases', async () => {
    const dir = await mkdtemp(path.resolve('data/audit/hsr-search-rebuild-'));
    try {
      const files = {
        inputs: path.join(dir, 'inputs.json'),
        bundle: path.join(dir, 'search.json'),
        aliases: path.join(dir, 'aliases.json')
      };
      const originalInputs = JSON.stringify(inputs);
      await writeFile(files.inputs, originalInputs);
      await writeFile(files.aliases, JSON.stringify(completeManual()));
      expect(await ensureSearchDocuments(snapshot.sourceCommit, files)).toBe(true);
      const first = JSON.parse(await readFile(files.bundle, 'utf8'));
      expect(await ensureSearchDocuments(snapshot.sourceCommit, files)).toBe(false);
      await writeFile(
        files.aliases,
        JSON.stringify(completeManual({ '1001': { playerAliases: ['测试新增别名'] } }))
      );
      expect(await ensureSearchDocuments(snapshot.sourceCommit, files)).toBe(true);
      const next = JSON.parse(await readFile(files.bundle, 'utf8'));
      expect(next.sourceCommit).toBe(first.sourceCommit);
      expect(next.metadataDigest).not.toBe(first.metadataDigest);
      expect(
        createFlexSearchAdapter(next.documents.map(normalizeSearchDocument)).search('测试新增别名')
      ).toContain('character:1001');
      expect(
        next.documents.find((doc: { key: string }) => doc.key === 'character:1001').playerAliases
      ).toEqual(['测试新增别名']);
      expect(await readFile(files.inputs, 'utf8')).toBe(originalInputs);
      await writeFile(
        files.aliases,
        JSON.stringify(manual({ '999999': { playerAliases: ['测试'] } }))
      );
      await expect(ensureSearchDocuments(snapshot.sourceCommit, files)).rejects.toThrow('AvatarID');
      expect(JSON.parse(await readFile(files.bundle, 'utf8'))).toEqual(next);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('validates maintained production aliases and includes them in runtime documents', async () => {
    const raw = readFileSync('data/search/character-player-aliases.json', 'utf8');
    const value = JSON.parse(raw) as PlayerAliasMetadata;
    expect(Object.keys(value.characters).sort()).toEqual(Object.keys(snapshot.characters).sort());
    const validated = validatePlayerAliases(value, snapshot);
    const generated = buildSearchDocuments(inputs, value);
    const baseline = JSON.parse(readFileSync('static/generated/search.json', 'utf8'));
    expect(generated.documents).toEqual(baseline.documents);
    expect(generated.endgameEnemies).toEqual(baseline.endgameEnemies);
    const service = createGlobalSearchService(generated, {
      characters: inputs.catalogs.character.map((row) => ({ ...row, rarity: 4 })),
      lightCones: [],
      relics: [],
      enemies: []
    });
    for (const [id, row] of Object.entries(validated.characters)) {
      expect(
        generated.documents.find((doc) => doc.key === `character:${id}`)?.playerAliases
      ).toEqual(row.playerAliases);
      for (const alias of row.playerAliases)
        expect(service.search(alias).results.characters.map((entry) => entry.id)).toContain(id);
    }
    expect(await syncPlayerAliasSkeleton()).toBe(false);
    expect(readFileSync('data/search/character-player-aliases.json', 'utf8')).toBe(raw);
  });

  it('empty synthetic skeleton adds no labels or empty tokens', () => {
    const generated = buildSearchDocuments(inputs, completeManual());
    const normalized = generated.documents.map(normalizeSearchDocument);
    expect(
      normalized
        .flatMap((doc) => doc.labels)
        .every((label) => label.normalized !== '' && label.nameKind !== 'player')
    ).toBe(true);
    expect(createFlexSearchAdapter(normalized).search('')).toEqual(new Set());
  });

  it.each(['\n', '\r\n'])(
    'inserts IDs without changing existing JSON spelling or newlines (%j)',
    async (newline) => {
      const dir = await mkdtemp(path.resolve('data/audit/hsr-alias-splices-'));
      try {
        const files = {
          official: path.join(dir, 'official.json'),
          aliases: path.join(dir, 'manual.json')
        };
        const official = {
          ...snapshot,
          characters: Object.fromEntries(
            ['1000', '1001', '1002', '1555'].map((id) => [
              id,
              { ...snapshot.characters['1001'], canonicalName: `角色${id}`, officialAliases: [] }
            ])
          )
        };
        await writeFile(files.official, serializeCharacterNames(official));
        const oldEntry = '    "1001" : { "playerAliases" : ["B", "\\u0041", "quote\\"\\\\value"] }';
        const original = [
          '{',
          '  "schemaVersion": 1,',
          '  "characters": {',
          oldEntry,
          '  }',
          '}',
          ''
        ].join(newline);
        await writeFile(files.aliases, original);
        expect(await syncPlayerAliasSkeleton(files)).toBe(true);
        const after = await readFile(files.aliases, 'utf8');
        expect(after).toContain(oldEntry);
        expect(JSON.parse(after).characters['1001']).toEqual(
          JSON.parse(original).characters['1001']
        );
        expect(Object.keys(JSON.parse(after).characters)).toEqual(['1000', '1001', '1002', '1555']);
        if (newline === '\r\n') expect(after.replaceAll('\r\n', '')).not.toContain('\n');
        expect(await syncPlayerAliasSkeleton(files)).toBe(false);
        expect(await readFile(files.aliases, 'utf8')).toBe(after);
        await writeFile(files.aliases, '{"schemaVersion":1,"characters":{}}');
        expect(await syncPlayerAliasSkeleton(files)).toBe(true);
        expect(
          Object.keys(JSON.parse(await readFile(files.aliases, 'utf8')).characters)
        ).toHaveLength(4);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  );

  it('requires complete production coverage but preserves partial per-entry validation', () => {
    const partial = manual({ '1001': { playerAliases: [] } });
    expect(() => validatePlayerAliases(partial, snapshot)).not.toThrow();
    expect(() => buildSearchDocuments(inputs, partial)).toThrow('pnpm data:player-aliases:sync');
    const next = structuredClone(inputs);
    next.official.characters['999999'] = {
      ...snapshot.characters['1001'],
      canonicalName: '测试新角色'
    };
    expect(() => buildSearchDocuments(next, completeManual())).toThrow('999999');
  });

  it('explicit sync adds new IDs, preserves raw alias order and is byte-idempotent', async () => {
    const dir = await mkdtemp(path.resolve('data/audit/hsr-alias-sync-'));
    try {
      const files = {
        official: path.join(dir, 'official.json'),
        aliases: path.join(dir, 'manual.json')
      };
      await writeFile(files.official, serializeCharacterNames(snapshot));
      const existing = { '1001': { playerAliases: [' 测试乙 ', '测试甲'] } };
      await writeFile(files.aliases, JSON.stringify(manual(existing)));
      expect(await syncPlayerAliasSkeleton(files)).toBe(true);
      const first = await readFile(files.aliases, 'utf8');
      expect(JSON.parse(first)).toEqual(completeManual(existing));
      expect(await syncPlayerAliasSkeleton(files)).toBe(false);
      expect(await readFile(files.aliases, 'utf8')).toBe(first);
      const upstream = structuredClone(snapshot);
      upstream.characters['999999'] = {
        ...snapshot.characters['1001'],
        canonicalName: '测试新角色'
      };
      await writeFile(files.official, serializeCharacterNames(upstream));
      expect(await syncPlayerAliasSkeleton(files)).toBe(true);
      const after = JSON.parse(await readFile(files.aliases, 'utf8'));
      expect(after.characters['999999']).toEqual({ playerAliases: [] });
      expect(after.characters['1001']).toEqual(existing['1001']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('sync rejects stale IDs and malformed aliases without writing any part of the file', async () => {
    const dir = await mkdtemp(path.resolve('data/audit/hsr-alias-sync-error-'));
    try {
      const files = {
        official: path.join(dir, 'official.json'),
        aliases: path.join(dir, 'manual.json')
      };
      await writeFile(files.official, serializeCharacterNames(snapshot));
      for (const value of [
        manual({ '999999': { playerAliases: ['测试旧人工别名'] } }),
        manual({ '1001': { playerAliases: ['{NICKNAME}'] } }),
        { schemaVersion: 2, characters: {} },
        manual({ '1001': { playerAliases: 'wrong' } })
      ]) {
        const original = JSON.stringify(value);
        await writeFile(files.aliases, original);
        await expect(syncPlayerAliasSkeleton(files)).rejects.toThrow();
        expect(await readFile(files.aliases, 'utf8')).toBe(original);
      }
      await writeFile(files.aliases, JSON.stringify(manual({ '999999': { playerAliases: [] } })));
      await expect(syncPlayerAliasSkeleton(files)).rejects.toThrow('999999');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    const serialized = serializePlayerAliases({
      schemaVersion: 1,
      characters: { '9': { playerAliases: [] }, '10': { playerAliases: [] } }
    });
    expect(serialized.indexOf('"10"')).toBeLessThan(serialized.indexOf('"9"'));
  });
});
