import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  resolveConnections,
  validateConnectionLayouts
} from '../../src/lib/domain/training/skill-tree-connections';
import {
  layoutSlugs,
  resolveLayout,
  validateGeometry,
  validateLayout
} from '../../src/lib/domain/training/skill-tree-layout';
import {
  isToggleableTrainingNode,
  resolveTrainingSkillTree
} from '../../src/lib/domain/training/skill-tree';
import type { CharacterTrainingData } from '../../src/lib/domain/training/types';
import type { CatalogEntry } from '../../src/lib/domain/types';

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

  it('treats Aha Point23 as a skill node while retaining free default training semantics', () => {
    const slots = json<{ anchorType: string; center: [number, number] }[]>(
      'data/skill-tree-layouts/elation-aha.json'
    );
    const profile = {
      avatarId: '1511',
      enhancedId: 0,
      nodes: slots.map(({ anchorType }, index) => ({
        key: `1511:0:${index}`,
        pointId: String(index),
        anchorType,
        pointType: anchorType === 'Point23' ? 6 : 1,
        kind: 'default' as const,
        defaultUnlock: true,
        maxLevel: 1,
        prerequisiteIds: [],
        linkedSkillIds: [],
        bindings: [],
        steps: []
      }))
    };
    const tree = resolveTrainingSkillTree('Elation', profile);
    const point = tree.nodes.find((slot) => slot.anchorType === 'Point23')!;
    expect(tree.slug).toBe('elation-aha');
    expect(point.kind).toBe('skill');
    expect(point.radius).toBe(tree.nodes.find((slot) => slot.anchorType === 'Point03')?.radius);
    expect(point.node.kind).toBe('default');
    expect(isToggleableTrainingNode(point.node)).toBe(false);
    expect(point.center[1]).toBeGreaterThan(
      tree.nodes.find((slot) => slot.anchorType === 'Point22')!.center[1]
    );
    expect(point.center[1]).toBeLessThan(
      tree.nodes.find((slot) => slot.anchorType === 'Point03')!.center[1]
    );
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

const json = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8'));
const training = (id: string) =>
  json<CharacterTrainingData>(`static/generated/training/characters/${id}.json`);

describe('skill tree connections', () => {
  const slots = validateLayout([
    { anchorType: 'Point01', center: [0, 0] },
    { anchorType: 'Point02', center: [-0.5, 1] },
    { anchorType: 'Point03', center: [0.5, 1] }
  ]);
  const fork = {
    junctions: { fork: [0, 0.75] },
    paths: [
      { type: 'line', through: ['Point01', 'fork'] },
      { type: 'curve', through: ['Point02', 'fork', 'Point03'] }
    ]
  };

  it('shares a non-node junction and interpolates through it and the anchor centers', () => {
    const [trunk, branches] = resolveConnections(fork, slots);
    expect(trunk).toBe('M 0 0 L 0 0.75');
    expect(branches).toMatch(/^M -0\.5 1 C .* 0 0\.75 C .* 0\.5 1$/);
  });

  it('rejects missing paths, unresolved references, nonfinite points and duplicate geometry', () => {
    expect(() => validateConnectionLayouts({ abundance: fork })).toThrow(/all nine/);
    for (const [through, error] of [
      [['Point01', 'Point99'], /unknown connection point/],
      [['Point01', [Infinity, 0]], /finite coordinates/],
      [['Point01', [0, 0]], /degenerate connection/],
      [['fork', 'Point01'], /duplicate connection/]
    ] as const)
      expect(() =>
        resolveConnections({ ...fork, paths: [...fork.paths, { type: 'line', through }] }, slots)
      ).toThrow(error);
  });
});

describe('character skill tree mapping', () => {
  it('maps all generated profiles to their path with PointID icon references', () => {
    const characters = json<CatalogEntry[]>(
      'src/lib/generated/views/zh-CN/catalogs/characters.json'
    );
    const covered = new Set<string>();
    for (const { id, path } of characters) {
      for (const profile of training(id).profiles) {
        const tree = resolveTrainingSkillTree(path!, profile);
        if (!covered.has(tree.slug)) {
          expect(tree.connections.length).toBeGreaterThan(0);
          expect(tree.connections.every((d) => /^M /.test(d) && !/NaN|Infinity/.test(d))).toBe(
            true
          );
          const axisCoverage = ([0, 1] as const).map((axis) => {
            const start = Math.min(
              ...tree.nodes.map(({ center, radius }) => center[axis] - radius)
            );
            const end = Math.max(...tree.nodes.map(({ center, radius }) => center[axis] + radius));
            expect(start / tree.halfSize).toBeGreaterThanOrEqual(-0.960001);
            expect(end / tree.halfSize).toBeLessThanOrEqual(0.960001);
            return (end - start) / (2 * tree.halfSize);
          });
          expect(Math.max(...axisCoverage)).toBeGreaterThanOrEqual(0.89);
          expect(Math.max(...axisCoverage)).toBeLessThanOrEqual(0.900001);
          expect(tree.cropRatio).toBeLessThan(1);
        }
        covered.add(tree.slug);
        for (const { anchorType, node } of tree.nodes) {
          expect(node.anchorType).toBe(anchorType);
          expect(node.iconKey).toBe(`skill-tree--${node.pointId}`);
          expect(isToggleableTrainingNode(node)).toBe(node.kind === 'trace');
        }
        const omitted = profile.nodes.filter(
          (node) => !tree.nodes.some((entry) => entry.node === node)
        );
        expect(omitted.map(({ pointId }) => pointId)).toEqual(
          id === '8007' || id === '8008' ? [`${id}501`] : []
        );
      }
    }
    expect([...covered].filter((slug) => slug !== 'elation-aha').sort()).toEqual(
      [...layoutSlugs].sort()
    );
  });

  it('diagnoses missing, duplicate and unmapped anchors in the profile', () => {
    const profile = training('1001').profiles[0];
    profile.nodes[0].anchorType = undefined;
    profile.nodes[1].anchorType = profile.nodes[2].anchorType;
    profile.nodes[3].anchorType = 'Point99';
    expect(() => resolveTrainingSkillTree('Knight', profile)).toThrow(
      /1001:0.*missing AnchorType.*duplicate AnchorType.*unmapped AnchorType Point99.*unfilled template slot/
    );
  });
});
