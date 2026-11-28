import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type {
  EliteContextSource,
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
type Evidence = { file: string; name: string };
type Stat = 'hp' | 'speed' | 'toughness';
type Warning = (code: string, targetId?: number) => void;
type Task = Evidence & {
  targetId?: number;
  hash?: string;
  eliteOverride?: number | 'dynamic';
  inherited: Stat[];
  unknownCreation: boolean;
};
export interface SummonTaskEvidence {
  tasks: Task[];
  sharedGroup?: Evidence;
  reproduction?: Evidence;
  missingGuard?: boolean;
  unboundAbilities?: string[];
}

const broodSkillIds = new Map([
  [8022010, 802201002],
  [8022012, 802201202]
]);
// Each rule ties concrete targets to a reachable shared-group operation and its selectors.
const sharedRules = new Map([
  [
    3004012,
    {
      name: 'MMonster_W3_DollElite_Boss_Initiate',
      main: 'ModifierOwnerEntity',
      members: 'ParamEntityList',
      targets: [3003031, 3003041, 3003051],
      confirmed: true
    }
  ],
  [
    4014030,
    {
      name: 'Monster_W4_Pollux_00_PassiveSkill_Initiate',
      main: 'Caster',
      members: 'CasterSummonedMinions',
      targets: [4012070, 4012071],
      confirmed: true
    }
  ],
  [
    3004020,
    {
      name: 'MMonster_W3_Theather_00_Initiate',
      main: 'ModifierOwnerEntity',
      members: 'ParamEntityList',
      targets: [3003013, 3002021, 3002011, 3002041],
      confirmed: false
    }
  ],
  [
    4014020,
    {
      name: 'Monster_W4_Hearse_00_Passive',
      main: 'ModifierOwnerEntity',
      members: 'Monster_W4_Nikadory_00_Self',
      targets: [4014012],
      confirmed: false
    }
  ],
  [
    5014010,
    {
      name: 'Monster_W5_Vtuber_00_PassiveSkillInitiate',
      main: 'Caster',
      members: 'CasterSummonedMinions',
      targets: [5012070, 5012080, 501203102, 501203103, 5014011],
      confirmed: false
    }
  ]
]);
for (const [owner, first, second] of [
  [401403601, 401207601, 401207701],
  [401403602, 401207602, 401207702],
  [401403603, 401207603, 401207703],
  [401403604, 401207604, 401207704]
])
  sharedRules.set(owner, {
    name: 'Monster_W4_Pollux_00_IF_SkillP01',
    main: 'Caster',
    members: 'CasterSummonedMinions',
    targets: [first, second],
    confirmed: true
  });

sharedRules.set(501401003, sharedRules.get(5014010)!);
for (const owner of [300402101, 300402102, 300402103, 300402104])
  sharedRules.set(owner, {
    ...sharedRules.get(3004020)!,
    targets: [3002022, 3002012, 3003015, 3002042]
  });
for (const [owner, targets] of [
  [501401401, [501207101, 501208101, 501203107, 501301003, 501401103]],
  [501401402, [501207102, 501208102, 501203108, 501301003, 501401104]],
  [501401403, [501207103, 501208103, 501203109, 501301003, 501401105]],
  [501401404, [501207104, 501208104, 501203110, 501301003, 501401106]]
] as const)
  sharedRules.set(owner, {
    name: 'Monster_W5_Vtuber_00_IF_SkillP01',
    main: 'Caster',
    members: 'CasterSummonedMinions',
    targets: [...targets],
    confirmed: false
  });

for (const [owner, targets] of [
  [406401201, [406201002, 406201007, 406202002, 406301003]],
  [406401202, [406201003, 406201008, 406202003, 406301004]],
  [406401203, [406201004, 406201009, 406202004, 406301005]],
  [406401204, [406201005, 406201010, 406202005, 406301006]]
] as const)
  sharedRules.set(owner, {
    name: 'MMonster_W4_Serpent_01_IF_SkillEX03_ShareHP',
    main: 'ModifierOwnerEntity',
    members: 'AllDarkTeam - ModifierOwnerEntity',
    targets: [...targets],
    confirmed: false
  });
const broodAbility = 'Monster_SW_Minion01_00_Skill02_Phase02';
const kuimuAbility = 'Monster_W2_Beast01_01_Skill02_Phase02';
const stats = ['hp', 'speed', 'toughness'] as const;
const monsterAbilityDirectory = 'Config/ConfigAbility/Monster';

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
export function createSummonTaskResolver(root: string, skillRows: readonly Raw[]) {
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
    characterPath: string | undefined,
    extended: boolean
  ): Promise<SummonTaskEvidence> {
    const tasks: Task[] = [];
    if (!characterPath?.startsWith('Config/ConfigCharacter/Monster/'))
      return { tasks, unboundAbilities: ['CharacterConfig'] };
    const character = await load(characterPath);
    if (!character) return { tasks, unboundAbilities: [characterPath] };
    const abilityPath = characterPath.replace('/ConfigCharacter/', '/ConfigAbility/');
    const paths = [
      ...new Set([
        abilityPath.replace('_Config', '_Ability'),
        abilityPath.replace(/_Config(?:_[^/]*)?\.json$/, '_Ability.json'),
        'Config/ConfigAbility/Monster/Monster_Common_Ability.json'
      ])
    ];
    type Ability = Evidence & { body: Raw; globals: Raw; templates: Map<string, Raw> };
    const abilities = new Map<string, Ability>();
    const alternatives = new Map<string, Ability | null>();
    async function indexAbilities(file: string, primary: boolean) {
      const config = await load(file);
      const templates = new Map<string, Raw>(
        (config?.GlobalTemplates ?? []).map((template: Raw) => [template.Name, template])
      );
      for (const body of config?.AbilityList ?? []) {
        if (abilities.has(body.Name)) continue;
        const ability = {
          file,
          name: body.Name,
          body,
          globals: config?.GlobalModifiers ?? {},
          templates
        };
        if (primary) abilities.set(body.Name, ability);
        else alternatives.set(body.Name, alternatives.has(body.Name) ? null : ability);
      }
    }
    for (const file of paths) await indexAbilities(file, true);
    if (extended)
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

    let sharedGroup: Evidence | undefined;
    const sharedRule = sharedRules.get(monster.MonsterID);
    let reproduction: Evidence | undefined;
    const unboundAbilities = new Set<string>();
    const active = new Set<Raw>();
    const visited = new Set<Raw>();
    function scan(
      file: string,
      name: string,
      body: Raw,
      globals: Raw,
      parentFloats: Raw,
      templates: Map<string, Raw>
    ) {
      if (active.has(body) || (!extended && visited.has(body))) return;
      active.add(body);
      visited.add(body);
      const floats = { ...parentFloats, ...body.DynamicValues?.Floats };
      const { Modifiers, TaskListTemplate, ...logic } = body;
      const availableTemplates =
        extended && Array.isArray(TaskListTemplate)
          ? new Map([
              ...templates,
              ...TaskListTemplate.map((entry: Raw): [string, Raw] => [entry.Name, entry])
            ])
          : templates;
      for (const node of objects(extended ? logic : { ...logic, TaskListTemplate })) {
        const kind = node.$type;
        if (
          kind === 'RPG.GameCore.DefineHPSharedGroup' &&
          sharedRule &&
          name === sharedRule.name &&
          node.MainTarget?.Alias === sharedRule.main &&
          node.SubTargets?.Alias === sharedRule.members
        ) {
          sharedGroup = { file, name };
        }
        if (kind === 'RPG.GameCore.SummonMonster') {
          for (const data of node.SummonMonsterDataList ?? []) {
            const value = data.MonsterID;
            const expression = value?.PostfixExpr;
            const hash =
              data.MonsterIDFromCustomValue?.Hash ??
              (expression?.OpCodes === 'AQAR' && expression.DynamicHashes?.length === 1
                ? expression.DynamicHashes[0]
                : undefined);
            const customKey =
              typeof data.MonsterIDFromCustomValue === 'string'
                ? data.MonsterIDFromCustomValue
                : data.MonsterIDFromCustomValue?.Name;
            const explicitKey =
              customKey ??
              (floats[String(hash)]?.ReadInfo?.Type === 'CustomValue'
                ? floats[String(hash)].ReadInfo.TriggerKey
                : undefined);
            const concrete = (key: string) =>
              (monster.CustomValues ?? []).find((row: Raw) => row.BFLIFKBEOPJ === key)
                ?.MNDFOPKBHKP ?? character!.CustomValues?.[key];
            let targetId =
              constant(value) ??
              id(resolveSkillValue(value, params, floats)) ??
              (explicitKey ? id(unwrap(concrete(explicitKey))) : undefined);
            if (
              !targetId &&
              monster.MonsterID === 2022050 &&
              name === kuimuAbility &&
              String(hash) === '-289960725' &&
              monster.SkillList?.includes(202205002) &&
              id(unwrap(concrete('SummonID01'))) === 2022051
            )
              targetId = 2022051;
            if (
              name === broodAbility &&
              String(hash) === '1509106746' &&
              monster.SkillList?.includes(broodSkillIds.get(monster.MonsterID)) &&
              monster.SummonIDList?.includes(monster.MonsterID)
            )
              reproduction = { file, name };
            const override = data.OverrideEliteGroup ?? node.OverrideEliteGroup;
            const create = data.OnMonsterCreate ?? node.OnMonsterCreate;
            tasks.push({
              file,
              name,
              targetId,
              ...(hash !== undefined ? { hash: String(hash) } : {}),
              eliteOverride:
                override === undefined
                  ? undefined
                  : (constant(override) ??
                    id(resolveSkillValue(override, params, floats)) ??
                    'dynamic'),
              inherited: inheritedStats(data.InheritPropertyList ?? node.InheritPropertyList),
              unknownCreation: Array.isArray(create)
                ? create.some(
                    (entry) =>
                      !['RPG.GameCore.TriggerEffect', 'RPG.GameCore.TriggerAnimState'].includes(
                        entry?.$type
                      )
                  )
                : create != null
            });
          }
        }
        if (typeof kind !== 'string') continue;
        const modifierName = unwrap(node.ModifierName);
        if (kind.startsWith('RPG.GameCore.AddModifier') && typeof modifierName === 'string') {
          const modifier = Modifiers?.[modifierName] ?? globals[modifierName];
          if (modifier) scan(file, modifierName, modifier, globals, floats, availableTemplates);
        }
        if (extended && kind === 'RPG.GameCore.IncludeTaskListTemplate') {
          const templateName = unwrap(node.Name ?? node.TemplateName);
          const template = availableTemplates.get(templateName);
          if (template)
            scan(
              file,
              templateName,
              template,
              globals,
              { ...floats, ...node.DynamicValues?.Floats },
              availableTemplates
            );
          else if (typeof templateName === 'string') unboundAbilities.add(templateName);
        }
        const abilityName = unwrap(node.AbilityName);
        if (kind.includes('Ability') && typeof abilityName === 'string') names.add(abilityName);
      }
      active.delete(body);
    }
    for (const name of names) {
      const match = abilities.get(name) ?? alternatives.get(name);
      if (match)
        scan(
          match.file,
          name,
          match.body,
          match.globals,
          character.DynamicValues?.Floats ?? {},
          match.templates
        );
      else if (extended && typeof name === 'string' && !/Camera/i.test(name))
        unboundAbilities.add(name);
    }
    if (sharedGroup && sharedRule?.confirmed) {
      const sameAbility = tasks.filter(({ name }) => name === sharedRule.name);
      const declaredTargets = monster.SummonIDList ?? [];
      const concreteValues = new Map(
        (monster.CustomValues ?? []).map((row: Raw) => [row.BFLIFKBEOPJ, row.MNDFOPKBHKP])
      );
      const polluxBindings =
        monster.MonsterID < 401403601 ||
        monster.MonsterID > 401403604 ||
        (concreteValues.get('SummonID0') === sharedRule.targets[0] &&
          concreteValues.get('SummonID1') === sharedRule.targets[1] &&
          sameAbility.some(({ hash }) => hash === '719053024') &&
          sameAbility.some(({ hash }) => hash === '719053023'));
      if (
        !polluxBindings ||
        sameAbility.length < sharedRule.targets.length ||
        !sharedRule.targets.every((id) => declaredTargets.includes(id))
      )
        sharedGroup = undefined;
    }
    const missingGuard =
      (!!sharedRule && !sharedGroup) ||
      (broodSkillIds.has(monster.MonsterID) && !reproduction) ||
      (monster.MonsterID === 2022050 &&
        !tasks.some((task) => task.targetId === 2022051 && task.inherited.includes('hp')));
    return {
      tasks,
      sharedGroup,
      reproduction,
      missingGuard,
      unboundAbilities: [...unboundAbilities]
    };
  }

  return (monster: Raw, characterPath?: string, extended = false) => {
    const key = `${monster.MonsterID}:${extended}`;
    if (!byMonster.has(key)) byMonster.set(key, inspect(monster, characterPath, extended));
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
  source: EliteContextSource,
  targetElite: number | undefined,
  evidence: SummonTaskEvidence,
  tablesFor: (id: number) => readonly EliteGroupTable[],
  requireBoundTask = false
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
  const useDefault = () => {
    addGroup({ ...effectiveElite, source: 'summoner-occurrence' });
    if (source === 'monster-fallback') {
      if (targetElite && tablesFor(targetElite).includes('elite'))
        addGroup({ id: targetElite, table: 'elite', source: 'target-monster-fallback' });
      else {
        if (targetElite)
          addGroup({ id: targetElite, table: null, source: 'target-monster-fallback' });
        unknownElite = 'missing-elite-group';
        contextDiagnostics.add('summon-elite-table-missing');
      }
    }
  };
  if (!relevant.length) useDefault();
  for (const task of relevant) {
    if (
      requireBoundTask ||
      task.inherited.length ||
      task.unknownCreation ||
      task.eliteOverride !== undefined
    )
      remember(task);
    for (const stat of task.inherited) unresolved.set(stat, 'runtime-inheritance');
    if (task.unknownCreation)
      for (const stat of stats)
        if (!unresolved.has(stat)) unresolved.set(stat, 'dynamic-summon-task');
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
  if (requireBoundTask && !relevant.length)
    for (const stat of stats)
      if (!unresolved.has(stat)) unresolved.set(stat, 'unbound-summon-task');
  const sharedRule = sharedRules.get(owner);
  const sharedTarget = sharedRule?.targets.includes(target);
  const shared = sharedTarget && sharedRule?.confirmed && !!evidence.sharedGroup;
  if (sharedTarget && evidence.sharedGroup) remember(evidence.sharedGroup);
  if (!shared && sharedTarget && (evidence.sharedGroup || evidence.missingGuard))
    unresolved.set('hp', 'unresolved-shared-membership');
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
    shared: !!shared,
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
