import type { EnemyDomain, NeutralTextSource } from '../../../src/lib/domain/neutral.js';
import type {
  Enemy,
  EnemyCatalogEntry,
  EnemySkill,
  ElementLabel,
  SkillExtraEffect
} from '../../../src/lib/domain/types.js';
import type { TextResolver } from '../localization.js';
import type { TextDiagnosticDisposition, TextSource } from '../localization.js';
import type { LevelledDescriptionDiagnostic } from '../levelled.js';
import type { DescriptionDiagnostic } from '../text.js';
import { gameTextToPlain, normalizeGameText } from '../../../src/lib/domain/game-text.js';
import { buildEnemySkillPhases } from '../enemy-detail.js';

export interface EnemyProjectionContext {
  resolver: TextResolver;
  enemiesById: ReadonlyMap<string, EnemyDomain>;
  extraEffectsById: ReadonlyMap<
    string,
    import('../../../src/lib/domain/neutral.js').NeutralExtraEffect
  >;
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

function source(entity: string, id: string, field: string): TextSource {
  return { entity, id, field };
}

function projectText(
  resolver: TextResolver,
  value: NeutralTextSource | undefined,
  field: TextSource,
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
  field: TextSource,
  fallback: string,
  disposition: TextDiagnosticDisposition,
  onDiagnostics?: (diagnostics: DescriptionDiagnostic[]) => void
): { text: string; status: 'available' | 'missing' } {
  if (!value) {
    resolver.recordAbsent(field, disposition);
    return { text: fallback, status: fallback ? 'available' : 'missing' };
  }
  const result = resolver.projectGameText(value, {
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
    status: gameTextToPlain(result.value.markup).trim() ? 'available' : 'missing'
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
  const kindLabel = projectText(
    context.resolver,
    skill.kindSource,
    source('enemy-skill', skill.id, 'SkillTypeDesc'),
    '',
    {
      requirement: 'required',
      visibility: skill.included ? 'emitted' : 'hidden',
      fallbackUsed: false,
      productRouteReachability: skill.included ? 'reachable' : 'unreachable'
    }
  );
  const tagLabel = projectText(
    context.resolver,
    skill.tagSource,
    source('enemy-skill', skill.id, 'SkillTag'),
    '',
    {
      requirement: 'required',
      visibility: skill.included ? 'emitted' : 'hidden',
      fallbackUsed: false,
      productRouteReachability: skill.included ? 'reachable' : 'unreachable'
    }
  );
  const description = projectGameText(
    context.resolver,
    skill.descriptionSource,
    source('enemy-skill', skill.id, 'SkillDesc'),
    '',
    {
      requirement: 'optional',
      visibility: skill.included ? 'emitted' : 'hidden',
      fallbackUsed: skill.included,
      productRouteReachability: skill.included ? 'reachable' : 'unreachable'
    },
    (diagnostics) =>
      context.onDescriptionDiagnostics?.(
        'enemy-skill',
        skill.id,
        diagnostics.map((diagnostic) => ({ level: 1, ...diagnostic }))
      )
  );
  if (!skill.included) return undefined;
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
    kindLabel,
    localizedTextStatus: description.status,
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

function projectEnemy(domain: EnemyDomain, context: EnemyProjectionContext): Enemy {
  const elementSource = (code: string) =>
    domain.elementNameSources[code as keyof typeof domain.elementNameSources];
  const projectWeaknesses = (codes: string[], field: string) =>
    codes.map((code) => elementLabel(code, elementSource(code), context, domain.id, field));
  const projectMonster = (monster: EnemyDomain['monsters'][number]) => {
    const skills = monster.skills.flatMap((skill) => {
      const projected = projectSkill(domain.id, skill, context);
      return projected ? [projected] : [];
    });
    const skillPhases = buildEnemySkillPhases(
      monster.skills.map((skill) => ({
        id: skill.id,
        phases: skill.phases,
        visible: skill.included
      }))
    );
    return {
      monsterId: monster.monsterId,
      monsterTemplateId: monster.monsterTemplateId,
      hardLevelGroup: monster.hardLevelGroup,
      ...(monster.eliteGroup ? { eliteGroup: monster.eliteGroup } : {}),
      modifiers: monster.modifiers,
      stats: monster.stats,
      weaknesses: projectWeaknesses(monster.weaknesses, 'StanceWeakList'),
      resistances: monster.resistances.map((resistance) => ({
        ...elementLabel(
          resistance.element,
          elementSource(resistance.element),
          context,
          domain.id,
          'DamageTypeResistance'
        ),
        value: resistance.value
      })),
      specialResistances: monster.specialResistances.map(({ code, value }) => ({
        code,
        label: context.specialResistanceLabels?.[code] ?? code,
        value
      })),
      summons: monster.summons.map((summon) => {
        const target = context.enemiesById.get(summon.monsterTemplateId);
        const targetName = target
          ? projectText(
              context.resolver,
              target.nameSource ?? target.template.nameSource,
              source('enemy', target.id, 'MonsterName'),
              context.enemyNameFallback?.(target.id) ?? `Enemy ${target.id}`,
              {
                requirement: 'required',
                visibility: 'emitted',
                fallbackUsed: true,
                productRouteReachability: 'reachable'
              }
            )
          : (context.enemyNameFallback?.(summon.monsterTemplateId) ??
            `Enemy ${summon.monsterTemplateId}`);
        return {
          monsterId: summon.monsterId,
          monsterTemplateId: summon.monsterTemplateId,
          name: targetName,
          rank: summon.rank,
          weaknesses: target
            ? projectWeaknessesFrom(target, summon.weaknesses, context)
            : summon.weaknesses.map((code) => ({ element: code, name: code })),
          href: `/enemies/${summon.monsterTemplateId}`
        };
      }),
      skills,
      skillPhases
    };
  };
  const monsters = domain.monsters.map(projectMonster);
  const defaultMonster = monsters.find((monster) => monster.monsterId === domain.defaultMonsterId);
  if (!defaultMonster)
    throw new Error(`Enemy ${domain.id} 缺少 default Monster ${domain.defaultMonsterId}`);
  const name = projectText(
    context.resolver,
    domain.nameSource ?? domain.template.nameSource,
    source('enemy', domain.id, 'MonsterTemplateConfig.MonsterName'),
    context.enemyNameFallback?.(domain.id) ?? `Enemy ${domain.id}`,
    {
      requirement: 'required',
      visibility: 'emitted',
      fallbackUsed: true,
      productRouteReachability: 'reachable'
    }
  );
  const description = projectText(
    context.resolver,
    domain.descriptionSource,
    source('enemy', domain.id, 'MonsterIntroduction'),
    '',
    {
      requirement: 'optional',
      visibility: 'emitted',
      fallbackUsed: true,
      productRouteReachability: 'reachable'
    }
  );
  return {
    id: domain.id,
    name,
    ...(domain.descriptionSource ? { description } : {}),
    type: domain.rank,
    typeName: domain.rank,
    kind: 'enemy',
    rank: domain.rank,
    template: {
      monsterTemplateId: domain.template.monsterTemplateId,
      name,
      rank: domain.template.rank,
      baseStats: domain.template.baseStats
    },
    monsters,
    defaultMonsterId: domain.defaultMonsterId,
    defaultMonster,
    weaknesses: defaultMonster.weaknesses
  };
}

function projectWeaknessesFrom(
  domain: EnemyDomain,
  codes: string[],
  context: EnemyProjectionContext
): ElementLabel[] {
  return codes.map((code) =>
    elementLabel(
      code,
      domain.elementNameSources[code as keyof typeof domain.elementNameSources],
      context,
      domain.id,
      'StanceWeakList'
    )
  );
}

export function projectEnemies(
  domains: EnemyDomain[],
  context: EnemyProjectionContext
): { enemies: Enemy[]; catalog: EnemyCatalogEntry[] } {
  const enemies = domains.map((domain) => projectEnemy(domain, context));
  const catalog = enemies.map(({ id, name, description, type, typeName, weaknesses }) => ({
    id,
    name,
    ...(description !== undefined ? { description } : {}),
    type: type ?? 'Unknown',
    typeName: typeName ?? type ?? 'Unknown',
    weaknesses
  }));
  return { enemies, catalog };
}
