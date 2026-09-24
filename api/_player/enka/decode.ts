import { PlayerApiError } from '../errors.js';

type UnknownRecord = Record<string, unknown>;

export interface EnkaRawTrace {
  pointId: number;
  level: number;
}

export interface EnkaRawLightCone {
  tid: number;
  rank: number;
  level: number;
  promotion: number;
}

export interface EnkaRawRelic {
  tid: number;
  type: 1 | 2 | 3 | 4 | 5 | 6;
  level: number;
  mainAffixId: number;
  subAffixList: Array<{ affixId: number; cnt: number; step?: number }>;
}

export interface EnkaRawAvatar {
  avatarId: number;
  pos?: number;
  assist: boolean;
  rank: number;
  level: number;
  promotion: number;
  enhancedId?: number;
  dressedSkinId?: number;
  skillTreeList: EnkaRawTrace[];
  equipment?: EnkaRawLightCone;
  relicList: EnkaRawRelic[];
}

export interface EnkaRawResponse {
  uid: string;
  region?: string;
  ttl?: number;
  detailInfo: {
    uid: string;
    nickname?: string;
    level: number;
    worldLevel: number;
    signature?: string;
    headIcon?: number;
    personalCardId?: number;
    friendCount?: number;
    isDisplayAvatar?: boolean;
    platform?: string;
    privacySettingInfo?: Record<string, boolean>;
    recordInfo?: Record<string, number>;
    playerDisplayArea?: {
      normalDynamicList: Array<{ diceSlotId: number; diyDynamicId: number }>;
      photoDynamicList: Array<{ id: number; type: number; slot: number }>;
    };
    avatarDetailList: EnkaRawAvatar[];
  };
}

function invalid(path: string): never {
  throw new PlayerApiError('UPSTREAM_INVALID_RESPONSE', undefined, path);
}

function record(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path);
  return value as UnknownRecord;
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string') invalid(path);
  return value;
}

function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid(path);
  return value;
}

function optionalInteger(value: unknown, path: string): number | undefined {
  return value === undefined || value === null ? undefined : integer(value, path);
}

function optionalString(value: unknown, path: string): string | undefined {
  return value === undefined || value === null ? undefined : string(value, path);
}

function optionalBoolean(value: unknown, path: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') invalid(path);
  return value;
}

function optionalArray(value: unknown, path: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) invalid(path);
  return value;
}

function parseKnownBooleans(value: unknown, path: string): Record<string, boolean> | undefined {
  if (value === undefined || value === null) return undefined;
  const source = record(value, path);
  const result: Record<string, boolean> = {};
  for (const key of [
    'displayCollection',
    'displayRecord',
    'displayRecordTeam',
    'displayOnlineStatus',
    'displayDiary'
  ]) {
    const parsed = optionalBoolean(source[key], `${path}.${key}`);
    if (parsed !== undefined) result[key] = parsed;
  }
  return result;
}

function parseKnownCounts(value: unknown, path: string): Record<string, number> | undefined {
  if (value === undefined || value === null) return undefined;
  const source = record(value, path);
  const result: Record<string, number> = {};
  for (const key of [
    'achievementCount',
    'bookCount',
    'avatarCount',
    'equipmentCount',
    'musicCount',
    'relicCount',
    'maxRogueChallengeScore'
  ]) {
    const parsed = optionalInteger(source[key], `${path}.${key}`);
    if (parsed !== undefined) result[key] = parsed;
  }
  return result;
}

function parseDisplayArea(value: unknown): EnkaRawResponse['detailInfo']['playerDisplayArea'] {
  if (value === undefined || value === null) return undefined;
  const source = record(value, 'detailInfo.playerDisplayArea');
  return {
    normalDynamicList: optionalArray(
      source.normalDynamicList,
      'detailInfo.playerDisplayArea.normalDynamicList'
    ).map((value, index) => {
      const item = record(value, `detailInfo.playerDisplayArea.normalDynamicList[${index}]`);
      return {
        diceSlotId: integer(item.diceSlotId, `normalDynamicList[${index}].diceSlotId`),
        diyDynamicId: integer(item.diyDynamicId, `normalDynamicList[${index}].diyDynamicId`)
      };
    }),
    photoDynamicList: optionalArray(
      source.photoDynamicList,
      'detailInfo.playerDisplayArea.photoDynamicList'
    ).map((value, index) => {
      const item = record(value, `detailInfo.playerDisplayArea.photoDynamicList[${index}]`);
      return {
        id: integer(item.id, `photoDynamicList[${index}].id`),
        type: integer(item.type, `photoDynamicList[${index}].type`),
        slot: integer(item.slot, `photoDynamicList[${index}].slot`)
      };
    })
  };
}

