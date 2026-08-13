import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseTextHash,
  type Character,
  type CharacterProfile,
  type DataManifest,
  type LightCone
} from '../../src/lib/domain/types';
import { ELEMENT_COLORS, getElementColor } from '../../src/lib/domain/elements';
import { formatBaseStat, getBaseStatsAtLevel } from '../../src/lib/domain/stats';
import { gameTextToPlain, parseGameText } from '../../src/lib/domain/game-text';
import type { SkillVariant } from '../../src/lib/domain/types';
import { createTextResolver, loadTextMap } from '../../scripts/data/localization';
import { normalizeLevelledDescriptions } from '../../scripts/data/levelled';
import {
  assertDataRoot,
  auditRoot,
  generatedRoot,
  resolveDataRoot
} from '../../scripts/data/paths';
import type { MissingTextAudit } from '../../scripts/data/missing-text';
import { hashOf, readTable } from '../../scripts/data/raw';
import { SKILL_EFFECT_LABELS, normalizeSkillCombatMeta } from '../../scripts/data/skill-combat';
import { formatDescription, formatGameMarkup, formatGameText } from '../../scripts/data/text';

const baseProfile = (character: Character): CharacterProfile => character.profiles.base;
const variantOf = (
  character: Character,
  id: string,
  profile: CharacterProfile = baseProfile(character)
): SkillVariant | undefined =>
  profile.skillCards.flatMap((card) => card.variants).find((variant) => variant.id === id);

describe('真实数据管线', () => {
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

  it('保留 SkillNeed 安全 markup 并插值真实参数', () => {
    const formatted = formatGameMarkup(
      '<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>生命值',
      [0.25]
    );
    expect(formatted).toEqual({
      text: '<color=#f29e38ff><unbreak>25%</unbreak></color>生命值',
      diagnostics: []
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
    expect(manifest.counts.characters).toBe(91);
    expect(manifest.schemaVersion).toBe(11);
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
    expect(lightCone.name).toBe('锋镝');
    expect(lightCone.superimposition.levels).toHaveLength(5);
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

  it('将真实缺失文本稳定分类且程序错误为零', async () => {
    const audit = JSON.parse(await readFile(path.join(auditRoot, 'latest.json'), 'utf8')) as {
      missingTextAudit: MissingTextAudit;
    };
    const missing = audit.missingTextAudit;
    expect(missing.D.count).toBe(0);
    expect(missing.A.groups).toContainEqual({
      reason: 'missing-source-field',
      entity: 'avatar-skill',
      field: 'SkillDesc',
      count: 235
    });
    expect(missing.A.groups.some((group) => group.entity === 'item')).toBe(false);
    expect(missing.B.groups).toContainEqual({
      reason: 'unsupported-icon-markup',
      entity: 'avatar-skill',
      field: 'SkillDesc',
      count: 15
    });
    expect(missing.C.groups).toContainEqual({
      reason: 'unresolved-relation',
      entity: 'stage',
      field: 'MonsterList',
      count: 244
    });
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

    expect(arrows.superimposition.levels.map((level) => level.level)).toEqual([1, 2, 3, 4, 5]);
    expect(arrows.superimposition.scalingParamIndexes).toEqual([0]);
    expect(
      arrows.superimposition.levels[0].descriptionTokens.filter(
        (token) => token.type === 'scaling-value'
      )
    ).toEqual([{ type: 'scaling-value', value: '12%' }]);
    expect(arrows.superimposition.levels.at(-1)?.description).toContain('24%');
    expect(amber.superimposition.scalingParamIndexes).toEqual([0, 2]);
    expect(resolution.superimposition.scalingParamIndexes).toEqual([0, 1]);
    expect(trend.superimposition.scalingParamIndexes).toEqual([0, 1, 2]);
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

  it('保留代表性角色的真实技能等级边界并隐藏已确认的内部空描述技能', async () => {
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
    const cancel = variantOf(imbibitorLunae, '121309');
    expect(cancel?.levels.map((level) => level.level)).toEqual([1]);
    expect(cancel?.levels[0].description).toBe('取消强化。');
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
      toughnessDamage: 10
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
      { battlePointDelta: 1, energyGain: 20, toughnessDamage: 10 },
      { battlePointDelta: -1, energyGain: 30, toughnessDamage: 20 },
      { battlePointDelta: -2, energyGain: 35, toughnessDamage: 30 },
      { battlePointDelta: -3, energyGain: 40, toughnessDamage: 40 }
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
      toughnessDamage: 20
    });
    expect(variantOf(castorice, '140702')?.combatMeta).not.toHaveProperty('battlePointDelta');
    expect(variantOf(castorice, '1140702')?.combatMeta).toMatchObject({
      effect: { code: 'AoEAttack', label: '群攻', known: true },
      toughnessDamage: 10
    });
    expect(variantOf(theHerta, '140102')?.combatMeta.toughnessDamage).toBe(15);
    expect(variantOf(theHerta, '140109')?.combatMeta.toughnessDamage).toBe(20);
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

  it('按结构关系过滤内部技能而不破坏公开技能卡', async () => {
    const readCharacter = async (id: string) =>
      JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'characters', `${id}.json`), 'utf8')
      ) as Character;
    const castorice = await readCharacter('1407');
    const acheron = await readCharacter('1308');
    const sparkle = await readCharacter('1501');
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
    ).not.toContain('终结技伤害提高20%');
    expect(enhanced.traces.find((trace) => trace.name === '死境')?.description).toContain(
      '终结技伤害提高20%'
    );
    expect(baseProfile(jingliu).eidolons[0].description).toContain('暴击伤害提高24%');
    expect(enhanced.eidolons[0].description).toContain('暴击伤害提高36%');
  });
});
