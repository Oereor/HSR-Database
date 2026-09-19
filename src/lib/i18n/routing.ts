import { deLocalizeHref, getLocale, localizeHref, type Locale } from '../paraglide/runtime.js';

const ABSOLUTE_OR_PROTOCOL_RELATIVE_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;
const FILE_PATH = /\/[^/?#]+\.[^/?#]+$/;

function isLocalPath(href: string): boolean {
  return href.startsWith('/') && !ABSOLUTE_OR_PROTOCOL_RELATIVE_URL.test(href);
}

function isPagePath(href: string): boolean {
  return isLocalPath(href) && !FILE_PATH.test(href.split(/[?#]/, 1)[0]);
}

/** Adds the canonical trailing slash to an internal page URL without changing its query or hash. */
export function trailingSlashHref(href: string): string {
  if (!isPagePath(href)) return href;

  const suffixIndex = href.search(/[?#]/);
  const pathname = suffixIndex === -1 ? href : href.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? '' : href.slice(suffixIndex);
  if (pathname === '/' || pathname.endsWith('/') || FILE_PATH.test(pathname)) return href;
  return `${pathname}/${suffix}`;
}

export function localizedHref(href: string, locale: Locale = getLocale()): string {
  if (!isPagePath(href)) return href;
  return trailingSlashHref(localizeHref(trailingSlashHref(href), { locale }));
}

export function canonicalHref(href: string): string {
  if (!isPagePath(href)) return href;
  return trailingSlashHref(deLocalizeHref(trailingSlashHref(href)));
}

export function localeCounterpartHref(href: string, locale: Locale): string {
  return localizedHref(canonicalHref(href), locale);
}
