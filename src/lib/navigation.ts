import { m } from './paraglide/messages.js';
import { canonicalHref, localizedHref } from './i18n/routing.js';

export const NAVIGATION_ICON_KEYS = [
  'overview',
  'characters',
  'light-cones',
  'relics',
  'enemies',
  'endgame'
] as const;
export type NavigationIconKey = (typeof NAVIGATION_ICON_KEYS)[number];

export function getNavigationItems() {
  return [
    {
      id: 'overview',
      href: '/',
      label: m.navigation_overview(),
      iconKey: 'overview',
      fallback: m.navigation_overview_fallback()
    },
    {
      id: 'characters',
      href: '/characters',
      label: m.navigation_characters(),
      iconKey: 'characters',
      fallback: m.navigation_characters_fallback()
    },
    {
      id: 'light-cones',
      href: '/light-cones',
      label: m.navigation_light_cones(),
      iconKey: 'light-cones',
      fallback: m.navigation_light_cones_fallback()
    },
    {
      id: 'relics',
      href: '/relics',
      label: m.navigation_relics(),
      iconKey: 'relics',
      fallback: m.navigation_relics_fallback()
    },
    {
      id: 'enemies',
      href: '/enemies',
      label: m.navigation_enemies(),
      iconKey: 'enemies',
      fallback: m.navigation_enemies_fallback()
    },
    {
      id: 'endgame',
      href: '/endgame',
      label: m.navigation_endgame(),
      iconKey: 'endgame',
      fallback: m.navigation_endgame_fallback()
    }
  ] as const;
}

/** Base-locale compatibility value for build-time baselines. Public UI uses localizedNavigationItems(). */
export const NAVIGATION_ITEMS = [
  {
    id: 'overview',
    href: '/',
    label: m.navigation_overview({}, { locale: 'zh-CN' }),
    iconKey: 'overview',
    fallback: m.navigation_overview_fallback({}, { locale: 'zh-CN' })
  },
  {
    id: 'characters',
    href: '/characters',
    label: m.navigation_characters({}, { locale: 'zh-CN' }),
    iconKey: 'characters',
    fallback: m.navigation_characters_fallback({}, { locale: 'zh-CN' })
  },
  {
    id: 'light-cones',
    href: '/light-cones',
    label: m.navigation_light_cones({}, { locale: 'zh-CN' }),
    iconKey: 'light-cones',
    fallback: m.navigation_light_cones_fallback({}, { locale: 'zh-CN' })
  },
  {
    id: 'relics',
    href: '/relics',
    label: m.navigation_relics({}, { locale: 'zh-CN' }),
    iconKey: 'relics',
    fallback: m.navigation_relics_fallback({}, { locale: 'zh-CN' })
  },
  {
    id: 'enemies',
    href: '/enemies',
    label: m.navigation_enemies({}, { locale: 'zh-CN' }),
    iconKey: 'enemies',
    fallback: m.navigation_enemies_fallback({}, { locale: 'zh-CN' })
  },
  {
    id: 'endgame',
    href: '/endgame',
    label: m.navigation_endgame({}, { locale: 'zh-CN' }),
    iconKey: 'endgame',
    fallback: m.navigation_endgame_fallback({}, { locale: 'zh-CN' })
  }
] as const;

export type NavigationItem = ReturnType<typeof getNavigationItems>[number];

export function isNavigationItemActive(pathname: string, item: { href: string }): boolean {
  const canonical = canonicalHref(pathname);
  return item.href === '/' ? canonical === '/' : canonical.startsWith(item.href);
}

export function localizedNavigationItems() {
  return getNavigationItems().map((item) => ({ ...item, href: localizedHref(item.href) }));
}
