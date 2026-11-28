import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type {
  EliteGroupTable,
  EnemyHpBaseFactors,
  EnemyStatUnavailableReason,
  EnemyToughnessStat,
  ResolvedEnemyStat,
  SummonedEnemyOccurrence,
  SummonEliteCandidate,
  SummonStatUnresolvedReason
} from '../../src/lib/domain/endgame.js';
import { decimalEquals } from './decimal.js';
import { effectiveSkillParams, resolveSkillValue } from './enemy-skill-params.js';
import { readRaw } from './raw.js';

type Raw = Record<string, any>;
type Evidence = { file: string; name: string; pointer?: string };
type SharedGroup = Evidence & {
  members: number[];
  possible: number[];
  ownerMember: boolean;
  selector: string;
};
type Stat = 'hp' | 'speed' | 'toughness';
type Warning = (code: string, targetId?: number) => void;
type Task = Evidence & {
  targetId?: number;
  hash?: string;
  eliteOverride?: number | 'dynamic';
  inherited: Stat[];
  unknownCreation: boolean;
  creationChanges?: Stat[];
};
export interface SummonTaskEvidence {
  tasks: Task[];
  sharedGroups?: SharedGroup[];
  reproduction?: Evidence;
  missingGuard?: boolean;
  unboundAbilities?: string[];
  bodyPartsWithoutEliteInheritance?: number[];
}

const broodSkillIds = new Map([
  [8022010, 802201002],
  [8022012, 802201202]
]);
// The current pin does not carry a complete static binding for these selectors.
const sharedGuards = new Map([
  [
    3004012,
    {
      name: 'MMonster_W3_DollElite_Boss_Initiate',
      selector: 'ParamEntityList',
      targets: [3003031, 3003041, 3003051],
      confirmed: true
    }
  ],
  [
    4014020,
    {
      name: 'Monster_W4_Hearse_00_Passive',
      selector: 'Monster_W4_Nikadory_00_Self',
      targets: [4014012],
      confirmed: false
    }
  ]
]);
const broodAbility = 'Monster_SW_Minion01_00_Skill02_Phase02';
const stats = ['hp', 'speed', 'toughness'] as const;
const monsterAbilityDirectory = 'Config/ConfigAbility/Monster';

/** The ability runtime uses this signed hash for dynamic keys, separate from TextMap. */
export function summonConfigKeyHash(key: string): string {
  let even = 5381;
  let odd = 5381;
  for (let index = 0; index < key.length; index += 2) {
    even = Math.imul(even, 33) ^ key.charCodeAt(index);
    if (index + 1 < key.length) odd = Math.imul(odd, 33) ^ key.charCodeAt(index + 1);
  }
  return String((even + Math.imul(odd, 1566083941)) | 0);
}

function customValues(character: Raw, monster: Raw) {
  const values = new Map<string, unknown>(Object.entries(character.CustomValues ?? {}));
  const overrides = new Set<string>();
  for (const row of monster.CustomValues ?? []) {
    const key = row.BFLIFKBEOPJ;
    if (typeof key !== 'string') continue;
    values.set(key, overrides.has(key) ? undefined : row.MNDFOPKBHKP);
    overrides.add(key);
  }
  const keys = new Map<string, string | undefined>();
  for (const key of values.keys()) {
    const hash = summonConfigKeyHash(key);
    keys.set(hash, keys.has(hash) ? undefined : key);
  }
  return {
    byName: (key: string) => unwrap(values.get(key)),
    byHash: (hash: string) => unwrap(values.get(keys.get(hash) ?? ''))
  };
}

type Frame = { node: Raw; pointer: string; parents: Frame[]; earlier: Raw[] };
type Template = { body: Raw; pointer: string };

function* taskFrames(value: unknown, pointer = '', parents: Frame[] = []): Generator<Frame> {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      if (!child || typeof child !== 'object' || Array.isArray(child)) continue;
      const frame: Frame = {
        node: child,
        pointer: `${pointer}/${index}`,
        parents,
        earlier: value.slice(0, index)
      };
      yield frame;
      yield* taskFrames(child, frame.pointer, [...parents, frame]);
    }
    return;
  }
  for (const [key, child] of Object.entries(value))
    yield* taskFrames(
      child,
      `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`,
      parents
    );
}

