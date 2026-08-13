import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CatalogEntry,
  Character,
  CharacterProfile,
  DataManifest,
  Enemy,
  LightCone,
  SearchEntry
} from '../../src/lib/domain/types.js';
import { isElementType } from '../../src/lib/domain/elements.js';
import { getBaseStatsAtLevel } from '../../src/lib/domain/stats.js';
import { gameTextToPlain } from '../../src/lib/domain/game-text.js';
import { SKILL_EFFECT_LABELS } from './skill-combat.js';
import type { TextDiagnosticSummary } from './localization.js';
import type { DescriptionDiagnosticSummary } from './levelled.js';
import type { MissingTextAudit } from './missing-text.js';
import { auditRoot, generatedRoot, staticGeneratedRoot } from './paths.js';

const manifest = JSON.parse(
  await readFile(path.join(generatedRoot, 'manifest.json'), 'utf8')
) as DataManifest;
if (manifest.schemaVersion !== 11)
  throw new Error(`不支持的生成数据 schema：${manifest.schemaVersion}`);
if (manifest.language !== 'CHS') throw new Error(`生成数据语言错误：${manifest.language}`);

const audit = JSON.parse(await readFile(path.join(auditRoot, 'latest.json'), 'utf8')) as {
  textDiagnostics: TextDiagnosticSummary;
  descriptionDiagnostics: DescriptionDiagnosticSummary;
  missingTextAudit: MissingTextAudit;
  skillCombatAudit: { unknownEffects: string[] };
};
const textDiagnostics = audit.textDiagnostics;
if (!textDiagnostics) throw new Error('生成审计缺少 TextMap 诊断摘要');
if (textDiagnostics['invalid-reference'].count) {
  const sample = textDiagnostics['invalid-reference'].samples[0];
  throw new Error(
    `检测到 ${textDiagnostics['invalid-reference'].count} 个无效文本引用；首个样本：${sample?.identifier ?? '未知'} (${sample?.source.entity ?? '未知'}.${sample?.source.field ?? '未知'})`
  );
}
const descriptionDiagnostics = audit.descriptionDiagnostics;
if (!descriptionDiagnostics) throw new Error('生成审计缺少分级描述诊断摘要');
if (descriptionDiagnostics['invalid-param'].count) {
  const sample = descriptionDiagnostics['invalid-param'].samples[0];
  throw new Error(
    `检测到 ${descriptionDiagnostics['invalid-param'].count} 个无效描述参数；首个样本：${sample?.entity ?? '未知'} ${sample?.id ?? '未知'} Lv.${sample?.level ?? '未知'}`
  );
}
const missingTextAudit = audit.missingTextAudit;
if (!missingTextAudit) throw new Error('生成审计缺少 A/B/C/D 缺失文本分类');
if (missingTextAudit.D.count) {
  const sample = missingTextAudit.D.samples[0];
  throw new Error(
    `检测到 ${missingTextAudit.D.count} 个程序级文本错误；首个样本：${sample?.reason ?? '未知'} (${sample?.entity ?? '未知'}.${sample?.field ?? '未知'})`
  );
}

const expected: Record<string, number> = {
  characters: manifest.counts.characters,
  'light-cones': manifest.counts.lightCones,
  relics: manifest.counts.relics,
  enemies: manifest.counts.enemies
};
for (const [category, count] of Object.entries(expected)) {
  const catalog = JSON.parse(
    await readFile(path.join(generatedRoot, 'catalogs', `${category}.json`), 'utf8')
  ) as CatalogEntry[];
  if (catalog.length !== count)
    throw new Error(`${category} 数量不一致：${catalog.length} != ${count}`);
  if (new Set(catalog.map((item) => item.id)).size !== catalog.length)
    throw new Error(`${category} 存在重复 ID`);
  for (const item of catalog)
    await access(path.join(generatedRoot, 'details', category, `${item.id}.json`));
}
const search = JSON.parse(
  await readFile(path.join(staticGeneratedRoot, 'search.json'), 'utf8')
) as SearchEntry[];
if (search.length !== Object.values(expected).reduce((sum, value) => sum + value, 0)) {
  throw new Error('搜索索引数量与目录数量不一致');
}

