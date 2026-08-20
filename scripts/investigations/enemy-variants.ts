import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createTextResolver, loadTextMap } from '../data/localization.js';
import { assertDataRoot, generatedRoot, siteRoot, sourceCommit } from '../data/paths.js';
import { readTable } from '../data/raw.js';
import type { Enemy } from '../../src/lib/domain/types.js';

type Raw = Record<string, any>;

const groupBy = <T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
};

const basename = (value: unknown): string =>
  path.posix.basename(String(value ?? '').replaceAll('\\', '/'));

const root = assertDataRoot();
const [
  templates,
  configs,
  skills,
  eliteGroups,
  hardLevelGroups,
  atlasExtraPhase,
  atlasExtraPhases,
  guideConfig,
  guidePhase,
  guideSkill
] = await Promise.all([
  readTable<Raw>(root, 'MonsterTemplateConfig'),
  readTable<Raw>(root, 'MonsterConfig'),
  readTable<Raw>(root, 'MonsterSkillConfig'),
  readTable<Raw>(root, 'EliteGroup'),
  readTable<Raw>(root, 'HardLevelGroup'),
  readTable<Raw>(root, 'MonsterAtlasExtraPhase'),
  readTable<Raw>(root, 'MonsterAtlasExtraPhases'),
  readTable<Raw>(root, 'MonsterGuideConfig'),
  readTable<Raw>(root, 'MonsterGuidePhase'),
  readTable<Raw>(root, 'MonsterGuideSkill')
]);
const text = await createTextResolver(await loadTextMap(root));
const assets = JSON.parse(
  await readFile(path.join(siteRoot, 'static', 'generated-enemy-assets', 'index.json'), 'utf8')
) as { monsters?: Record<string, { imageId?: string }> };
const generatedEnemies = new Map(
  await Promise.all(
    templates.map(async (template) => {
      const id = String(template.MonsterTemplateID);
      const enemy = JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'enemies', `${id}.json`), 'utf8')
      ) as Enemy;
      return [id, enemy] as const;
    })
  )
);

const nameOf = (template: Raw): string =>
  text.resolveRef(template.MonsterName, {
    entity: 'enemy-variant-investigation',
    id: String(template.MonsterTemplateID),
    field: 'MonsterName'
  });
const templateIdOf = (template: Raw): string => String(template.MonsterTemplateID);
const groupIdOf = (template: Raw): string =>
  template.TemplateGroupID === undefined || template.TemplateGroupID === null
    ? ''
    : String(template.TemplateGroupID);

const configsByTemplate = groupBy(configs, (config) => String(config.MonsterTemplateID));
const canonicalConfigByTemplate = new Map(
  configs
    .filter((config) => String(config.MonsterID) === String(config.MonsterTemplateID))
    .map((config) => [String(config.MonsterTemplateID), config] as const)
);
const templateGroups = groupBy(templates, groupIdOf);
const names = groupBy(templates, nameOf);
const prefabs = groupBy(templates, (template) => String(template.PrefabPath ?? ''));
const imageIds = groupBy(
  templates,
  (template) => assets.monsters?.[templateIdOf(template)]?.imageId ?? ''
);

const member = (template: Raw) => {
  const id = templateIdOf(template);
  const config = canonicalConfigByTemplate.get(id);
  return {
    templateId: id,
    name: nameOf(template),
    rank: String(template.Rank ?? ''),
    groupId: groupIdOf(template),
    prefab: basename(template.PrefabPath),
    imageId: assets.monsters?.[id]?.imageId ?? null,
    skillIds: (config?.SkillList ?? []).map(String)
  };
};
const candidate = (groupId: string) => (templateGroups.get(groupId) ?? []).map(member);

const multiInstanceTemplates = [...configsByTemplate.values()].filter((rows) => rows.length > 1);
const largestInstance = [...configsByTemplate.entries()].sort(
  (left, right) => right[1].length - left[1].length
)[0];
const nonblankTemplateGroups = [...templateGroups.entries()].filter(([key]) => key);
const sameNameAcrossGroups = [...names.entries()]
  .filter(
    ([name, rows]) =>
      name && rows.length > 1 && new Set(rows.map(groupIdOf).filter(Boolean)).size > 1
  )
  .sort((left, right) => right[1].length - left[1].length)
  .slice(0, 20)
  .map(([name, rows]) => ({ name, members: rows.map(member) }));
const reusedVisuals = (groups: Map<string, Raw[]>) =>
  [...groups.entries()]
    .filter(
      ([key, rows]) =>
        key && rows.length > 1 && new Set(rows.map(groupIdOf).filter(Boolean)).size > 1
    )
    .sort((left, right) => right[1].length - left[1].length)
    .slice(0, 20)
    .map(([key, rows]) => ({
      key: basename(key),
      groups: [...new Set(rows.map(groupIdOf))],
      members: rows.map(member)
    }));

