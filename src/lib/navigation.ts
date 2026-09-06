import { m } from './paraglide/messages.js';
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

export type NavigationItem = (typeof NAVIGATION_ITEMS)[number];
export type NavigationIconKey = NavigationItem['iconKey'];

export function isNavigationItemActive(pathname: string, item: NavigationItem): boolean {
  return item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
}