let emptySkillDescriptions = 0;
let statTraceCount = 0;
let abilityTraceCount = 0;
const observedTypeFiveIds = new Set<string>();
let traceDependencyCount = 0;
const traceDependencyDirections = new Map<string, number>();
const characters = await Promise.all(
  manifest.routes.characters.map(
    async (id) =>
      JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'characters', `${id}.json`), 'utf8')
      ) as Character
  )
);
const validateCharacterProfile = (
  character: Character,
  mode: 'base' | 'enhanced',
  profile: CharacterProfile
): void => {
  if (profile.energy.kind === 'special') {
    if (profile.energy.max !== 0)
      throw new Error(`特殊能量角色 ${character.id} ${mode} profile 的能量上限不为 0`);
  } else if (!Number.isFinite(profile.energy.max) || profile.energy.max <= 0) {
    throw new Error(`普通能量角色 ${character.id} ${mode} profile 的能量上限无效`);
  }
  if (new Set(profile.skillCards.map((card) => card.category)).size !== profile.skillCards.length)
    throw new Error(`角色 ${character.id} ${mode} profile 存在重复语义技能卡`);
  for (const card of profile.skillCards) {
    const variantIds = new Set(card.variants.map((variant) => variant.id));
    for (const progression of card.progressions) {
      if (!progression.availableLevels.length)
        throw new Error(`角色 ${character.id} 的 ${card.category} progression 没有共同等级`);
      if (!progression.availableLevels.includes(progression.defaultLevel))
        throw new Error(`角色 ${character.id} 的 ${card.category} 默认等级无效`);
      if (progression.variantIds.some((id) => !variantIds.has(id)))
        throw new Error(`角色 ${character.id} 的 ${card.category} progression 引用了未知变体`);
    }
    for (const variant of card.variants) {
      const meta = variant.combatMeta;
      if (!meta) throw new Error(`角色 ${character.id} 技能 ${variant.id} 缺少战斗元数据`);
      if (meta.effect?.known) {
        const expectedLabel =
          SKILL_EFFECT_LABELS[meta.effect.code as keyof typeof SKILL_EFFECT_LABELS];
        if (!expectedLabel || meta.effect.label !== expectedLabel)
          throw new Error(`角色 ${character.id} 技能 ${variant.id} 的 SkillEffect 映射异常`);
      } else if (meta.effect && meta.effect.label !== meta.effect.code) {
        throw new Error(`角色 ${character.id} 技能 ${variant.id} 的未知 SkillEffect 未保留原值`);
      }
      if (meta.specialResource && !gameTextToPlain(meta.specialResource).trim())
        throw new Error(`角色 ${character.id} 技能 ${variant.id} 的特殊资源文本为空`);
      if (meta.specialResource && /#\d+(?:\[[^\]]+\])?%?/.test(meta.specialResource))
        throw new Error(`角色 ${character.id} 技能 ${variant.id} 的特殊资源仍有未解析参数`);
      if (
        meta.battlePointDelta !== undefined &&
        (!Number.isFinite(meta.battlePointDelta) || meta.battlePointDelta === 0)
      )
        throw new Error(`角色 ${character.id} 技能 ${variant.id} 的战技点变化无效`);
      for (const [field, value] of [
        ['energyGain', meta.energyGain],
        ['toughnessDamage', meta.toughnessDamage]
      ] as const)
        if (value !== undefined && (!Number.isFinite(value) || value <= 0))
          throw new Error(`角色 ${character.id} 技能 ${variant.id} 的 ${field} 无效`);
      for (const level of variant.levels) {
        if (!level.description) emptySkillDescriptions += 1;
        if (level.description !== level.descriptionTokens.map((token) => token.value).join(''))
          throw new Error(
            `角色 ${character.id} 技能 ${variant.id} Lv.${level.level} 的语义文本不一致`
          );
      }
    }
  }
  const tracesById = new Map(profile.traces.map((trace) => [trace.id, trace]));
  if (tracesById.size !== profile.traces.length)
    throw new Error(`角色 ${character.id} ${mode} profile 存在重复行迹节点`);
  for (const trace of profile.traces) {
    const expectedType = trace.sourcePointType === 1 ? 'stat' : 'ability';
    if (![1, 3, 5].includes(trace.sourcePointType) || trace.type !== expectedType)
      throw new Error(`角色 ${character.id} ${mode} profile 的行迹 ${trace.id} 类型映射异常`);
    if (trace.type === 'stat') {
      statTraceCount += 1;
      if (!trace.description)
        throw new Error(
          `角色 ${character.id} ${mode} profile 的属性行迹 ${trace.id} 缺少结构化描述`
        );
    } else abilityTraceCount += 1;
    if (trace.sourcePointType === 3 && ![2, 4, 6].includes(trace.promotionLimit ?? -1))
      throw new Error(`角色 ${character.id} ${mode} profile 的额外能力 ${trace.id} 晋阶限制异常`);
    if (trace.sourcePointType === 5) observedTypeFiveIds.add(trace.id);
    if (!Number.isInteger(trace.anchorOrder) || trace.anchorOrder <= 0)
      throw new Error(`角色 ${character.id} ${mode} profile 的行迹 ${trace.id} 锚点顺序异常`);
    for (const prerequisiteId of trace.prerequisiteIds) {
      if (prerequisiteId === trace.id)
        throw new Error(`角色 ${character.id} ${mode} profile 的行迹 ${trace.id} 自引用`);
      if (!tracesById.has(prerequisiteId))
        throw new Error(
          `角色 ${character.id} ${mode} profile 的行迹 ${trace.id} 引用了未知前置节点 ${prerequisiteId}`
        );
      traceDependencyCount += 1;
      const prerequisite = tracesById.get(prerequisiteId)!;
      // Audit direction follows the source row's PrePoint reference: node -> prerequisite.
      const direction = `${trace.type}->${prerequisite.type}`;
      traceDependencyDirections.set(direction, (traceDependencyDirections.get(direction) ?? 0) + 1);
    }
  }
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visitTrace = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id))
      throw new Error(`角色 ${character.id} ${mode} profile 的行迹依赖存在循环：${id}`);
    visiting.add(id);
    for (const prerequisiteId of tracesById.get(id)?.prerequisiteIds ?? [])
      visitTrace(prerequisiteId);
    visiting.delete(id);
    visited.add(id);
  };
  for (const trace of profile.traces) visitTrace(trace.id);
};

