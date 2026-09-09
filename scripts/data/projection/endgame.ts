import type { NeutralExtraEffect, NeutralTextSource } from '../../../src/lib/domain/neutral.js';
import type {
  ApocalypticShadowBossTrait,
  EndgameDatasetByMode,
  EndgameGroup,
  EnemyOccurrence,
  ResolvedMazeBuff
} from '../../../src/lib/domain/endgame.js';
import type { EndgameAudit, EndgameDomain } from '../endgame.js';
import { gameTextToPlain, normalizeGameText } from '../../../src/lib/domain/game-text.js';
import type {
  GameTextProjection,
  TextDiagnosticDisposition,
  TextResolver,
  TextSource
} from '../localization.js';

export interface EndgameProjectionContext {
  resolver: TextResolver;
  enemyNamesByTemplateId: ReadonlyMap<string, string>;
  extraEffectsById: ReadonlyMap<string, NeutralExtraEffect>;
}

/** Localized, route-shaped Endgame product data plus projection audit results. */
export interface EndgameProjectionResult {
  datasets: EndgameDatasetByMode;
  audit: EndgameAudit;
}

interface EndgameProjectionAuditState {
  mazeDisplayReady: Set<number>;
  mazeMissingLocalization: Set<number>;
  mazeMalformed: Set<number>;
  mazeUnusedParams: Set<number>;
  displayReadyTraits: number;
  omittedTraits: number;
  malformedTags: Set<number>;
  unusedParamTags: Set<number>;
  displayReadyLinkedEffects: number;
  omittedLinkedEffects: number;
}

function provenance(entity: string, id: string | number, field: string): TextSource {
  return { entity, id: String(id), field };
}

function disposition(required: boolean, emitted = true): TextDiagnosticDisposition {
  return {
    requirement: required ? 'required' : 'optional',
    visibility: emitted ? 'emitted' : 'hidden',
    fallbackUsed: !required,
    productRouteReachability: emitted ? 'reachable' : 'unreachable'
  };
}

function projectText(
  resolver: TextResolver,
  source: NeutralTextSource | undefined,
  field: TextSource,
  required: boolean,
  diagnosticDisposition: TextDiagnosticDisposition = disposition(required)
): string | undefined {
  if (!source) {
    resolver.recordAbsent(field, diagnosticDisposition);
    if (required) throw new Error(`[${field.entity}.${field.id}.${field.field}] missing TextRef`);
    return undefined;
  }
  const result = resolver.resolve(source, {
    provenance: field,
    diagnosticDisposition
  });
  if (result.status === 'available') return normalizeGameText(result.value);
  if (result.status === 'invalid' || required)
    throw new Error(
      `[${field.entity}.${field.id}.${field.field}] localization ${result.status}${'reason' in result ? `: ${result.reason}` : ''}`
    );
  return undefined;
}

function projectGameText(
  resolver: TextResolver,
  source: NeutralTextSource | undefined,
  field: TextSource,
  required: boolean,
  diagnosticDisposition: TextDiagnosticDisposition = disposition(required),
  inspect?: (projection: GameTextProjection) => void
): string | undefined {
  if (!source) {
    resolver.recordAbsent(field, diagnosticDisposition);
    if (required) throw new Error(`[${field.entity}.${field.id}.${field.field}] missing TextRef`);
    return undefined;
  }
  const result = resolver.projectGameText(source, {
    provenance: field,
    diagnosticDisposition
  });
  if (result.status === 'available') {
    inspect?.(result.value);
    if (result.value.diagnostics.length) {
      if (required)
        throw new Error(`[${field.entity}.${field.id}.${field.field}] invalid GameText parameter`);
      return undefined;
    }
    return result.value.markup;
  }
  if (result.status === 'invalid' || result.status === 'unsupported' || required)
    throw new Error(
      `[${field.entity}.${field.id}.${field.field}] localization ${result.status}${'reason' in result ? `: ${result.reason}` : ''}`
    );
  return undefined;
}

