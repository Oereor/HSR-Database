import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  resolveConnections,
  validateConnectionLayouts
} from '../../../src/lib/domain/training/skill-tree-connections.js';
import {
  cropHalfSize,
  layoutSlugs,
  resolveLayout,
  validateGeometry,
  validateLayout
} from '../../../src/lib/domain/training/skill-tree-layout.js';

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
  const connections = readConfig(directory, 'connections.json', validateConnectionLayouts);
  return layoutSlugs.map((slug) => {
    const slots = readConfig(directory, `${slug}.json`, validateLayout);
    const layout = resolveLayout(slug, slots, geometry);
    try {
      return {
        slug,
        ...layout,
        halfSize: cropHalfSize(layout.nodes),
        connections: resolveConnections(connections[slug], slots)
      };
    } catch (error) {
      throw new Error(`connections.json (${slug}): ${(error as Error).message}`, { cause: error });
    }
  });
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { directory: { type: 'string' } } });
  try {
    for (const { slug, nodes, connections } of readLayouts(values.directory)) {
      console.log(`${slug}: ${nodes.length} slots, ${connections.length} paths`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
