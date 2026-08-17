import type { Enemy } from '$lib/domain/types';
import type { EnemyDetailView } from '$lib/domain/enemy-view';
import { getEnemyPortraitUrl } from '$lib/server/enemy-assets';
import { getDetail } from '$lib/server/generated';

export async function getEnemyDetail(id: string): Promise<EnemyDetailView> {
  const detail = (await getDetail('enemies', id)) as unknown as Enemy;
  if (detail.kind !== 'enemy') throw new Error(`Enemy ${id} 数据类型不匹配`);
  const [portraitUrl, summons] = await Promise.all([
    getEnemyPortraitUrl(Number(detail.id)),
    Promise.all(
      detail.summons.map(async (summon) => {
        const summonPortraitUrl = await getEnemyPortraitUrl(Number(summon.monsterTemplateId));
        return { ...summon, ...(summonPortraitUrl ? { portraitUrl: summonPortraitUrl } : {}) };
      })
    )
  ]);
  return { ...detail, ...(portraitUrl ? { portraitUrl } : {}), summons };
}
