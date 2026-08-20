import { CATEGORY_CONFIG, isCategory } from '$lib/domain/constants';
import { getCatalog } from '$lib/server/generated';
import { getEnemyPortraitMap } from '$lib/server/enemy-assets';
import { error } from '@sveltejs/kit';

export const prerender = true;
export const entries = () => Object.keys(CATEGORY_CONFIG).map((category) => ({ category }));

export async function load({ params }) {
  if (!isCategory(params.category)) error(404, '分类不存在');
  const catalog = await getCatalog(params.category);
  const enemyPortraits =
    params.category === 'enemies'
      ? Object.fromEntries(
          [...(await getEnemyPortraitMap()).entries()]
            .filter(([templateId]) => catalog.some((entry) => entry.id === String(templateId)))
            .map(([templateId, url]) => [String(templateId), url])
        )
      : {};
  return {
    category: params.category,
    config: CATEGORY_CONFIG[params.category],
    entries: catalog,
    enemyPortraits
  };
}
