import { layoutSlugs, type LayoutSlot, type LayoutSlug } from './skill-tree-layout.js';

type Point = readonly [number, number];

export const skillTreeLineStyle = { stroke: '#e1e5ec', opacity: 0.56, width: 0.006 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateConnectionLayouts(value: unknown): Record<LayoutSlug, unknown> {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== layoutSlugs.length ||
    layoutSlugs.some((slug) => !Object.hasOwn(value, slug))
  )
    throw new Error('connections must define all nine path layouts');
  return value as Record<LayoutSlug, unknown>;
}

function readPoint(value: unknown): Point {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    value.some(
      (coordinate: unknown) => typeof coordinate !== 'number' || !Number.isFinite(coordinate)
    )
  )
    throw new Error('connection point must contain two finite coordinates');
  return [value[0], value[1]];
}

const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const coordinates = ([x, y]: Point) => `${x} ${y}`;
const extrapolate = (a: Point, b: Point): Point => [2 * a[0] - b[0], 2 * a[1] - b[1]];

/** Convert a centripetal Catmull–Rom segment to SVG cubic Bézier controls. */
function controls(a: Point, b: Point, c: Point, d: Point): [Point, Point] {
  const ab = Math.sqrt(distance(a, b));
  const bc = Math.sqrt(distance(b, c));
  const cd = Math.sqrt(distance(c, d));
  const control = (axis: 0 | 1, atStart: boolean) => {
    const [w, x, y, z] = [a[axis], b[axis], c[axis], d[axis]];
    const slope = (y - x) / bc;
    return atStart
      ? x + (bc / 3) * ((x - w) / ab - (y - w) / (ab + bc) + slope)
      : y - (bc / 3) * (slope - (z - x) / (bc + cd) + (z - y) / cd);
  };
  return [
    readPoint([control(0, true), control(1, true)]),
    readPoint([control(0, false), control(1, false)])
  ];
}

export function resolveConnections(value: unknown, nodes: readonly LayoutSlot[]): string[] {
  if (!isRecord(value) || !Array.isArray(value.paths) || value.paths.length === 0)
    throw new Error('missing connection paths');
  const anchors = new Map<string, Point>(
    nodes.map(({ anchorType, center }) => [anchorType, center])
  );
  const junctions = new Map<string, Point>();
  if (value.junctions !== undefined) {
    if (!isRecord(value.junctions)) throw new Error('invalid connection junctions');
    for (const [name, point] of Object.entries(value.junctions)) {
      if (!/^[a-z][a-z0-9-]*$/.test(name) || anchors.has(name))
        throw new Error(`invalid junction name ${name}`);
      junctions.set(name, readPoint(point));
    }
  }

  const seen = new Set<string>();
  return value.paths.map((path: unknown) => {
    if (
      !isRecord(path) ||
      (path.type !== 'line' && path.type !== 'curve') ||
      !Array.isArray(path.through) ||
      path.through.length < (path.type === 'curve' ? 3 : 2)
    )
      throw new Error('invalid connection path');

    const points = Array.from(path.through as unknown[], (point) => {
      if (typeof point !== 'string') return readPoint(point);
      const resolved = anchors.get(point) ?? junctions.get(point);
      if (!resolved) throw new Error(`unknown connection point ${point}`);
      return resolved;
    });
    if (
      points.slice(1).some((point, index) => {
        const length = distance(points[index], point);
        return !Number.isFinite(length) || length === 0;
      })
    )
      throw new Error('degenerate connection segment');
    const key = [JSON.stringify(points), JSON.stringify([...points].reverse())].sort()[0];
    if (seen.has(key)) throw new Error('duplicate connection path');
    seen.add(key);

    const start = `M ${coordinates(points[0])}`;
    const segments = points.slice(1).map((end, index) => {
      if (path.type === 'line') return `L ${coordinates(end)}`;
      const begin = points[index];
      const before = points[index - 1] ?? extrapolate(begin, end);
      const after = points[index + 2] ?? extrapolate(end, begin);
      const [first, second] = controls(before, begin, end, after);
      return `C ${coordinates(first)} ${coordinates(second)} ${coordinates(end)}`;
    });
    return [start, ...segments].join(' ');
  });
}
