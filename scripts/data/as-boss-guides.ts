import type {
  ApocalypticShadowBossTrait,
  ApocalypticShadowSlotGuide,
  DecimalString,
  EndgameBattleSlot,
  EndgameConfigProvenance
} from '../../src/lib/domain/endgame.js';
import type { TextResolver, TextSource } from './localization.js';
import { decimalOf, parseDecimal } from './decimal.js';
import { hashOf } from './raw.js';
import { formatGameMarkup } from './text.js';
import { createExtraEffectResolver, type ExtraEffectRow } from './extra-effects.js';

interface HashRef {
  Hash: string;
}

export interface ChallengeBossMazeExtraRow {
  ID: number;
  MonsterID1?: number;
  MonsterID2?: number;
  MonsterID3?: number;
}

export interface MonsterGuideConfigRow {
  MonsterID: number;
  Difficulty: number;
  DifficultyList?: unknown[];
  TagList?: unknown[];
}

export interface MonsterGuideTagRow {
  TagID: number;
  TagName?: HashRef;
  TagBriefDescription?: HashRef;
  ParameterList?: unknown[];
  EffectID?: unknown[];
}

export interface AsBossGuideDiagnosticContext {
  groupId?: number;
  configId?: number;
  slot?: number;
  guideMonsterId?: number;
  actualMonsterId?: number;
  tagId?: number;
  field?: string;
  arrayIndex?: number;
  [key: string]: string | number | undefined;
}

export interface AsBossGuideIssueSink {
  warn(code: string, message: string, context: AsBossGuideDiagnosticContext): void;
}

export interface AsBossGuideAudit {
  slotRelations: number;
  applicableTraitRelations: number;
  displayReadyTraits: number;
  omittedTraitRelations: number;
  distinctMalformedTags: number;
  distinctUnusedParamTags: number;
  guideStageMonsterMismatches: number;
  missingMazeExtras: number;
  missingSlotBindings: number;
  missingGuides: number;
  missingTags: number;
  missingLocalization: number;
  arrayLengthMismatches: number;
  difficultyMismatches: number;
  duplicateTags: number;
  linkedEffectRelations: number;
  displayReadyLinkedEffects: number;
  omittedLinkedEffects: number;
}

export interface AsBossGuideResolver {
  resolveEncounter(request: {
    groupId: number;
    configId: number;
    difficulty?: number;
    battles: readonly EndgameBattleSlot[];
  }): ApocalypticShadowSlotGuide[];
  getAudit(): AsBossGuideAudit;
}

function uniqueIndex<T>(
  rows: readonly T[],
  keyOf: (row: T) => number,
  label: string
): Map<number, T> {
  const result = new Map<number, T>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!Number.isSafeInteger(key)) throw new Error(`${label} 包含非法主键：${String(key)}`);
    if (result.has(key)) throw new Error(`${label} 存在重复主键：${key}`);
    result.set(key, row);
  }
  return result;
}

function integer(value: unknown, context: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`${context} 不是安全整数：${String(value)}`);
  return result;
}

function decimal(value: unknown, context: string): DecimalString {
  if (value && typeof value === 'object' && 'Value' in value) return decimalOf(value, context);
  return parseDecimal(typeof value === 'number' ? String(value) : value, context);
}

function occurrencesOf(battle: EndgameBattleSlot): number[] {
  return battle.stages.flatMap((stage) =>
    stage.waveModel.kind === 'fixed'
      ? stage.waveModel.waves.flatMap((wave) => wave.enemies.map((enemy) => enemy.monsterId))
      : stage.waveModel.waves.flatMap((wave) =>
          wave.monsterGroups.flatMap((group) =>
            group.orderedEnemies.map((enemy) => enemy.monsterId)
          )
        )
  );
}

function source(entity: string, id: number, field: string): TextSource {
  return { entity, id: String(id), field };
}

function provenance(
  table: EndgameConfigProvenance['table'],
  ownerId: number,
  field: string,
  arrayIndex?: number
): EndgameConfigProvenance {
  return { table, ownerId, field, ...(arrayIndex === undefined ? {} : { arrayIndex }) };
}