const profileIds = (profile: CharacterProfile): Set<string> =>
  new Set([
    ...profile.skillCards.flatMap((card) => card.variants.map((variant) => variant.id)),
    ...profile.traces.map((trace) => trace.id),
    ...profile.eidolons.map((eidolon) => eidolon.id)
  ]);

for (const character of characters) {
  if (character.element && !isElementType(character.element))
    throw new Error(`角色 ${character.id} 使用未知属性：${character.element}`);
  validateCharacterProfile(character, 'base', character.profiles.base);
  if (character.profiles.enhanced) {
    validateCharacterProfile(character, 'enhanced', character.profiles.enhanced);
    const baseIds = profileIds(character.profiles.base);
    const overlap = [...profileIds(character.profiles.enhanced)].filter((id) => baseIds.has(id));
    if (overlap.length)
      throw new Error(`角色 ${character.id} 的两套 profile 存在重复 ID：${overlap.join(',')}`);
  }
  if (character.baseStats.minLevel !== 1 || character.baseStats.maxLevel !== 80)
    throw new Error(`角色 ${character.id} 的等级范围不是 1–80`);
  if (character.baseStats.defaultLevel !== 80)
    throw new Error(`角色 ${character.id} 的默认等级不是 80`);
  const level80 = getBaseStatsAtLevel(character.baseStats, 80);
  if (![level80.hp, level80.attack, level80.defence].every(Number.isFinite))
    throw new Error(`角色 ${character.id} 的 Lv.80 属性无效`);
}

if (statTraceCount !== 1010 || abilityTraceCount !== 305)
  throw new Error(`行迹类型数量异常：属性 ${statTraceCount}，额外能力 ${abilityTraceCount}`);
if (
  traceDependencyCount !== 860 ||
  traceDependencyDirections.get('stat->stat') !== 485 ||
  traceDependencyDirections.get('stat->ability') !== 361 ||
  traceDependencyDirections.get('ability->stat') !== 14 ||
  traceDependencyDirections.size !== 3
)
  throw new Error(
    `行迹依赖分布异常：总计 ${traceDependencyCount}，${JSON.stringify(Object.fromEntries(traceDependencyDirections))}`
  );
if (JSON.stringify([...observedTypeFiveIds].sort()) !== JSON.stringify(['8007501', '8008501']))
  throw new Error(`PointType 5 行迹集合异常：${[...observedTypeFiveIds].sort().join(',')}`);

