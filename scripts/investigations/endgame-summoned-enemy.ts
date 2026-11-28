import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { format, resolveConfig } from 'prettier';
import type { DecimalString, EnemyOccurrence } from '../../src/lib/domain/endgame.js';
import { buildEndgameDomain, createVoracityResolver } from '../data/endgame.js';
import {
  canonicalDecimal,
  decimalOf,
  internalStanceToToughness,
  multiplyDecimals,
  roundDecimalToInteger
} from '../data/decimal.js';
import { parseEnemyPhaseRatios } from '../data/enemy-phase-hp.js';
import { effectiveSkillParams, resolveSkillValue } from '../data/enemy-skill-params.js';
import { resolveEnemyConfiguredStat, resolveEnemyInternalStance } from '../data/enemy-stats.js';
import { createTextResolver, loadTextMap, runtimeTextSourceFromRef } from '../data/localization.js';
import { assertDataRoot, siteRoot, sourceCommit } from '../data/paths.js';
import { readRaw, readTable } from '../data/raw.js';

type Raw = Record<string, any>;
type Evidence = { file: string; pointer: string; name: string; node: Raw };
type Placement = {
  groupId: number;
  encounterId: number;
  floor?: number;
  tierceId?: number;
  slot: number;
  eventId: number;
  stageId: number;
  wave: number;
  position: number;
  monsterId: number;
};

const asOf = '2026-11-28';
const inspectionOnlyIds = [401301007, 401301009, 4064012, 8025010, 802501001, 802501003];
const reportFile = path.join(
  siteRoot,
  'docs/investigations/endgame-summoned-enemy-investigation.json'
);
const root = assertDataRoot();
const tables = [
  'ChallengeGroupConfig',
  'ChallengeMazeConfig',
  'ChallengeMazeTierce',
  'ScheduleDataChallengeMaze',
  'ScheduleDataGlobal',
  'PlaneEvent',
  'StageConfig',
  'MonsterConfig',
  'MonsterTemplateConfig',
  'MonsterSkillConfig',
  'HardLevelGroup',
  'EliteGroup',
  'StageInvasionConfig',
  'StageInvasionBuff',
  'StageMonsterInvasionParam',
  'MazeBuff',
  'BattleEventConfig'
] as const;
const [domain, ...rows] = await Promise.all([
  buildEndgameDomain(root),
  ...tables.map((name) => readTable<Raw>(root, name))
]);
const source = Object.fromEntries(tables.map((name, i) => [name, rows[i]])) as Record<
  (typeof tables)[number],
  Raw[]
>;
const index = (records: Raw[], field: string) => new Map(records.map((row) => [row[field], row]));
const orderedIds = (ids: Iterable<number>) => [...new Set(ids)].sort((a, b) => a - b);
const monsters = index(source.MonsterConfig, 'MonsterID');
const templates = index(source.MonsterTemplateConfig, 'MonsterTemplateID');
const skills = new Map(source.MonsterSkillConfig.map((row) => [String(row.SkillID), row]));
const stages = index(source.StageConfig, 'StageID');
const elites = index(source.EliteGroup, 'EliteGroup');
const hardLevels = new Map(
  source.HardLevelGroup.map((row) => [`${row.HardLevelGroup}:${row.Level}`, row])
);
const rawGroups = index(source.ChallengeGroupConfig, 'GroupID');
const scheduleGlobals = index(source.ScheduleDataGlobal, 'ID');
const tierces = index(source.ChallengeMazeTierce, 'PHFMCACHFIJ');
const battleEvents = index(source.BattleEventConfig, 'BattleEventID');
const invasions = index(source.StageInvasionConfig, 'StageID');
const voracityDiagnostics: unknown[] = [];
const resolveVoracity = createVoracityResolver(
  source.StageInvasionConfig.map(({ StageID, InvasionID, MonsterInvasionList }) => ({
    StageID,
    InvasionID,
    MonsterInvasionList
  })),
  source.StageInvasionBuff.map(({ InvasionID, MazeBuffID }) => ({ InvasionID, MazeBuffID })),
  source.MazeBuff.map(({ ID, Lv, InBattleBindingKey }) => ({ ID, Lv, InBattleBindingKey })),
  { warn: (code, message, context) => void voracityDiagnostics.push({ code, message, context }) }
);

function add<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function groupStatus(group: (typeof domain.datasets.moc.groups)[number]) {
  if (group.schedule) {
    if (group.schedule.begin.slice(0, 10) > asOf)
      return group.schedule.begin.startsWith('2033-') ? 'future-2033' : 'upcoming';
    return group.schedule.end.slice(0, 10) <= asOf ? 'historical' : 'current';
  }
  const raw = rawGroups.get(group.groupId)!;
  const global = scheduleGlobals.get(raw.GlobalScheduleID);
  const ends = [global?.EndTime, global?.GlobalEndTime].filter(Boolean) as string[];
  if (ends.length && ends.every((value) => value.slice(0, 10) < asOf))
    return 'historical-conflicting-boundaries';
  return raw.GlobalScheduleID || raw.ScheduleDataID ? 'unknown' : 'unscheduled';
}

const groups = domain.datasets.moc.groups.map((group) => {
  const status = groupStatus(group);
  const raw = rawGroups.get(group.groupId)!;
  return {
    groupId: group.groupId,
    status,
    included: status === 'current' || status.startsWith('historical'),
    scheduleId: raw.GlobalScheduleID ?? raw.ScheduleDataID,
    schedule: group.schedule,
    unresolvedSchedule: !group.schedule ? scheduleGlobals.get(raw.GlobalScheduleID) : undefined,
    encounters: group.encounters.length
  };
});
const groupById = new Map(groups.map((group) => [group.groupId, group]));
const keyOf = (x: Placement) =>
  [x.groupId, x.encounterId, x.slot, x.eventId, x.stageId, x.wave, x.position, x.monsterId].join(
    ':'
  );

