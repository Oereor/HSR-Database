import type { ElementLabel, Enemy, EnemySkill, EnemySummonReference, Monster } from './types.js';

export interface EnemySummonView extends EnemySummonReference {
  portraitUrl?: string;
}

export interface EnemySkillReferenceView {
  id: string;
  name: string;
  href: string;
  damageType?: ElementLabel;
}

export interface EnemySkillPhaseView {
  index: number;
  skills: EnemySkillReferenceView[];
}

export interface EnemyMonsterDetailView extends Omit<
  Monster,
  'summons' | 'skills' | 'skillPhases'
> {
  summons: EnemySummonView[];
  skillPhases: EnemySkillPhaseView[];
}

export interface EnemyDetailView extends Omit<Enemy, 'monsters' | 'defaultMonster' | 'weaknesses'> {
  portraitUrl?: string;
  monsters: EnemyMonsterDetailView[];
  skillDefinitions: EnemySkill[];
}

export const enemySkillAnchorId = (skillId: string): string => `enemy-skill-${skillId}`;

export function buildEnemySkillDefinitions(enemy: Enemy): EnemySkill[] {
  const defaultMonster = enemy.monsters.find(
    (monster) => monster.monsterId === enemy.defaultMonsterId
  );
  if (!defaultMonster)
    throw new Error(`Enemy ${enemy.id} 缺少 default Monster ${enemy.defaultMonsterId}`);

  const definitions: EnemySkill[] = [];
  const seen = new Set<string>();
  for (const monster of [
    defaultMonster,
    ...enemy.monsters.filter((candidate) => candidate.monsterId !== enemy.defaultMonsterId)
  ])
    for (const skill of monster.skills) {
      if (seen.has(skill.id)) continue;
      seen.add(skill.id);
      definitions.push(skill);
    }
  return definitions;
}

export function buildEnemyMonsterDetailView(monster: Monster): EnemyMonsterDetailView {
  const skillsById = new Map(monster.skills.map((skill) => [skill.id, skill]));
  const seenSummons = new Set<string>();
  const summons = monster.summons.filter((summon) => {
    if (seenSummons.has(summon.monsterId)) return false;
    seenSummons.add(summon.monsterId);
    return true;
  });
  const skillPhases = monster.skillPhases.map((phase) => ({
    index: phase.index,
    skills: phase.skillIds.map((skillId) => {
      const skill = skillsById.get(skillId);
      if (!skill)
        throw new Error(
          `Monster ${monster.monsterId} 阶段 ${phase.index} 引用了未知技能 ${skillId}`
        );
      return {
        id: skill.id,
        name: skill.name,
        href: `#${enemySkillAnchorId(skill.id)}`,
        ...(skill.damageType ? { damageType: skill.damageType } : {})
      };
    })
  }));
  return {
    monsterId: monster.monsterId,
    monsterTemplateId: monster.monsterTemplateId,
    hardLevelGroup: monster.hardLevelGroup,
    ...(monster.eliteGroup ? { eliteGroup: monster.eliteGroup } : {}),
    modifiers: monster.modifiers,
    stats: monster.stats,
    weaknesses: monster.weaknesses,
    resistances: monster.resistances,
    specialResistances: monster.specialResistances,
    summons,
    skillPhases
  };
}

export function buildEnemyDetailView(enemy: Enemy): EnemyDetailView {
  if (!enemy.monsters.some((monster) => monster.monsterId === enemy.defaultMonsterId))
    throw new Error(`Enemy ${enemy.id} 缺少 default Monster ${enemy.defaultMonsterId}`);
  return {
    id: enemy.id,
    name: enemy.name,
    kind: enemy.kind,
    rank: enemy.rank,
    template: enemy.template,
    defaultMonsterId: enemy.defaultMonsterId,
    ...(enemy.description !== undefined ? { description: enemy.description } : {}),
    ...(enemy.rarity !== undefined ? { rarity: enemy.rarity } : {}),
    ...(enemy.path !== undefined ? { path: enemy.path } : {}),
    ...(enemy.pathName !== undefined ? { pathName: enemy.pathName } : {}),
    ...(enemy.element !== undefined ? { element: enemy.element } : {}),
    ...(enemy.elementName !== undefined ? { elementName: enemy.elementName } : {}),
    ...(enemy.version !== undefined ? { version: enemy.version } : {}),
    ...(enemy.type !== undefined ? { type: enemy.type } : {}),
    ...(enemy.typeName !== undefined ? { typeName: enemy.typeName } : {}),
    monsters: enemy.monsters.map(buildEnemyMonsterDetailView),
    skillDefinitions: buildEnemySkillDefinitions(enemy)
  };
}
