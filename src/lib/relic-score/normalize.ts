import type { CanonicalPlayerRelic } from '../player/canonical.js';
import { playerMainAffixValue, playerSubAffixValue } from '../player/runtime-data.js';
import { playerRuntimeKey, type PlayerRuntimeData } from '../player/runtime-data.js';
import { isRelicStatKey, relicStatSemantics } from './stat-registry.js';
import { relicSlotFromNumber } from './reference.js';
import type { NormalizationReason, NormalizedRelicPiece } from './types.js';

type Failure = { status: 'unavailable' | 'invalid'; reason: NormalizationReason; detail?: string };
type PieceNormalization = { status: 'valid'; piece: NormalizedRelicPiece } | Failure;
function fail(status: Failure['status'], reason: NormalizationReason, detail?: string): Failure {
  return { status, reason, ...(detail ? { detail } : {}) };
}
export function normalizePiece(
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
