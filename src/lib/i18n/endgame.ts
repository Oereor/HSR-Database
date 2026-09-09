import type { EndgameMode } from '../domain/endgame.js';
import type { EndgamePeriodPresentation } from '../domain/endgame-view.js';
import { m } from '../paraglide/messages.js';
import type { Locale } from '../paraglide/runtime.js';

const copy = {
  moc: (locale?: Locale) => ({
    label: m.endgame_mode_moc({}, locale ? { locale } : undefined),
    shortLabel: m.endgame_mode_moc_short({}, locale ? { locale } : undefined),
    description: m.endgame_mode_moc_description({}, locale ? { locale } : undefined)
  }),
  pf: (locale?: Locale) => ({
    label: m.endgame_mode_pf({}, locale ? { locale } : undefined),
    shortLabel: m.endgame_mode_pf_short({}, locale ? { locale } : undefined),
    description: m.endgame_mode_pf_description({}, locale ? { locale } : undefined)
  }),
  as: (locale?: Locale) => ({
    label: m.endgame_mode_as({}, locale ? { locale } : undefined),
    shortLabel: m.endgame_mode_as_short({}, locale ? { locale } : undefined),
    description: m.endgame_mode_as_description({}, locale ? { locale } : undefined)
  }),
  aa: (locale?: Locale) => ({
    label: m.endgame_mode_aa({}, locale ? { locale } : undefined),
    shortLabel: m.endgame_mode_aa_short({}, locale ? { locale } : undefined),
    description: m.endgame_mode_aa_description({}, locale ? { locale } : undefined)
  })
} satisfies Record<
  EndgameMode,
  (locale?: Locale) => { label: string; shortLabel: string; description: string }
>;

const fallbackLabels = {
  'zh-CN': {
    moc: m.endgame_mode_moc,
    pf: m.endgame_mode_pf,
    as: m.endgame_mode_as,
    aa: m.endgame_mode_aa
  },
  en: {
    moc: m.endgame_mode_moc_short,
    pf: m.endgame_mode_pf_short,
    as: m.endgame_mode_as_short,
    aa: m.endgame_mode_aa_short
  }
} as const;

export const getEndgameModeCopy = (mode: EndgameMode, locale?: Locale) => copy[mode](locale);

export function getEndgamePeriodFallbackName(
  mode: EndgameMode,
  groupId: number,
  locale: Locale
): string {
  const options = { locale } as const;
  const modeLabel = fallbackLabels[locale][mode]({}, options);
  return m.endgame_period_fallback_name({ mode: modeLabel, id: groupId }, options);
}

export function getEndgamePeriodPresentation(locale: Locale): EndgamePeriodPresentation {
  return {
    groupName: (mode, groupId) => getEndgamePeriodFallbackName(mode, groupId, locale)
  };
}
