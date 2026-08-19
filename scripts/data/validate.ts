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
import type {
  EndgameMode,
  EndgameModeDataset,
  EndgameStage,
  EnemyOccurrence
} from '../../src/lib/domain/endgame.js';
import { isElementType } from '../../src/lib/domain/elements.js';
import { getBaseStatsAtLevel } from '../../src/lib/domain/stats.js';
import { gameTextToPlain } from '../../src/lib/domain/game-text.js';
import { SKILL_EFFECT_LABELS } from './skill-combat.js';
import type { TextDiagnosticSummary } from './localization.js';
import type { DescriptionDiagnosticSummary } from './levelled.js';
import type { MissingTextAudit } from './missing-text.js';
import { assertDataRoot, auditRoot, generatedRoot, staticGeneratedRoot } from './paths.js';
import { readTable } from './raw.js';
import {
  enemySkillTagCodes,
  enemySpecialResistanceLabels,
  resolveCanonicalEnemyStats
} from './enemy-detail.js';
import {
  addDecimals,
  decimalEquals,
  internalStanceToToughness,
  multiplyDecimals,
  parseDecimal
} from './decimal.js';
import type { EndgameAudit } from './endgame.js';
import { resolvePureFictionFinalHp, resolvePureFictionHpModifier } from './pure-fiction-hp.js';

const manifest = JSON.parse(
  await readFile(path.join(generatedRoot, 'manifest.json'), 'utf8')
) as DataManifest;
if (manifest.schemaVersion !== 19)
  throw new Error(`不支持的生成数据 schema：${manifest.schemaVersion}`);
if (manifest.language !== 'CHS') throw new Error(`生成数据语言错误：${manifest.language}`);