function projectBuff(
  buff: ResolvedMazeBuff,
  context: EndgameProjectionContext,
  audit: EndgameProjectionAuditState,
  required: true
): ResolvedMazeBuff;
function projectBuff(
  buff: ResolvedMazeBuff,
  context: EndgameProjectionContext,
  audit: EndgameProjectionAuditState,
  required: false
): ResolvedMazeBuff | undefined;
function projectBuff(
  buff: ResolvedMazeBuff,
  context: EndgameProjectionContext,
  audit: EndgameProjectionAuditState,
  required: boolean
): ResolvedMazeBuff | undefined {
  const diagnosticDisposition: TextDiagnosticDisposition = required
    ? disposition(true)
    : {
        requirement: 'optional',
        visibility: 'hidden',
        fallbackUsed: false,
        productRouteReachability: 'reachable'
      };
  const name = projectText(
    context.resolver,
    buff.nameSource,
    provenance('MazeBuff', buff.id, 'BuffName'),
    required,
    diagnosticDisposition
  );
  const description = projectGameText(
    context.resolver,
    buff.descriptionSource,
    provenance('MazeBuff', buff.id, 'BuffDesc'),
    required,
    diagnosticDisposition,
    (projection) => {
      if (projection.diagnostics.length) audit.mazeMalformed.add(buff.id);
      const used = new Set(projection.usedParameterIndexes);
      if (buff.params.some((_, index) => !used.has(index))) audit.mazeUnusedParams.add(buff.id);
    }
  );
  if (!name || !description) {
    audit.mazeMissingLocalization.add(buff.id);
    return undefined;
  }
  audit.mazeDisplayReady.add(buff.id);
  const { nameSource: _nameSource, descriptionSource: _descriptionSource, ...stable } = buff;
  void _nameSource;
  void _descriptionSource;
  return {
    ...stable,
    name,
    description
  };
}

function projectExtraEffects(
  ids: readonly string[],
  context: EndgameProjectionContext,
  audit: EndgameProjectionAuditState
): NonNullable<ApocalypticShadowBossTrait['linkedEffects']> {
  const projected = ids.flatMap((id) => {
    const effect = context.extraEffectsById.get(id);
    if (!effect) return [];
    const name = projectText(
      context.resolver,
      effect.nameSource,
      provenance('as-stage-effect-extra-effect', id, 'ExtraEffectName'),
      false
    );
    const description = projectGameText(
      context.resolver,
      effect.descriptionSource,
      provenance('as-stage-effect-extra-effect', id, 'ExtraEffectDesc'),
      false
    );
    if (
      !name ||
      !description ||
      !gameTextToPlain(name).trim() ||
      !gameTextToPlain(description).trim()
    )
      return [];
    return [{ id, name, description }];
  });
  audit.displayReadyLinkedEffects += projected.length;
  audit.omittedLinkedEffects += ids.length - projected.length;
  return projected;
}

function projectTrait(
  trait: ApocalypticShadowBossTrait,
  context: EndgameProjectionContext,
  audit: EndgameProjectionAuditState
): ApocalypticShadowBossTrait | undefined {
  const name = projectText(
    context.resolver,
    trait.nameSource,
    provenance('MonsterGuideTag', trait.tagId, 'TagName'),
    false
  );
  const description = projectGameText(
    context.resolver,
    trait.descriptionSource,
    provenance('MonsterGuideTag', trait.tagId, 'TagBriefDescription'),
    false,
    disposition(false),
    (projection) => {
      if (projection.diagnostics.length) audit.malformedTags.add(trait.tagId);
      const used = new Set(projection.usedParameterIndexes);
      if (trait.params.some((_, index) => !used.has(index))) audit.unusedParamTags.add(trait.tagId);
    }
  );
  if (!name || !description) {
    audit.omittedTraits += 1;
    return undefined;
  }
  audit.displayReadyTraits += 1;
  const {
    nameSource: _nameSource,
    descriptionSource: _descriptionSource,
    extraEffectIds = [],
    ...stable
  } = trait;
  void _nameSource;
  void _descriptionSource;
  return {
    ...stable,
    name,
    description,
    linkedEffects: projectExtraEffects(extraEffectIds, context, audit)
  };
}

