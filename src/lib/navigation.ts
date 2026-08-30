export const NAVIGATION_ITEMS = [
  {
    id: 'overview',
    href: '/',
    label: '总览',
    iconKey: 'overview',
    fallback: '总'
  },
  {
    id: 'characters',
    href: '/characters',
    label: '角色',
    iconKey: 'characters',
    fallback: '角'
  },
  {
    id: 'light-cones',
    href: '/light-cones',
    label: '光锥',
    iconKey: 'light-cones',
    fallback: '锥'
  },
  {
    id: 'relics',
    href: '/relics',
    label: '遗器',
    iconKey: 'relics',
    fallback: '遗'
  },
  {
    id: 'enemies',
    href: '/enemies',
    label: '敌方单位',
    iconKey: 'enemies',
    fallback: '敌'
  },
  {
    id: 'endgame',
    href: '/endgame',
    label: '高难模式',
    iconKey: 'endgame',
    fallback: '难'
  },
  {
    id: 'rogue',
    href: '/rogue',
    label: '模拟宇宙',
    iconKey: 'rogue',
    fallback: '宇'
  }
] as const;

export type NavigationItem = (typeof NAVIGATION_ITEMS)[number];
export type NavigationIconKey = NavigationItem['iconKey'];

export function isNavigationItemActive(pathname: string, item: NavigationItem): boolean {
  return item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
}
