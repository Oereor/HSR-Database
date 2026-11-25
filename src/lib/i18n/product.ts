import type { CategorySlug } from '$lib/domain/constants';
import type { CharacterEnergy, RelicSetCategory, RelicSlot } from '$lib/domain/types';
import { m } from '$lib/paraglide/messages.js';
import type { Locale } from '$lib/paraglide/runtime.js';

const specialEnergyMessages: Partial<
  Record<
    string,
    { fixed: typeof m.character_energy_acheron } | { dynamic: typeof m.character_energy_castorice }
  >
> = {
  '1308': { fixed: m.character_energy_acheron },
  '1220': { fixed: m.character_energy_feixiao },
  '1407': { dynamic: m.character_energy_castorice },
  '1408': { fixed: m.character_energy_phainon },
  '1415': { fixed: m.character_energy_cyrene },
  '1506': { fixed: m.character_energy_silver_wolf_999 },
  '1511': { fixed: m.character_energy_aha }
};

export function characterSpecialEnergyValue(
  avatarId: string,
  energy: CharacterEnergy,
  locale: Locale
): string | undefined {
  if (energy.kind !== 'special') return undefined;
  const message = specialEnergyMessages[avatarId];
  if (!message) return undefined;
  if ('fixed' in message)
    return energy.max === null ? undefined : message.fixed({ max: energy.max }, { locale });
  return energy.max === null ? message.dynamic({}, { locale }) : undefined;
}

export function categorySingular(category: CategorySlug): string {
  return {
    characters: m.category_character_singular(),
    'light-cones': m.category_light_cone_singular(),
    relics: m.category_relic_singular(),
    enemies: m.category_enemy_singular()
  }[category];
}

export function relicCategoryLabel(category: RelicSetCategory): string {
  return category === 'cavern' ? m.relic_category_cavern() : m.relic_category_planar();
}

export function relicSlotLabel(slot: RelicSlot): string {
  return {
    HEAD: m.relic_slot_head(),
    HAND: m.relic_slot_hand(),
    BODY: m.relic_slot_body(),
    FOOT: m.relic_slot_foot(),
    NECK: m.relic_slot_neck(),
    OBJECT: m.relic_slot_object()
  }[slot];
}
