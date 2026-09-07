import type {
  EnemyDomain,
  EnemyMonsterDomain,
  EnemySkillDomain,
  EnemySummonDomain,
  EnemyTemplateDomain
} from '../../../src/lib/domain/neutral.js';
import type { ElementType } from '../../../src/lib/domain/elements.js';
import { isElementType, normalizeElementType } from '../../../src/lib/domain/elements.js';
import { textSource, parameterized, rows, type Raw } from './shared.js';
import { decimalOf } from '../decimal.js';
import { numberOf } from '../raw.js';
import {
  buildEnemySkillPhases,
  normalizeEnemyPhases,
  normalizeSpecialResistances,
  resolveCanonicalEnemyStats
} from '../enemy-detail.js';
import { classifyEnemySkillSource, type EnemySkillInclusionPolicy } from '../enemy-skill-policy.js';

export interface EnemySource {
  tables: Record<string, unknown>;
  inclusionPolicy: EnemySkillInclusionPolicy;
}

export interface EnemyDomainAudit {
  canonicalJoin: { resolved: number; missing: string[] };
  unknownSkillKinds: Array<{ enemyId: string; skillId: string; value: string }>;
  unknownSkillTags: Array<{ enemyId: string; skillId: string; value: string }>;
  unknownElements: Array<{ enemyId: string; field: string; value: string }>;
  weaknessResistanceConflicts: Array<{ enemyId: string; element: string; value: number }>;
  unknownDebuffResist: Array<{ enemyId: string; key: string }>;
  unresolvedSummons: Array<{ enemyId: string; monsterId: string }>;
  unresolvedSkills: Array<{ enemyId: string; skillId: string }>;
  unresolvedExtraEffects: Array<{ enemyId: string; skillId: string; extraEffectId: string }>;
  missingAttributes: {
    speedBase: string[];
    stanceBase: string[];
    statusResistanceBase: string[];
  };
}

export interface EnemyDomainBuild {
  enemies: EnemyDomain[];
  audit: EnemyDomainAudit;
}

