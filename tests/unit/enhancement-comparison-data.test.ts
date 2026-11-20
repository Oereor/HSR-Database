import { describe, expect, it } from 'vitest';
import type { CharacterDomain, NeutralSkillVariant } from '../../src/lib/domain/neutral.js';
import type { Character, SkillVariant } from '../../src/lib/domain/types.js';
import { buildEnhancementComparisons } from '../../scripts/data/domain/enhancement-comparison.js';
import { createTextResolver } from '../../scripts/data/localization.js';
import {
  comparisonSkillRows,
  projectEnhancementComparison
} from '../../scripts/data/projection/enhancement-comparison.js';
import {
  assertEnhancementComparison,
  comparisonProfileIds,
  assertComparisonProfileReferences
} from '../../scripts/data/validation/enhancement-comparison.js';

const hash = (Hash: string) => ({ Hash });

function fixture() {
  const neutralSkill = (id: string, attackType = 'Normal'): NeutralSkillVariant => ({
    id,
    attackType,
    category: 'basic',
    source: 'avatar',
    order: 0,
    levels: [],
    extraEffectIds: []
  });
  const base = [neutralSkill('11'), neutralSkill('12'), neutralSkill('13', 'BPSkill')];
  const enhanced = [neutralSkill('83'), neutralSkill('91'), neutralSkill('99', 'Ultra')];
  const character = {
    id: '1',
    profiles: {
      base: { skills: base, traces: [], eidolons: [] },
      enhanced: { skills: enhanced, traces: [], eidolons: [] }
    }
  } as unknown as CharacterDomain;
  const tables = {
    AvatarConfig: [{ AvatarID: 1, SkillList: [11, 12, 13] }],
    AvatarConfigEnhanced: [{ AvatarID: 1, EnhancedID: 9, SkillList: [83, 91, 99] }],
    AvatarSkillTreeConfig: [
      { AvatarID: 1, PointID: 40, PointType: 2, AnchorType: 'Point01', LevelUpSkillID: [11, 12] },
      {
        AvatarID: 1,
        EnhancedID: 9,
        PointID: 800,
        PointType: 2,
        AnchorType: 'Point01',
        LevelUpSkillID: [83, 91]
      }
    ],
    AvatarSkillConfig: [
      { SkillID: 12, Level: 6, ParamList: [{ Value: '1' }], SimpleParamList: [{ Value: '7' }] },
      { SkillID: 91, Level: 6, ParamList: [{ Value: '1.4' }], SimpleParamList: [{ Value: '8' }] }
    ],
    AvatarEnhancedSkill: [
      {
        AvatarID: 1,
        SkillID: 91,
        SkillTreeID: 800,
        DescBefore: hash('18446744073709551614'),
        DescAfter: hash('18446744073709551615'),
        SimpleDescBefore: hash('31'),
        SimpleDescAfter: hash('32'),
        CommentIndex: 1,
        Comment01: hash('33')
      }
    ],
    AvatarEnhancedSeason: [{ SeasonID: 5 }],
    AvatarEnhancedHintConfig: [
      { AvatarID: 1, EnhancedID: 9, SeasonID: 5, EnhancedDescNum: 1, EnhancedDesc1: hash('34') }
    ]
  };
  const profile = (skills: NeutralSkillVariant[]) => ({
    skillCards: [
      {
        category: 'basic',
        displayLabel: 'Basic',
        progressions: [],
        variants: skills.map(
          ({ id }) =>
            ({
              id,
              name: 'Test',
              levels: [{ level: 6, descriptionTokens: [{ type: 'text', value: 'Hit.' }] }]
            }) as SkillVariant
        )
      }
    ],
    traces: [],
    eidolons: []
  });
  const view = {
    name: 'Test character',
    profiles: { base: profile(base), enhanced: profile(enhanced) }
  } as unknown as Character;
  return { character, tables, view };
}

describe('character enhancement comparison data', () => {
  it('pairs ordered variants by anchored progression and emits true additions and removals', () => {
    const { character, tables } = fixture();
    const { comparisons, diagnostics } = buildEnhancementComparisons(tables, [character]);
    expect(diagnostics).toEqual([]);
    expect(
      comparisons[0].items.map(({ beforeId, afterId, declaration }) => [
        beforeId,
        afterId,
        !!declaration
      ])
    ).toEqual([
      ['12', '91', true],
      ['11', '83', false],
      ['13', null, false],
      [null, '99', false]
    ]);
  });

  it('reports ambiguous slots and avoids manufacturing additions or removals for them', () => {
    const { character, tables } = fixture();
    tables.AvatarSkillTreeConfig[1].LevelUpSkillID = [91];
    const { comparisons, diagnostics } = buildEnhancementComparisons(tables, [character]);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'association', field: 'AvatarEnhancedSkill.91' })
    );
    expect(
      comparisons[0].items.filter(
        ({ beforeId, afterId }) => ['11', '12'].includes(beforeId ?? '') || afterId === '91'
      )
    ).toEqual([]);
  });

  it.each(['zh-CN', 'en'] as const)(
    'projects independent parameters and diagnoses unusable official text in %s',
    async (locale) => {
      const { character, tables, view } = fixture();
      const { comparisons } = buildEnhancementComparisons(tables, [character]);
      const text = {
        '18446744073709551614': 'Hit for <unbreak>#1[i]%</unbreak>.',
        '18446744073709551615': 'Hit for <unbreak>#1[i]%</unbreak>.',
        '31': 'Hit #1[i].',
        '32': 'Hit #1[i].',
        '33': 'Official note',
        '34': 'Official summary'
      };
      const config = { locale, textMapCode: locale === 'en' ? ('EN' as const) : ('CHS' as const) };
      const projection = async (map: Record<string, string>) =>
        projectEnhancementComparison(
          comparisons[0],
          character,
          view,
          await createTextResolver(config, map),
          comparisonSkillRows(tables)
        );
      const { comparison, diagnostics } = await projection(text);
      assertEnhancementComparison(comparison, locale, '1');
      assertComparisonProfileReferences(comparison, {
        before: comparisonProfileIds(view.profiles.base),
        after: comparisonProfileIds(view.profiles.enhanced!)
      });
      expect(diagnostics).toEqual([]);
      expect(comparison.seasonId).toBe('5');
      const item = comparison.items[0];
      expect(item).toMatchObject({
        status: 'modified',
        level: 6,
        source: {
          kind: 'official',
          pointId: '800',
          hashes: { DescBefore: '18446744073709551614' }
        },
        before: {
          description: {
            tokens: expect.arrayContaining([expect.objectContaining({ value: '100%' })])
          }
        },
        after: {
          description: {
            tokens: expect.arrayContaining([expect.objectContaining({ value: '140%' })])
          }
        }
      });
      const fallback = await projection({
        ...text,
        '18446744073709551615': '<unsupported>Text</unsupported>'
      });
      expect(fallback.comparison.items[0]).toMatchObject({ presentation: 'simple' });
      expect(fallback.diagnostics).toContainEqual(
        expect.objectContaining({ code: 'text', field: 'skills:12.DescAfter' })
      );
      const { '18446744073709551615': _detailed, '32': _simple, ...missing } = text;
      const unavailable = await projection(missing);
      expect(unavailable.comparison.items[0]).toMatchObject({
        status: 'modified',
        presentation: 'detailed',
        after: { description: { kind: 'unavailable' } }
      });
      expect(unavailable.diagnostics.filter(({ code }) => code === 'text')).toHaveLength(2);
    }
  );
});
