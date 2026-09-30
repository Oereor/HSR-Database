import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Enemy } from '../../src/lib/domain/types';
import {
  buildEnemyDetailPageData,
  getEnemySkillsForMonster
} from '../../src/lib/domain/enemy-view';
import { getEnemyDetail } from '../../src/lib/server/enemies';
import { generatedRoot } from '../../scripts/data/paths';

async function page(locale: 'zh-CN' | 'en', id: string) {
  const rich = JSON.parse(
    await readFile(
      path.join(generatedRoot, 'views', locale, 'details', 'enemies', `${id}.json`),
      'utf8'
    )
  ) as Enemy;
  return buildEnemyDetailPageData(rich);
}

async function skill(locale: 'zh-CN' | 'en', enemyId: string, monsterId: string, skillId: string) {
  return getEnemySkillsForMonster(await page(locale, enemyId), monsterId).find(
    (candidate) => candidate.id === skillId
  );
}

describe('enemy skill page projection', () => {
  it('keeps concrete Monster damage overrides under a shared definition', async () => {
    for (const locale of ['zh-CN', 'en'] as const) {
      const base = await page(locale, '1002030');
      const defaultSkill = getEnemySkillsForMonster(base, '1002030').find(
        ({ id }) => id === '100203001'
      )!;
      const variantSkill = getEnemySkillsForMonster(base, '100203026').find(
        ({ id }) => id === '100203001'
      )!;
      expect(defaultSkill.name).toBe(variantSkill.name);
      expect(defaultSkill.description).toBe(variantSkill.description);
      expect(defaultSkill.detail?.damage).toEqual([
        { target: 'primary', multipliers: ['1.3'], scaling: 'attack' },
        { target: 'adjacent', multipliers: ['1'], scaling: 'attack' }
      ]);
      expect(variantSkill.detail?.damage?.[0].multipliers).toEqual(['1']);
      expect(
        (await skill(locale, '4035010', '4035010', '403501001'))?.detail?.damage?.[0].multipliers
      ).toEqual(['4.5']);
      expect(
        (await skill(locale, '4035010', '403501001', '403501001'))?.detail?.damage?.[0].multipliers
      ).toEqual(['4']);
      expect((await skill(locale, '4064012', '4064012', '406401201'))?.detail?.damage).toEqual([
        { target: 'primary', multipliers: ['4'], scaling: 'attack' }
      ]);
    }
  });

  it('localizes optional application identity while retaining numeric chance', async () => {
    const names: string[] = [];
    for (const locale of ['zh-CN', 'en'] as const) {
      const application = (await skill(locale, '3003051', '3003051', '300305101'))?.detail
        ?.applications?.[0];
      expect(application).toMatchObject({
        statusId: '230030501',
        target: 'primary',
        baseChance: '1'
      });
      expect(application?.name).toBeTruthy();
      expect(application?.name).not.toContain(application!.statusId);
      names.push(application!.name!);
      expect(application).not.toHaveProperty('duration');
    }
    expect(names[0]).not.toBe(names[1]);
  });

  it('projects Kafka damage and anonymous probabilities without exposing parser data', async () => {
    for (const locale of ['zh-CN', 'en'] as const) {
      const first = (await skill(locale, '2004010', '2004010', '200401001'))?.detail;
      const control = (await skill(locale, '2004010', '2004010', '200401004'))?.detail;
      expect(first?.applications).toEqual([{ target: 'primary', baseChance: '1' }]);
      expect(first?.damage).toEqual([
        { target: 'primary', multipliers: ['2.5'], scaling: 'attack' }
      ]);
      expect(control?.applications).toEqual([{ target: 'primary', baseChance: '1.2' }]);
      expect(control?.actionShifts).toEqual([{ kind: 'advance', ratio: '1' }]);
      expect(
        (await skill(locale, '3024010', '302401013', '302401005'))?.detail?.damage?.[0].multipliers
      ).toEqual(['1.75']);
      expect(JSON.stringify([first, control])).not.toMatch(
        /MCommon_|AQAAAAQR|DynamicHash|ReadInfo|ModifierName/
      );
    }
  });

  it('projects unlabelled and multi-value candidates in both locales', async () => {
    for (const locale of ['zh-CN', 'en'] as const) {
      expect((await skill(locale, '4014018', '4014018', '401401802'))?.detail?.damage).toEqual([
        { multipliers: ['0.9', '1.1', '1.8', '2.2'], scaling: 'attack' }
      ]);
      expect((await skill(locale, '4014018', '4014018', '401401803'))?.detail?.damage).toEqual([
        { target: 'primary', multipliers: ['1.8', '3.6'], scaling: 'attack' }
      ]);
      expect(
        (await skill(locale, '4064012', '4064012', '406401204'))?.detail?.damage?.[0].multipliers
      ).toEqual(['6', '42']);
    }
  });

  it('keeps action shifts and removes obsolete detail fields', async () => {
    expect((await skill('zh-CN', '1022010', '1022010', '102201001'))?.detail?.actionShifts).toEqual(
      [{ kind: 'delay', ratio: '0.5' }]
    );
    expect((await skill('zh-CN', '2004010', '2004010', '200401004'))?.detail?.actionShifts).toEqual(
      [{ kind: 'advance', ratio: '1' }]
    );
    expect((await skill('zh-CN', '3003051', '3003051', '300305105'))?.detail).toBeUndefined();
    expect((await skill('zh-CN', '4014012', '4014012', '401401207'))?.detail).toBeUndefined();
    expect(
      (await skill('zh-CN', '4013010', '4013010', '401301001'))?.detail?.damage?.[0].target
    ).toBe('each-swept');
    expect(
      (await skill('zh-CN', '4064012', '4064012', '406401207'))?.detail?.damage?.map(
        ({ target }) => target
      )
    ).toEqual(['other-marked', 'marked']);
    expect((await skill('zh-CN', '1004020', '1004020', '100402005'))?.detail).toBeUndefined();
    const english = await getEnemyDetail('en', '8034010');
    expect(
      english.monsters.find(({ monsterId }) => monsterId === '8034010')?.summons
    ).toContainEqual(
      expect.objectContaining({ monsterId: '8032030', href: '/en/enemies/8032030/' })
    );
  });

  it('preserves order, omits absent detail, and rejects broken references', async () => {
    const projected = await page('zh-CN', '1002030');
    const monster = projected.monsters.find(({ monsterId }) => monsterId === '1002030')!;
    expect(getEnemySkillsForMonster(projected, monster.monsterId).map(({ id }) => id)).toEqual(
      monster.skills.map(({ id }) => id)
    );
    expect(() => getEnemySkillsForMonster(projected, 'missing')).toThrow('缺少 Monster');
    expect(() =>
      getEnemySkillsForMonster(
        {
          ...projected,
          skillDefinitions: projected.skillDefinitions.filter(
            ({ id }) => id !== monster.skills[0].id
          )
        },
        monster.monsterId
      )
    ).toThrow('未知技能定义');
    const noDetailPage = await page('zh-CN', '8002050');
    const withoutDetail = getEnemySkillsForMonster(noDetailPage, noDetailPage.defaultMonsterId);
    expect(withoutDetail.length).toBeGreaterThan(0);
    expect(withoutDetail.every((entry) => !Object.hasOwn(entry, 'detail'))).toBe(true);
    for (const skill of getEnemySkillsForMonster(projected, monster.monsterId))
      expect(JSON.stringify(skill.detail ?? {})).not.toMatch(
        /DynamicHash|ReadInfo|AbilityList|ModifierName|OnStart|Camera|Predicate|AIPath/
      );
  });
});
