import { getContext, setContext } from 'svelte';
import { readable, readonly, writable } from 'svelte/store';
import {
  DEFAULT_TRAILBLAZER_GENDER,
  isTrailblazerGender,
  type TrailblazerGender
} from '../domain/trailblazer.js';

const key = Symbol('trailblazer preference');
export const TRAILBLAZER_GENDER_STORAGE_KEY = 'hsrarchive:trailblazer-gender';

export function provideTrailblazerPreference() {
  const state = writable({ gender: DEFAULT_TRAILBLAZER_GENDER, ready: false });
  return setContext(key, {
    state: readonly(state),
    mount() {
      let gender: TrailblazerGender = DEFAULT_TRAILBLAZER_GENDER;
      try {
        const stored = localStorage.getItem(TRAILBLAZER_GENDER_STORAGE_KEY);
        if (isTrailblazerGender(stored)) gender = stored;
      } catch {
        // The default is valid even when storage is blocked.
      }
      state.set({ gender, ready: true });
    },
    select(value: string) {
      if (!isTrailblazerGender(value)) return;
      state.set({ gender: value, ready: true });
      try {
        localStorage.setItem(TRAILBLAZER_GENDER_STORAGE_KEY, value);
      } catch {
        // Keep the current session selection.
      }
    }
  });
}

export function useTrailblazerPreference() {
  return (
    getContext<ReturnType<typeof provideTrailblazerPreference>>(key) ?? {
      state: readable({ gender: DEFAULT_TRAILBLAZER_GENDER, ready: false }),
      select: () => {}
    }
  );
}
