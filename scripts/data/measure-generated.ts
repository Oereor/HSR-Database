import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { generatedRoot, staticGeneratedRoot } from './paths.js';

export type PathMeasurement = {
  kind: 'directory' | 'file' | 'missing';
  files: number;
  bytes: number;
};

function isNotFound(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

export async function measurePath(root: string): Promise<PathMeasurement> {
  const rootStat = await stat(root).catch((error: unknown) => {
    if (isNotFound(error)) return undefined;
    throw error;
  });
  if (!rootStat) return { kind: 'missing', files: 0, bytes: 0 };
  if (rootStat.isFile()) return { kind: 'file', files: 1, bytes: rootStat.size };
  if (!rootStat.isDirectory()) throw new Error(`Unsupported generated path type: ${root}`);

  let files = 0;
  let bytes = 0;
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) {
        files += 1;
        bytes += (await stat(file)).size;
      } else throw new Error(`Unsupported generated path type: ${file}`);
    }
  }
  await visit(root);
  return { kind: 'directory', files, bytes };
}

const localeRoot = path.join(generatedRoot, 'views', 'zh-CN');
const removedCompatibilityPaths = [
  path.join(generatedRoot, 'neutral'),
  path.join(generatedRoot, 'source'),
  path.join(generatedRoot, 'catalogs'),
  path.join(generatedRoot, 'details'),
  path.join(generatedRoot, 'endgame'),
  path.join(generatedRoot, 'homepage.json'),
  path.join(generatedRoot, 'views', 'zh-CN', 'manifest.json'),
  path.join(staticGeneratedRoot, 'meta.json')
];

export async function measureGenerated() {
  return {
    generated: await measurePath(generatedRoot),
    staticGenerated: await measurePath(staticGeneratedRoot),
    removedCompatibilityPaths: await Promise.all(
      removedCompatibilityPaths.map(async (file) => ({
        path: path.relative(process.cwd(), file).replaceAll('\\', '/'),
        ...(await measurePath(file))
      }))
    ),
    payloads: {
      manifest: await measurePath(path.join(generatedRoot, 'manifest.json')),
      homepage: await measurePath(path.join(localeRoot, 'homepage.json')),
      characterCatalog: await measurePath(path.join(localeRoot, 'catalogs', 'characters.json')),
      character1001: await measurePath(path.join(localeRoot, 'details', 'characters', '1001.json')),
      search: await measurePath(path.join(staticGeneratedRoot, 'zh-CN', 'search.json'))
    }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename))
  console.log(JSON.stringify(await measureGenerated(), null, 2));
