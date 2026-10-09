import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createSkillPreviewControls,
  createTrainingSkillTargets,
  createTrainingTraceSummary,
  initializeSkillPreviewLevels,
  createTrainingExpenseCosts
} from '../../src/lib/domain/training/detail-view';
import {
  createDefaultCharacterTrainingTarget,
  calculateCharacterTrainingTarget,
  calculateLightConeTrainingTarget,
  reconcileCharacterLevel,
  deactivateTrace,
  activateTrace,
  allowedSkillTrainingLevels,
  mergeCosts
} from '../../src/lib/domain/training/index';
import type { Character, CatalogEntry } from '../../src/lib/domain/types';
import type {
  CharacterTrainingData,
  LightConeTrainingData,
  TrainingSharedData
} from '../../src/lib/domain/training/types';

const json = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8'));
const data = (id: string) =>
  json<CharacterTrainingData>(`static/generated/training/characters/${id}.json`);
const view = (id: string, locale = 'zh-CN') =>
  json<Character>(`src/lib/generated/views/${locale}/details/characters/${id}.json`);
const shared = json<TrainingSharedData>('static/generated/training/shared.json');

describe('receipt training projections', () => {
  it.each(json<CatalogEntry[]>('src/lib/generated/views/zh-CN/catalogs/characters.json'))(
    'projects each paid canonical target once with legal levels, icons and independent preview for $id',
    ({ id }) => {
      const cost = data(id);
      const character = view(id);
      for (const profile of cost.profiles) {
        const cards = (
          profile.enhancedId === 0 ? character.profiles.base : character.profiles.enhanced!
        ).skillCards;
        const initial = createDefaultCharacterTrainingTarget(cost, profile.enhancedId);
        const preview = initializeSkillPreviewLevels(cards, profile, {});
        for (const level of [1, 20, 21, 60, 80]) {
          const target = reconcileCharacterLevel(cost, initial, level);
          const result = calculateCharacterTrainingTarget(cost, shared, target);
          const controls = createSkillPreviewControls(
            cards,
            profile,
            preview,
            {},
            result.target.promotion
          );
          const projected = createTrainingSkillTargets(
            cards,
            profile,
            result.skills,
            result.target.promotion
          );
          expect(projected.map((skill) => skill.key).sort()).toEqual(
            profile.nodes
              .filter((node) => node.kind === 'skill')
              .map((node) => node.key)
              .sort()
          );
          for (const skill of projected) {
            const node = profile.nodes.find((node) => node.key === skill.key)!;
            expect(skill.availableLevels).toEqual(
              allowedSkillTrainingLevels(node, result.target.promotion)
            );
            expect(skill.availableLevels).toContain(skill.trainingLevel);
            expect(skill.trainingLevel).toBe(target.trainingLevels[skill.key]);
            expect(skill.categoryLabel).not.toBe('');
            const matchingCard = cards.find(
              (card) =>
                card.iconKey &&
                card.progressions.some((progression) => controls[progression.id].key === skill.key)
            );
            expect(skill.iconKey).toBe(matchingCard?.iconKey);
            for (const card of cards)
              for (const progression of card.progressions) {
                if (controls[progression.id].key === skill.key) {
                  expect(controls[progression.id].previewLevel).toBe(node.maxLevel);
                  expect(progression.availableLevels).toEqual(node.bindings[0].displayLevels);
                }
              }
          }
          const groups = createTrainingExpenseCosts(result);
          expect(mergeCosts(groups.upgrade, groups.promotion, groups.skillTrace!)).toEqual(
            result.totalCost
          );
        }
      }
    }
  );

  it('keeps joint preview edits separate from target transitions and delayed initialization in both locales', () => {
    const cost = data('1510');
    const profile = cost.profiles[0];
    const initial = createDefaultCharacterTrainingTarget(cost, 0);
    const target = reconcileCharacterLevel(cost, initial, 60);
    for (const locale of ['zh-CN', 'en']) {
      const cards = view('1510', locale).profiles.base.skillCards;
      const pending = { '1510004': 12 };
      const before = createSkillPreviewControls(cards, undefined, {}, pending, 4);
      expect(before['1510004'].previewLevel).toBe(12);
      expect(before['1510004'].jointLabel).toBe(true);
      const preview = initializeSkillPreviewLevels(cards, profile, pending);
      const controls = createSkillPreviewControls(cards, profile, preview, {}, 4);
      expect(controls['1510004']).toMatchObject({
        previewLevel: 12,
        requiredPromotion: 6,
        jointLabel: true
      });
      const result = calculateCharacterTrainingTarget(cost, shared, target);
      const projected = createTrainingSkillTargets(cards, profile, result.skills, 4);
      const matches = projected.filter((skill) => skill.key === '1510:0:1510004');
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({ pointId: '1510004', trainingLevel: 6, jointLabel: true });
      expect(matches[0].availableLevels.at(-1)).toBe(6);
      expect(matches[0]).not.toHaveProperty('previewLevel');
      const raised = reconcileCharacterLevel(cost, target, 80);
      expect(raised.trainingLevels['1510:0:1510004']).toBe(6);
      expect(preview['1510:0:1510004']).toBe(12);
      const changed = {
        ...raised,
        trainingLevels: { ...raised.trainingLevels, '1510:0:1510004': 7 }
      };
      expect(calculateCharacterTrainingTarget(cost, shared, changed).skillCost).not.toEqual(
        result.skillCost
      );
      expect(preview['1510:0:1510004']).toBe(12);
      expect(() =>
        createSkillPreviewControls(cards, profile, { ...preview, '1510:0:1510004': 16 }, {}, 6)
      ).toThrow();
      expect(createTrainingSkillTargets(cards, undefined, result.skills, 4)).toEqual([]);
    }
  });

  it('uses only the current enhanced Profile, without carrying base keys into its controls', () => {
    const cost = data('1102');
    const character = view('1102');
    for (const profile of cost.profiles) {
      const target = createDefaultCharacterTrainingTarget(cost, profile.enhancedId);
      const cards = (
        profile.enhancedId === 0 ? character.profiles.base : character.profiles.enhanced!
      ).skillCards;
      const result = calculateCharacterTrainingTarget(cost, shared, target);
      expect(
        createTrainingSkillTargets(cards, profile, result.skills, result.target.promotion).every(
          (skill) => skill.key.startsWith(`1102:${profile.enhancedId}:`)
        )
      ).toBe(true);
    }
  });

  it('filters the paid trace summary after DAG changes while preserving the original display order', () => {
    const cost = data('1001');
    const profile = cost.profiles[0];
    const traces = view('1001').profiles.base.traces;
    const target = createDefaultCharacterTrainingTarget(cost, 0);
    const initial = createTrainingTraceSummary(traces, profile, target.activeTraceIds);
    expect(initial.map((trace) => trace.id)).toEqual([
      '1001101',
      '1001202',
      '1001203',
      '1001102',
      '1001205',
      '1001206',
      '1001103',
      '1001208',
      '1001209',
      '1001210',
      '1001201',
      '1001204',
      '1001207'
    ]);
    const activeIds = deactivateTrace(profile, target.activeTraceIds, '1001201');
    expect(
      createTrainingTraceSummary(traces, profile, [...activeIds].reverse()).map((trace) => trace.id)
    ).toEqual(['1001103', '1001208', '1001209', '1001210', '1001204', '1001207']);
    const restored = activateTrace(profile, activeIds, '1001102', 6);
    expect(restored.ok).toBe(true);
    expect(
      createTrainingTraceSummary(traces, profile, restored.activeTraceIds).map((trace) => trace.id)
    ).toContain('1001201');
    const lowered = reconcileCharacterLevel(
      cost,
      { ...target, activeTraceIds: restored.activeTraceIds },
      1
    );
    expect(
      createTrainingTraceSummary(traces, profile, lowered.activeTraceIds).map((trace) => trace.id)
    ).toEqual(['1001201']);
    expect(createTrainingTraceSummary(traces, profile, [])).toEqual([]);
    const memory = data('8007');
    const paid = createDefaultCharacterTrainingTarget(memory, 0).activeTraceIds;
    expect(
      createTrainingTraceSummary(view('8007').profiles.base.traces, memory.profiles[0], [
        ...paid,
        '8007501'
      ]).map((trace) => trace.id)
    ).not.toContain('8007501');
    expect(
      initial.every((trace) => traces.find((source) => source.id === trace.id) === trace)
    ).toBe(true);
  });

  it('renders complete expense categories whose sum equals the authoritative character and cone total', () => {
    const cost = data('1001');
    const initial = createDefaultCharacterTrainingTarget(cost, 0);
    const cone = json<LightConeTrainingData>('static/generated/training/light-cones/20000.json');
    for (const level of [1, 20, 21, 80]) {
      const target = reconcileCharacterLevel(cost, initial, level);
      const characterResult = calculateCharacterTrainingTarget(cost, shared, target);
      const coneResult = calculateLightConeTrainingTarget(cone, shared, {
        equipmentId: cone.equipmentId,
        level
      });
      for (const result of [characterResult, coneResult]) {
        const groups = createTrainingExpenseCosts(result);
        expect(groups.upgrade).toEqual(mergeCosts(result.expItemCost, result.expCreditCost));
        expect(groups.promotion).toBe(result.promotionCost);
        expect(groups.total).toBe(result.totalCost);
        expect(mergeCosts(groups.upgrade, groups.promotion, groups.skillTrace ?? {})).toEqual(
          result.totalCost
        );
        if (level === 1) {
          expect(groups.upgrade).toEqual({});
          expect(groups.promotion).toEqual({});
        } else expect(groups.upgrade['2']).toBe(result.expCreditCost['2']);
      }
      expect(createTrainingExpenseCosts(coneResult).skillTrace).toBeUndefined();
      expect(createTrainingExpenseCosts(characterResult).skillTrace).toEqual(
        mergeCosts(characterResult.skillCost, characterResult.traceCost)
      );
      if (level === 20) expect(characterResult.promotionCost).toEqual({});
      if (level === 21) expect(characterResult.promotionCost['2']).toBeGreaterThan(0);
    }
    const before = createTrainingExpenseCosts(
      calculateCharacterTrainingTarget(cost, shared, initial)
    );
    const afterResult = calculateCharacterTrainingTarget(cost, shared, {
      ...initial,
      activeTraceIds: deactivateTrace(cost.profiles[0], initial.activeTraceIds, '1001201')
    });
    const after = createTrainingExpenseCosts(afterResult);
    expect(before.skillTrace!['2'] - after.skillTrace!['2']).toBe(86000);
    expect(mergeCosts(after.upgrade, after.promotion, after.skillTrace!)).toEqual(after.total);
  });
});