export function createAsBossGuideResolver(
  rows: {
    mazeExtras: readonly ChallengeBossMazeExtraRow[];
    guides: readonly MonsterGuideConfigRow[];
    tags: readonly MonsterGuideTagRow[];
    extraEffects: readonly ExtraEffectRow[];
  },
  text: TextResolver,
  issues: AsBossGuideIssueSink
): AsBossGuideResolver {
  const extras = uniqueIndex(rows.mazeExtras, (row) => row.ID, 'ChallengeBossMazeExtra.ID');
  const guides = uniqueIndex(rows.guides, (row) => row.MonsterID, 'MonsterGuideConfig.MonsterID');
  const tags = uniqueIndex(rows.tags, (row) => row.TagID, 'MonsterGuideTag.TagID');
  const malformedExtraEffects = new Set<string>();
  const extraEffectResolver = createExtraEffectResolver(
    rows.extraEffects,
    (ref, textSource) => text.resolveRef(ref, textSource),
    {
      onUnresolved: (extraEffectId, textSource) =>
        issues.warn(
          'unresolved-as-stage-effect-extra-effect',
          '关卡效果引用的 ExtraEffect 无法解析',
          {
            tagId: Number(textSource.id),
            field: textSource.field,
            extraEffectId
          }
        ),
      onNotDisplayReady: (extraEffectId, textSource) =>
        issues.warn(
          'missing-as-stage-effect-extra-effect-localization',
          '关卡效果引用的 ExtraEffect 缺少可展示文本',
          { tagId: Number(textSource.id), field: textSource.field, extraEffectId }
        ),
      onDescriptionDiagnostics: (extraEffectId, diagnostics, textSource) => {
        if (!diagnostics.length) return;
        malformedExtraEffects.add(extraEffectId);
        issues.warn(
          'invalid-as-stage-effect-extra-effect-description',
          '关卡效果引用的 ExtraEffect 描述参数无法完整插值',
          {
            tagId: Number(textSource.id),
            field: textSource.field,
            extraEffectId,
            placeholder: diagnostics[0]?.placeholder
          }
        );
      }
    }
  );
  const malformedTags = new Set<number>();
  const unusedParamTags = new Set<number>();
  const audit: Omit<AsBossGuideAudit, 'distinctMalformedTags' | 'distinctUnusedParamTags'> = {
    slotRelations: 0,
    applicableTraitRelations: 0,
    displayReadyTraits: 0,
    omittedTraitRelations: 0,
    guideStageMonsterMismatches: 0,
    missingMazeExtras: 0,
    missingSlotBindings: 0,
    missingGuides: 0,
    missingTags: 0,
    missingLocalization: 0,
    arrayLengthMismatches: 0,
    difficultyMismatches: 0,
    duplicateTags: 0,
    linkedEffectRelations: 0,
    displayReadyLinkedEffects: 0,
    omittedLinkedEffects: 0
  };

  const omit = (code: string, message: string, context: AsBossGuideDiagnosticContext): void => {
    audit.omittedTraitRelations += 1;
    issues.warn(code, message, context);
  };

  return {
    resolveEncounter({ groupId, configId, difficulty, battles }) {
      const extra = extras.get(configId);
      if (!extra) {
        audit.missingMazeExtras += 1;
        issues.warn('missing-as-boss-maze-extra', 'AS encounter 缺少 ChallengeBossMazeExtra', {
          groupId,
          configId
        });
        return [];
      }

      const result: ApocalypticShadowSlotGuide[] = [];
      for (const battle of [...battles].sort((left, right) => left.slot - right.slot)) {
        const slot = battle.slot;
        const field = `MonsterID${slot}`;
        const rawGuideMonsterId = extra[field as keyof ChallengeBossMazeExtraRow];
        if (rawGuideMonsterId === undefined) {
          audit.missingSlotBindings += 1;
          issues.warn(
            'missing-as-boss-slot-binding',
            'AS boss slot 缺少 MazeExtra MonsterID binding',
            {
              groupId,
              configId,
              slot,
              field
            }
          );
          continue;
        }
        const guideMonsterId = integer(
          rawGuideMonsterId,
          `ChallengeBossMazeExtra ${configId}.${field}`
        );
        const guide = guides.get(guideMonsterId);
        if (!guide) {
          audit.missingGuides += 1;
          issues.warn('missing-as-monster-guide', 'AS boss slot 的 MonsterGuide 无法解析', {
            groupId,
            configId,
            slot,
            guideMonsterId
          });
          continue;
        }
        if (difficulty === undefined || guide.Difficulty !== difficulty) {
          audit.difficultyMismatches += 1;
          issues.warn(
            'as-monster-guide-difficulty-mismatch',
            'AS MonsterGuide difficulty 与 encounter 不一致',
            {
              groupId,
              configId,
              slot,
              guideMonsterId,
              encounterDifficulty: difficulty,
              guideDifficulty: guide.Difficulty
            }
          );
          continue;
        }
        const tagIds = guide.TagList ?? [];
        const requiredDifficulties = guide.DifficultyList ?? [];
        if (tagIds.length !== requiredDifficulties.length) {
          audit.arrayLengthMismatches += 1;
          issues.warn(
            'as-monster-guide-array-length-mismatch',
            'TagList 与 DifficultyList 长度不一致',
            {
              groupId,
              configId,
              slot,
              guideMonsterId,
              tagCount: tagIds.length,
              difficultyCount: requiredDifficulties.length
            }
          );
          continue;
        }

        audit.slotRelations += 1;
        const actualMonsterIds = occurrencesOf(battle);
        if (!actualMonsterIds.includes(guideMonsterId)) {
          audit.guideStageMonsterMismatches += 1;
          issues.warn(
            'as-guide-stage-monster-mismatch',
            'AS slot guide 与 Stage Monster identity 不一致',
            {
              groupId,
              configId,
              slot,
              guideMonsterId,
              actualMonsterId: actualMonsterIds[0]
            }
          );
        }

        const seen = new Set<number>();
        const traits: ApocalypticShadowBossTrait[] = [];
        tagIds.forEach((rawTagId, arrayIndex) => {
          let tagId: number;
          let requiredDifficulty: number;
          try {
            tagId = integer(
              rawTagId,
              `MonsterGuideConfig ${guideMonsterId}.TagList[${arrayIndex}]`
            );
            requiredDifficulty = integer(
              requiredDifficulties[arrayIndex],
              `MonsterGuideConfig ${guideMonsterId}.DifficultyList[${arrayIndex}]`
            );
          } catch (error) {
            issues.warn('invalid-as-monster-guide-relation', (error as Error).message, {
              groupId,
              configId,
              slot,
              guideMonsterId,
              arrayIndex
            });
            return;
          }
          if (seen.has(tagId)) {
            audit.duplicateTags += 1;
            issues.warn('duplicate-as-boss-trait', 'MonsterGuide TagList 包含重复 TagID', {
              groupId,
              configId,
              slot,
              guideMonsterId,
              tagId,
              arrayIndex
            });
            return;
          }
          seen.add(tagId);
          if (requiredDifficulty > guide.Difficulty) return;
          audit.applicableTraitRelations += 1;
          const tag = tags.get(tagId);
          if (!tag) {
            audit.missingTags += 1;
            omit('missing-as-boss-trait', 'MonsterGuideTag 无法解析', {
              groupId,
              configId,
              slot,
              guideMonsterId,
              tagId,
              arrayIndex
            });
            return;
          }
          let params: DecimalString[];
          try {
            params = (tag.ParameterList ?? []).map((value, paramIndex) =>
              decimal(value, `MonsterGuideTag ${tagId}.ParameterList[${paramIndex}]`)
            );
          } catch (error) {
            malformedTags.add(tagId);
            omit('invalid-as-boss-trait-param', (error as Error).message, {
              groupId,
              configId,
              slot,
              guideMonsterId,
              tagId,
              arrayIndex
            });
            return;
          }
          const name = text.resolveRef(tag.TagName, source('MonsterGuideTag', tagId, 'TagName'));
          const rawDescription = text.resolveRef(
            tag.TagBriefDescription,
            source('MonsterGuideTag', tagId, 'TagBriefDescription')
          );
          if (!name || !rawDescription) {
            audit.missingLocalization += 1;
            omit('missing-as-boss-trait-localization', '首领特性缺少名称或描述本地化', {
              groupId,
              configId,
              slot,
              guideMonsterId,
              tagId,
              arrayIndex
            });
            return;
          }
          const formatted = formatGameMarkup(
            rawDescription,
            params.map((value) => Number(value))
          );
          const used = new Set(formatted.usedParameterIndexes);
          if (params.some((_, paramIndex) => !used.has(paramIndex))) {
            unusedParamTags.add(tagId);
            issues.warn('unused-as-boss-trait-param', '首领特性存在未使用的尾随参数', {
              groupId,
              configId,
              slot,
              guideMonsterId,
              tagId
            });
          }
          if (formatted.diagnostics.length) {
            malformedTags.add(tagId);
            omit('invalid-as-boss-trait-placeholder', '首领特性描述参数无法完整插值', {
              groupId,
              configId,
              slot,
              guideMonsterId,
              tagId,
              arrayIndex,
              placeholder: formatted.diagnostics[0]?.placeholder
            });
            return;
          }
          const nameHash = hashOf(tag.TagName);
          const descriptionHash = hashOf(tag.TagBriefDescription);
          const rawEffectIds = tag.EffectID ?? [];
          audit.linkedEffectRelations += rawEffectIds.length;
          const linkedEffects = extraEffectResolver
            .resolve(rawEffectIds, {
              ownerEntity: 'as-stage-effect',
              ownerId: String(tagId),
              field: 'EffectID'
            })
            .filter((effect) => !malformedExtraEffects.has(effect.id));
          audit.displayReadyLinkedEffects += linkedEffects.length;
          audit.omittedLinkedEffects += rawEffectIds.length - linkedEffects.length;
          traits.push({
            tagId,
            order: arrayIndex + 1,
            requiredDifficulty,
            name,
            ...(nameHash ? { nameHash } : {}),
            description: formatted.text,
            ...(descriptionHash ? { descriptionHash } : {}),
            params,
            linkedEffects,
            provenance: provenance('MonsterGuideConfig', guideMonsterId, 'TagList', arrayIndex)
          });
          audit.displayReadyTraits += 1;
        });

        result.push({
          key: `as:${configId}:${field}`,
          slot,
          guideMonsterId,
          difficulty: guide.Difficulty,
          traits,
          provenance: provenance('ChallengeBossMazeExtra', configId, field)
        });
      }
      return result;
    },
    getAudit: () => ({
      ...audit,
      distinctMalformedTags: malformedTags.size,
      distinctUnusedParamTags: unusedParamTags.size
    })
  };
}