const expectedSpecialEnergyIds = ['1220', '1308', '1407', '1408', '1415', '1506'];
const actualSpecialEnergyIds = characters
  .filter((character) => character.profiles.base.energy.kind === 'special')
  .map((character) => character.id)
  .sort();
if (actualSpecialEnergyIds.join(',') !== expectedSpecialEnergyIds.join(','))
  throw new Error(`特殊能量角色集合异常：${actualSpecialEnergyIds.join(',')}`);
if (
  characters.find((character) => character.id === '1006')?.profiles.base.energy.kind !==
    'standard' ||
  characters.find((character) => character.id === '1006')?.profiles.base.energy.max !== 110
)
  throw new Error('旧版银狼的普通能量配置异常');

const expectedEnhancedIds = [
  '1004',
  '1005',
  '1006',
  '1102',
  '1205',
  '1212',
  '1217',
  '1306',
  '1307',
  '1310'
];
const actualEnhancedIds = characters
  .filter((character) => character.profiles.enhanced)
  .map((character) => character.id)
  .sort();
if (actualEnhancedIds.join(',') !== expectedEnhancedIds.join(','))
  throw new Error(`加强角色集合异常：${actualEnhancedIds.join(',')}`);

const actualSkillEffects = [
  ...new Set(
    characters.flatMap((character) =>
      Object.values(character.profiles)
        .filter((profile): profile is CharacterProfile => !!profile)
        .flatMap((profile) =>
          profile.skillCards.flatMap((card) =>
            card.variants.map((variant) => variant.combatMeta.effect?.code).filter(Boolean)
          )
        )
    )
  )
].sort();
const expectedSkillEffects = Object.keys(SKILL_EFFECT_LABELS).sort();
if (actualSkillEffects.join(',') !== expectedSkillEffects.join(','))
  throw new Error(`SkillEffect 集合异常：${actualSkillEffects.join(',')}`);

const lightCones = await Promise.all(
  manifest.routes['light-cones'].map(
    async (id) =>
      JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'light-cones', `${id}.json`), 'utf8')
      ) as LightCone
  )
);
for (const lightCone of lightCones) {
  const levels = lightCone.superimposition.levels;
  if (!levels.length) throw new Error(`光锥 ${lightCone.id} 缺少叠影等级`);
  for (const level of levels) {
    if (level.description !== level.descriptionTokens.map((token) => token.value).join(''))
      throw new Error(`光锥 ${lightCone.id} 叠影 Lv.${level.level} 的语义文本不一致`);
  }
  if (lightCone.baseStats.minLevel !== 1 || lightCone.baseStats.maxLevel !== 80)
    throw new Error(`光锥 ${lightCone.id} 的等级范围不是 1–80`);
  const level80 = getBaseStatsAtLevel(lightCone.baseStats, 80);
  if (![level80.hp, level80.attack, level80.defence].every(Number.isFinite))
    throw new Error(`光锥 ${lightCone.id} 的 Lv.80 属性无效`);
}

const enemies = await Promise.all(
  manifest.routes.enemies.map(
    async (id) =>
      JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'enemies', `${id}.json`), 'utf8')
      ) as Enemy
  )
);
for (const enemy of enemies) {
  for (const weakness of enemy.weaknesses)
    if (!isElementType(weakness.element))
      throw new Error(`敌人 ${enemy.id} 使用未知弱点属性：${weakness.element}`);
  for (const resistance of enemy.resistances)
    if (!isElementType(resistance.element))
      throw new Error(`敌人 ${enemy.id} 使用未知抗性属性：${resistance.element}`);
}

const march = characters.find((character) => character.id === '1001');
const baseProfile = (character: Character | undefined): CharacterProfile | undefined =>
  character?.profiles.base;
if (march?.name !== '三月七·存护') throw new Error('多命途名称验证失败：三月七·存护');
if (!baseProfile(march)?.traces.some((trace) => trace.name === '纯洁'))
  throw new Error('符号文本键验证失败：未恢复三月七行迹“纯洁”');
if (
  baseProfile(march)?.traces.find((trace) => trace.id === '1001201')?.description !==
  '冰属性伤害提高3.2%'
)
  throw new Error('属性行迹验证失败：三月七冰属性伤害节点未恢复');
if (
  baseProfile(march)?.traces.find((trace) => trace.id === '1001202')?.description !==
  '防御力提高5.0%'
)
  throw new Error('属性行迹验证失败：三月七防御节点未恢复');
