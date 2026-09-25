import type { CanonicalPlayerProfile } from '../../../src/lib/player/canonical.js';
import type { EnkaRawResponse } from './decode.js';

export function adaptEnkaProfile(raw: EnkaRawResponse): CanonicalPlayerProfile {
  const detail = raw.detailInfo;
  return {
    uid: detail.uid,
    nickname: detail.nickname ?? '',
    level: detail.level,
    worldLevel: detail.worldLevel,
    ...(detail.signature === undefined ? {} : { signature: detail.signature }),
    ...(detail.headIcon === undefined ? {} : { headIconId: String(detail.headIcon) }),
    ...(detail.recordInfo === undefined ? {} : { records: detail.recordInfo }),
    characters: (detail.avatarDetailList ?? []).map((avatar, sourceOrder) => {
      const area = avatar.assist ? 'assist' : avatar.pos === undefined ? 'unknown' : 'showcase';
      const position = avatar.pos;
      return {
        buildId: `area:${area}:position:${position ?? 'none'}:order:${sourceOrder}`,
        avatarId: String(avatar.avatarId),
        display: {
          area,
          ...(position === undefined ? {} : { position }),
          sourceOrder
        },
        level: avatar.level,
        promotion: avatar.promotion,
        eidolon: avatar.rank,
        ...(avatar.enhancedId === undefined ? {} : { enhancedId: avatar.enhancedId }),
        ...(avatar.dressedSkinId === undefined ? {} : { skinId: String(avatar.dressedSkinId) }),
        traces: (avatar.skillTreeList ?? []).map((trace) => ({
          pointId: String(trace.pointId),
          rawLevel: trace.level
        })),
        ...(avatar.equipment === undefined
          ? {}
          : {
              lightCone: {
                lightConeId: String(avatar.equipment.tid),
                superimposition: avatar.equipment.rank,
                level: avatar.equipment.level,
                promotion: avatar.equipment.promotion
              }
            }),
        relics: (avatar.relicList ?? []).map((relic) => ({
          tid: String(relic.tid),
          type: relic.type,
          level: relic.level,
          mainAffixId: relic.mainAffixId,
          subAffixes: (relic.subAffixList ?? []).map((affix) => ({
            affixId: affix.affixId,
            cnt: affix.cnt,
            ...(affix.step === undefined ? {} : { step: affix.step })
          }))
        }))
      };
    })
  };
}
