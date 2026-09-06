import type { EndgameMode } from '$lib/domain/endgame';
import { m } from '$lib/paraglide/messages.js';

const copy = {
  moc: () => ({
    label: m.endgame_mode_moc(),
    shortLabel: m.endgame_mode_moc_short(),
    description: m.endgame_mode_moc_description()
  }),
  pf: () => ({
    label: m.endgame_mode_pf(),
    shortLabel: m.endgame_mode_pf_short(),
    description: m.endgame_mode_pf_description()
  }),
  as: () => ({
    label: m.endgame_mode_as(),
    shortLabel: m.endgame_mode_as_short(),
    description: m.endgame_mode_as_description()
  }),
  aa: () => ({
    label: m.endgame_mode_aa(),
    shortLabel: m.endgame_mode_aa_short(),
    description: m.endgame_mode_aa_description()
  })
} satisfies Record<EndgameMode, () => { label: string; shortLabel: string; description: string }>;

export const getEndgameModeCopy = (mode: EndgameMode) => copy[mode]();
