import { getPublicSiteVersion } from '$lib/server/generated';

export const prerender = true;

export async function load({ locals }) {
  return {
    locale: locals.locale,
    siteVersion: await getPublicSiteVersion(),
    siteUrl: process.env.PUBLIC_SITE_URL || 'http://localhost:5173'
  };
}
