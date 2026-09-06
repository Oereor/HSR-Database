import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DataManifest, GeneratedArtifactMetadata } from '../../src/lib/domain/types.js';
import { generatedRoot, staticGeneratedRoot } from './paths.js';

export const DATA_MANIFEST_SCHEMA_VERSION = 41 as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function assertDataManifest(value: unknown): asserts value is DataManifest {
  if (!isRecord(value) || value.schemaVersion !== DATA_MANIFEST_SCHEMA_VERSION)
    throw new Error('Unsupported generated data manifest schema');
  if (
    value.locale !== 'zh-CN' ||
    value.textMapCode !== 'CHS' ||
    typeof value.sourceCommit !== 'string' ||
    typeof value.textMapDigest !== 'string' ||
    typeof value.dataRevision !== 'string' ||
    !isRecord(value.artifacts) ||
    !isRecord(value.counts) ||
    !isRecord(value.routes) ||
    !isRecord(value.endgame)
  )
    throw new Error('Generated data manifest is incomplete');
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
    (value.locale !== undefined && value.locale !== 'zh-CN') ||
    (value.schemaVersion !== undefined && !Number.isSafeInteger(value.schemaVersion))
  )
    throw new Error(`Invalid generated artifact metadata: ${logicalPath}`);
}

async function jsonFiles(root: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      result.push(...(await jsonFiles(path.join(root, entry.name), relative)));
    else if (entry.isFile() && entry.name.endsWith('.json')) result.push(relative);
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
    ...(await jsonFiles(roots.generated))
      .filter((relative) => relative !== 'manifest.json')
      .map((relative) => relative.replaceAll('\\', '/')),
    ...(await jsonFiles(roots.staticGenerated)).map(
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
      locale: 'zh-CN' as const,
      ...(schemaVersion !== undefined ? { schemaVersion } : {})
    }
  };
  const dataRevision = createHash('sha256')
    .update(
      JSON.stringify({
        sourceCommit: manifest.sourceCommit,
        textMapDigest: manifest.textMapDigest,
        artifacts
      })
    )
    .digest('hex');
  const next = { ...manifest, artifacts, dataRevision };
  await writeFile(path.join(roots.generated, 'manifest.json'), `${JSON.stringify(next)}\n`, 'utf8');
  return next;
}
