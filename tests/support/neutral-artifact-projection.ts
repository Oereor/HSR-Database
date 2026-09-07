const fields = (...groups: string[]): Set<string> =>
  new Set(groups.flatMap((group) => group.split(/\s+/).filter(Boolean)));
const commonFields = `id key kind category type mode sourceCommit sourceVersion language locale textMapCode
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
combatLevels combatMetaLevels combatMeta effect code known tag damageType specialResource stanceDisplay`;
const equipmentFields = `pieces effects effectRequirements required allowedMainSlots canBeSubStat releaseVersion
equipmentRecommendation sourceLabelSources slotCode pathCode categoryCode typeCode`;
const enemyFields = `template monsters defaultMonsterId defaultMonster modifiers stats weaknesses resistances
specialResistances summons skills skillPhases phaseList tag damageType localizedTextStatus included visible
hardLevelGroup eliteGroup baseStats criticalDamage`;
const endgameFields = `groups encounters battles stages schedule waveModel waves enemies orderedEnemies monsterGroups
spawnSequence maxMonsterCount maxTeammateCount ability params clearPreviousAbility stageAbilities
previewMonsterIds mechanics memoryTurbulence groupBaseMechanic battleWillMechanics cacophony axiomSets
aftertaste bossGuides traits judgmentQuadrant provenance ownerId`;
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
  'provenance',
  'canonicalSource',
  'officialAliases',
  'neutral',
  'view',
  'domains',
  'sourceShards',
  'migration'
]);

export function neutralArtifactProjection(name: string, value: unknown): unknown {
  const domain =
    name.includes('/endgame/') || name.includes('/endgame-occurrences/')
      ? 'endgame'
      : name.includes('/characters')
        ? 'characters'
        : name.includes('/light-cones')
          ? 'lightCones'
          : name.includes('/relic')
            ? 'relics'
            : name.includes('/enemies')
              ? 'enemies'
              : 'auxiliary';
  return project(value, domain, '', neutralFieldsByDomain[domain]);
}

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
