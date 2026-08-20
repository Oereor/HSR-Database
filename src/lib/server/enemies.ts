import type { Enemy } from '$lib/domain/types';
import type { EnemyDetailView } from '$lib/domain/enemy-view';
import { buildEnemyDetailView } from '$lib/domain/enemy-view';
import { getEnemyPortraitUrl } from '$lib/server/enemy-assets';
import { getDetail } from '$lib/server/generated';

export async function getEnemyDetail(id: string): Promise<EnemyDetailView> {
  const detail = (await getDetail('enemies', id)) as unknown as Enemy;
  if (detail.kind !== 'enemy') throw new Error(`Enemy ${id} 数据类型不匹配`);
  const view = buildEnemyDetailView(detail);
  const summonTemplateIds = [
    ...new Set(
      view.monsters.flatMap((monster) => monster.summons.map((summon) => summon.monsterTemplateId))
    )
  ];
  const [portraitUrl, summonPortraitEntries] = await Promise.all([
    getEnemyPortraitUrl(Number(detail.id)),
    Promise.all(
      summonTemplateIds.map(
        async (templateId) => [templateId, await getEnemyPortraitUrl(Number(templateId))] as const
      )
    )
  ]);
  const summonPortraits = new Map(summonPortraitEntries);
  return {
    ...view,
    ...(portraitUrl ? { portraitUrl } : {}),
    monsters: view.monsters.map((monster) => ({
      ...monster,
      summons: monster.summons.map((summon) => {
        const summonPortraitUrl = summonPortraits.get(summon.monsterTemplateId);
        return {
          ...summon,
          ...(summonPortraitUrl ? { portraitUrl: summonPortraitUrl } : {})
        };
      })
    }))
  };
}