function projectOccurrence(
  occurrence: EnemyOccurrence,
  context: EndgameProjectionContext
): EnemyOccurrence {
  const name = context.enemyNamesByTemplateId.get(String(occurrence.monsterTemplateId));
  return {
    monsterId: occurrence.monsterId,
    monsterTemplateId: occurrence.monsterTemplateId,
    ...(name ? { name } : {}),
    hp: occurrence.hp,
    speed: occurrence.speed,
    toughness: occurrence.toughness,
    mechanics: occurrence.mechanics
  };
}

function projectGroup<T extends EndgameGroup>(
  group: T,
  context: EndgameProjectionContext,
  audit: EndgameProjectionAuditState
): T {
  const localized = structuredClone(group) as EndgameGroup;
  const groupName = projectText(
    context.resolver,
    group.nameSource,
    provenance(`${group.mode}-group`, group.groupId, group.mode === 'aa' ? 'Title' : 'GroupName'),
    false
  );
  delete localized.nameSource;
  localized.name = groupName;
  localized.encounters = localized.encounters.map((encounter, encounterIndex) => {
    const sourceEncounter = group.encounters[encounterIndex];
    const field =
      group.mode === 'aa' && sourceEncounter.variant === 'boss-hard'
        ? 'HardTitle'
        : group.mode === 'aa'
          ? 'Title'
          : 'Name';
    encounter.name = projectText(
      context.resolver,
      sourceEncounter.nameSource,
      provenance(`${group.mode}-encounter`, sourceEncounter.configId, field),
      false
    );
    delete encounter.nameSource;
    for (const battle of encounter.battles)
      for (const stage of battle.stages) {
        if (stage.waveModel.kind === 'fixed')
          for (const wave of stage.waveModel.waves)
            wave.enemies = wave.enemies.map((occurrence) => projectOccurrence(occurrence, context));
        else
          for (const wave of stage.waveModel.waves)
            for (const monsterGroup of wave.monsterGroups)
              monsterGroup.orderedEnemies = monsterGroup.orderedEnemies.map((occurrence) =>
                projectOccurrence(occurrence, context)
              );
      }
    return encounter;
  }) as typeof localized.encounters;

  if (localized.mode === 'moc') {
    for (const encounter of localized.encounters)
      if (encounter.memoryTurbulence)
        encounter.memoryTurbulence.buff = projectBuff(
          encounter.memoryTurbulence.buff,
          context,
          audit,
          true
        );
  } else if (localized.mode === 'pf') {
    if (localized.groupBaseMechanic?.display) {
      const display = projectBuff(localized.groupBaseMechanic.display, context, audit, false);
      if (display) localized.groupBaseMechanic.display = display;
      else delete localized.groupBaseMechanic.display;
    }
    localized.battleWillMechanics = localized.battleWillMechanics.map((entry) => ({
      ...entry,
      buff: projectBuff(entry.buff, context, audit, true)
    }));
    if (localized.cacophony)
      localized.cacophony.options = localized.cacophony.options.map((option) => ({
        ...option,
        buff: projectBuff(option.buff, context, audit, true)
      }));
    for (const encounter of localized.encounters)
      if (encounter.baseMechanic?.display) {
        const display = projectBuff(encounter.baseMechanic.display, context, audit, false);
        if (display) encounter.baseMechanic.display = display;
        else delete encounter.baseMechanic.display;
      }
  } else if (localized.mode === 'as') {
    localized.axiomSets = localized.axiomSets.map((set) => ({
      ...set,
      options: set.options.map((option) => ({
        ...option,
        buff: projectBuff(option.buff, context, audit, true)
      }))
    }));
    for (const encounter of localized.encounters) {
      if (encounter.aftertaste)
        encounter.aftertaste.buff = projectBuff(encounter.aftertaste.buff, context, audit, true);
      encounter.bossGuides = encounter.bossGuides.map((guide) => ({
        ...guide,
        traits: guide.traits.flatMap((trait) => {
          const projected = projectTrait(trait, context, audit);
          return projected ? [projected] : [];
        })
      }));
    }
  } else {
    if (localized.judgmentQuadrant)
      localized.judgmentQuadrant.options = localized.judgmentQuadrant.options.map((option) => ({
        ...option,
        buff: projectBuff(option.buff, context, audit, true)
      }));
    for (const encounter of localized.encounters)
      encounter.traits = encounter.traits.map((trait) => ({
        ...trait,
        buff: projectBuff(trait.buff, context, audit, true)
      }));
  }
  const orderedEncounters = localized.encounters.map((encounter) => {
    const {
      id,
      configId,
      name,
      nameSource: _nameSource,
      ordinal,
      variant,
      battles,
      ...modeSpecific
    } = encounter;
    void _nameSource;
    return {
      id,
      configId,
      ...(name === undefined ? {} : { name }),
      ...(ordinal === undefined ? {} : { ordinal }),
      variant,
      battles,
      ...modeSpecific
    };
  }) as typeof localized.encounters;
  const {
    mode,
    groupId,
    name,
    nameSource: _nameSource,
    schedule,
    encounters: _encounters,
    ...modeSpecific
  } = localized;
  void _nameSource;
  void _encounters;
  return {
    mode,
    groupId,
    ...(name === undefined ? {} : { name }),
    ...(schedule ? { schedule } : {}),
    encounters: orderedEncounters,
    ...modeSpecific
  } as T;
}