function taskKind(node: Raw | undefined | null) {
  return typeof node?.$type === 'string' ? node.$type.replace(/^RPG\.GameCore\./, '') : '';
}

function directHash(value: Raw | undefined) {
  const expr = value?.PostfixExpr;
  if (
    value?.IsDynamic === true &&
    expr?.OpCodes === 'AQAR' &&
    expr.DynamicHashes?.length === 1 &&
    !expr.FixedValues?.length
  )
    return String(expr.DynamicHashes[0]);
}

function creationEffects(create: unknown) {
  const changed = new Set<Stat>();
  if (create == null) return { changed: [], unknown: false };
  if (!Array.isArray(create)) return { changed: [], unknown: true };
  let unknown = false;
  for (const node of create) {
    switch (taskKind(node)) {
      case 'TriggerEffect':
      case 'TriggerAnimState':
      case 'SetTargetUniqueName':
      case 'MakeCharacterHUDVisible':
      case 'SetActionDelay':
      case 'StanceDamage':
      case 'SetHP':
        break;
      case 'SetMaxHP':
      case 'ModifyMaxHP':
        changed.add('hp');
        break;
      case 'SetSpeed':
      case 'ModifySpeed':
        changed.add('speed');
        break;
      case 'SetStance':
      case 'SetResilience':
        changed.add('toughness');
        break;
      default:
        unknown = true;
    }
  }
  return { changed: [...changed], unknown };
}

function* objects(value: unknown): Generator<Raw> {
  if (!value || typeof value !== 'object') return;
  if (!Array.isArray(value)) yield value as Raw;
  for (const child of Object.values(value)) yield* objects(child);
}

const unwrap = (value: any) => value?.Value ?? value;
function id(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return;
  const number = Number(value);
  if (Number.isSafeInteger(number) && number > 0) return number;
}

function constant(value: any) {
  if (value?.IsDynamic === false) return id(unwrap(value.FixedValue));
  const expression = value?.PostfixExpr;
  if (
    expression?.OpCodes === 'AAAR' &&
    expression.DynamicHashes?.length === 0 &&
    expression.FixedValues?.length === 1
  )
    return id(unwrap(expression.FixedValues[0]));
  return id(unwrap(value));
}

function inheritedStats(properties: unknown): Stat[] {
  if (!Array.isArray(properties)) return [];
  return stats.filter((stat) =>
    properties.some((property) => {
      if (typeof property !== 'string') return false;
      if (stat === 'hp')
        return /^(CurrentHP|MaxHP|BaseHP|HPAddedRatio|MaxHPAddRatio)$/i.test(property);
      if (stat === 'speed') return /speed/i.test(property);
      return /stance|toughness/i.test(property);
    })
  );
}

