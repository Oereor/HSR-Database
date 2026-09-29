import type { DecimalString } from './endgame.js';
import type {
  ElementLabel,
  Enemy,
  EnemySkill,
  EnemySkillDetail,
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
  kind: EnemySkill['kind'];
  tag: EnemySkill['tag'];
  damageType?: ElementLabel;
  phases: EnemySkill['phases'];
  extraEffects: EnemySkill['extraEffects'];
}

export interface EnemySkillDetailView extends Omit<EnemySkillDetail, 'summons'> {
  summons?: EnemySummonView[];
}

export interface EnemySkillBindingView {
  id: string;
  detail?: EnemySkillDetailView;
}

export interface EnemySkillView extends EnemySkillDefinitionView {
  detail?: EnemySkillDetailView;
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
  skills: EnemySkillBindingView[];
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
        kind: skill.kind,
        tag: skill.tag,
        ...(skill.damageType ? { damageType: skill.damageType } : {}),
        phases: skill.phases,
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
    skills: monster.skills.map((skill) => ({
      id: skill.id,
      ...(skill.detail ? { detail: skill.detail } : {})
    })),
    skillPhases
  };
}

/** Resolve ordered, locale-ready skills for one concrete Monster without parser data. */
export function getEnemySkillsForMonster(
  page: EnemyDetailPageData,
  monsterId: string
): EnemySkillView[] {
  const monster = page.monsters.find((candidate) => candidate.monsterId === monsterId);
  if (!monster) throw new Error(`Enemy ${page.id} 缺少 Monster ${monsterId}`);
  const definitions = new Map(page.skillDefinitions.map((skill) => [skill.id, skill]));
  return monster.skills.map((binding) => {
    const definition = definitions.get(binding.id);
    if (!definition) throw new Error(`Monster ${monsterId} 引用了未知技能定义 ${binding.id}`);
    return {
      ...definition,
      ...(binding.detail ? { detail: binding.detail } : {})
    };
  });
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
