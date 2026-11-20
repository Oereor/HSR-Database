import type {
  EnemyDomain,
  EnemySkillDetailDomain,
  NeutralTextSource
} from '../../../src/lib/domain/neutral.js';
import type {
  Enemy,
  EnemyCatalogEntry,
  EnemySkill,
  EnemySkillDetail,
  EnemySummonReference,
  ElementLabel,
  MonsterVariant,
  SkillExtraEffect
} from '../../../src/lib/domain/types.js';
import type { TextResolver } from '../localization.js';
import type { BuildTextProvenance, TextDiagnosticDisposition } from '../localization.js';
import type { LevelledDescriptionDiagnostic } from '../levelled.js';
import type { DescriptionDiagnostic } from '../text.js';
import { gameTextToPlain, normalizeGameText } from '../../../src/lib/domain/game-text.js';
import { buildEnemySkillPhases } from '../enemy-detail.js';
import {
  compactEnemyStatProgression,
  enemyDetailHref
} from '../../../src/lib/domain/enemy-view.js';

export interface EnemyProjectionContext {
  resolver: TextResolver;
  extraEffectsById: ReadonlyMap<
    string,
    import('../../../src/lib/domain/neutral.js').NeutralExtraEffect
  >;
  statusNamesById?: ReadonlyMap<string, NeutralTextSource>;
  elementNameFallbacks?: Partial<Record<string, string>>;
  specialResistanceLabels?: Partial<Record<string, string>>;
  enemyNameFallback?: (id: string) => string;
  skillNameFallback?: (id: string) => string;
  onDescriptionDiagnostics?: (
    entity: string,
    id: string,
    diagnostics: LevelledDescriptionDiagnostic[]
  ) => void;
  onUnresolvedExtraEffect?: (enemyId: string, skillId: string, extraEffectId: string) => void;
}

function source(entity: string, id: string, field: string): BuildTextProvenance {
  return { entity, id, field };
}

function projectText(
  resolver: TextResolver,
  value: NeutralTextSource | undefined,
  field: BuildTextProvenance,
  fallback: string,
  disposition: TextDiagnosticDisposition
): string {
  if (!value) {
    resolver.recordAbsent(field, disposition);
    return fallback;
  }
  const result = resolver.resolve(value, {
    provenance: field,
    diagnosticDisposition: disposition
  });
  if (result.status === 'available') return normalizeGameText(result.value);
  if (result.status === 'invalid')
    throw new Error(`[${field.entity}.${field.id}.${field.field}] ${result.reason}`);
  return fallback;
}

function projectGameText(
  resolver: TextResolver,
  value: NeutralTextSource | undefined,
  field: BuildTextProvenance,
  fallback: string,
  disposition: TextDiagnosticDisposition,
  onDiagnostics?: (diagnostics: DescriptionDiagnostic[]) => void
): { text: string; status: 'available' | 'missing' } {
  if (!value) {
    resolver.recordAbsent(field, disposition);
    return { text: fallback, status: fallback ? 'available' : 'missing' };
  }
  const result = resolver.projectGameText(value, {
    requireVisibleText: true,
    provenance: field,
    diagnosticDisposition: disposition
  });
  if (result.status === 'invalid')
    throw new Error(`[${field.entity}.${field.id}.${field.field}] ${result.reason}`);
  if (result.status !== 'available')
    return { text: fallback, status: fallback ? 'available' : 'missing' };
  onDiagnostics?.(result.value.diagnostics);
  return {
    text: result.value.markup,
    status: 'available'
  };
}

function elementLabel(
  code: string,
  sourceRef: NeutralTextSource | undefined,
  context: EnemyProjectionContext,
  enemyId: string,
  field: string
): ElementLabel {
  return {
    element: code,
    name: projectText(
      context.resolver,
      sourceRef,
      source('element', enemyId, field),
      context.elementNameFallbacks?.[code] ?? code,
      {
        requirement: 'required',
        visibility: 'emitted',
        fallbackUsed: true,
        productRouteReachability: 'reachable'
      }
    )
  };
}

