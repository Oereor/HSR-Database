import type {
  RogueBaseResonance,
  RogueBlessing,
  RogueBlessingLevel,
  RogueCrossResonance,
  RogueDuDataset,
  RogueEffect,
  RogueEquation,
  RogueManifestSummary,
  RoguePath,
  RogueRawBlessingCategory,
  RogueRawFormulaCategory,
  RogueResonanceEnhancement,
  RogueResonanceEnhancementGroup,
  RogueSuDataset
} from '../../src/lib/domain/rogue.js';
import {
  blessingTier,
  equationTier,
  resonanceTier
} from '../../src/lib/domain/rogue-presentation.js';
import { decimalOf } from './decimal.js';
import { createExtraEffectResolver } from './extra-effects.js';
import type { TextResolver, TextSource } from './localization.js';
import { readTable } from './raw.js';
import { formatGameMarkup } from './text.js';

type Raw = Record<string, any>;

const PATH_CODES: Readonly<Record<number, { code: string; assetAvailable: boolean }>> = {
  120: { code: 'Knight', assetAvailable: true },
  121: { code: 'Memory', assetAvailable: true },
  122: { code: 'Warlock', assetAvailable: true },
  123: { code: 'Priest', assetAvailable: true },
  124: { code: 'Rogue', assetAvailable: true },
  125: { code: 'Warrior', assetAvailable: true },
  126: { code: 'Elation', assetAvailable: true },
  127: { code: 'Propagation', assetAvailable: false },
  128: { code: 'Mage', assetAvailable: true },
  129: { code: 'Shaman', assetAvailable: true }
};

const blessingCategories = new Set<RogueRawBlessingCategory>(['Common', 'Rare', 'Legendary']);
const formulaCategories = new Set<RogueRawFormulaCategory>([
  'Rare',
  'Epic',
  'Legendary',
  'PathEcho'
]);

export interface RogueBuildAudit {
  summary: RogueManifestSummary;
  relations: {
    suBlessingLevels: number;
    duBlessingLevels: number;
    formulaMazeBuffs: number;
    resonanceEffects: number;
    extraEffectReferences: number;
  };
  orderingFallback: 'source-index';
  notes: string[];
}

export interface RogueBuildResult {
  datasets: { su: RogueSuDataset; du: RogueDuDataset };
  audit: RogueBuildAudit;
}

function uniqueIndex(rows: Raw[], key: string, label: string): Map<string, Raw> {
  const result = new Map<string, Raw>();
  for (const row of rows) {
    const id = String(row[key] ?? '');
    if (!id) throw new Error(`${label} 包含空主键`);
    if (result.has(id)) throw new Error(`${label} 存在重复主键：${id}`);
    result.set(id, row);
  }
  return result;
}

function groupBy(rows: Raw[], key: string): Map<string, Raw[]> {
  const result = new Map<string, Raw[]>();
  for (const row of rows) {
    const id = String(row[key] ?? '');
    result.set(id, [...(result.get(id) ?? []), row]);
  }
  return result;
}

function source(entity: string, id: string | number, field: string): TextSource {
  return { entity, id: String(id), field };
}

function exact<T>(items: T[], message: string): T {
  if (items.length !== 1) throw new Error(`${message}：期望 1 条，实际 ${items.length} 条`);
  return items[0];
}

function rawNumbers(value: unknown): number[] {
  return Array.isArray(value) ? value.map((item) => Number(item)) : [];
}

function pathOrder(aeons: Raw[]): Map<number, number> {
  const result = new Map<number, number>();
  for (const aeon of aeons) result.set(Number(aeon.RogueBuffType), Number(aeon.Sort));
  result.set(129, 10);
  return result;
}

async function loadTables(root: string) {
  const names = [
    'RogueBuff',
    'RogueBuffGroup',
    'RogueBuffType',
    'RogueTournBuff',
    'RogueTournBuffGroup',
    'RogueTournBuffType',
    'RogueMazeBuff',
    'RogueAeon',
    'RogueDLCAeon',
    'RogueNousAeon',
    'RogueDLCAeonCross',
    'RogueNousAeonCross',
    'RogueTournFormula',
    'RogueTournFormulaDisplay',
    'ExtraEffectConfig'
  ] as const;
  const rows = await Promise.all(names.map((name) => readTable<Raw>(root, name)));
  return Object.fromEntries(names.map((name, index) => [name, rows[index]])) as Record<
    (typeof names)[number],
    Raw[]
  >;
}

