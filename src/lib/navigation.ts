import { m } from './paraglide/messages.js';
import { canonicalHref, localizedHref } from './i18n/routing.js';
import type { Locale } from './paraglide/runtime.js';

export const NAVIGATION_ICON_KEYS = [
  'overview',
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
      iconKey: 'overview',
      fallback: m.navigation_overview_fallback({}, { locale })
    },
    {
      id: 'characters',
      href: '/characters',
      label: m.navigation_characters({}, { locale }),
      iconKey: 'characters',
      fallback: m.navigation_characters_fallback({}, { locale })
    },
    {
      id: 'light-cones',
      href: '/light-cones',
      label: m.navigation_light_cones({}, { locale }),
      iconKey: 'light-cones',
      fallback: m.navigation_light_cones_fallback({}, { locale })
    },
    {
      id: 'relics',
      href: '/relics',
      label: m.navigation_relics({}, { locale }),
      iconKey: 'relics',
      fallback: m.navigation_relics_fallback({}, { locale })
    },
    {
      id: 'enemies',
      href: '/enemies',
      label: m.navigation_enemies({}, { locale }),
      iconKey: 'enemies',
      fallback: m.navigation_enemies_fallback({}, { locale })
    },
    {
      id: 'endgame',
      href: '/endgame',
      label: m.navigation_endgame({}, { locale }),
      iconKey: 'endgame',
      fallback: m.navigation_endgame_fallback({}, { locale })
    }
  ] as const;
}

export function isNavigationItemActive(pathname: string, item: { href: string }): boolean {
  const canonical = canonicalHref(pathname);
  return item.href === '/' ? canonical === '/' : canonical.startsWith(item.href);
}

export function localizedNavigationItems(locale?: Locale) {
  return getNavigationItems(locale).map((item) => ({
    ...item,
    href: localizedHref(item.href, locale)
  }));
}