function projectExtraEffects(
  enemyId: string,
  skillId: string,
  ids: string[],
  context: EnemyProjectionContext
): SkillExtraEffect[] {
  return ids.flatMap((id) => {
    const effect = context.extraEffectsById.get(id);
    if (!effect) {
      context.onUnresolvedExtraEffect?.(enemyId, skillId, id);
      return [];
    }
    const name = projectText(
      context.resolver,
      effect.nameSource,
      source('enemy-skill-extra-effect', id, 'ExtraEffectName'),
      '',
      {
        requirement: 'required',
        visibility: 'emitted',
        fallbackUsed: false,
        productRouteReachability: 'reachable'
      }
    );
    const description = projectGameText(
      context.resolver,
      effect.descriptionSource,
      source('enemy-skill-extra-effect', id, 'ExtraEffectDesc'),
      '',
      {
        requirement: 'required',
        visibility: 'emitted',
        fallbackUsed: false,
        productRouteReachability: 'reachable'
      },
      (diagnostics) =>
        context.onDescriptionDiagnostics?.(
          'enemy-skill-extra-effect',
          id,
          diagnostics.map((diagnostic) => ({ level: 1, ...diagnostic }))
        )
    ).text;
    if (!gameTextToPlain(name).trim() || !gameTextToPlain(description).trim()) return [];
    return [{ id, name, description }];
  });
}

function projectSkill(
  enemyId: string,
  skill: import('../../../src/lib/domain/neutral.js').EnemySkillDomain,
  context: EnemyProjectionContext
): EnemySkill | undefined {
  const description = projectEnemySkillDescription(
    context.resolver,
    skill.id,
    skill.descriptionSource,
    (diagnostics) =>
      context.onDescriptionDiagnostics?.(
        'enemy-skill',
        skill.id,
        diagnostics.map((diagnostic) => ({ level: 1, ...diagnostic }))
      )
  );
  if (description.status !== 'available') return undefined;
  const tagLabel = projectText(
    context.resolver,
    skill.tagSource,
    source('enemy-skill', skill.id, 'SkillTag'),
    '',
    {
      requirement: 'required',
      visibility: 'emitted',
      fallbackUsed: false,
      productRouteReachability: 'reachable'
    }
  );
  const name = projectText(
    context.resolver,
    skill.nameSource,
    source('enemy-skill', skill.id, 'SkillName'),
    context.skillNameFallback?.(skill.id) ?? `Skill ${skill.id}`,
    {
      requirement: 'required',
      visibility: 'emitted',
      fallbackUsed: true,
      productRouteReachability: 'reachable'
    }
  );
  return {
    id: skill.id,
    name,
    description: description.text,
    kind: skill.kind,
    tag: { code: skill.tagCode, label: tagLabel, known: true },
    ...(skill.damageType
      ? {
          damageType: elementLabel(
            skill.damageType,
            undefined,
            context,
            enemyId,
            `skill.${skill.id}`
          )
        }
      : {}),
    phases: skill.phases,
    extraEffects: projectExtraEffects(enemyId, skill.id, skill.extraEffectIds, context)
  };
}

export function projectEnemySkillDescription(
  resolver: TextResolver,
  skillId: string,
  descriptionSource: NeutralTextSource | undefined,
  onDiagnostics?: (diagnostics: DescriptionDiagnostic[]) => void
): { text: string; status: 'available' | 'missing' } {
  return projectGameText(
    resolver,
    descriptionSource,
    source('enemy-skill', skillId, 'SkillDesc'),
    '',
    {
      requirement: 'optional',
      visibility: 'emitted',
      fallbackUsed: false,
      productRouteReachability: 'reachable'
    },
    onDiagnostics
  );
}

function projectSkillDetail(
  detail: EnemySkillDetailDomain,
  context: EnemyProjectionContext
): EnemySkillDetail {
  return {
    ...(detail.damage ? { damage: detail.damage } : {}),
    ...(detail.applications
      ? {
          applications: detail.applications.map((application) => ({
            ...application,
            ...(application.statusId
              ? {
                  name: projectText(
                    context.resolver,
                    context.statusNamesById?.get(application.statusId),
                    source('enemy-status', application.statusId, 'StatusName'),
                    `Status ${application.statusId}`,
                    {
                      requirement: 'required',
                      visibility: 'emitted',
                      fallbackUsed: true,
                      productRouteReachability: 'reachable'
                    }
                  )
                }
              : {})
          }))
        }
      : {}),
    ...(detail.actionShifts ? { actionShifts: detail.actionShifts } : {})
  };
}

const visibleText = {
  requirement: 'required',
  visibility: 'emitted',
  fallbackUsed: true,
  productRouteReachability: 'reachable'
} as const;

export function projectEnemyIdentityText(
  resolver: TextResolver,
  ref: NeutralTextSource | undefined,
  id: string,
  field: 'MonsterTemplateConfig.MonsterName' | 'MonsterName' | 'MonsterIntroduction',
  fallback?: string
): string | undefined {
  const { text, status } = projectGameText(
    resolver,
    ref,
    source(
      field === 'MonsterTemplateConfig.MonsterName' ? 'enemy-template' : 'enemy-monster',
      id,
      field
    ),
    '',
    fallback === undefined
      ? { ...visibleText, requirement: 'optional', fallbackUsed: false }
      : visibleText
  );
  return status === 'available' ? text : fallback;
}

