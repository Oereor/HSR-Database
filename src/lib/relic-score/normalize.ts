import type { RelicSlot } from '../domain/types.js';
import type { CanonicalPlayerRelic, SynthesizedPlayerCharacterBuild } from '../player/canonical.js';
import { PLAYER_PROPERTY_SEMANTICS, type PlayerStatTarget } from '../player/property-semantics.js';
import {
  playerMainAffixValue,
  playerRuntimeKey,
  playerSubAffixValue,
  type PlayerRuntimeData
} from '../player/runtime-data.js';
import { relicSlotFromNumber } from './reference.js';
import { relicStatSemantics, isRelicStatKey } from './stat-registry.js';
import type {
  NormalizedRelicPiece,
  NormalizationReason,
  PlayerBuildNormalization,
  PlayerBuildInput
} from './types.js';

const EXPECTED_SLOTS = ['HEAD', 'HAND', 'BODY', 'FOOT', 'NECK', 'OBJECT'] as const;
const PANEL_TARGETS = new Set<PlayerStatTarget>(
  Object.values(PLAYER_PROPERTY_SEMANTICS).map(({ target }) => target)
);
type Failure = Extract<PlayerBuildNormalization, { status: 'unavailable' | 'invalid' }>;
type PieceNormalization = { status: 'valid'; piece: NormalizedRelicPiece } | Failure;

function fail(status: Failure['status'], reason: NormalizationReason, detail?: string): Failure {
  return { status, reason, ...(detail ? { detail } : {}) };
}

function normalizePiece(
  relic: CanonicalPlayerRelic,
  runtime: PlayerRuntimeData
): PieceNormalization {
  const identity = runtime.relics[relic.tid];
  if (!identity) return fail('unavailable', 'UNKNOWN_RELIC', relic.tid);
  const slot = relicSlotFromNumber(relic.type);
  if (!slot || identity.slot !== relic.type) return fail('invalid', 'SLOT_MISMATCH', relic.tid);
  if (!Number.isSafeInteger(identity.rarity) || !Number.isSafeInteger(identity.maxLevel))
    return fail('unavailable', 'UNKNOWN_RARITY', relic.tid);
  if (!Number.isSafeInteger(relic.level) || relic.level < 0 || relic.level > identity.maxLevel!)
    return fail('invalid', 'INVALID_LEVEL', relic.tid);
  const main =
    runtime.relicMainAffixes[playerRuntimeKey(identity.mainAffixGroup, relic.mainAffixId)];
  if (!main) return fail('unavailable', 'UNKNOWN_AFFIX', `${relic.tid}:main`);
  if (
    !isRelicStatKey(main.propertyType) ||
    !relicStatSemantics(main.propertyType).mainSlots.includes(slot)
  )
    return fail('invalid', 'INVALID_MAIN_STAT', relic.tid);
  const mainValue = playerMainAffixValue(main, relic.level);
  if (!Number.isFinite(mainValue) || mainValue <= 0)
    return fail('unavailable', 'NONFINITE_VALUE', `${relic.tid}:main`);
  const seenStats = new Set<string>();
  const substats: NormalizedRelicPiece['substats'] = [];
  for (const sub of relic.subAffixes) {
    const affix = runtime.relicSubAffixes[playerRuntimeKey(identity.subAffixGroup, sub.affixId)];
    if (!affix) return fail('unavailable', 'UNKNOWN_AFFIX', `${relic.tid}:sub:${sub.affixId}`);
    if (!isRelicStatKey(affix.propertyType) || !relicStatSemantics(affix.propertyType).canBeSubstat)
      return fail('invalid', 'INVALID_SUBSTAT', relic.tid);
    if (affix.propertyType === main.propertyType)
      return fail('invalid', 'MAIN_SUB_CONFLICT', relic.tid);
    if (seenStats.has(affix.propertyType)) return fail('invalid', 'DUPLICATE_SUBSTAT', relic.tid);
    seenStats.add(affix.propertyType);
    if (!Number.isSafeInteger(sub.cnt) || sub.cnt < 1)
      return fail('invalid', 'INVALID_ROLL_COUNT', relic.tid);
    const step = sub.step ?? 0;
    if (!Number.isSafeInteger(step) || step < 0) return fail('invalid', 'INVALID_STEP', relic.tid);
    const value = playerSubAffixValue(affix, sub.cnt, step);
    if (!Number.isFinite(value) || value <= 0)
      return fail('unavailable', 'NONFINITE_VALUE', `${relic.tid}:sub:${sub.affixId}`);
    substats.push({
      key: affix.propertyType,
      value,
      occurrenceCount: sub.cnt,
      cumulativeStep: step,
      rollCount: { status: 'exact', count: sub.cnt, source: 'provider' }
    });
  }
  return {
    status: 'valid',
    piece: {
      slot,
      relicId: relic.tid,
      setId: identity.setId,
      rarity: identity.rarity!,
      level: relic.level,
      mainStat: { key: main.propertyType, value: mainValue },
      substats
    }
  };
}

