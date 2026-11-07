import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { layoutSlugs, resolveLayout, validateGeometry, validateLayout } from './layout';

const layoutDirectory = resolve(import.meta.dirname, '../../../data/skill-tree-layouts');

function readConfig<T>(directory: string, file: string, validate: (data: unknown) => T): T {
  try {
    return validate(JSON.parse(readFileSync(resolve(directory, file), 'utf8')));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${file}: ${message}`, { cause: error });
  }
}

export function readLayouts(directory = layoutDirectory) {
  const geometry = readConfig(directory, 'geometry.json', validateGeometry);
  return layoutSlugs.map((slug) => {
    const slots = readConfig(directory, `${slug}.json`, validateLayout);
    return { slug, ...resolveLayout(slug, slots, geometry) };
  });
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { directory: { type: 'string' } } });
  try {
    for (const { slug, nodes } of readLayouts(values.directory)) {
      console.log(`${slug}: ${nodes.length} slots`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
