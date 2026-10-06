import { writable } from 'svelte/store';
import { parseEndgameSchedule, type EndgamePeriodMetadata } from '../domain/endgame-view';

/** Page-local clock: preserve the SSG snapshot until hydration has completed. */
export function createEndgameClock(readPeriods: () => readonly EndgamePeriodMetadata[]) {
  const { subscribe, set } = writable<number | undefined>(undefined);
  let active = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function refresh() {
    if (!active) return;
    clearTimeout(timer);
    const now = Date.now();
    set(now);
    // The cap also catches wall-clock corrections and throttled background timers.
    let delay = 60_000;
    for (const { schedule } of readPeriods()) {
      if (!schedule) continue;
      for (const value of [schedule.begin, schedule.end]) {
        const remaining = parseEndgameSchedule(value) - now;
        if (remaining > 0) delay = Math.min(delay, remaining);
      }
    }
    timer = setTimeout(refresh, delay);
  }

  function visible() {
    if (document.visibilityState === 'visible') refresh();
  }

  function mount() {
    active = true;
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', visible);
    refresh();
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', visible);
      set(undefined);
    };
  }

  return { subscribe, mount, refresh };
}
