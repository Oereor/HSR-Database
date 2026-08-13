import { CATEGORY_CONFIG, isCategory } from '$lib/domain/constants';
import { getCatalog } from '$lib/server/generated';
import { error } from '@sveltejs/kit';

export const prerender = true;
export const entries = () => Object.keys(CATEGORY_CONFIG).map((category) => ({ category }));

export async function load({ params }) {
  if (!isCategory(params.category)) error(404, '分类不存在');
  return {
    category: params.category,
    config: CATEGORY_CONFIG[params.category],
    entries: await getCatalog(params.category)
  };
}
