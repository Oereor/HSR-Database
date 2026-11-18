import { CATEGORY_CONFIG, isCategory } from '$lib/domain/constants';
import {
  getCatalog,
  getCharacterTeamRecommendations,
  getDetail,
  getManifest,
  getRelicCatalog,
  getRelicProperties
} from '$lib/server/generated';
import { getEnemyDetail } from '$lib/server/enemies';
import { resolveEquipmentRecommendation } from '$lib/domain/equipment-recommendation-view';
import type { CatalogEntry, Character } from '$lib/domain/types';
import { error } from '@sveltejs/kit';
import { withTrailblazerGender } from '$lib/domain/trailblazer';
import { teamRecommendationPageData } from '$lib/domain/team-recommendation';

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
    const characterResources =
      params.category === 'characters'
        ? await resolveCharacterResources(locals.locale, detail as unknown as Character)
        : undefined;
    return {
      category: params.category,
      config: CATEGORY_CONFIG[params.category],
      detail,
      specialEffectTargets: characterResources?.specialEffectTargets ?? [],
      equipmentRecommendation: characterResources?.equipmentRecommendation,
      teamRecommendations: characterResources?.teamRecommendations,
      relicProperties: characterResources?.relicProperties ?? []
    };
  } catch {
    error(404, '没有找到这条数据');
  }
}

async function resolveCharacterResources(locale: App.Locals['locale'], character: Character) {
  const [characters, teams, lightCones, relicSets, relicProperties] = await Promise.all([
    getCatalog(locale, 'characters'),
    getCharacterTeamRecommendations(),
    getCatalog(locale, 'light-cones'),
    getRelicCatalog(locale),
    getRelicProperties(locale)
  ]);
  return {
    specialEffectTargets: resolveSpecialEffectTargets(characters, character.profiles),
    teamRecommendations: teamRecommendationPageData(teams, character.id, characters),
    relicProperties,
    equipmentRecommendation: resolveEquipmentRecommendation(
      character.equipmentRecommendation,
      lightCones,
      relicSets,
      relicProperties
    )
  };
}

function resolveSpecialEffectTargets(catalog: CatalogEntry[], profiles: Character['profiles']) {
  const ids = new Set<string>();
  for (const profile of Object.values(profiles)) {
    for (const entry of profile?.specialEffects ?? []) {
      if (entry.kind === 'servant-skill-link' || entry.kind === 'series-skill-link')
        ids.add(entry.linkedAvatarId);
      else for (const id of entry.linkedAvatarIds) ids.add(id);
    }
  }
  if (!ids.size) return [];
  for (const id of [...ids]) {
    ids.add(withTrailblazerGender(id, 'female'));
    ids.add(withTrailblazerGender(id, 'male'));
  }
  return catalog.filter((entry) => ids.has(entry.id));
}
