import { error } from '@sveltejs/kit';
import { getEnhancementComparison, getManifest } from '$lib/server/generated';
import { visibleComparisonText } from '$lib/domain/enhancement-comparison';
import type { EntryGenerator, PageServerLoad } from './$types';

export const prerender = true;

export const entries: EntryGenerator = async () => {
  const manifest = await getManifest();
  return manifest.enhancementComparisonIds.map((id) => ({ id }));
};

export const load: PageServerLoad = async ({ params, locals }) => {
  const manifest = await getManifest();
  if (!manifest.enhancementComparisonIds.includes(params.id)) error(404);
  const comparison = await getEnhancementComparison(locals.locale, params.id);
  return {
    comparison,
    detail: { id: comparison.avatarId, name: visibleComparisonText(comparison.name) }
  };
};