/** Follow concrete ability bindings and named modifier or task-list references. */
export function createSummonTaskResolver(
  root: string,
  skillRows: readonly Raw[],
  battleEventRows: ReadonlyArray<{ BattleEventID: number; AbilityList?: string[] }> = []
) {
  const events = new Map(battleEventRows.map((row) => [row.BattleEventID, row.AbilityList ?? []]));
  const skills = new Map(skillRows.map((skill) => [skill.SkillID, skill]));
  const files = new Map<string, Promise<Raw | undefined>>();
  const byMonster = new Map<string, Promise<SummonTaskEvidence>>();
  let abilityFiles: Promise<string[]> | undefined;

  function familyAbilityFiles(characterPath: string) {
    const character = path.posix.basename(characterPath);
    const family = character.match(/^(.+?)_\d{2}(?:_|\.)/)?.[1];
    if (!family) return Promise.resolve([]);
    abilityFiles ??= readdir(path.join(root, monsterAbilityDirectory)).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    return abilityFiles.then((files) =>
      files
        .filter((file) => file.startsWith(`${family}_`) && /_Ability(?:_[^.]*)?\.json$/.test(file))
        .sort()
        .map((file) => `${monsterAbilityDirectory}/${file}`)
    );
  }
  function load(file: string) {
    if (!files.has(file))
      files.set(
        file,
        readRaw<Raw>(root, file).catch((error) => {
          if (error.cause?.code === 'ENOENT') return undefined;
          throw error;
        })
      );
    return files.get(file)!;
  }

  async function inspect(
    monster: Raw,
    characterPath: string | undefined
  ): Promise<SummonTaskEvidence> {
    const tasks: Task[] = [];
    if (!characterPath?.startsWith('Config/ConfigCharacter/Monster/'))
      return { tasks, unboundAbilities: ['CharacterConfig'] };
    const character = await load(characterPath);
    if (!character) return { tasks, unboundAbilities: [characterPath] };
    const values = customValues(character, monster);
    const declared: number[] = monster.SummonIDList ?? [];
    const ownerId = Number(monster.MonsterID);
    const abilityPath = characterPath.replace('/ConfigCharacter/', '/ConfigAbility/');
    const paths = [
      ...new Set([
        abilityPath.replace('_Config', '_Ability'),
        abilityPath.replace(/_Config(?:_[^/]*)?\.json$/, '_Ability.json'),
        'Config/ConfigAbility/Monster/Monster_Common_Ability.json'
      ])
    ];
    type Ability = Evidence & {
      body: Raw;
      globals: Raw;
      aliases: Raw;
      templates: Map<string, Template>;
    };
    const abilities = new Map<string, Ability>();
    const alternatives = new Map<string, Ability | null>();
    async function indexAbilities(file: string, primary: boolean) {
      const config = await load(file);
      const templates = new Map<string, Template>(
        (config?.GlobalTemplates ?? []).map((body: Raw, index: number) => [
          body.Name,
          { body, pointer: `/GlobalTemplates/${index}` }
        ])
      );
      for (const [index, body] of (config?.AbilityList ?? []).entries()) {
        if (abilities.has(body.Name)) continue;
        const ability = {
          file,
          name: body.Name,
          body,
          globals: config?.GlobalModifiers ?? {},
          aliases: config?.GlobalTargetAlias ?? {},
          pointer: `/AbilityList/${index}`,
          templates
        };
        if (primary) abilities.set(body.Name, ability);
        else alternatives.set(body.Name, alternatives.has(body.Name) ? null : ability);
      }
    }
    for (const file of paths) await indexAbilities(file, true);
    for (const file of await familyAbilityFiles(characterPath))
      if (!paths.includes(file)) await indexAbilities(file, false);

    const params = new Map<string, ReturnType<typeof effectiveSkillParams>>();
    for (const skillId of monster.SkillList ?? []) {
      const skill = skills.get(skillId);
      if (!skill?.SkillTriggerKey) continue;
      const values = effectiveSkillParams(skill, monster);
      const previous = params.get(skill.SkillTriggerKey);
      params.set(
        skill.SkillTriggerKey,
        previous && JSON.stringify(previous) !== JSON.stringify(values) ? [] : values
      );
    }
    const names = new Set<string>([
      ...(character.AbilityList ?? []),
      ...(monster.AbilityNameList ?? [])
    ]);
    for (const binding of character.SkillAbilityList ?? []) {
      if (params.has(binding.Skill)) for (const name of binding.AbilityList ?? []) names.add(name);
    }
    for (const binding of character.SkillList ?? []) {
      if (params.has(binding.Name) || binding.UseType === 'Passive')
        names.add(binding.EntryAbility);
    }
    for (const row of objects(character.PhaseList)) {
      const name = unwrap(row.AbilityName ?? row.EntryAbility);
      if (typeof name === 'string') names.add(name);
      if (Array.isArray(row.AbilityList))
        for (const entry of row.AbilityList) if (typeof entry === 'string') names.add(entry);
    }

    const sharedGroups: SharedGroup[] = [];
    const sharedGuard = sharedGuards.get(ownerId);
    let guardMatched = false;
    let reproduction: Evidence | undefined;
    const unboundAbilities = new Set<string>();
    const active = new Set<Raw>();
    const initialFloats = character.DynamicValues?.Floats ?? {};
    type LevelValues = ReadonlyMap<string, string | number | undefined>;

    function readValue(value: Raw, floats: Raw, level: LevelValues, allowCustom = true) {
      const fixed =
        constant(value) ?? (allowCustom ? id(resolveSkillValue(value, params, floats)) : undefined);
      if (fixed !== undefined) return fixed;
      const hash = directHash(value);
      if (!hash) return undefined;
      const binding = floats[hash]?.ReadInfo;
      if (binding?.Type === 'CustomValue' && typeof binding.TriggerKey === 'string' && allowCustom)
        return id(values.byName(binding.TriggerKey));
      if (binding && binding.Type !== 'None') return undefined;
      if (level.has(hash)) return id(level.get(hash));
      return allowCustom ? id(values.byHash(hash)) : undefined;
    }

    function targetFor(data: Raw, floats: Raw, level: LevelValues, casterIsOwner: boolean) {
      const custom = data.MonsterIDFromCustomValue;
      const key = typeof custom === 'string' ? custom : custom?.Name;
      if (custom !== undefined) {
        if (!casterIsOwner) return undefined;
        return id(
          typeof key === 'string' ? values.byName(key) : values.byHash(String(custom.Hash))
        );
      }
      return readValue(data.MonsterID, floats, level, casterIsOwner);
    }

    function levelForEvent(earlier: Raw[], floats: Raw, inherited: LevelValues) {
      const level = new Map(inherited);
      for (const step of earlier) {
        const condition = step?.Predicate;
        if (
          taskKind(step) !== 'PredicateTaskList' ||
          taskKind(condition ?? {}) !== 'ByCompareDynamicValue' ||
          condition.TargetType?.Alias !== 'LevelEntity' ||
          condition.ContextScope !== 'TargetEntity' ||
          condition.CompareType !== 'Equal' ||
          condition.CompareValue?.IsDynamic !== false ||
          !/^0(?:\.0+)?$/.test(String(unwrap(condition.CompareValue?.FixedValue)))
        )
          continue;
        const key = unwrap(condition.DynamicKey);
        if (typeof key !== 'string') continue;
        const assignment = step.SuccessTaskList?.find(
          (node: Raw) =>
            taskKind(node) === 'DefineDynamicValue' &&
            node.TargetType?.Alias === 'LevelEntity' &&
            node.ContextScope === 'TargetEntity' &&
            unwrap(node.DynamicKey) === key
        );
        if (!assignment) continue;
        const value = readValue(assignment.ResetValue, floats, level);
        const hash = summonConfigKeyHash(key);
        level.set(hash, level.has(hash) && level.get(hash) !== value ? undefined : value);
      }
      return level;
    }

    function scan(
      scope: Ability,
      floats: Raw,
      inheritedLevel: LevelValues,
      casterIsOwner: boolean,
      modifierOwnerIsOwner = false,
      conditional = false
    ) {
      const { body, file, name } = scope;
      if (active.has(body)) return;
      active.add(body);
      const bindings = { ...floats, ...body.DynamicValues?.Floats };
      const { Modifiers, TaskListTemplate, ...logic } = body;
      const templates = new Map(scope.templates);
      for (const [index, body] of (TaskListTemplate ?? []).entries())
        templates.set(body.Name, { body, pointer: `${scope.pointer}/TaskListTemplate/${index}` });
      for (const { node, pointer, parents, earlier } of taskFrames(logic, scope.pointer)) {
        const fromBranch =
          conditional ||
          parents.some(({ node }) =>
            ['PredicateTaskList', 'RandomConfig'].includes(taskKind(node))
          );
        const kind = taskKind(node);
        const provenance = { file, name, pointer };
        if (kind === 'SummonMonster') {
          for (const [index, data] of (node.SummonMonsterDataList ?? []).entries()) {
            const hash = data.MonsterIDFromCustomValue?.Hash ?? directHash(data.MonsterID);
            const targetId = targetFor(data, bindings, inheritedLevel, casterIsOwner);
            // The self-copy read has no static binding in either of these concrete variants.
            if (
              name === broodAbility &&
              hash === '1509106746' &&
              monster.SkillList?.includes(broodSkillIds.get(ownerId)) &&
              declared.includes(ownerId)
            )
              reproduction = provenance;
            const override = data.OverrideEliteGroup ?? node.OverrideEliteGroup;
            const creation = creationEffects(data.OnMonsterCreate ?? node.OnMonsterCreate);
            tasks.push({
              ...provenance,
              pointer: `${pointer}/SummonMonsterDataList/${index}`,
              targetId,
              ...(hash !== undefined ? { hash: String(hash) } : {}),
              eliteOverride:
                override === undefined
                  ? undefined
                  : (readValue(override, bindings, inheritedLevel, casterIsOwner) ?? 'dynamic'),
              inherited: inheritedStats(data.InheritPropertyList ?? node.InheritPropertyList),
              unknownCreation: creation.unknown,
              creationChanges: creation.changed
            });
          }
        }
        if (kind === 'DefineHPSharedGroup') {
          const selector = node.SubTargets?.Alias ?? node.SubTargets?.$type ?? 'unknown';
          const main = node.MainTarget?.Alias;
          const ownerMember =
            main === 'Caster'
              ? casterIsOwner
              : main === 'ModifierOwnerEntity' && modifierOwnerIsOwner;
          const retarget = parents.findLast(({ node }) => taskKind(node) === 'RetargetList')?.node;
          const localSummons = earlier.filter((step) => taskKind(step) === 'SummonMonster');
          const targetIds = localSummons.flatMap((step) =>
            (step.SummonMonsterDataList ?? []).map((data: Raw) =>
              targetFor(data, bindings, inheritedLevel, casterIsOwner)
            )
          );
          const exact = (
            target: Raw | undefined,
            seen = new Set<string>()
          ): number[] | undefined => {
            if (!target) return undefined;
            const alias = target.Alias;
            if (
              (alias === 'Caster' && casterIsOwner) ||
              (alias === 'ModifierOwnerEntity' && modifierOwnerIsOwner)
            )
              return [ownerId];
            if (
              alias === 'CasterSummonedMinions' &&
              casterIsOwner &&
              targetIds.length &&
              targetIds.every((value: number | undefined) => value !== undefined)
            )
              return [...new Set(targetIds)] as number[];
            if (
              alias === 'LastSummonMonsters' &&
              localSummons.length &&
              localSummons.at(-1)?.SummonMonsterDataList?.length === 1 &&
              targetIds.at(-1)
            )
              return [targetIds.at(-1)!];
            if (typeof alias === 'string' && scope.aliases[alias] && !seen.has(alias))
              return exact(scope.aliases[alias], new Set([...seen, alias]));
            if (
              taskKind(target) === 'TargetSequence' &&
              target.Sequence?.[0]?.Alias === 'AllDarkTeam' &&
              target.Sequence.length === 2 &&
              taskKind(target.Sequence[1]) === 'TargetFilter'
            ) {
              const filter = target.Sequence[1].Predicate;
              const compare = taskKind(filter ?? {});
              if (
                compare !== 'ByCompareMonsterID' ||
                filter.Inverse ||
                (filter.CompareType && filter.CompareType !== 'Equal')
              )
                return undefined;
              const member = constant(filter.TargetMonsterID);
              if (member !== undefined) return [member];
            }
          };
          const members =
            selector === 'ParamEntityList' && retarget && !retarget.Predicate
              ? exact(retarget.TargetType)
              : exact(node.SubTargets);
          const mainIds = exact(node.MainTarget);
          const bounded = mainIds && members && new Set([...mainIds, ...members]).size > 1;
          if (bounded && !fromBranch) {
            const pool = [...new Set([...mainIds, ...members])];
            const confirmed = pool.filter((member) => declared.includes(member));
            sharedGroups.push({
              ...provenance,
              members: confirmed,
              possible: [],
              ownerMember: pool.includes(ownerId),
              selector
            });
          } else {
            const guarded = sharedGuard?.name === name && sharedGuard.selector === selector;
            const broad = [
              'ParamEntityList',
              'CasterSummonedMinions',
              'AllDarkTeam - ModifierOwnerEntity'
            ].includes(selector);
            if (guarded) guardMatched = true;
            const fallback =
              guarded &&
              sharedGuard.confirmed &&
              ownerMember &&
              sharedGuard.targets.every((member) => declared.includes(member)) &&
              new Set(
                tasks
                  .filter((task) => task.name === name && task.file === file)
                  .map((task) => task.pointer)
              ).size >= sharedGuard.targets.length;
            sharedGroups.push({
              ...provenance,
              members: fallback ? sharedGuard.targets : [],
              possible: fallback
                ? []
                : guarded
                  ? sharedGuard.targets
                  : (members ?? (broad ? declared : [])),
              ownerMember,
              selector
            });
          }
        }

        function follow(name: unknown, level = inheritedLevel, owner = casterIsOwner) {
          if (typeof name !== 'string') return;
          const match = abilities.get(name) ?? alternatives.get(name);
          if (match) scan(match, initialFloats, level, owner, false, fromBranch);
          else if (!/Camera/i.test(name)) unboundAbilities.add(name);
        }
        const modifierName = unwrap(node.ModifierName);
        if (kind.startsWith('AddModifier') && typeof modifierName === 'string') {
          const modifier = Modifiers?.[modifierName] ?? scope.globals[modifierName];
          if (modifier)
            scan(
              {
                ...scope,
                body: modifier,
                name: modifierName,
                templates,
                pointer: Modifiers?.[modifierName]
                  ? `${scope.pointer}/Modifiers/${modifierName}`
                  : `/GlobalModifiers/${modifierName}`
              },
              bindings,
              inheritedLevel,
              casterIsOwner,
              (casterIsOwner && node.TargetType?.Alias === 'Caster') ||
                (modifierOwnerIsOwner && node.TargetType?.Alias === 'ModifierOwnerEntity'),
              fromBranch
            );
        }
        if (kind === 'IncludeTaskListTemplate') {
          const templateName = unwrap(node.Name ?? node.TemplateName);
          const template = templates.get(templateName);
          if (template)
            scan(
              {
                ...scope,
                body: template.body,
                name: templateName,
                templates,
                pointer: template.pointer
              },
              { ...bindings, ...node.DynamicValues?.Floats },
              inheritedLevel,
              casterIsOwner,
              modifierOwnerIsOwner,
              fromBranch
            );
          else if (typeof templateName === 'string') unboundAbilities.add(templateName);
        }
        if (kind === 'CreateBattleEvent') {
          const eventId = readValue(node.EventID, bindings, inheritedLevel, casterIsOwner);
          const event = eventId === undefined ? undefined : events.get(eventId);
          if (event) {
            const level = levelForEvent(
              [...parents.flatMap((parent) => parent.earlier), ...earlier],
              bindings,
              inheritedLevel
            );
            for (const ability of event) follow(ability, level, false);
          } else if (eventId !== undefined) unboundAbilities.add(`BattleEventConfig#${eventId}`);
        }
        if (kind === 'AddStageAbilityByName') follow(unwrap(node.StageAbilityName));
        else if (kind.includes('Ability') && !/^(By|Remove|Preload)/.test(kind))
          follow(unwrap(node.AbilityName));
      }
      active.delete(body);
    }

    for (const name of names) {
      const match = abilities.get(name) ?? alternatives.get(name);
      if (match) scan(match, initialFloats, new Map(), true);
      else if (typeof name === 'string' && !/Camera/i.test(name)) unboundAbilities.add(name);
    }
    return {
      tasks,
      sharedGroups,
      reproduction,
      missingGuard:
        (!!sharedGuard && !guardMatched) || (broodSkillIds.has(ownerId) && !reproduction),
      unboundAbilities: [...unboundAbilities],
      ...(character.MonsterConfig?.InheritEliteGroupForBodyPart === false
        ? {
            bodyPartsWithoutEliteInheritance: Object.keys(
              Object.fromEntries(
                (monster.CustomValues ?? []).map((row: Raw) => [row.BFLIFKBEOPJ, row.MNDFOPKBHKP])
              )
            )
              .filter((key) => /^PartEntity\d+_MonsterID$/.test(key))
              .map((key) => id(values.byName(key)))
              .filter(
                (member): member is number => member !== undefined && declared.includes(member)
              )
          }
        : {})
    };
  }

  return (monster: Raw, characterPath?: string) => {
    const key = String(monster.MonsterID);
    if (!byMonster.has(key)) byMonster.set(key, inspect(monster, characterPath));
    return byMonster.get(key)!;
  };
}