if (baseProfile(march)?.eidolons[0]?.name !== '记忆中的你')
  throw new Error('符号文本键验证失败：未恢复三月七第一星魂');
const trailblazer = characters.find((character) => character.id === '8005');
if (trailblazer?.name !== '开拓者·同谐') throw new Error('多命途名称验证失败：开拓者·同谐');
const imbibitorLunae = characters.find((character) => character.id === '1213');
if (
  baseProfile(imbibitorLunae)?.skillCards.find((card) => card.category === 'basic')?.variants
    .length !== 4
)
  throw new Error('技能卡验证失败：丹恒·饮月普攻变体未正确合并');
const theHerta = characters.find((character) => character.id === '1401');
if (
  baseProfile(theHerta)?.skillCards.find((card) => card.category === 'skill')?.variants.length !== 2
)
  throw new Error('技能卡验证失败：大黑塔战技变体未正确合并');
const aglaea = characters.find((character) => character.id === '1402');
if (!baseProfile(aglaea)?.skillCards.some((card) => card.category === 'memosprite-skill'))
  throw new Error('忆灵关系验证失败：阿格莱雅缺少忆灵技');
if (!baseProfile(aglaea)?.skillCards.some((card) => card.category === 'memosprite-talent'))
  throw new Error('忆灵关系验证失败：阿格莱雅缺少忆灵天赋');
const castorice = characters.find((character) => character.id === '1407');
const castoriceSkillIds =
  baseProfile(castorice)?.skillCards.flatMap((card) =>
    card.variants.map((variant) => variant.id)
  ) ?? [];
if (!castoriceSkillIds.includes('1140702'))
  throw new Error('内部技能过滤失败：遐蝶公开忆灵技被错误删除');
if (
  castoriceSkillIds.includes('1140710') ||
  castoriceSkillIds.includes('1140711') ||
  castoriceSkillIds.includes('1140712')
)
  throw new Error('内部技能过滤失败：遐蝶内部伤害阶段仍在展示模型中');
const castoriceMemospriteTalent = baseProfile(castorice)?.skillCards.find(
  (card) => card.category === 'memosprite-talent'
);
if (!castoriceMemospriteTalent?.variants.some((variant) => variant.id === '1140706'))
  throw new Error('忆灵分类验证失败：遐蝶“灼掠幽墟的晦翼”未保留在忆灵天赋');
if (
  baseProfile(castorice)?.traces.find((trace) => trace.id === '1407202')?.description !==
  '量子属性伤害提高3.2%'
)
  throw new Error('属性行迹验证失败：遐蝶量子属性伤害节点未恢复');
if (
  baseProfile(castorice)?.traces.find((trace) => trace.id === '1407204')?.description !==
  '暴击伤害提高5.3%'
)
  throw new Error('属性行迹验证失败：遐蝶暴击伤害节点未恢复');

const jingliu = characters.find((character) => character.id === '1212');
const jingliuBase = jingliu?.profiles.base;
const jingliuEnhanced = jingliu?.profiles.enhanced;
const skillVariant = (profile: CharacterProfile | undefined, id: string) =>
  profile?.skillCards.flatMap((card) => card.variants).find((variant) => variant.id === id);
const skillDescription = (profile: CharacterProfile | undefined, id: string, level: number) =>
  skillVariant(profile, id)?.levels.find((entry) => entry.level === level)?.description;
if (!skillDescription(jingliuBase, '121202', 10)?.includes('200%攻击力'))
  throw new Error('加强 profile 验证失败：镜流加强前战技数据异常');
if (!skillDescription(jingliuEnhanced, '1121202', 10)?.includes('150%生命上限'))
  throw new Error('加强 profile 验证失败：镜流加强后战技数据异常');
if (
  jingliuBase?.traces
    .find((trace) => trace.name === '死境')
    ?.description.includes('终结技伤害提高20%')
)
  throw new Error('加强 profile 验证失败：镜流加强前混入加强行迹');
if (
  !jingliuEnhanced?.traces
    .find((trace) => trace.name === '死境')
    ?.description.includes('终结技伤害提高20%')
)
  throw new Error('加强 profile 验证失败：镜流加强后行迹数据异常');
if (!jingliuBase?.eidolons[0]?.description.includes('暴击伤害提高24%'))
  throw new Error('加强 profile 验证失败：镜流加强前星魂数据异常');
