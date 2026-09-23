import type {
  CanonicalPlayerCharacterBuild,
  CanonicalPlayerProfile,
  PlayerSynthesisDiagnostic,
  ResolvedCanonicalPlayerProfile,
  SynthesizedPlayerCharacterBuild
} from './canonical.js';
import type {
  PlayerProfile,
  PlayerRelic,
  PlayerRelicAffix,
  PlayerRelicSubAffix,
  PlayerStat
} from './contract.js';
import {
  PLAYER_PROPERTY_SEMANTICS,
  isPlayerPropertyType,
  type PlayerStatTarget,
  type PropertyContribution,
  type PropertyContributionBucket,
  type PropertyContributionSource
} from './property-semantics.js';
import type {
  PlayerRuntimeAffix,
  PlayerRuntimeData,
  RuntimePropertyValue
} from './runtime-data.js';
import { playerMainAffixValue, playerRuntimeKey, playerSubAffixValue } from './runtime-data.js';

interface StatBuckets {
  base: number;
  ratio: number;
  flat: number;
  direct: number;
}

const DISPLAY_ORDER = [
  'hp',
  'atk',
  'def',
  'spd',
  'crit_rate',
  'crit_dmg',
  'break_dmg',
  'effect_hit',
  'effect_res',
  'sp_rate',
  'heal_rate',
  'elation_dmg',
  'physical_dmg',
  'fire_dmg',
  'ice_dmg',
  'thunder_dmg',
  'wind_dmg',
  'quantum_dmg',
  'imaginary_dmg'
] as const;

const PRIMARY_FIELDS = new Set<string>(DISPLAY_ORDER.slice(0, 6));

function displayNumber(value: number, percent: boolean): string {
  if (!percent) return String(Math.trunc(value + Math.sign(value || 1) * 1e-9));
  const truncated = Math.trunc(value * 1_000 + Math.sign(value || 1) * 1e-9) / 10;
  return `${truncated.toFixed(1)}%`;
}

function visiblePercent(field: string): boolean {
  return !['hp', 'atk', 'def', 'spd'].includes(field);
}

function contribution(
  propertyType: string,
  value: number,
  source: PropertyContributionSource,
  sourceId: string,
  diagnostics: PlayerSynthesisDiagnostic[]
): PropertyContribution | null {
  if (!isPlayerPropertyType(propertyType)) {
    diagnostics.push({ code: 'UNKNOWN_PROPERTY_TYPE', sourceId, propertyType });
    return null;
  }
  return { propertyType, value, source, sourceId };
}

function staticProperties(
  properties: RuntimePropertyValue[],
  source: PropertyContributionSource,
  sourceId: string,
  diagnostics: PlayerSynthesisDiagnostic[]
): PropertyContribution[] {
  return properties.flatMap((property) => {
    const resolved = contribution(
      String(property.propertyType),
      property.value,
      source,
      sourceId,
      diagnostics
    );
    return resolved ? [resolved] : [];
  });
}

function affixContribution(
  affix: PlayerRuntimeAffix,
  value: number,
  source: 'relicMain' | 'relicSub',
  sourceId: string,
  diagnostics: PlayerSynthesisDiagnostic[]
): PropertyContribution[] {
  const resolved = contribution(String(affix.propertyType), value, source, sourceId, diagnostics);
  return resolved ? [resolved] : [];
}