function ids(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function modifierOf(config: Raw, field: string) {
  const ratio = config[`${field}ModifyRatio`];
  const value = config[`${field}ModifyValue`];
  return {
    ratio: decimalOf(
      ratio ?? { Value: '1' },
      `MonsterConfig.${config.MonsterID}.${field}ModifyRatio`
    ),
    ...(value !== undefined && value !== null
      ? { value: decimalOf(value, `MonsterConfig.${config.MonsterID}.${field}ModifyValue`) }
      : {})
  };
}

function element(
  raw: unknown,
  audit: EnemyDomainAudit,
  enemyId: string,
  field: string
): ElementType | undefined {
  const source = String(raw);
  const normalized = normalizeElementType(source);
  if (!isElementType(normalized)) {
    audit.unknownElements.push({ enemyId, field, value: source });
    return undefined;
  }
  return normalized;
}

function weaknesses(value: unknown, audit: EnemyDomainAudit, enemyId: string, field: string) {
  return unique(
    (Array.isArray(value) ? value : [])
      .map((raw) => element(raw, audit, enemyId, field))
      .filter((item): item is ElementType => !!item)
  );
}

function resistances(
  value: unknown,
  currentWeaknesses: ElementType[],
  audit: EnemyDomainAudit,
  enemyId: string,
  field: string,
  recordConflicts = true
) {
  return (Array.isArray(value) ? value : []).flatMap((raw: Raw) => {
    const type = element(raw.DamageType, audit, enemyId, field);
    const amount = numberOf(raw.Value);
    if (!type || amount === 0) return [];
    if (recordConflicts && currentWeaknesses.includes(type))
      audit.weaknessResistanceConflicts.push({ enemyId, element: type, value: amount });
    return [{ element: type, value: amount }];
  });
}

function extraEffectIds(row: Raw): string[] {
  return unique([...ids(row.ExtraEffectIDList), ...ids(row.SimpleExtraEffectIDList)]);
}

function buildSkill(
  row: Raw,
  enemyId: string,
  policy: EnemySkillInclusionPolicy,
  audit: EnemyDomainAudit
): EnemySkillDomain {
  const id = String(row.SkillID);
  const semantics = classifyEnemySkillSource(row, { enemyId, skillId: id }, policy);
  const damageType =
    row.DamageType === undefined
      ? undefined
      : element(row.DamageType, audit, enemyId, `skill:${id}`);
  return {
    id,
    nameSource: textSource(row.SkillName),
    descriptionSource: parameterized(row.SkillDesc, row.ParamList),
    kindSource: textSource(row.SkillTypeDesc),
    tagSource: textSource(row.SkillTag),
    kind: semantics.kind,
    tagCode: semantics.tag.code,
    ...(damageType ? { damageType } : {}),
    phases: normalizeEnemyPhases(row.PhaseList),
    included: semantics.visible,
    extraEffectIds: extraEffectIds(row)
  };
}

function buildSummons(
  value: unknown,
  enemyId: string,
  monsterRows: Map<string, Raw>,
  monsterTemplates: Map<string, Raw>,
  audit: EnemyDomainAudit,
  deduplicateTemplates = false
): EnemySummonDomain[] {
  const seen = new Set<string>();
  return (Array.isArray(value) ? value : []).flatMap((rawId) => {
    if (rawId === undefined || rawId === null || String(rawId) === '' || String(rawId) === '0')
      return [];
    const monsterId = String(rawId);
    const config = monsterRows.get(monsterId);
    const templateId = String(config?.MonsterTemplateID ?? '');
    const template = monsterTemplates.get(templateId);
    if (!config || !template) {
      audit.unresolvedSummons.push({ enemyId, monsterId });
      return [];
    }
    if (deduplicateTemplates && seen.has(templateId)) return [];
    seen.add(templateId);
    return [
      {
        monsterId,
        monsterTemplateId: templateId,
        rank: String(template.Rank ?? ''),
        weaknesses: weaknesses(config.StanceWeakList, audit, enemyId, 'summon.StanceWeakList')
      }
    ];
  });
}

export function buildEnemyDomain(source: EnemySource): EnemyDomainBuild {
  const templates = rows(source.tables, 'MonsterTemplateConfig');
  const configs = rows(source.tables, 'MonsterConfig');
  const skills = new Map(
    rows(source.tables, 'MonsterSkillConfig').map((row) => [String(row.SkillID), row])
  );
  const monsterRows = new Map(configs.map((row) => [String(row.MonsterID), row]));
  const monsterTemplates = new Map(templates.map((row) => [String(row.MonsterTemplateID), row]));
  const hardLevels = new Map<string, Raw[]>();
  for (const row of rows(source.tables, 'HardLevelGroup')) {
    const id = String(row.HardLevelGroup);
    hardLevels.set(id, [...(hardLevels.get(id) ?? []), row]);
  }
  const eliteGroups = new Map(
    rows(source.tables, 'EliteGroup').map((row) => [String(row.EliteGroup), row])
  );
  const elementNameSources: Partial<Record<ElementType, ReturnType<typeof textSource>>> = {};
  for (const row of rows(source.tables, 'DamageType')) {
    const code = normalizeElementType(String(row.ID));
    if (isElementType(code)) elementNameSources[code] = textSource(row.DamageTypeName);
  }
  const audit: EnemyDomainAudit = {
    canonicalJoin: { resolved: 0, missing: [] },
    unknownSkillKinds: [],
    unknownSkillTags: [],
    unknownElements: [],
    weaknessResistanceConflicts: [],
    unknownDebuffResist: [],
    unresolvedSummons: [],
    unresolvedSkills: [],
    unresolvedExtraEffects: [],
    missingAttributes: { speedBase: [], stanceBase: [], statusResistanceBase: [] }
  };

  const buildMonster = (template: Raw, config: Raw, templateId: string): EnemyMonsterDomain => {
    const enemyId = String(config.MonsterID);
    const levelRows = hardLevels.get(String(config.HardLevelGroup)) ?? [];
    const elite = eliteGroups.get(String(config.EliteGroup));
    const defaultConfig = monsterRows.get(templateId);
    const stats = elite
      ? resolveCanonicalEnemyStats(template, config, levelRows, elite)
      : defaultConfig && eliteGroups.get(String(defaultConfig.EliteGroup))
        ? resolveCanonicalEnemyStats(
            template,
            defaultConfig,
            hardLevels.get(String(defaultConfig.HardLevelGroup)) ?? [],
            eliteGroups.get(String(defaultConfig.EliteGroup))!
          )
        : resolveCanonicalEnemyStats(template, config, levelRows, elite ?? {});
    const weak = weaknesses(config.StanceWeakList, audit, enemyId, 'StanceWeakList');
    const skillDomains = ids(config.SkillList).flatMap((rawSkillId) => {
      const skill = skills.get(rawSkillId);
      if (!skill) {
        audit.unresolvedSkills.push({ enemyId, skillId: rawSkillId });
        return [];
      }
      return [buildSkill(skill, enemyId, source.inclusionPolicy, audit)];
    });
    const phases = buildEnemySkillPhases(
      skillDomains.map((skill) => ({ id: skill.id, phases: skill.phases, visible: skill.included }))
    );
    const special = normalizeSpecialResistances(config.DebuffResist);
    audit.unknownDebuffResist.push(...special.unknownKeys.map((key) => ({ enemyId, key })));
    if (template.SpeedBase === undefined) audit.missingAttributes.speedBase.push(templateId);
    if (template.StanceBase === undefined) audit.missingAttributes.stanceBase.push(templateId);
    if (template.StatusResistanceBase === undefined)
      audit.missingAttributes.statusResistanceBase.push(templateId);
    return {
      monsterId: enemyId,
      monsterTemplateId: templateId,
      hardLevelGroup: String(config.HardLevelGroup ?? ''),
      ...(config.EliteGroup !== undefined ? { eliteGroup: String(config.EliteGroup) } : {}),
      modifiers: {
        hp: modifierOf(config, 'HP'),
        attack: modifierOf(config, 'Attack'),
        defence: modifierOf(config, 'Defence'),
        speed: modifierOf(config, 'Speed'),
        stance: modifierOf(config, 'Stance')
      },
      stats,
      weaknesses: weak,
      resistances: resistances(
        config.DamageTypeResistance,
        weak,
        audit,
        enemyId,
        'DamageTypeResistance',
        enemyId === templateId
      ),
      specialResistances: special.values.map(({ code, value }) => ({ code, value })),
      summons: buildSummons(
        config.SummonIDList,
        enemyId,
        monsterRows,
        monsterTemplates,
        audit,
        enemyId === templateId
      ),
      skills: skillDomains,
      skillPhases: phases
    };
  };

  const enemies = templates.map((template): EnemyDomain => {
    const id = String(template.MonsterTemplateID);
    const canonical = monsterRows.get(id);
    if (!canonical || String(canonical.MonsterTemplateID) !== id) {
      audit.canonicalJoin.missing.push(id);
      throw new Error(`敌人 ${id} 缺少 MonsterID == MonsterTemplateID 的 canonical MonsterConfig`);
    }
    audit.canonicalJoin.resolved += 1;
    const templateDomain: EnemyTemplateDomain = {
      monsterTemplateId: id,
      nameSource: textSource(template.MonsterName),
      rank: String(template.Rank ?? ''),
      baseStats: {
        hp: decimalOf(template.HPBase, `MonsterTemplate.${id}.HPBase`),
        attack: decimalOf(template.AttackBase, `MonsterTemplate.${id}.AttackBase`),
        defence: decimalOf(template.DefenceBase, `MonsterTemplate.${id}.DefenceBase`),
        criticalDamage: decimalOf(
          template.CriticalDamageBase,
          `MonsterTemplate.${id}.CriticalDamageBase`
        ),
        ...(template.SpeedBase !== undefined
          ? { speed: decimalOf(template.SpeedBase, `MonsterTemplate.${id}.SpeedBase`) }
          : {}),
        ...(template.StanceBase !== undefined
          ? { stance: decimalOf(template.StanceBase, `MonsterTemplate.${id}.StanceBase`) }
          : {}),
        ...(template.StatusResistanceBase !== undefined
          ? {
              effectResistance: decimalOf(
                template.StatusResistanceBase,
                `MonsterTemplate.${id}.StatusResistanceBase`
              )
            }
          : {})
      }
    };
    const related = configs.filter((row) => String(row.MonsterTemplateID) === id);
    return {
      id,
      nameSource: textSource(template.MonsterName) ?? textSource(canonical.MonsterName),
      descriptionSource: textSource(canonical.MonsterIntroduction),
      rank: templateDomain.rank,
      elementNameSources,
      template: templateDomain,
      monsters: related.map((config) => buildMonster(template, config, id)),
      defaultMonsterId: id
    };
  });
  return { enemies, audit };
}