export function normalizePlayerBuildInput(
  synthesized: SynthesizedPlayerCharacterBuild,
  runtime: PlayerRuntimeData
): PlayerBuildNormalization {
  const { build, values, diagnostics } = synthesized;
  let buildFailure: Failure | undefined;
  if (synthesized.status !== 'complete') {
    const diagnostic = diagnostics[0];
    const reason =
      diagnostic?.code === 'UNKNOWN_RELIC'
        ? 'UNKNOWN_RELIC'
        : diagnostic?.code === 'UNKNOWN_AFFIX'
          ? 'UNKNOWN_AFFIX'
          : 'SYNTHESIS_FAILED';
    buildFailure = fail('unavailable', reason, diagnostic?.sourceId);
  }
  const panel: PlayerBuildInput['panel'] = {};
  if (synthesized.status === 'complete') {
    for (const [target, value] of Object.entries(values)) {
      if (!PANEL_TARGETS.has(target as PlayerStatTarget) || !Number.isFinite(value)) {
        buildFailure ??= fail('unavailable', 'NONFINITE_VALUE', target);
        continue;
      }
      panel[target as PlayerStatTarget] = value;
    }
    for (const target of ['hp', 'atk', 'def', 'spd', 'crit_rate', 'crit_dmg'] as const)
      if (panel[target] === undefined)
        buildFailure ??= fail('unavailable', 'MISSING_PANEL_STAT', target);
  }

  const seenSlots = new Set<RelicSlot>();
  const normalized: NormalizedRelicPiece[] = [];
  const pieceFailures: NonNullable<Failure['pieceFailures']> = {};
  for (const relic of build.relics) {
    const slot = relicSlotFromNumber(relic.type);
    if (slot && seenSlots.has(slot)) {
      const failure = fail('invalid', 'DUPLICATE_SLOT', slot);
      buildFailure ??= failure;
      pieceFailures[slot] = { status: failure.status, reason: failure.reason };
      continue;
    }
    if (slot) seenSlots.add(slot);
    const result = normalizePiece(relic, runtime);
    if (result.status === 'valid') normalized.push(result.piece);
    else {
      buildFailure ??= result;
      if (slot) pieceFailures[slot] = { status: result.status, reason: result.reason };
    }
  }
  if (EXPECTED_SLOTS.some((slot) => !seenSlots.has(slot)))
    buildFailure ??= fail('unavailable', 'MISSING_SLOT');
  normalized.sort(
    (left, right) => EXPECTED_SLOTS.indexOf(left.slot) - EXPECTED_SLOTS.indexOf(right.slot)
  );
  const input: PlayerBuildInput = { characterId: build.avatarId, panel, relics: normalized };
  return buildFailure
    ? {
        ...buildFailure,
        partialInput: input,
        ...(Object.keys(pieceFailures).length ? { pieceFailures } : {})
      }
    : { status: 'valid', input };
}
