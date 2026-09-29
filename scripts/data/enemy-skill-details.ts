import { access } from 'node:fs/promises';
import path from 'node:path';
import type { EnemySkillDetailDomain } from '../../src/lib/domain/neutral.js';
import type { DecimalString } from '../../src/lib/domain/endgame.js';
import { readRaw } from './raw.js';
import { effectiveSkillParams } from './enemy-skill-params.js';
import { parseEnemySkillDetail } from './enemy-skill-semantics.js';

type Raw = Record<string, any>;

function abilityPaths(configPath: string): string[] {
  const matchingSuffix = configPath
    .replace('Config/ConfigCharacter/Monster/', 'Config/ConfigAbility/Monster/')
    .replace('_Config', '_Ability');
  const shared = configPath
    .replace('Config/ConfigCharacter/Monster/', 'Config/ConfigAbility/Monster/')
    .replace(/_Config(?:_[^/]*)?\.json$/, '_Ability.json');
  return [...new Set([matchingSuffix, shared])];
}

async function exists(root: string, relative: string): Promise<boolean> {
  return access(path.join(root, relative)).then(
    () => true,
    () => false
  );
}

function candidateSummons(monster: Raw, character: Raw, validIds: ReadonlySet<string>): string[] {
  const values = new Map<string, string>();
  for (const [key, value] of Object.entries(character.CustomValues ?? {}))
    if (/^SummonID\d*$/.test(key)) values.set(key, String(value));
  for (const row of Array.isArray(monster.CustomValues) ? monster.CustomValues : [])
    if (/^SummonID\d*$/.test(String(row.BFLIFKBEOPJ ?? '')))
      values.set(String(row.BFLIFKBEOPJ), String(row.MNDFOPKBHKP));
  const permitted = new Set(
    (Array.isArray(monster.SummonIDList) ? monster.SummonIDList : []).map(String)
  );
  return [...new Set([...values.values()])].filter((id) => permitted.has(id) && validIds.has(id));
}

/** Build-only facts, keyed first by concrete Monster ID and then by skill ID. */
export async function buildEnemySkillDetails(
  root: string,
  tables: Record<string, Raw[]>
): Promise<Map<string, Map<string, EnemySkillDetailDomain>>> {
  const templates = tables.MonsterTemplateConfig ?? [];
  const monsters = tables.MonsterConfig ?? [];
  const skills = new Map(
    (tables.MonsterSkillConfig ?? []).map((row) => [String(row.SkillID), row])
  );
  const monsterIds = new Set(monsters.map((row) => String(row.MonsterID)));
  const statusesByModifier = new Map<string, { id: string; kind: 'Buff' | 'Debuff' | 'Other' }>();
  const duplicateModifiers = new Set<string>();
  for (const row of tables.MonsterStatusConfig ?? []) {
    const name = String(row.ModifierName ?? '');
    const kind = row.StatusType;
    if (!name || !['Buff', 'Debuff', 'Other'].includes(kind)) continue;
    if (statusesByModifier.has(name)) duplicateModifiers.add(name);
    else statusesByModifier.set(name, { id: String(row.StatusID), kind });
  }
  for (const name of duplicateModifiers) statusesByModifier.delete(name);
  const monstersByTemplate = new Map<string, Raw[]>();
  for (const monster of monsters) {
    const key = String(monster.MonsterTemplateID);
    monstersByTemplate.set(key, [...(monstersByTemplate.get(key) ?? []), monster]);
  }
  const configCache = new Map<string, Promise<Raw>>();
  const load = (relative: string) => {
    if (!configCache.has(relative)) configCache.set(relative, readRaw<Raw>(root, relative));
    return configCache.get(relative)!;
  };
  const result = new Map<string, Map<string, EnemySkillDetailDomain>>();
  for (const template of templates) {
    const configPath = template.JsonConfig;
    if (typeof configPath !== 'string' || !configPath.startsWith('Config/ConfigCharacter/Monster/'))
      continue;
    if (!(await exists(root, configPath))) continue;
    const character = await load(configPath);
    const referenced = new Set([
      ...(Array.isArray(character.SkillAbilityList) ? character.SkillAbilityList : []).flatMap(
        (row: Raw) => (Array.isArray(row.AbilityList) ? row.AbilityList : [])
      ),
      ...(Array.isArray(character.SkillList) ? character.SkillList : [])
        .map((row: Raw) => row.EntryAbility)
        .filter((name: unknown): name is string => typeof name === 'string')
    ]);
    const abilityFiles: Raw[] = [];
    for (const candidate of abilityPaths(configPath)) {
      if (!(await exists(root, candidate))) continue;
      const file = await load(candidate);
      if ((file.AbilityList ?? []).some((row: Raw) => referenced.has(row.Name)))
        abilityFiles.push(file);
    }
    if (!abilityFiles.length) continue;
    const abilitiesByName = new Map<string, Raw>();
    for (const file of abilityFiles)
      for (const row of Array.isArray(file.AbilityList) ? file.AbilityList : [])
        if (!abilitiesByName.has(row.Name)) abilitiesByName.set(row.Name, row);
    const ability: Raw = {
      AbilityList: [...abilitiesByName.values()],
      GlobalModifiers: Object.assign({}, ...abilityFiles.map((file) => file.GlobalModifiers ?? {}))
    };
    for (const monster of monstersByTemplate.get(String(template.MonsterTemplateID)) ?? []) {
      const monsterId = String(monster.MonsterID);
      const skillRows = (Array.isArray(monster.SkillList) ? monster.SkillList : [])
        .map((id: unknown) => skills.get(String(id)))
        .filter((row: Raw | undefined): row is Raw => !!row);
      const params = new Map<string, readonly (DecimalString | undefined)[]>();
      for (const row of skillRows) {
        const trigger = String(row.SkillTriggerKey ?? '');
        if (!trigger) continue;
        const values = effectiveSkillParams(row, monster);
        const previous = params.get(trigger);
        params.set(
          trigger,
          previous && JSON.stringify(previous) !== JSON.stringify(values)
            ? []
            : (previous ?? values)
        );
      }
      const details = new Map<string, EnemySkillDetailDomain>();
      for (const row of skillRows) {
        const skillId = String(row.SkillID);
        const triggerKey = String(row.SkillTriggerKey ?? '');
        if (!triggerKey) continue;
        const detail = parseEnemySkillDetail({
          monsterId,
          skillId,
          triggerKey,
          params,
          character,
          ability,
          statusesByModifier,
          summonIds: candidateSummons(monster, character, monsterIds)
        });
        if (detail) details.set(skillId, detail);
      }
      if (details.size) result.set(monsterId, details);
    }
  }
  return result;
}