if (!jingliuEnhanced?.eidolons[0]?.description.includes('暴击伤害提高36%'))
  throw new Error('加强 profile 验证失败：镜流加强后星魂数据异常');

const marchBasicMeta = skillVariant(baseProfile(march), '100101')?.combatMeta;
if (
  marchBasicMeta?.effect?.label !== '单攻' ||
  marchBasicMeta.battlePointDelta !== 1 ||
  marchBasicMeta.energyGain !== 20 ||
  marchBasicMeta.toughnessDamage !== 10
)
  throw new Error('技能战斗元数据验证失败：三月七普攻');
const marchSkillMeta = skillVariant(baseProfile(march), '100102')?.combatMeta;
if (
  marchSkillMeta?.effect?.label !== '防御' ||
  marchSkillMeta.battlePointDelta !== -1 ||
  marchSkillMeta.energyGain !== 30 ||
  marchSkillMeta.toughnessDamage !== undefined
)
  throw new Error('技能战斗元数据验证失败：三月七战技');

const imbibitorExpected = new Map([
  ['121301', [1, 20, 10]],
  ['121308', [-1, 30, 20]],
  ['121310', [-2, 35, 30]],
  ['121312', [-3, 40, 40]]
]);
for (const [id, [battlePointDelta, energyGain, toughnessDamage]] of imbibitorExpected) {
  const meta = skillVariant(baseProfile(imbibitorLunae), id)?.combatMeta;
  if (
    meta?.battlePointDelta !== battlePointDelta ||
    meta.energyGain !== energyGain ||
    meta.toughnessDamage !== toughnessDamage
  )
    throw new Error(`技能战斗元数据验证失败：丹恒·饮月 ${id}`);
}

const firefly = characters.find((character) => character.id === '1310');
for (const [profile, id] of [
  [firefly?.profiles.base, '131002'],
  [firefly?.profiles.enhanced, '1131002']
] as const) {
  const meta = skillVariant(profile, id)?.combatMeta;
  if (
    gameTextToPlain(meta?.specialResource).trim() !== '40%生命值' ||
    meta?.battlePointDelta !== -1
  )
    throw new Error(`双资源技能验证失败：${id}`);
}

const castoriceSkillMeta = skillVariant(baseProfile(castorice), '140702')?.combatMeta;
if (
  gameTextToPlain(castoriceSkillMeta?.specialResource).trim() !== '30%我方全体当前生命值' ||
  castoriceSkillMeta?.battlePointDelta !== undefined ||
  castoriceSkillMeta.energyGain !== undefined ||
  castoriceSkillMeta.toughnessDamage !== 20
)
  throw new Error('技能战斗元数据验证失败：遐蝶战技');
const castoriceMemospriteMeta = skillVariant(baseProfile(castorice), '1140702')?.combatMeta;
if (
  castoriceMemospriteMeta?.effect?.label !== '群攻' ||
  gameTextToPlain(castoriceMemospriteMeta.specialResource).trim() !== '25%生命值' ||
  castoriceMemospriteMeta.toughnessDamage !== 10
)
  throw new Error('技能战斗元数据验证失败：遐蝶忆灵技');

if (emptySkillDescriptions)
  console.warn(`数据警告：${emptySkillDescriptions} 条技能等级的原始描述为空，已保留明确降级。`);
if (textDiagnostics['unresolved-hash'].count)
  console.warn(
    `数据警告：${textDiagnostics['unresolved-hash'].count} 个 TextHash 在 TextMapCHS 中没有对应文本。`
  );
if (textDiagnostics['unresolved-symbolic-key'].count)
  console.warn(
    `数据警告：${textDiagnostics['unresolved-symbolic-key'].count} 个符号文本键无法解析。`
  );
if (descriptionDiagnostics['missing-param'].count)
  console.warn(
    `数据警告：${descriptionDiagnostics['missing-param'].count} 个描述占位符缺少参数，已保留原占位符。`
  );
for (const category of ['A', 'B', 'C'] as const)
  if (missingTextAudit[category].count)
    console.warn(
      `缺失文本审计 ${category} 类：${missingTextAudit[category].count} 条唯一记录，详见 data/audit/latest.json。`
    );
console.log(
  `数据验证通过：${manifest.sourceCommit.slice(0, 12)}，${search.length} 条简中搜索记录。`
);
