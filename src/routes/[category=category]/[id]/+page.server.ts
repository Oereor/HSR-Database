import { CATEGORY_CONFIG, isCategory } from '$lib/domain/constants';
import { getDetail, getManifest } from '$lib/server/generated';
import { error } from '@sveltejs/kit';

export const prerender = true;
export async function entries() {
  const manifest = await getManifest();
  return Object.entries(manifest.routes).flatMap(([category, ids]) =>
    ids.map((id) => ({ category, id }))
  );
}

export async function load({ params }) {
  if (!isCategory(params.category)) error(404, '分类不存在');
  try {
    return {
      category: params.category,
      config: CATEGORY_CONFIG[params.category],
      detail: await getDetail(params.category, params.id)
    };
  } catch {
    error(404, '没有找到这条数据');
  }
}
