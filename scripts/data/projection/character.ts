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
  Eidolon
} from '../../../src/lib/domain/types.js';
import type { TextResolver } from '../localization.js';
import {
  buildSkillCards,
  buildSkillVariant,
  type SkillVariantInput,
  SKILL_CATEGORY_LABELS
} from '../skills.js';
import { normalizeSkillCombatMeta } from '../skill-combat.js';
import { optionalText, projectLevels, requiredText } from './shared.js';
import { configuredCharacterDetailIconKey } from '../character-detail-icons.js';
import { annotateSpecialEffectCards } from '../special-effect-triggers.js';
import { normalizeElementType } from '../../../src/lib/domain/elements.js';
import { formatGameMarkup } from '../text.js';
import { gameTextToPlain } from '../../../src/lib/domain/game-text.js';

function projectDescription(
  context: CharacterProjectionContext,
  source: import('../../../src/lib/domain/neutral.js').NeutralTextSource | undefined,
  field: { domain: string; entityId: string; field: string },
  gender?: 'female' | 'male'
): string {
  if (!source) return '';
  const projected = context.resolver.projectGameText(source, {
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
  if (projected.status !== 'available') return '';
  if (projected.value.diagnostics.some(({ code }) => code === 'invalid-param'))
    throw new Error(
      `[${field.domain}.${field.entityId}.${field.field}] invalid GameText parameter`
    );
  return projected.value.markup;
}

export interface CharacterProjectionContext {
  locale: 'zh-CN' | 'en';
  resolver: TextResolver;
  extraEffectsById: ReadonlyMap<string, NeutralExtraEffect>;
  nickname?: string;
  skillCategoryLabels?: Partial<typeof SKILL_CATEGORY_LABELS>;
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
    if (!source) return [];
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
    return [{ id, name, description }];
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
  const combatMetaLevels = (variant.combatLevels ?? []).map((combat) => {
    const resourceResult = combat.specialResourceSource
      ? context.resolver.resolve(combat.specialResourceSource, {
          gender: domain.gender,
          nickname: context.nickname,
          provenance: {
            entity: 'character',
            id: domain.id,
            field: `skill.${variant.id}.combat.${combat.level}.specialResource`
          },
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
      combatMeta: normalizeSkillCombatMeta({
        skillEffect: combat.effectCode,
        specialResource: resource,
        bpNeed: combat.bpNeed,
        bpAdd: combat.bpAdd,
        spBase: combat.spBase,
        stanceDamageDisplay: combat.stanceDamageDisplay,
        showStanceList: combat.showStanceList,
        extraEffects
      })
    };
  });
  const name = requiredText(context.resolver, variant.nameSource, field('name'));
  const type = variant.typeSource
    ? optionalText(context.resolver, variant.typeSource, field('type'))
    : undefined;
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
      displayLabel: label(context, card.category),
      ...(iconKey ? { iconKey } : {})
    };
  });
  const specialEffects: CharacterSpecialEffectEntry[] = profile.specialEffects.flatMap(
    (relation: NeutralSpecialEffectRelation): CharacterSpecialEffectEntry[] => {
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
    let description = '';
    if (trace.descriptionSource)
      description = projectDescription(
        context,
        trace.descriptionSource,
        { domain: 'character', entityId: domain.id, field: `trace.${trace.id}.description` },
        domain.gender
      );
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
      if (result.status === 'available') description = gameTextToPlain(result.value.text);
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
        type: trace.type,
        ...(iconKey ? { iconKey } : {}),
        ...(trace.propertyType ? { propertyType: trace.propertyType } : {}),
        sourcePointType: trace.sourcePointType,
        prerequisiteIds: trace.prerequisiteIds,
        ...(trace.promotionLimit !== undefined ? { promotionLimit: trace.promotionLimit } : {}),
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
      description: projectDescription(
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
    eidolons
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
  const baseName = isMultiplePath
    ? (sourceBaseName || rawName).replace(/·.*$/, '').replace('{NICKNAME}', context.nickname ?? '')
    : rawName;
  const name = isMultiplePath ? `${baseName}·${pathName}` : rawName;
  const fullNameResult = domain.naming.fullName
    ? context.resolver.resolve(domain.naming.fullName, {
        gender: domain.gender,
        nickname: context.nickname,
        provenance: { entity: 'character', id: domain.id, field: 'fullName' },
        diagnosticDisposition: {
          requirement: 'optional',
          visibility: 'hidden',
          fallbackUsed: true,
          productRouteReachability: 'reachable'
        }
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
