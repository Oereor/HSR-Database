import { getCatalog } from '$lib/server/generated';

export const prerender = true;

export async function load({ locals }) {
  return {
    characters: await getCatalog(locals.locale, 'characters')
  };
}
