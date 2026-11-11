import type {
  CharacterDomain,
  NeutralExtraEffect,
  NeutralSkillVariant,
  NeutralSpecialEffectRelation
} from '../../../src/lib/domain/neutral.js';
import type {
  Character as CharacterView,
  CharacterSpecialEffectEntry,
  Trace,
  Eidolon,
  ExEidolon,
  DescriptionToken
} from '../../../src/lib/domain/types.js';
import type { TextResolver } from '../localization.js';
import {
  buildSkillCards,
  buildSkillVariant,
  type SkillVariantInput,
  SKILL_CATEGORY_LABELS
} from '../skills.js';
import { normalizeSkillCombatMeta, SKILL_EFFECT_LABELS } from '../skill-combat.js';
import { optionalText, projectLevels, requiredText } from './shared.js';
import { configuredCharacterDetailIconKey } from '../character-detail-icons.js';
import { annotateSpecialEffectCards } from '../special-effect-triggers.js';
import { normalizeElementType } from '../../../src/lib/domain/elements.js';
import { formatGameMarkup } from '../text.js';
import {
  PLAYER_PROPERTY_SEMANTICS,
  isPlayerPropertyType
} from '../../../src/lib/player/property-semantics.js';
import { gameTextToPlain } from '../../../src/lib/domain/game-text.js';
import * as m from '../../../src/lib/paraglide/messages.js';

function projectDescription(
  context: CharacterProjectionContext,
  source: import('../../../src/lib/domain/neutral.js').NeutralTextSource | undefined,
  field: { domain: string; entityId: string; field: string },
  gender?: 'female' | 'male'
): { description: string; descriptionTokens: DescriptionToken[] } {
  if (!source) {
    context.resolver.recordAbsent(
      { entity: field.domain, id: field.entityId, field: field.field },
      {
        requirement: 'optional',
        visibility: 'hidden',
        fallbackUsed: true,
        productRouteReachability: 'reachable'
      }
    );
    return { description: '', descriptionTokens: [] };
  }
  const projected = context.resolver.projectGameText(source, {
    seriesSkillReferences: context.seriesSkillReferences,
    seriesReferenceLabel: m.series_skill_view_enhanced({}, { locale: context.locale }),
    gender,
    nickname: context.nickname,
    provenance: { entity: field.domain, id: field.entityId, field: field.field },
    diagnosticDisposition: {
      requirement: 'optional',
      visibility: 'hidden',
      fallbackUsed: true,
      productRouteReachability: 'reachable'
    }
  });
  if (projected.status === 'unsupported' || projected.status === 'invalid')
    throw new Error(`[${field.domain}.${field.entityId}.${field.field}] ${projected.reason}`);
  if (projected.status !== 'available') return { description: '', descriptionTokens: [] };
  if (projected.value.diagnostics.some(({ code }) => code === 'invalid-param'))
    throw new Error(
      `[${field.domain}.${field.entityId}.${field.field}] invalid GameText parameter`
    );
  return { description: projected.value.markup, descriptionTokens: projected.value.tokens };
}

export interface CharacterProjectionContext {
  seriesSkillReferences?: ReadonlySet<string>;
  charactersById?: ReadonlyMap<string, CharacterDomain>;
  locale: 'zh-CN' | 'en';
  resolver: TextResolver;
  extraEffectsById: ReadonlyMap<string, NeutralExtraEffect>;
  nickname?: string;
  skillCategoryLabels?: Partial<typeof SKILL_CATEGORY_LABELS>;
  skillEffectLabels?: Parameters<typeof normalizeSkillCombatMeta>[1];
  composePathName?: (baseName: string, pathName: string) => string;
  normalizeBaseName?: (name: string) => string;
  presentationPolicy?: {
    optionalText?: 'empty' | 'throw';
    nickname?: 'replace' | 'preserve-placeholder';
  };
}

