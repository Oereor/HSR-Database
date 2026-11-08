import abundance from '../../../../data/skill-tree-layouts/abundance.json';
import connectionConfig from '../../../../data/skill-tree-layouts/connections.json';
import destruction from '../../../../data/skill-tree-layouts/destruction.json';
import elation from '../../../../data/skill-tree-layouts/elation.json';
import erudition from '../../../../data/skill-tree-layouts/erudition.json';
import geometryConfig from '../../../../data/skill-tree-layouts/geometry.json';
import harmony from '../../../../data/skill-tree-layouts/harmony.json';
import hunt from '../../../../data/skill-tree-layouts/hunt.json';
import nihility from '../../../../data/skill-tree-layouts/nihility.json';
import preservation from '../../../../data/skill-tree-layouts/preservation.json';
import remembrance from '../../../../data/skill-tree-layouts/remembrance.json';
import paths from '../../../../data/skill-tree-layouts/paths.json';
import { resolveConnections, validateConnectionLayouts } from './skill-tree-connections.js';
import {
  cropHalfSize,
  layoutHalfSize,
  layoutSlugs,
  resolveLayout,
  validateGeometry,
  validateLayout
} from './skill-tree-layout.js';
import type { CharacterTrainingProfile, TrainingNode } from './types.js';

const configs = {
  abundance,
  destruction,
  elation,
  erudition,
  harmony,
  hunt,
  nihility,
  preservation,
  remembrance
};
const geometry = validateGeometry(geometryConfig);
const connections = validateConnectionLayouts(connectionConfig);
const layouts = layoutSlugs.map((slug) => {
  const layout = resolveLayout(slug, validateLayout(configs[slug]), geometry);
  return {
    slug,
    path: paths[slug].pathCode,
    ...layout,
    halfSize: cropHalfSize(layout.nodes),
    connections: resolveConnections(connections[slug], layout.nodes)
  };
});
const referenceHalfSize = layoutHalfSize(layouts);

export function isToggleableTrainingNode(node: TrainingNode): boolean {
  return node.kind === 'trace' && [1, 3, 5].includes(node.pointType);
}

export function resolveTrainingSkillTree(path: string, profile: CharacterTrainingProfile) {
  const context = `[training/tree] ${profile.avatarId}:${profile.enhancedId} (${path})`;
  const layout = layouts.find((entry) => entry.path === path);
  if (!layout) throw new Error(`${context}: unknown path`);

  const slots = new Set(layout.nodes.map((slot) => slot.anchorType));
  const byAnchor = new Map<string, TrainingNode>();
  const errors: string[] = [];
  for (const node of profile.nodes) {
    const { anchorType, pointId } = node;
    // This fixed bonus ability has no slot in the shared Remembrance tree.
    if (
      layout.slug === 'remembrance' &&
      anchorType === 'Point21' &&
      node.pointType === 5 &&
      node.kind === 'fixed' &&
      ((profile.avatarId === '8007' && pointId === '8007501') ||
        (profile.avatarId === '8008' && pointId === '8008501'))
    )
      continue;
    if (!anchorType) {
      errors.push(`PointID ${pointId}: missing AnchorType`);
    } else if (!slots.has(anchorType)) {
      errors.push(`PointID ${pointId}: unmapped AnchorType ${anchorType}`);
    } else {
      const previous = byAnchor.get(anchorType);
      if (previous) {
        errors.push(`PointIDs ${previous.pointId}, ${pointId}: duplicate AnchorType ${anchorType}`);
      } else {
        byAnchor.set(anchorType, node);
      }
    }
  }
  const nodes = layout.nodes.flatMap((slot) => {
    const node = byAnchor.get(slot.anchorType);
    if (node) return [{ ...slot, node }];
    errors.push(`unfilled template slot ${slot.anchorType}`);
    return [];
  });
  if (errors.length) throw new Error(`${context}: ${errors.join(' | ')}`);
  return {
    slug: layout.slug,
    referenceRadius: layout.referenceRadius,
    halfSize: layout.halfSize,
    cropRatio: layout.halfSize / referenceHalfSize,
    connections: layout.connections,
    nodes
  };
}
