import { deLocalizeHref, getLocale, localizeHref, type Locale } from '../paraglide/runtime.js';

export function localizedHref(href: string, locale: Locale = getLocale()): string {
  return localizeHref(href, { locale });
}

export function canonicalHref(href: string): string {
  return deLocalizeHref(href);
}

export function localeCounterpartHref(href: string, locale: Locale): string {
  return localizedHref(canonicalHref(href), locale);
}
