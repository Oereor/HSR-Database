import { CATEGORY_CONFIG, isCategory } from '$lib/domain/constants';
import {
  getCatalog,
  getDetail,
  getManifest,
  getRelicCatalog,
  getRelicProperties
} from '$lib/server/generated';
import { getEnemyDetail } from '$lib/server/enemies';
import { resolveEquipmentRecommendation } from '$lib/domain/equipment-recommendation-view';
import type { Character, CharacterSpecialEffectEntry } from '$lib/domain/types';
import { error } from '@sveltejs/kit';

export const prerender = true;
export async function entries() {
  const manifest = await getManifest();
  return Object.entries(manifest.routes).flatMap(([category, ids]) =>
    ids.map((id) => ({ category, id }))
  );
}

export async function load({ params, locals }) {
  if (!isCategory(params.category)) error(404, '分类不存在');
  try {
    const detail =
      params.category === 'enemies'
        ? await getEnemyDetail(locals.locale, params.id)
        : await getDetail(locals.locale, params.category, params.id);
    const specialEffectTargets =
      params.category === 'characters'
        ? await resolveSpecialEffectTargets(locals.locale, detail as Record<string, unknown>)
        : [];
    const equipmentRecommendation =
      params.category === 'characters'
        ? await resolveCharacterEquipmentRecommendation(
            locals.locale,
            detail as unknown as Character
          )
        : undefined;
    return {
      category: params.category,
      config: CATEGORY_CONFIG[params.category],
      detail,
      specialEffectTargets,
      equipmentRecommendation
    };
  } catch {
    error(404, '没有找到这条数据');
  }
}

async function resolveCharacterEquipmentRecommendation(
  locale: App.Locals['locale'],
  character: Character
) {
  const [lightCones, relicSets, relicProperties] = await Promise.all([
    getCatalog(locale, 'light-cones'),
    getRelicCatalog(locale),
    getRelicProperties(locale)
  ]);
  return resolveEquipmentRecommendation(
    character.equipmentRecommendation,
    lightCones,
    relicSets,
    relicProperties
  );
}

async function resolveSpecialEffectTargets(
  locale: App.Locals['locale'],
  detail: Record<string, unknown>
) {
  const profiles = detail.profiles as
    Record<string, { specialEffects?: CharacterSpecialEffectEntry[] } | undefined> | undefined;
  const ids = new Set<string>();
  for (const profile of Object.values(profiles ?? {})) {
    for (const entry of profile?.specialEffects ?? []) {
      if (entry.kind === 'servant-skill-link') ids.add(entry.linkedAvatarId);
      else for (const id of entry.linkedAvatarIds) ids.add(id);
    }
  }
  if (!ids.size) return [];
  return (await getCatalog(locale, 'characters')).filter((entry) => ids.has(entry.id));
}