const audit = JSON.parse(await readFile(path.join(auditRoot, 'latest.json'), 'utf8')) as {
  textDiagnostics: TextDiagnosticSummary;
  descriptionDiagnostics: DescriptionDiagnosticSummary;
  missingTextAudit: MissingTextAudit;
  skillCombatAudit: { unknownEffects: string[] };
  enemyAudit: {
    canonicalJoin: { resolved: number; missing: string[] };
    weaknessResistanceConflicts: Array<{ enemyId: string; element: string; value: number }>;
    unknownDebuffResist: unknown[];
    unresolvedSummons: unknown[];
    unresolvedSkills: unknown[];
    unresolvedExtraEffects: unknown[];
    missingAttributes: Record<string, string[]>;
  };
  endgameAudit: EndgameAudit;
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
if (!audit.endgameAudit) throw new Error('生成审计缺少 Endgame 诊断摘要');
if (!audit.enemyAudit) throw new Error('生成审计缺少 Enemy 诊断摘要');
if (audit.endgameAudit.coreErrors.count)
  throw new Error(`Endgame 存在 ${audit.endgameAudit.coreErrors.count} 个核心关联错误`);

const endgameModes: EndgameMode[] = ['moc', 'pf', 'as', 'aa'];
const endgame = Object.fromEntries(
  await Promise.all(
    endgameModes.map(async (mode) => [
      mode,
      JSON.parse(
        await readFile(path.join(generatedRoot, 'endgame', `${mode}.json`), 'utf8')
      ) as EndgameModeDataset
    ])
  )
) as Record<EndgameMode, EndgameModeDataset>;

const occurrencesOf = (stage: EndgameStage): EnemyOccurrence[] =>
  stage.waveModel.kind === 'fixed'
    ? stage.waveModel.waves.flatMap((wave) => wave.enemies)
    : stage.waveModel.waves.flatMap((wave) =>
        wave.monsterGroups.flatMap((group) => group.orderedEnemies)
      );

for (const mode of endgameModes) {
  const dataset = endgame[mode];
  if (dataset.schemaVersion !== 19 || dataset.mode !== mode)
    throw new Error(`Endgame ${mode} schema 或模式标记错误`);
  if (new Set(dataset.groups.map((group) => group.groupId)).size !== dataset.groups.length)
    throw new Error(`Endgame ${mode} 存在重复 GroupID`);
  const encounters = dataset.groups.flatMap((group) => group.encounters);
  const battles = encounters.flatMap((encounter) => encounter.battles);
  const endgameStages = battles.flatMap((battle) => battle.stages);
  const occurrences = endgameStages.flatMap(occurrencesOf);
  const expectedSummary = manifest.endgame.modes[mode];
  const actualSummary = {
    groups: dataset.groups.length,
    encounters: encounters.length,
    battleSlots: battles.length,
    stages: endgameStages.length,
    occurrences: occurrences.length
  };
  if (JSON.stringify(actualSummary) !== JSON.stringify(expectedSummary))
    throw new Error(`Endgame ${mode} manifest 汇总与生成文件不一致`);
  for (const encounter of encounters) {
    if (new Set(encounter.battles.map((battle) => battle.slot)).size !== encounter.battles.length)
      throw new Error(`Endgame ${mode} ${encounter.id} 存在重复 battle slot`);
  }
  for (const occurrence of occurrences) {
    const calculated = multiplyDecimals([
      occurrence.hp.hpBase,
      occurrence.hp.instanceRatio,
      occurrence.hp.levelRatio,
      occurrence.hp.eliteRatio
    ]);
    if (!decimalEquals(calculated, occurrence.hp.baseEncounterMaxHpPerBar))
      throw new Error(
        `Endgame ${mode} MonsterID ${occurrence.monsterId} baseEncounterMaxHpPerBar 不一致`
      );
    if (occurrence.monsterId <= 0 || occurrence.monsterTemplateId <= 0)
      throw new Error(`Endgame ${mode} 包含无效敌人 ID`);
    const speed = occurrence.speed;
    if (speed.status === 'unavailable') {
      if (speed.reason === 'invalid-reference')
        throw new Error(`Endgame ${mode} MonsterID ${occurrence.monsterId} speed 引用无法解析`);
    } else {
      const calculatedSpeed = multiplyDecimals([
        addDecimals([multiplyDecimals([speed.base, speed.instanceRatio]), speed.instanceValue]),
        speed.levelRatio,
        speed.eliteRatio
      ]);
      if (!decimalEquals(calculatedSpeed, speed.configuredValue))
        throw new Error(
          `Endgame ${mode} MonsterID ${occurrence.monsterId} speed configuredValue 不一致`
        );
    }
    const internalStance = occurrence.toughness.internalStance;
    if (internalStance.status === 'unavailable') {
      if (internalStance.reason === 'invalid-reference')
        throw new Error(`Endgame ${mode} MonsterID ${occurrence.monsterId} stance 引用无法解析`);
      if (
        occurrence.toughness.display.status !== 'unavailable' ||
        occurrence.toughness.display.reason !== internalStance.reason
      )
        throw new Error(
          `Endgame ${mode} MonsterID ${occurrence.monsterId} 缺失 Stance 的展示降级不一致`
        );
    } else {
      const calculatedInternal = multiplyDecimals([
        addDecimals([
          multiplyDecimals([internalStance.baseInternal, internalStance.instanceRatio]),
          internalStance.instanceValueInternal
        ]),
        internalStance.hardLevelRatio,
        internalStance.eliteRatio
      ]);
      if (!decimalEquals(calculatedInternal, internalStance.resolvedInternal))
        throw new Error(
          `Endgame ${mode} MonsterID ${occurrence.monsterId} resolved internal stance 不一致`
        );
      const converted = internalStanceToToughness(internalStance.resolvedInternal);
      if (converted === undefined) {
        if (
          occurrence.toughness.display.status !== 'unavailable' ||
          occurrence.toughness.display.reason !== 'non-terminating-unit-conversion'
        )
          throw new Error(
            `Endgame ${mode} MonsterID ${occurrence.monsterId} 非精确韧性换算未正确降级`
          );
      } else if (
        occurrence.toughness.display.status !== 'resolved' ||
        !decimalEquals(converted, occurrence.toughness.display.perBar)
      )
        throw new Error(`Endgame ${mode} MonsterID ${occurrence.monsterId} 玩家韧性值不一致`);
    }
    if (
      occurrence.toughness.barCount !== undefined &&
      (!Number.isSafeInteger(occurrence.toughness.barCount) || occurrence.toughness.barCount < 1)
    )
      throw new Error(`Endgame ${mode} MonsterID ${occurrence.monsterId} StanceCount 无效`);
  }
  if (mode === 'pf') {
    for (const stage of endgameStages) {
      if (stage.waveModel.kind !== 'spawn-sequence')
        throw new Error(`PF Stage ${stage.stageId} 必须使用 spawn-sequence`);
      for (const wave of stage.waveModel.waves) {
        const mechanic = wave.pureFictionMechanic;
        if (!mechanic) throw new Error(`PF Wave ${wave.waveId} 缺少 pureFictionMechanic`);
        const expectedModifier = resolvePureFictionHpModifier(wave.ability, wave.params);
        if (JSON.stringify(expectedModifier) !== JSON.stringify(mechanic.hpModifier))
          throw new Error(`PF Wave ${wave.waveId} HP modifier 与 Ability/ParamList 不一致`);
        if (
          mechanic.rounding.ordinary !== 'half-up' ||
          mechanic.rounding.leader !== 'truncate' ||
          mechanic.rounding.leaderRanks.join(',') !== 'LittleBoss,BigBoss'
        )
          throw new Error(`PF Wave ${wave.waveId} rounding role 元数据不一致`);
        for (const occurrence of wave.monsterGroups.flatMap((group) => group.orderedEnemies)) {
          const actual = occurrence.hp.final;
          const expected = resolvePureFictionFinalHp({
            hpBase: occurrence.hp.hpBase,
            instanceRatio: occurrence.hp.instanceRatio,
            levelRatio: occurrence.hp.levelRatio,
            eliteRatio: occurrence.hp.eliteRatio,
            baseEncounterMaxHpPerBar: occurrence.hp.baseEncounterMaxHpPerBar,
            rank:
              actual.status === 'resolved' && actual.rounding === 'truncate'
                ? 'LittleBoss'
                : 'Minion',
            modifier: mechanic.hpModifier
          }).final;
          if (JSON.stringify(expected) !== JSON.stringify(actual))
            throw new Error(
              `PF Wave ${wave.waveId} MonsterID ${occurrence.monsterId} final HP 不一致`
            );
        }
      }
    }
  } else {
    for (const occurrence of occurrences) {
      const final = occurrence.hp.final;
      if (
        final.status !== 'resolved' ||
        final.source !== 'base-encounter' ||
        !decimalEquals(final.maxHpPerBar, occurrence.hp.baseEncounterMaxHpPerBar)
      )
        throw new Error(`Endgame ${mode} MonsterID ${occurrence.monsterId} final HP 发生模式泄漏`);
    }
  }
}

function fixtureOccurrence(
  mode: EndgameMode,
  groupId: number,
  configId: number,
  stageId: number,
  monsterId: number
): { stage: EndgameStage; occurrence: EnemyOccurrence } {
  const group = endgame[mode].groups.find((item) => item.groupId === groupId);
  const stage = group?.encounters
    .filter((item) => item.configId === configId)
    .flatMap((item) => item.battles)
    .flatMap((battle) => battle.stages)
    .find((item) => item.stageId === stageId);
  const occurrence = stage?.waveModel
    ? occurrencesOf(stage).find((item) => item.monsterId === monsterId)
    : undefined;
  if (!stage || !occurrence)
    throw new Error(
      `缺少 Endgame 回归样本：${mode}/${groupId}/${configId}/${stageId}/${monsterId}`
    );
  return { stage, occurrence };
}

const hpFixtures = [
  ['moc', 1034, 5312, 30124121, 3024020, '11347628.66250'],
  ['pf', 2025, 20254, 30323041, 100402014, '1444452.47100'],
  ['as', 3020, 30204, 420484, 401401304, '14628489.139950'],
  ['aa', 8, 804, 30508022, 501403002, '63467351.45020015200']
] as const;
for (const [mode, groupId, configId, stageId, monsterId, expectedHp] of hpFixtures) {
  const fixture = fixtureOccurrence(mode, groupId, configId, stageId, monsterId);
  if (!decimalEquals(fixture.occurrence.hp.baseEncounterMaxHpPerBar, parseDecimal(expectedHp)))
    throw new Error(`Endgame ${mode} base HP 回归失败：MonsterID ${monsterId}`);
}

const pfFinalHpFixtures = [
  [30323041, 5012010, '218856'],
  [30323041, 5012020, '196971'],
  [30323041, 501211002, '525255'],
  [30323041, 100402014, '57778097'],
  [30323042, 5014023, '52000287'],
  [30323043, 202401406, '72222634']
] as const;
for (const [stageId, monsterId, expectedHp] of pfFinalHpFixtures) {
  const final = fixtureOccurrence('pf', 2025, 20254, stageId, monsterId).occurrence.hp.final;
  if (final.status !== 'resolved' || !decimalEquals(final.maxHpPerBar, parseDecimal(expectedHp)))
    throw new Error(`PF final HP 回归失败：Stage ${stageId} MonsterID ${monsterId}`);
}

const stanceFixtures = [
  [302401304, 420474, '900', '300'],
  [401401304, 420484, '1440', '480'],
  [300402104, 420494, '570', '190']
] as const;
for (const [monsterId, stageId, expectedInternal, expectedDisplay] of stanceFixtures) {
  const occurrence = fixtureOccurrence('as', 3019, 30194, stageId, monsterId).occurrence;
  if (
    occurrence.toughness.internalStance.status !== 'resolved' ||
    !decimalEquals(
      occurrence.toughness.internalStance.resolvedInternal,
      parseDecimal(expectedInternal)
    ) ||
    occurrence.toughness.display.status !== 'resolved' ||
    !decimalEquals(occurrence.toughness.display.perBar, parseDecimal(expectedDisplay))
  )
    throw new Error(`Endgame AS 韧性单位回归失败：MonsterID ${monsterId}`);
}

const stanceAudit = audit.endgameAudit.stanceConversion;
const totalEndgameOccurrences = endgameModes.reduce(
  (total, mode) =>
    total +
    endgame[mode].groups
      .flatMap((group) => group.encounters)
      .flatMap((encounter) => encounter.battles)
      .flatMap((battle) => battle.stages)
      .flatMap(occurrencesOf).length,
  0
);
if (
  !stanceAudit ||
  stanceAudit.totalOccurrences !== totalEndgameOccurrences ||
  stanceAudit.resolvedInternal + stanceAudit.missingInternal !== totalEndgameOccurrences ||
  stanceAudit.resolvedDisplay + stanceAudit.conversionUnavailable !== stanceAudit.resolvedInternal
)
  throw new Error('Endgame 韧性单位审计汇总与生成数据不一致');
if (stanceAudit.nonDivisibleByThree)
  console.warn(
    `Endgame 警告：${stanceAudit.nonDivisibleByThree} 个 resolved internal stance 无法得到整数玩家韧性`
  );
if (stanceAudit.nonPositiveDisplay)
  console.warn(`Endgame 警告：${stanceAudit.nonPositiveDisplay} 个玩家韧性值不是正数`);

const aaFixture = fixtureOccurrence('aa', 8, 804, 30508022, 501403002);
if (!aaFixture.stage.previewMonsterIds.includes(5014030))
  throw new Error('AA 回归失败：未保留 StageConfig preview MonsterID 5014030');
if (occurrencesOf(aaFixture.stage).some((item) => item.monsterId === 5014030))
  throw new Error('AA 回归失败：preview MonsterID 被错误用作实际生成敌人');

for (const [mode, groupId, configId] of [
  ['moc', 1034, 5312],
  ['pf', 2025, 20254],
  ['as', 3020, 30204]
] as const) {
  const encounter = endgame[mode].groups
    .find((group) => group.groupId === groupId)
    ?.encounters.find((item) => item.configId === configId);
  if (encounter?.battles.length !== 3)
    throw new Error(`Endgame ${mode} Tierce 回归失败：${groupId}/${configId}`);
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

const enemyDetails = await Promise.all(
  manifest.routes.enemies.map(
    async (id) =>
      JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'enemies', `${id}.json`), 'utf8')
      ) as Enemy
  )
);
const rawRoot = assertDataRoot();
const [rawTemplates, rawConfigs, rawHardLevels, rawElites] = await Promise.all([
  readTable<Record<string, any>>(rawRoot, 'MonsterTemplateConfig'),
  readTable<Record<string, any>>(rawRoot, 'MonsterConfig'),
  readTable<Record<string, any>>(rawRoot, 'HardLevelGroup'),
  readTable<Record<string, any>>(rawRoot, 'EliteGroup')
]);
const rawTemplateById = new Map(
  rawTemplates.map((row) => [String(row.MonsterTemplateID), row] as const)
);
const rawConfigByMonsterId = new Map(
  rawConfigs.map((row) => [String(row.MonsterID), row] as const)
);
const rawHardLevelsByGroup = new Map<string, Record<string, any>[]>();
for (const row of rawHardLevels) {
  const key = String(row.HardLevelGroup);
  rawHardLevelsByGroup.set(key, [...(rawHardLevelsByGroup.get(key) ?? []), row]);
}
const rawEliteById = new Map(rawElites.map((row) => [String(row.EliteGroup), row] as const));
let weaknessResistanceConflictCount = 0;
for (const enemy of enemyDetails) {
  if ('stages' in enemy) throw new Error(`敌人 ${enemy.id} 仍包含已删除的 stages 字段`);
  const template = rawTemplateById.get(enemy.id);
  const config = rawConfigByMonsterId.get(enemy.id);
  if (!template || !config || String(config.MonsterTemplateID) !== enemy.id)
    throw new Error(`敌人 ${enemy.id} canonical join 失败`);
  const hardLevels = rawHardLevelsByGroup.get(String(config.HardLevelGroup)) ?? [];
  const elite = rawEliteById.get(String(config.EliteGroup));
  if (!elite) throw new Error(`敌人 ${enemy.id} 缺少 EliteGroup`);
  const expectedStats = resolveCanonicalEnemyStats(template, config, hardLevels, elite);
  if (JSON.stringify(enemy.stats) !== JSON.stringify(expectedStats))
    throw new Error(`敌人 ${enemy.id} 等级属性未通过共享 resolver 重算`);
  if (
    enemy.stats.minLevel !== 1 ||
    enemy.stats.maxLevel !== 100 ||
    enemy.stats.defaultLevel !== 95 ||
    enemy.stats.levels.length !== 100
  )
    throw new Error(`敌人 ${enemy.id} Lv.1–100 属性范围异常`);
  if (
    enemy.resistances.some((resistance) => !isElementType(resistance.element) || !resistance.value)
  )
    throw new Error(`敌人 ${enemy.id} 包含零值或未知元素抗性`);
  weaknessResistanceConflictCount += enemy.resistances.filter((resistance) =>
    enemy.weaknesses.some((weakness) => weakness.element === resistance.element)
  ).length;
  for (const resistance of enemy.specialResistances)
    if (enemySpecialResistanceLabels[resistance.code] !== resistance.label)
      throw new Error(`敌人 ${enemy.id} 特殊状态抗性映射异常：${resistance.code}`);
  if (
    new Set(enemy.summons.map((summon) => summon.monsterTemplateId)).size !== enemy.summons.length
  )
    throw new Error(`敌人 ${enemy.id} 召唤目标未按模板去重`);
  for (const summon of enemy.summons)
    if (
      !rawConfigByMonsterId.has(summon.monsterId) ||
      !rawTemplateById.has(summon.monsterTemplateId) ||
      summon.href !== `/enemies/${summon.monsterTemplateId}`
    )
      throw new Error(`敌人 ${enemy.id} 召唤引用无效：${summon.monsterId}`);
  const rawSkillIds = (config.SkillList ?? []).map(String);
  const generatedSkillIds = enemy.skills.map((skill) => skill.id);
  let generatedIndex = 0;
  for (const rawSkillId of rawSkillIds) {
    if (rawSkillId === generatedSkillIds[generatedIndex]) generatedIndex += 1;
  }
  if (generatedIndex !== generatedSkillIds.length)
    throw new Error(`敌人 ${enemy.id} 技能链或顺序异常`);
  for (const skill of enemy.skills) {
    if (!skill.description.trim() || skill.description === '资料未提供')
      throw new Error(`敌人 ${enemy.id} 技能 ${skill.id} 缺少公开描述`);
    if (skill.tag.known && enemySkillTagCodes[skill.tag.label] !== skill.tag.code)
      throw new Error(`敌人 ${enemy.id} 技能 ${skill.id} tag 映射异常`);
    if (skill.phases.some((phase) => !Number.isSafeInteger(phase) || phase <= 0))
      throw new Error(`敌人 ${enemy.id} 技能 ${skill.id} PhaseList 无效`);
    for (const forbidden of [
      'SPHitBase',
      'DelayRatio',
      'ParamList',
      'ModifierList',
      'AttackType',
      'SkillTriggerKey',
      'AI'
    ])
      if (forbidden in skill)
        throw new Error(`敌人 ${enemy.id} 技能 ${skill.id} 暴露构建期字段 ${forbidden}`);
  }
  const phaseIndexes = enemy.skillPhases.map((phase) => phase.index);
  if (
    !phaseIndexes.length ||
    new Set(phaseIndexes).size !== phaseIndexes.length ||
    phaseIndexes.some((phase) => !Number.isSafeInteger(phase) || phase <= 0) ||
    phaseIndexes.some((phase, index) => index > 0 && phase <= phaseIndexes[index - 1])
  )
    throw new Error(`敌人 ${enemy.id} 阶段索引无效或未升序`);
  const publicSkillIds = new Set(generatedSkillIds);
  const phaseSkillIds = new Set<string>();
  for (const phase of enemy.skillPhases) {
    if (new Set(phase.skillIds).size !== phase.skillIds.length)
      throw new Error(`敌人 ${enemy.id} 阶段 ${phase.index} 包含重复技能`);
    let previousRawIndex = -1;
    for (const skillId of phase.skillIds) {
      if (!publicSkillIds.has(skillId))
        throw new Error(`敌人 ${enemy.id} 阶段 ${phase.index} 引用了非公开技能 ${skillId}`);
      const rawIndex = rawSkillIds.indexOf(skillId);
      if (rawIndex <= previousRawIndex)
        throw new Error(`敌人 ${enemy.id} 阶段 ${phase.index} 技能顺序异常`);
      previousRawIndex = rawIndex;
      phaseSkillIds.add(skillId);
    }
  }
  for (const skillId of generatedSkillIds)
    if (!phaseSkillIds.has(skillId))
      throw new Error(`敌人 ${enemy.id} 公开技能 ${skillId} 未归入任何阶段`);
}
if (
  audit.enemyAudit.canonicalJoin.resolved !== enemyDetails.length ||
  audit.enemyAudit.canonicalJoin.missing.length
)
  throw new Error('Enemy canonical join 审计摘要异常');
