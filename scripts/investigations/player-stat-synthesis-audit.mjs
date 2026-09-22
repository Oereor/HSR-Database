import fs from 'node:fs';
import path from 'node:path';

const workspace = path.resolve(process.cwd(), '..');
const dataRoot = path.join(workspace, 'TurnBasedGameData', 'ExcelOutput');
const fixtureRoot = path.join(workspace, 'Enka-API-Integration-01');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const table = (name) => read(path.join(dataRoot, `${name}.json`));
const value = (input) => Number(input?.Value ?? input ?? 0);
const key = (...parts) => parts.map(String).join(':');
const groupBy = (rows, getKey) => {
  const result = new Map();
  for (const row of rows) {
    const k = getKey(row);
    result.set(k, [...(result.get(k) ?? []), row]);
  }
  return result;
};

const enka = read(path.join(fixtureRoot, '168902602-Enka.json'));
const mihomo = read(path.join(fixtureRoot, '168902602-MiHoMo.json'));
const promotions = table('AvatarPromotionConfig');
const equipment = table('EquipmentConfig');
const equipmentPromotions = table('EquipmentPromotionConfig');
const equipmentSkills = table('EquipmentSkillConfig');
const relics = table('RelicConfig');
const relicMain = table('RelicMainAffixConfig');
const relicSub = table('RelicSubAffixConfig');
const relicSetSkills = table('RelicSetSkillConfig');
const traces = table('AvatarSkillTreeConfig');
const ranks = table('AvatarRankConfig');

const byAvatarPromotion = new Map(promotions.map((row) => [key(row.AvatarID, row.Promotion), row]));
const byEquipment = new Map(equipment.map((row) => [String(row.EquipmentID), row]));
const byEquipmentPromotion = new Map(equipmentPromotions.map((row) => [key(row.EquipmentID, row.Promotion), row]));
const byEquipmentSkill = new Map(equipmentSkills.map((row) => [key(row.SkillID, row.Level), row]));
const byRelic = new Map(relics.map((row) => [String(row.ID), row]));
const byRelicMain = new Map(relicMain.map((row) => [key(row.GroupID, row.AffixID), row]));
const byRelicSub = new Map(relicSub.map((row) => [key(row.GroupID, row.AffixID), row]));
const tracesByPoint = groupBy(traces, (row) => String(row.PointID));

function semantic(type) {
  const explicit = {
    BaseHP: ['hp', 'base'], HPAddedRatio: ['hp', 'ratio'], HPDelta: ['hp', 'flat'],
    BaseAttack: ['atk', 'base'], AttackAddedRatio: ['atk', 'ratio'], AttackDelta: ['atk', 'flat'],
    BaseDefence: ['def', 'base'], DefenceAddedRatio: ['def', 'ratio'], DefenceDelta: ['def', 'flat'],
    BaseSpeed: ['spd', 'base'], SpeedAddedRatio: ['spd', 'ratio'], SpeedDelta: ['spd', 'flat'],
    CriticalChanceBase: ['crit_rate', 'direct'], CriticalDamageBase: ['crit_dmg', 'direct'],
    BreakDamageAddedRatioBase: ['break_dmg', 'direct'], StatusProbabilityBase: ['effect_hit', 'direct'],
    StatusResistanceBase: ['effect_res', 'direct'], SPRatioBase: ['sp_rate', 'direct'], HealRatioBase: ['heal_rate', 'direct'],
    HealTakenRatio: ['heal_taken', 'direct'], AllDamageTypeAddedRatio: ['all_dmg', 'direct'],
    PhysicalAddedRatio: ['physical_dmg', 'direct'], FireAddedRatio: ['fire_dmg', 'direct'], IceAddedRatio: ['ice_dmg', 'direct'],
    ThunderAddedRatio: ['thunder_dmg', 'direct'], WindAddedRatio: ['wind_dmg', 'direct'], QuantumAddedRatio: ['quantum_dmg', 'direct'],
    ImaginaryAddedRatio: ['imaginary_dmg', 'direct'], ElationDamageAddedRatioBase: ['elation_dmg', 'direct']
  };
  return explicit[type];
}

