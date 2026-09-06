import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DataManifest, GeneratedArtifactMetadata } from '../../src/lib/domain/types.js';
import { generatedRoot, staticGeneratedRoot } from './paths.js';

export const DATA_MANIFEST_SCHEMA_VERSION = 43 as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function assertDataManifest(value: unknown): asserts value is DataManifest {
  if (!isRecord(value) || value.schemaVersion !== DATA_MANIFEST_SCHEMA_VERSION)
    throw new Error('Unsupported generated data manifest schema');
  if (
    typeof value.sourceCommit !== 'string' ||
    value.publicLocale !== 'zh-CN' ||
    JSON.stringify(value.generatedLocales) !== '["zh-CN","en"]' ||
    JSON.stringify(value.publicLocales) !== '["zh-CN","en"]' ||
    !Array.isArray(value.routePaths) ||
    value.routePaths.some((route) => typeof route !== 'string' || !route.startsWith('/')) ||
    new Set(value.routePaths).size !== value.routePaths.length ||
    !isRecord(value.locales) ||
    typeof value.dataRevision !== 'string' ||
    !isRecord(value.artifacts) ||
    !isRecord(value.counts) ||
    !isRecord(value.routes) ||
    !isRecord(value.endgame)
  )
    throw new Error('Generated data manifest is incomplete');
  for (const [locale, textMapCode] of [
    ['zh-CN', 'CHS'],
    ['en', 'EN']
  ] as const) {
    const entry = value.locales[locale];
    if (
      !isRecord(entry) ||
      entry.textMapCode !== textMapCode ||
      typeof entry.textMapDigest !== 'string' ||
      !isRecord(entry.counts) ||
      !isRecord(entry.endgame) ||
      !isRecord(entry.search) ||
      !isRecord(entry.localization) ||
      !isRecord(entry.artifacts)
    )
      throw new Error(`Generated data manifest locale is incomplete: ${locale}`);
    const health = entry.localization;
    if (
      !isRecord(health.statuses) ||
      !isRecord(health.requirements) ||
      !isRecord(health.visibility) ||
      !isRecord(health.fallbackUse) ||
      !isRecord(health.routeReachability) ||
      health.unclassified !== 0 ||
      health.invalidProgramStateErrors !== 0
    )
      throw new Error(`Generated data manifest localization health is invalid: ${locale}`);
    for (const requiredPath of [
      `views/${locale}/catalogs/characters.json`,
      `views/${locale}/catalogs/light-cones.json`,
      `views/${locale}/catalogs/relics.json`,
      `views/${locale}/catalogs/enemies.json`,
      `views/${locale}/homepage.json`,
      `views/${locale}/search-inputs.json`,
      `static/generated/${locale}/search.json`
    ])
      if (!(requiredPath in value.artifacts))
        throw new Error(`Generated data manifest is missing ${requiredPath}`);
  }
  const englishShardCount = Object.keys(value.artifacts).filter((logicalPath) =>
    logicalPath.startsWith('static/generated/en/endgame-occurrences/')
  ).length;
  const englishSearch = (value.locales.en as Record<string, unknown>).search as Record<
    string,
    unknown
  >;
  if (englishShardCount === 0 || englishShardCount !== Number(englishSearch.occurrenceShards))
    throw new Error('Generated data manifest English occurrence shards are incomplete');
}

export async function readDataManifest(root = generatedRoot): Promise<DataManifest> {
  const value: unknown = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  assertDataManifest(value);
  return value;
}

export function artifactPath(
  logicalPath: string,
  roots = { generated: generatedRoot, staticGenerated: staticGeneratedRoot }
): string {
  if (logicalPath.startsWith('static/generated/'))
    return path.join(roots.staticGenerated, logicalPath.slice('static/generated/'.length));
  return path.join(roots.generated, logicalPath);
}

