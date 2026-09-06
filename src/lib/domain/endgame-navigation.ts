import type {
  AnomalyArbitrationEncounterView,
  ApocalypticShadowEncounterView,
  MocEncounterView,
  PureFictionEncounterView
} from './endgame-view';
import { m } from '$lib/paraglide/messages.js';

export interface EndgameLocalNavigationItem {
  id: string;
  label: string;
  href: string;
  current: boolean;
  title?: string;
}

export interface EndgameLocalNavigationSection {
  label: string;
  items: EndgameLocalNavigationItem[];
}

export interface EndgameLocalNavigationModel {
  ariaLabel: string;
  menuLabel: string;
  currentLabel: string;
  sections: EndgameLocalNavigationSection[];
}

function encounterHref(id: string): string {
  return `?encounter=${encodeURIComponent(id)}`;
}

function currentItem(
  sections: EndgameLocalNavigationSection[],
  selectedId: string
): EndgameLocalNavigationItem | undefined {
  return sections.flatMap((section) => section.items).find((item) => item.id === selectedId);
}

export function buildMocLocalNavigation(
  encounters: MocEncounterView[],
  selectedId: string
): EndgameLocalNavigationModel {
  const sections = [
    {
      label: m.endgame_local_stage_section(),
      items: encounters.map((encounter) => ({
        id: encounter.id,
        label: String(encounter.ordinal ?? encounter.id).padStart(2, '0'),
        href: encounterHref(encounter.id),
        current: encounter.id === selectedId,
        title: encounter.label
      }))
    }
  ];
  const selected = currentItem(sections, selectedId);
  return {
    ariaLabel: m.endgame_local_moc_aria(),
    menuLabel: m.endgame_local_stage_select(),
    currentLabel: selected
      ? m.endgame_local_stage_current({ label: selected.label })
      : m.endgame_local_stage_select(),
    sections
  };
}

function buildDifficultyLocalNavigation(
  encounters: Array<PureFictionEncounterView | ApocalypticShadowEncounterView>,
  selectedId: string,
  ariaLabel: string
): EndgameLocalNavigationModel {
  const sections = [
    {
      label: m.endgame_local_difficulty_section(),
      items: encounters.map((encounter) => ({
        id: encounter.id,
        label: m.endgame_local_difficulty_label({ number: encounter.ordinal ?? encounter.id }),
        href: encounterHref(encounter.id),
        current: encounter.id === selectedId,
        title: encounter.label
      }))
    }
  ];
  return {
    ariaLabel,
    menuLabel: m.endgame_local_difficulty_select(),
    currentLabel: currentItem(sections, selectedId)?.label ?? m.endgame_local_difficulty_select(),
    sections
  };
}

export function buildPureFictionLocalNavigation(
  encounters: PureFictionEncounterView[],
  selectedId: string
): EndgameLocalNavigationModel {
  return buildDifficultyLocalNavigation(encounters, selectedId, m.endgame_local_pf_aria());
}

export function buildApocalypticShadowLocalNavigation(
  encounters: ApocalypticShadowEncounterView[],
  selectedId: string
): EndgameLocalNavigationModel {
  return buildDifficultyLocalNavigation(encounters, selectedId, m.endgame_local_as_aria());
}

export function buildAnomalyArbitrationLocalNavigation(
  encounters: AnomalyArbitrationEncounterView[],
  selectedId: string
): EndgameLocalNavigationModel {
  const sections = [
    {
      label: m.endgame_local_knights(),
      items: encounters
        .filter((encounter) => encounter.variant === 'preliminary')
        .map((encounter) => ({
          id: encounter.id,
          label: encounter.label,
          href: encounterHref(encounter.id),
          current: encounter.id === selectedId
        }))
    },
    {
      label: m.endgame_local_king_pieces(),
      items: encounters
        .filter((encounter) => encounter.variant !== 'preliminary')
        .map((encounter) => ({
          id: encounter.id,
          label: encounter.label,
          href: encounterHref(encounter.id),
          current: encounter.id === selectedId
        }))
    }
  ];
  return {
    ariaLabel: m.endgame_local_aa_aria(),
    menuLabel: m.endgame_local_chess_node_select(),
    currentLabel: currentItem(sections, selectedId)?.label ?? m.endgame_local_chess_node_select(),
    sections
  };
}
