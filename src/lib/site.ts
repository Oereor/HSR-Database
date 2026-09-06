import { m } from './paraglide/messages.js';

export const siteName = (): string => m.site_name();
/** Base-locale compatibility value for build-time baselines. Public UI uses siteName(). */
export const SITE_NAME = m.site_name({}, { locale: 'zh-CN' });

export function formatDocumentTitle(...segments: Array<string | undefined>): string {
  return [
    ...segments.filter((segment): segment is string => Boolean(segment?.trim())),
    siteName()
  ].join('｜');
}