if (audit.enemyAudit.weaknessResistanceConflicts.length !== weaknessResistanceConflictCount)
  throw new Error('Enemy 弱点/抗性冲突审计摘要异常');
for (const [label, unresolved] of [
  ['DebuffResist', audit.enemyAudit.unknownDebuffResist],
  ['summon', audit.enemyAudit.unresolvedSummons],
  ['skill', audit.enemyAudit.unresolvedSkills],
  ['ExtraEffect', audit.enemyAudit.unresolvedExtraEffects]
] as const)
  if (unresolved.length) console.warn(`Enemy 警告：${unresolved.length} 个 unresolved ${label}`);
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
      if (meta.stanceDisplay) {
        const stanceTypes = new Set(['single', 'aoe', 'blast']);
        if (
          !meta.stanceDisplay.length ||
          new Set(meta.stanceDisplay.map((item) => item.type)).size !== meta.stanceDisplay.length ||
          meta.stanceDisplay.some(
            (item) => !stanceTypes.has(item.type) || !Number.isFinite(item.value) || item.value <= 0
          )
        )
          throw new Error(`角色 ${character.id} 技能 ${variant.id} 的 ShowStanceList 展示值无效`);
      }
      for (const effect of meta.extraEffects ?? []) {
        if (!effect.id || !effect.name.trim() || !effect.description.trim())
          throw new Error(`角色 ${character.id} 技能 ${variant.id} 的 ExtraEffect 无效`);
      }
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
    for (const effect of trace.extraEffects ?? []) {
      if (
        !effect.id ||
        !gameTextToPlain(effect.name).trim() ||
        !gameTextToPlain(effect.description).trim()
      )
        throw new Error(`角色 ${character.id} ${mode} profile 的行迹 ${trace.id} ExtraEffect 无效`);
    }
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
  for (const eidolon of profile.eidolons) {
    for (const effect of eidolon.extraEffects ?? []) {
      if (
        !effect.id ||
        !gameTextToPlain(effect.name).trim() ||
        !gameTextToPlain(effect.description).trim()
      )
        throw new Error(
          `角色 ${character.id} ${mode} profile 的星魂 ${eidolon.id} ExtraEffect 无效`
        );
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
  gameTextToPlain(
    jingliuBase?.traces.find((trace) => trace.name === '死境')?.description ?? ''
  ).includes('终结技伤害提高20%')
)
  throw new Error('加强 profile 验证失败：镜流加强前混入加强行迹');
if (
  !gameTextToPlain(
    jingliuEnhanced?.traces.find((trace) => trace.name === '死境')?.description ?? ''
  ).includes('终结技伤害提高20%')
)
  throw new Error('加强 profile 验证失败：镜流加强后行迹数据异常');
if (!gameTextToPlain(jingliuBase?.eidolons[0]?.description ?? '').includes('暴击伤害提高24%'))
  throw new Error('加强 profile 验证失败：镜流加强前星魂数据异常');
if (!gameTextToPlain(jingliuEnhanced?.eidolons[0]?.description ?? '').includes('暴击伤害提高36%'))
  throw new Error('加强 profile 验证失败：镜流加强后星魂数据异常');

const marchBasicMeta = skillVariant(baseProfile(march), '100101')?.combatMeta;
if (
  marchBasicMeta?.effect?.label !== '单攻' ||
  marchBasicMeta.battlePointDelta !== 1 ||
  marchBasicMeta.energyGain !== 20 ||
  JSON.stringify(marchBasicMeta.stanceDisplay) !==
    JSON.stringify([{ type: 'single', value: 10 }]) ||
  marchBasicMeta.toughnessDamage !== undefined
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
  ['121301', [1, 20, [{ type: 'single', value: 10 }]]],
  ['121308', [-1, 30, [{ type: 'single', value: 20 }]]],
  [
    '121310',
    [
      -2,
      35,
      [
        { type: 'single', value: 30 },
        { type: 'blast', value: 10 }
      ]
    ]
  ],
  [
    '121312',
    [
      -3,
      40,
      [
        { type: 'single', value: 40 },
        { type: 'blast', value: 20 }
      ]
    ]
  ]
]);
for (const [id, [battlePointDelta, energyGain, stanceDisplay]] of imbibitorExpected) {
  const meta = skillVariant(baseProfile(imbibitorLunae), id)?.combatMeta;
  if (
    meta?.battlePointDelta !== battlePointDelta ||
    meta.energyGain !== energyGain ||
    JSON.stringify(meta.stanceDisplay) !== JSON.stringify(stanceDisplay) ||
    meta.toughnessDamage !== undefined
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
  JSON.stringify(castoriceSkillMeta.stanceDisplay) !==
    JSON.stringify([
      { type: 'single', value: 20 },
      { type: 'blast', value: 10 }
    ])
)
  throw new Error('技能战斗元数据验证失败：遐蝶战技');
const castoriceMemospriteMeta = skillVariant(baseProfile(castorice), '1140702')?.combatMeta;
if (
  castoriceMemospriteMeta?.effect?.label !== '群攻' ||
  gameTextToPlain(castoriceMemospriteMeta.specialResource).trim() !== '25%生命值' ||
  JSON.stringify(castoriceMemospriteMeta.stanceDisplay) !==
    JSON.stringify([{ type: 'aoe', value: 10 }])
)
  throw new Error('技能战斗元数据验证失败：遐蝶忆灵技');

const theHertaEnhancedSkillMeta = skillVariant(baseProfile(theHerta), '140109')?.combatMeta;
if (
  JSON.stringify(theHertaEnhancedSkillMeta?.stanceDisplay) !==
    JSON.stringify([
      { type: 'single', value: 20 },
      { type: 'blast', value: 10 }
    ]) ||
  theHertaEnhancedSkillMeta?.toughnessDamage !== undefined
)
  throw new Error('技能战斗元数据验证失败：大黑塔强化战技');

const huntMarch = characters.find((character) => character.id === '1224');
if (skillVariant(baseProfile(huntMarch), '122401')?.combatMeta.extraEffects !== undefined)
  throw new Error('技能 ExtraEffect 归属失败：三月七·巡猎普通普攻');
if (skillVariant(baseProfile(huntMarch), '122408')?.combatMeta.extraEffects?.[0]?.id !== '30000002')
  throw new Error('技能 ExtraEffect 归属失败：三月七·巡猎强化普攻');

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
