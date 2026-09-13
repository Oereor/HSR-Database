import { mkdtemp, mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { captureDeclaredEntities } from '../../scripts/product-baseline/capture';
import {
  assertSearchOnlyDifferences,
  requireProductBaselineApprovalReason
} from '../../scripts/product-baseline/cli';
import { compareProductBaseline } from '../../scripts/product-baseline/compare';
import {
  assertProductBaselineFixtureTree,
  expectedProductBaselineFixturePaths
} from '../../scripts/product-baseline/fixtures';
import type { ProductBaselineCapture } from '../../scripts/product-baseline/model';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

async function fixtureTree(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'hsr-product-baseline-'));
  temporaryRoots.push(root);
  for (const relative of expectedProductBaselineFixturePaths()) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, '{}\n', 'utf8');
  }
  return root;
}

function capture(value = 'expected'): ProductBaselineCapture {
  return {
    metadata: { fixtureFormatVersion: 3, locale: 'zh-CN' },
    characters: { '1001': { value } },
    lightCones: {},
    relics: {},
    enemies: {},
    endgame: { modes: {}, boundaries: [] },
    homepage: {},
    search: {}
  };
}

describe('compact product baseline tooling', () => {
  it('captures only declared cases in declaration order', async () => {
    const result = await captureDeclaredEntities(
      'synthetic',
      [{ id: 'extra' }, { id: 'second' }, { id: 'first' }],
      [{ id: 'first' }, { id: 'second' }],
      async (id) => ({ id }),
      (detail) => detail
    );
    expect(Object.keys(result)).toEqual(['first', 'second']);
    expect(result).not.toHaveProperty('extra');
  });

  it('fails clearly when a declared source case is missing', async () => {
    await expect(
      captureDeclaredEntities(
        'characters',
        [],
        [{ id: 'missing' }],
        async () => ({}),
        (value) => value
      )
    ).rejects.toThrow('characters/missing');
  });

  it('rejects missing required and unexpected stale fixtures', async () => {
    const missingRoot = await fixtureTree();
    await unlink(path.join(missingRoot, 'search.json'));
    await expect(assertProductBaselineFixtureTree(missingRoot)).rejects.toThrow(
      'missing=[search.json]'
    );

    const staleRoot = await fixtureTree();
    await writeFile(path.join(staleRoot, 'stale.json'), '{}\n', 'utf8');
    await expect(assertProductBaselineFixtureTree(staleRoot)).rejects.toThrow(
      'unexpected=[stale.json]'
    );
  });

  it('reports a selected-case field path without catalog-order noise', () => {
    const actual = capture('actual');
    expect(compareProductBaseline(capture(), actual)).toEqual([
      {
        domain: 'characters',
        entityId: '1001',
        path: 'value',
        expected: 'expected',
        actual: 'actual'
      }
    ]);
  });

  it('requires an explicit update reason and refuses non-Search changes', () => {
    expect(() => requireProductBaselineApprovalReason('  ')).toThrow('--reason');
    expect(requireProductBaselineApprovalReason(' approved ')).toBe('approved');
    expect(() =>
      assertSearchOnlyDifferences([
        { domain: 'characters', entityId: '1001', path: 'name', expected: 'a', actual: 'b' }
      ])
    ).toThrow('zero non-Search');
    expect(() =>
      assertSearchOnlyDifferences([
        { domain: 'search', entityId: 'search', path: 'queries', expected: {}, actual: {} }
      ])
    ).not.toThrow();
  });
});