function assertArtifactMetadata(
  logicalPath: string,
  value: unknown
): asserts value is GeneratedArtifactMetadata {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.bytes) ||
    Number(value.bytes) < 0 ||
    typeof value.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.sha256) ||
    (value.locale !== undefined && value.locale !== 'zh-CN' && value.locale !== 'en') ||
    (value.schemaVersion !== undefined && !Number.isSafeInteger(value.schemaVersion))
  )
    throw new Error(`Invalid generated artifact metadata: ${logicalPath}`);
}

async function artifactFiles(root: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      result.push(...(await artifactFiles(path.join(root, entry.name), relative)));
    else if (entry.isFile()) result.push(relative);
  }
  return result;
}

export async function validateGeneratedArtifacts(
  manifest: DataManifest,
  roots = { generated: generatedRoot, staticGenerated: staticGeneratedRoot }
): Promise<void> {
  const listed = Object.keys(manifest.artifacts).sort();
  for (const logicalPath of listed) {
    const metadata = manifest.artifacts[logicalPath];
    assertArtifactMetadata(logicalPath, metadata);
    const serialized = await readFile(artifactPath(logicalPath, roots));
    if (
      serialized.byteLength !== metadata.bytes ||
      createHash('sha256').update(serialized).digest('hex') !== metadata.sha256
    )
      throw new Error(`Generated artifact digest mismatch: ${logicalPath}`);
    const value: unknown = JSON.parse(serialized.toString('utf8'));
    if (
      metadata.schemaVersion !== undefined &&
      (!isRecord(value) || value.schemaVersion !== metadata.schemaVersion)
    )
      throw new Error(`Generated artifact schema mismatch: ${logicalPath}`);
  }
  const actual = [
    ...(await artifactFiles(roots.generated))
      .filter((relative) => relative !== 'manifest.json')
      .map((relative) => relative.replaceAll('\\', '/')),
    ...(await artifactFiles(roots.staticGenerated)).map(
      (relative) => `static/generated/${relative.replaceAll('\\', '/')}`
    )
  ].sort();
  if (JSON.stringify(actual) !== JSON.stringify(listed))
    throw new Error('Generated artifact manifest does not match the published JSON tree');
}

export async function refreshArtifactMetadata(
  manifest: DataManifest,
  logicalPath: string,
  roots = { generated: generatedRoot, staticGenerated: staticGeneratedRoot }
): Promise<DataManifest> {
  const file = artifactPath(logicalPath, roots);
  const serialized = await readFile(file);
  const value: unknown = JSON.parse(serialized.toString('utf8'));
  const schemaVersion =
    isRecord(value) && Number.isSafeInteger(value.schemaVersion)
      ? Number(value.schemaVersion)
      : undefined;
  const artifacts = {
    ...manifest.artifacts,
    [logicalPath]: {
      bytes: serialized.byteLength,
      sha256: createHash('sha256').update(serialized).digest('hex'),
      locale: logicalPath.includes('/en/') ? ('en' as const) : ('zh-CN' as const),
      ...(schemaVersion !== undefined ? { schemaVersion } : {})
    }
  };
  const dataRevision = createHash('sha256')
    .update(
      JSON.stringify({
        sourceCommit: manifest.sourceCommit,
        textMapDigests: Object.fromEntries(
          manifest.generatedLocales.map((locale) => [
            locale,
            manifest.locales[locale].textMapDigest
          ])
        ),
        artifacts
      })
    )
    .digest('hex');
  const locale = artifacts[logicalPath].locale;
  const locales = locale
    ? {
        ...manifest.locales,
        [locale]: {
          ...manifest.locales[locale],
          artifacts: {
            files: Object.values(artifacts).filter((entry) => entry.locale === locale).length,
            bytes: Object.values(artifacts)
              .filter((entry) => entry.locale === locale)
              .reduce((sum, entry) => sum + entry.bytes, 0)
          }
        }
      }
    : manifest.locales;
  const next = { ...manifest, locales, artifacts, dataRevision };
  await writeFile(path.join(roots.generated, 'manifest.json'), `${JSON.stringify(next)}\n`, 'utf8');
  return next;
}
