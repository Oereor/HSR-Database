import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseTextHash,
  type Character,
  type CharacterProfile,
  type DataManifest,
  type LightCone,
  type RelicCatalogEntry,
  type RelicProperty,
  type RelicSet
} from '../../src/lib/domain/types';
import { ELEMENT_COLORS, getElementColor } from '../../src/lib/domain/elements';
import { formatBaseStat, getBaseStatsAtLevel } from '../../src/lib/domain/stats';
import { gameTextToPlain, parseGameText } from '../../src/lib/domain/game-text';
import type { SkillVariant } from '../../src/lib/domain/types';
import {
  resolveSpecialEffectLinkedAvatarPresentation,
  segmentSpecialEffectTriggers
} from '../../src/lib/domain/special-effects-presentation';
import { createTextResolver, loadTextMap } from '../../scripts/data/localization';
import { normalizeLevelledDescriptions } from '../../scripts/data/levelled';
import {
  assertDataRoot,
  auditRoot,
  generatedRoot,
  resolveDataRoot
} from '../../scripts/data/paths';
import type { MissingTextAudit } from '../../scripts/data/missing-text';
import { hashOf, mergeConfigSources, readTable } from '../../scripts/data/raw';
import {
  characterLdSourceNames,
  characterLdSourceSpecs
} from '../../scripts/data/character-sources';
import {
  SKILL_EFFECT_LABELS,
  normalizeSkillCombatMeta,
  normalizeStanceDisplay
} from '../../scripts/data/skill-combat';
import {
  buildSkillCards,
  isPlayerFacingSkillConfig,
  type SkillVariantInput
} from '../../scripts/data/skills';
import {
  normalizeSpecialEffectLinks,
  resolveSpecialEffectSkillLinks
} from '../../scripts/data/special-effects';
import {
  createAvatarSpecialSkillTreeAudit,
  indexAvatarSpecialSkillRelations,
  normalizeAvatarSpecialSkillRelations,
  resolveAvatarSpecialSkillRelations
} from '../../scripts/data/avatar-special-skills';
import { formatDescription, formatGameMarkup, formatGameText } from '../../scripts/data/text';

const baseProfile = (character: Character): CharacterProfile => character.profiles.base;
const variantOf = (
  character: Character,
  id: string,
  profile: CharacterProfile = baseProfile(character)
): SkillVariant | undefined =>
  profile.skillCards.flatMap((card) => card.variants).find((variant) => variant.id === id);

