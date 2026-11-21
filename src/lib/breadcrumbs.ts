import {
  ENHANCEMENT_COMPARISON_ROUTE_ID,
  enhancementCharacterPath
} from './domain/enhancement-comparison';
import { gameTextToPlain } from './domain/game-text';
import { localizedNavigationItems } from './navigation';
import { canonicalHref, localizedHref } from './i18n/routing';
import { siteName } from './site';
import { m } from './paraglide/messages.js';
import type { Locale } from './paraglide/runtime.js';
import type { WithTrailblazerText } from './domain/trailblazer';
import type { Enemy } from './domain/types';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbData {
  detail?:
    | (WithTrailblazerText & { id: string; name: string })
    | { template: Pick<Enemy['template'], 'monsterTemplateId' | 'name'> };
  mode?: { mode: string; label: string };
  group?: { mode: string; modeLabel: string; period: { groupId: number; name: string } };
}

export function resolveBreadcrumbs({
  routeId,
  params,
  locale,
  data,
  status = 200,
  comparisonBaseForm = false
}: {
  routeId: string | null;
  params: Record<string, string | undefined>;
  locale: Locale;
  data: BreadcrumbData;
  status?: number;
  comparisonBaseForm?: boolean;
}): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [{ label: siteName(locale), href: localizedHref('/', locale) }];
  const add = (label: string, href?: string) =>
    items.push({
      label: gameTextToPlain(label),
      ...(href ? { href: localizedHref(canonicalHref(href), locale) } : {})
    });
  if (status >= 400 || !routeId) {
    add(
      status === 404 || !routeId
        ? m.error_not_found({}, { locale })
        : m.error_load_failed({}, { locale })
    );
  } else if (routeId === '/search') {
    add(m.search_hero_title({}, { locale }));
  } else if (routeId === '/player') {
    add(m.navigation_player({}, { locale }));
  } else if (routeId === ENHANCEMENT_COMPARISON_ROUTE_ID) {
    add(m.navigation_characters({}, { locale }), '/characters');
    if (data.detail && 'id' in data.detail && data.detail.id === params.id)
      add(data.detail.name, enhancementCharacterPath(data.detail.id, comparisonBaseForm));
    add(m.enhancement_comparison_title({}, { locale }));
  } else if (routeId.startsWith('/[category=category]')) {
    const category = localizedNavigationItems(locale).find((item) => item.id === params.category);
    if (category) {
      add(category.label, category.href);
      const { detail } = data;
      if (routeId.endsWith('/[id]') && detail) {
        if (category.id === 'enemies') {
          if ('template' in detail && detail.template.monsterTemplateId === params.id)
            add(detail.template.name);
        } else if ('id' in detail && detail.id === params.id) {
          add(detail.name);
        }
      }
    }
  } else if (routeId === '/endgame' || routeId.startsWith('/endgame/')) {
    add(m.navigation_endgame({}, { locale }), '/endgame');
    if (
      routeId.endsWith('/[groupId]') &&
      data.group &&
      data.group.mode === params.mode &&
      String(data.group.period.groupId) === params.groupId
    ) {
      add(data.group.modeLabel, `/endgame/${params.mode}`);
      add(data.group.period.name);
    } else if (
      routeId.endsWith('/[mode=endgameMode]') &&
      data.mode &&
      data.mode.mode === params.mode
    ) {
      add(data.mode.label);
    }
  }
  delete items[items.length - 1].href;
  return items;
}