const label = (
  context: CharacterProjectionContext,
  category: keyof typeof SKILL_CATEGORY_LABELS
): string => context.skillCategoryLabels?.[category] ?? SKILL_CATEGORY_LABELS[category];

function projectExtraEffects(
  domain: CharacterDomain,
  context: CharacterProjectionContext,
  ids: string[]
) {
  return ids.flatMap((id) => {
    const source = context.extraEffectsById.get(id);
    if (!source)
      throw new Error(
        `[character/fk] Character=${domain.id} field=ExtraEffectIDList references missing ExtraEffectConfig=${id}`
      );
    const name = source.nameSource
      ? optionalText(context.resolver, source.nameSource, {
          domain: 'character',
          entityId: domain.id,
          field: `extraEffect.${id}.name`
        })
      : '';
    const description = projectDescription(
      context,
      source.descriptionSource,
      { domain: 'character', entityId: domain.id, field: `extraEffect.${id}.description` },
      domain.gender
    );
    return [{ id, name, ...description }];
  });
}

function projectSkillVariant(
  domain: CharacterDomain,
  variant: NeutralSkillVariant,
  context: CharacterProjectionContext
): SkillVariantInput {
  const field = (name: string) => ({
    domain: 'character',
    entityId: domain.id,
    field: `skill.${variant.id}.${name}`
  });
  const type = variant.typeSource
    ? optionalText(context.resolver, variant.typeSource, field('type'))
    : undefined;
  const buffTag = variant.source === 'avatar-global-buff' ? gameTextToPlain(type ?? '').trim() : '';
  const effectLabels = context.skillEffectLabels ?? SKILL_EFFECT_LABELS;
  const buffEffect = buffTag
    ? (Object.entries(effectLabels).find(([, label]) => label === buffTag)?.[0] ?? buffTag)
    : undefined;
  const combatMetaLevels = (variant.combatLevels ?? []).map((combat) => {
    const resourceSource = {
      entity: 'character',
      id: domain.id,
      field: `skill.${variant.id}.combat.${combat.level}.specialResource`
    };
    if (!combat.specialResourceSource)
      context.resolver.recordAbsent(resourceSource, {
        requirement: 'optional',
        visibility: 'hidden',
        fallbackUsed: true,
        productRouteReachability: 'reachable'
      });
    const resourceResult = combat.specialResourceSource
      ? context.resolver.resolve(combat.specialResourceSource, {
          gender: domain.gender,
          nickname: context.nickname,
          provenance: resourceSource,
          diagnosticDisposition: {
            requirement: 'optional',
            visibility: 'hidden',
            fallbackUsed: true,
            productRouteReachability: 'reachable'
          }
        })
      : undefined;
    const resource =
      resourceResult?.status === 'available'
        ? formatGameMarkup(
            resourceResult.value,
            combat.specialResourceSource?.kind === 'parameterized'
              ? combat.specialResourceSource.params.map(Number)
              : []
          ).text
        : '';
    const extraEffects = projectExtraEffects(domain, context, variant.extraEffectIds);
    return {
      level: combat.level,
      combatMeta: normalizeSkillCombatMeta(
        {
          skillEffect: buffEffect ?? combat.effectCode,
          specialResource: resource,
          bpNeed: combat.bpNeed,
          bpAdd: combat.bpAdd,
          spBase: combat.spBase,
          stanceDamageDisplay: combat.stanceDamageDisplay,
          showStanceList: combat.showStanceList,
          extraEffects
        },
        effectLabels
      )
    };
  });
  const name = requiredText(context.resolver, variant.nameSource, field('name'));
  const levels = projectLevels(
    context.resolver,
    variant.levels,
    {
      domain: 'character',
      entityId: domain.id
    },
    { gender: domain.gender, nickname: context.nickname }
  );
  return {
    id: variant.id,
    name,
    type,
    order: variant.order,
    source: variant.source,
    progressionId: variant.progressionId ?? null,
    ...(variant.iconPath
      ? {
          iconKey: configuredCharacterDetailIconKey(
            'skill',
            variant.id,
            variant.iconPath,
            `${variant.source === 'memosprite' ? 'AvatarServantSkillConfig' : 'AvatarSkillConfig'}.${variant.id}`
          )
        }
      : {}),
    scalingParamIndexes: levels.scalingParamIndexes,
    levels: levels.levels,
    attackType: variant.attackType,
    category: variant.category as SkillVariantInput['category'],
    combatMetaLevels
  };
}

