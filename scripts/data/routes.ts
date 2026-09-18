import type { DataManifest } from '../../src/lib/domain/types.js';
import type { EndgameDatasetByMode } from '../../src/lib/domain/endgame.js';
import { ENDGAME_MODES } from '../../src/lib/domain/endgame-view.js';

export type GeneratedRoutes = DataManifest['routes'];

export interface GeneratedRouteInventory {
  routes: GeneratedRoutes;
  routePaths: string[];
}

/** Canonical locale-neutral route inventory used by generation and validation. */
export function buildGeneratedRouteInventory(
  routes: GeneratedRoutes,
  datasets: EndgameDatasetByMode
): GeneratedRouteInventory {
  return {
    routes,
    routePaths: [
      '/',
      '/search',
      '/player',
      ...Object.entries(routes).flatMap(([category, ids]) => [
        `/${category}`,
        ...ids.map((id) => `/${category}/${id}`)
      ]),
      '/endgame',
      ...ENDGAME_MODES.flatMap((mode) => [
        `/endgame/${mode}`,
        ...datasets[mode].groups.map((group) => `/endgame/${mode}/${group.groupId}`)
      ])
    ]
  };
}
