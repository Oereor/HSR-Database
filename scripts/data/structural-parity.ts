import { createHash } from 'node:crypto';

const fields = (...groups: string[]): Set<string> =>
  new Set(groups.flatMap((group) => group.split(/\s+/).filter(Boolean)));
const commonFields = `id key kind category type mode sourceCommit sourceVersion
recordCount count counts routes route target href schemaVersion normalizationVersion namingPolicyVersion
source table field recordId textHash policy baseAvatarId required variantIds prerequisiteIds linkedAvatarIds
simplifiedLinkedAvatarIds linkedAvatarId avatarId characterId lightConeId relicId setId pieceId monsterId
monsterTemplateId skillId traceId eidolonId groupId encounterId stageId eventId waveId waveGroupId
monsterGroupId entryId targetId occurrenceId configId gachaId equipmentId propertyType element path rarity rank slot battleSlot level minLevel
maxLevel defaultLevel fromLevel toLevel promotionLimit anchorOrder sourcePointType pointType attackType effectCode
bpNeed bpAdd spBase stanceDamageDisplay showStanceList order availableLevels scalingParamIndexes params
extraEffectIds skillIds phases arrayIndex ordinal recommendationEligible begin end infiniteWaveId card encounter battle stage wave`;
const statFields = `base perLevel fixed stages hp attack defence speed toughness effectHit effectResistance
criticalChance criticalDamage aggro max ratio value status reason resolvedInternal baseInternal instanceRatio
instanceValue instanceValueInternal levelRatio hardLevelRatio eliteRatio configuredValue internalStance display
perBar barCount runtimeStatus hpBase baseEncounterMaxHpPerBar final maxHpPerBar eliteGroupId eliteGroupTable
eliteContextSource eliteContextConfidence phaseCount effectiveTotalHp effectiveTotalHpStatus`;
const characterFields = `baseAvatarId gender profile profiles base enhanced energy max iconCode iconPath iconKey iconKeys
skillCards variants progressions traces eidolons equipmentRecommendation lightConeIds cavernSetIds planarSetIds
mainStatOptions subStatPropertyTypes propertyTypes sourcePointType extraEffects specialEffects relation kind
tarotFigurePath tarotIconPath pathCode elementCode releaseVersion categoryCode typeCode visibility source
combatLevels combatMetaLevels combatMeta effect code known tag damageType stanceDisplay`;
const equipmentFields = `pieces effects effectRequirements required allowedMainSlots canBeSubStat releaseVersion
equipmentRecommendation sourceLabelSources slotCode pathCode categoryCode typeCode`;
const enemyFields = `template monsters defaultMonsterId defaultMonster modifiers stats weaknesses resistances
specialResistances summons skills skillPhases phaseList tag damageType included visible
hardLevelGroup eliteGroup baseStats criticalDamage`;
const endgameFields = `groups encounters battles stages schedule waveModel waves enemies orderedEnemies monsterGroups
spawnSequence maxMonsterCount maxTeammateCount ability params clearPreviousAbility stageAbilities
previewMonsterIds mechanics memoryTurbulence groupBaseMechanic battleWillMechanics cacophony axiomSets
aftertaste bossGuides traits judgmentQuadrant provenance ownerId periods occurrences locator`;
const neutralFieldsByDomain = {
  characters: fields(commonFields, statFields, characterFields, equipmentFields),
  lightCones: fields(commonFields, statFields, equipmentFields),
  relics: fields(commonFields, equipmentFields),
  enemies: fields(commonFields, statFields, enemyFields),
  endgame: fields(commonFields, statFields, enemyFields, endgameFields),
  auxiliary: fields(
    commonFields,
    statFields,
    characterFields,
    equipmentFields,
    enemyFields,
    endgameFields
  )
};
const localizedContainers = new Set([
  'descriptionTokens',
  'diagnostics',
  'canonicalSource',
  'officialAliases',
  'aliases',
  'playerAliases'
]);

type StructuralDomain = keyof typeof neutralFieldsByDomain;