export function directSummonIds(
  raw: readonly number[],
  owner: number,
  evidence: SummonTaskEvidence,
  exists: (target: number) => boolean,
  warn: Warning
) {
  return [...new Set(raw)].filter((target) => {
    if (!id(target) || !exists(target)) {
      warn('invalid-summon-target', target);
      return false;
    }
    if (
      target === owner &&
      !evidence.reproduction &&
      !evidence.tasks.some((task) => task.targetId === target)
    ) {
      warn('unverified-summon-self-reference', target);
      return false;
    }
    return true;
  });
}

export function resolveSummonContext(
  owner: number,
  target: number,
  effectiveElite: { id: number; table: EliteGroupTable },
  evidence: SummonTaskEvidence,
  tablesFor: (id: number) => readonly EliteGroupTable[]
) {
  const relevant = evidence.tasks.filter(
    (task) => task.targetId === target || task.targetId === undefined
  );
  const unresolved = new Map<Stat, SummonStatUnresolvedReason>();
  const sources = new Map<string, Evidence>();
  const remember = ({ file, name }: Evidence) => sources.set(`${file}:${name}`, { file, name });
  const groups = new Map<string, SummonEliteCandidate>();
  const addGroup = (candidate: SummonEliteCandidate) => {
    const key = `${candidate.table}:${candidate.id}`;
    if (!groups.has(key)) groups.set(key, candidate);
  };
  const contextDiagnostics = new Set<string>();
  let unknownElite: SummonStatUnresolvedReason | undefined;
  const useDefault = () => addGroup({ ...effectiveElite, source: 'summoner-occurrence' });
  if (!relevant.length) useDefault();
  for (const task of relevant) {
    remember(task);
    for (const stat of task.inherited) unresolved.set(stat, 'runtime-inheritance');
    for (const stat of task.unknownCreation ? stats : (task.creationChanges ?? []))
      if (!unresolved.has(stat))
        unresolved.set(
          stat,
          task.unknownCreation ? 'unbound-creation-task' : 'dynamic-summon-task'
        );
    if (
      task.eliteOverride === 'dynamic' ||
      (task.eliteOverride !== undefined && task.targetId === undefined)
    ) {
      unknownElite = 'dynamic-summon-task';
      contextDiagnostics.add('summon-elite-override-unbound');
    } else if (task.eliteOverride !== undefined) {
      const tables = tablesFor(task.eliteOverride);
      if (tables.length > 1) contextDiagnostics.add('summon-elite-table-ambiguous');
      if (!tables.length) {
        unknownElite = 'missing-elite-group';
        contextDiagnostics.add('summon-elite-table-missing');
      }
      for (const table of tables.length ? tables : [null])
        addGroup({ id: task.eliteOverride, table, source: 'task-override' });
    } else useDefault();
  }
  if (unknownElite)
    for (const stat of stats) if (!unresolved.has(stat)) unresolved.set(stat, unknownElite);
  if (!relevant.length && !(target === owner && evidence.reproduction))
    for (const stat of stats)
      if (!unresolved.has(stat)) unresolved.set(stat, 'unbound-summon-task');
  if (evidence.bodyPartsWithoutEliteInheritance?.includes(target)) {
    contextDiagnostics.add('summon-body-part-elite-inheritance-disabled');
    if (
      !relevant.some((task) => task.targetId === target && typeof task.eliteOverride === 'number')
    )
      for (const stat of stats)
        if (!unresolved.has(stat)) unresolved.set(stat, 'unbound-summon-task');
  }
  const sharedGuard = sharedGuards.get(owner);
  const sharedGroups = (evidence.sharedGroups ?? []).filter(
    (group) => group.members.includes(target) || group.possible.includes(target)
  );
  const shared = sharedGroups.some((group) => group.members.includes(target));
  if (
    !shared &&
    (sharedGroups.length || (evidence.missingGuard && sharedGuard?.targets.includes(target))) &&
    !['runtime-inheritance', 'dynamic-summon-task', 'unbound-creation-task'].includes(
      unresolved.get('hp') ?? ''
    )
  )
    unresolved.set('hp', 'unresolved-shared-membership');
  for (const group of sharedGroups) remember(group);
  if (target === owner && evidence.reproduction) remember(evidence.reproduction);
  const selection: SummonedEnemyOccurrence['context']['eliteSelection'] = unknownElite
    ? 'unresolved'
    : groups.size > 1
      ? 'compare-candidates'
      : relevant.some((task) => task.eliteOverride !== undefined)
        ? 'task-override'
        : 'inherited';
  return {
    eliteCandidates: [...groups.values()],
    eliteSelection: selection,
    unresolved,
    shared,
    sharedGroups,
    legacyGuard:
      (target === owner &&
        !!evidence.reproduction &&
        !evidence.tasks.some((task) => task.targetId === owner)) ||
      (shared && sharedGuard?.confirmed === true && sharedGuard.targets.includes(target)),
    evidence: [...sources.values()],
    contextDiagnostics: [...contextDiagnostics]
  };
}

