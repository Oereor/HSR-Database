import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { createEndgameClock } from '../../src/lib/client/endgame-clock';
import type { EndgamePeriodMetadata } from '../../src/lib/domain/endgame-view';

const boundary = Date.parse('2026-10-05T04:00:00+08:00');
const period: EndgamePeriodMetadata = {
  groupId: 3021,
  name: 'Fixture',
  dateLabel: '',
  encounterCount: 0,
  schedule: { begin: '2026-10-05 04:00:00', end: '2026-11-16 04:00:00' }
};

describe('Endgame page clock lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(boundary - 1_000);
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not read browser time or start timers before mount', () => {
    const readPeriods = vi.fn(() => [period]);
    const clock = createEndgameClock(readPeriods);
    expect(get(clock)).toBeUndefined();
    clock.refresh();
    expect(get(clock)).toBeUndefined();
    expect(readPeriods).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('samples on mount and at the exact schedule boundary without a reload', () => {
    const clock = createEndgameClock(() => [period]);
    const stop = clock.mount();
    expect(get(clock)).toBe(boundary - 1_000);
    vi.advanceTimersByTime(999);
    expect(get(clock)).toBe(boundary - 1_000);
    vi.advanceTimersByTime(1);
    expect(get(clock)).toBe(boundary);
    stop();
  });

  it('resamples after navigation and caps long waits to catch clock corrections', () => {
    let periods: EndgamePeriodMetadata[] = [];
    const clock = createEndgameClock(() => periods);
    const stop = clock.mount();
    periods = [period];
    clock.refresh();
    vi.advanceTimersByTime(1_000);
    expect(get(clock)).toBe(boundary);
    vi.advanceTimersByTime(60_000);
    expect(get(clock)).toBe(boundary + 60_000);
    expect(vi.getTimerCount()).toBe(1);
    stop();
  });

  it('recovers on visibility, focus and pageshow and removes all resources', () => {
    const clock = createEndgameClock(() => [period]);
    const stop = clock.mount();
    vi.setSystemTime(boundary);
    Object.assign(document, { visibilityState: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(get(clock)).toBe(boundary - 1_000);
    Object.assign(document, { visibilityState: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(get(clock)).toBe(boundary);
    for (const event of ['focus', 'pageshow']) {
      vi.setSystemTime(Date.now() + 60_000);
      window.dispatchEvent(new Event(event));
      expect(get(clock)).toBe(Date.now());
      expect(vi.getTimerCount()).toBe(1);
    }
    stop();
    expect(get(clock)).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(get(clock)).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