export async function buildRogueData(root: string, text: TextResolver): Promise<RogueBuildResult> {
  const tables = await loadTables(root);
  const aeonOrder = pathOrder(tables.RogueAeon);
  const tournTypes = uniqueIndex(tables.RogueTournBuffType, 'RogueBuffType', 'RogueTournBuffType');
  const paths = new Map<number, RoguePath>();
  for (const [rawType, presentation] of Object.entries(PATH_CODES)) {
    const type = Number(rawType);
    const row = tournTypes.get(String(type));
    if (!row) throw new Error(`RogueTournBuffType 缺少 Path ${type}`);
    const name = text.resolveRef(
      row.RogueBuffTypeName,
      source('RogueTournBuffType', type, 'RogueBuffTypeName')
    );
    if (!name) throw new Error(`Rogue Path ${type} 缺少简中名称`);
    paths.set(type, {
      rawType: type,
      code: presentation.code,
      name,
      order: aeonOrder.get(type) ?? 100 + tables.RogueTournBuffType.indexOf(row),
      assetAvailable: presentation.assetAvailable
    });
  }
  const pathOf = (rawType: unknown): RoguePath => {
    const path = paths.get(Number(rawType));
    if (!path) throw new Error(`未知 Rogue Path type：${String(rawType)}`);
    return path;
  };

  const mazeRows = new Map<string, Raw>();
  for (const row of tables.RogueMazeBuff) {
    const key = `${row.ID}:${row.Lv === undefined ? 'default' : row.Lv}`;
    if (mazeRows.has(key)) throw new Error(`RogueMazeBuff 存在重复 level identity：${key}`);
    mazeRows.set(key, row);
  }
  const effectOf = (mazeBuffId: number, level: number, owner: string): RogueEffect => {
    const row = mazeRows.get(`${mazeBuffId}:${level}`);
    if (!row) throw new Error(`${owner} 无法解析 RogueMazeBuff ${mazeBuffId}:Lv${level}`);
    const params = (row.ParamList ?? []).map((value: unknown, index: number) =>
      decimalOf(value, `RogueMazeBuff.${mazeBuffId}.Lv${level}.ParamList[${index}]`)
    );
    const name = text.resolveRef(
      row.BuffName,
      source('RogueMazeBuff', `${mazeBuffId}:${level}`, 'BuffName')
    );
    const template = text.resolveRef(
      row.BuffDesc,
      source('RogueMazeBuff', `${mazeBuffId}:${level}`, 'BuffDesc')
    );
    const formatted = formatGameMarkup(
      template,
      params.map((value) => Number(value))
    );
    if (!name || !formatted.text)
      throw new Error(`${owner} 的 RogueMazeBuff ${mazeBuffId}:Lv${level} 缺少展示文本`);
    if (formatted.diagnostics.length)
      throw new Error(
        `${owner} 的 RogueMazeBuff ${mazeBuffId}:Lv${level} 参数插值失败：${formatted.diagnostics[0].placeholder}`
      );
    return {
      mazeBuffId,
      name,
      description: formatted.text,
      params,
      ...(row.BuffIcon ? { upstreamIconPath: String(row.BuffIcon) } : {})
    };
  };

  let extraEffectReferences = 0;
  const extraEffects = createExtraEffectResolver(
    tables.ExtraEffectConfig,
    (ref, textSource) => text.resolveRef(ref, textSource),
    {
      onUnresolved(id, owner) {
        throw new Error(`${owner.entity}:${owner.id ?? ''} 引用了不存在的 ExtraEffect ${id}`);
      },
      onNotDisplayReady(id, owner) {
        throw new Error(`${owner.entity}:${owner.id ?? ''} 的 ExtraEffect ${id} 缺少展示文本`);
      },
      onDescriptionDiagnostics(id, diagnostics) {
        if (diagnostics.length)
          throw new Error(`ExtraEffect ${id} 参数插值失败：${diagnostics[0].placeholder}`);
      }
    }
  );
  const resolveExtraEffects = (ids: unknown[], entity: string, id: string, field: string) => {
    extraEffectReferences += ids.length;
    const resolved = extraEffects.resolve(ids, { ownerEntity: entity, ownerId: id, field });
    if (resolved.length !== ids.length)
      throw new Error(`${entity}:${id} 的 ExtraEffect relation 未完整解析`);
    return resolved;
  };

  const suGroups = uniqueIndex(tables.RogueBuffGroup, 'GMLOGNJAIGI', 'RogueBuffGroup');
  const suTagOrder = new Map<number, number>();
  for (const rawType of Object.keys(PATH_CODES)
    .map(Number)
    .filter((type) => type <= 128)) {
    const row = suGroups.get(String(rawType * 100));
    if (!row) throw new Error(`RogueBuffGroup 缺少 Path 展示组 ${rawType * 100}`);
    rawNumbers(row.HECJCAMDGNO).forEach((tag, index) => suTagOrder.set(tag, index));
  }

  const ordinarySuRows = tables.RogueBuff.filter(
    (row) =>
      row.IsShow === true &&
      !row.BattleEventBuffType &&
      Number(row.RogueBuffType) >= 120 &&
      Number(row.RogueBuffType) <= 128 &&
      blessingCategories.has(row.RogueBuffCategory)
  );
  const suBlessings: RogueBlessing[] = [...groupBy(ordinarySuRows, 'MazeBuffID')].map(
    ([mazeId, rawLevels], sourceIndex) => {
      const levels = [...rawLevels].sort(
        (a, b) => Number(a.MazeBuffLevel) - Number(b.MazeBuffLevel)
      );
      if (
        levels.length !== 2 ||
        Number(levels[0].MazeBuffLevel) !== 1 ||
        Number(levels[1].MazeBuffLevel) !== 2
      )
        throw new Error(`RogueBuff:${mazeId} 必须恰好具有 Lv1/Lv2`);
      const first = levels[0];
      if (
        levels.some(
          (row) =>
            row.RogueBuffType !== first.RogueBuffType ||
            row.RogueBuffCategory !== first.RogueBuffCategory ||
            row.ActivityModuleID !== first.ActivityModuleID
        )
      )
        throw new Error(`RogueBuff:${mazeId} 的 level metadata 不一致`);
      const path = pathOf(first.RogueBuffType);
      const normalizedLevels = levels.map((row) => ({
        level: Number(row.MazeBuffLevel) as 1 | 2,
        rawTag: Number(row.RogueBuffTag),
        effect: effectOf(Number(mazeId), Number(row.MazeBuffLevel), `RogueBuff:${mazeId}`)
      })) as [RogueBlessingLevel, RogueBlessingLevel];
      const rawCategory = first.RogueBuffCategory as RogueRawBlessingCategory;
      return {
        id: `RogueBuff:${Number(mazeId)}`,
        sourceFamily: 'RogueBuff',
        mazeBuffId: Number(mazeId),
        rawCategory,
        tier: blessingTier(rawCategory),
        path,
        ...(first.ActivityModuleID ? { introducedByModule: Number(first.ActivityModuleID) } : {}),
        levels: normalizedLevels,
        extraEffects: resolveExtraEffects(
          first.ExtraEffectIDList ?? [],
          'RogueBuff',
          mazeId,
          'ExtraEffectIDList'
        ),
        order:
          path.order * 10_000 + (suTagOrder.get(Number(first.RogueBuffTag)) ?? 5_000 + sourceIndex)
      };
    }
  );
  suBlessings.sort((a, b) => a.order - b.order);
  if (suBlessings.length !== 162)
    throw new Error(`SU ordinary Blessing 数量错误：${suBlessings.length}`);

  const specialByTag = new Map<number, Raw>(
    tables.RogueBuff.filter((row) => row.BattleEventBuffType).map((row) => [
      Number(row.RogueBuffTag),
      row
    ])
  );
  const groupTags = (groupId: number): number[] => {
    const group = suGroups.get(String(groupId));
    if (!group) throw new Error(`RogueBuffGroup ${groupId} 不存在`);
    return rawNumbers(group.HECJCAMDGNO);
  };
  const specialEffect = (row: Raw, owner: string) =>
    effectOf(Number(row.MazeBuffID), Number(row.MazeBuffLevel ?? 1), owner);
  const specialExtras = (row: Raw, owner: string) =>
    resolveExtraEffects(row.ExtraEffectIDList ?? [], 'RogueBuff', owner, 'ExtraEffectIDList');

  const baseResonances: RogueBaseResonance[] = [];
  const enhancementGroups: RogueResonanceEnhancementGroup[] = [];
  for (const aeon of [...tables.RogueAeon].sort((a, b) => Number(a.Sort) - Number(b.Sort))) {
    const aeonId = Number(aeon.AeonID);
    const path = pathOf(aeon.RogueBuffType);
    const baseTag = exact(
      groupTags(Number(aeon.BattleEventBuffGroup)),
      `Aeon ${aeonId} base group`
    );
    const baseRow = specialByTag.get(baseTag);
    if (!baseRow || baseRow.BattleEventBuffType !== 'BattleEventBuff')
      throw new Error(`Aeon ${aeonId} base resonance relation 无法解析`);
    baseResonances.push({
      id: `RogueAeon:${aeonId}`,
      kind: 'base',
      aeonId,
      path,
      effect: specialEffect(baseRow, `RogueAeon:${aeonId}`),
      extraEffects: specialExtras(baseRow, String(baseRow.MazeBuffID)),
      tier: resonanceTier(),
      order: path.order * 10_000 + 1_000
    });
    const enhancementTags = groupTags(Number(aeon.BattleEventEnhanceBuffGroup));
    if (enhancementTags.length !== 3)
      throw new Error(`Aeon ${aeonId} 回响构音必须恰好包含三项 effect`);
    const enhancements = enhancementTags.map((tag, index) => {
      const row = specialByTag.get(tag);
      if (!row || row.BattleEventBuffType !== 'BattleEventBuffEnhance')
        throw new Error(`Aeon ${aeonId} enhancement ${index + 1} 无法解析`);
      return {
        id: `RogueBuff:${Number(row.MazeBuffID)}`,
        rawOrder: index,
        effect: specialEffect(row, `RogueAeonEnhancements:${aeonId}`),
        extraEffects: specialExtras(row, String(row.MazeBuffID))
      } satisfies RogueResonanceEnhancement;
    }) as RogueResonanceEnhancementGroup['effects'];
    enhancementGroups.push({
      id: `RogueAeonEnhancements:${aeonId}`,
      kind: 'enhancement-group',
      aeonId,
      path,
      effects: enhancements,
      tier: resonanceTier(),
      order: path.order * 10_000 + 2_000
    });
  }

  const buildCrosses = (
    rows: Raw[],
    family: 'RogueDLCAeonCross' | 'RogueNousAeonCross',
    availableIn: 'swarm-disaster' | 'gold-and-gears'
  ): RogueCrossResonance[] =>
    rows.map((owner, index) => {
      const mainAeonId = Number(owner.MainAeonID);
      const subAeonId = Number(owner.SubAeonID);
      const tag = exact(groupTags(Number(owner.BuffGroup)), `${family}:${mainAeonId}:${subAeonId}`);
      const row = specialByTag.get(tag);
      if (!row || row.BattleEventBuffType !== 'BattleEventBuffCross')
        throw new Error(`${family}:${mainAeonId}:${subAeonId} 的 Cross effect 无法解析`);
      const mainAeon = tables.RogueAeon.find(
        (candidate) => Number(candidate.AeonID) === mainAeonId
      );
      const subAeon = tables.RogueAeon.find((candidate) => Number(candidate.AeonID) === subAeonId);
      if (!mainAeon || !subAeon) throw new Error(`${family} 引用了未知 Aeon`);
      const mainPath = pathOf(mainAeon.RogueBuffType);
      return {
        id: `${family}:${mainAeonId}:${subAeonId}`,
        kind: 'cross',
        sourceFamily: family,
        main: { aeonId: mainAeonId, path: mainPath, count: Number(owner.MainAeonNum) },
        sub: {
          aeonId: subAeonId,
          path: pathOf(subAeon.RogueBuffType),
          count: Number(owner.SubAeonNum)
        },
        effect: specialEffect(row, `${family}:${mainAeonId}:${subAeonId}`),
        extraEffects: specialExtras(row, String(row.MazeBuffID)),
        ...(row.ActivityModuleID ? { introducedByModule: Number(row.ActivityModuleID) } : {}),
        availableIn,
        tier: resonanceTier(),
        order: mainPath.order * 10_000 + 3_000 + index
      };
    });
  const crossResonances = [
    ...buildCrosses(tables.RogueDLCAeonCross, 'RogueDLCAeonCross', 'swarm-disaster'),
    ...buildCrosses(tables.RogueNousAeonCross, 'RogueNousAeonCross', 'gold-and-gears')
  ];

  const tournGroups = uniqueIndex(
    tables.RogueTournBuffGroup,
    'RogueBuffGroupID',
    'RogueTournBuffGroup'
  );
  const tournTags = new Set(tables.RogueTournBuff.map((row) => Number(row.RogueBuffTag)));
  const t3Tags = new Set<number>();
  const visitedGroups = new Set<number>();
  const expandTournGroup = (groupId: number): void => {
    if (visitedGroups.has(groupId)) return;
    visitedGroups.add(groupId);
    const group = tournGroups.get(String(groupId));
    if (!group) throw new Error(`RogueTournBuffGroup ${groupId} 不存在`);
    for (const reference of rawNumbers(group.RogueBuffDrop)) {
      if (tournTags.has(reference)) t3Tags.add(reference);
      else if (tournGroups.has(String(reference))) expandTournGroup(reference);
      else throw new Error(`RogueTournBuffGroup ${groupId} 包含未知 reference ${reference}`);
    }
  };
  for (const group of tables.RogueTournBuffGroup.filter((row) => row.TournMode === 'Tourn3'))
    expandTournGroup(Number(group.RogueBuffGroupID));

  const duRows = tables.RogueTournBuff.filter((row) => t3Tags.has(Number(row.RogueBuffTag)));
  const duBlessings: RogueBlessing[] = [...groupBy(duRows, 'MazeBuffID')].map(
    ([mazeId, rawLevels], sourceIndex) => {
      const levels = [...rawLevels].sort(
        (a, b) => Number(a.MazeBuffLevel) - Number(b.MazeBuffLevel)
      );
      if (
        levels.length !== 2 ||
        Number(levels[0].MazeBuffLevel) !== 1 ||
        Number(levels[1].MazeBuffLevel) !== 2
      )
        throw new Error(`RogueTournBuff:${mazeId} 必须恰好具有 Lv1/Lv2`);
      const first = levels[0];
      const rawCategory = first.RogueBuffCategory as RogueRawBlessingCategory;
      if (!blessingCategories.has(rawCategory))
        throw new Error(`RogueTournBuff:${mazeId} 存在未知 category ${rawCategory}`);
      const path = pathOf(first.RogueBuffType);
      return {
        id: `RogueTournBuff:${Number(mazeId)}`,
        sourceFamily: 'RogueTournBuff',
        mazeBuffId: Number(mazeId),
        rawCategory,
        tier: blessingTier(rawCategory),
        path,
        tournMode: 'Tourn3',
        levels: levels.map((row) => ({
          level: Number(row.MazeBuffLevel) as 1 | 2,
          rawTag: Number(row.RogueBuffTag),
          effect: effectOf(Number(mazeId), Number(row.MazeBuffLevel), `RogueTournBuff:${mazeId}`)
        })) as [RogueBlessingLevel, RogueBlessingLevel],
        extraEffects: resolveExtraEffects(
          first.ExtraEffectIDList ?? [],
          'RogueTournBuff',
          mazeId,
          'ExtraEffectIDList'
        ),
        order: path.order * 10_000 + sourceIndex
      };
    }
  );
  duBlessings.sort((a, b) => a.order - b.order);
  if (duBlessings.length !== 144)
    throw new Error(`Tourn3 ordinary Blessing 数量错误：${duBlessings.length}`);

  const formulaDisplays = uniqueIndex(
    tables.RogueTournFormulaDisplay,
    'FormulaDisplayID',
    'RogueTournFormulaDisplay'
  );
  const equations: RogueEquation[] = tables.RogueTournFormula.filter(
    (row) => row.TournMode === 'Tourn3'
  ).map((row, index) => {
    const category = row.FormulaCategory as RogueRawFormulaCategory;
    if (!formulaCategories.has(category))
      throw new Error(`Formula ${row.FormulaID} 存在未知 category ${String(category)}`);
    const critical = category === 'PathEcho';
    const display = formulaDisplays.get(String(row.FormulaDisplayID));
    if (!display) throw new Error(`Formula ${row.FormulaID} 缺少 FormulaDisplay`);
    const main = { path: pathOf(row.MainBuffTypeID), count: Number(row.MainBuffNum) };
    const sub = row.SubBuffTypeID
      ? { path: pathOf(row.SubBuffTypeID), count: Number(row.SubBuffNum) }
      : undefined;
    if ((critical && sub) || (!critical && !sub))
      throw new Error(`Formula ${row.FormulaID} 的 Main/Sub requirement 与 category 不一致`);
    return {
      id: `RogueTournFormula:${Number(row.FormulaID)}`,
      formulaId: Number(row.FormulaID),
      kind: critical ? 'critical' : 'ordinary',
      tournMode: 'Tourn3',
      rawCategory: category,
      tier: equationTier(category),
      main,
      ...(sub ? { sub } : {}),
      effect: effectOf(Number(row.MazeBuffID), 1, `RogueTournFormula:${row.FormulaID}`),
      extraEffects: resolveExtraEffects(
        display.ExtraEffect ?? [],
        'RogueTournFormulaDisplay',
        String(row.FormulaDisplayID),
        'ExtraEffect'
      ),
      order: index
    };
  });
  if (equations.length !== 104 || equations.filter((item) => item.kind === 'critical').length !== 8)
    throw new Error(`Tourn3 Formula 数量错误：${equations.length}`);

  const suDataset: RogueSuDataset = {
    schemaVersion: 1,
    kind: 'su',
    paths: [...paths.values()]
      .filter((path) => path.rawType <= 128)
      .sort((a, b) => a.order - b.order),
    blessings: suBlessings,
    baseResonances,
    enhancementGroups,
    crossResonances,
    overlays: {
      su: { aeonIds: tables.RogueAeon.map((row) => Number(row.AeonID)) },
      'swarm-disaster': { aeonIds: tables.RogueDLCAeon.map((row) => Number(row.AeonID)) },
      'gold-and-gears': { aeonIds: tables.RogueNousAeon.map((row) => Number(row.AeonID)) }
    }
  };
  const duDataset: RogueDuDataset = {
    schemaVersion: 1,
    kind: 'du',
    revision: 'Tourn3',
    revisionLabel: '差分宇宙·乐园漫记',
    paths: [
      ...new Map(
        [...duBlessings.map((item) => item.path), ...equations.map((item) => item.main.path)].map(
          (path) => [path.rawType, path]
        )
      ).values()
    ].sort((a, b) => a.order - b.order),
    blessings: duBlessings,
    equations
  };
  const summary: RogueManifestSummary = {
    schemaVersion: 1,
    su: {
      blessings: suBlessings.length,
      baseResonances: baseResonances.length,
      enhancementGroups: enhancementGroups.length,
      crossResonances: {
        swarmDisaster: crossResonances.filter((item) => item.availableIn === 'swarm-disaster')
          .length,
        goldAndGears: crossResonances.filter((item) => item.availableIn === 'gold-and-gears').length
      }
    },
    du: {
      revision: 'Tourn3',
      blessings: duBlessings.length,
      equations: equations.length,
      criticalEquations: equations.filter((item) => item.kind === 'critical').length
    },
    diagnostics: {
      missingPathAssets: ['Propagation'],
      ordinarySuAvailability: 'shared-catalog'
    }
  };
  return {
    datasets: { su: suDataset, du: duDataset },
    audit: {
      summary,
      relations: {
        suBlessingLevels: ordinarySuRows.length,
        duBlessingLevels: duRows.length,
        formulaMazeBuffs: equations.length,
        resonanceEffects:
          baseResonances.length + enhancementGroups.length * 3 + crossResonances.length,
        extraEffectReferences
      },
      orderingFallback: 'source-index',
      notes: [
        '普通 SU 祝福在三个 SU context 中共享完整图鉴；当前导出没有玩法到 aggregate BuffGroup 的精确 consumer。',
        'DU 第一版固定 Tourn3；没有按名称合并 Tourn1/Tourn2/Tourn3。',
        '繁育 Path icon 在当前 StarRailRes 中缺失，UI 使用文字占位。'
      ]
    }
  };
}
