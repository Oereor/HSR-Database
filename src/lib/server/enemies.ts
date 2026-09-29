import type { Enemy } from '$lib/domain/types';
import type { EnemyDetailPageData, EnemySummonView } from '$lib/domain/enemy-view';
import { buildEnemyDetailPageData } from '$lib/domain/enemy-view';
import { localizedHref } from '$lib/i18n/routing';
import { getEnemyPortraitUrl } from '$lib/server/enemy-assets';
import { getDetail } from '$lib/server/generated';
import type { SearchLocale } from '$lib/domain/search-index';

export async function getEnemyDetail(
  locale: SearchLocale,
  id: string
): Promise<EnemyDetailPageData> {
  const detail = (await getDetail(locale, 'enemies', id)) as unknown as Enemy;
  if (detail.kind !== 'enemy') throw new Error(`Enemy ${id} 数据类型不匹配`);
  const view = buildEnemyDetailPageData(detail);
  const summonTemplateIds = [
    ...new Set(
      view.monsters.flatMap((monster) => [
        ...monster.summons.map((summon) => summon.monsterTemplateId),
        ...monster.skills.flatMap((skill) =>
          (skill.detail?.summons ?? []).map((summon) => summon.monsterTemplateId)
        )
      ])
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
  const projectSummonForPage = (summon: EnemySummonView): EnemySummonView => {
    const summonPortraitUrl = summonPortraits.get(summon.monsterTemplateId);
    return {
      ...summon,
      href: localizedHref(summon.href, locale),
      ...(summonPortraitUrl ? { portraitUrl: summonPortraitUrl } : {})
    };
  };
  return {
    ...view,
    ...(portraitUrl ? { portraitUrl } : {}),
    monsters: view.monsters.map((monster) => ({
      ...monster,
      summons: monster.summons.map(projectSummonForPage),
      skills: monster.skills.map((skill) => ({
        ...skill,
        ...(skill.detail?.summons
          ? {
              detail: {
                ...skill.detail,
                summons: skill.detail.summons.map(projectSummonForPage)
              }
            }
          : {})
      }))
    }))
  };
}