export interface SummonStatCandidate {
  hp?: EnemyHpBaseFactors;
  speed: ResolvedEnemyStat;
  toughness: EnemyToughnessStat;
}

export function selectSummonStats(
  policy: ReturnType<typeof resolveSummonContext>,
  candidates: Array<SummonStatCandidate | undefined>
) {
  const first = candidates[0];
  const available = first && candidates.every((candidate) => candidate !== undefined);
  const reason = (stat: Stat): EnemyStatUnavailableReason =>
    policy.unresolved.get(stat) ?? (available ? 'ambiguous-elite-context' : 'invalid-reference');
  const hp = first?.hp;
  const hpDecision: SummonedEnemyOccurrence['hp'] = policy.shared
    ? { status: 'shared' }
    : available &&
        hp &&
        !policy.unresolved.has('hp') &&
        candidates.every(
          (candidate) =>
            candidate?.hp &&
            decimalEquals(hp.baseEncounterMaxHpPerBar, candidate.hp.baseEncounterMaxHpPerBar)
        )
      ? { status: 'configured', factors: hp }
      : {
          status: 'unresolved',
          reason:
            available && !hp && !policy.unresolved.has('hp') ? 'invalid-reference' : reason('hp')
        };
  const speed = first?.speed;
  const speedSelection: ResolvedEnemyStat =
    available &&
    speed &&
    !policy.unresolved.has('speed') &&
    candidates.every((candidate) => {
      const value = candidate?.speed;
      if (!value || speed.status !== value.status) return false;
      return speed.status === 'resolved' && value.status === 'resolved'
        ? decimalEquals(speed.configuredValue, value.configuredValue)
        : speed.status === 'unavailable' &&
            value.status === 'unavailable' &&
            speed.reason === value.reason;
    })
      ? speed
      : { status: 'unavailable', reason: reason('speed') };
  const stance = first?.toughness.internalStance;
  const stanceReason = reason('toughness');
  const toughness: EnemyToughnessStat =
    available &&
    stance &&
    !policy.unresolved.has('toughness') &&
    candidates.every((candidate) => {
      const value = candidate?.toughness.internalStance;
      if (!value || stance.status !== value.status) return false;
      return stance.status === 'resolved' && value.status === 'resolved'
        ? decimalEquals(stance.resolvedInternal, value.resolvedInternal)
        : stance.status === 'unavailable' &&
            value.status === 'unavailable' &&
            stance.reason === value.reason;
    })
      ? first.toughness
      : {
          internalStance: { status: 'unavailable', reason: stanceReason },
          display: { status: 'unavailable', reason: stanceReason },
          runtimeStatus: 'runtime-unclear'
        };
  return { hp: hpDecision, speed: speedSelection, toughness };
}
