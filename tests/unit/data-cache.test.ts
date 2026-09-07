import { expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generatedRoot, staticGeneratedRoot } from '../../scripts/data/paths';
import {
  readDataManifest,
  validateGeneratedArtifacts
} from '../../scripts/data/generated-artifacts';
import { publishGeneratedDirectories } from '../../scripts/data/sync';

it('accepts the schema-43 dual-locale generated tree and validates every emitted artifact', async () => {
  const manifest = await readDataManifest();
  expect(manifest.schemaVersion).toBe(43);
  expect(manifest.publicLocales).toEqual(['zh-CN', 'en']);
  expect(manifest.publicLocale).toBe('zh-CN');
  expect(manifest.generatedLocales).toEqual(['zh-CN', 'en']);
  expect(manifest).not.toHaveProperty('generatorVersion');
  expect(manifest).not.toHaveProperty('generatedAt');
  expect(manifest).not.toHaveProperty('neutral');
  expect(manifest).not.toHaveProperty('migration');
  await expect(validateGeneratedArtifacts(manifest)).resolves.toBeUndefined();
}, 30_000);

it('does not publish neutral/source staging or root compatibility outputs', async () => {
  await expect(readFile(path.join(generatedRoot, 'neutral', 'source.json'))).rejects.toMatchObject({
    code: 'ENOENT'
  });
  await expect(readFile(path.join(generatedRoot, 'homepage.json'))).rejects.toMatchObject({
    code: 'ENOENT'
  });
  await expect(readFile(path.join(staticGeneratedRoot, 'meta.json'))).rejects.toMatchObject({
    code: 'ENOENT'
  });
});

it('restores every published directory when a later Windows-compatible rename fails', async () => {
  const root = await mkdtemp(path.join(process.cwd(), '.r4-publication-test-'));
  const first = path.join(root, 'first');
  const second = path.join(root, 'second');
  const firstNext = path.join(root, 'first.next');
  try {
    await Promise.all([
      mkdir(first),
      mkdir(second),
      mkdir(firstNext),
      writeFile(path.join(root, 'placeholder'), '')
    ]);
    await Promise.all([
      writeFile(path.join(first, 'value.txt'), 'old-first'),
      writeFile(path.join(second, 'value.txt'), 'old-second'),
      writeFile(path.join(firstNext, 'value.txt'), 'new-first')
    ]);
    await expect(
      publishGeneratedDirectories([
        { target: first, next: firstNext, previous: `${first}.previous` },
        { target: second, next: path.join(root, 'missing.next'), previous: `${second}.previous` }
      ])
    ).rejects.toThrow();
    await expect(readFile(path.join(first, 'value.txt'), 'utf8')).resolves.toBe('old-first');
    await expect(readFile(path.join(second, 'value.txt'), 'utf8')).resolves.toBe('old-second');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
