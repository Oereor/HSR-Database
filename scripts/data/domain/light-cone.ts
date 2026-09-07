import type { LightConeDomain } from '../../../src/lib/domain/neutral.js';
import { rarityFromCode } from '../../../src/lib/domain/constants.js';
import { configuredCharacterDetailIconKey } from '../character-detail-icons.js';
import { lightConeStatFields, normalizeStatProgression } from '../stats.js';
import { byId, parameterized, params, rows, textSource, type Raw } from './shared.js';

export interface LightConeSource {
  tables: Record<string, unknown>;
}

export function buildLightConeDomain(source: LightConeSource): LightConeDomain[] {
  const items = byId(rows(source.tables, 'ItemConfigEquipment'), 'ID');
  const paths = byId(rows(source.tables, 'AvatarBaseType'), 'ID');
  const properties = byId(rows(source.tables, 'AvatarPropertyConfig'), 'PropertyType');
  const promotions = new Map<string, Raw[]>();
  for (const row of rows(source.tables, 'EquipmentPromotionConfig')) {
    const id = String(row.EquipmentID);
    promotions.set(id, [...(promotions.get(id) ?? []), row]);
  }
  const skills = new Map<string, Raw[]>();
  for (const row of rows(source.tables, 'EquipmentSkillConfig')) {
    const id = String(row.SkillID);
    skills.set(id, [...(skills.get(id) ?? []), row]);
  }
  return rows(source.tables, 'EquipmentConfig').map((equipment) => {
    const id = String(equipment.EquipmentID);
    const skillId = String(equipment.SkillID ?? '');
    const levels = (skills.get(skillId) ?? []).sort(
      (a, b) => Number(a.Level ?? 1) - Number(b.Level ?? 1)
    );
    return {
      schemaVersion: 3,
      id,
      rarity: rarityFromCode(String(equipment.Rarity ?? '')) ?? 0,
      pathCode: String(equipment.AvatarBaseType ?? ''),
      nameSource: textSource(equipment.EquipmentName),
      itemNameSource: textSource(items.get(id)?.ItemName),
      descriptionSource: textSource(items.get(id)?.ItemDesc),
      pathNameSource: textSource(paths.get(String(equipment.AvatarBaseType))?.BaseTypeText),
      stats: {
        ...normalizeStatProgression(promotions.get(id) ?? [], lightConeStatFields),
        iconKeys: Object.fromEntries(
          [
            ['hp', 'MaxHP'],
            ['attack', 'Attack'],
            ['defence', 'Defence']
          ].flatMap(([field, propertyType]) => {
            const key = configuredCharacterDetailIconKey(
              'property',
              propertyType,
              properties.get(propertyType)?.IconPath,
              `AvatarPropertyConfig.${propertyType}`
            );
            return key ? [[field, key]] : [];
          })
        )
      },
      passive: {
        id: skillId,
        nameSource: textSource(levels[0]?.SkillName),
        levels: levels.map((row) => ({
          level: Number(row.Level ?? 1),
          descriptionSource: parameterized(row.SkillDesc, row.ParamList),
          params: params(row.ParamList)
        }))
      },
      storySource: textSource(items.get(id)?.ItemBGDesc),
      assetKeys: { equipmentId: id }
    } satisfies LightConeDomain;
  });
}