function addContribution(acc, type, amount, source, sourceId) {
  const mapping = semantic(type);
  if (!mapping) return acc.unknown.push({ type, amount, source, sourceId });
  const [stat, bucket] = mapping;
  acc[stat] ??= { base: 0, ratio: 0, flat: 0, direct: 0 };
  acc[stat][bucket] += amount;
  acc.contributions.push({ type, amount, source, sourceId, stat, bucket });
}

function relicContributionRows(rawRelic) {
  const config = byRelic.get(String(rawRelic.tid));
  const main = byRelicMain.get(key(config.MainAffixGroup, rawRelic.mainAffixId));
  const result = [{
    type: main.Property,
    amount: value(main.BaseValue) + value(main.LevelAdd) * rawRelic.level,
    source: 'relicMain', sourceId: String(rawRelic.tid)
  }];
  for (const raw of rawRelic.subAffixList ?? []) {
    const row = byRelicSub.get(key(config.SubAffixGroup, raw.affixId));
    result.push({ type: row.Property, amount: value(row.BaseValue) * raw.cnt + value(row.StepValue) * (raw.step ?? 0), source: 'relicSub', sourceId: `${rawRelic.tid}:${raw.affixId}` });
  }
  return result;
}

function synthesize(rawAvatar) {
  const acc = { contributions: [], unknown: [] };
  const ap = byAvatarPromotion.get(key(rawAvatar.avatarId, rawAvatar.promotion));
  const ao = rawAvatar.level - 1;
  addContribution(acc, 'BaseHP', value(ap.HPBase) + value(ap.HPAdd) * ao, 'avatar', String(rawAvatar.avatarId));
  addContribution(acc, 'BaseAttack', value(ap.AttackBase) + value(ap.AttackAdd) * ao, 'avatar', String(rawAvatar.avatarId));
  addContribution(acc, 'BaseDefence', value(ap.DefenceBase) + value(ap.DefenceAdd) * ao, 'avatar', String(rawAvatar.avatarId));
  addContribution(acc, 'BaseSpeed', value(ap.SpeedBase), 'avatar', String(rawAvatar.avatarId));
  addContribution(acc, 'CriticalChanceBase', value(ap.CriticalChance), 'avatar', String(rawAvatar.avatarId));
  addContribution(acc, 'CriticalDamageBase', value(ap.CriticalDamage), 'avatar', String(rawAvatar.avatarId));

  if (rawAvatar.equipment) {
    const raw = rawAvatar.equipment;
    const ep = byEquipmentPromotion.get(key(raw.tid, raw.promotion));
    const eo = raw.level - 1;
    addContribution(acc, 'BaseHP', value(ep.BaseHP) + value(ep.BaseHPAdd) * eo, 'lightCone', String(raw.tid));
    addContribution(acc, 'BaseAttack', value(ep.BaseAttack) + value(ep.BaseAttackAdd) * eo, 'lightCone', String(raw.tid));
    addContribution(acc, 'BaseDefence', value(ep.BaseDefence) + value(ep.BaseDefenceAdd) * eo, 'lightCone', String(raw.tid));
    const config = byEquipment.get(String(raw.tid));
    const skill = byEquipmentSkill.get(key(config.SkillID, raw.rank));
    for (const property of skill?.AbilityProperty ?? []) addContribution(acc, property.PropertyType, value(property.Value), 'lightConeAbility', String(raw.tid));
  }

  const setCounts = new Map();
  for (const rawRelic of rawAvatar.relicList ?? []) {
    const config = byRelic.get(String(rawRelic.tid));
    setCounts.set(String(config.SetID), (setCounts.get(String(config.SetID)) ?? 0) + 1);
    for (const row of relicContributionRows(rawRelic)) addContribution(acc, row.type, row.amount, row.source, row.sourceId);
  }
  for (const skill of relicSetSkills) {
    if ((setCounts.get(String(skill.SetID)) ?? 0) < Number(skill.RequireNum)) continue;
    for (const property of skill.PropertyList ?? []) addContribution(acc, property.FODBMMCKAEN, value(property.MNDFOPKBHKP), 'relicSet', `${skill.SetID}:${skill.RequireNum}`);
  }

  for (const owned of rawAvatar.skillTreeList ?? []) {
    if (owned.level <= 0) continue;
    const rows = tracesByPoint.get(String(owned.pointId)) ?? [];
    const row = rows.find((candidate) => Number(candidate.Level) === Number(owned.level)) ?? rows.at(-1);
    for (const status of row?.StatusAddList ?? []) addContribution(acc, status.PropertyType, value(status.Value), 'trace', String(owned.pointId));
  }

  const result = {};
  for (const [stat, buckets] of Object.entries(acc)) {
    if (stat === 'contributions' || stat === 'unknown') continue;
    result[stat] = ['hp', 'atk', 'def', 'spd'].includes(stat)
      ? buckets.base * (1 + buckets.ratio) + buckets.flat + buckets.direct
      : buckets.direct + buckets.base + buckets.flat;
  }
  return { result, acc };
}

