import type {
  BaseStatProgression,
  CatalogEntry,
  Character,
  DataManifest,
  Enemy,
  LightCone,
  RelicCatalogEntry,
  RelicProperty,
  RelicSet
} from '../../src/lib/domain/types.js';
import type {
  EndgameDatasetByMode,
  EndgameStage,
  EnemyOccurrence
} from '../../src/lib/domain/endgame.js';
import { ENDGAME_MODES, presentedStageWaves } from '../../src/lib/domain/endgame-view.js';
import {
  endgameOccurrenceLocatorKey,
  type EndgameOccurrenceLocator,
  type EndgameOccurrenceShard,
  type GlobalSearchIndex,
  type SearchLocale
} from '../../src/lib/domain/search-index.js';
import { searchTargetKey } from '../../src/lib/search/documents.js';
import type { LocalizationHealthSummary } from './localization.js';
import { decimalEquals, multiplyDecimals, parseDecimal } from './decimal.js';
import { buildGeneratedRouteInventory } from './routes.js';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  domain: string;
  code: string;
  entityId?: string;
  path?: string;
  message: string;
}

export interface ValidationReport {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface RelationDiagnostic {
  code: string;
  identity: string;
  detail: string;
  source?: string;
}

export interface EnemyRelationAudit {
  canonicalJoin: { resolved: number; missing: string[] };
  unknownSkillKinds?: Array<{ enemyId: string; skillId: string; value: string }>;
  unknownSkillTags?: Array<{ enemyId: string; skillId: string; value: string }>;
  unknownElements?: Array<{ enemyId: string; field: string; value: string }>;
  weaknessResistanceConflicts?: Array<{ enemyId: string; element: string; value: number }>;
  unknownDebuffResist?: Array<{ enemyId: string; key: string }>;
  unresolvedSummons: Array<{ enemyId: string; monsterId: string }>;
  unresolvedSkills: Array<{ enemyId: string; skillId: string }>;
  unresolvedExtraEffects: Array<{ enemyId: string; skillId: string; extraEffectId: string }>;
  missingAttributes?: Record<string, string[]>;
}

export interface ProductProjectionForValidation {
  locale: SearchLocale;
  catalogs: {
    characters: CatalogEntry[];
    'light-cones': CatalogEntry[];
    relics: RelicCatalogEntry[];
    enemies: CatalogEntry[];
  };
  details: {
    characters: Character[];
    'light-cones': LightCone[];
    relics: RelicSet[];
    enemies: Enemy[];
  };
  relicProperties: RelicProperty[];
  endgame: EndgameDatasetByMode;
  search: GlobalSearchIndex;
  occurrenceShards: Record<string, EndgameOccurrenceShard>;
}

const MAX_ISSUE_SAMPLES = 20;

const reportOf = (issues: ValidationIssue[]): ValidationReport => ({
  errors: issues.filter(({ severity }) => severity === 'error'),
  warnings: issues.filter(({ severity }) => severity === 'warning')
});

const issue = (
  severity: ValidationIssue['severity'],
  domain: string,
  code: string,
  message: string,
  context: Pick<ValidationIssue, 'entityId' | 'path'> = {}
): ValidationIssue => ({ severity, domain, code, message, ...context });

function renderIssue(value: ValidationIssue): string {
  const location = [value.entityId ? `entity=${value.entityId}` : '', value.path ?? '']
    .filter(Boolean)
    .join(' ');
  return `[${value.domain}/${value.code}]${location ? ` ${location}` : ''} ${value.message}`;
}

export function assertValidationReport(report: ValidationReport, label: string): void {
  for (const warning of report.warnings.slice(0, MAX_ISSUE_SAMPLES))
    console.warn(renderIssue(warning));
  if (report.warnings.length > MAX_ISSUE_SAMPLES)
    console.warn(
      `[${label}] ${report.warnings.length - MAX_ISSUE_SAMPLES} additional warnings; full diagnostics remain in data/audit/latest.json`
    );
  if (!report.errors.length) return;
  const samples = report.errors.slice(0, MAX_ISSUE_SAMPLES).map(renderIssue);
  const omitted = report.errors.length - samples.length;
  throw new Error(
    `${label} failed with ${report.errors.length} error(s):\n${samples.join('\n')}${
      omitted ? `\n... ${omitted} additional error(s)` : ''
    }`
  );
}

export function validateLocalizationHealth(
  locale: SearchLocale,
  expectedTextMapCode: 'CHS' | 'EN',
  health: LocalizationHealthSummary
): ValidationReport {
  const issues: ValidationIssue[] = [];
  if (health.unclassified || health.invalidProgramStateErrors)
    issues.push(
      issue(
        'error',
        'localization',
        'health-summary',
        `locale=${locale} unclassified=${health.unclassified} invalidProgramStateErrors=${health.invalidProgramStateErrors}`
      )
    );
  const warningEntries = new Map<
    'classified-fallback' | 'optional-missing',
    { count: number; sample: LocalizationHealthSummary['entries'][number] }
  >();
  for (const entry of health.entries) {
    const identity = `${entry.source.entity}:${entry.source.id ?? '<unknown>'}`;
    const path = `${entry.source.field} ref=${entry.identifier}`;
    if (entry.locale !== locale || entry.textMapCode !== expectedTextMapCode) {
      issues.push(
        issue(
          'error',
          'localization',
          'locale-source',
          `locale=${entry.locale} TextMap=${entry.textMapCode}; expected locale=${locale} TextMap=${expectedTextMapCode}`,
          { entityId: identity, path }
        )
      );
      continue;
    }
    if (!entry.disposition) {
      issues.push(
        issue('error', 'localization', 'unclassified', `locale=${locale} status=${entry.status}`, {
          entityId: identity,
          path
        })
      );
      continue;
    }
    if (entry.status === 'available') continue;
    const requiredReachable =
      entry.disposition.requirement === 'required' &&
      entry.disposition.visibility === 'emitted' &&
      entry.disposition.productRouteReachability === 'reachable';
    if (entry.status === 'invalid' || (requiredReachable && !entry.disposition.fallbackUsed)) {
      issues.push(
        issue(
          'error',
          'localization',
          entry.status === 'invalid' ? 'invalid-reference' : 'required-reference',
          `locale=${locale} status=${entry.status} has no allowed fallback${entry.reason ? `: ${entry.reason}` : ''}`,
          { entityId: identity, path }
        )
      );
    } else {
      const code = entry.disposition.fallbackUsed ? 'classified-fallback' : 'optional-missing';
      const current = warningEntries.get(code);
      warningEntries.set(
        code,
        current ? { ...current, count: current.count + 1 } : { count: 1, sample: entry }
      );
    }
  }
  for (const [code, entries] of warningEntries) {
    const sample = entries.sample;
    issues.push(
      issue(
        'warning',
        'localization',
        code,
        `locale=${locale} has ${entries.count} ${code === 'classified-fallback' ? 'explicit fallback' : 'optional missing'} reference(s); first status=${sample.status}`,
        {
          entityId: `${sample.source.entity}:${sample.source.id ?? '<unknown>'}`,
          path: `${sample.source.field} ref=${sample.identifier}`
        }
      )
    );
  }
  return reportOf(issues);
}

export function validateRelationAudits(input: {
  specialEffects?: RelationDiagnostic[];
  avatarSpecialSkills?: RelationDiagnostic[];
  enemies?: EnemyRelationAudit;
}): ValidationReport {
  const issues: ValidationIssue[] = [];
  for (const [domain, diagnostics] of [
    ['character-special-effect', input.specialEffects ?? []],
    ['character-special-skill', input.avatarSpecialSkills ?? []]
  ] as const) {
    for (const diagnostic of diagnostics)
      issues.push(
        issue('error', domain, diagnostic.code, diagnostic.detail, {
          entityId: diagnostic.identity,
          path: diagnostic.source
        })
      );
  }
  const enemy = input.enemies;
  if (enemy) {
    for (const templateId of enemy.canonicalJoin.missing)
      issues.push(
        issue(
          'error',
          'enemy',
          'canonical-fk',
          `MonsterTemplate references missing canonical MonsterConfig=${templateId}`,
          { entityId: templateId, path: 'MonsterTemplateConfig.MonsterTemplateID' }
        )
      );
    for (const value of enemy.unresolvedSummons)
      issues.push(
        issue(
          'error',
          'enemy',
          'summon-fk',
          `field=SummonIDList references missing MonsterConfig=${value.monsterId}`,
          { entityId: value.enemyId }
        )
      );
    for (const value of enemy.unresolvedSkills)
      issues.push(
        issue(
          'error',
          'enemy',
          'skill-fk',
          `field=SkillList references missing MonsterSkillConfig=${value.skillId}`,
          { entityId: value.enemyId }
        )
      );
    for (const value of enemy.unresolvedExtraEffects)
      issues.push(
        issue(
          'error',
          'enemy',
          'extra-effect-fk',
          `skill=${value.skillId} references missing ExtraEffectConfig=${value.extraEffectId}`,
          { entityId: value.enemyId }
        )
      );
    for (const [code, values] of [
      ['unknown-skill-kind', enemy.unknownSkillKinds ?? []],
      ['unknown-skill-tag', enemy.unknownSkillTags ?? []],
      ['unknown-element', enemy.unknownElements ?? []]
    ] as const)
      for (const value of values)
        issues.push(
          issue('error', 'enemy', code, `unsupported product-reachable value=${value.value}`, {
            entityId: value.enemyId,
            path: 'field' in value ? value.field : `skill=${value.skillId}`
          })
        );
    const weaknessConflicts = enemy.weaknessResistanceConflicts ?? [];
    if (weaknessConflicts[0]) {
      const value = weaknessConflicts[0];
      issues.push(
        issue(
          'warning',
          'enemy',
          'weakness-resistance-conflict',
          `${weaknessConflicts.length} conflict(s); first element=${value.element} resistance=${value.value}`,
          { entityId: value.enemyId }
        )
      );
    }
    const unknownDebuffResist = enemy.unknownDebuffResist ?? [];
    if (unknownDebuffResist[0]) {
      const value = unknownDebuffResist[0];
      issues.push(
        issue(
          'warning',
          'enemy',
          'unknown-debuff-resistance',
          `${unknownDebuffResist.length} unknown value(s); first key=${value.key}`,
          {
            entityId: value.enemyId
          }
        )
      );
    }
  }
  return reportOf(issues);
}

function validateBaseStatProgression(
  domain: 'character' | 'light-cone',
  entityId: string,
  progression: BaseStatProgression
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const levels = progression.stages;
  if (
    !Number.isSafeInteger(progression.minLevel) ||
    !Number.isSafeInteger(progression.maxLevel) ||
    !Number.isSafeInteger(progression.defaultLevel) ||
    progression.minLevel < 0 ||
    progression.maxLevel < progression.minLevel ||
    progression.defaultLevel < progression.minLevel ||
    progression.defaultLevel > progression.maxLevel ||
    !levels.length
  ) {
    issues.push(
      issue('error', domain, 'level-range', 'invalid min/max/default level range', {
        entityId,
        path: 'baseStats'
      })
    );
    return issues;
  }
  let expectedFrom = progression.minLevel;
  for (const [index, stage] of levels.entries()) {
    if (
      !Number.isSafeInteger(stage.fromLevel) ||
      !Number.isSafeInteger(stage.toLevel) ||
      stage.fromLevel !== expectedFrom ||
      stage.toLevel < stage.fromLevel ||
      ![stage.hp, stage.attack, stage.defence].every(
        (growth) => Number.isFinite(growth.base) && Number.isFinite(growth.perLevel)
      )
    )
      issues.push(
        issue('error', domain, 'stat-progression', 'stages must be contiguous and finite', {
          entityId,
          path: `baseStats.stages[${index}]`
        })
      );
    expectedFrom = stage.toLevel + 1;
  }
  if (levels.at(-1)?.toLevel !== progression.maxLevel)
    issues.push(
      issue('error', domain, 'level-range', 'last stage does not reach maxLevel', {
        entityId,
        path: 'baseStats.maxLevel'
      })
    );
  for (const [field, value] of Object.entries(progression.fixed ?? {}))
    if (!Number.isFinite(value))
      issues.push(
        issue('error', domain, 'numeric', `field=${field} must be finite`, {
          entityId,
          path: `baseStats.fixed.${field}`
        })
      );
  return issues;
}

function occurrencesOf(stage: EndgameStage): EnemyOccurrence[] {
  if (stage.waveModel.kind === 'fixed')
    return stage.waveModel.waves.flatMap((wave) => wave.enemies);
  if (stage.waveModel.kind === 'spawn-sequence')
    return stage.waveModel.waves.flatMap((wave) =>
      wave.monsterGroups.flatMap((group) => group.orderedEnemies)
    );
  return [];
}

function resolveLocator(
  datasets: EndgameDatasetByMode,
  locator: EndgameOccurrenceLocator
): EnemyOccurrence | undefined {
  const group = datasets[locator.mode]?.groups.find(({ groupId }) => groupId === locator.groupId);
  const stage = group?.encounters
    .find(({ id }) => id === locator.encounterId)
    ?.battles.find(({ slot }) => slot === locator.battleSlot)
    ?.stages.find(({ stageId }) => stageId === locator.stageId);
  if (!stage || stage.waveModel.kind !== locator.wave.kind) return undefined;
  const waveIndex = stage.waveModel.waves.findIndex((wave) =>
    locator.wave.kind === 'fixed'
      ? 'wave' in wave && wave.wave === locator.wave.number
      : 'waveId' in wave && wave.waveId === locator.wave.infiniteWaveId
  );
  return presentedStageWaves(stage)[waveIndex]?.find(
    ({ occurrence }) => occurrence.monsterId === locator.monsterId
  )?.occurrence;
}

function decimalIssue(
  domain: string,
  entityId: string,
  path: string,
  value: unknown
): ValidationIssue | undefined {
  if (typeof value !== 'string')
    return issue('error', domain, 'numeric', `value=${JSON.stringify(value)} is not a decimal`, {
      entityId,
      path
    });
  try {
    parseDecimal(value, path);
    return undefined;
  } catch (error) {
    return issue('error', domain, 'numeric', (error as Error).message, { entityId, path });
  }
}

function validateEndgame(
  projection: ProductProjectionForValidation,
  enemyByTemplate: Map<string, Enemy>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const positive = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
  for (const mode of ENDGAME_MODES) {
    const dataset = projection.endgame[mode];
    if (!dataset || dataset.schemaVersion !== 24 || dataset.mode !== mode) {
      issues.push(issue('error', 'endgame', 'dataset-schema', `mode=${mode} must use schema=24`));
      continue;
    }
    const groupIds = new Set<number>();
    for (const group of dataset.groups) {
      const groupPath = `mode=${mode} group=${group.groupId}`;
      if (!positive(group.groupId) || group.mode !== mode || groupIds.has(group.groupId))
        issues.push(
          issue(
            'error',
            'endgame',
            'group-identity',
            'group ID must be positive, unique and owned by its mode',
            {
              entityId: String(group.groupId),
              path: groupPath
            }
          )
        );
      groupIds.add(group.groupId);
      if (group.schedule) {
        const pattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
        const begin = Date.parse(`${group.schedule.begin.replace(' ', 'T')}+08:00`);
        const end = Date.parse(`${group.schedule.end.replace(' ', 'T')}+08:00`);
        if (
          !pattern.test(group.schedule.begin) ||
          !pattern.test(group.schedule.end) ||
          !Number.isFinite(begin) ||
          !Number.isFinite(end) ||
          begin >= end
        )
          issues.push(
            issue(
              'error',
              'endgame',
              'schedule',
              `invalid Shanghai schedule begin=${group.schedule.begin} end=${group.schedule.end}`,
              { entityId: String(group.groupId), path: groupPath }
            )
          );
      }
      const encounterIds = new Set<string>();
      for (const encounter of group.encounters) {
        if (!encounter.id || encounterIds.has(encounter.id))
          issues.push(
            issue(
              'error',
              'endgame',
              'encounter-identity',
              'encounter ID must be unique within group',
              {
                entityId: encounter.id,
                path: groupPath
              }
            )
          );
        encounterIds.add(encounter.id);
        const slots = new Set<number>();
        for (const battle of encounter.battles) {
          if (!positive(battle.slot) || slots.has(battle.slot))
            issues.push(
              issue(
                'error',
                'endgame',
                'battle-identity',
                `invalid or duplicate battle slot=${battle.slot}`,
                {
                  entityId: encounter.id,
                  path: groupPath
                }
              )
            );
          slots.add(battle.slot);
          const stageIds = new Set<number>();
          for (const stage of battle.stages) {
            const stagePath = `${groupPath} encounter=${encounter.id} slot=${battle.slot} stage=${stage.stageId}`;
            if (!positive(stage.stageId) || stageIds.has(stage.stageId))
              issues.push(
                issue(
                  'error',
                  'endgame',
                  'stage-identity',
                  'stage ID must be positive and owner-local unique',
                  {
                    entityId: String(stage.stageId),
                    path: stagePath
                  }
                )
              );
            stageIds.add(stage.stageId);
            if (!positive(stage.level))
              issues.push(
                issue('error', 'endgame', 'level', 'stage level must be a positive integer', {
                  entityId: String(stage.stageId),
                  path: stagePath
                })
              );
            const waveKind = (stage.waveModel as unknown as { kind?: unknown }).kind;
            if (waveKind !== 'fixed' && waveKind !== 'spawn-sequence') {
              issues.push(
                issue(
                  'error',
                  'endgame',
                  'wave-discriminant',
                  `unsupported product-reachable waveModel.kind=${JSON.stringify(waveKind)}; supported=fixed,spawn-sequence`,
                  { entityId: String(stage.stageId), path: stagePath }
                )
              );
              continue;
            }
            const waveModel = stage.waveModel;
            const waveIds = new Set<number>();
            for (const wave of waveModel.waves) {
              const waveId = 'wave' in wave ? wave.wave : wave.waveId;
              if (!positive(waveId) || waveIds.has(waveId))
                issues.push(
                  issue(
                    'error',
                    'endgame',
                    'wave-identity',
                    `invalid or duplicate wave=${waveId}`,
                    {
                      entityId: String(stage.stageId),
                      path: stagePath
                    }
                  )
                );
              waveIds.add(waveId);
              if ('params' in wave)
                for (const [index, parameter] of wave.params.entries()) {
                  if (typeof parameter !== 'string')
                    issues.push(
                      issue(
                        'error',
                        'endgame',
                        'numeric',
                        'spawn parameter is explicitly invalid',
                        {
                          entityId: String(stage.stageId),
                          path: `${stagePath} wave=${waveId} params[${index}]`
                        }
                      )
                    );
                  else {
                    try {
                      parseDecimal(parameter, `${stagePath}.params[${index}]`);
                    } catch (error) {
                      issues.push(
                        issue('error', 'endgame', 'numeric', (error as Error).message, {
                          entityId: String(stage.stageId),
                          path: `${stagePath} wave=${waveId} params[${index}]`
                        })
                      );
                    }
                  }
                }
            }
            for (const occurrence of occurrencesOf(stage)) {
              const occurrencePath = `${stagePath} monster=${occurrence.monsterId}`;
              const enemy = enemyByTemplate.get(String(occurrence.monsterTemplateId));
              if (
                !positive(occurrence.monsterId) ||
                !positive(occurrence.monsterTemplateId) ||
                !enemy ||
                enemy.monsters.filter(({ monsterId }) => monsterId === String(occurrence.monsterId))
                  .length !== 1
              )
                issues.push(
                  issue(
                    'error',
                    'endgame',
                    'enemy-fk',
                    `MonsterID=${occurrence.monsterId} must resolve exactly once in EnemyTemplate=${occurrence.monsterTemplateId}`,
                    { entityId: String(occurrence.monsterTemplateId), path: occurrencePath }
                  )
                );
              try {
                const factors = [
                  occurrence.hp.hpBase,
                  occurrence.hp.instanceRatio,
                  occurrence.hp.levelRatio,
                  occurrence.hp.eliteRatio
                ].map((value, index) =>
                  parseDecimal(value, `${occurrencePath}.hp.factor[${index}]`)
                );
                const expected = multiplyDecimals(factors);
                const actual = parseDecimal(
                  occurrence.hp.baseEncounterMaxHpPerBar,
                  `${occurrencePath}.hp.baseEncounterMaxHpPerBar`
                );
                if (!decimalEquals(expected, actual))
                  throw new Error('HP factors do not match baseEncounterMaxHpPerBar');
              } catch (error) {
                issues.push(
                  issue('error', 'endgame', 'numeric', (error as Error).message, {
                    entityId: String(occurrence.monsterTemplateId),
                    path: occurrencePath
                  })
                );
              }
              const final = occurrence.hp.final as unknown as {
                status?: unknown;
                maxHpPerBar?: unknown;
                reason?: unknown;
              };
              if (final.status === 'resolved') {
                const numeric = decimalIssue(
                  'endgame',
                  String(occurrence.monsterTemplateId),
                  `${occurrencePath}.hp.final.maxHpPerBar`,
                  final.maxHpPerBar
                );
                if (numeric) issues.push(numeric);
              } else if (
                final.status !== 'unresolved' ||
                ![
                  'pf-ability-without-params',
                  'pf-params-without-ability',
                  'unsupported-pf-wave-ability',
                  'invalid-pf-wave-param-count',
                  'invalid-pf-hp-added-ratio'
                ].includes(String(final.reason))
              )
                issues.push(
                  issue(
                    'error',
                    'endgame',
                    'hp-status',
                    `unsupported final HP status=${JSON.stringify(final.status)} reason=${JSON.stringify(final.reason)}`,
                    { entityId: String(occurrence.monsterTemplateId), path: occurrencePath }
                  )
                );

              const speed = occurrence.speed as unknown as Record<string, unknown>;
              if (speed.status === 'resolved') {
                for (const field of [
                  'base',
                  'instanceRatio',
                  'instanceValue',
                  'levelRatio',
                  'eliteRatio',
                  'configuredValue'
                ]) {
                  const numeric = decimalIssue(
                    'endgame',
                    String(occurrence.monsterTemplateId),
                    `${occurrencePath}.speed.${field}`,
                    speed[field]
                  );
                  if (numeric) issues.push(numeric);
                }
              } else if (speed.status !== 'unavailable' || speed.reason !== 'missing-base')
                issues.push(
                  issue(
                    'error',
                    'endgame',
                    'speed-status',
                    `unsupported speed status=${JSON.stringify(speed.status)} reason=${JSON.stringify(speed.reason)}`,
                    { entityId: String(occurrence.monsterTemplateId), path: occurrencePath }
                  )
                );

              const internalStance = occurrence.toughness.internalStance as unknown as Record<
                string,
                unknown
              >;
              if (internalStance.status === 'resolved') {
                for (const field of [
                  'baseInternal',
                  'instanceRatio',
                  'instanceValueInternal',
                  'hardLevelRatio',
                  'eliteRatio',
                  'resolvedInternal'
                ]) {
                  const numeric = decimalIssue(
                    'endgame',
                    String(occurrence.monsterTemplateId),
                    `${occurrencePath}.toughness.internalStance.${field}`,
                    internalStance[field]
                  );
                  if (numeric) issues.push(numeric);
                }
              } else if (
                internalStance.status !== 'unavailable' ||
                internalStance.reason !== 'missing-base'
              )
                issues.push(
                  issue(
                    'error',
                    'endgame',
                    'toughness-status',
                    `unsupported internal stance status=${JSON.stringify(internalStance.status)} reason=${JSON.stringify(internalStance.reason)}`,
                    { entityId: String(occurrence.monsterTemplateId), path: occurrencePath }
                  )
                );

              const display = occurrence.toughness.display as unknown as Record<string, unknown>;
              if (display.status === 'resolved') {
                const numeric = decimalIssue(
                  'endgame',
                  String(occurrence.monsterTemplateId),
                  `${occurrencePath}.toughness.display.perBar`,
                  display.perBar
                );
                if (numeric) issues.push(numeric);
              } else if (
                display.status !== 'unavailable' ||
                !['missing-base', 'non-terminating-unit-conversion'].includes(
                  String(display.reason)
                )
              )
                issues.push(
                  issue(
                    'error',
                    'endgame',
                    'toughness-status',
                    `unsupported display toughness status=${JSON.stringify(display.status)} reason=${JSON.stringify(display.reason)}`,
                    { entityId: String(occurrence.monsterTemplateId), path: occurrencePath }
                  )
                );
              if (
                internalStance.status === 'unavailable' &&
                (display.status !== 'unavailable' || display.reason !== internalStance.reason)
              )
                issues.push(
                  issue(
                    'error',
                    'endgame',
                    'toughness-state',
                    'display toughness must preserve the unavailable internal stance state',
                    { entityId: String(occurrence.monsterTemplateId), path: occurrencePath }
                  )
                );

              for (const [field, value] of [
                ['toughness.barCount', occurrence.toughness.barCount],
                ['mechanics.phaseCount', occurrence.mechanics.phaseCount]
              ] as const)
                if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0))
                  issues.push(
                    issue(
                      'error',
                      'endgame',
                      'count',
                      `field=${field} must be a positive integer`,
                      {
                        entityId: String(occurrence.monsterTemplateId),
                        path: occurrencePath
                      }
                    )
                  );
              if (occurrence.mechanics.effectiveTotalHp !== undefined) {
                const numeric = decimalIssue(
                  'endgame',
                  String(occurrence.monsterTemplateId),
                  `${occurrencePath}.mechanics.effectiveTotalHp`,
                  occurrence.mechanics.effectiveTotalHp
                );
                if (numeric) issues.push(numeric);
              }
            }
          }
        }
      }
    }
  }
  return issues;
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.every((value) => right.includes(value))
  );
}