function rawPlacements() {
  const eventStages = new Map<number, Set<number>>();
  for (const row of source.PlaneEvent) {
    if (!row.StageID) continue;
    if (!eventStages.has(row.EventID)) eventStages.set(row.EventID, new Set());
    eventStages.get(row.EventID)!.add(row.StageID);
  }
  const result: Placement[] = [];
  for (const encounter of source.ChallengeMazeConfig) {
    const group = rawGroups.get(encounter.GroupID);
    if (!group) continue;
    const tierce = tierces.get(group.TierceID);
    const third = tierce?.DLCKKJFMJOB === encounter.ID ? tierce : undefined;
    const slots = [encounter.EventIDList1, encounter.EventIDList2, third?.HFIAAGAKFMD];
    for (const [slot, events] of slots.entries()) {
      for (const eventId of (events ?? []) as number[]) {
        const candidates = eventStages.get(eventId);
        assert.equal(candidates?.size, 1, `PlaneEvent ${eventId}`);
        const stage = stages.get([...candidates!][0]);
        assert(stage, `Missing Stage for ${eventId}`);
        for (const [wave, entries] of (stage.MonsterList ?? []).entries()) {
          const ids = Object.entries(entries as Record<string, number>)
            .sort(([a], [b]) => Number(a.slice(7)) - Number(b.slice(7)))
            .map(([, id]) => id)
            .filter((id) => id > 0);
          for (const [position, monsterId] of ids.entries())
            result.push({
              groupId: group.GroupID,
              encounterId: encounter.ID,
              floor: encounter.Floor,
              ...(slot === 2 && third ? { tierceId: third.PHFMCACHFIJ } : {}),
              slot: slot + 1,
              eventId,
              stageId: stage.StageID,
              wave: wave + 1,
              position: position + 1,
              monsterId
            });
        }
      }
    }
  }
  return result;
}

const domainPlacements = new Map<string, EnemyOccurrence>();
for (const group of domain.datasets.moc.groups)
  for (const encounter of group.encounters)
    for (const slot of encounter.battles)
      for (const stage of slot.stages) {
        assert.equal(stage.waveModel.kind, 'fixed');
        if (stage.waveModel.kind !== 'fixed') continue;
        for (const wave of stage.waveModel.waves)
          for (const [position, monster] of wave.enemies.entries()) {
            const key = keyOf({
              groupId: group.groupId,
              encounterId: encounter.configId,
              slot: slot.slot,
              eventId: stage.eventId,
              stageId: stage.stageId,
              wave: wave.wave,
              position: position + 1,
              monsterId: monster.monsterId
            });
            assert(!domainPlacements.has(key), `Duplicate domain occurrence ${key}`);
            domainPlacements.set(key, monster);
          }
      }

const placements = rawPlacements();
const rawKeys = new Set(placements.map(keyOf));
assert.equal(rawKeys.size, placements.length);
assert.equal(rawKeys.size, domainPlacements.size);
for (const row of placements) {
  const occurrence = domainPlacements.get(keyOf(row));
  assert(occurrence, `Missing domain occurrence ${keyOf(row)}`);
  assert.deepEqual(occurrence.mechanics.summons, monsters.get(row.monsterId)?.SummonIDList ?? []);
  const stage = stages.get(row.stageId)!;
  assert.equal(
    occurrence.hp.eliteGroupId,
    stage.EliteGroup || monsters.get(row.monsterId)?.EliteGroup
  );
  assert.equal(occurrence.hp.eliteContextSource, stage.EliteGroup ? 'stage' : 'monster-fallback');
}

const scope = placements.filter((row) => groupById.get(row.groupId)?.included);
const placementsByMonster = new Map<number, Placement[]>();
for (const row of scope) add(placementsByMonster, row.monsterId, row);
const declared = (id: number): number[] => monsters.get(id)?.SummonIDList ?? [];
const isId = (id: unknown): id is number =>
  typeof id === 'number' && Number.isSafeInteger(id) && id > 0;
const referenceStatus = (id: unknown) =>
  !isId(id)
    ? 'invalid-id'
    : !monsters.has(id)
      ? 'missing-monster'
      : !templates.has(monsters.get(id)!.MonsterTemplateID)
        ? 'missing-template'
        : 'valid';

