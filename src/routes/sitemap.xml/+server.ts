import { getManifest } from '$lib/server/generated';
import { localizedHref } from '$lib/i18n/routing';

export const prerender = true;

export async function GET() {
  const site = (process.env.PUBLIC_SITE_URL || 'http://localhost:5173').replace(/\/$/, '');
  const manifest = await getManifest();
  const routes = manifest.routePaths;
  const escapeXml = (value: string) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  const entries = manifest.publicLocales
    .flatMap((locale) =>
      routes.map((route) => {
        const alternates = manifest.publicLocales
          .map(
            (alternate) =>
              `<xhtml:link rel="alternate" hreflang="${alternate === 'zh-CN' ? 'zh-CN' : 'en'}" href="${escapeXml(site + localizedHref(route, alternate))}" />`
          )
          .join('');
        return `<url><loc>${escapeXml(site + localizedHref(route, locale))}</loc>${alternates}<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(site + localizedHref(route, 'zh-CN'))}" /></url>`;
      })
    )
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries}</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}
