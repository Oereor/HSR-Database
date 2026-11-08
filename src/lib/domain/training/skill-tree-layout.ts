export const layoutSlugs = [
  'destruction',
  'hunt',
  'erudition',
  'harmony',
  'nihility',
  'preservation',
  'abundance',
  'remembrance',
  'elation'
] as const;

export type LayoutSlug = (typeof layoutSlugs)[number];
export type NodeKind = 'skill' | 'ability' | 'stat';
type Center = [number, number];

export interface LayoutSlot {
  anchorType: string;
  center: Center;
}

export interface LayoutGeometry {
  referenceRadius: number;
  nodeRadii: Record<NodeKind, number>;
}

export interface ResolvedLayout {
  referenceRadius: number;
  nodes: (LayoutSlot & { kind: NodeKind; radius: number })[];
}

export function skillTreeViewBox(halfSize: number): string {
  return `-${halfSize} -${halfSize} ${2 * halfSize} ${2 * halfSize}`;
}

export function cropHalfSize(nodes: ResolvedLayout['nodes']): number {
  const bounds = ([0, 1] as const).map((axis) => ({
    start: Math.min(...nodes.map(({ center, radius }) => center[axis] - radius)),
    end: Math.max(...nodes.map(({ center, radius }) => center[axis] + radius))
  }));
  const span = Math.max(...bounds.map(({ start, end }) => end - start));
  const extent = Math.max(...bounds.map(({ start, end }) => Math.max(-start, end)));
  // Target 90% coverage while leaving 2% on the closest edge of the centered square.
  return Math.max(span / (2 * 0.9), extent / (1 - 2 * 0.02));
}

export function layoutHalfSize(layouts: readonly ResolvedLayout[]): number {
  const reference = Math.max(...layouts.map((layout) => layout.referenceRadius));
  return (
    Math.max(
      reference,
      ...layouts.flatMap(({ nodes }) =>
        nodes.map(
          ({ center, radius }) => Math.max(Math.abs(center[0]), Math.abs(center[1])) + radius
        )
      )
    ) +
    reference * 0.13
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readRadius(value: unknown, name: string): number {
  if (!isFiniteNumber(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive radius`);
  }
  return value;
}

export function validateGeometry(value: unknown): LayoutGeometry {
  if (!isRecord(value) || !isRecord(value.nodeRadii)) {
    throw new Error('missing shared geometry or nodeRadii');
  }
  const { skill, ability, stat } = value.nodeRadii;
  return {
    referenceRadius: readRadius(value.referenceRadius, 'referenceRadius'),
    nodeRadii: {
      skill: readRadius(skill, 'nodeRadii.skill'),
      ability: readRadius(ability, 'nodeRadii.ability'),
      stat: readRadius(stat, 'nodeRadii.stat')
    }
  };
}

export function validateLayout(value: unknown): LayoutSlot[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error('layout must be a nonempty list');
  const anchors = new Set<string>();
  return Array.from(value as unknown[], (node) => {
    if (
      !isRecord(node) ||
      typeof node.anchorType !== 'string' ||
      !/^Point(?:0[1-9]|[1-9]\d+)$/.test(node.anchorType)
    ) {
      throw new Error('invalid anchorType');
    }
    const { anchorType, center } = node;
    if (anchors.has(anchorType)) throw new Error(`duplicate anchorType ${anchorType}`);
    anchors.add(anchorType);
    if (
      !Array.isArray(center) ||
      center.length !== 2 ||
      !isFiniteNumber(center[0]) ||
      !isFiniteNumber(center[1])
    ) {
      throw new Error(`${anchorType}: center must contain two finite coordinates`);
    }
    return { anchorType, center: [center[0], center[1]] };
  });
}

function classifyNode(slug: LayoutSlug, anchorType: string): NodeKind {
  if (
    /^Point0[1-5]$/.test(anchorType) ||
    (slug === 'remembrance' && (anchorType === 'Point19' || anchorType === 'Point20')) ||
    (slug === 'elation' && anchorType === 'Point22')
  ) {
    return 'skill';
  }
  return /^Point0[6-8]$/.test(anchorType) ? 'ability' : 'stat';
}

export function resolveLayout(
  slug: LayoutSlug,
  slots: LayoutSlot[],
  geometry: LayoutGeometry
): ResolvedLayout {
  return {
    referenceRadius: geometry.referenceRadius,
    nodes: slots.map((slot) => {
      const kind = classifyNode(slug, slot.anchorType);
      return { ...slot, kind, radius: geometry.nodeRadii[kind] };
    })
  };
}
