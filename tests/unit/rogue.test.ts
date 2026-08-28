import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RogueDuDataset, RogueSuDataset } from '../../src/lib/domain/rogue';
import { getRoguePage, getRogueRoutePaths } from '../../src/lib/server/rogue';

const generated = path.resolve('src', 'lib', 'generated', 'rogue');
const auditRoot = path.resolve('data', 'audit');

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

describe('Rogue generated data', () => {
  it('uses source-qualified blessing identity and keeps Lv1/Lv2 together', async () => {
    const su = await readJson<RogueSuDataset>(path.join(generated, 'su.json'));
    expect(su.blessings).toHaveLength(162);
    expect(new Set(su.blessings.map((item) => item.id)).size).toBe(162);
    expect(su.blessings.every((item) => item.id === `RogueBuff:${item.mazeBuffId}`)).toBe(true);
    expect(
      su.blessings.every((item) => item.levels.map((level) => level.level).join() === '1,2')
    ).toBe(true);
    expect(su.blessings.some((item) => item.extraEffects.length > 0)).toBe(true);
    expect(su.blessings.some((item) => item.levels[1].effect.description.includes('20%'))).toBe(
      true
    );
  });

  it('models SU owner overlays, ordered resonance siblings and explicit presentation tiers', async () => {
    const su = await readJson<RogueSuDataset>(path.join(generated, 'su.json'));
    expect(su.baseResonances).toHaveLength(9);
    expect(su.enhancementGroups).toHaveLength(9);
    expect(su.enhancementGroups.every((group) => group.effects.length === 3)).toBe(true);
    expect(
      su.enhancementGroups.every((group) =>
        group.effects.every((effect, index) => effect.rawOrder === index)
      )
    ).toBe(true);
    expect(su.crossResonances.filter((item) => item.availableIn === 'swarm-disaster')).toHaveLength(
      16
    );
    expect(su.crossResonances.filter((item) => item.availableIn === 'gold-and-gears')).toHaveLength(
      18
    );
    expect(
      [...su.baseResonances, ...su.enhancementGroups, ...su.crossResonances].every(
        (item) => item.tier.stars === 3 && item.tier.source === 'resonance'
      )
    ).toBe(true);
  });

  it('keeps DU Tourn3-only formulas directional and critical equations at one path ×16', async () => {
    const du = await readJson<RogueDuDataset>(path.join(generated, 'du-tourn3.json'));
    expect(du.revision).toBe('Tourn3');
    expect(du.blessings).toHaveLength(144);
    expect(du.equations).toHaveLength(104);
    expect(du.equations.filter((item) => item.kind === 'ordinary')).toHaveLength(96);
    const critical = du.equations.filter((item) => item.kind === 'critical');
    expect(critical).toHaveLength(8);
    expect(
      critical.every(
        (item) => item.main.count === 16 && item.sub === undefined && item.tier.stars === 4
      )
    ).toBe(true);
    expect(
      du.equations.every(
        (item) => item.tournMode === 'Tourn3' && item.id.endsWith(`${item.formulaId}`)
      )
    ).toBe(true);
    expect(
      du.equations
        .filter((item) => item.sub)
        .some((item) => item.main.path.rawType !== item.sub?.path.rawType)
    ).toBe(true);
  });

  it('assembles mode views without leaking cross-owner availability', async () => {
    const [su, swarm, gears, du] = await Promise.all([
      getRoguePage('su'),
      getRoguePage('swarm-disaster'),
      getRoguePage('gold-and-gears'),
      getRoguePage('du')
    ]);
    expect(su.kind === 'su' && su.blessings).toHaveLength(162);
    expect(su.kind === 'su' && su.crossResonances).toHaveLength(0);
    expect(swarm.kind === 'su' && swarm.crossResonances).toHaveLength(16);
    expect(gears.kind === 'su' && gears.crossResonances).toHaveLength(18);
    expect(du.kind === 'du' && du.revisionLabel).toBe('差分宇宙·乐园漫记');
    expect(getRogueRoutePaths()).toEqual([
      '/rogue',
      '/rogue/su',
      '/rogue/swarm-disaster',
      '/rogue/gold-and-gears',
      '/rogue/du'
    ]);
  });

  it('records shared SU availability and the missing Propagation asset as diagnostics', async () => {
    const audit = await readJson<{
      rogueAudit: {
        summary: {
          diagnostics: { ordinarySuAvailability: string; missingPathAssets: string[] };
        };
        orderingFallback: string;
      };
    }>(path.join(auditRoot, 'latest.json'));
    expect(audit.rogueAudit.summary.diagnostics.ordinarySuAvailability).toBe('shared-catalog');
    expect(audit.rogueAudit.summary.diagnostics.missingPathAssets).toContain('Propagation');
    expect(audit.rogueAudit.orderingFallback).toBe('source-index');
  });
});
