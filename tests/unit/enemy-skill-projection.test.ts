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
        { target: 'primary', ratio: '1.3', scaling: 'attack' },
        { target: 'adjacent', ratio: '1', scaling: 'attack' }
      ]);
      expect(variantSkill.detail?.damage?.[0].ratio).toBe('1');
      expect(
        (await skill(locale, '4064012', '4064012', '406401201'))?.detail?.damage?.[0].ratio
      ).toBe('4');
      expect(
        (await skill(locale, '4064012', '406401201', '406401201'))?.detail?.damage?.[0].ratio
      ).toBe('3.6');
    }
  });

  it('localizes status identity while retaining chance and verified duration semantics', async () => {
    const names: string[] = [];
    for (const locale of ['zh-CN', 'en'] as const) {
      const status = (await skill(locale, '3003051', '3003051', '300305101'))?.detail
        ?.statuses?.[0];
      expect(status).toMatchObject({
        statusId: '230030501',
        kind: 'Debuff',
        target: 'primary',
        baseChance: '1',
        duration: { kind: 'turns', value: 2 }
      });
      expect(status?.name).toBeTruthy();
      expect(status?.name).not.toContain(status!.statusId);
      names.push(status!.name);
      expect(
        (await skill(locale, '1002040', '1002040', '100204001'))?.detail?.statuses?.[0]
      ).not.toHaveProperty('duration');
    }
    expect(names[0]).not.toBe(names[1]);
  });

  it('keeps action shifts, DoT effects, bounce limits and exact candidate summons', async () => {
    expect((await skill('zh-CN', '1022010', '1022010', '102201001'))?.detail?.actionShifts).toEqual(
      [{ kind: 'delay', ratio: '0.5' }]
    );
    expect((await skill('zh-CN', '2004010', '2004010', '200401004'))?.detail?.actionShifts).toEqual(
      [{ kind: 'advance', ratio: '1' }]
    );
    expect((await skill('zh-CN', '3003051', '3003051', '300305105'))?.detail?.effects).toEqual([
      { kind: 'trigger-dot' },
      { kind: 'clear-dot' }
    ]);
    const bounce = (await skill('zh-CN', '4014012', '4014012', '401401207'))?.detail;
    expect(bounce?.bounce).toEqual({ count: 5 });
    expect(bounce?.damage).toBeUndefined();
    expect(
      (await skill('zh-CN', '4013010', '4013010', '401301001'))?.detail?.damage?.[0].target
    ).toBe('each-swept');
    expect(
      (await skill('zh-CN', '4064012', '4064012', '406401207'))?.detail?.damage?.map(
        ({ target }) => target
      )
    ).toEqual(['other-marked', 'marked']);
    const summons = (await skill('zh-CN', '1004020', '1004020', '100402005'))?.detail?.summons;
    expect(summons?.map(({ monsterId }) => monsterId)).toEqual(['1002050', '1002030']);
    expect(
      summons?.every(({ name, href }) => name.length > 0 && href.startsWith('/enemies/'))
    ).toBe(true);
    expect(
      (await skill('zh-CN', '4064012', '4064012', '406401202'))?.detail?.summons?.[0].monsterId
    ).toBe('406201002');
    expect(
      (await skill('zh-CN', '4064012', '406401202', '406401202'))?.detail?.summons?.[0].monsterId
    ).toBe('406201003');
    const english = await getEnemyDetail('en', '4013010');
    const candidate = getEnemySkillsForMonster(english, '4013010').find(
      ({ id }) => id === '401301005'
    )?.detail?.summons?.[0];
    expect(candidate).toMatchObject({ monsterId: '4012010', href: '/en/enemies/4012010/' });
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