function scanInventory() {
  const inventory = new Map();
  const record = (type, config, field, exampleId, amount) => {
    if (!type) return;
    const current = inventory.get(type) ?? { configs: new Set(), fields: new Set(), examples: [] };
    current.configs.add(config); current.fields.add(field);
    if (current.examples.length < 4) current.examples.push({ exampleId: String(exampleId), amount });
    inventory.set(type, current);
  };
  for (const row of promotions) for (const field of ['HPBase', 'AttackBase', 'DefenceBase', 'SpeedBase', 'CriticalChance', 'CriticalDamage']) {
    const type = { HPBase: 'BaseHP', AttackBase: 'BaseAttack', DefenceBase: 'BaseDefence', SpeedBase: 'BaseSpeed', CriticalChance: 'CriticalChanceBase', CriticalDamage: 'CriticalDamageBase' }[field];
    record(type, 'AvatarPromotionConfig', field, `${row.AvatarID}:${row.Promotion}`, value(row[field]));
  }
  for (const row of equipmentPromotions) for (const field of ['BaseHP', 'BaseAttack', 'BaseDefence']) record(field, 'EquipmentPromotionConfig', field, `${row.EquipmentID}:${row.Promotion}`, value(row[field]));
  for (const row of equipmentSkills) for (const p of row.AbilityProperty ?? []) record(p.PropertyType, 'EquipmentSkillConfig', 'AbilityProperty', `${row.SkillID}:${row.Level}`, value(p.Value));
  for (const row of relicMain) record(row.Property, 'RelicMainAffixConfig', 'Property', `${row.GroupID}:${row.AffixID}`, value(row.BaseValue));
  for (const row of relicSub) record(row.Property, 'RelicSubAffixConfig', 'Property', `${row.GroupID}:${row.AffixID}`, value(row.BaseValue));
  for (const row of relicSetSkills) for (const p of row.PropertyList ?? []) record(p.FODBMMCKAEN, 'RelicSetSkillConfig', 'PropertyList', `${row.SetID}:${row.RequireNum}`, value(p.MNDFOPKBHKP));
  for (const row of traces) for (const p of row.StatusAddList ?? []) record(p.PropertyType, 'AvatarSkillTreeConfig', 'StatusAddList', `${row.PointID}:${row.Level}`, value(p.Value));
  return Object.fromEntries([...inventory].sort().map(([type, entry]) => [type, { configs: [...entry.configs], fields: [...entry.fields], examples: entry.examples, semantic: semantic(type) ?? null }]));
}

const comparisons = [];
const details = [];
for (const raw of enka.detailInfo.avatarDetailList) {
  const golden = mihomo.characters.find((entry) => Number(entry.id) === raw.avatarId);
  const local = synthesize(raw);
  const goldenStats = Object.fromEntries(golden.statistics.map((stat) => [stat.field, stat.value]));
  for (const stat of new Set([...Object.keys(local.result), ...Object.keys(goldenStats)])) {
    const localValue = local.result[stat]; const goldenValue = goldenStats[stat];
    comparisons.push({ avatarId: raw.avatarId, stat, local: localValue ?? null, mihomo: goldenValue ?? null, delta: localValue === undefined || goldenValue === undefined ? null : localValue - goldenValue });
  }
  details.push({ avatarId: raw.avatarId, result: local.result, unknown: local.acc.unknown, buckets: Object.fromEntries(Object.entries(local.acc).filter(([name]) => !['contributions', 'unknown'].includes(name))), contributions: local.acc.contributions });
}