function projectProfile(
  domain: CharacterDomain,
  profile: CharacterDomain['profiles']['base'],
  context: CharacterProjectionContext
) {
  context = {
    ...context,
    seriesSkillReferences: new Set(
      profile.seriesSkills.flatMap((series) =>
        series.states
          .filter((state) => state.relatedAvatarIds.length)
          .map((state) => `${series.skillId}:${state.level}`)
      )
    )
  };
  const inputs = profile.skills
    .filter((skill) => skill.visibility !== 'hidden')
    .map((skill) => projectSkillVariant(domain, skill, context));
  const skillCards = buildSkillCards(inputs).map((card) => {
    const cardSources = card.variants.flatMap((variant) => {
      const source = profile.skills.find((skill) => skill.id === variant.id);
      return source ? [source] : [];
    });
    const progressionVariant = cardSources.find(
      (skill) => skill.progressionId && skill.progressionIconPath
    );
    const visibleProgressionMembers = progressionVariant?.progressionId
      ? profile.skills.filter(
          (skill) =>
            skill.visibility !== 'hidden' &&
            skill.progressionId === progressionVariant.progressionId
        )
      : [];
    const progressionOwnsCard =
      !!progressionVariant?.progressionIconPath &&
      (visibleProgressionMembers.every((skill) => skill.category === card.category) ||
        cardSources.some((skill) => skill.iconPath === progressionVariant.progressionIconPath));
    const progressionIconKey =
      progressionOwnsCard &&
      progressionVariant?.progressionId &&
      progressionVariant.progressionIconPath
        ? configuredCharacterDetailIconKey(
            'skill-tree',
            progressionVariant.progressionId,
            progressionVariant.progressionIconPath,
            `AvatarSkillTreeConfig.${progressionVariant.progressionId}`
          )
        : undefined;
    const source = cardSources.find((skill) => skill.iconPath);
    const iconKey =
      progressionIconKey ??
      (source?.iconPath
        ? configuredCharacterDetailIconKey(
            'skill',
            source.id,
            source.iconPath,
            `AvatarSkillConfig.${source.id}`
          )
        : undefined);
    return {
      ...card,
      progressions: card.progressions.map((progression) => ({
        ...progression,
        ...(cardSources.some(
          (skill) =>
            skill.progressionId === progression.id &&
            skill.progressionPointType === 6 &&
            skill.progressionDefaultUnlock &&
            skill.levels.length === 1 &&
            skill.levels[0].level === 1
        )
          ? { fixedLevel: 1 }
          : {})
      })),
      displayLabel:
        card.category === 'elation-ascension'
          ? requiredText(context.resolver, context.extraEffectsById.get('10015111')?.nameSource, {
              domain: 'character',
              entityId: domain.id,
              field: 'seriesSkill.category'
            })
          : label(context, card.category),
      ...(card.category === 'elation-ascension'
        ? {
            externalCondition:
              profile.seriesSkills.find((series) =>
                card.variants.some((variant) => variant.id === series.skillId)
              ) &&
              projectSeriesSkill(
                profile.seriesSkills.find((series) =>
                  card.variants.some((variant) => variant.id === series.skillId)
                )!
              )
          }
        : {}),
      ...(iconKey ? { iconKey } : {})
    };
  });
  const specialEffects: CharacterSpecialEffectEntry[] = profile.specialEffects.flatMap(
    (relation: NeutralSpecialEffectRelation): CharacterSpecialEffectEntry[] => {
      if (relation.kind === 'series-skill-link') {
        const target = context.charactersById?.get(relation.linkedAvatarId);
        const source = target?.profiles.base.skills.find(
          (skill) => skill.id === relation.targetSkillId
        );
        if (!target || !source)
          throw new Error(
            `[character/series] missing projection target ${relation.linkedAvatarId}:${relation.targetSkillId}`
          );
        return [
          {
            kind: 'series-skill-link',
            rootSkillId: relation.skillId,
            linkedAvatarId: relation.linkedAvatarId,
            order: relation.order,
            skill: buildSkillVariant(projectSkillVariant(target, source, context))
          }
        ];
      }
      const variant = profile.skills.find((skill) => skill.id === relation.skillId);
      if (!variant) return [];
      const skill = buildSkillVariant(projectSkillVariant(domain, variant, context));
      if (relation.kind === 'avatar-skill-link')
        return [
          {
            kind: 'avatar-skill-link' as const,
            skill,
            linkedAvatarIds: relation.linkedAvatarIds,
            simplifiedLinkedAvatarIds: relation.simplifiedLinkedAvatarIds
          }
        ];
      return [
        {
          kind: 'servant-skill-link' as const,
          skill,
          order: relation.order,
          linkedAvatarId: relation.linkedAvatarId,
          tarotFigurePath: relation.tarotFigurePath,
          tarotIconPath: relation.tarotIconPath
        }
      ];
    }
  );
  annotateSpecialEffectCards(skillCards, domain.id, specialEffects);
  const traces: Trace[] = profile.traces.flatMap((trace) => {
    const name = trace.nameSource
      ? optionalText(context.resolver, trace.nameSource, {
          domain: 'character',
          entityId: domain.id,
          field: `trace.${trace.id}.name`
        })
      : '';
    let { description, descriptionTokens } = trace.descriptionSource
      ? projectDescription(
          context,
          trace.descriptionSource,
          { domain: 'character', entityId: domain.id, field: `trace.${trace.id}.description` },
          domain.gender
        )
      : { description: '', descriptionTokens: [] };
    if (!description && trace.statDescriptionSource) {
      const result = context.resolver.projectGameText(
        {
          kind: 'parameterized',
          ref: trace.statDescriptionSource.ref,
          params: trace.statValues ?? []
        },
        {
          gender: domain.gender,
          nickname: context.nickname,
          provenance: {
            entity: 'character',
            id: domain.id,
            field: `trace.${trace.id}.statDescription`
          },
          diagnosticDisposition: {
            requirement: 'optional',
            visibility: 'hidden',
            fallbackUsed: true,
            productRouteReachability: 'reachable'
          }
        }
      );
      if (result.status === 'available') {
        description = gameTextToPlain(result.value.text);
        descriptionTokens = result.value.tokens;
      }
    }
    if (!name && !description) return [];
    const iconKey = trace.iconPath
      ? configuredCharacterDetailIconKey(
          trace.type === 'stat' ? 'property' : 'skill-tree',
          trace.type === 'stat' ? (trace.propertyType ?? trace.id) : trace.id,
          trace.iconPath,
          `AvatarSkillTreeConfig.${trace.id}`
        )
      : undefined;
    return [
      {
        id: trace.id,
        name,
        description,
        descriptionTokens,
        type: trace.type,
        ...(trace.type === 'stat' &&
        trace.sourcePointType === 1 &&
        !trace.descriptionSource &&
        !trace.extraEffectIds?.length &&
        trace.statBonuses?.length === 1 &&
        isPlayerPropertyType(trace.statBonuses[0].propertyType)
          ? {
              statBonus: {
                propertyType: trace.statBonuses[0].propertyType,
                value: Number(trace.statBonuses[0].value),
                percent: PLAYER_PROPERTY_SEMANTICS[trace.statBonuses[0].propertyType].percent
              }
            }
          : {}),
        ...(iconKey ? { iconKey } : {}),
        ...(trace.propertyType ? { propertyType: trace.propertyType } : {}),
        sourcePointType: trace.sourcePointType,
        prerequisiteIds: trace.prerequisiteIds,
        ...(trace.promotionLimit !== undefined ? { promotionLimit: trace.promotionLimit } : {}),
        ...(trace.characterLevelLimit !== undefined
          ? { characterLevelLimit: trace.characterLevelLimit }
          : {}),
        anchorOrder: trace.anchorOrder ?? 0,
        ...(trace.extraEffectIds?.length
          ? { extraEffects: projectExtraEffects(domain, context, trace.extraEffectIds) }
          : {})
      }
    ];
  });
  const eidolons: Eidolon[] = profile.eidolons.map((eidolon) => {
    const iconKey = eidolon.iconPath
      ? configuredCharacterDetailIconKey(
          'rank',
          eidolon.id,
          eidolon.iconPath,
          `AvatarRankConfig.${eidolon.id}`
        )
      : undefined;
    return {
      id: eidolon.id,
      rank: eidolon.rank,
      name: eidolon.nameSource
        ? optionalText(context.resolver, eidolon.nameSource, {
            domain: 'character',
            entityId: domain.id,
            field: `eidolon.${eidolon.id}.name`
          })
        : '',
      ...projectDescription(
        context,
        eidolon.descriptionSource,
        { domain: 'character', entityId: domain.id, field: `eidolon.${eidolon.id}.description` },
        domain.gender
      ),
      ...(iconKey ? { iconKey } : {}),
      ...(eidolon.extraEffectIds.length
        ? { extraEffects: projectExtraEffects(domain, context, eidolon.extraEffectIds) }
        : {})
    };
  });
  const exEidolons: ExEidolon[] = profile.exEidolons.map((eidolon) => ({
    kind: 'ex-rank',
    id: eidolon.id,
    entityId: eidolon.entityId,
    avatarId: eidolon.avatarId,
    relatedSkillIds: eidolon.relatedSkillIds,
    badgeLabel: requiredText(
      context.resolver,
      {
        kind: 'direct',
        ref: {
          kind: 'hash',
          hash: '5057575626871868393' as import('../../../src/lib/domain/types.js').TextHash
        }
      },
      { domain: 'character', entityId: domain.id, field: 'exEidolon.badge' }
    ),
    name: requiredText(context.resolver, eidolon.nameSource, {
      domain: 'character',
      entityId: domain.id,
      field: `exEidolon.${eidolon.id}.name`
    }),
    ...projectDescription(
      context,
      eidolon.descriptionSource,
      { domain: 'character', entityId: domain.id, field: `exEidolon.${eidolon.id}.description` },
      domain.gender
    ),
    extraEffects: projectExtraEffects(domain, context, eidolon.extraEffectIds)
    // The upstream skill-style path is retained in Neutral. No ordinary rank asset lookup.
  }));
  return {
    energy:
      profile.energy.kind === 'special'
        ? {
            kind: 'special' as const,
            max: 0 as const,
            ...(profile.energy.iconCode && profile.energy.iconPath
              ? {
                  iconKey: configuredCharacterDetailIconKey(
                    'property',
                    profile.energy.iconCode,
                    profile.energy.iconPath,
                    `AvatarPropertyConfig.${profile.energy.iconCode}`
                  )
                }
              : {})
          }
        : {
            kind: 'standard' as const,
            max: profile.energy.max,
            ...(profile.energy.iconCode && profile.energy.iconPath
              ? {
                  iconKey: configuredCharacterDetailIconKey(
                    'property',
                    profile.energy.iconCode,
                    profile.energy.iconPath,
                    `AvatarPropertyConfig.${profile.energy.iconCode}`
                  )
                }
              : {})
          },
    skillCards,
    specialEffects,
    traces,
    eidolons,
    seriesSkills: profile.seriesSkills.map(projectSeriesSkill),
    exEidolons
  };
}

