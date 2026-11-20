import { isElementType } from '../../../src/lib/domain/elements.js';
import { enemyDetailHref } from '../../../src/lib/domain/enemy-view.js';
import type { Enemy, EnemyCatalogEntry, MonsterVariant } from '../../../src/lib/domain/types.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isId = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9]\d*$/.test(value);
const isDecimal = (value: unknown): value is string =>
  typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value);
const isName = (value: unknown): boolean => typeof value === 'string' && !!value.trim();
const unique = <T>(values: T[]): boolean => new Set(values).size === values.length;

export function assertEnemyArtifact(value: unknown, id: string): asserts value is Enemy {
  if (!isRecord(value) || !isRecord(value.template) || !isRecord(value.template.baseStats))
    throw new Error(`Enemy ${id} has an invalid template or detail shape`);
  const { template } = value;
  const baseStats = value.template.baseStats;
  if (
    template.monsterTemplateId !== id ||
    !isName(template.name) ||
    typeof template.rank !== 'string' ||
    !Object.values(baseStats).every(isDecimal) ||
    !['hp', 'attack', 'defence', 'criticalDamage'].every((key) => isDecimal(baseStats[key])) ||
    !Array.isArray(value.monsters) ||
    !value.monsters.length ||
    !Array.isArray(value.statProgressions) ||
    !Array.isArray(value.skillDefinitions) ||
    ['id', 'name', 'rank', 'description', 'weaknesses', 'defaultMonster'].some(
      (key) => key in value
    )
  )
    throw new Error(`Enemy ${id} has an invalid template or detail shape`);

  const stats = value.statProgressions;
  for (const stat of stats) {
    if (!isRecord(stat)) throw new Error(`Enemy ${id} has invalid stat progression`);
    const { minLevel, maxLevel, defaultLevel, availableLevels } = stat;
    const length = Array.isArray(availableLevels)
      ? availableLevels.length
      : Number(maxLevel) - Number(minLevel) + 1;
    if (
      typeof minLevel !== 'number' ||
      !Number.isSafeInteger(minLevel) ||
      minLevel < 1 ||
      typeof maxLevel !== 'number' ||
      !Number.isSafeInteger(maxLevel) ||
      maxLevel < minLevel ||
      typeof defaultLevel !== 'number' ||
      !Number.isSafeInteger(defaultLevel) ||
      defaultLevel < minLevel ||
      defaultLevel > maxLevel ||
      (availableLevels !== undefined &&
        (!Array.isArray(availableLevels) ||
          availableLevels[0] !== minLevel ||
          availableLevels.at(-1) !== maxLevel ||
          !availableLevels.includes(defaultLevel) ||
          availableLevels.some(
            (level, index) =>
              !Number.isSafeInteger(level) || (index > 0 && level <= availableLevels[index - 1])
          ))) ||
      !['hp', 'attack', 'defence', 'speed', 'toughness', 'effectHit', 'effectResistance'].every(
        (key) => {
          const series = stat[key];
          return (
            Array.isArray(series) &&
            series.length === length &&
            series.every((entry) => entry === null || isDecimal(entry))
          );
        }
      )
    )
      throw new Error(`Enemy ${id} has invalid stat progression`);
  }

  const definitionIds = value.skillDefinitions.map((skill) => {
    if (
      !isRecord(skill) ||
      !isId(skill.id) ||
      !isName(skill.name) ||
      !isName(skill.description) ||
      !Array.isArray(skill.phases) ||
      !Array.isArray(skill.extraEffects) ||
      'detail' in skill
    )
      throw new Error(`Enemy ${id} has an invalid shared skill definition`);
    return skill.id;
  });
  const definitions = new Set(definitionIds);
  const monsterIds = new Set<string>();
  const referencedStats = new Set<number>();
  const referencedSkills = new Set<string>();
  for (const monster of value.monsters) {
    if (
      !isRecord(monster) ||
      !isId(monster.monsterId) ||
      monsterIds.has(monster.monsterId) ||
      !isName(monster.name) ||
      (monster.introduction !== undefined && !isName(monster.introduction)) ||
      typeof monster.statsRef !== 'number' ||
      !Number.isSafeInteger(monster.statsRef) ||
      !stats[monster.statsRef] ||
      ['stats', 'modifiers', 'monsterTemplateId'].some((key) => key in monster) ||
      !Array.isArray(monster.weaknesses) ||
      !Array.isArray(monster.resistances) ||
      !Array.isArray(monster.specialResistances) ||
      !Array.isArray(monster.summons) ||
      !Array.isArray(monster.skills) ||
      !Array.isArray(monster.skillPhases) ||
      !monster.skillPhases.length
    )
      throw new Error(`Enemy ${id} has an invalid Monster or stat reference`);
    if (
      monster.weaknesses.some(
        (entry) =>
          !isRecord(entry) ||
          typeof entry.element !== 'string' ||
          !isElementType(entry.element) ||
          !isName(entry.name)
      ) ||
      monster.resistances.some(
        (entry) =>
          !isRecord(entry) ||
          typeof entry.element !== 'string' ||
          !isElementType(entry.element) ||
          !isName(entry.name) ||
          typeof entry.value !== 'number' ||
          !Number.isFinite(entry.value) ||
          entry.value === 0
      ) ||
      monster.specialResistances.some(
        (entry) =>
          !isRecord(entry) || !isName(entry.code) || !isName(entry.label) || !isDecimal(entry.value)
      )
    ) {
      throw new Error(`Monster ${monster.monsterId} has invalid weaknesses or resistances`);
    }
    monsterIds.add(monster.monsterId);
    referencedStats.add(monster.statsRef);
    const bindings = new Set<string>();
    for (const binding of monster.skills) {
      if (
        !isRecord(binding) ||
        !isId(binding.id) ||
        !definitions.has(binding.id) ||
        bindings.has(binding.id)
      )
        throw new Error(`Monster ${monster.monsterId} has an invalid skill binding`);
      bindings.add(binding.id);
      referencedSkills.add(binding.id);
    }
    let lastPhase = 0;
    const phaseSkills = new Set();
    for (const phase of monster.skillPhases) {
      if (
        !isRecord(phase) ||
        typeof phase.index !== 'number' ||
        !Number.isSafeInteger(phase.index) ||
        phase.index <= lastPhase ||
        !Array.isArray(phase.skillIds) ||
        !unique(phase.skillIds) ||
        !phase.skillIds.every((skillId) => bindings.has(skillId))
      )
        throw new Error(`Monster ${monster.monsterId} has an invalid phase reference`);
      lastPhase = phase.index;
      for (const skillId of phase.skillIds) phaseSkills.add(skillId);
    }
    if (phaseSkills.size !== bindings.size)
      throw new Error(`Monster ${monster.monsterId} has an unassigned skill`);
  }
  if (
    !isId(value.defaultMonsterId) ||
    !monsterIds.has(value.defaultMonsterId) ||
    !unique(definitionIds) ||
    referencedSkills.size !== definitions.size ||
    referencedStats.size !== stats.length ||
    !unique(stats.map((stat) => JSON.stringify(stat)))
  )
    throw new Error(`Enemy ${id} has an invalid default or shared inventory`);
}