function project(value: unknown, key: string, parent: string, admitted: Set<string>): unknown {
  if (localizedContainers.has(key)) return undefined;
  if (Array.isArray(value))
    return value
      .map((item) => project(item, key, parent, admitted))
      .filter((item) => item !== undefined);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .flatMap(([childKey, child]) => {
          const projected = project(child, childKey, key, admitted);
          return projected === undefined ? [] : [[childKey, projected]];
        })
    );
  if (key === 'type' && parent !== 'traces' && parent !== 'stanceDisplay' && parent !== 'enemies')
    return undefined;
  if (
    key === 'value' &&
    typeof value !== 'number' &&
    !(typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value))
  )
    return undefined;
  return admitted.has(key) ? value : undefined;
}

function digest(value: unknown, domain: StructuralDomain): string {
  const projected = stableStructuralProjection(value, domain);
  return createHash('sha256').update(JSON.stringify(projected)).digest('hex');
}

function firstDifference(left: unknown, right: unknown, current = '$'): string {
  if (JSON.stringify(left) === JSON.stringify(right)) return current;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object')
    return `${current} (${JSON.stringify(left)} != ${JSON.stringify(right)})`;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  for (const key of new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]))
    if (JSON.stringify(leftRecord[key]) !== JSON.stringify(rightRecord[key]))
      return firstDifference(leftRecord[key], rightRecord[key], `${current}.${key}`);
  return current;
}

export function stableStructuralProjection(value: unknown, domain: StructuralDomain): unknown {
  return project(value, domain, '', neutralFieldsByDomain[domain]);
}

export interface StructuralParityProjection {
  catalogs: Record<string, unknown>;
  details: Record<string, unknown>;
  relicProperties: unknown;
  endgame: { datasets: { moc: unknown; pf: unknown; as: unknown; aa: unknown } };
  globalSearchIndex: { documents: unknown; endgameTargets: unknown };
  homepage: unknown;
  occurrenceShards: unknown;
}

export interface StructuralParityReport {
  comparisons: Record<string, string>;
  differences: 0;
}

/** Compare all stable product identity and relationships before locale trees are published. */
export function assertCrossLocaleStructuralParity(
  base: StructuralParityProjection,
  candidate: StructuralParityProjection
): StructuralParityReport {
  const comparisons: Array<[string, StructuralDomain, unknown, unknown]> = [
    ['catalog.characters', 'characters', base.catalogs.characters, candidate.catalogs.characters],
    ['details.characters', 'characters', base.details.characters, candidate.details.characters],
    [
      'catalog.light-cones',
      'lightCones',
      base.catalogs['light-cones'],
      candidate.catalogs['light-cones']
    ],
    [
      'details.light-cones',
      'lightCones',
      base.details['light-cones'],
      candidate.details['light-cones']
    ],
    ['catalog.relics', 'relics', base.catalogs.relics, candidate.catalogs.relics],
    ['details.relics', 'relics', base.details.relics, candidate.details.relics],
    ['relic-properties', 'relics', base.relicProperties, candidate.relicProperties],
    ['catalog.enemies', 'enemies', base.catalogs.enemies, candidate.catalogs.enemies],
    ['details.enemies', 'enemies', base.details.enemies, candidate.details.enemies],
    ...(['moc', 'pf', 'as', 'aa'] as const).map(
      (mode) =>
        [
          `endgame.${mode}`,
          'endgame',
          base.endgame.datasets[mode],
          candidate.endgame.datasets[mode]
        ] as [string, StructuralDomain, unknown, unknown]
    ),
    [
      'search.documents',
      'auxiliary',
      base.globalSearchIndex.documents,
      candidate.globalSearchIndex.documents
    ],
    [
      'search.endgame-targets',
      'endgame',
      base.globalSearchIndex.endgameTargets,
      candidate.globalSearchIndex.endgameTargets
    ],
    ['homepage', 'auxiliary', base.homepage, candidate.homepage],
    ['endgame-occurrence-shards', 'endgame', base.occurrenceShards, candidate.occurrenceShards]
  ];
  const report: Record<string, string> = {};
  for (const [name, domain, left, right] of comparisons) {
    const leftProjection = stableStructuralProjection(left, domain);
    const rightProjection = stableStructuralProjection(right, domain);
    const leftDigest = digest(left, domain);
    const rightDigest = digest(right, domain);
    if (leftDigest !== rightDigest)
      throw new Error(
        `Cross-locale structural mismatch in ${name} at ${firstDifference(leftProjection, rightProjection)}: ${leftDigest} != ${rightDigest}`
      );
    report[name] = leftDigest;
  }
  return { comparisons: report, differences: 0 };
}