function projectSeriesSkill(
  series: import('../../../src/lib/domain/neutral.js').NeutralSeriesSkill
) {
  return {
    avatarId: series.avatarId,
    skillId: series.skillId,
    states: series.states.map(({ level, condition, relatedAvatarIds }) => ({
      level,
      condition,
      relatedAvatarIds
    }))
  };
}

export function projectCharacterView(
  domain: CharacterDomain,
  context: CharacterProjectionContext
): CharacterView {
  const rawName = requiredText(context.resolver, domain.naming.avatarName, {
    domain: 'character',
    entityId: domain.id,
    field: 'name'
  });
  const pathName = requiredText(context.resolver, domain.pathNameSource, {
    domain: 'character',
    entityId: domain.id,
    field: 'pathName'
  });
  const isMultiplePath = domain.baseAvatarId === '1001' || domain.baseAvatarId === '8001';
  const sourceBaseName = domain.naming.baseNameSource
    ? optionalText(context.resolver, domain.naming.baseNameSource, {
        domain: 'character',
        entityId: domain.id,
        field: 'baseName'
      })
    : undefined;
  const resolvedBaseName = sourceBaseName || rawName;
  const baseName = isMultiplePath
    ? (context.normalizeBaseName?.(resolvedBaseName) ?? resolvedBaseName).replace(
        '{NICKNAME}',
        context.nickname ?? ''
      )
    : rawName;
  const name = isMultiplePath
    ? (context.composePathName?.(baseName, pathName) ?? `${baseName}·${pathName}`)
    : rawName;
  const fullNameDisposition = {
    requirement: 'optional' as const,
    visibility: 'hidden' as const,
    fallbackUsed: true,
    productRouteReachability: 'reachable' as const
  };
  if (!domain.naming.fullName)
    context.resolver.recordAbsent(
      { entity: 'character', id: domain.id, field: 'fullName' },
      fullNameDisposition
    );
  const fullNameResult = domain.naming.fullName
    ? context.resolver.resolve(domain.naming.fullName, {
        gender: domain.gender,
        nickname: context.nickname,
        provenance: { entity: 'character', id: domain.id, field: 'fullName' },
        diagnosticDisposition: fullNameDisposition
      })
    : { status: 'absent' as const };
  const fullName =
    fullNameResult.status === 'available' &&
    !(
      fullNameResult.value.includes('{NICKNAME}') &&
      context.presentationPolicy?.nickname === 'preserve-placeholder'
    )
      ? fullNameResult.value
      : name;
  const baseProfile = projectProfile(domain, domain.profiles.base, context);
  const enhanced = domain.profiles.enhanced
    ? projectProfile(domain, domain.profiles.enhanced, context)
    : undefined;
  return {
    id: domain.id,
    name,
    baseName: isMultiplePath ? baseName : name,
    fullName,
    description: optionalText(context.resolver, domain.descriptionSource, {
      domain: 'character',
      entityId: domain.id,
      field: 'description'
    }),
    kind: 'character',
    path: domain.pathCode,
    pathName,
    element: normalizeElementType(domain.elementCode),
    elementName: requiredText(context.resolver, domain.elementNameSource, {
      domain: 'character',
      entityId: domain.id,
      field: 'elementName'
    }),
    rarity: domain.rarity,
    profiles: { base: baseProfile, ...(enhanced ? { enhanced } : {}) },
    baseStats: domain.stats,
    equipmentRecommendation: {
      avatarId: domain.id,
      ...domain.equipmentRecommendation,
      mainStatOptions: domain.equipmentRecommendation.mainStatOptions as never
    }
  };
}

export const projectCharacter = projectCharacterView;
