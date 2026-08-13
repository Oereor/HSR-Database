import { getManifest } from '$lib/server/generated';

export const prerender = true;

export async function GET() {
  const site = (process.env.PUBLIC_SITE_URL || 'http://localhost:5173').replace(/\/$/, '');
  const manifest = await getManifest();
  const urls = [
    '/',
    '/search',
    ...Object.entries(manifest.routes).flatMap(([category, ids]) => [
      `/${category}`,
      ...ids.map((id) => `/${category}/${id}`)
    ])
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${site}${url}</loc></url>`).join('')}</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}