export function collectPropertyContributions(
  build: CanonicalPlayerCharacterBuild,
  runtime: PlayerRuntimeData
): { contributions: PropertyContribution[]; diagnostics: PlayerSynthesisDiagnostic[] } {
  const diagnostics: PlayerSynthesisDiagnostic[] = [];
  const contributions: PropertyContribution[] = [];
  const avatar = runtime.avatarPromotions[build.avatarId]?.[String(build.promotion)];
  if (!avatar) diagnostics.push({ code: 'UNKNOWN_AVATAR', sourceId: build.avatarId });
  else {
    const offset = build.level - 1;
    for (const [type, value] of [
      ['BaseHP', avatar.hpBase + avatar.hpAdd * offset],
      ['BaseAttack', avatar.attackBase + avatar.attackAdd * offset],
      ['BaseDefence', avatar.defenceBase + avatar.defenceAdd * offset],
      ['BaseSpeed', avatar.speedBase ?? 0],
      ['CriticalChanceBase', avatar.criticalChance ?? 0],
      ['CriticalDamageBase', avatar.criticalDamage ?? 0]
    ] as const) {
      const resolved = contribution(type, value, 'avatar', build.avatarId, diagnostics);
      if (resolved) contributions.push(resolved);
    }
  }

  if (build.lightCone) {
    const lightCone = build.lightCone;
    const progression =
      runtime.lightConePromotions[lightCone.lightConeId]?.[String(lightCone.promotion)];
    const abilities =
      runtime.lightConeAbilities[lightCone.lightConeId]?.[String(lightCone.superimposition)];
    if (!progression || !abilities)
      diagnostics.push({ code: 'UNKNOWN_LIGHT_CONE', sourceId: lightCone.lightConeId });
    else {
      const offset = lightCone.level - 1;
      for (const [type, value] of [
        ['BaseHP', progression.hpBase + progression.hpAdd * offset],
        ['BaseAttack', progression.attackBase + progression.attackAdd * offset],
        ['BaseDefence', progression.defenceBase + progression.defenceAdd * offset]
      ] as const) {
        const resolved = contribution(type, value, 'lightCone', lightCone.lightConeId, diagnostics);
        if (resolved) contributions.push(resolved);
      }
      contributions.push(
        ...staticProperties(abilities, 'lightConeAbility', lightCone.lightConeId, diagnostics)
      );
    }
  }

  const setCounts = new Map<string, number>();
  for (const relic of build.relics) {
    const identity = runtime.relics[relic.tid];
    if (!identity) {
      diagnostics.push({ code: 'UNKNOWN_RELIC', sourceId: relic.tid });
      continue;
    }
    setCounts.set(identity.setId, (setCounts.get(identity.setId) ?? 0) + 1);
    const main =
      runtime.relicMainAffixes[playerRuntimeKey(identity.mainAffixGroup, relic.mainAffixId)];
    if (!main)
      diagnostics.push({
        code: 'UNKNOWN_AFFIX',
        sourceId: `${relic.tid}:main:${relic.mainAffixId}`
      });
    else
      contributions.push(
        ...affixContribution(
          main,
          playerMainAffixValue(main, relic.level),
          'relicMain',
          `${relic.tid}:${relic.mainAffixId}`,
          diagnostics
        )
      );
    for (const sub of relic.subAffixes) {
      const affix = runtime.relicSubAffixes[playerRuntimeKey(identity.subAffixGroup, sub.affixId)];
      if (!affix) {
        diagnostics.push({
          code: 'UNKNOWN_AFFIX',
          sourceId: `${relic.tid}:sub:${sub.affixId}`
        });
        continue;
      }
      contributions.push(
        ...affixContribution(
          affix,
          playerSubAffixValue(affix, sub.cnt, sub.step ?? 0),
          'relicSub',
          `${relic.tid}:${sub.affixId}`,
          diagnostics
        )
      );
    }
  }

  for (const [setId, count] of setCounts)
    for (const effect of runtime.relicSets[setId] ?? [])
      if (count >= effect.required)
        contributions.push(
          ...staticProperties(
            effect.properties,
            'relicSet',
            `${setId}:${effect.required}`,
            diagnostics
          )
        );

  for (const trace of build.traces) {
    if (trace.rawLevel <= 0) continue;
    const resolved = runtime.traces[trace.pointId];
    if (!resolved) {
      diagnostics.push({ code: 'UNKNOWN_TRACE', sourceId: trace.pointId });
      continue;
    }
    if (resolved.pointType === 1)
      contributions.push(
        ...staticProperties(resolved.properties, 'trace', trace.pointId, diagnostics)
      );
  }
  return { contributions, diagnostics };
}

export function aggregatePropertyContributions(
  contributions: PropertyContribution[]
): Partial<Record<PlayerStatTarget, StatBuckets>> {
  const result: Partial<Record<PlayerStatTarget, StatBuckets>> = {};
  for (const item of contributions) {
    const semantic = PLAYER_PROPERTY_SEMANTICS[item.propertyType];
    const buckets = (result[semantic.target] ??= { base: 0, ratio: 0, flat: 0, direct: 0 });
    buckets[semantic.bucket as PropertyContributionBucket] += item.value;
  }
  return result;
}

export function finalizePlayerStats(buckets: Partial<Record<PlayerStatTarget, StatBuckets>>): {
  stats: PlayerStat[];
  values: Partial<Record<string, number>>;
} {
  const values: Partial<Record<string, number>> = {};
  for (const [target, value] of Object.entries(buckets) as Array<[PlayerStatTarget, StatBuckets]>)
    values[target] = ['hp', 'atk', 'def', 'spd'].includes(target)
      ? value.base * (1 + value.ratio) + value.flat + value.direct
      : value.direct + value.base + value.flat;
  const stats = DISPLAY_ORDER.flatMap((field) => {
    const value = values[field];
    if (value === undefined || (!PRIMARY_FIELDS.has(field) && value === 0)) return [];
    const percent = visiblePercent(field);
    return [{ field, percent, total: displayNumber(value, percent) } satisfies PlayerStat];
  });
  return { stats, values };
}

