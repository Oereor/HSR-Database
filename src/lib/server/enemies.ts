import type { Enemy } from '$lib/domain/types';
import type { EnemyDetailView } from '$lib/domain/enemy-view';
import { getEnemyPortraitUrl } from '$lib/server/enemy-assets';
import { getDetail } from '$lib/server/generated';

export async function getEnemyDetail(id: string): Promise<EnemyDetailView> {
  const detail = (await getDetail('enemies', id)) as unknown as Enemy;
  if (detail.kind !== 'enemy') throw new Error(`Enemy ${id} 数据类型不匹配`);
  const defaultMonster = detail.monsters.find(
    (monster) => monster.monsterId === detail.defaultMonsterId
  ) ??
    detail.monsters[0] ?? {
      monsterId: detail.defaultMonsterId,
      monsterTemplateId: detail.id,
      hardLevelGroup: '',
      modifiers: {
        hp: { ratio: '1' },
        attack: { ratio: '1' },
        defence: { ratio: '1' },
        speed: { ratio: '1' },
        stance: { ratio: '1' }
      },
      stats: detail.stats,
      weaknesses: detail.weaknesses,
      resistances: detail.resistances,
      specialResistances: detail.specialResistances,
      summons: detail.summons,
      skills: detail.skills,
      skillPhases: detail.skillPhases
    };
  const skillsById = new Map(defaultMonster.skills.map((skill) => [skill.id, skill]));
  const skillPhases = defaultMonster.skillPhases.map((phase) => ({
    index: phase.index,
    skills: phase.skillIds.map((skillId) => {
      const skill = skillsById.get(skillId);
      if (!skill) throw new Error(`Enemy ${id} 阶段 ${phase.index} 引用了未知技能 ${skillId}`);
      return skill;
    })
  }));
  const [portraitUrl, summons] = await Promise.all([
    getEnemyPortraitUrl(Number(detail.id)),
    Promise.all(
      defaultMonster.summons.map(async (summon) => {
        const summonPortraitUrl = await getEnemyPortraitUrl(Number(summon.monsterTemplateId));
        return { ...summon, ...(summonPortraitUrl ? { portraitUrl: summonPortraitUrl } : {}) };
      })
    )
  ]);
  return {
    ...detail,
    ...defaultMonster,
    defaultMonster,
    ...(portraitUrl ? { portraitUrl } : {}),
    summons,
    skillPhases
  };
}
