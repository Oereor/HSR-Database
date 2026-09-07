import type { RelicSetDomain } from '../../../src/lib/domain/neutral.js';
import { parameterized, params, rows, textSource, type Raw } from './shared.js';

export interface RelicSource {
  tables: Record<string, unknown>;
}

/** Stable piece identity from the upstream symbolic RelicName key. */
export function parseRelicPieceId(value: unknown): string {
  if (typeof value !== 'string') throw new Error('RelicName must be a symbolic string');
  const match = /^RelicName_(\d+)$/.exec(value);
  if (!match) throw new Error(`Unsupported RelicName piece identity: ${value}`);
  return match[1];
}

export function buildRelicDomain(source: RelicSource): RelicSetDomain[] {
  const baseTypes = new Map(
    rows(source.tables, 'RelicBaseType').map((row) => [String(row.Type), row])
  );
  const sourceLabels = new Map<string, Raw[]>();
  for (const row of rows(source.tables, 'ItemComefrom')) {
    const id = String(row.ID);
    sourceLabels.set(id, [...(sourceLabels.get(id) ?? []), row]);
  }
  const skillsBySet = new Map<string, Raw[]>();
  for (const row of rows(source.tables, 'RelicSetSkillConfig')) {
    const id = String(row.SetID);
    skillsBySet.set(id, [...(skillsBySet.get(id) ?? []), row]);
  }
  const piecesBySet = new Map<string, Raw[]>();
  for (const row of rows(source.tables, 'RelicDataInfo')) {
    const id = String(row.SetID);
    piecesBySet.set(id, [...(piecesBySet.get(id) ?? []), row]);
  }
  return rows(source.tables, 'RelicSetConfig').map((set) => {
    const id = String(set.SetID);
    const pieces = (piecesBySet.get(id) ?? []).map((piece) => ({
      id: parseRelicPieceId(piece.RelicName),
      slot: String(piece.Type ?? ''),
      slotNameSource: textSource(baseTypes.get(String(piece.Type))?.BaseTypeText),
      nameSource: textSource(piece.RelicName),
      descriptionSource: textSource(piece.ItemBGDesc)
    }));
    const effects = (skillsBySet.get(id) ?? []).map((skill) => ({
      required: Number(skill.RequireNum) === 4 ? (4 as const) : (2 as const),
      descriptionSource: parameterized(skill.SkillDesc, skill.AbilityParamList),
      params: params(skill.AbilityParamList),
      propertyCodes: Array.isArray(skill.PropertyList) ? skill.PropertyList.map(String) : []
    }));
    const category = pieces.some((piece) => ['NECK', 'OBJECT'].includes(piece.slot))
      ? ('planar' as const)
      : ('cavern' as const);
    return {
      schemaVersion: 3,
      id,
      category,
      pieces,
      effects,
      requirements: effects.map((effect) => effect.required),
      propertyCodes: [...new Set(effects.flatMap((effect) => effect.propertyCodes))],
      releaseVersion: typeof set.ReleaseVersion === 'string' ? set.ReleaseVersion : undefined,
      assetKeys: { setId: id },
      nameSource: textSource(set.SetName),
      sourceLabelSources: (sourceLabels.get(String(set.DisplayItemID)) ?? []).flatMap(
        (row) => textSource(row.Desc) ?? []
      )
    } satisfies RelicSetDomain;
  });
}
