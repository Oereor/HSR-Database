import { m } from './paraglide/messages.js';
import type { Locale } from './paraglide/runtime.js';

export const siteName = (locale?: Locale): string => m.site_name({}, { locale });

export function formatDocumentTitle(...segments: Array<string | undefined>): string {
  return [
    ...segments.filter((segment): segment is string => Boolean(segment?.trim())),
    siteName()
  ].join('｜');
}
