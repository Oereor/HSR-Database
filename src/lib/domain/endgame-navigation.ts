import type {
  AnomalyArbitrationEncounterView,
  ApocalypticShadowEncounterView,
  MocEncounterView,
  PureFictionEncounterView
} from './endgame-view';

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
      label: '关卡',
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
    ariaLabel: '选择混沌回忆关卡',
    menuLabel: '选择关卡',
    currentLabel: selected ? `关卡 ${selected.label}` : '选择关卡',
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
      label: '难度',
      items: encounters.map((encounter) => ({
        id: encounter.id,
        label: `难度 ${encounter.ordinal ?? encounter.id}`,
        href: encounterHref(encounter.id),
        current: encounter.id === selectedId,
        title: encounter.label
      }))
    }
  ];
  return {
    ariaLabel,
    menuLabel: '选择难度',
    currentLabel: currentItem(sections, selectedId)?.label ?? '选择难度',
    sections
  };
}

export function buildPureFictionLocalNavigation(
  encounters: PureFictionEncounterView[],
  selectedId: string
): EndgameLocalNavigationModel {
  return buildDifficultyLocalNavigation(encounters, selectedId, '选择虚构叙事难度');
}

export function buildApocalypticShadowLocalNavigation(
  encounters: ApocalypticShadowEncounterView[],
  selectedId: string
): EndgameLocalNavigationModel {
  return buildDifficultyLocalNavigation(encounters, selectedId, '选择末日幻影难度');
}

export function buildAnomalyArbitrationLocalNavigation(
  encounters: AnomalyArbitrationEncounterView[],
  selectedId: string
): EndgameLocalNavigationModel {
  const sections = [
    {
      label: '骑士',
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
      label: '王棋',
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
    ariaLabel: '选择异相仲裁节点',
    menuLabel: '选择棋局节点',
    currentLabel: currentItem(sections, selectedId)?.label ?? '选择棋局节点',
    sections
  };
}
