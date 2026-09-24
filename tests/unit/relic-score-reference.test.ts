import { describe, expect, it } from 'vitest';
import { playerRuntimeData } from '../../api/_player/enka/pipeline';
import { buildRelicScoreReferenceData } from '../../src/lib/relic-score/reference';
import type { PlayerRuntimeData } from '../../src/lib/player/runtime-data';

describe('5-star relic score references', () => {
  it('derives all main and sub references from current runtime data', () => {
    const reference = buildRelicScoreReferenceData(playerRuntimeData);
    expect(reference.mainAt15.BODY.CriticalChanceBase).toBeCloseTo(0.324, 8);
    expect(reference.mainAt15.FOOT.SpeedDelta).toBeCloseTo(25.032, 8);
    expect(reference.subHighRoll.SpeedDelta).toBeCloseTo(2.6, 8);
    expect(Object.keys(reference.subHighRoll)).toHaveLength(12);
    for (const value of [
      ...Object.values(reference.mainAt15).flatMap((slot) => Object.values(slot)),
      ...Object.values(reference.subHighRoll)
    ])
      expect(Number.isFinite(value) && value > 0).toBe(true);
    expect(buildRelicScoreReferenceData(playerRuntimeData)).toEqual(reference);
  });

  it('uses StepNum rather than assuming two grades', () => {
    const runtime = structuredClone(playerRuntimeData) as PlayerRuntimeData;
    const speed = runtime.relicSubAffixes['5:7'];
    expect(speed.propertyType).toBe('SpeedDelta');
    speed.stepNum = 3;
    const reference = buildRelicScoreReferenceData(runtime);
    expect(reference.subHighRoll.SpeedDelta).toBeCloseTo(
      speed.baseValue + 3 * Number(speed.stepValue),
      8
    );
    expect(reference.subHighRoll.SpeedDelta).toBeGreaterThan(2.6);
  });

  it('rejects conflicting 5-star groups and invalid numeric references', () => {
    const conflict = structuredClone(playerRuntimeData) as PlayerRuntimeData;
    const first = Object.values(conflict.relics).find(
      (relic) => relic.rarity === 5 && relic.slot === 3
    )!;
    first.mainAffixGroup = '43';
    expect(() => buildRelicScoreReferenceData(conflict)).toThrow('conflicting groups');

    const invalid = structuredClone(playerRuntimeData) as PlayerRuntimeData;
    invalid.relicSubAffixes['5:7'].stepNum = Number.NaN;
    expect(() => buildRelicScoreReferenceData(invalid)).toThrow('invalid StepNum');
  });
});
