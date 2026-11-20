import type {
  Enemy,
  EnemySkill,
  EnemySkillDetail,
  EnemyStatCompactValue,
  EnemyStatProgression,
  EnemyStatProgressionCompact,
  EnemyStatsAtLevel,
  EnemyStatValue,
  EnemySummonReference,
  MonsterVariant
} from './types.js';

export interface EnemySummonView extends EnemySummonReference {
  portraitUrl?: string;
}

export interface EnemyMonsterPageData extends MonsterVariant {
  summons: EnemySummonView[];
}

export interface EnemyDetailPageData extends Enemy {
  portraitUrl?: string;
  monsters: EnemyMonsterPageData[];
}

export interface EnemySkillView extends EnemySkill {
  detail?: EnemySkillDetail;
}

export function enemyDetailHref(templateId: string | number, monsterId?: string | number): string {
  const path = `/enemies/${templateId}`;
  return monsterId === undefined ? path : `${path}/?monster=${monsterId}`;
}

export function selectedEnemyMonster<Variant extends MonsterVariant>(
  enemy: Pick<Enemy, 'template' | 'defaultMonsterId'> & { monsters: Variant[] },
  params: URLSearchParams
): Variant {
  const requested = params.getAll('monster');
  const monster =
    (requested.length === 1 &&
      enemy.monsters.find(({ monsterId }) => monsterId === requested[0])) ||
    enemy.monsters.find(({ monsterId }) => monsterId === enemy.defaultMonsterId);
  if (!monster) throw new Error(`Enemy ${enemy.template.monsterTemplateId} has no default Monster`);
  return monster;
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
    ...(progression.levels.some(({ level }, index) => level !== progression.minLevel + index)
      ? { availableLevels: progression.levels.map(({ level }) => level) }
      : {}),
    hp: progression.levels.map((row) => compactStatValue(row.hp)),
    attack: progression.levels.map((row) => compactStatValue(row.attack)),
    defence: progression.levels.map((row) => compactStatValue(row.defence)),
    speed: progression.levels.map((row) => compactStatValue(row.speed)),
    toughness: progression.levels.map((row) => compactStatValue(row.toughness)),
    effectHit: progression.levels.map((row) => compactStatValue(row.effectHit)),
    effectResistance: progression.levels.map((row) => compactStatValue(row.effectResistance))
  };
}

/** Resolve ordered, locale-ready skills for one concrete Monster without parser data. */
export function getEnemySkillsForMonster(page: Enemy, monsterId: string): EnemySkillView[] {
  const monster = page.monsters.find((candidate) => candidate.monsterId === monsterId);
  if (!monster)
    throw new Error(`Enemy ${page.template.monsterTemplateId} 缺少 Monster ${monsterId}`);
  const definitions = new Map(page.skillDefinitions.map((skill) => [skill.id, skill]));
  return monster.skills.map((binding) => {
    const definition = definitions.get(binding.id);
    if (!definition) throw new Error(`Monster ${monsterId} 引用了未知技能定义 ${binding.id}`);
    return { ...definition, ...binding };
  });
}

export function getEnemyMonsterStatProgression(
  detail: Enemy,
  monster: MonsterVariant
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
  const index = progression.availableLevels
    ? progression.availableLevels.indexOf(numericLevel)
    : numericLevel - progression.minLevel;
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