/** Return reachable nodes and DFS cycle witnesses, recording a cycle before cutting recursion. */
function summonGraph(roots: Iterable<number>, outgoing: (id: number) => number[]) {
  const visited = new Set<number>();
  const active = new Map<number, number>();
  const chain: number[] = [];
  const cycles = new Map<string, number[]>();
  function visit(id: number) {
    const start = active.get(id);
    if (start !== undefined) {
      const cycle = chain.slice(start);
      const first = cycle.indexOf(Math.min(...cycle));
      const canonical = [...cycle.slice(first), ...cycle.slice(0, first)];
      cycles.set(canonical.join(':'), [...canonical, canonical[0]]);
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    active.set(id, chain.length);
    chain.push(id);
    for (const target of orderedIds(outgoing(id).filter(isId))) visit(target);
    chain.pop();
    active.delete(id);
  }
  for (const id of orderedIds(roots)) visit(id);
  return { ids: orderedIds(visited), cycles: [...cycles.values()] };
}

const exampleGraph = new Map([
  [1, [2, 2]],
  [2, [2, 3]],
  [3, [1]]
]);
assert.deepEqual(
  summonGraph([1, 2], (id) => exampleGraph.get(id) ?? []),
  {
    ids: [1, 2, 3],
    cycles: [
      [2, 2],
      [1, 2, 3, 1]
    ]
  }
);
const graph = summonGraph(placementsByMonster.keys(), declared);

const configsRead = new Set<string>();
const configErrors = new Map<string, string>();
const configCache = new Map<string, Promise<Raw | undefined>>();
function config(file: string) {
  if (!configCache.has(file))
    configCache.set(
      file,
      readRaw<Raw>(root, file)
        .then((value) => {
          configsRead.add(file);
          return value;
        })
        .catch((error: unknown) => {
          const detail = error as Error & { cause?: NodeJS.ErrnoException };
          if (detail.cause?.code === 'ENOENT') return undefined;
          configErrors.set(file, detail.name);
          return undefined;
        })
    );
  return configCache.get(file)!;
}

const pointerPart = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1');
function* nodes(
  value: unknown,
  pointer = '',
  omitRootModifiers = false
): Generator<{ node: Raw; pointer: string }> {
  if (!value || typeof value !== 'object') return;
  if (!Array.isArray(value)) yield { node: value as Raw, pointer };
  for (const [key, child] of Object.entries(value)) {
    if (omitRootModifiers && key === 'Modifiers') continue;
    yield* nodes(child, `${pointer}/${pointerPart(key)}`);
  }
}

async function layoutIndex() {
  const roots = [
    'Config/ConfigAbility',
    'Config/ConfigGlobalModifier',
    'Config/ConfigGlobalTaskListTemplate'
  ];
  const directories = await Promise.all(
    roots.map(async (directory) => {
      const entries = await readdir(path.join(root, directory), {
        recursive: true,
        withFileTypes: true
      });
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.layout.json'))
        .map((entry) =>
          path.relative(root, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/')
        )
        .filter((file) => !/\/Camera\/|\/GridFight\//.test(file));
    })
  );
  const result = new Map<string, string[]>();
  for (const file of directories.flat().sort()) {
    const layout = JSON.parse(await readFile(path.join(root, file), 'utf8')) as Raw;
    for (const item of layout.BakeInfoLayouts ?? [])
      if (typeof item.UniqueName === 'string')
        add(result, item.UniqueName, file.replace('.layout.json', '.json'));
  }
  return result;
}

function definitions(file: string, body: Raw) {
  const found: Evidence[] = [];
  for (const key of ['AbilityList', 'TaskListTemplate', 'GlobalTemplates']) {
    if (!Array.isArray(body[key])) continue;
    for (const [i, node] of body[key].entries()) {
      if (typeof node.Name === 'string')
        found.push({ file, pointer: `/${key}/${i}`, name: node.Name, node });
    }
  }
  for (const key of ['GlobalModifiers', 'ModifierMap'])
    for (const [name, node] of Object.entries(body[key] ?? {}))
      found.push({ file, pointer: `/${key}/${pointerPart(name)}`, name, node: node as Raw });
  return found;
}

const namesToFiles = await layoutIndex();
const definitionsByFile = new Map<string, Promise<Evidence[]>>();
function fileDefinitions(file: string) {
  if (!definitionsByFile.has(file))
    definitionsByFile.set(
      file,
      config(file).then((body) => (body ? definitions(file, body) : []))
    );
  return definitionsByFile.get(file)!;
}

const getValue = (value: unknown): any =>
  value && typeof value === 'object' && 'Value' in value ? value.Value : value;
const asInt = (value: unknown) => {
  const raw = getValue(value);
  return typeof raw === 'string' && /^-?\d+$/.test(raw) ? Number(raw) : raw;
};
const operation = (node: Raw) =>
  typeof node.$type === 'string' ? node.$type.replace('RPG.GameCore.', '') : '';
const hpOperations = new Set([
  'DefineHPSharedGroup',
  'LockHP',
  'LockTargetHP',
  'UnlockTargetHP',
  'SetHP',
  'ModifyHP',
  'AddHP',
  'LoseHP',
  'HealHP',
  'TransferHP',
  'DamageTransfer',
  'SetMaxHP',
  'ChangeMaxHP',
  'DamageStance'
]);
const spawnOperations = new Set([
  'SummonMonster',
  'SummonPartner',
  'CreateMonster',
  'ReplaceMonster',
  'ReplaceSummonMonster'
]);
const linkedFields = ['AbilityName', 'ModifierName', 'TemplateName'] as const;

function boundParams(monster: Raw) {
  const params = new Map<string, readonly (DecimalString | undefined)[]>();
  for (const id of monster.SkillList ?? []) {
    const skill = skills.get(String(id));
    if (!skill?.SkillTriggerKey) continue;
    const values = effectiveSkillParams(skill, monster);
    const previous = params.get(skill.SkillTriggerKey);
    params.set(
      skill.SkillTriggerKey,
      previous && JSON.stringify(previous) !== JSON.stringify(values) ? [] : (previous ?? values)
    );
  }
  return params;
}

function customValues(character: Raw, monster: Raw) {
  return new Map<string, unknown>([
    ...Object.entries(character.CustomValues ?? {}),
    ...(monster.CustomValues ?? []).map((row: Raw) => [String(row.BFLIFKBEOPJ), row.MNDFOPKBHKP])
  ]);
}

function targetId(
  data: Raw,
  floats: Raw,
  params: ReturnType<typeof boundParams>,
  values: Map<string, unknown>,
  eventParams: unknown[]
) {
  const value = data.MonsterID;
  const direct = asInt(value?.IsDynamic === false ? value.FixedValue : value);
  if (isId(direct)) return { id: direct, basis: 'fixed' };
  const key = data.MonsterIDFromCustomValue;
  const custom = typeof key === 'string' ? key : (key?.Name ?? key?.Key);
  if (typeof custom === 'string' && isId(asInt(values.get(custom))))
    return { id: asInt(values.get(custom)) as number, basis: 'explicit-custom-value-key' };
  const parameter = asInt(resolveSkillValue(value, params, floats));
  if (isId(parameter)) return { id: parameter, basis: 'skill-parameter' };
  const expression = value?.PostfixExpr;
  const hashes = expression?.DynamicHashes;
  if (
    expression?.OpCodes === 'AAAR' &&
    hashes?.length === 0 &&
    expression.FixedValues?.length === 1
  ) {
    const id = asInt(expression.FixedValues[0]);
    if (isId(id)) return { id, basis: 'constant-expression' };
  }
  const hash = key?.Hash ?? (hashes?.length === 1 ? hashes[0] : undefined);
  const read = hash === undefined ? undefined : floats[String(hash)]?.ReadInfo;
  if (
    expression?.OpCodes === 'AQAR' &&
    read?.Type === 'BattleEvent' &&
    read.TriggerKey === '#BattleEvent'
  ) {
    const id = asInt(eventParams[read.Index]);
    if (isId(id)) return { id, basis: 'battle-event-parameter' };
  }
  if (read?.Type === 'CustomValue' && typeof read.TriggerKey === 'string') {
    const id = asInt(values.get(read.TriggerKey));
    if (isId(id)) return { id, basis: 'explicit-custom-value-read' };
  }
  const fixed = hash === undefined ? undefined : floats[String(hash)]?.FixedValue;
  if (value?.PostfixExpr?.OpCodes === 'AQAR' && isId(asInt(fixed)))
    return { id: asInt(fixed) as number, basis: 'explicit-dynamic-fixed-value' };
  return {
    id: undefined,
    reason: hash === undefined ? 'unsupported-target-expression' : 'unresolved-dynamic-id',
    hash,
    read
  };
}

const text = await createTextResolver(
  { locale: 'zh-CN', textMapCode: 'CHS' },
  await loadTextMap(root)
);
function label(record: Raw | undefined, field: string, entity: string, id: number) {
  const ref = runtimeTextSourceFromRef(record?.[field], { entity, field, id: String(id) });
  const result = ref && text.resolve(ref);
  return result?.status === 'available' ? result.value : undefined;
}

function characterSeeds(character: Raw, monster: Raw) {
  const seeds = new Map<string, Set<string>>();
  const bind = (names: unknown[], origin: string) => {
    for (const name of names) {
      if (typeof name !== 'string' || !name) continue;
      if (!seeds.has(name)) seeds.set(name, new Set());
      seeds.get(name)!.add(origin);
    }
  };
  bind(character.AbilityList ?? [], 'CharacterConfig.AbilityList');
  bind(monster.AbilityNameList ?? [], 'MonsterConfig.AbilityNameList');
  const byTrigger = new Map<string, number[]>();
  for (const id of monster.SkillList ?? []) {
    const trigger = skills.get(String(id))?.SkillTriggerKey;
    if (typeof trigger === 'string' && trigger) add(byTrigger, trigger, id);
  }
  for (const skill of character.SkillList ?? []) {
    const ids = byTrigger.get(skill.Name);
    const phaseEntry = (character.PhaseList ?? []).some((phase: Raw) =>
      JSON.stringify(phase).includes(`"${skill.Name}"`)
    );
    if (ids?.length || skill.UseType === 'Passive' || phaseEntry) {
      const origin = ids?.length
        ? `MonsterSkillConfig:${ids.join(',')}`
        : `CharacterConfig.SkillList:${skill.Name}`;
      bind([skill.EntryAbility], origin);
      for (const row of character.SkillAbilityList ?? [])
        if (row.Skill === skill.Name) bind(row.AbilityList ?? [], origin);
    }
  }
  // Some trigger keys have a SkillAbilityList binding but no CharacterConfig.SkillList entry.
  for (const row of character.SkillAbilityList ?? []) {
    const ids = byTrigger.get(row.Skill);
    if (ids?.length) bind(row.AbilityList ?? [], `MonsterSkillConfig:${ids.join(',')}`);
  }
  for (const { node } of nodes(character.PhaseList ?? [])) {
    bind([getValue(node.AbilityName), getValue(node.EntryAbility)], 'CharacterConfig.PhaseList');
    if (Array.isArray(node.AbilityList)) bind(node.AbilityList, 'CharacterConfig.PhaseList');
  }
  return seeds;
}

function linkedNames(node: Raw, kind: string) {
  const fields =
    kind.startsWith('AddModifier') || kind === 'TryAddModifier'
      ? linkedFields.slice(1, 2)
      : /Ability/.test(kind)
        ? linkedFields.slice(0, 1)
        : kind === 'IncludeTaskListTemplate'
          ? linkedFields.slice(2)
          : [];
  return [
    ...fields.map((key) => getValue(node[key])),
    ...(kind === 'IncludeTaskListTemplate' ? [getValue(node.Name)] : [])
  ].filter((name): name is string => typeof name === 'string' && !!name);
}

function branchEvidence(body: Raw, pointer: string) {
  const parts = pointer.slice(1).split('/');
  let current: any = body;
  const phases = [];
  const callbacks = [];
  const conditions = [];
  for (const part of parts) {
    if (typeof current?.Event === 'string') callbacks.push(current.Event);
    if (part === 'SuccessTaskList' || part === 'FailedTaskList') {
      if (current?.Predicate) conditions.push({ branch: part, predicate: current.Predicate });
      for (const { node } of nodes(current?.Predicate)) {
        if (/Phase/.test(operation(node))) phases.push({ branch: part, predicate: node });
      }
    }
    current = current?.[part.replaceAll('~1', '/').replaceAll('~0', '~')];
  }
  return {
    ...(phases.length ? { phases } : {}),
    ...(callbacks.length ? { callbacks } : {}),
    ...(conditions.length ? { conditions } : {})
  };
}

async function inspectAbilities(
  seeds: Map<string, Set<string>>,
  preferred: string[],
  character: Raw,
  monster: Raw,
  eventParams: unknown[] = []
) {
  const params = boundParams(monster);
  const values = customValues(character, monster);
  const customMonsterIds = [...values].flatMap(([key, value]) => {
    const id = asInt(value);
    return /summon|monster/i.test(key) && isId(id) && monsters.has(id) ? [{ key, id }] : [];
  });
  const spawns = [];
  const hp = [];
  const unresolved = [];
  const inspected = new Set<string>();
  const local = (await Promise.all(preferred.map(fileDefinitions))).flat();
  const work = [...seeds].map(([name, origins]) => ({
    name,
    origins: [...origins],
    via: [] as string[],
    context: undefined as Evidence | undefined,
    inheritedFloats: {} as Raw
  }));
  const seen = new Set<string>();
  for (const entry of work) {
    const { name, origins, via, context, inheritedFloats } = entry;
    const direct = context?.node.Modifiers?.[name];
    const unresolvedKey = `${context?.file ?? ''}:${name}`;
    let matches = direct
      ? [
          {
            file: context.file,
            pointer: `${context.pointer}/Modifiers/${pointerPart(name)}`,
            name,
            node: direct
          }
        ]
      : local.filter((candidate) => candidate.name === name);
    if (matches.length === 0 && context) {
      matches = (await fileDefinitions(context.file)).filter(
        (candidate) => candidate.name === name
      );
    }
    if (matches.length === 0 && !seen.has(unresolvedKey)) {
      seen.add(unresolvedKey);
      const candidates = [...new Set(namesToFiles.get(name) ?? [])].filter(
        (file) => !preferred.includes(file)
      );
      // A cross-file link is usable only when the definition can be uniquely located.
      if (candidates.length === 1)
        matches = (await fileDefinitions(candidates[0])).filter(
          (candidate) => candidate.name === name
        );
      else if (candidates.length > 1) {
        unresolved.push({ name, origins, via, reason: 'ambiguous-layout-definition', candidates });
        continue;
      }
      if (!matches.length) unresolved.push({ name, origins, via, reason: 'missing-ability-body' });
    }
    if (matches.length > 1) {
      const first = preferred.find((file) => matches.some((match) => match.file === file));
      if (first) matches = matches.filter((match) => match.file === first);
    }
    for (const match of matches) {
      const fingerprint = `${match.file}:${match.pointer}`;
      if (inspected.has(fingerprint)) continue;
      inspected.add(fingerprint);
      const floats = {
        ...character.DynamicValues?.Floats,
        ...inheritedFloats,
        ...match.node.DynamicValues?.Floats
      };
      // Embedded modifiers become reachable through a named AddModifier, not merely by declaration.
      for (const { node, pointer } of nodes(match.node, '', true)) {
        const kind = operation(node);
        const location = {
          file: match.file,
          pointer: `${match.pointer}${pointer}`,
          name,
          origins,
          via
        };
        if (spawnOperations.has(kind)) {
          const list = node.SummonMonsterDataList ?? node.MonsterDataList ?? [node];
          spawns.push({
            ...location,
            kind,
            ...branchEvidence(match.node, pointer),
            data: (list as Raw[]).map((data) => ({
              ...targetId(data, floats, params, values, eventParams),
              location: data.LocationType,
              groupLeader: data.GroupLeader,
              eliteOverride: data.OverrideEliteGroup
                ? targetId(
                    { MonsterID: data.OverrideEliteGroup },
                    floats,
                    params,
                    values,
                    eventParams
                  )
                : undefined,
              otherOverrides: Object.fromEntries(
                Object.entries(data).filter(([key]) => /level|property/i.test(key))
              )
            })),
            inherit: (node.InheritPropertyList ?? []) as string[],
            inheritSummonerWeakness: node.InheritSummonerWeakness,
            inheritSummonerDelay: node.InheritSummonerDelay,
            onCreate: node.OnMonsterCreate,
            conditionPath: pointer.includes('TaskList') ? pointer : undefined
          });
        }
        const property = getValue(node.Property ?? node.PropertyType);
        if (
          hpOperations.has(kind) ||
          (kind.includes('Property') &&
            typeof property === 'string' &&
            /hp|speed|stance/i.test(property))
        ) {
          const operands = Object.fromEntries(
            Object.entries(node).filter(([key]) => key !== '$type')
          );
          const { phases, callbacks } = branchEvidence(match.node, pointer);
          hp.push({ ...location, kind, property, phases, callbacks, operands });
        }
        if (!kind) continue;
        for (const linked of linkedNames(node, kind))
          work.push({
            name: linked,
            origins,
            via: [...via, `${match.name}:${kind}:${pointer}`],
            context: match,
            inheritedFloats: floats
          });
      }
    }
  }
  return { spawns, hp, unresolved, customMonsterIds };
}

const profileCache = new Map<number, ReturnType<typeof monsterProfile>>();
async function monsterProfile(id: number) {
  const monster = monsters.get(id);
  if (!monster) return { id, status: 'missing-monster' } as const;
  const template = templates.get(monster.MonsterTemplateID);
  if (!template) return { id, status: 'missing-template' } as const;
  const characterPath = typeof template.JsonConfig === 'string' ? template.JsonConfig : undefined;
  const character = characterPath ? await config(characterPath) : undefined;
  const companion = characterPath?.replace('/ConfigCharacter/', '/ConfigAbility/');
  const preferred = [
    ...new Set(
      [
        companion?.replace('_Config', '_Ability'),
        companion?.replace(/_Config(?:_[^/]*)?\.json$/, '_Ability.json')
      ].filter((file): file is string => !!file)
    )
  ];
  const ability = await inspectAbilities(
    characterSeeds(character ?? {}, monster),
    preferred,
    character ?? {},
    monster
  );
  const declaredIds = orderedIds(declared(id).filter(isId));
  const staticTargets = orderedIds(
    ability.spawns.flatMap((task) => task.data.flatMap((data) => data.id ?? []))
  );
  return {
    id,
    status: 'valid' as const,
    templateId: template.MonsterTemplateID as number,
    name:
      label(monster, 'MonsterName', 'MonsterConfig', id) ??
      label(template, 'MonsterName', 'MonsterTemplateConfig', template.MonsterTemplateID),
    characterPath,
    characterAvailable: !!character,
    companionPaths: preferred,
    hardLevelGroup: monster.HardLevelGroup as number | undefined,
    eliteGroup: monster.EliteGroup as number | undefined,
    declared: declared(id),
    phaseRatios: parseEnemyPhaseRatios(character, monster, skills),
    ...ability,
    matchedTargets: staticTargets.filter((target) => declaredIds.includes(target)),
    outsideList: staticTargets.filter((target) => !declaredIds.includes(target)),
    declarationsWithoutResolvedTask: declaredIds.filter((target) => !staticTargets.includes(target))
  };
}

function profile(id: number) {
  if (!profileCache.has(id)) profileCache.set(id, monsterProfile(id));
  return profileCache.get(id)!;
}

const profileIds = orderedIds([...graph.ids, ...inspectionOnlyIds]);
for (const id of profileIds) await profile(id);

const levelRows = new Map(source.StageMonsterInvasionParam.map((row) => [row.InvasionID, row]));
const stageModifiers = new Map<number, ReturnType<typeof stageMechanics>>();
const byStage = new Map<number, Placement[]>();
for (const row of scope) add(byStage, row.stageId, row);

function stageMechanics(stage: Raw) {
  const stageAbilityNames: string[] = (stage.StageAbilityConfig ?? []).filter(
    (value: unknown): value is string => typeof value === 'string'
  );
  const unprocessedStageAbilityEntries = (stage.StageAbilityConfig ?? []).filter(
    (value: unknown) => typeof value !== 'string'
  );
  const stageConfigData = (stage.StageConfigData ?? []) as Raw[];
  const eventLinks = stageConfigData.filter((row) => row.BFLIFKBEOPJ === '_CreateBattleEvent');
  const eventIds = orderedIds(
    eventLinks.flatMap((row) =>
      String(row.MNDFOPKBHKP)
        .split(/[;,|]/)
        .map((token) => Number(token.trim()))
        .filter(isId)
    )
  );
  const bindings = [];
  for (const id of eventIds) {
    const event = battleEvents.get(id);
    const names = (event?.AbilityList ?? []) as string[];
    bindings.push({
      kind: 'battle-event',
      id,
      names,
      status: event ? 'resolved' : 'missing-battle-event'
    });
  }
  if (stageAbilityNames.length)
    bindings.push({ kind: 'stage-ability', names: stageAbilityNames, status: 'resolved' });
  const invasion = invasions.get(stage.StageID);
  const invasionBuff =
    invasion && source.StageInvasionBuff.find((row) => row.InvasionID === invasion.InvasionID);
  const buff =
    invasionBuff &&
    source.MazeBuff.find((row) => row.ID === invasionBuff.MazeBuffID && (row.Lv ?? 1) === 1);
  if (invasion && buff?.InBattleBindingKey)
    bindings.push({
      kind: 'stage-invasion',
      id: invasion.InvasionID as number,
      names: [buff.InBattleBindingKey as string],
      status: 'resolved'
    });
  return {
    stageId: stage.StageID as number,
    hardLevelGroup: stage.HardLevelGroup as number,
    level: stage.Level as number,
    eliteGroup: stage.EliteGroup as number | undefined,
    levelGraph: stage.LevelGraphPath as string | undefined,
    bindings,
    unprocessedStageAbilityEntries,
    eventLinks,
    invasion: invasion
      ? {
          id: invasion.InvasionID as number,
          applicable: invasion.MonsterInvasionList,
          mazeBuffId: buff?.ID as number | undefined,
          binding: buff?.InBattleBindingKey,
          mazeBuffParams: buff?.ParamList,
          stageInvasionParams: levelRows.get(invasion.InvasionID)?.ParamList
        }
      : undefined
  };
}

for (const id of orderedIds(byStage.keys()))
  stageModifiers.set(id, stageMechanics(stages.get(id)!));
const levelGraphEvidence = [];
for (const file of [
  ...new Set([...stageModifiers.values()].flatMap((stage) => stage.levelGraph ?? []))
].sort()) {
  const body = await config(file);
  const operations = [...nodes(body)].flatMap(({ node, pointer }) => {
    const kind = operation(node);
    return spawnOperations.has(kind) || kind === 'CreateBattleEventEntityFromStage'
      ? [{ kind, pointer }]
      : [];
  });
  levelGraphEvidence.push({ file, available: !!body, operations });
}
const stageAbilityEvidence = new Map<string, Awaited<ReturnType<typeof inspectAbilities>>>();
const stageSpawnSources = [];
for (const stage of stageModifiers.values()) {
  for (const binding of stage.bindings) {
    const key = [binding.kind, binding.id, ...binding.names].join(':');
    if (!stageAbilityEvidence.has(key)) {
      const seeds = new Map(binding.names.map((name) => [name, new Set([binding.kind])]));
      const params =
        binding.kind === 'battle-event' ? battleEvents.get(binding.id)?.ParamList : undefined;
      stageAbilityEvidence.set(key, await inspectAbilities(seeds, [], {}, {}, params ?? []));
    }
    const evidence = stageAbilityEvidence.get(key)!;
    if (evidence.spawns.length || (binding.kind !== 'stage-invasion' && evidence.unresolved.length))
      stageSpawnSources.push({ stageId: stage.stageId, source: key });
  }
}

const numericProfiles = new Map<string, ReturnType<typeof statCandidate>>();
function statCandidate(
  id: number,
  level: number,
  hardLevelGroup: number | undefined,
  eliteGroup: number | undefined
) {
  const monster = monsters.get(id);
  const template = templates.get(monster?.MonsterTemplateID);
  const hard = hardLevels.get(`${hardLevelGroup}:${level}`);
  const elite = elites.get(eliteGroup);
  const context = { id, level, hardLevelGroup, eliteGroup };
  if (!hard || !elite || !monster || !template)
    return {
      ...context,
      status: 'unresolved' as const,
      reason: !hard
        ? 'missing-hard-level-row'
        : !elite
          ? 'missing-elite-row'
          : 'missing-target-config'
    };
  try {
    const hpBase = decimalOf(template.HPBase, 'MonsterTemplateConfig.HPBase');
    const hpModifyRatio = decimalOf(monster.HPModifyRatio, 'MonsterConfig.HPModifyRatio');
    const hardHpRatio = decimalOf(hard.HPRatio, 'HardLevelGroup.HPRatio');
    const eliteHpRatio = decimalOf(elite.HPRatio, 'EliteGroup.HPRatio');
    const hp = canonicalDecimal(
      multiplyDecimals([hpBase, hpModifyRatio, hardHpRatio, eliteHpRatio])
    );
    const speed = resolveEnemyConfiguredStat('Speed', {
      base: template.SpeedBase,
      instanceRatio: monster.SpeedModifyRatio,
      instanceValue: monster.SpeedModifyValue,
      levelRatio: hard.SpeedRatio,
      eliteRatio: elite.SpeedRatio
    });
    const stance = resolveEnemyInternalStance({
      base: template.StanceBase,
      instanceRatio: monster.StanceModifyRatio,
      instanceValue: monster.StanceModifyValue,
      levelRatio: hard.StanceRatio,
      eliteRatio: elite.StanceRatio
    });
    return {
      ...context,
      status: 'resolved' as const,
      hpBase,
      hpModifyRatio,
      hardHpRatio,
      eliteHpRatio,
      hp,
      displayHp: roundDecimalToInteger(hp),
      speed,
      stance,
      toughness:
        stance.status === 'resolved'
          ? internalStanceToToughness(stance.resolvedInternal)
          : undefined
    };
  } catch (error) {
    return {
      ...context,
      status: 'unresolved' as const,
      reason: 'invalid-stat-factor',
      detail: (error as Error).message
    };
  }
}

function candidateKey(
  id: number,
  level: number,
  hard: number | undefined,
  elite: number | undefined
) {
  const key = `${id}:${level}:${hard ?? '-'}:${elite ?? '-'}`;
  if (!numericProfiles.has(key)) numericProfiles.set(key, statCandidate(id, level, hard, elite));
  return key;
}

function compareContexts(id: number, stage: Raw, occurrence: EnemyOccurrence) {
  const target = monsters.get(id)!;
  const summoner = monsters.get(occurrence.monsterId)!;
  const hardSources: Record<string, number | undefined> = {
    'stage-or-summoner-occurrence': stage.HardLevelGroup,
    'summoner-config': summoner.HardLevelGroup,
    'target-config': target.HardLevelGroup
  };
  const eliteSources: Record<string, number | undefined> = {
    'stage-then-target-config': stage.EliteGroup || target.EliteGroup,
    'summoner-occurrence': occurrence.hp.eliteGroupId,
    'summoner-config': summoner.EliteGroup,
    'target-config': target.EliteGroup
  };
  const keys = new Set<string>();
  for (const hard of Object.values(hardSources))
    for (const elite of Object.values(eliteSources))
      keys.add(candidateKey(id, stage.Level, hard, elite));
  const values = [...keys].map((key) => numericProfiles.get(key)!);
  const hp = new Set(values.flatMap((row) => (row.status === 'resolved' ? [row.hp] : [])));
  return {
    hardSources,
    eliteSources,
    keys: [...keys],
    distinctHpCount: hp.size,
    unresolvedCandidates: values.filter((row) => row.status === 'unresolved').length
  };
}

function taskEliteOverrides(
  id: number,
  stage: Raw,
  tasks: Awaited<ReturnType<typeof inspectAbilities>>['spawns']
) {
  return tasks.flatMap((task) =>
    task.data
      .filter((data) => data.id === id && data.eliteOverride)
      .map((data) => ({
        file: task.file,
        pointer: task.pointer,
        override: data.eliteOverride,
        candidate:
          data.eliteOverride?.id !== undefined
            ? candidateKey(id, stage.Level, stage.HardLevelGroup, data.eliteOverride.id)
            : undefined
      }))
  );
}

const relationRows = [];
const abilityOnlyRows = [];
const scopeSummoners = new Set<number>();
const scopeTargets = new Set<number>();
const distinctEdges = new Set<string>();
const numericSpread = new Map<number, number>();
const rawReferences = new Map<string, number>();
const abilityEvidence = new Map<string, number>();
const count = <T>(map: Map<T, number>, key: T) => map.set(key, (map.get(key) ?? 0) + 1);
let rawHardDifferent = 0;
let activeEliteDifferent = 0;
let rawEliteDifferent = 0;
let numericCasesWithMissingInputs = 0;
for (const row of scope) {
  const stageset = stages.get(row.stageId)!;
  const occurrence = domainPlacements.get(keyOf(row))!;
  const summoner = await profile(row.monsterId);
  if (!('matchedTargets' in summoner)) continue;
  if (summoner.declared.length) scopeSummoners.add(row.monsterId);
  for (const ref of summoner.declared) count(rawReferences, referenceStatus(ref));
  for (const id of [...new Set(summoner.declared)]) {
    const status = referenceStatus(id);
    const evidence = summoner.matchedTargets.includes(id)
      ? 'resolved-task'
      : summoner.spawns.some((task) => task.data.some((data) => data.id === undefined))
        ? 'unresolved-task-target'
        : !summoner.characterAvailable
          ? 'missing-character-config'
          : 'no-matching-task-found';
    count(abilityEvidence, evidence);
    const candidates = status === 'valid' ? compareContexts(id, stageset, occurrence) : undefined;
    const voracity = status === 'valid' ? resolveVoracity(row.stageId, id) : undefined;
    if (candidates) {
      const target = monsters.get(id)!;
      scopeTargets.add(id);
      distinctEdges.add(`${row.monsterId}:${id}`);
      count(numericSpread, candidates.distinctHpCount);
      if (candidates.unresolvedCandidates) numericCasesWithMissingInputs++;
      if (stageset.HardLevelGroup !== target.HardLevelGroup) rawHardDifferent++;
      if (occurrence.hp.eliteGroupId !== target.EliteGroup) activeEliteDifferent++;
      if (summoner.eliteGroup !== target.EliteGroup) rawEliteDifferent++;
    }
    relationRows.push({
      ...row,
      occurrenceId: occurrence.occurrenceId,
      targetId: id,
      status,
      evidence,
      voracity,
      eliteContextSource: occurrence.hp.eliteContextSource,
      repeatCount: summoner.declared.filter((target) => target === id).length,
      candidates,
      taskOverrides: taskEliteOverrides(id, stageset, summoner.spawns)
    });
  }
  for (const id of summoner.outsideList) {
    const status = referenceStatus(id);
    abilityOnlyRows.push({
      ...row,
      occurrenceId: occurrence.occurrenceId,
      targetId: id,
      status,
      candidates: status === 'valid' ? compareContexts(id, stageset, occurrence) : undefined,
      taskOverrides: taskEliteOverrides(id, stageset, summoner.spawns)
    });
  }
}

const stageOnlyTargets: {
  stageId: number;
  binding: string;
  targetId: number;
  status: ReturnType<typeof referenceStatus>;
  defaultContext?: string;
  taskOverrides: ReturnType<typeof taskEliteOverrides>;
}[] = [];
for (const { stageId, source: binding } of stageSpawnSources) {
  const stage = stages.get(stageId)!;
  const tasks = stageAbilityEvidence.get(binding)!.spawns;
  for (const id of orderedIds(
    tasks.flatMap((task) => task.data.flatMap((data) => data.id ?? []))
  )) {
    const status = referenceStatus(id);
    stageOnlyTargets.push({
      stageId,
      binding,
      targetId: id,
      status,
      defaultContext:
        status === 'valid'
          ? candidateKey(
              id,
              stage.Level,
              stage.HardLevelGroup,
              stage.EliteGroup || monsters.get(id)?.EliteGroup
            )
          : undefined,
      taskOverrides: taskEliteOverrides(id, stage, tasks)
    });
  }
}

const benchmarkOccurrence = relationRows.find(
  (row) =>
    row.groupId === 1036 &&
    row.encounterId === 5512 &&
    row.tierceId === 5513 &&
    row.eventId === 30126123 &&
    row.stageId === 30126123 &&
    row.wave === 2 &&
    row.monsterId === 4064010 &&
    row.targetId === 4062010
);
const estimatedHp = { low: 660000, center: 695000, high: 730000 };
const benchmark = benchmarkOccurrence && {
  ...benchmarkOccurrence,
  estimatedHp,
  measured: { damage: 148942, fullWidthPx: 98, remainingPx: 77, lossPx: 21 },
  schedule: groupById.get(1036)?.schedule,
  candidateResults: benchmarkOccurrence.candidates?.keys.flatMap((key) => {
    const candidate = numericProfiles.get(key);
    if (candidate?.status !== 'resolved') return [];
    const hp = Number(candidate.hp);
    return [
      {
        key,
        ...candidate,
        deltaPct: Number(((hp / estimatedHp.center - 1) * 100).toFixed(4)),
        insideEstimate: hp >= estimatedHp.low && hp <= estimatedHp.high
      }
    ];
  }),
  stageContext: stageModifiers.get(benchmarkOccurrence.stageId)
};

const selectedProfiles = [];
for (const id of orderedIds([
  ...profileIds,
  ...abilityOnlyRows.map((row) => row.targetId),
  ...stageOnlyTargets.map((row) => row.targetId)
]))
  selectedProfiles.push(await profile(id));

const specialKinds = new Map<string, Set<number>>();
for (const entry of selectedProfiles) {
  if (!graph.ids.includes(entry.id) || entry.status !== 'valid') continue;
  const record = (kind: string) => {
    if (!specialKinds.has(kind)) specialKinds.set(kind, new Set());
    specialKinds.get(kind)!.add(entry.id);
  };
  for (const task of entry.spawns) {
    if (task.inherit.some((property) => property === 'CurrentHP' || property === 'MaxHP'))
      record('explicit-hp-inheritance');
    if (task.phases?.length) record('phase-predicate');
    if (task.kind.includes('Replace')) record('replacement-task');
    if (task.onCreate) record('creation-callback');
  }
  for (const hp of entry.hp) {
    if (hp.kind === 'DefineHPSharedGroup') record('shared-hp-operation');
    if (hp.kind.startsWith('Lock')) record('hp-lock-operation');
    if (hp.property === 'MaxHP' || hp.property === 'MaxHPAddRatio')
      record('max-hp-property-operation');
  }
}

const overlap = orderedIds([...scopeTargets].filter((id) => placementsByMonster.has(id)));
const repoCommit = sourceCommit(root);
const dataVersion = execFileSync('git', ['-C', root, 'show', '-s', '--format=%s', repoCommit], {
  encoding: 'utf8',
  windowsHide: true
}).trim();
const pinnedCommit = JSON.parse(await readFile(path.join(siteRoot, 'upstream.lock.json'), 'utf8'))
  .turnBasedGameData.commit;

// This body is a configuration comparison. Its tasks do not establish MoC ownership.
const eliteOverrideComparisonFile = 'Config/ConfigAbility/BattleEvent/TotalAttack_Ability.json';
const eliteOverrideComparison = [...nodes(await config(eliteOverrideComparisonFile))].flatMap(
  ({ node, pointer }) =>
    operation(node) === 'SummonMonster'
      ? (node.SummonMonsterDataList ?? []).flatMap((entry: Raw, index: number) =>
          entry.OverrideEliteGroup
            ? [
                {
                  file: eliteOverrideComparisonFile,
                  pointer: `${pointer}/SummonMonsterDataList/${index}`,
                  value: entry.OverrideEliteGroup
                }
              ]
            : []
        )
      : []
);

const generated = {
  source: {
    commit: repoCommit,
    dataVersion,
    pinnedCommit,
    asOf,
    timeZone: 'UTC+8',
    excelTables: tables,
    textMaps: ['TextMap/TextMapCHS.json'],
    configsRead: [...configsRead].sort(),
    configErrors: [...configErrors.entries()].sort()
  },
  summary: {
    allGroups: groups.length,
    allOccurrences: placements.length,
    includedGroups: groups.filter((row) => row.included).length,
    includedEncounters: groups
      .filter((row) => row.included)
      .reduce((n, row) => n + row.encounters, 0),
    includedStageOccurrences: new Set(
      scope.map((row) => [row.groupId, row.encounterId, row.slot, row.eventId].join(':'))
    ).size,
    includedPresetOccurrences: scope.length,
    summoningOccurrences: new Set(relationRows.map((row) => row.occurrenceId)).size,
    summonerVariants: scopeSummoners.size,
    targetVariants: scopeTargets.size,
    distinctVariantEdges: distinctEdges.size,
    rawReferences: Object.fromEntries(rawReferences),
    rawConfigReferences: [...scopeSummoners].reduce((n, id) => n + declared(id).length, 0),
    candidateCases: relationRows.length,
    candidateEvidence: Object.fromEntries(abilityEvidence),
    outsideListCases: abilityOnlyRows.length,
    distinctOutsideListEdges: new Set(
      abilityOnlyRows.map((row) => `${row.monsterId}:${row.targetId}`)
    ).size,
    stageSpawnOrUnresolvedAbilityBindings: stageSpawnSources.length,
    stageAbilityLiteralTargetCases: stageOnlyTargets.length,
    stageAbilityLiteralTargetReferences: Object.fromEntries(
      ['valid', 'missing-monster', 'missing-template'].map((status) => [
        status,
        stageOnlyTargets.filter((row) => row.status === status).length
      ])
    ),
    overlapTargets: overlap,
    candidateHpSpread: Object.fromEntries(numericSpread),
    numericCasesWithMissingInputs,
    stageAndTargetHardLevelDiffer: rawHardDifferent,
    activeSummonerAndTargetEliteDiffer: activeEliteDifferent,
    configuredSummonerAndTargetEliteDiffer: rawEliteDifferent,
    voracityTargetCases: relationRows.filter((row) => row.voracity !== undefined).length,
    specialHpSignalVariants: new Set(
      [...specialKinds].filter(([kind]) => kind.includes('hp-')).flatMap(([, ids]) => [...ids])
    ).size,
    specialKindsByVariant: Object.fromEntries(
      [...specialKinds].map(([kind, ids]) => [kind, orderedIds(ids)])
    )
  },
  groups,
  benchmark,
  recursiveDeclaredEdges: graph.ids.flatMap((id) =>
    orderedIds(declared(id).filter(isId))
      .filter((target) => declared(target).length)
      .map((target) => ({ summoner: id, target }))
  ),
  declaredCycleWitnesses: graph.cycles,
  inspectionOnlyIds,
  profiles: selectedProfiles,
  presetOccurrencesOfDeclaredTargets: scope
    .filter((row) => overlap.includes(row.monsterId))
    .map((row) => {
      const occurrence = domainPlacements.get(keyOf(row))!;
      return { ...row, occurrenceId: occurrence.occurrenceId, hp: occurrence.hp };
    }),
  relationRows,
  abilityOnlyRows,
  numericProfiles: [...numericProfiles].sort(([a], [b]) => a.localeCompare(b, 'en')),
  stageContexts: [...stageModifiers.values()],
  stageSpawnSources,
  stageOnlyTargets,
  levelGraphEvidence,
  eliteOverrideComparison,
  stageAbilityEvidence: [...stageAbilityEvidence].map(([key, value]) => ({ key, ...value })),
  voracityDiagnostics
};

const output = await format(JSON.stringify(generated), {
  ...(await resolveConfig(reportFile)),
  filepath: reportFile,
  endOfLine: 'lf'
});

const mode = process.argv[2];
if (mode === '--check')
  assert(output === (await readFile(reportFile, 'utf8')), 'Generated audit differs');
else if (!mode) await writeFile(reportFile, output, 'utf8');
else throw new Error(`Unknown option ${mode}`);
console.log(JSON.stringify(generated.summary, undefined, 2));
