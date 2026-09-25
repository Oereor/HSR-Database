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
  level?: number;
  mainAffixId: number;
  subAffixList?: Array<{ affixId: number; cnt: number; step?: number }>;
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
  skillTreeList?: EnkaRawTrace[];
  equipment?: EnkaRawLightCone;
  relicList?: EnkaRawRelic[];
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
    recordInfo?: {
      achievementCount?: number;
      avatarCount?: number;
      equipmentCount?: number;
    };
    avatarDetailList?: EnkaRawAvatar[];
  };
}

function shape(value: unknown): string {
  if (value === undefined) return 'missing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function invalid(path: string, expected?: string, value?: unknown): never {
  throw new PlayerApiError(
    'UPSTREAM_INVALID_RESPONSE',
    undefined,
    path,
    expected === undefined ? undefined : { expected, received: shape(value) }
  );
}

function record(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'object', value);
  return value as UnknownRecord;
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string') invalid(path, 'string', value);
  return value;
}

function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    invalid(path, 'non-negative safe integer', value);
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
  if (typeof value !== 'boolean') invalid(path, 'boolean', value);
  return value;
}

function optionalArray(value: unknown, path: string): unknown[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) invalid(path, 'array', value);
  return value;
}

function parseKnownCounts(
  value: unknown,
  path: string
): EnkaRawResponse['detailInfo']['recordInfo'] {
  if (value === undefined || value === null) return undefined;
  const source = record(value, path);
  const result: NonNullable<EnkaRawResponse['detailInfo']['recordInfo']> = {};
  for (const key of ['achievementCount', 'avatarCount', 'equipmentCount'] as const) {
    const parsed = optionalInteger(source[key], `${path}.${key}`);
    if (parsed !== undefined) result[key] = parsed;
  }
  return result;
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
  const relicList = optionalArray(source.relicList, `${path}.relicList`)?.map(
    (value, relicIndex) => {
      const relicPath = `${path}.relicList[${relicIndex}]`;
      const item = record(value, relicPath);
      const type = integer(item.type, `${relicPath}.type`);
      if (type < 1 || type > 6) invalid(`${relicPath}.type`, 'integer from 1 to 6', type);
      const level =
        item.level === undefined ? undefined : integer(item.level, `${relicPath}.level`);
      const subAffixList = optionalArray(item.subAffixList, `${relicPath}.subAffixList`)?.map(
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
      );
      return {
        tid: integer(item.tid, `${relicPath}.tid`),
        type: type as EnkaRawRelic['type'],
        ...(level === undefined ? {} : { level }),
        mainAffixId: integer(item.mainAffixId, `${relicPath}.mainAffixId`),
        ...(subAffixList === undefined ? {} : { subAffixList })
      };
    }
  );
  const skillTreeList = optionalArray(source.skillTreeList, `${path}.skillTreeList`)?.map(
    (value, traceIndex) => {
      const tracePath = `${path}.skillTreeList[${traceIndex}]`;
      const trace = record(value, tracePath);
      return {
        pointId: integer(trace.pointId, `${tracePath}.pointId`),
        level: integer(trace.level, `${tracePath}.level`)
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
    ...(skillTreeList === undefined ? {} : { skillTreeList }),
    ...(equipment ? { equipment } : {}),
    ...(relicList === undefined ? {} : { relicList })
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
  const headIcon = optionalInteger(detailInfo.headIcon, 'detailInfo.headIcon');
  const recordInfo = parseKnownCounts(detailInfo.recordInfo, 'detailInfo.recordInfo');
  const avatarDetailList = optionalArray(
    detailInfo.avatarDetailList,
    'detailInfo.avatarDetailList'
  )?.map(parseAvatar);
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
      ...(headIcon === undefined ? {} : { headIcon }),
      ...(recordInfo === undefined ? {} : { recordInfo }),
      ...(avatarDetailList === undefined ? {} : { avatarDetailList })
    }
  };
}