const equipmentAbility = equipmentSkills.filter((row) => row.AbilityProperty?.length);
const setProperties = relicSetSkills.filter((row) => row.PropertyList?.length);
const traceStats = traces.filter((row) => row.StatusAddList?.length);
const rankFieldCounts = {};
for (const row of ranks) for (const field of ['PropertyList', 'StatusAddList', 'AbilityProperty', 'RankAbility', 'SkillAddLevelList']) {
  const item = row[field];
  if (Array.isArray(item) ? item.length : item && typeof item === 'object' ? Object.keys(item).length : item) rankFieldCounts[field] = (rankFieldCounts[field] ?? 0) + 1;
}
const blockRelations = mihomo.characters.map((character) => {
  const blocks = Object.fromEntries(['statistics', 'attributes', 'additions'].map((name) => [name, Object.fromEntries(character[name].map((row) => [row.field, row.value]))]));
  const deltas = {};
  for (const [field, final] of Object.entries(blocks.statistics)) deltas[field] = final - (blocks.attributes[field] ?? 0) - (blocks.additions[field] ?? 0);
  return { avatarId: character.id, deltas, propertyTypes: character.properties.map((p) => p.type) };
});

console.log(JSON.stringify({
  summary: {
    characters: enka.detailInfo.avatarDetailList.length,
    equipmentAbilityRows: equipmentAbility.length,
    equipmentAbilitySkillIds: new Set(equipmentAbility.map((row) => row.SkillID)).size,
    equipmentAbilityTypes: [...new Set(equipmentAbility.flatMap((row) => row.AbilityProperty.map((p) => p.PropertyType)))].sort(),
    relicSetPropertyRows: setProperties.length,
    relicSetPropertyTypes: [...new Set(setProperties.flatMap((row) => row.PropertyList.map((p) => p.FODBMMCKAEN)))].sort(),
    relicSetAbilityWithoutProperty: relicSetSkills.filter((row) => row.AbilityName && !(row.PropertyList?.length)).map((row) => `${row.SetID}:${row.RequireNum}`),
    traceStatusRows: traceStats.length,
    traceStatusTypes: [...new Set(traceStats.flatMap((row) => row.StatusAddList.map((p) => p.PropertyType)))].sort(),
    tracePointTypeWithStatus: Object.fromEntries([...groupBy(traceStats, (row) => String(row.PointType))].map(([pointType, rows]) => [pointType, rows.length])),
    pointType1WithoutStatus: traces.filter((row) => Number(row.PointType) === 1 && !(row.StatusAddList?.length)).map((row) => `${row.PointID}:${row.Level}`),
    nonPointType1WithStatus: traces.filter((row) => Number(row.PointType) !== 1 && row.StatusAddList?.length).map((row) => `${row.PointID}:${row.Level}:${row.PointType}`),
    rankFieldCounts
  },
  inventory: scanInventory(),
  equipmentAbility: equipmentAbility.map((row) => ({ skillId: row.SkillID, level: row.Level, abilityName: row.AbilityName, params: row.ParamList?.map(value), properties: row.AbilityProperty.map((p) => ({ type: p.PropertyType, value: value(p.Value) })) })),
  relicSetProperties: relicSetSkills.map((row) => ({ setId: row.SetID, required: row.RequireNum, abilityName: row.AbilityName, properties: (row.PropertyList ?? []).map((p) => ({ type: p.FODBMMCKAEN, value: value(p.MNDFOPKBHKP) })) })),
  traceAudit: { pointTypes: Object.fromEntries([...groupBy(traces, (row) => String(row.PointType))].map(([pointType, rows]) => [pointType, rows.length])), statusRows: traceStats.map((row) => ({ pointId: row.PointID, level: row.Level, avatarId: row.AvatarID, pointType: row.PointType, status: row.StatusAddList.map((p) => ({ type: p.PropertyType, value: value(p.Value) })) })) },
  blockRelations, comparisons, details
}, null, 2));