function parseAvatar(value: unknown, index: number): EnkaRawAvatar {
  const path = `detailInfo.avatarDetailList[${index}]`;
  const source = record(value, path);
  const rank = optionalInteger(source.rank, `${path}.rank`) ?? 0;
  const equipmentSource = source.equipment;
  const equipment =
    equipmentSource === undefined || equipmentSource === null
      ? undefined
      : (() => {
          const item = record(equipmentSource, `${path}.equipment`);
          const superimposition = integer(item.rank, `${path}.equipment.rank`);
          if (superimposition < 1 || superimposition > 5) invalid(`${path}.equipment.rank`);
          return {
            tid: integer(item.tid, `${path}.equipment.tid`),
            rank: superimposition,
            level: integer(item.level, `${path}.equipment.level`),
            promotion:
              item.promotion === undefined
                ? 0
                : integer(item.promotion, `${path}.equipment.promotion`)
          };
        })();
  const relicList = optionalArray(source.relicList, `${path}.relicList`).map(
    (value, relicIndex) => {
      const relicPath = `${path}.relicList[${relicIndex}]`;
      const item = record(value, relicPath);
      const type = integer(item.type, `${relicPath}.type`);
      if (type < 1 || type > 6) invalid(`${relicPath}.type`);
      return {
        tid: integer(item.tid, `${relicPath}.tid`),
        type: type as EnkaRawRelic['type'],
        level: integer(item.level, `${relicPath}.level`),
        mainAffixId: integer(item.mainAffixId, `${relicPath}.mainAffixId`),
        subAffixList: optionalArray(item.subAffixList, `${relicPath}.subAffixList`).map(
          (value, affixIndex) => {
            const affixPath = `${relicPath}.subAffixList[${affixIndex}]`;
            const affix = record(value, affixPath);
            const step = optionalInteger(affix.step, `${affixPath}.step`);
            return {
              affixId: integer(affix.affixId, `${affixPath}.affixId`),
              cnt: integer(affix.cnt, `${affixPath}.cnt`),
              ...(step === undefined ? {} : { step })
            };
          }
        )
      };
    }
  );
  return {
    avatarId: integer(source.avatarId, `${path}.avatarId`),
    ...(optionalInteger(source.pos, `${path}.pos`) === undefined
      ? {}
      : { pos: optionalInteger(source.pos, `${path}.pos`) }),
    assist:
      source._assist === undefined ? false : optionalBoolean(source._assist, `${path}._assist`)!,
    rank,
    level: integer(source.level, `${path}.level`),
    promotion: integer(source.promotion, `${path}.promotion`),
    ...(optionalInteger(source.enhancedId, `${path}.enhancedId`) === undefined
      ? {}
      : { enhancedId: optionalInteger(source.enhancedId, `${path}.enhancedId`) }),
    ...(optionalInteger(source.dressedSkinId, `${path}.dressedSkinId`) === undefined
      ? {}
      : { dressedSkinId: optionalInteger(source.dressedSkinId, `${path}.dressedSkinId`) }),
    skillTreeList: optionalArray(source.skillTreeList, `${path}.skillTreeList`).map(
      (value, traceIndex) => {
        const tracePath = `${path}.skillTreeList[${traceIndex}]`;
        const trace = record(value, tracePath);
        return {
          pointId: integer(trace.pointId, `${tracePath}.pointId`),
          level: integer(trace.level, `${tracePath}.level`)
        };
      }
    ),
    ...(equipment ? { equipment } : {}),
    relicList
  };
}

export function decodeEnkaResponse(value: unknown): EnkaRawResponse {
  const source = record(value, 'root');
  const detailInfo = record(source.detailInfo, 'detailInfo');
  const uid = string(source.uid, 'uid');
  const detailUid = String(integer(detailInfo.uid, 'detailInfo.uid'));
  if (uid !== detailUid) invalid('detailInfo.uid');
  const region = optionalString(source.region, 'region');
  const ttl = optionalInteger(source.ttl, 'ttl');
  const nickname = optionalString(detailInfo.nickname, 'detailInfo.nickname');
  const signature = optionalString(detailInfo.signature, 'detailInfo.signature');
  return {
    uid,
    ...(region === undefined ? {} : { region }),
    ...(ttl === undefined ? {} : { ttl }),
    detailInfo: {
      uid: detailUid,
      ...(nickname === undefined ? {} : { nickname }),
      level: integer(detailInfo.level, 'detailInfo.level'),
      worldLevel: integer(detailInfo.worldLevel, 'detailInfo.worldLevel'),
      ...(signature === undefined ? {} : { signature }),
      ...(optionalInteger(detailInfo.headIcon, 'detailInfo.headIcon') === undefined
        ? {}
        : { headIcon: optionalInteger(detailInfo.headIcon, 'detailInfo.headIcon') }),
      ...(optionalInteger(detailInfo.personalCardId, 'detailInfo.personalCardId') === undefined
        ? {}
        : {
            personalCardId: optionalInteger(detailInfo.personalCardId, 'detailInfo.personalCardId')
          }),
      ...(optionalInteger(detailInfo.friendCount, 'detailInfo.friendCount') === undefined
        ? {}
        : { friendCount: optionalInteger(detailInfo.friendCount, 'detailInfo.friendCount') }),
      ...(optionalBoolean(detailInfo.isDisplayAvatar, 'detailInfo.isDisplayAvatar') === undefined
        ? {}
        : {
            isDisplayAvatar: optionalBoolean(
              detailInfo.isDisplayAvatar,
              'detailInfo.isDisplayAvatar'
            )
          }),
      ...(optionalString(detailInfo.platform, 'detailInfo.platform') === undefined
        ? {}
        : { platform: optionalString(detailInfo.platform, 'detailInfo.platform') }),
      ...(parseKnownBooleans(detailInfo.privacySettingInfo, 'detailInfo.privacySettingInfo') ===
      undefined
        ? {}
        : {
            privacySettingInfo: parseKnownBooleans(
              detailInfo.privacySettingInfo,
              'detailInfo.privacySettingInfo'
            )
          }),
      ...(parseKnownCounts(detailInfo.recordInfo, 'detailInfo.recordInfo') === undefined
        ? {}
        : { recordInfo: parseKnownCounts(detailInfo.recordInfo, 'detailInfo.recordInfo') }),
      ...(parseDisplayArea(detailInfo.playerDisplayArea) === undefined
        ? {}
        : { playerDisplayArea: parseDisplayArea(detailInfo.playerDisplayArea) }),
      avatarDetailList: optionalArray(
        detailInfo.avatarDetailList,
        'detailInfo.avatarDetailList'
      ).map(parseAvatar)
    }
  };
}
