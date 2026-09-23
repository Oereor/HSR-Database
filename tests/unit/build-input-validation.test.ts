import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DataManifest, GeneratedArtifactMetadata } from '../../src/lib/domain/types';
import type { EndgameDatasetByMode } from '../../src/lib/domain/endgame';
import { computeDataRevision } from '../../scripts/data/generated-artifacts';
import { buildGeneratedRouteInventory } from '../../scripts/data/routes';
import { canonicalJsonDigest } from '../../scripts/data/source-metadata';
import { assertCrossLocaleStructuralParity } from '../../scripts/data/structural-parity';
import { validateBuildInputs } from '../../scripts/data/validation/build-inputs';
import { PLAYER_PROPERTY_SEMANTICS } from '../../src/lib/player/property-semantics';

const temporaryRoots: string[] = [];
const commit = 'a'.repeat(40);
const sourceVersion = 'OSPRODWin4.5.0_fixture';

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

interface Fixture {
  sourceRoot: string;
  generatedRoot: string;
  staticGeneratedRoot: string;
  manifest: DataManifest;
  validate(
    overrides?: Parameters<typeof validateBuildInputs>[0]
  ): ReturnType<typeof validateBuildInputs>;
  rewrite(logicalPath: string, value: unknown): Promise<void>;
  writeManifest(): Promise<void>;
}