export function projectEnemies(
  domains: EnemyDomain[],
  context: EnemyProjectionContext
): { enemies: Enemy[]; catalog: EnemyCatalogEntry[] } {
  const summaries = new Map<string, Omit<EnemySummonReference, 'href'>>();
  const templateNames = new Map<string, string>();

  for (const domain of domains) {
    const { monsterTemplateId, nameSource, rank } = domain.template;
    const templateName = projectEnemyIdentityText(
      context.resolver,
      nameSource,
      monsterTemplateId,
      'MonsterTemplateConfig.MonsterName',
      context.enemyNameFallback?.(monsterTemplateId) ?? `Enemy ${monsterTemplateId}`
    )!;
    templateNames.set(monsterTemplateId, templateName);

    for (const monster of domain.monsters) {
      const { monsterId } = monster;
      const name = projectEnemyIdentityText(
        context.resolver,
        monster.nameSource,
        monsterId,
        'MonsterName',
        templateName
      )!;
      summaries.set(monsterId, {
        monsterId,
        monsterTemplateId,
        name,
        rank,
        weaknesses: monster.weaknesses.map((code) =>
          elementLabel(code, domain.elementNameSources[code], context, monsterId, 'StanceWeakList')
        )
      });
    }
  }

  const enemies: Enemy[] = [];
  const catalog: EnemyCatalogEntry[] = [];
  for (const domain of domains) {
    const { monsterTemplateId, baseStats, rank } = domain.template;
    const name = templateNames.get(monsterTemplateId)!;
    const template = { monsterTemplateId, baseStats, rank, name };
    const definitions = new Map<string, EnemySkill>();
    for (const skill of Object.values(domain.skillDefinitions)) {
      const definition = projectSkill(monsterTemplateId, skill, context);
      if (definition) definitions.set(skill.id, definition);
    }

    const statProgressions: Enemy['statProgressions'] = [];
    const progressionRefs = new Map<string, number>();
    const monsters = domain.monsters.map((monster): MonsterVariant => {
      const { monsterId } = monster;
      const identity = summaries.get(monsterId)!;
      const introduction = projectEnemyIdentityText(
        context.resolver,
        monster.introductionSource,
        monsterId,
        'MonsterIntroduction'
      );
      const stats = compactEnemyStatProgression(monster.stats);
      const key = JSON.stringify(stats);
      let statsRef = progressionRefs.get(key);
      if (statsRef === undefined) {
        statsRef = statProgressions.length;
        progressionRefs.set(key, statsRef);
        statProgressions.push(stats);
      }
      const skills = monster.skills.flatMap(({ skillId, detail }) =>
        definitions.has(skillId)
          ? [{ id: skillId, ...(detail ? { detail: projectSkillDetail(detail, context) } : {}) }]
          : []
      );
      return {
        monsterId,
        name: identity.name,
        ...(introduction !== undefined ? { introduction } : {}),
        statsRef,
        weaknesses: identity.weaknesses,
        resistances: monster.resistances.map(({ element, value }) => ({
          ...elementLabel(
            element,
            domain.elementNameSources[element],
            context,
            monsterId,
            'DamageTypeResistance'
          ),
          value
        })),
        specialResistances: monster.specialResistances.map(({ code, value }) => ({
          code,
          label: context.specialResistanceLabels?.[code] ?? code,
          value
        })),
        summons: monster.summons.map(({ monsterId, monsterTemplateId }) => ({
          ...summaries.get(monsterId)!,
          href: enemyDetailHref(monsterTemplateId, monsterId)
        })),
        skills,
        skillPhases: buildEnemySkillPhases(skills.map(({ id }) => definitions.get(id)!))
      };
    });
    const { defaultMonsterId } = domain;
    const representative = summaries.get(defaultMonsterId)!;
    enemies.push({
      template,
      defaultMonsterId,
      monsters,
      statProgressions,
      skillDefinitions: [...definitions.values()]
    });
    catalog.push({
      id: monsterTemplateId,
      name,
      type: rank,
      representative: { monsterId: defaultMonsterId, weaknesses: representative.weaknesses },
      variants: monsters.map(({ monsterId, name }) => ({ monsterId, name }))
    });
  }
  return { enemies, catalog };
}