export function synthesizePlayerCharacter(
  build: CanonicalPlayerCharacterBuild,
  runtime: PlayerRuntimeData
): SynthesizedPlayerCharacterBuild {
  const collected = collectPropertyContributions(build, runtime);
  const failed = collected.diagnostics.length > 0;
  const finalized = failed
    ? { stats: [] as PlayerStat[], values: {} as Partial<Record<string, number>> }
    : finalizePlayerStats(aggregatePropertyContributions(collected.contributions));
  return {
    build,
    status: failed ? 'failed' : 'complete',
    stats: finalized.stats,
    values: finalized.values,
    diagnostics: collected.diagnostics
  };
}

export function synthesizePlayerProfile(
  profile: CanonicalPlayerProfile,
  runtime: PlayerRuntimeData
): ResolvedCanonicalPlayerProfile {
  return {
    profile,
    characters: profile.characters.map((build) => synthesizePlayerCharacter(build, runtime))
  };
}

function resolvedAffix(affix: PlayerRuntimeAffix, value: number): PlayerRelicAffix {
  const percent = PLAYER_PROPERTY_SEMANTICS[affix.propertyType].percent;
  return {
    type: affix.propertyType,
    display: displayNumber(value, percent),
    percent
  };
}

function resolvedSubAffix(
  affix: PlayerRuntimeAffix,
  value: number,
  count: number
): PlayerRelicSubAffix {
  return { ...resolvedAffix(affix, value), count };
}

function presentRelic(
  relic: CanonicalPlayerCharacterBuild['relics'][number],
  runtime: PlayerRuntimeData
): PlayerRelic {
  const identity = runtime.relics[relic.tid];
  if (!identity)
    return { type: relic.type, setId: '', level: relic.level, mainAffix: null, subAffixes: [] };
  const main =
    runtime.relicMainAffixes[playerRuntimeKey(identity.mainAffixGroup, relic.mainAffixId)];
  return {
    type: relic.type,
    setId: identity.setId,
    level: relic.level,
    mainAffix: main ? resolvedAffix(main, playerMainAffixValue(main, relic.level)) : null,
    subAffixes: relic.subAffixes.flatMap((sub) => {
      const affix = runtime.relicSubAffixes[playerRuntimeKey(identity.subAffixGroup, sub.affixId)];
      return affix
        ? [resolvedSubAffix(affix, playerSubAffixValue(affix, sub.cnt, sub.step ?? 0), sub.cnt)]
        : [];
    })
  };
}

function effectiveTraceLevel(
  build: CanonicalPlayerCharacterBuild,
  trace: CanonicalPlayerCharacterBuild['traces'][number],
  runtime: PlayerRuntimeData
): number {
  const skillIds = new Set(runtime.traces[trace.pointId]?.skillIds ?? []);
  let bonus = 0;
  for (let rank = 1; rank <= build.eidolon; rank += 1) {
    const matching = (runtime.eidolonSkillLevels[build.avatarId]?.[String(rank)] ?? [])
      .filter((entry) => skillIds.has(entry.skillId))
      .map((entry) => entry.levelDelta);
    bonus += matching.length ? Math.max(...matching) : 0;
  }
  return trace.rawLevel + bonus;
}

export function presentCanonicalPlayerProfile(
  resolved: ResolvedCanonicalPlayerProfile,
  runtime: PlayerRuntimeData
): PlayerProfile {
  const profile = resolved.profile;
  return {
    uid: profile.uid,
    nickname: profile.nickname,
    level: profile.level,
    worldLevel: profile.worldLevel,
    avatar: profile.headIconId
      ? {
          id: profile.headIconId,
          icon: `/generated-assets/player-avatars/${profile.headIconId}.png`
        }
      : null,
    signature: profile.signature ?? '',
    characterCount: profile.records?.avatarCount ?? null,
    lightConeCount: profile.records?.equipmentCount ?? null,
    achievementCount: profile.records?.achievementCount ?? null,
    characters: resolved.characters.map(({ build, stats }) => ({
      buildId: build.buildId,
      characterId: build.avatarId,
      display: build.display,
      progression: {
        rank: build.eidolon,
        level: build.level,
        promotion: build.promotion,
        enhanced: build.enhancedId !== undefined
      },
      skillTree: build.traces.map((trace) => ({
        id: trace.pointId,
        level: effectiveTraceLevel(build, trace, runtime)
      })),
      lightCone: build.lightCone
        ? {
            lightConeId: build.lightCone.lightConeId,
            rank: build.lightCone.superimposition,
            level: build.lightCone.level,
            promotion: build.lightCone.promotion
          }
        : null,
      relics: build.relics.map((relic) => presentRelic(relic, runtime)),
      stats
    }))
  };
}