const phaseSets = new Map<string, number>();
const skillById = new Map(skills.map((skill) => [String(skill.SkillID), skill] as const));
let multiPhaseEnemies = 0;
let sharedExplicitSkillEnemies = 0;
let unrestrictedSkillEnemies = 0;
let unrestrictedDisplayableSkillEnemies = 0;
for (const template of templates) {
  const config = canonicalConfigByTemplate.get(templateIdOf(template));
  const skillRows = (config?.SkillList ?? []).flatMap((id: unknown) => {
    const skill = skillById.get(String(id));
    return skill ? [skill] : [];
  });
  const phases = [
    ...new Set(
      skillRows.flatMap((skill) =>
        Array.isArray(skill.PhaseList)
          ? skill.PhaseList.map(Number).filter(
              (phase: number) => Number.isSafeInteger(phase) && phase > 0
            )
          : []
      )
    )
  ].sort((left, right) => left - right);
  const phaseKey = phases.length ? `[${phases.join(',')}]` : 'none';
  phaseSets.set(phaseKey, (phaseSets.get(phaseKey) ?? 0) + 1);
  if (phases.length > 1) {
    multiPhaseEnemies += 1;
    if (skillRows.some((skill) => new Set(skill.PhaseList ?? []).size > 1))
      sharedExplicitSkillEnemies += 1;
    if (skillRows.some((skill) => !Array.isArray(skill.PhaseList) || !skill.PhaseList.length))
      unrestrictedSkillEnemies += 1;
    const publicSkillIds = new Set(
      generatedEnemies.get(templateIdOf(template))?.defaultMonster.skills.map((skill) => skill.id)
    );
    if (
      skillRows.some(
        (skill) =>
          publicSkillIds.has(String(skill.SkillID)) &&
          (!Array.isArray(skill.PhaseList) || !skill.PhaseList.length)
      )
    )
      unrestrictedDisplayableSkillEnemies += 1;
  }
}

const endgameMonsterIds = new Set<string>();
const collectMonsterIds = (value: unknown): void => {
  if (Array.isArray(value)) for (const item of value) collectMonsterIds(item);
  else if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value)) {
      if (key === 'monsterId') endgameMonsterIds.add(String(child));
      collectMonsterIds(child);
    }
};
for (const mode of ['moc', 'pf', 'as', 'aa'])
  collectMonsterIds(
    JSON.parse(await readFile(path.join(generatedRoot, 'endgame', `${mode}.json`), 'utf8'))
  );

const output = {
  source: { commit: sourceCommit(root), language: 'CHS' },
  rowCounts: {
    MonsterTemplateConfig: templates.length,
    MonsterConfig: configs.length,
    MonsterSkillConfig: skills.length,
    EliteGroup: eliteGroups.length,
    HardLevelGroup: hardLevelGroups.length,
    MonsterAtlasExtraPhase: atlasExtraPhase.length,
    MonsterAtlasExtraPhases: atlasExtraPhases.length,
    MonsterGuideConfig: guideConfig.length,
    MonsterGuidePhase: guidePhase.length,
    MonsterGuideSkill: guideSkill.length
  },
  templateInstances: {
    templatesWithCanonicalConfig: canonicalConfigByTemplate.size,
    everyTemplateHasCanonicalConfig: templates.every((template) =>
      canonicalConfigByTemplate.has(templateIdOf(template))
    ),
    templatesWithMultipleMonsterConfigs: multiInstanceTemplates.length,
    largestInstanceCount: largestInstance?.[1].length ?? 0,
    largestInstanceTemplateId: largestInstance?.[0] ?? null,
    uniqueEndgameMonsterIds: endgameMonsterIds.size,
    endgameNonCanonicalMonsterIds: [...endgameMonsterIds].filter((id) => {
      const config = configs.find((row) => String(row.MonsterID) === id);
      return config && String(config.MonsterTemplateID) !== id;
    }).length
  },
  templateGroupSignal: {
    missingTemplateGroupId: templateGroups.get('')?.length ?? 0,
    uniqueGroupValuesIncludingBlank: templateGroups.size,
    uniqueNonblankGroupValues: nonblankTemplateGroups.length,
    multiMemberGroupsIncludingBlank: [...templateGroups.values()].filter((rows) => rows.length > 1)
      .length,
    multiMemberNonblankGroups: nonblankTemplateGroups.filter(([, rows]) => rows.length > 1).length,
    largestNonblankGroup: nonblankTemplateGroups
      .sort((left, right) => right[1].length - left[1].length)
      .slice(0, 1)
      .map(([groupId, rows]) => ({ groupId, size: rows.length, members: rows.map(member) }))[0]
  },
  phaseEvidence: {
    canonicalPhaseSets: Object.fromEntries([...phaseSets.entries()].sort()),
    multiPhaseEnemies,
    multiPhaseWithExplicitlySharedSkill: sharedExplicitSkillEnemies,
    multiPhaseWithUnrestrictedSkill: unrestrictedSkillEnemies,
    multiPhaseWithDisplayableUnrestrictedSkill: unrestrictedDisplayableSkillEnemies
  },
  candidates: {
    gepard: candidate('1004020'),
    svarog: candidate('1014010'),
    yanqing: candidate('2004020'),
    sunday: candidate('3025010'),
    trotters: candidate('8002050'),
    ambiguousCocoliaGroup: candidate('1004010'),
    cocoliaMotherGroup: candidate('1005010')
  },
  sameNameAcrossGroups,
  prefabReusedAcrossGroups: reusedVisuals(prefabs),
  imageIdReusedAcrossGroups: reusedVisuals(imageIds),
  localizationDiagnostics: text.getDiagnostics()
};

console.log(JSON.stringify(output, null, 2));
