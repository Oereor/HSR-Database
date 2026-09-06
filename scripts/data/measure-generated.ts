import { stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { generatedRoot, staticGeneratedRoot } from './paths.js';

async function measure(root: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) {
        files += 1;
        bytes += (await stat(file)).size;
      }
    }
  }
  await visit(root);
  return { files, bytes };
}

async function bytes(file: string): Promise<number> {
  return stat(file).then(
    (value) => value.size,
    () => 0
  );
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

console.log(
  JSON.stringify(
    {
      generated: await measure(generatedRoot),
      staticGenerated: await measure(staticGeneratedRoot),
      removedCompatibilityPaths: await Promise.all(
        removedCompatibilityPaths.map(async (file) => ({
          path: path.relative(process.cwd(), file).replaceAll('\\', '/'),
          ...(await measure(file))
        }))
      ),
      payloads: {
        manifest: await bytes(path.join(generatedRoot, 'manifest.json')),
        homepage: await bytes(path.join(localeRoot, 'homepage.json')),
        characterCatalog: await bytes(path.join(localeRoot, 'catalogs', 'characters.json')),
        character1001: await bytes(path.join(localeRoot, 'details', 'characters', '1001.json')),
        search: await bytes(path.join(staticGeneratedRoot, 'zh-CN', 'search.json'))
      }
    },
    null,
    2
  )
);
