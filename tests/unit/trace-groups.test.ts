import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { groupTracesForDisplay } from '../../src/lib/domain/trace-groups';
import { summarizeTraceStats, formatTraceBonus } from '../../src/lib/domain/trace-summary';
import type { Character, Trace } from '../../src/lib/domain/types';

const generatedRoot = path.join(process.cwd(), 'src', 'lib', 'generated');
const characterRoot = path.join(generatedRoot, 'views', 'zh-CN');
const trace = (
  id: string,
  anchorOrder: number,
  prerequisiteIds: string[] = [],
  type: Trace['type'] = 'stat',
  sourcePointType = type === 'stat' ? 1 : 3
): Trace => ({
  id,
  name: id,
  description: id,
  type,
  sourcePointType,
  prerequisiteIds,
  anchorOrder,
  ...(type === 'ability' && sourcePointType !== 5 ? { promotionLimit: 2 } : {})
});

describe('trace bonus display precision', () => {
  it.each([
    [0.186999998, '18.7%'],
    [0.026999999, '2.7%'],
    [0.04, '4.0%'],
    [0, '0.0%'],
    [0.01249, '1.2%'],
    [0.0125, '1.3%'],
    [0.01251, '1.3%']
  ])('formats %s as %s in both supported locales', (value, expected) => {
    for (const locale of ['zh-CN', 'en']) {
      expect(formatTraceBonus(value, true, locale)).toBe(expected);
    }
  });

  it('preserves non-percentage precision', () => {
    expect(formatTraceBonus(2.6999999, false, 'en')).toBe('2.6999999');
    expect(formatTraceBonus(4, false, 'zh-CN')).toBe('4');
  });
});

