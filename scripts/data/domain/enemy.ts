import type {
  EnemyDomain,
  EnemyMonsterDomain,
  EnemySkillDetailDomain,
  EnemySkillDomain,
  EnemySummonDomain,
  EnemyTemplateDomain
} from '../../../src/lib/domain/neutral.js';
import { parseTextHash } from '../../../src/lib/domain/types.js';
import type { ElementType } from '../../../src/lib/domain/elements.js';
import { isElementType, normalizeElementType } from '../../../src/lib/domain/elements.js';
import { textSource, parameterized, rows, type Raw } from './shared.js';
import { decimalOf } from '../decimal.js';
import { numberOf } from '../raw.js';
import {
  normalizeEnemyPhases,
  normalizeSpecialResistances,
  resolveEnemyVariantStats
} from '../enemy-detail.js';
import { classifyEnemySkillSource } from '../enemy-skill-policy.js';

export interface EnemySource {
  tables: Record<string, unknown>;
  skillDetails?: ReadonlyMap<string, ReadonlyMap<string, EnemySkillDetailDomain>>;
}

export interface EnemyDomainAudit {
  defaultSelection: { sameId: number; fallback: Array<{ templateId: string; monsterId: string }> };
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

function indexRows(input: Raw[], field: string): Map<string, Raw> {
  const index = new Map<string, Raw>();
  for (const row of input) {
    const id = String(row[field]);
    if (!/^[1-9]\d*$/.test(id) || index.has(id)) {
      throw new Error(`Invalid or duplicate ${field}=${id}`);
    }
    index.set(id, row);
  }
  return index;
}

export function enemyTextSource(value: unknown, id: string, field: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'object' && !Array.isArray(value)) {
    if (!Object.keys(value).length) return undefined;
    if ('Hash' in value && parseTextHash(value.Hash)) return textSource(value);
  }
  throw new Error(`Enemy ${id} has malformed ${field} reference`);
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
  field: string
) {
  return (Array.isArray(value) ? value : []).flatMap((raw: Raw) => {
    const type = element(raw.DamageType, audit, enemyId, field);
    const amount = numberOf(raw.Value);
    if (!type || amount === 0) return [];
    if (currentWeaknesses.includes(type))
      audit.weaknessResistanceConflicts.push({ enemyId, element: type, value: amount });
    return [{ element: type, value: amount }];
  });
}

function extraEffectIds(row: Raw): string[] {
  return unique([...ids(row.ExtraEffectIDList), ...ids(row.SimpleExtraEffectIDList)]);
}

function buildSkill(row: Raw, enemyId: string, audit: EnemyDomainAudit): EnemySkillDomain {
  const id = String(row.SkillID);
  const semantics = classifyEnemySkillSource(row, { enemyId, skillId: id });
  const damageType =
    row.DamageType === undefined
      ? undefined
      : element(row.DamageType, audit, enemyId, `skill:${id}`);
  return {
    id,
    nameSource: textSource(row.SkillName),
    descriptionSource: parameterized(row.SkillDesc, row.ParamList),
    tagSource: textSource(row.SkillTag),
    kind: semantics.kind,
    tagCode: semantics.tag.code,
    ...(damageType ? { damageType } : {}),
    phases: normalizeEnemyPhases(row.PhaseList),
    extraEffectIds: extraEffectIds(row)
  };
}

