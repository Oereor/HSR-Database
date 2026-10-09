import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { buildCharacterDomain } from '../domain/character.js';
import { buildTrainingDomain, TRAINING_TABLE_NAMES } from '../domain/training.js';
import { loadCharacterDomainTables } from '../character-sources.js';
import { readTrainingSourceTable } from '../training-sources.js';
import { projectMaterials, projectMaterialDetails } from '../projection/material.js';
import { createTextResolver } from '../localization.js';
import type { TextMap } from '../localization.js';
import type { Locale } from '../locale-registry.js';

/** Reopen raw inputs and published bytes independently of the producer. */
export async function validateTrainingSemantics(
  rawRoot: string,
  staticRoot: string,
  textMaps: Record<Locale, TextMap>
): Promise<void> {
  const [tables, extra] = await Promise.all([
    loadCharacterDomainTables(rawRoot),
    Promise.all(
      [...TRAINING_TABLE_NAMES, 'EquipmentPromotionConfig'].map(
        async (name) => [name, await readTrainingSourceTable(rawRoot, name)] as const
      )
    )
  ]);
  Object.assign(tables, Object.fromEntries(extra));
  const build = buildTrainingDomain(tables, buildCharacterDomain({ tables }).characters);
  const compare = async (relative: string, expected: unknown): Promise<void> => {
    const actual: unknown = JSON.parse(await readFile(path.join(staticRoot, relative), 'utf8'));
    if (!isDeepStrictEqual(actual, expected))
      throw new Error(`[training/semantic-mismatch] ${relative}`);
  };
  await compare('training/shared.json', build.shared);
  await Promise.all([
    ...build.characters.map((data) => compare(`training/characters/${data.avatarId}.json`, data)),
    ...build.lightCones.map((data) =>
      compare(`training/light-cones/${data.equipmentId}.json`, data)
    ),
    ...(['zh-CN', 'en'] as const).map(async (locale) => {
      const resolver = await createTextResolver(
        { locale, textMapCode: locale === 'en' ? 'EN' : 'CHS' },
        textMaps[locale]
      );
      await compare(
        `${locale}/materials.json`,
        projectMaterials(build.materials, locale, resolver)
      );
      await compare(
        `${locale}/material-details.json`,
        projectMaterialDetails(build.materials, locale, resolver)
      );
    })
  ]);
  console.log(
    `[training:semantic] characters=${build.characters.length} lightCones=${build.lightCones.length} materials=${build.materials.length}`
  );
}
