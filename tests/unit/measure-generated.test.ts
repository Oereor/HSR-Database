import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { measurePath } from '../../scripts/data/measure-generated';

const fixtures: string[] = [];

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'hsr-measure-generated-'));
  fixtures.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('generated path measurement', () => {
  it('recursively counts directory files and bytes', async () => {
    const root = await fixture();
    await mkdir(path.join(root, 'nested'));
    await writeFile(path.join(root, 'first.json'), 'abc');
    await writeFile(path.join(root, 'nested', 'second.json'), '12345');

    await expect(measurePath(root)).resolves.toEqual({
      kind: 'directory',
      files: 2,
      bytes: 8
    });
  });

  it('recognizes a file instead of silently treating it as an empty directory', async () => {
    const root = await fixture();
    const file = path.join(root, 'payload.json');
    await writeFile(file, 'payload');

    await expect(measurePath(file)).resolves.toEqual({ kind: 'file', files: 1, bytes: 7 });
  });

  it('reports an explicit missing state', async () => {
    const root = await fixture();

    await expect(measurePath(path.join(root, 'missing.json'))).resolves.toEqual({
      kind: 'missing',
      files: 0,
      bytes: 0
    });
  });
});
