import type { DecimalString } from './endgame.js';
import type {
  ElementLabel,
  Enemy,
  EnemySkill,
  EnemyStatProgression,
  EnemyStatValue,
  EnemySummonReference,
  Monster
} from './types.js';

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

export interface EnemySkillDefinitionView {
  id: string;
  name: string;
  description: string;
  tag: EnemySkill['tag'];
  damageType?: ElementLabel;
  extraEffects: EnemySkill['extraEffects'];
}

export type EnemyStatCompactValue = DecimalString | null;

export interface EnemyStatProgressionCompact {
  minLevel: number;
  maxLevel: number;
  defaultLevel: number;
  hp: EnemyStatCompactValue[];
  attack: EnemyStatCompactValue[];
  defence: EnemyStatCompactValue[];
  speed: EnemyStatCompactValue[];
  toughness: EnemyStatCompactValue[];
  effectHit: EnemyStatCompactValue[];
  effectResistance: EnemyStatCompactValue[];
}

export interface EnemyStatsAtLevel {
  hp: EnemyStatCompactValue;
  attack: EnemyStatCompactValue;
  defence: EnemyStatCompactValue;
  speed: EnemyStatCompactValue;
  toughness: EnemyStatCompactValue;
  effectHit: EnemyStatCompactValue;
  effectResistance: EnemyStatCompactValue;
}

export interface EnemyMonsterPageData {
  monsterId: string;
  statsRef: number;
  weaknesses: Monster['weaknesses'];
  resistances: Monster['resistances'];
  specialResistances: Monster['specialResistances'];
  summons: EnemySummonView[];
  skillPhases: EnemySkillPhaseView[];
}

export interface EnemyDetailPageData {
  id: string;
  name: string;
  description?: string;
  template: Enemy['template'];
  portraitUrl?: string;
  defaultMonsterId: string;
  monsters: EnemyMonsterPageData[];
  statProgressions: EnemyStatProgressionCompact[];
  skillDefinitions: EnemySkillDefinitionView[];
}

export const enemySkillAnchorId = (skillId: string): string => `enemy-skill-${skillId}`;

function buildEnemySkillDefinitions(enemy: Enemy): EnemySkillDefinitionView[] {
  const defaultMonster = enemy.monsters.find(
    (monster) => monster.monsterId === enemy.defaultMonsterId
  );
  if (!defaultMonster)
    throw new Error(`Enemy ${enemy.id} 缺少 default Monster ${enemy.defaultMonsterId}`);

  const definitions: EnemySkillDefinitionView[] = [];
  const seen = new Set<string>();
  for (const monster of [
    defaultMonster,
    ...enemy.monsters.filter((candidate) => candidate.monsterId !== enemy.defaultMonsterId)
  ])
    for (const skill of monster.skills) {
      if (seen.has(skill.id)) continue;
      seen.add(skill.id);
      definitions.push({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        tag: skill.tag,
        ...(skill.damageType ? { damageType: skill.damageType } : {}),
        extraEffects: skill.extraEffects
      });
    }
  return definitions;
}

const compactStatValue = (value: EnemyStatValue): EnemyStatCompactValue =>
  value.status === 'resolved' ? value.value : null;

export function compactEnemyStatProgression(
  progression: EnemyStatProgression
): EnemyStatProgressionCompact {
  return {
    minLevel: progression.minLevel,
    maxLevel: progression.maxLevel,
    defaultLevel: progression.defaultLevel,
    hp: progression.levels.map((row) => compactStatValue(row.hp)),
    attack: progression.levels.map((row) => compactStatValue(row.attack)),
    defence: progression.levels.map((row) => compactStatValue(row.defence)),
    speed: progression.levels.map((row) => compactStatValue(row.speed)),
    toughness: progression.levels.map((row) => compactStatValue(row.toughness)),
    effectHit: progression.levels.map((row) => compactStatValue(row.effectHit)),
    effectResistance: progression.levels.map((row) => compactStatValue(row.effectResistance))
  };
}

function buildEnemyMonsterPageData(monster: Monster, statsRef: number): EnemyMonsterPageData {
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
    statsRef,
    weaknesses: monster.weaknesses,
    resistances: monster.resistances,
    specialResistances: monster.specialResistances,
    summons,
    skillPhases
  };
}

export function buildEnemyDetailPageData(enemy: Enemy): EnemyDetailPageData {
  if (!enemy.monsters.some((monster) => monster.monsterId === enemy.defaultMonsterId))
    throw new Error(`Enemy ${enemy.id} 缺少 default Monster ${enemy.defaultMonsterId}`);

  const statProgressions: EnemyStatProgressionCompact[] = [];
  const progressionRefs = new Map<string, number>();
  const monsters = enemy.monsters.map((monster) => {
    const progression = compactEnemyStatProgression(monster.stats);
    const key = JSON.stringify(progression);
    let statsRef = progressionRefs.get(key);
    if (statsRef === undefined) {
      statsRef = statProgressions.length;
      progressionRefs.set(key, statsRef);
      statProgressions.push(progression);
    }
    return buildEnemyMonsterPageData(monster, statsRef);
  });

  return {
    id: enemy.id,
    name: enemy.name,
    template: enemy.template,
    defaultMonsterId: enemy.defaultMonsterId,
    ...(enemy.description !== undefined ? { description: enemy.description } : {}),
    monsters,
    statProgressions,
    skillDefinitions: buildEnemySkillDefinitions(enemy)
  };
}

export function getEnemyMonsterStatProgression(
  detail: EnemyDetailPageData,
  monster: EnemyMonsterPageData
): EnemyStatProgressionCompact {
  const progression = detail.statProgressions[monster.statsRef];
  if (!progression)
    throw new Error(`Monster ${monster.monsterId} 引用了无效属性进度 ${monster.statsRef}`);
  return progression;
}

export function getEnemyStatsAtLevel(
  progression: EnemyStatProgressionCompact,
  level: number
): EnemyStatsAtLevel | undefined {
  const numericLevel = Number(level);
  if (!Number.isInteger(numericLevel)) return undefined;
  const index = numericLevel - progression.minLevel;
  if (index < 0 || numericLevel > progression.maxLevel) return undefined;
  return {
    hp: progression.hp[index] ?? null,
    attack: progression.attack[index] ?? null,
    defence: progression.defence[index] ?? null,
    speed: progression.speed[index] ?? null,
    toughness: progression.toughness[index] ?? null,
    effectHit: progression.effectHit[index] ?? null,
    effectResistance: progression.effectResistance[index] ?? null
  };
}
