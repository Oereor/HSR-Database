import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildCharacterDomain } from '../../scripts/data/domain/character';
import {
  auditTrainingDomain,
  buildTrainingDomain,
  type TrainingDomainBuild
} from '../../scripts/data/domain/training';
import { loadCharacterDomainTables } from '../../scripts/data/character-sources';
import { readTrainingSourceTable, TRAINING_TABLE_NAMES } from '../../scripts/data/training-sources';
import { assertDataRoot, staticGeneratedRoot } from '../../scripts/data/paths';
import {
  calculateCharacterTrainingTarget,
  calculateLightConeTrainingTarget,
  createDefaultCharacterTrainingTarget,
  createInitialCharacterTrainingTarget,
  createInitialLightConeTrainingTarget,
  deactivateTrace,
  activateTrace,
  progressionKey,
  resolveSkillProgression,
  resolveSkillTraining
} from '../../src/lib/domain/training/index';
import {
  assertMaterialCatalog,
  validateTrainingBundle
} from '../../src/lib/domain/training/validation';

let build: TrainingDomainBuild;
beforeAll(async () => {
  const root = assertDataRoot();
  const [tables, extras] = await Promise.all([
    loadCharacterDomainTables(root),
    Promise.all(
      [...TRAINING_TABLE_NAMES, 'EquipmentPromotionConfig'].map(
        async (name) => [name, await readTrainingSourceTable(root, name)] as const
      )
    )
  ]);
  Object.assign(tables, Object.fromEntries(extras));
  build = buildTrainingDomain(tables, buildCharacterDomain({ tables }).characters);
}, 30000);
const character = (id: string) => build.characters.find((data) => data.avatarId === id)!;
const full = (id: string, enhancedId = 0) =>
  calculateCharacterTrainingTarget(
    character(id),
    build.shared,
    createDefaultCharacterTrainingTarget(character(id), enhancedId)
  );

