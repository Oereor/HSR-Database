import type { EnemyDetailPageData, EnemySummonView } from '$lib/domain/enemy-view';
import { localizedHref } from '$lib/i18n/routing';
import { getEnemyCardImageUrl, getEnemyHeroImageUrl } from '$lib/server/enemy-assets';
import { getEnemyDetailArtifact } from '$lib/server/generated';
import type { SearchLocale } from '$lib/domain/search-index';

export async function getEnemyDetail(
  locale: SearchLocale,
  id: string
): Promise<EnemyDetailPageData> {
  const detail = await getEnemyDetailArtifact(locale, id);
  if (detail.template.monsterTemplateId !== id) throw new Error(`Enemy ${id} identity mismatch`);
  const summonTemplateIds = [
    ...new Set(
      detail.monsters.flatMap((monster) =>
        monster.summons.map((summon) => summon.monsterTemplateId)
      )
    )
  ];
  const [portraitUrl, summonPortraitEntries] = await Promise.all([
    getEnemyHeroImageUrl(Number(id)),
    Promise.all(
      summonTemplateIds.map(
        async (templateId) => [templateId, await getEnemyCardImageUrl(Number(templateId))] as const
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
    ...detail,
    ...(portraitUrl ? { portraitUrl } : {}),
    monsters: detail.monsters.map((monster) => ({
      ...monster,
      summons: monster.summons.map(projectSummonForPage)
    }))
  };
}
