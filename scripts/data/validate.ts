import { validateEnhancementComparisonSemantics } from './validation/enhancement-comparison.js';
import { validateTrainingSemantics } from './validation/training.js';
import { validateCharacterExtensionSemantics } from './validation/character-extensions.js';
import { validatePhaseHpSemantics } from './validation/phase-hp.js';
import { normalizeEnemySkillKind, normalizeEnemySkillTag } from './enemy-skill-policy.js';
import { createTextResolver } from './localization.js';
import { parameterized } from './domain/shared.js';
import { projectEnemyIdentityText, projectEnemySkillDescription } from './projection/enemy.js';
import { enemyTextSource, type EnemyDomainAudit } from './domain/enemy.js';
import { compactEnemyStatProgression } from '../../src/lib/domain/enemy-view.js';
import {
  buildSearchDocuments,
  loadPlayerAliases,
  searchInputsPath,
  type SearchBuildInputs
} from './search-documents.js';
import { access, readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import type {
  CatalogEntry,
  Character,
  CharacterProfile,
  Enemy,
  HomepageVersionData,
  LightCone
} from '../../src/lib/domain/types.js';
import {
  collectEndgameSearchTargets,
  endgameOccurrenceLocatorKey,
  GLOBAL_SEARCH_SCHEMA_VERSION,
  type EndgameOccurrenceShard,
  type GlobalSearchIndex
} from '../../src/lib/domain/search-index.js';
import type {
  EndgameDatasetByMode,
  EndgameMode,
  EndgameStage,
  EnemyOccurrence
} from '../../src/lib/domain/endgame.js';
import { isElementType, normalizeElementType } from '../../src/lib/domain/elements.js';
import { gameTextToPlain } from '../../src/lib/domain/game-text.js';
import { SKILL_EFFECT_LABELS } from './skill-combat.js';
import { isPlayerFacingSkillConfig } from './skills.js';
import type { TextDiagnosticSummary } from './localization.js';
import type { DescriptionDiagnosticSummary } from './levelled.js';
import type { MissingTextAudit } from './missing-text.js';
import type { SpecialEffectAudit } from './special-effects.js';
import {
  createAvatarSpecialSkillTreeAudit,
  indexAvatarSpecialSkillRelations,
  normalizeAvatarSpecialSkillRelations,
  resolveAvatarSpecialSkillRelations,
  type AvatarSpecialSkillTreeAudit
} from './avatar-special-skills.js';
import { auditRoot, generatedRoot, staticGeneratedRoot } from './paths.js';
import { numberOf, readTable } from './raw.js';
import { loadCharacterTeamRecommendations } from './team-recommendations.js';
import { TEAM_RECOMMENDATIONS_ARTIFACT } from '../../src/lib/domain/team-recommendation.js';
import {
  buildEnemySkillPhases,
  normalizeEnemyPhases,
  normalizeSpecialResistances,
  resolveEnemyVariantStats
} from './enemy-detail.js';
import {
  addDecimals,
  decimalOf,
  decimalEquals,
  internalStanceToToughness,
  multiplyDecimals
} from './decimal.js';
import type { EndgameAudit } from './endgame.js';
import { resolvePureFictionFinalHp, resolvePureFictionHpModifier } from './pure-fiction-hp.js';
import type { Locale } from './locale-registry.js';
import { assertCrossLocaleStructuralParity } from './structural-parity.js';
import { assertEnglishCjkReport, auditEnglishCjk } from './english-cjk.js';
import {
  assertHomepageVersionData,
  buildHomepageVersionData,
  loadHomepageBaseline,
  extractHomepageIds,
  homepageCategories
} from './homepage.js';
import { identityTables } from './homepage-history.js';
import { buildEndgameOccurrenceShards } from './endgame-occurrence-shards.js';
import { getLocaleProjectionPolicy } from './projection/policy.js';
import {
  assertValidationReport,
  mergeValidationReports,
  validateLocalizationHealth,
  validateProductProjection,
  validateRelationAudits,
  type ProductProjectionForValidation
} from './robustness-invariants.js';
import { validateBuildInputs } from './validation/build-inputs.js';
import { buildPlayerRuntimeData, PLAYER_RUNTIME_TABLE_NAMES } from './player-runtime.js';
import { buildRatingV2Profiles, loadRatingV2Tables } from './relic-rating-v2.js';
import { stableBenchmarkSerialize } from '../../src/lib/relic-score/benchmark/identity.js';

const { manifest, rawRoot, textMaps: currentTextMaps } = await validateBuildInputs();
const publishedTeams = JSON.parse(
  await readFile(path.join(generatedRoot, TEAM_RECOMMENDATIONS_ARTIFACT), 'utf8')
);
const expectedTeams = await loadCharacterTeamRecommendations(
  rawRoot,
  new Set(manifest.routes.characters)
);
if (!isDeepStrictEqual(publishedTeams, expectedTeams))
  throw new Error('[TeamBuild] Published recommendations differ from pinned source semantics');
const ratingV2Profiles = JSON.parse(
  await readFile(path.join(generatedRoot, 'runtime/relic-rating-v2.json'), 'utf8')
);
const expectedRatingV2Profiles = await buildRatingV2Profiles(
  rawRoot,
  await loadRatingV2Tables(rawRoot),
  manifest.sourceCommit
);
if (
  stableBenchmarkSerialize(ratingV2Profiles) !== stableBenchmarkSerialize(expectedRatingV2Profiles)
)
  throw new Error('Rating V2 profiles differ from pinned raw semantics');
await validateTrainingSemantics(rawRoot, staticGeneratedRoot, currentTextMaps);
await validateCharacterExtensionSemantics(rawRoot, generatedRoot, currentTextMaps);
await validateEnhancementComparisonSemantics(
  rawRoot,
  generatedRoot,
  manifest.enhancementComparisonIds,
  currentTextMaps
);
const playerRuntimeTables = Object.fromEntries(
  await Promise.all(
    PLAYER_RUNTIME_TABLE_NAMES.map(async (name) => [name, await readTable(rawRoot, name)] as const)
  )
);
buildPlayerRuntimeData(playerRuntimeTables);
const productRoot = path.join(generatedRoot, 'views', 'zh-CN');
const homepage: HomepageVersionData = JSON.parse(
  await readFile(path.join(productRoot, 'homepage.json'), 'utf8')
);
const homepageCatalogs = Object.fromEntries(
  await Promise.all(
    homepageCategories.map(async (category) => [
      category,
      JSON.parse(await readFile(path.join(productRoot, 'catalogs', `${category}.json`), 'utf8'))
    ])
  )
) as Record<(typeof homepageCategories)[number], CatalogEntry[]>;
assertHomepageVersionData(homepage, homepageCatalogs);
const homepageBaseline = await loadHomepageBaseline(manifest.sourceCommit);
const homepageTables = Object.fromEntries(
  await Promise.all(
    identityTables.map(async (name) => [
      name,
      await readTable<Record<string, unknown>>(rawRoot, name)
    ])
  )
);
const expectedHomepage = buildHomepageVersionData(
  homepageBaseline,
  extractHomepageIds(homepageTables),
  manifest.gameVersion
);
if (JSON.stringify(homepage) !== JSON.stringify(expectedHomepage))
  throw new Error('Homepage differs from pinned source and trusted baseline');

const audit = JSON.parse(await readFile(path.join(auditRoot, 'latest.json'), 'utf8')) as {
  upstreamTables: Record<string, number>;
  textDiagnostics: TextDiagnosticSummary;
  descriptionDiagnostics: DescriptionDiagnosticSummary;
  missingTextAudit: MissingTextAudit;
  skillCombatAudit: { unknownEffects: string[]; unsupportedHiddenDiscriminants?: string[] };
  avatarSpecialSkillTreeAudit: AvatarSpecialSkillTreeAudit;
  specialEffectAudit: SpecialEffectAudit;
  enemyAudit: EnemyDomainAudit;
  endgameAudit: EndgameAudit;
  localeAudits: Record<
    Locale,
    {
      textDiagnostics: TextDiagnosticSummary;
      localizationHealth: import('./localization.js').LocalizationHealthSummary;
      enemyAudit: import('./robustness-invariants.js').EnemyRelationAudit;
    }
  >;
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
if (!audit.avatarSpecialSkillTreeAudit) throw new Error('生成审计缺少 AvatarSpecialSkillTree 诊断');
if (!audit.specialEffectAudit) throw new Error('生成审计缺少 Character Special Effect 诊断');
if (!audit.endgameAudit) throw new Error('生成审计缺少 Endgame 诊断摘要');
if (!audit.enemyAudit) throw new Error('生成审计缺少 Enemy 诊断摘要');
if (audit.skillCombatAudit.unknownEffects.length)
  console.warn(
    `Character schema 警告：${audit.skillCombatAudit.unknownEffects.length} 个已分类 SkillEffect fallback；首个样本：${audit.skillCombatAudit.unknownEffects[0]}`
  );
if (audit.skillCombatAudit.unsupportedHiddenDiscriminants?.length)
  console.warn(
    `Character schema 警告：${audit.skillCombatAudit.unsupportedHiddenDiscriminants.length} 个 hidden/unreachable skill discriminant；首个样本：${audit.skillCombatAudit.unsupportedHiddenDiscriminants[0]}`
  );
if (audit.endgameAudit.coreErrors.count)
  throw new Error(`Endgame 存在 ${audit.endgameAudit.coreErrors.count} 个核心关联错误`);

const endgameModes: EndgameMode[] = ['moc', 'pf', 'as', 'aa'];
const endgame = Object.fromEntries(
  await Promise.all(
    endgameModes.map(async (mode) => [
      mode,
      JSON.parse(await readFile(path.join(productRoot, 'endgame', `${mode}.json`), 'utf8'))
    ])
  )
) as EndgameDatasetByMode;

const occurrencesOf = (stage: EndgameStage): EnemyOccurrence[] =>
  stage.waveModel.kind === 'fixed'
    ? stage.waveModel.waves.flatMap((wave) => wave.enemies)
    : stage.waveModel.waves.flatMap((wave) =>
        wave.monsterGroups.flatMap((group) => group.orderedEnemies)
      );

for (const mode of endgameModes) {
  const dataset = endgame[mode];
  if (dataset.schemaVersion !== 26 || dataset.mode !== mode)
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

const expected: Record<string, number> = {
  characters: manifest.counts.characters,
  'light-cones': manifest.counts.lightCones,
  relics: manifest.counts.relics,
  enemies: manifest.counts.enemies
};
for (const [category, count] of Object.entries(expected)) {
  const categoryRoot = productRoot;
  const catalog = JSON.parse(
    await readFile(path.join(categoryRoot, 'catalogs', `${category}.json`), 'utf8')
  ) as CatalogEntry[];
  if (catalog.length !== count)
    throw new Error(`${category} 数量不一致：${catalog.length} != ${count}`);
  if (new Set(catalog.map((item) => item.id)).size !== catalog.length)
    throw new Error(`${category} 存在重复 ID`);
  for (const item of catalog)
    await access(path.join(categoryRoot, 'details', category, `${item.id}.json`));
}

const [rawTemplates, rawConfigs, rawHardLevels, rawElites, rawEnemySkills] = await Promise.all([
  readTable<Record<string, any>>(rawRoot, 'MonsterTemplateConfig'),
  readTable<Record<string, any>>(rawRoot, 'MonsterConfig'),
  readTable<Record<string, any>>(rawRoot, 'HardLevelGroup'),
  readTable<Record<string, any>>(rawRoot, 'EliteGroup'),
  readTable<Record<string, any>>(rawRoot, 'MonsterSkillConfig')
]);
const rawSkillById = new Map(rawEnemySkills.map((row) => [String(row.SkillID), row]));
await validatePhaseHpSemantics(rawRoot, endgame, rawTemplates, rawConfigs, rawEnemySkills);
const skillDescriptionResolvers = await Promise.all(
  (['zh-CN', 'en'] as const).map(async (locale) => ({
    locale,
    resolver: await createTextResolver(
      { locale, textMapCode: locale === 'zh-CN' ? 'CHS' : 'EN' },
      currentTextMaps[locale]
    )
  }))
);
const displayableSkillIds = new Map(
  skillDescriptionResolvers.map(
    ({ locale, resolver }) =>
      [
        locale,
        new Map(
          rawEnemySkills.map((row) => {
            const id = String(row.SkillID);
            return [
              id,
              projectEnemySkillDescription(
                resolver,
                id,
                parameterized(row.SkillDesc, row.ParamList)
              ).status === 'available'
            ] as const;
          })
        )
      ] as const
  )
);
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
const rawMonstersByTemplate = new Map<string, string[]>();
const expectedProgressions = new Map(
  rawConfigs.map((raw) => {
    const id = String(raw.MonsterID);
    const templateId = String(raw.MonsterTemplateID);
    const ids = rawMonstersByTemplate.get(templateId) ?? [];
    ids.push(id);
    rawMonstersByTemplate.set(templateId, ids);
    const template = rawTemplateById.get(templateId);
    const hard = rawHardLevelsByGroup.get(String(raw.HardLevelGroup));
    const elite = rawEliteById.get(String(raw.EliteGroup));
    if (!template || !hard || !elite)
      throw new Error(`Monster ${id} has an invalid Template or difficulty reference`);
    return [
      id,
      compactEnemyStatProgression(resolveEnemyVariantStats(template, raw, hard, elite))
    ] as const;
  })
);

const search = JSON.parse(
  await readFile(path.join(staticGeneratedRoot, 'zh-CN', 'search.json'), 'utf8')
) as GlobalSearchIndex;
if (search.schemaVersion !== GLOBAL_SEARCH_SCHEMA_VERSION) throw new Error('搜索索引 schema 异常');
const searchInputs = JSON.parse(await readFile(searchInputsPath, 'utf8')) as SearchBuildInputs;
const expectedSearch = buildSearchDocuments(searchInputs, 'zh-CN', {
  kind: 'maintained',
  value: await loadPlayerAliases()
});
if (JSON.stringify(search) !== JSON.stringify(expectedSearch))
  throw new Error('搜索文档与当前 metadata/catalog 不一致');
if (
  search.documents.filter((doc) => doc.target.kind !== 'endgame').length !==
  Object.values(expected).reduce((sum, value) => sum + value, 0)
)
  throw new Error('搜索文档数量与目录数量不一致');
const projectedEndgameNames = new Map(
  searchInputs.catalogs.enemy.map(({ id, name }) => [id, name])
);
const expectedEndgameSearch = collectEndgameSearchTargets(endgame, projectedEndgameNames);
if (search.locale !== 'zh-CN') throw new Error('搜索索引 locale 异常');
if (search.endgameTargets.length !== expectedEndgameSearch.length)
  throw new Error('Endgame 搜索 template target 数量异常');
if (new Set(search.endgameTargets.map(({ id }) => id)).size !== search.endgameTargets.length)
  throw new Error('Endgame 搜索 target ID 冲突');
const indexedLocatorKeys = search.endgameTargets.flatMap(({ occurrences }) =>
  occurrences.map(({ locator }) => endgameOccurrenceLocatorKey(locator))
);
const expectedLocatorKeys = expectedEndgameSearch.flatMap(({ occurrences }) =>
  occurrences.map(({ locator }) => endgameOccurrenceLocatorKey(locator))
);
if (JSON.stringify(indexedLocatorKeys) !== JSON.stringify(expectedLocatorKeys))
  throw new Error('Endgame 搜索 locator 无法按展示模型解析');
if (new Set(indexedLocatorKeys).size !== indexedLocatorKeys.length)
  throw new Error('Endgame 搜索 locator 不唯一');

let emptySkillDescriptions = 0;
const characters = await Promise.all(
  manifest.routes.characters.map(
    async (id) =>
      JSON.parse(
        await readFile(path.join(productRoot, 'details', 'characters', `${id}.json`), 'utf8')
      ) as Character
  )
);
const [
  rawAvatarSkills,
  rawAvatarSkillsLd,
  rawServantSkills,
  rawAvatarConfigs,
  rawAvatarTraces,
  rawAvatarSpecialSkillRelations
] = await Promise.all([
  readTable<Record<string, any>>(rawRoot, 'AvatarSkillConfig'),
  readTable<Record<string, any>>(rawRoot, 'AvatarSkillConfigLD'),
  readTable<Record<string, any>>(rawRoot, 'AvatarServantSkillConfig'),
  readTable<Record<string, any>>(rawRoot, 'AvatarConfig'),
  readTable<Record<string, any>>(rawRoot, 'AvatarSkillTreeConfig'),
  readTable<Record<string, any>>(rawRoot, 'AvatarSpecialSkillTree')
]);
const avatarSpecialSkillValidationAudit = createAvatarSpecialSkillTreeAudit();
const traceRowsByAvatarId = new Map<string, Record<string, any>[]>();
for (const row of rawAvatarTraces) {
  const avatarId = String(row.AvatarID);
  traceRowsByAvatarId.set(avatarId, [...(traceRowsByAvatarId.get(avatarId) ?? []), row]);
}
const resolvedAvatarSpecialSkillRelations = resolveAvatarSpecialSkillRelations(
  normalizeAvatarSpecialSkillRelations(
    rawAvatarSpecialSkillRelations,
    avatarSpecialSkillValidationAudit
  ),
  {
    avatarConfigsById: new Map(rawAvatarConfigs.map((row) => [String(row.AvatarID), row])),
    avatarSkillIds: new Set(
      [...rawAvatarSkills, ...rawAvatarSkillsLd].map((row) => String(row.SkillID))
    ),
    traceRowsByAvatarId
  },
  avatarSpecialSkillValidationAudit
);
const explicitlyShownSkillsByAvatar = new Map(
  [...indexAvatarSpecialSkillRelations(resolvedAvatarSpecialSkillRelations)].map(
    ([avatarId, relations]) => [
      avatarId,
      new Set(relations.map((relation) => relation.showSkillId))
    ]
  )
);
const collectHiddenSkillIds = (label: string, rows: Record<string, any>[]): Set<string> => {
  const groupedRows = new Map<string, Record<string, any>[]>();
  for (const row of rows) {
    const id = String(row.SkillID);
    groupedRows.set(id, [...(groupedRows.get(id) ?? []), row]);
  }
  const hiddenIds = new Set<string>();
  for (const [id, skillRows] of groupedRows)
    if (!isPlayerFacingSkillConfig(skillRows, `${label}.${id}`)) hiddenIds.add(id);
  return hiddenIds;
};
const hiddenAvatarSkillIds = collectHiddenSkillIds('AvatarSkillConfig', [
  ...rawAvatarSkills,
  ...rawAvatarSkillsLd
]);
const hiddenServantSkillIds = collectHiddenSkillIds('AvatarServantSkillConfig', rawServantSkills);
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
    if (variantIds.size !== card.variants.length)
      throw new Error(`角色 ${character.id} 的 ${card.category} 存在重复 Skill Variant ID`);
    for (const progression of card.progressions) {
      if (!progression.availableLevels.length)
        throw new Error(`角色 ${character.id} 的 ${card.category} progression 没有共同等级`);
      if (!progression.availableLevels.includes(progression.defaultLevel))
        throw new Error(`角色 ${character.id} 的 ${card.category} 默认等级无效`);
      if (progression.variantIds.some((id) => !variantIds.has(id)))
        throw new Error(`角色 ${character.id} 的 ${card.category} progression 引用了未知变体`);
    }
    for (const variant of card.variants) {
      if (
        variant.source === 'avatar' &&
        hiddenAvatarSkillIds.has(variant.id) &&
        !explicitlyShownSkillsByAvatar.get(character.id)?.has(variant.id)
      )
        throw new Error(`角色 ${character.id} 仍包含 HideInUI Avatar Skill ${variant.id}`);
      if (variant.source === 'memosprite' && hiddenServantSkillIds.has(variant.id))
        throw new Error(`角色 ${character.id} 仍包含 HideInUI Memosprite Skill ${variant.id}`);
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
  const specialEffectIdentities = new Set<string>();
  let previousServantOrder = Number.NEGATIVE_INFINITY;
  for (const entry of profile.specialEffects) {
    const skill = entry.skill;
    const identity =
      entry.kind === 'avatar-skill-link'
        ? `${entry.kind}:${skill.id}`
        : `${entry.kind}:${skill.id}:${entry.linkedAvatarId}`;
    if (specialEffectIdentities.has(identity))
      throw new Error(`角色 ${character.id} ${mode} profile 存在重复 Special Effect ${identity}`);
    specialEffectIdentities.add(identity);
    if (!skill.id || !gameTextToPlain(skill.name).trim() || !skill.levels.length)
      throw new Error(`角色 ${character.id} ${mode} profile 的 Special Effect skill 无效`);
    if (!skill.combatMeta)
      throw new Error(`角色 ${character.id} Special Effect skill ${skill.id} 缺少战斗元数据`);
    if (entry.kind === 'avatar-skill-link') {
      if (skill.source !== 'avatar')
        throw new Error(`角色 ${character.id} Avatar Special Effect ${skill.id} 来源异常`);
      for (const [field, ids] of [
        ['linkedAvatarIds', entry.linkedAvatarIds],
        ['simplifiedLinkedAvatarIds', entry.simplifiedLinkedAvatarIds]
      ] as const)
        if (ids.some((id) => !/^\d+$/.test(id)) || new Set(ids).size !== ids.length)
          throw new Error(
            `角色 ${character.id} Avatar Special Effect ${skill.id} 的 ${field} 无效`
          );
    } else if (entry.kind === 'servant-skill-link') {
      if (skill.source !== 'memosprite')
        throw new Error(`角色 ${character.id} Servant Special Effect ${skill.id} 来源异常`);
      if (
        !Number.isInteger(entry.order) ||
        entry.order <= 0 ||
        entry.order < previousServantOrder ||
        !/^\d+$/.test(entry.linkedAvatarId) ||
        !entry.tarotFigurePath.trim() ||
        !entry.tarotIconPath.trim()
      )
        throw new Error(`角色 ${character.id} Servant Special Effect ${skill.id} relation 无效`);
      previousServantOrder = entry.order;
    } else {
      if (
        skill.source !== 'avatar' ||
        skill.progressionId !== null ||
        !profile.seriesSkills.some((series) => series.skillId === entry.rootSkillId) ||
        !Number.isInteger(entry.order) ||
        entry.order < 0 ||
        !/^\d+$/.test(entry.linkedAvatarId)
      )
        throw new Error(`角色 ${character.id} SeriesSkill relation 无效`);
    }
    for (const effect of skill.combatMeta.extraEffects ?? [])
      if (
        !effect.id ||
        !gameTextToPlain(effect.name).trim() ||
        !gameTextToPlain(effect.description).trim()
      )
        throw new Error(`角色 ${character.id} Special Effect skill ${skill.id} ExtraEffect 无效`);
    for (const level of skill.levels)
      if (level.description !== level.descriptionTokens.map((token) => token.value).join(''))
        throw new Error(
          `角色 ${character.id} Special Effect skill ${skill.id} Lv.${level.level} 语义文本不一致`
        );
  }
  const tracesById = new Map(profile.traces.map((trace) => [trace.id, trace]));
  if (tracesById.size !== profile.traces.length)
    throw new Error(`角色 ${character.id} ${mode} profile 存在重复行迹节点`);
  for (const trace of profile.traces) {
    const expectedType = trace.sourcePointType === 1 ? 'stat' : 'ability';
    if (![1, 3, 5].includes(trace.sourcePointType) || trace.type !== expectedType)
      throw new Error(`角色 ${character.id} ${mode} profile 的行迹 ${trace.id} 类型映射异常`);
    if (trace.type === 'stat') {
      if (!trace.description)
        throw new Error(
          `角色 ${character.id} ${mode} profile 的属性行迹 ${trace.id} 缺少结构化描述`
        );
    }
    if (trace.sourcePointType === 3 && ![2, 4, 6].includes(trace.promotionLimit ?? -1))
      throw new Error(`角色 ${character.id} ${mode} profile 的额外能力 ${trace.id} 晋阶限制异常`);
    if (
      trace.characterLevelLimit !== undefined &&
      (!Number.isSafeInteger(trace.characterLevelLimit) ||
        trace.characterLevelLimit < 0 ||
        trace.characterLevelLimit > (character.baseStats?.maxLevel ?? 0))
    )
      throw new Error(`角色 ${character.id} ${mode} profile 的行迹 ${trace.id} 等级限制异常`);
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
    }
  }
  for (const series of profile.seriesSkills) {
    const card = profile.skillCards.find(
      (card) => card.externalCondition?.skillId === series.skillId
    );
    if (
      !card ||
      card.category !== 'innate-trace' ||
      card.progressions.length ||
      series.avatarId !== character.id ||
      series.states.length !== 2 ||
      card.variants.some((variant) => variant.progressionId !== null)
    )
      throw new Error(`角色 ${character.id} SeriesSkill condition/card 无效`);
  }
  const exIdentities = new Set<string>();
  for (const ex of profile.exEidolons) {
    if (
      ex.kind !== 'ex-rank' ||
      ex.entityId !== `ex-rank:${character.id}:${ex.id}` ||
      ex.avatarId !== character.id ||
      !ex.name ||
      !ex.description ||
      !ex.badgeLabel ||
      exIdentities.has(ex.entityId) ||
      ex.iconKey?.startsWith('rank--')
    )
      throw new Error(`角色 ${character.id} ExRank identity/content 无效`);
    exIdentities.add(ex.entityId);
  }
  for (const eidolon of [...profile.eidolons, ...profile.exEidolons]) {
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
    ...profile.specialEffects.map((entry) =>
      entry.kind === 'avatar-skill-link'
        ? `special:${entry.kind}:${entry.skill.id}`
        : `special:${entry.kind}:${entry.skill.id}:${entry.linkedAvatarId}`
    ),
    ...profile.traces.map((trace) => trace.id),
    ...profile.eidolons.map((eidolon) => eidolon.id),
    ...profile.exEidolons.map((eidolon) => eidolon.entityId)
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
}

const lightCones = await Promise.all(
  manifest.routes['light-cones'].map(
    async (id) =>
      JSON.parse(
        await readFile(path.join(productRoot, 'details', 'light-cones', `${id}.json`), 'utf8')
      ) as LightCone
  )
);
for (const lightCone of lightCones) {
  if (!lightCone.passive.id || !lightCone.passive.name)
    throw new Error(`光锥 ${lightCone.id} 缺少被动身份或名称`);
  const levels = lightCone.passive.superimposition.levels;
  if (!levels.length) throw new Error(`光锥 ${lightCone.id} 缺少叠影等级`);
  if (levels.map((level) => level.level).join(',') !== '1,2,3,4,5')
    throw new Error(`光锥 ${lightCone.id} 的叠影等级不是 I–V`);
  for (const level of levels) {
    if (level.description !== level.descriptionTokens.map((token) => token.value).join(''))
      throw new Error(`光锥 ${lightCone.id} 叠影 Lv.${level.level} 的语义文本不一致`);
  }
}

async function readLocaleProjection(locale: Locale) {
  const root = path.join(generatedRoot, 'views', locale);
  const [catalogs, details, properties, datasets, localeHomepage, localeSearch] = await Promise.all(
    [
      Promise.all(
        ['characters', 'light-cones', 'relics', 'enemies'].map(async (category) => [
          category,
          JSON.parse(await readFile(path.join(root, 'catalogs', `${category}.json`), 'utf8'))
        ])
      ).then(Object.fromEntries),
      Promise.all(
        Object.entries(manifest.routes).map(async ([category, ids]) => [
          category,
          await Promise.all(
            ids.map((id) =>
              readFile(path.join(root, 'details', category, `${id}.json`), 'utf8').then(JSON.parse)
            )
          )
        ])
      ).then(Object.fromEntries),
      readFile(path.join(root, 'catalogs', 'relic-properties.json'), 'utf8').then(JSON.parse),
      Promise.all(
        endgameModes.map(async (mode) => [
          mode,
          JSON.parse(await readFile(path.join(root, 'endgame', `${mode}.json`), 'utf8'))
        ])
      ).then(Object.fromEntries),
      readFile(path.join(root, 'homepage.json'), 'utf8').then(JSON.parse),
      readFile(path.join(staticGeneratedRoot, locale, 'search.json'), 'utf8').then(
        (value) => JSON.parse(value) as GlobalSearchIndex
      )
    ]
  );
  const occurrenceShards =
    locale === 'en'
      ? Object.fromEntries(
          await Promise.all(
            localeSearch.endgameTargets.map(async ({ id }) => [
              id,
              JSON.parse(
                await readFile(path.join(root, 'endgame-occurrences', id), 'utf8')
              ) as EndgameOccurrenceShard
            ])
          )
        )
      : buildEndgameOccurrenceShards({
          locale,
          datasets: datasets as EndgameDatasetByMode,
          enemies: (details as { enemies: Enemy[] }).enemies,
          targets: localeSearch.endgameTargets,
          presentation: getLocaleProjectionPolicy(locale).endgameView
        });
  return {
    catalogs,
    details,
    relicProperties: properties,
    endgame: { datasets },
    globalSearchIndex: localeSearch,
    homepage: localeHomepage,
    occurrenceShards
  };
}

const [zhProjection, enProjection, enSearchInputs] = await Promise.all([
  readLocaleProjection('zh-CN'),
  readLocaleProjection('en'),
  readFile(path.join(generatedRoot, 'views', 'en', 'search-inputs.json'), 'utf8').then(
    (value) => JSON.parse(value) as SearchBuildInputs
  )
]);
assertCrossLocaleStructuralParity(zhProjection, enProjection);

for (const { locale, projection } of [
  { locale: 'zh-CN' as const, projection: zhProjection },
  { locale: 'en' as const, projection: enProjection }
]) {
  const visibleById = displayableSkillIds.get(locale)!;
  const resolver = skillDescriptionResolvers.find((entry) => entry.locale === locale)!.resolver;
  const policy = getLocaleProjectionPolicy(locale);
  const published = (projection.details as { enemies: Enemy[] }).enemies;
  const namesByMonster = new Map<string, string>();
  const selectionAudit: EnemyDomainAudit['defaultSelection'] = { sameId: 0, fallback: [] };
  let conflictCount = 0;
  for (const enemy of published) {
    const { monsterTemplateId: templateId } = enemy.template;
    const rawTemplate = rawTemplateById.get(templateId);
    const rawMonsterIds = rawMonstersByTemplate.get(templateId);
    if (!rawTemplate || !rawMonsterIds?.length)
      throw new Error(`Enemy ${templateId} has an invalid raw identity`);
    if (
      !isDeepStrictEqual(
        enemy.monsters.map(({ monsterId }) => monsterId),
        rawMonsterIds
      )
    )
      throw new Error(`Enemy ${templateId} Monster inventory differs from MonsterConfig`);
    const defaultId = rawMonsterIds.includes(templateId)
      ? templateId
      : [...rawMonsterIds].sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))[0];
    if (enemy.defaultMonsterId !== defaultId)
      throw new Error(`Enemy ${templateId} has the wrong default Monster`);
    if (defaultId === templateId) selectionAudit.sameId += 1;
    else selectionAudit.fallback.push({ templateId, monsterId: defaultId });

    const templateName = projectEnemyIdentityText(
      resolver,
      enemyTextSource(rawTemplate.MonsterName, templateId, 'MonsterTemplateConfig.MonsterName'),
      templateId,
      'MonsterTemplateConfig.MonsterName',
      policy.enemyName(templateId)
    );
    if (templateName !== enemy.template.name || rawTemplate.Rank !== enemy.template.rank)
      throw new Error(
        `Enemy ${templateId} ${locale} Template identity differs from MonsterTemplateConfig`
      );
    const baseFields = {
      hp: 'HPBase',
      attack: 'AttackBase',
      defence: 'DefenceBase',
      speed: 'SpeedBase',
      stance: 'StanceBase',
      criticalDamage: 'CriticalDamageBase',
      effectResistance: 'StatusResistanceBase',
      initialDelayRatio: 'InitialDelayRatio'
    } as const;
    for (const [field, rawField] of Object.entries(baseFields)) {
      const value = rawTemplate[rawField];
      const expected =
        value === undefined
          ? undefined
          : decimalOf(value, `MonsterTemplate.${templateId}.${rawField}`);
      if (enemy.template.baseStats[field as keyof typeof baseFields] !== expected)
        throw new Error(
          `Enemy ${templateId} Template attribute ${rawField} differs from raw config`
        );
    }

    const skillsById = new Map(enemy.skillDefinitions.map((skill) => [skill.id, skill]));
    for (const skill of skillsById.values()) {
      const raw = rawSkillById.get(skill.id);
      const context = { enemyId: templateId, skillId: skill.id };
      if (
        !raw ||
        !gameTextToPlain(skill.description).trim() ||
        normalizeEnemySkillKind(raw.SkillTypeDesc, '', context) !== skill.kind ||
        normalizeEnemySkillTag(raw.SkillTag, skill.tag.label, context).code !== skill.tag.code ||
        !skill.tag.known ||
        !isDeepStrictEqual(skill.phases, normalizeEnemyPhases(raw.PhaseList)) ||
        [
          'SPHitBase',
          'DelayRatio',
          'ParamList',
          'ModifierList',
          'AttackType',
          'SkillTriggerKey',
          'AI'
        ].some((key) => key in skill)
      ) {
        throw new Error(
          `Enemy ${templateId} skill ${skill.id} differs from its definition or exposes raw fields`
        );
      }
    }
    for (const monster of enemy.monsters) {
      const id = monster.monsterId;
      const rawMonster = rawConfigByMonsterId.get(id)!;
      const expectedName = projectEnemyIdentityText(
        resolver,
        enemyTextSource(rawMonster.MonsterName, id, 'MonsterName'),
        id,
        'MonsterName',
        templateName
      );
      const expectedIntroduction = projectEnemyIdentityText(
        resolver,
        enemyTextSource(rawMonster.MonsterIntroduction, id, 'MonsterIntroduction'),
        id,
        'MonsterIntroduction'
      );
      if (monster.name !== expectedName || monster.introduction !== expectedIntroduction)
        throw new Error(`Monster ${id} ${locale} name or introduction differs from MonsterConfig`);
      namesByMonster.set(id, monster.name);
      if (
        !isDeepStrictEqual(enemy.statProgressions[monster.statsRef], expectedProgressions.get(id))
      )
        throw new Error(`Monster ${id} stats differ from its own difficulty and modifiers`);
      const rawWeaknesses = [
        ...new Set((rawMonster.StanceWeakList as string[]).map(normalizeElementType))
      ];
      const rawResistances = (
        rawMonster.DamageTypeResistance as Array<{ DamageType: string; Value: unknown }>
      ).flatMap(({ DamageType, Value }) => {
        const value = numberOf(Value);
        return value ? [{ element: normalizeElementType(DamageType), value }] : [];
      });
      if (
        !isDeepStrictEqual(
          monster.weaknesses.map(({ element }) => element),
          rawWeaknesses
        ) ||
        !isDeepStrictEqual(
          monster.resistances.map(({ element, value }) => ({ element, value })),
          rawResistances
        ) ||
        !isDeepStrictEqual(
          monster.specialResistances,
          normalizeSpecialResistances(rawMonster.DebuffResist).values.map(({ code, value }) => ({
            code,
            value,
            label: policy.specialResistanceLabels[code] ?? code
          }))
        )
      )
        throw new Error(`Monster ${id} resistances or weaknesses differ from raw config`);
      conflictCount += monster.resistances.filter(({ element }) =>
        rawWeaknesses.includes(element)
      ).length;
      const summonIds = [
        ...new Set<string>(
          (rawMonster.SummonIDList ?? []).map(String).filter((id: string) => id && id !== '0')
        )
      ];
      if (
        !isDeepStrictEqual(
          monster.summons.map(({ monsterId }) => monsterId),
          summonIds
        )
      )
        throw new Error(`Monster ${id} summons differ from SummonIDList`);
      const expectedSkillIds = [
        ...new Set<string>(
          (rawMonster.SkillList ?? []).map(String).filter((id: string) => visibleById.get(id))
        )
      ];
      if (
        !isDeepStrictEqual(
          monster.skills.map(({ id }) => id),
          expectedSkillIds
        ) ||
        !isDeepStrictEqual(
          monster.skillPhases,
          buildEnemySkillPhases(expectedSkillIds.map((id) => skillsById.get(id)!))
        )
      ) {
        throw new Error(
          `Monster ${id} ${locale} skills or phases differ from MonsterConfig and TextMap`
        );
      }
    }
  }
  if (
    !isDeepStrictEqual(audit.enemyAudit.defaultSelection, selectionAudit) ||
    audit.enemyAudit.weaknessResistanceConflicts.length !== conflictCount
  ) {
    throw new Error('Enemy default selection or weakness/resistance audit differs from raw data');
  }
  for (const dataset of Object.values(
    projection.endgame.datasets
  ) as EndgameDatasetByMode[EndgameMode][]) {
    for (const group of dataset.groups)
      for (const encounter of group.encounters)
        for (const battle of encounter.battles)
          for (const stage of battle.stages)
            for (const occurrence of occurrencesOf(stage))
              if (occurrence.name !== namesByMonster.get(String(occurrence.monsterId)))
                throw new Error(
                  `Endgame ${locale} occurrence ${occurrence.monsterId} has the wrong name`
                );
  }
}

for (const projection of [
  { locale: 'zh-CN' as const, value: zhProjection },
  { locale: 'en' as const, value: enProjection }
]) {
  const localeAudit = audit.localeAudits?.[projection.locale];
  if (!localeAudit)
    throw new Error(`[localization/audit] missing locale audit for ${projection.locale}`);
  for (const kind of ['malformed-ruby', 'unresolved-text-id'] as const) {
    for (const { source, reason, identifier } of localeAudit.textDiagnostics[kind].samples)
      console.warn(
        `[${projection.locale}/${kind}] ${source.entity} ${source.id ?? ''} ${source.field} (${identifier}): ${reason}`
      );
  }
  assertValidationReport(
    mergeValidationReports(
      validateLocalizationHealth(
        projection.locale,
        projection.locale === 'zh-CN' ? 'CHS' : 'EN',
        localeAudit.localizationHealth
      ),
      validateRelationAudits({
        ...(projection.locale === 'zh-CN'
          ? {
              specialEffects: audit.specialEffectAudit.diagnostics,
              avatarSpecialSkills: audit.avatarSpecialSkillTreeAudit.diagnostics
            }
          : {}),
        enemies: localeAudit.enemyAudit
      }),
      validateProductProjection(manifest, {
        locale: projection.locale,
        catalogs: projection.value.catalogs,
        details: projection.value.details,
        relicProperties: projection.value.relicProperties,
        endgame: projection.value.endgame.datasets,
        search: projection.value.globalSearchIndex,
        occurrenceShards: projection.value.occurrenceShards
      } as ProductProjectionForValidation)
    ),
    `[${projection.locale}] generated product invariants`
  );
}

const enSearch = enProjection.globalSearchIndex;
const expectedEnSearch = buildSearchDocuments(enSearchInputs, 'en', { kind: 'none' });
if (JSON.stringify(enSearch) !== JSON.stringify(expectedEnSearch))
  throw new Error('English Search documents do not match the current projected catalogs');
if (
  enSearch.locale !== 'en' ||
  enSearch.documents.some(({ playerAliases }) => playerAliases.length > 0)
)
  throw new Error(
    'English Search must be locale-qualified and contain no maintained player aliases'
  );

const expectedShardIds = enSearch.endgameTargets.map(({ id }) => id).sort();
const manifestShardIds = Object.keys(manifest.artifacts)
  .filter((logicalPath) => logicalPath.startsWith('views/en/endgame-occurrences/'))
  .map((logicalPath) => logicalPath.split('/').at(-1)!)
  .sort();
if (JSON.stringify(expectedShardIds) !== JSON.stringify(manifestShardIds))
  throw new Error('English Endgame occurrence shard target inventory is incomplete');
for (const target of enSearch.endgameTargets) {
  const shard = JSON.parse(
    await readFile(
      path.join(generatedRoot, 'views', 'en', 'endgame-occurrences', target.id),
      'utf8'
    )
  ) as {
    schemaVersion: number;
    locale: string;
    target: { kind: string; id: string };
    occurrences: Record<string, { key: string; occurrence: { monsterId: number } }>;
  };
  const expectedKeys = target.occurrences.map(({ locator }) =>
    endgameOccurrenceLocatorKey(locator)
  );
  if (
    shard.schemaVersion !== 4 ||
    shard.locale !== 'en' ||
    shard.target.kind !== 'endgame' ||
    shard.target.id !== target.id ||
    JSON.stringify(Object.keys(shard.occurrences)) !== JSON.stringify(expectedKeys)
  )
    throw new Error(`English Endgame occurrence shard is invalid: ${target.id}`);
  for (const { locator } of target.occurrences) {
    const key = endgameOccurrenceLocatorKey(locator);
    if (
      shard.occurrences[key]?.key !== key ||
      shard.occurrences[key]?.occurrence.monsterId !== locator.monsterId
    )
      throw new Error(`English Endgame occurrence shard locator is invalid: ${key}`);
  }
}

const englishCjk = await auditEnglishCjk({
  generatedViewRoot: path.join(generatedRoot, 'views', 'en'),
  staticLocaleRoot: path.join(staticGeneratedRoot, 'en'),
  siteMessages: JSON.parse(await readFile(path.resolve('messages', 'en.json'), 'utf8')),
  textMap: currentTextMaps.en
});
assertEnglishCjkReport(englishCjk);

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
if (audit.specialEffectAudit.diagnostics.length)
  console.warn(
    `Character Special Effect relation 警告：${audit.specialEffectAudit.diagnostics.length} 条诊断，详见 data/audit/latest.json。`
  );
if (audit.avatarSpecialSkillTreeAudit.diagnostics.length)
  console.warn(
    `AvatarSpecialSkillTree relation 警告：${audit.avatarSpecialSkillTreeAudit.diagnostics.length} 条诊断，详见 data/audit/latest.json。`
  );
console.log(
  `[data:validate:full] 数据验证通过：${manifest.sourceCommit.slice(0, 12)}，zh-CN/en 各 ${search.documents.length} 条搜索记录，${expectedShardIds.length} 个 English Endgame shards。`
);