describe('pinned training data', () => {
  it('matches promotion and EXP baselines without substituting rarity templates', () => {
    expect(full('1001').requiredExp).toBe(5797920);
    expect(full('1001').promotionCost).toEqual({
      '2': 246400,
      '110403': 50,
      '111011': 12,
      '111012': 13,
      '111013': 12
    });
    expect(full('1102').promotionCost).toEqual({
      '2': 308000,
      '110406': 65,
      '111011': 15,
      '111012': 15,
      '111013': 15
    });
    for (const data of build.characters)
      for (const profile of data.profiles) {
        const result = calculateCharacterTrainingTarget(
          data,
          build.shared,
          createInitialCharacterTrainingTarget(data, profile.enhancedId)
        );
        expect(result.requiredExp).toBe(0);
        expect(result.totalKnownCost).toEqual({});
      }
    for (const [id, exp, credits] of [
      ['20000', 597440, 231000],
      ['21000', 796590, 308000],
      ['23000', 995700, 385000]
    ] as const) {
      const data = build.lightCones.find((data) => data.equipmentId === id)!;
      const result = calculateLightConeTrainingTarget(data, build.shared, {
        equipmentId: id,
        level: 80
      });
      expect(result.requiredExp).toBe(exp);
      expect(result.promotionCost['2']).toBe(credits);
      expect(result.totalKnownCost).toEqual(result.promotionCost);
      expect(
        calculateLightConeTrainingTarget(
          data,
          build.shared,
          createInitialLightConeTrainingTarget(data)
        ).totalKnownCost
      ).toEqual({});
      expect(() =>
        calculateLightConeTrainingTarget(data, build.shared, { equipmentId: id, level: 81 })
      ).toThrow();
    }
  });

  it('matches March skill and complete tree item counts', () => {
    const data = character('1001');
    const skill = calculateCharacterTrainingTarget(data, build.shared, {
      avatarId: '1001',
      enhancedId: 0,
      level: 80,
      trainingLevels: { [progressionKey('1001', 0, '1001002')]: 10 }
    });
    expect(skill.skillCost).toEqual({
      '2': 522000,
      '241': 1,
      '110141': 2,
      '110142': 12,
      '110143': 23,
      '110501': 3,
      '111011': 6,
      '111012': 10,
      '111013': 5
    });
    const result = full('1001');
    expect(result.skillCost['2']).toBe(1758000);
    expect(result.traceCost['2']).toBe(642000);
    expect(result.totalKnownCost).toEqual({
      '2': 2646400,
      '241': 5,
      '110141': 12,
      '110142': 54,
      '110143': 105,
      '110403': 50,
      '110501': 12,
      '111011': 40,
      '111012': 55,
      '111013': 54
    });
  });

  it('resolves Himeko talent/assist to one canonical target and excludes hidden bindings', () => {
    const profile = character('1510').profiles[0];
    const key = progressionKey('1510', 0, '1510004');
    expect(resolveSkillProgression(profile, '151004')).toBe(key);
    expect(resolveSkillProgression(profile, '151022')).toBe(key);
    for (const id of ['151025', '151026'])
      expect(() => resolveSkillProgression(profile, id)).toThrow();
    const result = calculateCharacterTrainingTarget(character('1510'), build.shared, {
      avatarId: '1510',
      enhancedId: 0,
      level: 80,
      trainingLevels: { [key]: 10 }
    });
    expect(result.skillCost['2']).toBe(652500);
    expect(result.skills.find((skill) => skill.key === key)).toMatchObject({
      trainingLevel: 10,
      requiredPromotion: 6
    });
    expect(
      resolveSkillTraining(
        profile.nodes.find((node) => node.key === key)!,
        6,
        4
      ).trainingLevel
    ).toBe(6);
  });

  it('charges shared variants once and preserves enhanced profile isolation', () => {
    const profile = character('1213').profiles[0];
    const keys = ['121301', '121308', '121310', '121312'].map((id) =>
      resolveSkillProgression(profile, id)
    );
    expect(new Set(keys).size).toBe(1);
    const result = calculateCharacterTrainingTarget(character('1213'), build.shared, {
      avatarId: '1213',
      enhancedId: 0,
      level: 80,
      trainingLevels: { [keys[0]]: 6 }
    });
    expect(result.skillCost['2']).toBe(240000);
    const herta = character('1401').profiles[0];
    const node = herta.nodes.find(
      (node) => node.bindings.filter((binding) => binding.category === 'skill').length > 1
    )!;
    expect(
      node.bindings.every(
        (binding) => resolveSkillProgression(herta, binding.skillId, binding.source) === node.key
      )
    ).toBe(true);
    const seele = character('1102');
    expect(
      new Set(seele.profiles.flatMap((profile) => profile.nodes.map((node) => node.key))).size
    ).toBe(seele.profiles.reduce((count, profile) => count + profile.nodes.length, 0));
    expect(full('1102', 0).totalKnownCost).toEqual(full('1102', 1).totalKnownCost);
    const baseKey = seele.profiles[0].nodes.find((node) => node.kind === 'skill')!.key;
    expect(() =>
      calculateCharacterTrainingTarget(seele, build.shared, {
        avatarId: '1102',
        enhancedId: 1,
        level: 80,
        trainingLevels: { [baseKey]: 6 }
      })
    ).toThrow();
  });

  it('covers memosprite, elation, LD, and non-paid special nodes', () => {
    for (const [id, points, credits] of [
      ['1407', ['1407301', '1407302'], 403000],
      ['8007', ['8007301', '8007302'], 322400],
      ['8009', ['8009420'], 416000]
    ] as const) {
      const data = character(id);
      const nodes = data.profiles[0].nodes.filter((node) =>
        (points as readonly string[]).includes(node.pointId)
      );
      const result = calculateCharacterTrainingTarget(data, build.shared, {
        avatarId: id,
        enhancedId: 0,
        level: 80,
        trainingLevels: Object.fromEntries(nodes.map((node) => [node.key, node.maxLevel]))
      });
      expect(result.skillCost['2']).toBe(credits);
    }
    expect(full('1407').totalKnownCost['2']).toBe(3308000);
    expect(full('8007').totalKnownCost['2']).toBe(2646400);
    expect(
      character('8007').profiles[0].nodes.find((node) => node.pointId === '8007501')?.kind
    ).toBe('fixed');
    expect(createDefaultCharacterTrainingTarget(character('8007'), 0).activeTraceIds).not.toContain(
      '8007501'
    );
    expect(full('1014').totalKnownCost['2']).toBe(3308000);
  });

  it('uses real shared prerequisites across visual trace groups', () => {
    const data = character('1001');
    const profile = data.profiles[0];
    const all = createDefaultCharacterTrainingTarget(data, 0).activeTraceIds;
    const remaining = deactivateTrace(profile, all, '1001201');
    expect(remaining).not.toContain('1001101');
    expect(remaining).not.toContain('1001102');
    expect(remaining).toContain('1001103');
    const activated = activateTrace(profile, [], '1001102', 6);
    expect(activated).toMatchObject({ ok: true, activeTraceIds: ['1001102', '1001201'] });
  });

  it('audits all profiles and resolves every generated material in both locales', async () => {
    const audit = auditTrainingDomain(build);
    expect(audit.profiles).toBe(
      build.characters.reduce((count, data) => count + data.profiles.length, 0)
    );
    expect(
      audit.sharedNodes.filter((node) => node.crossCategory).map((node) => node.key)
    ).toContain(progressionKey('1510', 0, '1510004'));
    expect(audit.sharedPrerequisites.length).toBeGreaterThan(0);
    const catalogs = await Promise.all(
      (['zh-CN', 'en'] as const).map(async (locale) => {
        const value: unknown = JSON.parse(
          await readFile(path.join(staticGeneratedRoot, locale, 'materials.json'), 'utf8')
        );
        assertMaterialCatalog(value, locale);
        return value;
      })
    );
    validateTrainingBundle(build, catalogs);
    expect(build.shared.characterExpCreditDivisor).toBe(10);
    expect(build.shared.characterExpItems.map((item) => item.exp)).toEqual([1000, 5000, 20000]);
    expect(build.shared.lightConeExpItems.map((item) => item.creditCost)).toEqual([
      250, 1000, 3000
    ]);
    // Corpus sizes are reported, rather than permanent hardcoded constraints.
    expect(
      build.materials.every(
        (material) =>
          material.nameSource?.ref.kind === 'hash' || material.nameSource?.ref.kind === 'symbolic'
      )
    ).toBe(true);
  });
});