describe('真实数据管线', () => {
  it('只使用 HideInUI 判定玩家侧技能可见性并保留可见空描述形态', () => {
    expect(isPlayerFacingSkillConfig([{}, { HideInUI: false }], 'visible')).toBe(true);
    expect(isPlayerFacingSkillConfig([{ HideInUI: true }, { HideInUI: true }], 'hidden')).toBe(
      false
    );
    expect(() =>
      isPlayerFacingSkillConfig([{ HideInUI: true }, { HideInUI: false }], 'mixed')
    ).toThrow(/mixed.*HideInUI.*不一致/);

    const visibleWithoutDescription: SkillVariantInput = {
      id: 'visible-without-description',
      name: '公开空描述技能',
      order: 0,
      source: 'avatar',
      progressionId: 'synthetic-progression',
      scalingParamIndexes: [],
      levels: [{ level: 1, params: [], description: '', descriptionTokens: [] }],
      combatMetaLevels: [{ level: 1, combatMeta: {} }],
      category: 'skill'
    };
    expect(
      buildSkillCards([visibleWithoutDescription])[0].variants.map((variant) => variant.id)
    ).toEqual(['visible-without-description']);
  });

  it('显式 Special Effect relation 保序归一化并报告异常配置', () => {
    const normalized = normalizeSpecialEffectLinks(
      [
        {
          SkillID: 100,
          LinkToAvatarIDList: [1, 1],
          LinkToAvatarIDSimplifiedList: [2]
        },
        { SkillID: 100, LinkToAvatarIDList: [1], LinkToAvatarIDSimplifiedList: [2] },
        { SkillID: 101, LinkToAvatarIDList: [3], LinkToAvatarIDSimplifiedList: [4] },
        { SkillID: 101, LinkToAvatarIDList: [5], LinkToAvatarIDSimplifiedList: [4] },
        { SkillID: 'invalid', LinkToAvatarIDList: [], LinkToAvatarIDSimplifiedList: [] }
      ],
      [
        {
          SkillID: 202,
          LinkToAvatarID: 12,
          Order: 1,
          TarotFigurePath: 'figure-202.png',
          TarotIconPath: 'icon-202.png'
        },
        {
          SkillID: 200,
          LinkToAvatarID: 10,
          Order: 2,
          TarotFigurePath: 'figure-200.png',
          TarotIconPath: 'icon-200.png'
        },
        {
          SkillID: 201,
          LinkToAvatarID: 11,
          Order: 1,
          TarotFigurePath: 'figure-201.png',
          TarotIconPath: 'icon-201.png'
        },
        { SkillID: 203, LinkToAvatarID: 13, Order: 0, TarotFigurePath: '', TarotIconPath: '' }
      ]
    );

    expect(normalized.avatar).toEqual([
      expect.objectContaining({
        skillId: '100',
        linkedAvatarIds: ['1'],
        simplifiedLinkedAvatarIds: ['2']
      })
    ]);
    expect(normalized.servant.map((link) => link.skillId)).toEqual(['202', '201', '200']);
    expect(normalized.audit.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'duplicate-target-id',
        'duplicate-relation',
        'conflicting-relation',
        'malformed-relation',
        'duplicate-order'
      ])
    );

    const resolved = resolveSpecialEffectSkillLinks(
      normalized.servant,
      'AvatarServantSkillLink',
      new Set(['201']),
      normalized.audit
    );
    expect(resolved.map((link) => link.skillId)).toEqual(['201']);
    expect(
      normalized.audit.diagnostics.filter((diagnostic) => diagnostic.code === 'unresolved-skill')
    ).toHaveLength(2);
  });

  it('AvatarSpecialSkillTree 仅通过有效 ShowSkill relation 纳入标准技能候选', () => {
    const audit = createAvatarSpecialSkillTreeAudit();
    const normalized = normalizeAvatarSpecialSkillRelations(
      [
        { AvatarID: 1, AnchorType: 'Point21', ShowSkill: 100 },
        { AvatarID: 1, AnchorType: 'Point21', ShowSkill: 100 },
        { AvatarID: 2, AnchorType: 'Point21', ShowSkill: 101 },
        { AvatarID: 2, AnchorType: 'Point21', ShowSkill: 102 },
        { AvatarID: 3, AnchorType: 'Point21', ShowSkill: 103 },
        { AvatarID: 4, AnchorType: 'Point21', ShowSkill: 104 },
        { AvatarID: 5, AnchorType: 'Point21', ShowSkill: 105 },
        { AvatarID: 6, AnchorType: 'Point21', ShowSkill: 106 },
        { AvatarID: 7, AnchorType: 'Point21', ShowSkill: 107 },
        { AvatarID: 8, AnchorType: 'Point21', ShowSkill: 108 },
        { AvatarID: 8, AnchorType: 'Point22', ShowSkill: 108 },
        { AvatarID: 'invalid', AnchorType: '', ShowSkill: 0 }
      ],
      audit
    );
    expect(normalized.map((relation) => relation.showSkillId)).toEqual([
      '100',
      '103',
      '104',
      '105',
      '106',
      '107',
      '108'
    ]);

    const resolved = resolveAvatarSpecialSkillRelations(
      normalized,
      {
        avatarConfigsById: new Map([
          ['1', { SkillList: [100] }],
          ['3', { SkillList: [103] }],
          ['5', { SkillList: [105] }],
          ['6', { SkillList: [999] }],
          ['7', { SkillList: [107] }],
          ['8', { SkillList: [108] }]
        ]),
        avatarSkillIds: new Set(['100', '103', '106', '107', '108']),
        traceRowsByAvatarId: new Map([
          ['1', [{ PointID: 11, AnchorType: 'Point21' }]],
          ['3', [{ PointID: 31, AnchorType: 'Point20' }]],
          ['5', [{ PointID: 51, AnchorType: 'Point21' }]],
          ['6', [{ PointID: 61, AnchorType: 'Point21' }]],
          [
            '7',
            [
              { PointID: 71, AnchorType: 'Point21' },
              { PointID: 72, AnchorType: 'Point21' }
            ]
          ],
          ['8', [{ PointID: 81, AnchorType: 'Point21' }]]
        ])
      },
      audit
    );
    expect(resolved.map((relation) => relation.showSkillId)).toEqual(['100', '108']);
    expect(indexAvatarSpecialSkillRelations(resolved).get('8')?.[0]).toMatchObject({
      avatarId: '8',
      anchorType: 'Point21',
      showSkillId: '108'
    });
    expect(audit.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'malformed-relation',
        'duplicate-relation',
        'conflicting-relation',
        'unknown-avatar',
        'unresolved-show-skill',
        'unowned-show-skill',
        'missing-anchor',
        'ambiguous-anchor'
      ])
    );
  });

  it('按显式 identity 稳定合并配置来源并拒绝冲突', async () => {
    const equivalent = { id: 'same', nested: { value: '1' } };
    expect(
      mergeConfigSources(
        'SyntheticConfig',
        [
          { name: 'regular.json', rows: [equivalent] },
          {
            name: 'additional.json',
            rows: [{ nested: { value: '1' }, id: 'same' }, { id: 'additional' }]
          }
        ],
        (row) => row.id
      ).map((row) => row.id)
    ).toEqual(['same', 'additional']);
    expect(() =>
      mergeConfigSources(
        'SyntheticConfig',
        [
          { name: 'regular.json', rows: [{ id: 'same', value: 1 }] },
          { name: 'additional.json', rows: [{ id: 'same', value: 2 }] }
        ],
        (row) => row.id
      )
    ).toThrow(/SyntheticConfig record same.*regular\.json.*additional\.json/);

    const identityExamples: Record<string, [Record<string, unknown>, string]> = {
      AvatarConfig: [{ AvatarID: 1014 }, '1014'],
      ItemConfigAvatar: [{ ID: 1014 }, '1014'],
      AvatarSkillConfig: [{ SkillID: 101401, Level: 10 }, '101401:10'],
      AvatarSkillTreeConfig: [{ PointID: 1014001, EnhancedID: 0, Level: 6 }, '1014001:0:6'],
      AvatarRankConfig: [{ RankID: 101401 }, '101401'],
      AvatarPromotionConfig: [{ AvatarID: 1014, MaxLevel: 80 }, '1014:80'],
      AvatarEquipRecommend: [{ AvatarID: 1014 }, '1014'],
      AvatarRelicRecommend: [{ AvatarID: 1014 }, '1014']
    };
    for (const spec of characterLdSourceSpecs) {
      const [row, expectedIdentity] = identityExamples[spec.tableName];
      expect(spec.identityOf(row)).toBe(expectedIdentity);
      const regular = await readTable<any>(assertDataRoot(), spec.tableName);
      const additional = await readTable<any>(assertDataRoot(), spec.additionalName);
      expect(
        mergeConfigSources(
          spec.tableName,
          [
            { name: `${spec.tableName}.json`, rows: regular },
            { name: `${spec.additionalName}.json`, rows: additional }
          ],
          spec.identityOf
        )
      ).toHaveLength(regular.length + additional.length);
    }
    expect(characterLdSourceNames).toHaveLength(8);
  });

  it('解析并验证默认上游路径', () => {
    expect(resolveDataRoot()).toMatch(/TurnBasedGameData$/);
    expect(assertDataRoot()).toBe(resolveDataRoot());
  });

  it('无损保留超过安全整数范围的文本 Hash', async () => {
    const rows = await readTable<any>(assertDataRoot(), 'AvatarConfig');
    expect(rows.find((row) => row.AvatarID === 1001).AvatarName.Hash).toBe('6186714091647966180');
  });

  it('以 XXHash64 解析遗器符号文本键', async () => {
    const resolver = await createTextResolver({
      '12720770977431568614': '治疗量提高#1[i]%。',
      '4745092278950904325': '在战斗开始时，立即为我方恢复1个战技点。'
    });
    expect(
      resolver.resolveSymbolic('RelicDesc_1012', {
        entity: 'relic-set',
        id: '101',
        field: 'SkillDesc'
      })
    ).toContain('治疗量');
    expect(
      resolver.resolveSymbolic('RelicDesc_1014', {
        entity: 'relic-set',
        id: '101',
        field: 'SkillDesc'
      })
    ).toContain('战技点');
  });

  it('区分直接 Hash 与符号文本键', async () => {
    const textMap = await loadTextMap(assertDataRoot());
    const resolver = await createTextResolver(textMap);
    expect(
      resolver.resolveHash(parseTextHash('6186714091647966180')!, {
        entity: 'character',
        id: '1001',
        field: 'AvatarName'
      })
    ).toBe('三月七');
    expect(
      resolver.resolveSymbolic('SkillPointName_1001101', {
        entity: 'character-trace',
        id: '1001101',
        field: 'PointName'
      })
    ).toBe('纯洁');
    expect(
      resolver.resolveSymbolic('AvatarRankName_100101', {
        entity: 'character-eidolon',
        id: '100101',
        field: 'Name'
      })
    ).toBe('记忆中的你');
  });

  it('通过统一 resolver 解析真实技能名与描述', async () => {
    const skills = await readTable<any>(assertDataRoot(), 'AvatarSkillConfig');
    const level = skills.find((row) => row.SkillID === 100101 && row.Level === 1);
    const resolver = await createTextResolver(await loadTextMap(assertDataRoot()));
    expect(
      resolver.resolveRef(level.SkillName, {
        entity: 'character-skill',
        id: '100101',
        field: 'SkillName'
      })
    ).toBe('极寒的弓矢');
    expect(
      resolver.resolveRef(level.SkillDesc, {
        entity: 'character-skill',
        id: '100101:1',
        field: 'SkillDesc'
      })
    ).toContain('#1[i]%');
  });

  it('区分空源字段、未解析 Hash 与异常 Hash 表示', async () => {
    const source = { entity: 'test', id: '1', field: 'Text' };
    const resolver = await createTextResolver({});
    expect(resolver.resolveRef(undefined, source)).toBe('');
    expect(resolver.getDiagnostics()['unresolved-hash'].count).toBe(0);

    expect(resolver.resolveHash(parseTextHash('9999999999999999999')!, source)).toBe('');
    expect(resolver.getDiagnostics()['unresolved-hash']).toMatchObject({ count: 1 });

    const unsafeNumericHash = Number.MAX_SAFE_INTEGER + 1;
    expect(resolver.resolveRef({ Hash: unsafeNumericHash }, source)).toBe('');
    expect(resolver.getDiagnostics()['invalid-reference']).toMatchObject({ count: 1 });
    expect(hashOf({ Hash: unsafeNumericHash })).toBeUndefined();
    expect(parseTextHash(unsafeNumericHash)).toBeUndefined();
    expect(parseTextHash('not-a-decimal-hash')).toBeUndefined();
  });

  it('安全插值并移除游戏富文本标签', () => {
    expect(formatGameText('造成<color=#fff>#1[i]%</color>伤害。', [0.5])).toBe('造成50%伤害。');
  });

  it('统一恢复游戏文本换行并安全解析白名单 markup', () => {
    expect(gameTextToPlain('第一行\\n第二行\n第三行')).toBe('第一行\n第二行\n第三行');
    expect(parseGameText('<color=#f29e38ff>毁灭</color>命途专属')).toEqual([
      { value: '毁灭', color: '#f29e38ff' },
      { value: '命途专属' }
    ]);
    expect(parseGameText('<color=#f29e38>毁灭</color>')).toEqual([
      { value: '毁灭', color: '#f29e38' }
    ]);
    expect(parseGameText('<i>引文</i><unbreak>LV.999</unbreak>')).toEqual([
      { value: '引文', italic: true },
      { value: 'LV.999', unbreak: true }
    ]);
    expect(parseGameText('普通<u>下划线</u>文本')).toEqual([
      { value: '普通' },
      { value: '下划线', underline: true },
      { value: '文本' }
    ]);
    expect(parseGameText('A<u>B</u>C<u>D</u>')).toEqual([
      { value: 'A' },
      { value: 'B', underline: true },
      { value: 'C' },
      { value: 'D', underline: true }
    ]);
    expect(
      parseGameText('<color=#f29e38ff><i><unbreak>15%</unbreak></i></color><u>基础概率</u>')
    ).toEqual([
      { value: '15%', color: '#f29e38ff', italic: true, unbreak: true },
      { value: '基础概率', underline: true }
    ]);
    expect(gameTextToPlain('<u>弱点击破</u>')).toBe('弱点击破');
    const specialEffectTokens = parseGameText(
      '<color=#f9b0f0><u><unbreak><icon SpriteName=AvatarCyrene id=0 width=1 height=1>特</unbreak>殊效果</u></color>'
    );
    expect(specialEffectTokens).toEqual([
      {
        value: '',
        icon: { spriteName: 'AvatarCyrene', id: 0, width: 1, height: 1 },
        color: '#f9b0f0',
        underline: true,
        unbreak: true
      },
      { value: '特', color: '#f9b0f0', underline: true, unbreak: true },
      { value: '殊效果', color: '#f9b0f0', underline: true }
    ]);
    expect(
      segmentSpecialEffectTriggers(
        specialEffectTokens.map((token) => ({
          type: token.icon ? 'icon' : 'text',
          value: token.value,
          ...(token.icon ? { icon: token.icon } : {}),
          ...(token.color ? { color: token.color } : {}),
          ...(token.underline ? { underline: true } : {}),
          ...(token.unbreak ? { unbreak: true } : {})
        })),
        true
      )
    ).toHaveLength(1);
    expect(
      segmentSpecialEffectTriggers(
        specialEffectTokens.map((token) => ({
          type: token.icon ? 'icon' : 'text',
          value: token.value,
          ...(token.icon ? { icon: token.icon } : {}),
          ...(token.color ? { color: token.color } : {}),
          ...(token.underline ? { underline: true } : {}),
          ...(token.unbreak ? { unbreak: true } : {})
        })),
        false
      )[0]?.kind
    ).toBe('text');
    expect(
      segmentSpecialEffectTriggers(
        [{ type: 'text', value: '特殊效果', color: '#f9b0f0', underline: true }],
        true
      )[0]?.kind
    ).toBe('text');
    expect(parseGameText('<u><icon SpriteName=../unsafe id=no>特殊效果</u>')).toEqual([
      { value: '特殊效果', underline: true }
    ]);
    expect(gameTextToPlain('<script>alert(1)</script><unknown>可读文本</unknown>')).toBe(
      'alert(1)可读文本'
    );
  });

  it('只将跨真实等级变化的参数标记为动态值', () => {
    const normalized = normalizeLevelledDescriptions([
      {
        level: 1,
        params: [0.12, 3],
        template: '战斗开始时，使装备者的暴击率提高#1[i]%，持续#2[i]回合。'
      },
      {
        level: 5,
        params: [0.24, 3],
        template: '战斗开始时，使装备者的暴击率提高#1[i]%，持续#2[i]回合。'
      }
    ]);
    expect(normalized.scalingParamIndexes).toEqual([0]);
    expect(normalized.levels[0].descriptionTokens).toEqual([
      { type: 'text', value: '战斗开始时，使装备者的暴击率提高' },
      { type: 'scaling-value', value: '12%' },
      { type: 'text', value: '，持续3回合。' }
    ]);
  });

  it('分级描述在参数插值后保留安全富文本语义', () => {
    expect(
      formatDescription(
        '<color=#f29e38ff><unbreak>#1[i]%</unbreak></color><u>基础概率</u>',
        [0.5],
        new Set([0])
      )
    ).toEqual({
      description: '50%基础概率',
      descriptionTokens: [
        {
          type: 'scaling-value',
          value: '50%',
          color: '#f29e38ff',
          unbreak: true
        },
        { type: 'text', value: '基础概率', underline: true }
      ],
      diagnostics: []
    });
  });

  it('稳定格式化浮点数并对缺失参数降级', () => {
    expect(formatDescription('数值#1%', [0.1 + 0.2]).description).toBe('数值30%');
    const missing = formatDescription('提高#2[i]%。', [0.12], new Set([1]));
    expect(missing.description).toBe('提高#2[i]%。');
    expect(missing.descriptionTokens).toEqual([{ type: 'text', value: '提高#2[i]%。' }]);
    expect(missing.diagnostics).toEqual([
      { code: 'missing-param', parameterIndex: 1, placeholder: '#2[i]%' }
    ]);
  });

  it('按独立语义规范化特殊资源与战技点', () => {
    expect(normalizeSkillCombatMeta({ bpNeed: -1, bpAdd: 1 })).toEqual({
      battlePointDelta: 1
    });
    expect(normalizeSkillCombatMeta({ bpNeed: 1 })).toEqual({ battlePointDelta: -1 });
    expect(normalizeSkillCombatMeta({ bpNeed: 3 })).toEqual({ battlePointDelta: -3 });
    expect(
      normalizeSkillCombatMeta({ specialResource: '<unbreak>40%</unbreak>生命值', bpNeed: 1 })
    ).toEqual({
      specialResource: '<unbreak>40%</unbreak>生命值',
      battlePointDelta: -1
    });
    expect(normalizeSkillCombatMeta({ bpNeed: -1 })).toEqual({});
    expect(() => normalizeSkillCombatMeta({ bpNeed: 1, bpAdd: 1 })).toThrow(/BPNeed/);
  });

  it('优先将 ShowStanceList 转换为语义削韧并保留单值降级', () => {
    expect(normalizeStanceDisplay([{ Value: 60 }, { Value: 0 }, { Value: 30 }])).toEqual([
      { type: 'single', value: 20 },
      { type: 'blast', value: 10 }
    ]);
    expect(normalizeStanceDisplay([{ Value: 10 }, { Value: 0 }, { Value: 0 }])).toEqual([
      { type: 'single', value: 10 / 3 }
    ]);
    expect(
      normalizeSkillCombatMeta({
        showStanceList: [{ Value: 60 }, { Value: 0 }, { Value: 30 }],
        stanceDamageDisplay: 20
      })
    ).toEqual({
      stanceDisplay: [
        { type: 'single', value: 20 },
        { type: 'blast', value: 10 }
      ]
    });
    expect(
      normalizeSkillCombatMeta({
        showStanceList: [{ Value: 0 }, { Value: 0 }, { Value: 0 }],
        stanceDamageDisplay: 20
      })
    ).toEqual({ toughnessDamage: 20 });
    expect(
      normalizeSkillCombatMeta({
        showStanceList: [{ Value: Number.NaN }, { Value: 'invalid' }, {}],
        stanceDamageDisplay: 20
      })
    ).toEqual({ toughnessDamage: 20 });
    expect(normalizeSkillCombatMeta({ stanceDamageDisplay: 20 })).toEqual({
      toughnessDamage: 20
    });
  });

  it('保留 SkillNeed 安全 markup 并插值真实参数', () => {
    const formatted = formatGameMarkup(
      '<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>生命值',
      [0.25]
    );
    expect(formatted).toEqual({
      text: '<color=#f29e38ff><unbreak>25%</unbreak></color>生命值',
      diagnostics: [],
      usedParameterIndexes: [0]
    });
    expect(parseGameText(formatted.text)[0]).toMatchObject({
      value: '25%',
      color: '#f29e38ff',
      unbreak: true
    });
  });

  it('覆盖当前所有真实 SkillEffect 并对未知值降级', () => {
    expect(SKILL_EFFECT_LABELS).toEqual({
      SingleAttack: '单攻',
      Blast: '扩散',
      AoEAttack: '群攻',
      Bounce: '弹射',
      Enhance: '强化',
      Impair: '妨害',
      Support: '辅助',
      Defence: '防御',
      Restore: '回复',
      Summon: '召唤',
      MazeAttack: '秘技攻击'
    });
    expect(normalizeSkillCombatMeta({ skillEffect: 'FutureEffect' }).effect).toEqual({
      code: 'FutureEffect',
      label: 'FutureEffect',
      known: false
    });
  });

  it('生成数据包含已确认的真实关联对象', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(generatedRoot, 'manifest.json'), 'utf8')
    ) as DataManifest;
    const character = JSON.parse(
      await readFile(path.join(generatedRoot, 'details', 'characters', '1001.json'), 'utf8')
    ) as Character;
    const lightCone = JSON.parse(
      await readFile(path.join(generatedRoot, 'details', 'light-cones', '20000.json'), 'utf8')
    ) as LightCone;
    expect(manifest.counts.characters).toBe(97);
    expect(manifest.schemaVersion).toBe(32);
    expect(manifest.gameVersionFull).toBe('4.5.0');
    expect(manifest.gameVersion).toBe('4.5');
    expect(manifest.language).toBe('CHS');
    expect(character.name).toBe('三月七·存护');
    const basicAttack = variantOf(character, '100101');
    expect(basicAttack?.levels.map((level) => level.level)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10
    ]);
    expect(basicAttack?.levels[0].description).toContain('50%');
    expect(basicAttack?.levels.at(-1)?.description).toContain('140%');
    expect(basicAttack?.scalingParamIndexes).toEqual([0]);
    const purity = baseProfile(character).traces.find((trace) => trace.id === '1001101');
    expect(purity).toMatchObject({
      name: '纯洁',
      type: 'ability',
      sourcePointType: 3,
      promotionLimit: 2,
      prerequisiteIds: ['1001201'],
      anchorOrder: 6
    });
    expect(purity?.description).toContain('<u>负面效果</u>');
    expect(purity?.extraEffects).toEqual([
      expect.objectContaining({ id: '10000010', name: '负面效果' })
    ]);
    expect(baseProfile(character).traces.find((trace) => trace.id === '1001103')).toMatchObject({
      description: expect.stringContaining('<u>基础概率</u>'),
      extraEffects: [expect.objectContaining({ id: '30000001' })]
    });
    expect(purity).not.toHaveProperty('levels');
    expect(baseProfile(character).traces.find((trace) => trace.id === '1001201')).toMatchObject({
      type: 'stat',
      sourcePointType: 1,
      prerequisiteIds: [],
      anchorOrder: 9
    });
    expect(baseProfile(character).traces.find((trace) => trace.id === '1001201')?.description).toBe(
      '冰属性伤害提高3.2%'
    );
    expect(baseProfile(character).traces.find((trace) => trace.id === '1001202')?.description).toBe(
      '防御力提高5.0%'
    );
    expect(baseProfile(character).eidolons[0].name).toBe('记忆中的你');
    expect(baseProfile(character).eidolons[0]).not.toHaveProperty('extraEffects');
    expect(
      baseProfile(character).eidolons.find((eidolon) => eidolon.id === '100104')
    ).toMatchObject({
      description: expect.stringContaining('<u>反击</u>'),
      extraEffects: [expect.objectContaining({ id: '10000003', name: '反击' })]
    });
    expect(lightCone.name).toBe('锋镝');
    expect(lightCone.passive).toMatchObject({ id: '20000', name: '危机' });
    expect(lightCone.passive.superimposition.levels).toHaveLength(5);
  });

  it('记忆开拓者保留第四项额外能力的结构化类型', async () => {
    for (const id of ['8007', '8008']) {
      const character = JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'characters', `${id}.json`), 'utf8')
      ) as Character;
      const abilities = baseProfile(character).traces.filter((trace) => trace.type === 'ability');
      expect(abilities).toHaveLength(4);
      expect(abilities.filter((trace) => trace.name === '未完的尾声')).toEqual([
        expect.objectContaining({ sourcePointType: 5, anchorOrder: 21 })
      ]);
    }
  });

  it('将四名 LD 角色完整纳入同一 Character domain 与搜索索引', async () => {
    const search = JSON.parse(
      await readFile(path.join(process.cwd(), 'static', 'generated', 'search.json'), 'utf8')
    ) as Array<{ id: string; kind: string; name: string }>;
    for (const [id, name, pathName, elementName] of [
      ['1014', 'Saber', '毁灭', '风'],
      ['1015', 'Archer', '巡猎', '量子'],
      ['1508', '远坂凛', '智识', '量子'],
      ['1509', '吉尔伽美什', '毁灭', '雷']
    ] as const) {
      const character = JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'characters', `${id}.json`), 'utf8')
      ) as Character;
      expect(character).toMatchObject({ id, name, rarity: 5, pathName, elementName });
      expect(character.baseStats).toMatchObject({ minLevel: 1, maxLevel: 80, defaultLevel: 80 });
      expect(baseProfile(character).skillCards).toHaveLength(5);
      expect(baseProfile(character).traces).toHaveLength(13);
      expect(baseProfile(character).eidolons).toHaveLength(6);
      expect(search).toContainEqual(expect.objectContaining({ id, kind: 'character', name }));
    }
  });

  it('将 Global Buff 作为同一 Talent Card 的静态普通形态', async () => {
    for (const [id, expected] of [
      [
        '1407',
        {
          ids: ['140704', '140704:global-buff:1'],
          name: '月茧之庇',
          description: '月茧',
          extraEffectId: '10000007'
        }
      ],
      [
        '1506',
        {
          ids: ['150604', '150604:global-buff:1'],
          name: '999安全卫士',
          description: '防火墙',
          extraEffectId: '10000011'
        }
      ]
    ] as const) {
      const character = JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'characters', `${id}.json`), 'utf8')
      ) as Character;
      const talentCards = baseProfile(character).skillCards.filter(
        (card) => card.category === 'talent'
      );
      expect(talentCards).toHaveLength(1);
      expect(talentCards[0].variants.map((variant) => variant.id)).toEqual(expected.ids);
      const globalBuff = talentCards[0].variants[1];
      expect(globalBuff).toMatchObject({
        source: 'avatar-global-buff',
        progressionId: null
      });
      expect(gameTextToPlain(globalBuff.name)).toBe(expected.name);
      expect(gameTextToPlain(globalBuff.levels[0].description)).toContain(expected.description);
      expect(globalBuff.combatMeta.extraEffects?.[0]?.id).toBe(expected.extraEffectId);
    }
  });

  it('将真实缺失文本稳定分类且程序错误为零', async () => {
    const audit = JSON.parse(await readFile(path.join(auditRoot, 'latest.json'), 'utf8')) as {
      missingTextAudit: MissingTextAudit;
    };
    const missing = audit.missingTextAudit;
    expect(missing.D.count).toBe(0);
    expect(missing.A.count).toBe(1711);
    expect(missing.A.groups).toContainEqual({
      reason: 'missing-source-field',
      entity: 'character-trace',
      field: 'PointDesc',
      count: 1070
    });
    expect(
      missing.A.groups.some(
        (group) => group.entity === 'avatar-skill' || group.entity === 'memosprite-skill'
      )
    ).toBe(false);
    expect(missing.A.groups.some((group) => group.entity === 'item')).toBe(false);
    expect(missing.B.groups).toContainEqual({
      reason: 'unsupported-icon-markup',
      entity: 'avatar-skill',
      field: 'SkillDesc',
      count: 15
    });
    expect(missing.C.count).toBe(0);
  });

  it('光锥叠影保留真实等级并只高亮变化参数', async () => {
    const readLightCone = async (id: string) =>
      JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'light-cones', `${id}.json`), 'utf8')
      ) as LightCone;
    const arrows = await readLightCone('20000');
    const amber = await readLightCone('20003');
    const resolution = await readLightCone('21015');
    const trend = await readLightCone('21016');
    const night = await readLightCone('23000');

    expect(arrows.passive).toMatchObject({ id: '20000', name: '危机' });
    expect(arrows.passive.superimposition.levels.map((level) => level.level)).toEqual([
      1, 2, 3, 4, 5
    ]);
    expect(arrows.passive.superimposition.scalingParamIndexes).toEqual([0]);
    expect(
      arrows.passive.superimposition.levels[0].descriptionTokens.filter(
        (token) => token.type === 'scaling-value'
      )
    ).toEqual([{ type: 'scaling-value', value: '12%', color: '#f29e38ff', unbreak: true }]);
    expect(arrows.passive.superimposition.levels.at(-1)?.description).toContain('24%');
    expect(amber.passive.superimposition.scalingParamIndexes).toEqual([0, 2]);
    expect(resolution.passive.superimposition.scalingParamIndexes).toEqual([0, 1]);
    expect(trend.passive.superimposition.scalingParamIndexes).toEqual([0, 1, 2]);
    expect(resolution.passive).toMatchObject({ id: '21015', name: '回眸' });
    expect(night).toMatchObject({
      id: '23000',
      name: '银河铁道之夜',
      rarity: 5,
      path: 'Mage',
      pathName: '智识',
      passive: { id: '23000', name: '流星群' }
    });
  });

  it('七种属性文字颜色来自唯一规范映射', () => {
    expect(ELEMENT_COLORS).toEqual({
      Physical: '#b6b6b6',
      Fire: '#f25740',
      Ice: '#6dc4ea',
      Lightning: '#d46aeb',
      Wind: '#7ad8a5',
      Quantum: '#8a86de',
      Imaginary: '#fee554'
    });
    expect(getElementColor('Thunder')).toBe('#d46aeb');
    expect(getElementColor('Unknown')).toBe('inherit');
  });

  it('生成的展示模型完全不携带图片路径', async () => {
    const character = JSON.parse(
      await readFile(path.join(generatedRoot, 'details', 'characters', '1001.json'), 'utf8')
    );
    expect(character).not.toHaveProperty('imagePath');
    expect(baseProfile(character).skillCards[0].variants[0]).not.toHaveProperty('iconPath');
  });

  it('保留代表性角色的真实技能等级边界并按 HideInUI 隐藏内部技能', async () => {
    const readCharacter = async (id: string) =>
      JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'characters', `${id}.json`), 'utf8')
      ) as Character;
    const robin = await readCharacter('1309');
    const blade = await readCharacter('1507');
    const imbibitorLunae = await readCharacter('1213');

    expect(variantOf(robin, '130903')?.levels).toHaveLength(15);
    expect(variantOf(robin, '130903')?.levels[0].description).toContain('15.2%+50点');
    expect(
      variantOf(robin, '130903')
        ?.levels[0].descriptionTokens.filter((token) => token.type === 'scaling-value')
        .map((token) => token.value)
    ).toEqual(['15.2%', '50', '72%']);
    expect(variantOf(blade, '150709')).toBeUndefined();
    expect(variantOf(imbibitorLunae, '121309')).toBeUndefined();
  });

  it('按真实多命途关系生成统一角色显示名', async () => {
    const readCharacter = async (id: string) =>
      JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'characters', `${id}.json`), 'utf8')
      ) as Character;
    expect((await readCharacter('1001')).name).toBe('三月七·存护');
    expect((await readCharacter('1224')).name).toBe('三月七·巡猎');
    expect((await readCharacter('8005')).name).toBe('开拓者·同谐');
    expect((await readCharacter('1309')).name).toBe('知更鸟');
  });

  it('按语义类别合并技能变体并保留真实默认等级', async () => {
    const readCharacter = async (id: string) =>
      JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'characters', `${id}.json`), 'utf8')
      ) as Character;
    const imbibitorLunae = await readCharacter('1213');
    const theHerta = await readCharacter('1401');
    const basic = baseProfile(imbibitorLunae).skillCards.find((card) => card.category === 'basic')!;
    const skill = baseProfile(theHerta).skillCards.find((card) => card.category === 'skill')!;
    expect(basic.variants.map((variant) => variant.id)).toEqual([
      '121301',
      '121308',
      '121310',
      '121312'
    ]);
    expect(basic.progressions).toHaveLength(1);
    expect(basic.progressions[0].defaultLevel).toBe(6);
    expect(skill.variants.map((variant) => variant.id)).toEqual(['140102', '140109']);
    expect(skill.progressions[0].defaultLevel).toBe(10);
    expect(
      baseProfile(imbibitorLunae).skillCards.filter((card) => card.category === 'basic')
    ).toHaveLength(1);
  });

  it('为每个真实 Skill Variant 生成独立战斗元数据', async () => {
    const readCharacter = async (id: string) =>
      JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'characters', `${id}.json`), 'utf8')
      ) as Character;
    const march = await readCharacter('1001');
    const imbibitorLunae = await readCharacter('1213');
    const castorice = await readCharacter('1407');
    const firefly = await readCharacter('1310');
    const theHerta = await readCharacter('1401');

    expect(variantOf(march, '100101')?.combatMeta).toEqual({
      effect: { code: 'SingleAttack', label: '单攻', known: true },
      battlePointDelta: 1,
      energyGain: 20,
      stanceDisplay: [{ type: 'single', value: 10 }]
    });
    expect(variantOf(march, '100102')?.combatMeta).toEqual({
      effect: { code: 'Defence', label: '防御', known: true },
      battlePointDelta: -1,
      energyGain: 30
    });

    expect(
      ['121301', '121308', '121310', '121312'].map(
        (id) => variantOf(imbibitorLunae, id)?.combatMeta
      )
    ).toMatchObject([
      { battlePointDelta: 1, energyGain: 20, stanceDisplay: [{ type: 'single', value: 10 }] },
      { battlePointDelta: -1, energyGain: 30, stanceDisplay: [{ type: 'single', value: 20 }] },
      {
        battlePointDelta: -2,
        energyGain: 35,
        stanceDisplay: [
          { type: 'single', value: 30 },
          { type: 'blast', value: 10 }
        ]
      },
      {
        battlePointDelta: -3,
        energyGain: 40,
        stanceDisplay: [
          { type: 'single', value: 40 },
          { type: 'blast', value: 20 }
        ]
      }
    ]);

    expect(variantOf(firefly, '131002')?.combatMeta).toMatchObject({
      specialResource: '<unbreak>40%</unbreak>生命值',
      battlePointDelta: -1
    });
    expect(variantOf(firefly, '1131002', firefly.profiles.enhanced!)?.combatMeta).toMatchObject({
      specialResource: '<unbreak>40%</unbreak>生命值',
      battlePointDelta: -1
    });
    expect(variantOf(castorice, '140702')?.combatMeta).toMatchObject({
      specialResource: '<unbreak>30%</unbreak>我方全体当前生命值',
      stanceDisplay: [
        { type: 'single', value: 20 },
        { type: 'blast', value: 10 }
      ]
    });
    expect(variantOf(castorice, '140702')?.combatMeta).not.toHaveProperty('battlePointDelta');
    expect(variantOf(castorice, '1140702')?.combatMeta).toMatchObject({
      effect: { code: 'AoEAttack', label: '群攻', known: true },
      stanceDisplay: [{ type: 'aoe', value: 10 }]
    });
    expect(variantOf(theHerta, '140102')?.combatMeta.stanceDisplay).toEqual([
      { type: 'single', value: 15 },
      { type: 'blast', value: 10 }
    ]);
    expect(variantOf(theHerta, '140109')?.combatMeta.stanceDisplay).toEqual([
      { type: 'single', value: 20 },
      { type: 'blast', value: 10 }
    ]);
    expect(variantOf(theHerta, '140109')?.combatMeta).not.toHaveProperty('toughnessDamage');
  });

  it('角色 ExtraEffect 按技能变体归属，并对完整/简略列表保序去重', async () => {
    const readCharacter = async (id: string) =>
      JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'characters', `${id}.json`), 'utf8')
      ) as Character;
    const huntMarch = await readCharacter('1224');
    const sushang = await readCharacter('1206');

    expect(variantOf(huntMarch, '122401')?.combatMeta.extraEffects).toBeUndefined();
    expect(variantOf(huntMarch, '122408')?.combatMeta.extraEffects).toEqual([
      expect.objectContaining({ id: '30000002', name: '固定概率' })
    ]);
    expect(
      variantOf(sushang, '120602')?.combatMeta.extraEffects?.map((effect) => effect.id)
    ).toEqual(['10000005', '10000006']);
  });

  it('行迹与星魂 ExtraEffect 绑定对应实体并保留多效果顺序', async () => {
    const character = JSON.parse(
      await readFile(path.join(generatedRoot, 'details', 'characters', '1005.json'), 'utf8')
    ) as Character;
    expect(
      baseProfile(character)
        .traces.find((trace) => trace.id === '1005103')
        ?.extraEffects?.map((effect) => effect.id)
    ).toEqual(['10000004', '30000001']);
    expect(
      baseProfile(character)
        .eidolons.find((eidolon) => eidolon.id === '100501')
        ?.extraEffects?.map((effect) => effect.id)
    ).toEqual(['10000004', '30000001']);
    expect(
      baseProfile(character).eidolons.find((eidolon) => eidolon.id === '100501')?.description
    ).toContain('<u>追加攻击</u>');
  });

  it('通过 PointType 4 关系生成忆灵技并清除错误行迹重复', async () => {
    const aglaea = JSON.parse(
      await readFile(path.join(generatedRoot, 'details', 'characters', '1402.json'), 'utf8')
    ) as Character;
    expect(
      baseProfile(aglaea).skillCards.find((card) => card.category === 'memosprite-skill')?.variants
    ).toHaveLength(1);
    expect(
      baseProfile(aglaea).skillCards.find((card) => card.category === 'memosprite-talent')?.variants
    ).toHaveLength(3);
    expect(
      baseProfile(aglaea).traces.some((trace) => trace.id === '1402301' || trace.id === '1402302')
    ).toBe(false);
  });

  it('按来源配置过滤隐藏技能而不破坏公开技能卡', async () => {
    const readCharacter = async (id: string) =>
      JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'characters', `${id}.json`), 'utf8')
      ) as Character;
    const castorice = await readCharacter('1407');
    const acheron = await readCharacter('1308');
    const sparkle = await readCharacter('1501');
    const gilgamesh = await readCharacter('1509');
    const archer = await readCharacter('1015');
    const departingHimeko = await readCharacter('1510');
    const remembranceTrailblazer = await readCharacter('8007');
    const remembranceTrailblazerFemale = await readCharacter('8008');
    const cyrene = await readCharacter('1415');
    const castoriceSkill = baseProfile(castorice).skillCards.find(
      (card) => card.category === 'memosprite-skill'
    )!;

    expect(castoriceSkill.variants.map((variant) => variant.id)).toEqual(['1140701', '1140702']);
    expect(castoriceSkill.variants.every((variant) => variant.levels[0].description)).toBe(true);
    expect(
      baseProfile(acheron)
        .skillCards.find((card) => card.category === 'ultimate')
        ?.variants.map((variant) => variant.id)
    ).toEqual(['130803']);
    expect(variantOf(sparkle, '150110')).toBeUndefined();
    expect(
      baseProfile(gilgamesh)
        .skillCards.find((card) => card.category === 'basic')
        ?.variants.map((variant) => variant.id)
    ).toEqual(['150901']);
    expect(
      baseProfile(gilgamesh)
        .skillCards.find((card) => card.category === 'skill')
        ?.variants.map((variant) => variant.id)
    ).toEqual(['150902']);
    expect(variantOf(archer, '101509')).toBeUndefined();
    expect(
      baseProfile(departingHimeko)
        .skillCards.find((card) => card.category === 'assist')
        ?.variants.map((variant) => variant.id)
    ).toEqual(['151022']);
    expect(
      baseProfile(remembranceTrailblazer)
        .skillCards.find((card) => card.category === 'basic')
        ?.variants.map((variant) => variant.id)
    ).toEqual(['800701', '800708']);
    expect(
      baseProfile(remembranceTrailblazerFemale)
        .skillCards.find((card) => card.category === 'basic')
        ?.variants.map((variant) => variant.id)
    ).toEqual(['800801', '800808']);
    for (const [character, progressionId, shownSkillId, hiddenSkillId] of [
      [remembranceTrailblazer, '8007001', '800708', '800709'],
      [remembranceTrailblazerFemale, '8008001', '800808', '800809']
    ] as const) {
      const basicCard = baseProfile(character).skillCards.find(
        (card) => card.category === 'basic'
      )!;
      expect(basicCard.progressions).toEqual([
        expect.objectContaining({
          id: progressionId,
          variantIds: basicCard.variants.map((variant) => variant.id)
        })
      ]);
      expect(variantOf(character, shownSkillId)).toMatchObject({
        attackType: 'Normal',
        combatMeta: {
          effect: expect.objectContaining({ code: 'AoEAttack', label: '群攻' }),
          extraEffects: [
            expect.objectContaining({ id: '10000011' }),
            expect.objectContaining({ id: '10000019' })
          ]
        }
      });
      expect(variantOf(character, shownSkillId)?.levels).toHaveLength(10);
      expect(variantOf(character, hiddenSkillId)).toBeUndefined();
    }
    expect(
      baseProfile(cyrene)
        .skillCards.find((card) => card.category === 'memosprite-skill')
        ?.variants.map((variant) => variant.id)
    ).toEqual(['1141501', '1141502']);
    const castoriceTalent = baseProfile(castorice).skillCards.find(
      (card) => card.category === 'memosprite-talent'
    )!;
    expect(castoriceTalent.variants.map((variant) => variant.id)).toContain('1140706');
    expect(castoriceTalent.variants.map((variant) => variant.id)).not.toContain('1140712');
    expect(castoriceSkill.progressions).toHaveLength(1);
    expect(castoriceTalent.progressions).toHaveLength(1);
    expect(baseProfile(castorice).traces.find((trace) => trace.id === '1407202')?.description).toBe(
      '量子属性伤害提高3.2%'
    );
    expect(baseProfile(castorice).traces.find((trace) => trace.id === '1407204')?.description).toBe(
      '暴击伤害提高5.3%'
    );
  });

  it('通过完整技能索引解析隐藏 Special Effect，同时保持标准技能列表隔离', async () => {
    const readCharacter = async (id: string) =>
      JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'characters', `${id}.json`), 'utf8')
      ) as Character;
    const [gilgamesh, cyrene, departingHimeko] = await Promise.all(
      ['1509', '1415', '1510'].map(readCharacter)
    );

    expect(variantOf(gilgamesh, '150909')).toBeUndefined();
    expect(baseProfile(gilgamesh).specialEffects).toEqual([]);

    expect(
      baseProfile(cyrene)
        .skillCards.find((card) => card.category === 'memosprite-skill')
        ?.variants.map((variant) => variant.id)
    ).toEqual(['1141501', '1141502']);
    const cyreneEffects = baseProfile(cyrene).specialEffects;
    expect(cyreneEffects).toHaveLength(14);
    expect(cyreneEffects.map((entry) => entry.skill.id)).toEqual([
      '1141526',
      '1141521',
      '1141518',
      '1141514',
      '1141516',
      '1141517',
      '1141520',
      '1141515',
      '1141523',
      '1141524',
      '1141519',
      '1141522',
      '1141525',
      '1141513'
    ]);
    expect(cyreneEffects[0]).toMatchObject({
      kind: 'servant-skill-link',
      order: 1,
      linkedAvatarId: '1415',
      tarotFigurePath: 'SpriteOutput/UI/Avatar/Special/Special_1415/CardFigure/CardFigure_1415.png',
      tarotIconPath: 'SpriteOutput/UI/Avatar/Special/Special_1415/Card/Card_1415.png',
      skill: { id: '1141526', source: 'memosprite' }
    });
    expect(cyreneEffects[0].skill.levels).toHaveLength(10);

    expect(
      baseProfile(departingHimeko)
        .skillCards.find((card) => card.category === 'assist')
        ?.variants.map((variant) => variant.id)
    ).toEqual(['151022']);
    const himekoEffects = baseProfile(departingHimeko).specialEffects;
    expect(himekoEffects.map((entry) => entry.skill.id)).toEqual(['151025', '151026']);
    expect(himekoEffects[0]).toMatchObject({
      kind: 'avatar-skill-link',
      linkedAvatarIds: ['8001', '1002', '1213', '1414', '1313'],
      simplifiedLinkedAvatarIds: ['8001', '1002', '1313'],
      skill: { id: '151025', source: 'avatar' }
    });
    expect(himekoEffects[1]).toMatchObject({
      kind: 'avatar-skill-link',
      linkedAvatarIds: ['1001', '1413', '1004', '1003'],
      simplifiedLinkedAvatarIds: ['1001', '1004', '1003'],
      skill: { id: '151026', source: 'avatar' }
    });
    expect(himekoEffects[0].skill.levels).toHaveLength(15);
    expect(himekoEffects[0].skill.combatMeta.extraEffects?.map((effect) => effect.id)).toEqual([
      '10000032'
    ]);
    const cyreneTriggerTokens = variantOf(cyrene, '1141502')?.levels.find(
      (level) => level.level === 6
    )?.descriptionTokens;
    expect(cyreneTriggerTokens?.find((token) => token.type === 'icon')).toMatchObject({
      icon: { spriteName: 'AvatarCyrene', id: 0 },
      color: '#f9b0f0',
      underline: true
    });
    const himekoTriggerTokens = variantOf(departingHimeko, '151022')?.levels.find(
      (level) => level.level === 10
    )?.descriptionTokens;
    expect(himekoTriggerTokens?.filter((token) => token.type === 'icon')).toHaveLength(2);

    const latestAudit = JSON.parse(await readFile(path.join(auditRoot, 'latest.json'), 'utf8')) as {
      avatarSpecialSkillTreeAudit: { diagnostics: unknown[] };
      specialEffectAudit: { diagnostics: unknown[] };
    };
    expect(latestAudit.avatarSpecialSkillTreeAudit.diagnostics).toEqual([]);
    expect(latestAudit.specialEffectAudit.diagnostics).toEqual([]);
  });

  it('Special Effect relation presentation override 只改变指定弹窗上下文', () => {
    expect(
      resolveSpecialEffectLinkedAvatarPresentation({
        ownerCharacterId: '1415',
        entryKind: 'servant-skill-link',
        sourceAvatarId: '8007',
        sourceTarget: { id: '8007', name: '开拓者·记忆' }
      })
    ).toEqual({
      sourceAvatarId: '8007',
      displayAvatarId: '8008',
      displayName: '开拓者·记忆'
    });
    expect(
      resolveSpecialEffectLinkedAvatarPresentation({
        ownerCharacterId: '1510',
        entryKind: 'avatar-skill-link',
        sourceAvatarId: '8001',
        sourceTarget: { id: '8001', name: '开拓者·毁灭' }
      })
    ).toEqual({ sourceAvatarId: '8001', displayAvatarId: '8002', displayName: '开拓者' });
    expect(
      resolveSpecialEffectLinkedAvatarPresentation({
        ownerCharacterId: '1510',
        entryKind: 'avatar-skill-link',
        sourceAvatarId: '1001',
        sourceTarget: { id: '1001', name: '三月七·存护' }
      })
    ).toEqual({ sourceAvatarId: '1001', displayAvatarId: '1001', displayName: '三月七' });
    expect(
      resolveSpecialEffectLinkedAvatarPresentation({
        ownerCharacterId: '1000',
        entryKind: 'avatar-skill-link',
        sourceAvatarId: '8001',
        sourceTarget: { id: '8001', name: '开拓者·毁灭' }
      })
    ).toEqual({
      sourceAvatarId: '8001',
      displayAvatarId: '8001',
      displayName: '开拓者·毁灭'
    });
  });

  it('使用真实晋阶数据计算 1–80 级基础属性与突破边界', async () => {
    const march = JSON.parse(
      await readFile(path.join(generatedRoot, 'details', 'characters', '1001.json'), 'utf8')
    ) as Character;
    const arrows = JSON.parse(
      await readFile(path.join(generatedRoot, 'details', 'light-cones', '20000.json'), 'utf8')
    ) as LightCone;
    expect(getBaseStatsAtLevel(march.baseStats, 1).hp).toBe(144);
    expect(getBaseStatsAtLevel(march.baseStats, 19).hp).toBe(273.6);
    expect(getBaseStatsAtLevel(march.baseStats, 20).hp).toBe(338.4);
    expect(getBaseStatsAtLevel(march.baseStats, 80).hp).toBe(1058.4);
    expect(getBaseStatsAtLevel(arrows.baseStats, 1).hp).toBe(38.4);
    expect(getBaseStatsAtLevel(arrows.baseStats, 20).hp).toBe(193.92);
    expect(getBaseStatsAtLevel(arrows.baseStats, 80).hp).toBe(846.72);
    expect(formatBaseStat(getBaseStatsAtLevel(march.baseStats, 20).hp)).toBe('338');
    expect(formatBaseStat(getBaseStatsAtLevel(arrows.baseStats, 80).hp)).toBe('847');
    expect(march.baseStats.defaultLevel).toBe(80);
    expect(arrows.baseStats.defaultLevel).toBe(80);
  });

  it('依据真实配置区分普通能量与特殊能量', async () => {
    const root = assertDataRoot();
    const ultraSkills = await readTable<any>(root, 'AvatarUltraSkillConfig');
    const specialRows = await readTable<any>(root, 'GridFightFrontSpecialSP');
    const specialIds = ultraSkills
      .filter((row) => row.UltraSkillType === 'SpecialSP')
      .map((row) => String(row.AvatarID))
      .sort();
    expect(specialIds).toEqual(['1220', '1308', '1407', '1408', '1415', '1506']);
    for (const id of specialIds) {
      const detail = JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'characters', `${id}.json`), 'utf8')
      ) as Character;
      expect(baseProfile(detail).energy).toEqual({ kind: 'special', max: 0 });
      expect(
        specialRows.some((row) => {
          const roleId = String(row.RoleID);
          return (
            (roleId === id || (roleId.startsWith(id) && /^\d$/.test(roleId.slice(id.length)))) &&
            Number(row.MaxSpecialSP) > 0
          );
        })
      ).toBe(true);
    }
    const march = JSON.parse(
      await readFile(path.join(generatedRoot, 'details', 'characters', '1001.json'), 'utf8')
    ) as Character;
    const silverWolf = JSON.parse(
      await readFile(path.join(generatedRoot, 'details', 'characters', '1006.json'), 'utf8')
    ) as Character;
    expect(baseProfile(march).energy).toEqual({ kind: 'standard', max: 120 });
    expect(baseProfile(silverWolf).energy).toEqual({ kind: 'standard', max: 110 });
  });

  it('为官方加强角色生成互不混合的完整双 Profile', async () => {
    const root = assertDataRoot();
    const [enhancedConfigs, skillChanges, traceChanges, eidolonChanges] = await Promise.all([
      readTable<any>(root, 'AvatarConfigEnhanced'),
      readTable<any>(root, 'AvatarEnhancedSkill'),
      readTable<any>(root, 'AvatarEnhancedSkillTree'),
      readTable<any>(root, 'AvatarEnhancedRank')
    ]);
    const expectedIds = [
      '1004',
      '1005',
      '1006',
      '1102',
      '1205',
      '1212',
      '1217',
      '1306',
      '1307',
      '1310'
    ];
    expect(enhancedConfigs.map((row) => String(row.AvatarID)).sort()).toEqual(expectedIds);
    expect(skillChanges).toHaveLength(32);
    expect(traceChanges).toHaveLength(25);
    expect(eidolonChanges).toHaveLength(20);

    for (const id of expectedIds) {
      const character = JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'characters', `${id}.json`), 'utf8')
      ) as Character;
      const enhanced = character.profiles.enhanced;
      expect(enhanced, `${character.name} 应具有加强 Profile`).toBeDefined();
      const ids = (profile: CharacterProfile) => [
        ...profile.skillCards.flatMap((card) => card.variants.map((variant) => variant.id)),
        ...profile.traces.map((trace) => trace.id),
        ...profile.eidolons.map((eidolon) => eidolon.id)
      ];
      expect(
        ids(character.profiles.base).filter((entry) => ids(enhanced!).includes(entry))
      ).toEqual([]);
    }

    const jingliu = JSON.parse(
      await readFile(path.join(generatedRoot, 'details', 'characters', '1212.json'), 'utf8')
    ) as Character;
    const enhanced = jingliu.profiles.enhanced!;
    expect(
      variantOf(jingliu, '121202')?.levels.find((level) => level.level === 10)?.description
    ).toContain('200%攻击力');
    expect(
      variantOf(jingliu, '1121202', enhanced)?.levels.find((level) => level.level === 10)
        ?.description
    ).toContain('150%生命上限');
    expect(
      baseProfile(jingliu).traces.find((trace) => trace.name === '死境')?.description
    ).not.toContain('终结技伤害提高<unbreak>20%</unbreak>');
    expect(enhanced.traces.find((trace) => trace.name === '死境')?.description).toContain(
      '终结技伤害提高<unbreak>20%</unbreak>'
    );
    expect(baseProfile(jingliu).eidolons[0].description).toContain(
      '暴击伤害提高<unbreak>24%</unbreak>'
    );
    expect(enhanced.eidolons[0].description).toContain('暴击伤害提高<unbreak>36%</unbreak>');
  });

  it('按具体 AvatarID 生成完整装备推荐并解析最小遗器领域模型', async () => {
    const readCharacter = async (id: string) =>
      JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'characters', `${id}.json`), 'utf8')
      ) as Character;
    const [march, huntMarch, trailblazerMale, trailblazerFemale, gallagher, sparkle, rin] =
      await Promise.all(
        ['1001', '1224', '8001', '8002', '1301', '1501', '1508'].map(readCharacter)
      );
    expect(march.equipmentRecommendation).toEqual({
      avatarId: '1001',
      lightConeIds: ['21002', '23005', '24002'],
      cavernSetIds: ['103', '128', '106'],
      planarSetIds: ['304', '310', '317'],
      mainStatOptions: [
        { slot: 'BODY', propertyTypes: ['DefenceAddedRatio', 'StatusProbabilityBase'] },
        { slot: 'FOOT', propertyTypes: ['SpeedDelta', 'DefenceAddedRatio'] },
        { slot: 'NECK', propertyTypes: ['DefenceAddedRatio'] },
        { slot: 'OBJECT', propertyTypes: ['DefenceAddedRatio'] }
      ],
      subStatPropertyTypes: [
        'DefenceAddedRatio',
        'SpeedDelta',
        'StatusProbabilityBase',
        'StatusResistanceBase'
      ]
    });
    expect(huntMarch.equipmentRecommendation.avatarId).toBe('1224');
    expect(trailblazerMale.equipmentRecommendation.avatarId).toBe('8001');
    expect(trailblazerFemale.equipmentRecommendation.avatarId).toBe('8002');
    expect(gallagher.equipmentRecommendation.lightConeIds).toHaveLength(2);
    expect(gallagher.equipmentRecommendation.mainStatOptions[2].propertyTypes).toHaveLength(2);
    expect(sparkle.equipmentRecommendation.cavernSetIds).toHaveLength(2);
    expect(rin.equipmentRecommendation.avatarId).toBe('1508');
    expect(JSON.stringify(rin.equipmentRecommendation)).not.toMatch(/PropertyList|ScoreRankList/);

    const relics = JSON.parse(
      await readFile(path.join(generatedRoot, 'catalogs', 'relics.json'), 'utf8')
    ) as RelicCatalogEntry[];
    const properties = JSON.parse(
      await readFile(path.join(generatedRoot, 'catalogs', 'relic-properties.json'), 'utf8')
    ) as RelicProperty[];
    const cavern = JSON.parse(
      await readFile(path.join(generatedRoot, 'details', 'relics', '101.json'), 'utf8')
    ) as RelicSet;
    const planar = JSON.parse(
      await readFile(path.join(generatedRoot, 'details', 'relics', '301.json'), 'utf8')
    ) as RelicSet;
    expect(relics.filter((set) => set.category === 'cavern')).toHaveLength(32);
    expect(relics.filter((set) => set.category === 'planar')).toHaveLength(28);
    expect(cavern.pieces.map((piece) => piece.id)).toEqual(['31011', '31012', '31013', '31014']);
    expect(planar.pieces.map((piece) => piece.id)).toEqual(['33015', '33016']);
    expect(properties).toHaveLength(21);
    expect(new Set(properties.flatMap((property) => property.iconKey ?? [])).size).toBe(18);
    expect(
      properties.find((property) => property.propertyType === 'StatusResistanceBase')
    ).toMatchObject({ name: '效果抵抗', allowedMainSlots: [], canBeSubStat: true });
  });
});
