import { m } from './paraglide/messages.js';
import { canonicalHref, localizedHref } from './i18n/routing.js';
import type { Locale } from './paraglide/runtime.js';

export const NAVIGATION_ICON_KEYS = [
  'overview',
  'player',
  'characters',
  'light-cones',
  'relics',
  'enemies',
  'endgame'
] as const;
export type NavigationIconKey = (typeof NAVIGATION_ICON_KEYS)[number];

export function getNavigationItems(locale?: Locale) {
  return [
    {
      id: 'overview',
      href: '/',
      label: m.navigation_overview({}, { locale }),
      iconKey: 'overview'
    },
    {
      id: 'player',
      href: '/player',
      label: m.navigation_player({}, { locale }),
      iconKey: 'player'
    },
    {
      id: 'characters',
      href: '/characters',
      label: m.navigation_characters({}, { locale }),
      iconKey: 'characters'
    },
    {
      id: 'light-cones',
      href: '/light-cones',
      label: m.navigation_light_cones({}, { locale }),
      iconKey: 'light-cones'
    },
    {
      id: 'relics',
      href: '/relics',
      label: m.navigation_relics({}, { locale }),
      iconKey: 'relics'
    },
    {
      id: 'enemies',
      href: '/enemies',
      label: m.navigation_enemies({}, { locale }),
      iconKey: 'enemies'
    },
    {
      id: 'endgame',
      href: '/endgame',
      label: m.navigation_endgame({}, { locale }),
      iconKey: 'endgame'
    }
  ] as const;
}

export function isNavigationItemActive(pathname: string, item: { href: string }): boolean {
  const canonical = canonicalHref(pathname);
  const itemHref = canonicalHref(item.href);
  return itemHref === '/' ? canonical === '/' : canonical.startsWith(itemHref);
}

export function localizedNavigationItems(locale?: Locale) {
  return getNavigationItems(locale).map((item) => ({
    ...item,
    href: localizedHref(item.href, locale)
  }));
}