export function assertEnemyConsumerClosure(details: Enemy[], catalog: EnemyCatalogEntry[]): void {
  const templates = new Map(details.map((enemy) => [enemy.template.monsterTemplateId, enemy]));
  const monsters = new Map<string, { owner: Enemy; variant: MonsterVariant }>();
  for (const owner of details) {
    for (const variant of owner.monsters) {
      if (monsters.has(variant.monsterId))
        throw new Error(`Duplicate Monster ${variant.monsterId}`);
      monsters.set(variant.monsterId, { owner, variant });
    }
  }
  if (
    !unique(details.map(({ template }) => template.monsterTemplateId)) ||
    !unique(catalog.map(({ id }) => id)) ||
    catalog.length !== templates.size
  ) {
    throw new Error('Enemy catalog and detail inventories differ');
  }
  for (const entry of catalog) {
    const detail = templates.get(entry.id);
    const representative = monsters.get(detail?.defaultMonsterId ?? '')?.variant;
    if (
      !detail ||
      !representative ||
      entry.name !== detail.template.name ||
      entry.type !== detail.template.rank ||
      'description' in entry ||
      entry.representative?.monsterId !== representative.monsterId ||
      JSON.stringify(entry.representative.weaknesses) !==
        JSON.stringify(representative.weaknesses) ||
      JSON.stringify(entry.variants) !==
        JSON.stringify(detail.monsters.map(({ monsterId, name }) => ({ monsterId, name })))
    ) {
      throw new Error(`Enemy catalog ${entry.id} does not match its Template and Monsters`);
    }
  }
  for (const { variant } of monsters.values()) {
    const seen = new Set<string>();
    for (const summon of variant.summons) {
      const target = monsters.get(summon.monsterId);
      if (
        !target ||
        seen.has(summon.monsterId) ||
        summon.monsterTemplateId !== target.owner.template.monsterTemplateId ||
        summon.href !== enemyDetailHref(summon.monsterTemplateId, summon.monsterId) ||
        summon.name !== target.variant.name ||
        summon.rank !== target.owner.template.rank ||
        JSON.stringify(summon.weaknesses) !== JSON.stringify(target.variant.weaknesses)
      ) {
        throw new Error(
          `Monster ${variant.monsterId} has an invalid summon reference ${summon.monsterId}`
        );
      }
      seen.add(summon.monsterId);
    }
  }
}