describe('行迹卡片展示分组', () => {
  it('sums structured bonuses, retains ownership and never merges property units or conditional nodes', () => {
    const ability = trace('ability', 0, [], 'ability');
    const bonus = (
      id: string,
      value: number,
      propertyType = 'HPAddedRatio',
      percent = true
    ): Trace => ({
      ...trace(id, 1, ['ability']),
      propertyType,
      statBonus: { propertyType, value, percent }
    });
    const conditional = {
      ...bonus('conditional', 9),
      extraEffects: [{ id: 'effect', name: 'effect', description: 'effect' }]
    };
    const summary = summarizeTraceStats([
      ability,
      bonus('a', 0.1),
      bonus('b', 0.2),
      bonus('flat', 5, 'HPDelta', false),
      conditional,
      trace('unknown', 2)
    ]);
    expect(summary.summaries.map((group) => group.value)).toEqual([0.3, 5]);
    expect(summary.summaries[0].nodes.map((node) => node.owner?.id)).toEqual([
      'ability',
      'ability'
    ]);
    expect(summary.independent.map((node) => node.id)).toEqual(['conditional', 'unknown']);
    expect(formatTraceBonus(summary.summaries[0].value, true, 'en')).toBe('30.0%');
  });
  it('counts only unlocked player nodes, retains zero and signals unresolved nodes', () => {
    const nodes = ['a', 'b', 'c'].map((id) => ({
      ...trace(id, 1),
      propertyType: 'SpeedDelta',
      statBonus: { propertyType: 'SpeedDelta', value: 2, percent: false }
    }));
    expect(summarizeTraceStats(nodes, () => 'inactive').summaries[0].value).toBe(0);
    const group = summarizeTraceStats(nodes, (node) =>
      node.id === 'a' ? 'active' : node.id === 'b' ? 'inactive' : 'unresolved'
    ).summaries[0];
    expect(group.value).toBe(2);
    expect(group.unresolved).toBe(true);
    expect(group.nodes.map((node) => node.state)).toEqual(['active', 'inactive', 'unresolved']);
  });
  it('按属性节点自己的前置链进行直接和间接归组', () => {
    const groups = groupTracesForDisplay([
      trace('ability-a', 6, [], 'ability'),
      trace('ability-b', 7, [], 'ability'),
      trace('ability-c', 8, [], 'ability'),
      trace('direct', 9, ['ability-a']),
      trace('indirect', 10, ['direct']),
      trace('standalone', 11)
    ]);
    expect(groups.abilityGroups.map((group) => group.ability.id)).toEqual([
      'ability-a',
      'ability-b',
      'ability-c'
    ]);
    expect(groups.abilityGroups[0].stats.map((item) => item.id)).toEqual(['direct', 'indirect']);
    expect(groups.standaloneStats.map((item) => item.id)).toEqual(['standalone']);
  });

  it('不反向解释额外能力对属性节点的前置引用', () => {
    const groups = groupTracesForDisplay([
      trace('ability-a', 6, ['shared'], 'ability'),
      trace('ability-b', 7, ['shared'], 'ability'),
      trace('ability-c', 8, [], 'ability'),
      trace('shared', 9)
    ]);
    expect(groups.abilityGroups.every((group) => group.stats.length === 0)).toBe(true);
    expect(groups.standaloneStats.map((item) => item.id)).toEqual(['shared']);
  });

  it('按真实关系分组记忆开拓者并单独保留第四项能力', async () => {
    for (const id of ['8007', '8008']) {
      const character = JSON.parse(
        await readFile(path.join(characterRoot, 'details', 'characters', `${id}.json`), 'utf8')
      ) as Character;
      const groups = groupTracesForDisplay(character.profiles.base.traces);
      expect(groups.abilityGroups).toHaveLength(3);
      expect(groups.abilityGroups.map((group) => group.stats.length)).toEqual([2, 2, 3]);
      expect(groups.abilityGroups[2].stats.map((item) => item.id)).toEqual([
        `${id}208`,
        `${id}209`,
        `${id}210`
      ]);
      expect(groups.standaloneStats.map((item) => item.id)).toEqual([
        `${id}201`,
        `${id}202`,
        `${id}203`
      ]);
      expect(groups.specialAbilities.map((item) => item.id)).toEqual([`${id}501`]);
    }
  });

  it('全部真实 Profile 恰好分组一次并保持审计基线', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(generatedRoot, 'manifest.json'), 'utf8')
    ) as { routes: { characters: string[] } };
    let profileCount = 0;
    let ownedStats = 0;
    let standaloneStats = 0;
    for (const id of manifest.routes.characters) {
      const character = JSON.parse(
        await readFile(path.join(characterRoot, 'details', 'characters', `${id}.json`), 'utf8')
      ) as Character;
      for (const profile of [character.profiles.base, character.profiles.enhanced].filter(
        Boolean
      )) {
        profileCount += 1;
        const groups = groupTracesForDisplay(profile!.traces);
        const renderedIds = [
          ...groups.abilityGroups.flatMap((group) => [
            group.ability.id,
            ...group.stats.map((item) => item.id)
          ]),
          ...groups.specialAbilities.map((item) => item.id),
          ...groups.standaloneStats.map((item) => item.id)
        ];
        expect(renderedIds.sort()).toEqual(profile!.traces.map((item) => item.id).sort());
        expect(new Set(renderedIds).size).toBe(renderedIds.length);
        ownedStats += groups.abilityGroups.reduce((sum, group) => sum + group.stats.length, 0);
        standaloneStats += groups.standaloneStats.length;
      }
    }
    expect(profileCount).toBeGreaterThanOrEqual(manifest.routes.characters.length);
    expect(ownedStats + standaloneStats).toBeGreaterThan(0);
  });

  it('拒绝重复、悬空、自引用、循环、多个前置和特殊能力归属', () => {
    expect(() => groupTracesForDisplay([trace('a', 1), trace('a', 2)])).toThrow('重复');
    expect(() => groupTracesForDisplay([trace('a', 1, ['missing'])])).toThrow('悬空');
    expect(() => groupTracesForDisplay([trace('a', 1, ['a'])])).toThrow('自引用');
    expect(() => groupTracesForDisplay([trace('a', 1, ['b']), trace('b', 2, ['a'])])).toThrow(
      '循环'
    );
    expect(() => groupTracesForDisplay([trace('a', 1, ['b', 'c'])])).toThrow('多个前置');
    expect(() =>
      groupTracesForDisplay([trace('special', 1, [], 'ability', 5), trace('stat', 2, ['special'])])
    ).toThrow('特殊额外能力');
  });
});
