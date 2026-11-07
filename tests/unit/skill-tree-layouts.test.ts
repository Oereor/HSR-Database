import { describe, expect, it } from 'vitest';
import {
  layoutSlugs,
  resolveLayout,
  validateGeometry,
  validateLayout
} from '../../scripts/dev/skill-tree-layouts/layout';

const geometry = { referenceRadius: 2, nodeRadii: { skill: 0.12, ability: 0.17, stat: 0.09 } };

describe('skill tree layout geometry', () => {
  it('uses the same shared radius for each node category across paths', () => {
    const anchors = [
      'Point01',
      'Point02',
      'Point03',
      'Point04',
      'Point05',
      'Point06',
      'Point07',
      'Point08',
      'Point09',
      'Point19',
      'Point20',
      'Point22',
      'Point100'
    ];
    const slots = validateLayout(
      anchors.map((anchorType) => ({ anchorType, center: [0.25, -0.5] }))
    );
    for (const slug of layoutSlugs) {
      const layout = resolveLayout(slug, slots, validateGeometry(geometry));
      expect(layout.referenceRadius).toBe(geometry.referenceRadius);
      expect(layout.nodes.map((node) => node.radius)).toEqual([
        ...Array(5).fill(0.12),
        ...Array(3).fill(0.17),
        0.09,
        slug === 'remembrance' ? 0.12 : 0.09,
        slug === 'remembrance' ? 0.12 : 0.09,
        slug === 'elation' ? 0.12 : 0.09,
        0.09
      ]);
      expect(layout.nodes[0]).toEqual({
        anchorType: 'Point01',
        center: [0.25, -0.5],
        kind: 'skill',
        radius: 0.12
      });
    }
  });

  it('accepts a newly configured slot without a roster or source image', () => {
    const layout = validateLayout([{ anchorType: 'Point42', center: [0, 0.5] }]);
    expect(resolveLayout('elation', layout, geometry).nodes[0]).toMatchObject({
      kind: 'stat',
      radius: geometry.nodeRadii.stat
    });
  });

  it('rejects empty layouts, invalid anchors and duplicates', () => {
    expect(() => validateLayout([])).toThrow(/nonempty/);
    expect(() => validateLayout([{ anchorType: 'Point00', center: [0, 0] }])).toThrow(
      /invalid anchor/
    );
    const slot = { anchorType: 'Point22', center: [0, 0] };
    expect(() => validateLayout([slot, slot])).toThrow(/duplicate anchorType Point22/);
  });

  it.each([[0, Infinity], [NaN, 0], [0], ['0', 0]])(
    'rejects nonfinite or malformed centers',
    (...center) => {
      expect(() => validateLayout([{ anchorType: 'Point01', center }])).toThrow(
        /finite coordinates/
      );
    }
  );

  it.each([0, -1, Infinity, NaN, undefined])('rejects an invalid shared radius', (invalid) => {
    expect(() => validateGeometry({ ...geometry, referenceRadius: invalid })).toThrow(
      /referenceRadius/
    );
    expect(() =>
      validateGeometry({ ...geometry, nodeRadii: { ...geometry.nodeRadii, ability: invalid } })
    ).toThrow(/nodeRadii\.ability/);
  });
});
