import type { CategorySlug } from '$lib/domain/constants';
import type { RelicSetCategory, RelicSlot } from '$lib/domain/types';
import { m } from '$lib/paraglide/messages.js';

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
