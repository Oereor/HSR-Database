import { getManifest } from '$lib/server/generated';

export const prerender = true;

export async function load() {
  return {
    manifest: await getManifest(),
    siteUrl: process.env.PUBLIC_SITE_URL || 'http://localhost:5173'
  };
}