export function projectEndgame(
  build: EndgameDomain,
  context: EndgameProjectionContext
): EndgameProjectionResult {
  const auditState: EndgameProjectionAuditState = {
    mazeDisplayReady: new Set(),
    mazeMissingLocalization: new Set(),
    mazeMalformed: new Set(),
    mazeUnusedParams: new Set(),
    displayReadyTraits: 0,
    omittedTraits: 0,
    malformedTags: new Set(),
    unusedParamTags: new Set(),
    displayReadyLinkedEffects: 0,
    omittedLinkedEffects: 0
  };
  const datasets: EndgameDatasetByMode = {
    moc: {
      ...build.datasets.moc,
      groups: build.datasets.moc.groups.map((group) => projectGroup(group, context, auditState))
    },
    pf: {
      ...build.datasets.pf,
      groups: build.datasets.pf.groups.map((group) => projectGroup(group, context, auditState))
    },
    as: {
      ...build.datasets.as,
      groups: build.datasets.as.groups.map((group) => projectGroup(group, context, auditState))
    },
    aa: {
      ...build.datasets.aa,
      groups: build.datasets.aa.groups.map((group) => projectGroup(group, context, auditState))
    }
  };
  const audit = structuredClone(build.audit);
  audit.mazeBuffs = {
    ...audit.mazeBuffs,
    displayReady: auditState.mazeDisplayReady.size,
    missingLocalization: auditState.mazeMissingLocalization.size,
    missingDescriptionParams: auditState.mazeMalformed.size,
    unusedParams: auditState.mazeUnusedParams.size
  };
  audit.asBossGuides = {
    ...audit.asBossGuides,
    displayReadyTraits: auditState.displayReadyTraits,
    omittedTraitRelations: auditState.omittedTraits,
    distinctMalformedTags: auditState.malformedTags.size,
    distinctUnusedParamTags: auditState.unusedParamTags.size,
    displayReadyLinkedEffects: auditState.displayReadyLinkedEffects,
    omittedLinkedEffects: auditState.omittedLinkedEffects
  };
  return { datasets, audit };
}
