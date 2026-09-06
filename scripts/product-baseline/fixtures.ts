import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { siteRoot } from '../data/paths.js';
import { canonicalJson } from './canonical.js';
import type { ProductBaselineCapture, StableEntityArea } from './model.js';

export const productBaselineFixtureRoot = path.join(
  siteRoot,
  'tests',
  'fixtures',
  'product-baseline',
  'zh-CN'
);

async function readJson<T>(...segments: string[]): Promise<T> {
  return JSON.parse(
    await readFile(path.join(productBaselineFixtureRoot, ...segments), 'utf8')
  ) as T;
}

async function writeJson(value: unknown, ...segments: string[]): Promise<void> {
  const file = path.join(productBaselineFixtureRoot, ...segments);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${canonicalJson(value, true)}\n`, 'utf8');
}

async function writeCompactJson(value: unknown, ...segments: string[]): Promise<void> {
  const file = path.join(productBaselineFixtureRoot, ...segments);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${canonicalJson(value)}\n`, 'utf8');
}

async function writeStableArea(name: string, area: StableEntityArea): Promise<void> {
  await writeJson(area.order, name, 'catalog-order.json');
  await Promise.all(
    area.order.map((id) => writeJson(area.entities[id], name, 'entities', `${id}.json`))
  );
}

async function readStableArea(name: string): Promise<StableEntityArea> {
  const order = await readJson<string[]>(name, 'catalog-order.json');
  return {
    order,
    entities: Object.fromEntries(
      await Promise.all(
        order.map(async (id) => [id, await readJson(name, 'entities', `${id}.json`)])
      )
    )
  };
}

export async function writeProductBaselineFixtures(
  capture: ProductBaselineCapture,
  approvalReason: string
): Promise<void> {
  if (!approvalReason.trim()) throw new Error('Product baseline approval reason must not be empty');
  if (!productBaselineFixtureRoot.startsWith(path.join(siteRoot, 'tests', 'fixtures') + path.sep))
    throw new Error('Refusing to replace a product baseline outside tests/fixtures');
  await rm(productBaselineFixtureRoot, { recursive: true, force: true });
  await mkdir(productBaselineFixtureRoot, { recursive: true });
  await writeJson({ ...capture.metadata, approvalReason: approvalReason.trim() }, 'metadata.json');
  await writeStableArea('characters', capture.characters);
  await writeStableArea('light-cones', capture.lightCones);
  await writeStableArea('relics', capture.relics);
  await writeJson(capture.relics.properties, 'relics', 'properties.json');
  await writeStableArea('enemies', capture.enemies);
  for (const [name, registry] of Object.entries(capture.enemies.registries))
    await writeCompactJson(registry, 'enemies', 'registries', `${name}.json`);
  for (const [mode, value] of Object.entries(capture.endgame.modes)) {
    await writeJson(value.order, 'endgame', 'modes', mode, 'group-order.json');
    await writeJson(value.recommendations, 'endgame', 'modes', mode, 'recommendations.json');
    await Promise.all(
      value.order.map((id) =>
        writeJson(value.groups[id], 'endgame', 'modes', mode, 'groups', `${id}.json`)
      )
    );
  }
  for (const [name, registry] of Object.entries(capture.endgame.registries))
    await writeCompactJson(registry, 'endgame', 'registries', `${name}.json`);
  await writeJson(capture.homepage, 'homepage.json');
  await writeCompactJson(capture.search, 'search.json');
  await writeJson(capture.unresolvedLocalization, 'unresolved-localization.json');
  await writeJson(capture.characterIcons, 'character-icons.json');
}

export async function readProductBaselineFixtures(): Promise<ProductBaselineCapture> {
  const metadata = await readJson<ProductBaselineCapture['metadata']>('metadata.json');
  const characters = await readStableArea('characters');
  const lightCones = await readStableArea('light-cones');
  const relicArea = await readStableArea('relics');
  const enemyArea = await readStableArea('enemies');
  const modes = Object.fromEntries(
    await Promise.all(
      ['moc', 'pf', 'as', 'aa'].map(async (mode) => {
        const order = await readJson<string[]>('endgame', 'modes', mode, 'group-order.json');
        return [
          mode,
          {
            order,
            recommendations: await readJson('endgame', 'modes', mode, 'recommendations.json'),
            groups: Object.fromEntries(
              await Promise.all(
                order.map(async (id) => [
                  id,
                  await readJson('endgame', 'modes', mode, 'groups', `${id}.json`)
                ])
              )
            )
          }
        ];
      })
    )
  );
  return {
    metadata,
    characters,
    lightCones,
    relics: { ...relicArea, properties: await readJson('relics', 'properties.json') },
    enemies: {
      ...enemyArea,
      registries: {
        templates: await readJson('enemies', 'registries', 'templates.json'),
        monsters: await readJson('enemies', 'registries', 'monsters.json'),
        skills: await readJson('enemies', 'registries', 'skills.json'),
        summons: await readJson('enemies', 'registries', 'summons.json'),
        statSeries: await readJson('enemies', 'registries', 'statSeries.json')
      }
    },
    endgame: {
      modes,
      registries: {
        occurrences: await readJson('endgame', 'registries', 'occurrences.json'),
        mechanics: await readJson('endgame', 'registries', 'mechanics.json'),
        presentedOccurrences: await readJson('endgame', 'registries', 'presentedOccurrences.json')
      }
    },
    homepage: await readJson('homepage.json'),
    search: await readJson('search.json'),
    unresolvedLocalization: await readJson('unresolved-localization.json'),
    characterIcons: await readJson('character-icons.json')
  };
}