function serialized(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value)}\n`);
}

function metadata(value: unknown, locale?: 'zh-CN' | 'en'): GeneratedArtifactMetadata {
  const bytes = serialized(value);
  const schemaVersion =
    value && typeof value === 'object' && 'schemaVersion' in value
      ? Number((value as { schemaVersion: unknown }).schemaVersion)
      : undefined;
  return {
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    locale,
    ...(Number.isSafeInteger(schemaVersion) ? { schemaVersion } : {})
  };
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(process.cwd(), '.build-input-validation-'));
  temporaryRoots.push(root);
  const sourceRoot = path.join(root, 'source');
  const generatedRoot = path.join(root, 'generated');
  const staticGeneratedRoot = path.join(root, 'static-generated');
  await Promise.all([
    mkdir(path.join(sourceRoot, 'TextMap'), { recursive: true }),
    mkdir(generatedRoot, { recursive: true }),
    mkdir(staticGeneratedRoot, { recursive: true })
  ]);
  const textMaps = {
    'zh-CN': { code: 'CHS', value: { '1': '测试' } },
    en: { code: 'EN', value: { '1': 'Test' } }
  } as const;
  await Promise.all(
    Object.values(textMaps).map(({ code, value }) =>
      writeFile(path.join(sourceRoot, 'TextMap', `TextMap${code}.json`), JSON.stringify(value))
    )
  );

  const routes = {
    characters: ['1'],
    'light-cones': ['2'],
    relics: ['3'],
    enemies: ['4']
  };
  const datasets = {
    moc: { schemaVersion: 24, mode: 'moc', groups: [{ groupId: 10 }] },
    pf: { schemaVersion: 24, mode: 'pf', groups: [{ groupId: 20 }] },
    as: { schemaVersion: 24, mode: 'as', groups: [{ groupId: 30 }] },
    aa: { schemaVersion: 24, mode: 'aa', groups: [{ groupId: 40 }] }
  } as unknown as EndgameDatasetByMode;
  const artifacts: DataManifest['artifacts'] = {};

  const fileFor = (logicalPath: string) =>
    logicalPath.startsWith('static/generated/')
      ? path.join(staticGeneratedRoot, logicalPath.slice('static/generated/'.length))
      : path.join(generatedRoot, logicalPath);
  const writeArtifact = async (logicalPath: string, value: unknown, locale?: 'zh-CN' | 'en') => {
    const file = fileFor(logicalPath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, serialized(value));
    artifacts[logicalPath] = metadata(value, locale);
  };

  for (const locale of ['zh-CN', 'en'] as const) {
    for (const [category, id] of [
      ['characters', '1'],
      ['light-cones', '2'],
      ['relics', '3'],
      ['enemies', '4']
    ] as const) {
      await writeArtifact(`views/${locale}/catalogs/${category}.json`, [{ id }], locale);
      await writeArtifact(
        `views/${locale}/details/${category}/${id}.json`,
        { id, stable: 1 },
        locale
      );
    }
    await writeArtifact(
      `views/${locale}/catalogs/relic-properties.json`,
      [{ propertyType: 'HPDelta' }],
      locale
    );
    for (const mode of ['moc', 'pf', 'as', 'aa'] as const)
      await writeArtifact(`views/${locale}/endgame/${mode}.json`, datasets[mode], locale);
    await writeArtifact(
      `views/${locale}/homepage.json`,
      { schemaVersion: 1, avatarUps: [], weaponUps: [] },
      locale
    );
    await writeArtifact(`views/${locale}/search-inputs.json`, { catalogs: {} }, locale);
    await writeArtifact(
      `static/generated/${locale}/search.json`,
      {
        schemaVersion: 3,
        normalizationVersion: 1,
        namingPolicyVersion: 1,
        sourceCommit: commit,
        metadataDigest: 'fixture',
        documents: [],
        locale,
        endgameTargets: [{ id: '4', name: 'Enemy', occurrences: [] }]
      },
      locale
    );
    await writeArtifact(
      `static/generated/${locale}/player-equipment.json`,
      {
        schemaVersion: 1,
        locale,
        lightCones: [{ id: '2' }],
        relicSets: [{ id: '3' }]
      },
      locale
    );
  }
  await writeArtifact(
    'views/en/endgame-occurrences/4',
    {
      schemaVersion: 2,
      locale: 'en',
      target: { kind: 'endgame', id: '4' },
      periods: [],
      occurrences: {}
    },
    'en'
  );
  await writeArtifact('runtime/player.json', {
    schemaVersion: 2,
    propertyTypes: Object.keys(PLAYER_PROPERTY_SEMANTICS).sort(),
    avatarPromotions: {},
    lightConePromotions: {},
    lightConeAbilities: {},
    relics: {},
    relicMainAffixes: {},
    relicSubAffixes: {},
    relicSets: {},
    traces: {},
    eidolonSkillLevels: {}
  });

  const localeEntry = (locale: 'zh-CN' | 'en') => {
    const localeArtifacts = Object.values(artifacts).filter((entry) => entry.locale === locale);
    return {
      textMapCode: textMaps[locale].code,
      textMapDigest: canonicalJsonDigest(textMaps[locale].value),
      counts: { characters: 1, lightCones: 1, relics: 1, relicProperties: 1, enemies: 1 },
      endgame: {},
      search: { documents: 0, endgameTargets: 1, occurrenceReferences: 0, occurrenceShards: 1 },
      localization: {
        total: 0,
        statuses: { available: 0, absent: 0, missing: 0, empty: 0, invalid: 0, unsupported: 0 },
        requirements: { required: 0, optional: 0 },
        visibility: { emitted: 0, hidden: 0 },
        fallbackUse: { used: 0, notUsed: 0 },
        routeReachability: { reachable: 0, unreachable: 0 },
        unclassified: 0,
        invalidProgramStateErrors: 0
      },
      artifacts: {
        files: localeArtifacts.length,
        bytes: localeArtifacts.reduce((sum, entry) => sum + entry.bytes, 0)
      }
    };
  };
  const manifest = {
    schemaVersion: 45,
    sourceCommit: commit,
    sourceVersion,
    gameVersionFull: '4.5.0',
    gameVersion: '4.5',
    generatedLocales: ['zh-CN', 'en'],
    publicLocale: 'zh-CN',
    publicLocales: ['zh-CN', 'en'],
    routePaths: buildGeneratedRouteInventory(routes, datasets).routePaths,
    locales: { 'zh-CN': localeEntry('zh-CN'), en: localeEntry('en') },
    dataRevision: '',
    artifacts,
    counts: { characters: 1, lightCones: 1, relics: 1, relicProperties: 1, enemies: 1 },
    routes,
    endgame: {}
  } as unknown as DataManifest;

  const writeManifest = async () => {
    manifest.dataRevision = computeDataRevision(manifest);
    await writeFile(path.join(generatedRoot, 'manifest.json'), serialized(manifest));
  };
  const rewrite = async (logicalPath: string, value: unknown) => {
    const locale = artifacts[logicalPath].locale;
    await writeFile(fileFor(logicalPath), serialized(value));
    artifacts[logicalPath] = metadata(value, locale);
    for (const currentLocale of ['zh-CN', 'en'] as const) {
      const localeArtifacts = Object.values(artifacts).filter(
        (entry) => entry.locale === currentLocale
      );
      manifest.locales[currentLocale].artifacts = {
        files: localeArtifacts.length,
        bytes: localeArtifacts.reduce((sum, entry) => sum + entry.bytes, 0)
      };
    }
    await writeManifest();
  };
  await writeManifest();

  return {
    sourceRoot,
    generatedRoot,
    staticGeneratedRoot,
    manifest,
    validate: (overrides = {}) =>
      validateBuildInputs({
        sourceRoot,
        generatedRoot,
        staticGeneratedRoot,
        sourceMetadata: {
          sourceCommit: commit,
          sourceVersion,
          gameVersionFull: '4.5.0',
          gameVersion: '4.5'
        },
        expectedCommit: commit,
        ...overrides
      }),
    rewrite,
    writeManifest
  };
}

describe('production build-input validation', () => {
  it('accepts a complete dual-locale fixture', async () => {
    const fixture = await createFixture();
    await expect(fixture.validate()).resolves.toMatchObject({
      manifest: { sourceCommit: commit },
      artifacts: { files: Object.keys(fixture.manifest.artifacts).length }
    });
  });

  it('rejects expected commit, prepared source version and TextMap identity drift', async () => {
    const fixture = await createFixture();
    await expect(fixture.validate({ expectedCommit: 'b'.repeat(40) })).rejects.toThrow(
      'HSR_EXPECTED_DATA_COMMIT'
    );
    await expect(
      fixture.validate({
        sourceMetadata: {
          sourceCommit: commit,
          sourceVersion: 'OSPRODWin4.6.0_fixture',
          gameVersionFull: '4.6.0',
          gameVersion: '4.6'
        }
      })
    ).rejects.toThrow('sourceVersion');
    await writeFile(path.join(fixture.sourceRoot, 'TextMap', 'TextMapEN.json'), '{"1":"Changed"}');
    await expect(fixture.validate()).rejects.toThrow('TextMap digest');
  });

  it('rejects missing, unexpected, corrupt and schema-mismatched artifacts', async () => {
    const missing = await createFixture();
    await rm(path.join(missing.generatedRoot, 'views', 'en', 'homepage.json'));
    await expect(missing.validate()).rejects.toThrow();

    const unexpected = await createFixture();
    await writeFile(path.join(unexpected.generatedRoot, 'unexpected.json'), '{}');
    await expect(unexpected.validate()).rejects.toThrow('published JSON tree');

    const corrupt = await createFixture();
    const catalog = path.join(corrupt.generatedRoot, 'views', 'en', 'catalogs', 'characters.json');
    await writeFile(catalog, '{');
    await expect(corrupt.validate()).rejects.toThrow();

    const schema = await createFixture();
    schema.manifest.artifacts['views/en/homepage.json'].schemaVersion = 9;
    await schema.writeManifest();
    await expect(schema.validate()).rejects.toThrow('schema mismatch');
  });

  it('rejects stale dataRevision and locale artifact summaries', async () => {
    const revision = await createFixture();
    revision.manifest.dataRevision = '0'.repeat(64);
    await writeFile(
      path.join(revision.generatedRoot, 'manifest.json'),
      serialized(revision.manifest)
    );
    await expect(revision.validate()).rejects.toThrow('revision');

    const summary = await createFixture();
    summary.manifest.locales.en.artifacts.bytes += 1;
    await summary.writeManifest();
    await expect(summary.validate()).rejects.toThrow('artifact summary');
  });

  it('rejects catalog/detail route closure and English shard identity drift', async () => {
    const catalog = await createFixture();
    await catalog.rewrite('views/en/catalogs/characters.json', [{ id: '9' }]);
    await expect(catalog.validate()).rejects.toThrow('catalog does not match manifest routes');

    const shard = await createFixture();
    await shard.rewrite('views/en/endgame-occurrences/4', {
      schemaVersion: 2,
      locale: 'en',
      target: { kind: 'endgame', id: '5' },
      periods: [],
      occurrences: {}
    });
    await expect(shard.validate()).rejects.toThrow('shard identity mismatch');
  });

  it('accepts schema-valid semantic detail drift after integrity metadata is refreshed', async () => {
    const fixture = await createFixture();
    await fixture.rewrite('views/en/details/characters/1.json', {
      id: '1',
      baseStats: { stages: [{ fromLevel: 1, toLevel: 20, hp: { base: 999, perLevel: 1 } }] }
    });
    await expect(fixture.validate()).resolves.toBeDefined();

    const structuralProjection = (base: number) => ({
      catalogs: { characters: [], 'light-cones': [], relics: [], enemies: [] },
      details: {
        characters: [
          {
            id: '1',
            baseStats: { stages: [{ fromLevel: 1, toLevel: 20, hp: { base, perLevel: 1 } }] }
          }
        ],
        'light-cones': [],
        relics: [],
        enemies: []
      },
      relicProperties: [],
      endgame: { datasets: { moc: {}, pf: {}, as: {}, aa: {} } },
      globalSearchIndex: { documents: [], endgameTargets: [] },
      homepage: {},
      occurrenceShards: {}
    });
    expect(() =>
      assertCrossLocaleStructuralParity(structuralProjection(100), structuralProjection(999))
    ).toThrow('Cross-locale structural mismatch');
  });
});