function buildSummons(
  value: unknown,
  enemyId: string,
  monsterRows: Map<string, Raw>,
  audit: EnemyDomainAudit
): EnemySummonDomain[] {
  const seen = new Set<string>();
  return (Array.isArray(value) ? value : []).flatMap((rawId) => {
    if (rawId === undefined || rawId === null || String(rawId) === '' || String(rawId) === '0')
      return [];
    const monsterId = String(rawId);
    const config = monsterRows.get(monsterId);
    const templateId = String(config?.MonsterTemplateID ?? '');
    if (!config) {
      audit.unresolvedSummons.push({ enemyId, monsterId });
      return [];
    }
    if (seen.has(monsterId)) return [];
    seen.add(monsterId);
    return [
      {
        monsterId,
        monsterTemplateId: templateId
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
  const monsterRows = indexRows(configs, 'MonsterID');
  const monsterTemplates = indexRows(templates, 'MonsterTemplateID');
  const monstersByTemplate = new Map<string, Raw[]>();
  for (const row of configs) {
    const templateId = String(row.MonsterTemplateID);
    if (!monsterTemplates.has(templateId)) {
      throw new Error(`Monster ${row.MonsterID} has invalid MonsterTemplateID=${templateId}`);
    }
    const related = monstersByTemplate.get(templateId) ?? [];
    related.push(row);
    monstersByTemplate.set(templateId, related);
  }
  const hardLevels = new Map<string, Raw[]>();
  for (const row of rows(source.tables, 'HardLevelGroup')) {
    const id = String(row.HardLevelGroup);
    hardLevels.set(id, [...(hardLevels.get(id) ?? []), row]);
  }
  const eliteGroups = indexRows(rows(source.tables, 'EliteGroup'), 'EliteGroup');
  const elementNameSources: Partial<Record<ElementType, ReturnType<typeof textSource>>> = {};
  for (const row of rows(source.tables, 'DamageType')) {
    const code = normalizeElementType(String(row.ID));
    if (isElementType(code)) elementNameSources[code] = textSource(row.DamageTypeName);
  }
  const audit: EnemyDomainAudit = {
    defaultSelection: { sameId: 0, fallback: [] },
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
    const hardLevelGroup = String(config.HardLevelGroup);
    const eliteGroup = String(config.EliteGroup);
    const levelRows = hardLevels.get(hardLevelGroup);
    const elite = eliteGroups.get(eliteGroup);
    if (!levelRows)
      throw new Error(`Monster ${enemyId} has invalid HardLevelGroup=${hardLevelGroup}`);
    if (!elite) throw new Error(`Monster ${enemyId} has invalid EliteGroup=${eliteGroup}`);
    const stats = resolveEnemyVariantStats(template, config, levelRows, elite);
    for (const level of stats.levels) {
      for (const [field, value] of Object.entries(level)) {
        if (
          typeof value !== 'number' &&
          value.status === 'unavailable' &&
          value.reason === 'invalid-reference'
        )
          throw new Error(`Monster ${enemyId} has invalid ${field} at level ${level.level}`);
      }
    }
    const weak = weaknesses(config.StanceWeakList, audit, enemyId, 'StanceWeakList');
    const skillDomains = unique(ids(config.SkillList)).flatMap((rawSkillId) => {
      const skill = skills.get(rawSkillId);
      if (!skill) {
        audit.unresolvedSkills.push({ enemyId, skillId: rawSkillId });
        return [];
      }
      const detail = source.skillDetails?.get(enemyId)?.get(rawSkillId);
      return [{ skillId: rawSkillId, ...(detail ? { detail } : {}) }];
    });
    const special = normalizeSpecialResistances(config.DebuffResist);
    audit.unknownDebuffResist.push(...special.unknownKeys.map((key) => ({ enemyId, key })));
    return {
      monsterId: enemyId,
      monsterTemplateId: templateId,
      nameSource: enemyTextSource(config.MonsterName, enemyId, 'MonsterName'),
      introductionSource: enemyTextSource(
        config.MonsterIntroduction,
        enemyId,
        'MonsterIntroduction'
      ),
      hardLevelGroup,
      eliteGroup,
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
        'DamageTypeResistance'
      ),
      specialResistances: special.values.map(({ code, value }) => ({ code, value })),
      summons: buildSummons(config.SummonIDList, enemyId, monsterRows, audit),
      skills: skillDomains
    };
  };

  const enemies = templates.map((template): EnemyDomain => {
    const id = String(template.MonsterTemplateID);
    const related = monstersByTemplate.get(id);
    if (!related?.length) throw new Error(`Enemy ${id} has no MonsterConfig records`);
    const defaultMonsterId = related.some((row) => String(row.MonsterID) === id)
      ? id
      : related
          .map((row) => String(row.MonsterID))
          .sort(
            (left, right) =>
              left.length - right.length || (left < right ? -1 : left > right ? 1 : 0)
          )[0];
    if (defaultMonsterId === id) audit.defaultSelection.sameId += 1;
    else audit.defaultSelection.fallback.push({ templateId: id, monsterId: defaultMonsterId });
    if (template.SpeedBase === undefined) audit.missingAttributes.speedBase.push(id);
    if (template.StanceBase === undefined) audit.missingAttributes.stanceBase.push(id);
    if (template.StatusResistanceBase === undefined)
      audit.missingAttributes.statusResistanceBase.push(id);
    const templateDomain: EnemyTemplateDomain = {
      monsterTemplateId: id,
      nameSource: enemyTextSource(template.MonsterName, id, 'MonsterTemplateConfig.MonsterName'),
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
          : {}),
        ...(template.InitialDelayRatio !== undefined
          ? {
              initialDelayRatio: decimalOf(
                template.InitialDelayRatio,
                `MonsterTemplate.${id}.InitialDelayRatio`
              )
            }
          : {})
      }
    };
    const skillDefinitions: Record<string, EnemySkillDomain> = {};
    for (const config of related)
      for (const skillId of ids(config.SkillList)) {
        if (skillDefinitions[skillId]) continue;
        const row = skills.get(skillId);
        if (row) skillDefinitions[skillId] = buildSkill(row, id, audit);
      }
    return {
      elementNameSources,
      template: templateDomain,
      skillDefinitions,
      monsters: related.map((config) => buildMonster(template, config, id)),
      defaultMonsterId
    };
  });
  return { enemies, audit };
}
