import { m } from './paraglide/messages.js';
export const SITE_NAME = m.site_name({}, { locale: 'zh-CN' });

export function formatDocumentTitle(...segments: Array<string | undefined>): string {
  return [
    ...segments.filter((segment): segment is string => Boolean(segment?.trim())),
    SITE_NAME
  ].join('｜');
}