export function validateProductProjection(
  manifest: DataManifest,
  projection: ProductProjectionForValidation
): ValidationReport {
  const issues: ValidationIssue[] = [];
  const categories = ['characters', 'light-cones', 'relics', 'enemies'] as const;
  for (const category of categories) {
    const catalogIds = projection.catalogs[category].map(({ id }) => id);
    const detailIds = projection.details[category].map(({ id }) => id);
    const routeIds = manifest.routes[category];
    if (!sameSet(catalogIds, detailIds) || !sameSet(catalogIds, routeIds))
      issues.push(
        issue(
          'error',
          'route',
          'catalog-detail',
          `locale=${projection.locale} catalog, detail and manifest route identities differ`,
          { path: `/${category}` }
        )
      );
  }
  const expectedInventory = buildGeneratedRouteInventory(manifest.routes, projection.endgame);
  if (!sameSet(manifest.routePaths, expectedInventory.routePaths))
    issues.push(
      issue(
        'error',
        'route',
        'inventory',
        'manifest.routePaths does not match generated public targets',
        {
          path: '/'
        }
      )
    );

  const relicPropertiesByType = new Map<string, RelicProperty>();
  if (projection.relicProperties.length !== manifest.counts.relicProperties)
    issues.push(
      issue(
        'error',
        'relic',
        'property-inventory',
        `locale=${projection.locale} properties=${projection.relicProperties.length} manifest=${manifest.counts.relicProperties}`
      )
    );
  for (const property of projection.relicProperties) {
    if (!property.propertyType || relicPropertiesByType.has(property.propertyType))
      issues.push(
        issue('error', 'relic', 'property-identity', 'duplicate or empty PropertyType', {
          entityId: property.propertyType
        })
      );
    relicPropertiesByType.set(property.propertyType, property);
  }
  const relicCatalogById = new Map(projection.catalogs.relics.map((set) => [set.id, set]));
  const relicPieceIds = new Set<string>();
  for (const set of projection.details.relics) {
    const expectedSlots = new Set(
      set.category === 'cavern' ? ['HEAD', 'HAND', 'BODY', 'FOOT'] : ['NECK', 'OBJECT']
    );
    if (
      (set.category !== 'cavern' && set.category !== 'planar') ||
      set.pieces.length !== expectedSlots.size ||
      set.pieces.some(({ slot }) => !expectedSlots.has(slot))
    )
      issues.push(
        issue('error', 'relic', 'piece-slots', 'piece slots do not match set category', {
          entityId: set.id
        })
      );
    for (const piece of set.pieces) {
      if (!/^\d+$/.test(piece.id) || relicPieceIds.has(piece.id))
        issues.push(
          issue('error', 'relic', 'piece-identity', `duplicate or invalid piece=${piece.id}`, {
            entityId: set.id
          })
        );
      relicPieceIds.add(piece.id);
    }
    if (
      set.effects.some(({ required }) => required !== 2 && required !== 4) ||
      !sameSet(
        set.effectRequirements.map(String),
        set.effects.map(({ required }) => String(required))
      ) ||
      !sameSet(
        set.effectRequirements.map(String),
        (relicCatalogById.get(set.id)?.effectRequirements ?? []).map(String)
      )
    )
      issues.push(
        issue(
          'error',
          'relic',
          'effect-requirement',
          'effect requirements must be unique 2/4 values shared by catalog and detail',
          { entityId: set.id }
        )
      );
  }

  const lightConeIds = new Set(projection.details['light-cones'].map(({ id }) => id));
  for (const character of projection.details.characters) {
    issues.push(...validateBaseStatProgression('character', character.id, character.baseStats));
    const recommendation = character.equipmentRecommendation;
    if (!recommendation || recommendation.avatarId !== character.id)
      issues.push(
        issue('error', 'character', 'recommendation-owner', 'recommendation owner is invalid', {
          entityId: character.id
        })
      );
    else {
      for (const [field, ids] of [
        ['lightConeIds', recommendation.lightConeIds],
        ['cavernSetIds', recommendation.cavernSetIds],
        ['planarSetIds', recommendation.planarSetIds],
        ['subStatPropertyTypes', recommendation.subStatPropertyTypes]
      ] as const)
        if (new Set(ids).size !== ids.length)
          issues.push(
            issue(
              'error',
              'character',
              'recommendation-duplicate',
              `field=${field} contains duplicates`,
              {
                entityId: character.id
              }
            )
          );
      for (const id of recommendation.lightConeIds)
        if (!lightConeIds.has(id))
          issues.push(
            issue('error', 'character', 'recommendation-fk', `missing LightCone=${id}`, {
              entityId: character.id,
              path: 'equipmentRecommendation.lightConeIds'
            })
          );
      for (const [category, ids] of [
        ['cavern', recommendation.cavernSetIds],
        ['planar', recommendation.planarSetIds]
      ] as const)
        for (const id of ids)
          if (relicCatalogById.get(id)?.category !== category)
            issues.push(
              issue(
                'error',
                'character',
                'recommendation-fk',
                `RelicSet=${id} is missing or has wrong category; expected=${category}`,
                { entityId: character.id, path: 'equipmentRecommendation' }
              )
            );
      const slots = new Set<string>();
      for (const option of recommendation.mainStatOptions) {
        if (slots.has(option.slot))
          issues.push(
            issue(
              'error',
              'character',
              'recommendation-duplicate',
              `duplicate slot=${option.slot}`,
              {
                entityId: character.id
              }
            )
          );
        slots.add(option.slot);
        if (new Set(option.propertyTypes).size !== option.propertyTypes.length)
          issues.push(
            issue(
              'error',
              'character',
              'recommendation-duplicate',
              `slot=${option.slot} contains duplicate properties`,
              {
                entityId: character.id
              }
            )
          );
        for (const propertyType of option.propertyTypes)
          if (!relicPropertiesByType.get(propertyType)?.allowedMainSlots.includes(option.slot))
            issues.push(
              issue(
                'error',
                'character',
                'recommendation-property',
                `PropertyType=${propertyType} cannot be used for slot=${option.slot}`,
                {
                  entityId: character.id
                }
              )
            );
      }
      for (const propertyType of recommendation.subStatPropertyTypes)
        if (!relicPropertiesByType.get(propertyType)?.canBeSubStat)
          issues.push(
            issue(
              'error',
              'character',
              'recommendation-property',
              `PropertyType=${propertyType} is not a sub-stat`,
              {
                entityId: character.id
              }
            )
          );
    }
  }
  for (const lightCone of projection.details['light-cones'])
    issues.push(...validateBaseStatProgression('light-cone', lightCone.id, lightCone.baseStats));

  const enemyByTemplate = new Map<string, Enemy>();
  for (const enemy of projection.details.enemies) {
    if (enemyByTemplate.has(enemy.id))
      issues.push(
        issue('error', 'enemy', 'duplicate-template', 'duplicate EnemyTemplate detail', {
          entityId: enemy.id
        })
      );
    enemyByTemplate.set(enemy.id, enemy);
    if (enemy.template.monsterTemplateId !== enemy.id)
      issues.push(
        issue('error', 'enemy', 'template-owner', 'detail/template identity mismatch', {
          entityId: enemy.id
        })
      );
    for (const [field, value] of Object.entries(enemy.template.baseStats)) {
      const numeric = decimalIssue('enemy', enemy.id, `template.baseStats.${field}`, value);
      if (numeric) issues.push(numeric);
    }
    const monsterIds = enemy.monsters.map(({ monsterId }) => monsterId);
    if (new Set(monsterIds).size !== monsterIds.length)
      issues.push(
        issue('error', 'enemy', 'duplicate-monster', 'duplicate MonsterID within template', {
          entityId: enemy.id
        })
      );
    if (!monsterIds.includes(enemy.defaultMonsterId))
      issues.push(
        issue(
          'error',
          'enemy',
          'default-fk',
          `defaultMonsterId=${enemy.defaultMonsterId} is missing`,
          { entityId: enemy.id }
        )
      );
    for (const monster of enemy.monsters) {
      if (monster.monsterTemplateId !== enemy.id)
        issues.push(
          issue(
            'error',
            'enemy',
            'monster-owner',
            `MonsterID=${monster.monsterId} has wrong template=${monster.monsterTemplateId}`,
            { entityId: enemy.id }
          )
        );
      for (const requiredField of ['hp', 'attack', 'defence', 'speed', 'stance'] as const)
        if (!monster.modifiers[requiredField])
          issues.push(
            issue('error', 'enemy', 'required-field', `missing modifiers.${requiredField}`, {
              entityId: monster.monsterId
            })
          );
      for (const [field, modifier] of Object.entries(monster.modifiers)) {
        for (const [part, value] of Object.entries(modifier)) {
          const numeric = decimalIssue(
            'enemy',
            monster.monsterId,
            `modifiers.${field}.${part}`,
            value
          );
          if (numeric) issues.push(numeric);
        }
      }
      const levels = monster.stats.levels;
      const levelIds = levels.map(({ level }) => level);
      if (
        !levels.length ||
        new Set(levelIds).size !== levelIds.length ||
        levelIds.some((level, index) =>
          !Number.isSafeInteger(level) ? true : index > 0 && level !== levelIds[index - 1] + 1
        ) ||
        monster.stats.minLevel !== levelIds[0] ||
        monster.stats.maxLevel !== levelIds.at(-1) ||
        !levelIds.includes(monster.stats.defaultLevel)
      )
        issues.push(
          issue(
            'error',
            'enemy',
            'stat-progression',
            'levels must be non-empty, unique, ordered and contain the default',
            { entityId: monster.monsterId }
          )
        );
      for (const row of levels) {
        for (const [field, state] of Object.entries(row).filter(([field]) => field !== 'level')) {
          const value = state as unknown as {
            status?: unknown;
            value?: unknown;
            reason?: unknown;
          };
          if (value.status === 'resolved') {
            const numeric = decimalIssue(
              'enemy',
              monster.monsterId,
              `stats.levels.${row.level}.${field}`,
              value.value
            );
            if (numeric) issues.push(numeric);
          } else if (value.status !== 'unavailable' || value.reason !== 'missing-base')
            issues.push(
              issue(
                'error',
                'enemy',
                'stat-status',
                `field=${field} has unsupported status=${JSON.stringify(value.status)} reason=${JSON.stringify(value.reason)}`,
                { entityId: monster.monsterId, path: `stats.levels.${row.level}` }
              )
            );
        }
      }
      for (const resistance of monster.resistances)
        if (!Number.isFinite(resistance.value))
          issues.push(
            issue('error', 'enemy', 'numeric', 'element resistance must be finite', {
              entityId: monster.monsterId,
              path: `resistances.${resistance.element}`
            })
          );
      for (const resistance of monster.specialResistances) {
        const numeric = decimalIssue(
          'enemy',
          monster.monsterId,
          `specialResistances.${resistance.code}`,
          resistance.value
        );
        if (numeric) issues.push(numeric);
      }
      for (const summon of monster.summons) {
        const target =
          enemyByTemplate.get(summon.monsterTemplateId) ??
          projection.details.enemies.find(({ id }) => id === summon.monsterTemplateId);
        if (!target || !target.monsters.some(({ monsterId }) => monsterId === summon.monsterId))
          issues.push(
            issue(
              'error',
              'enemy',
              'summon-fk',
              `summon MonsterID=${summon.monsterId} does not resolve in template=${summon.monsterTemplateId}`,
              { entityId: monster.monsterId }
            )
          );
      }
    }
  }
  issues.push(...validateEndgame(projection, enemyByTemplate));

  if (projection.search.locale !== projection.locale)
    issues.push(
      issue(
        'error',
        'search',
        'locale',
        `bundle locale=${projection.search.locale}; expected=${projection.locale}`
      )
    );
  const seenDocuments = new Set<string>();
  for (const document of projection.search.documents) {
    const key = searchTargetKey(document.target);
    const category =
      document.target.kind === 'character'
        ? 'characters'
        : document.target.kind === 'light-cone'
          ? 'light-cones'
          : document.target.kind === 'relic'
            ? 'relics'
            : document.target.kind === 'enemy'
              ? 'enemies'
              : undefined;
    const exists = category
      ? manifest.routes[category].includes(document.target.id)
      : projection.search.endgameTargets.some(({ id }) => id === document.target.id);
    if (document.key !== key || seenDocuments.has(key) || !exists)
      issues.push(
        issue(
          'error',
          'search',
          'target',
          `locale=${projection.locale} document=${document.key} does not resolve to a public target`,
          {
            entityId: document.key,
            path: category ? `/${category}/${document.target.id}` : undefined
          }
        )
      );
    seenDocuments.add(key);
  }
  const expectedDocumentKeys = [
    ...manifest.routes.characters.map((id) => `character:${id}`),
    ...manifest.routes['light-cones'].map((id) => `light-cone:${id}`),
    ...manifest.routes.relics.map((id) => `relic:${id}`),
    ...manifest.routes.enemies.map((id) => `enemy:${id}`),
    ...projection.search.endgameTargets.map(({ id }) => `endgame:${id}`)
  ];
  if (!sameSet([...seenDocuments], expectedDocumentKeys))
    issues.push(
      issue(
        'error',
        'search',
        'document-inventory',
        `locale=${projection.locale} documents do not cover the public entity and Endgame target inventory`
      )
    );

  const targetIds = projection.search.endgameTargets.map(({ id }) => id);
  if (!sameSet(targetIds, Object.keys(projection.occurrenceShards)))
    issues.push(
      issue(
        'error',
        'search',
        'shard-inventory',
        `locale=${projection.locale} target and shard inventories differ`
      )
    );
  for (const target of projection.search.endgameTargets) {
    if (!manifest.routes.enemies.includes(target.id))
      issues.push(
        issue(
          'error',
          'search',
          'endgame-target',
          `EnemyTemplate=${target.id} has no public enemy route`,
          { entityId: target.id }
        )
      );
    const shard = projection.occurrenceShards[target.id];
    if (
      !shard ||
      shard.schemaVersion !== 2 ||
      shard.locale !== projection.locale ||
      shard.target.kind !== 'endgame' ||
      shard.target.id !== target.id
    ) {
      issues.push(
        issue(
          'error',
          'search',
          'shard-identity',
          `locale=${projection.locale} shard identity is invalid`,
          { entityId: target.id }
        )
      );
      continue;
    }
    const expectedKeys = target.occurrences.map(({ locator }) =>
      endgameOccurrenceLocatorKey(locator)
    );
    if (!sameSet(expectedKeys, Object.keys(shard.occurrences)))
      issues.push(
        issue(
          'error',
          'search',
          'shard-occurrences',
          'shard occurrence keys do not match target locators',
          { entityId: target.id }
        )
      );
    const expectedPeriodKeys = [
      ...new Set(target.occurrences.map(({ locator }) => `${locator.mode}:${locator.groupId}`))
    ];
    const actualPeriodKeys = shard.periods.map(({ mode, period }) => `${mode}:${period.groupId}`);
    if (!sameSet(expectedPeriodKeys, actualPeriodKeys))
      issues.push(
        issue(
          'error',
          'search',
          'shard-periods',
          'shard period identities do not match target locator groups',
          { entityId: target.id }
        )
      );
    for (const { locator } of target.occurrences) {
      const key = endgameOccurrenceLocatorKey(locator);
      const occurrence = resolveLocator(projection.endgame, locator);
      const shardItem = shard.occurrences[key];
      if (!occurrence || String(occurrence.monsterTemplateId) !== target.id || !shardItem)
        issues.push(
          issue(
            'error',
            'search',
            'locator',
            `locator=${key} does not resolve to target EnemyTemplate=${target.id}`,
            { entityId: target.id }
          )
        );
      const groupRoute = `/endgame/${locator.mode}/${locator.groupId}`;
      if (!manifest.routePaths.includes(groupRoute))
        issues.push(
          issue(
            'error',
            'search',
            'endgame-route',
            `locale=${projection.locale} locator route is missing`,
            {
              entityId: target.id,
              path: groupRoute
            }
          )
        );
      const enemyHref = shardItem?.occurrence.enemyHref;
      if (enemyHref !== `/enemies/${target.id}` || !manifest.routePaths.includes(enemyHref))
        issues.push(
          issue(
            'error',
            'search',
            'enemy-route',
            `locale=${projection.locale} shard enemy href does not resolve`,
            {
              entityId: target.id,
              path: enemyHref
            }
          )
        );
      if (shardItem) {
        const positiveInteger = (value: number | undefined) =>
          value === undefined || (Number.isSafeInteger(value) && value > 0);
        if (
          shardItem.key !== key ||
          shardItem.occurrence.monsterId !== locator.monsterId ||
          String(shardItem.occurrence.monsterTemplateId) !== target.id ||
          !positiveInteger(shardItem.level) ||
          !positiveInteger(shardItem.occurrence.count) ||
          !positiveInteger(shardItem.occurrence.hp.phaseCount) ||
          !positiveInteger(shardItem.occurrence.toughness.barCount)
        )
          issues.push(
            issue(
              'error',
              'search',
              'shard-occurrence',
              `locator=${key} has invalid identity, owner, level, phase, or count`,
              { entityId: target.id }
            )
          );
      }
    }
  }
  return reportOf(issues);
}

export function mergeValidationReports(...reports: ValidationReport[]): ValidationReport {
  return {
    errors: reports.flatMap(({ errors }) => errors),
    warnings: reports.flatMap(({ warnings }) => warnings)
  };
}
