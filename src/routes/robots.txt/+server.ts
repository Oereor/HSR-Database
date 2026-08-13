export const prerender = true;

export function GET() {
  const site = (process.env.PUBLIC_SITE_URL || 'http://localhost:5173').replace(/\/$/, '');
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' }
  });
}
