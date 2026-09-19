import type {
  PlayerCharacter,
  PlayerLightCone,
  PlayerProfile,
  PlayerRelic,
  PlayerRelicAffix,
  PlayerRelicSubAffix,
  PlayerStat
} from '../../src/lib/player/contract.js';
import { PlayerApiError } from './errors.js';

type UnknownRecord = Record<string, unknown>;

function invalidResponse(): never {
  throw new PlayerApiError('UPSTREAM_INVALID_RESPONSE');
}

function record(value: unknown): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalidResponse();
  return value as UnknownRecord;
}

function string(value: unknown): string {
  if (typeof value !== 'string') invalidResponse();
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') invalidResponse();
  return value;
}

function nonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalidResponse();
  return value;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalidResponse();
  return value;
}

function optionalRecord(value: unknown): UnknownRecord | null {
  return value === undefined || value === null ? null : record(value);
}

function parseAffix(value: unknown): PlayerRelicAffix {
  const source = record(value);
  return {
    type: string(source.type),
    display: string(source.display),
    percent: boolean(source.percent)
  };
}

function parseSubAffix(value: unknown): PlayerRelicSubAffix {
  const source = record(value);
  return {
    ...parseAffix(source),
    count: nonNegativeInteger(source.count)
  };
}

function parseRelic(value: unknown): PlayerRelic {
  const source = record(value);
  const type = nonNegativeInteger(source.type);
  if (type < 1 || type > 6) invalidResponse();

  const mainAffix = optionalRecord(source.main_affix);
  return {
    type: type as PlayerRelic['type'],
    setId: string(source.set_id),
    level: nonNegativeInteger(source.level),
    mainAffix: mainAffix === null ? null : parseAffix(mainAffix),
    subAffixes: array(source.sub_affix).map(parseSubAffix)
  };
}

function parseLightCone(value: unknown): PlayerLightCone | null {
  const source = optionalRecord(value);
  if (source === null) return null;
  return {
    lightConeId: string(source.id),
    rank: nonNegativeInteger(source.rank),
    level: nonNegativeInteger(source.level),
    promotion: nonNegativeInteger(source.promotion)
  };
}

interface StatSource {
  field: string;
  display: string;
  percent: boolean;
}

function parseStatSource(value: unknown): StatSource {
  const source = record(value);
  return {
    field: string(source.field),
    display: string(source.display),
    percent: boolean(source.percent)
  };
}

function parseStats(source: UnknownRecord): PlayerStat[] {
  return array(source.statistics)
    .map(parseStatSource)
    .map(({ field, display, percent }) => ({
      field,
      percent,
      total: display
    }));
}

function parseCharacter(value: unknown): PlayerCharacter {
  const source = record(value);
  const enhanced = source.enhanced === undefined ? false : boolean(source.enhanced);
  return {
    characterId: string(source.id),
    progression: {
      rank: nonNegativeInteger(source.rank),
      level: nonNegativeInteger(source.level),
      promotion: nonNegativeInteger(source.promotion),
      enhanced
    },
    skillTree: array(source.skill_trees).map((value) => {
      const skillTree = record(value);
      return {
        id: string(skillTree.id),
        level: nonNegativeInteger(skillTree.level)
      };
    }),
    lightCone: parseLightCone(source.light_cone),
    relics: array(source.relics).map(parseRelic),
    stats: parseStats(source)
  };
}

function dedupeCharacters(values: unknown[]): PlayerCharacter[] {
  const result: PlayerCharacter[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const character = parseCharacter(value);
    if (seen.has(character.characterId)) continue;
    seen.add(character.characterId);
    result.push(character);
  }
  return result;
}

export function parsePlayerProfile(value: unknown): PlayerProfile {
  const source = record(value);
  const player = record(source.player);
  const avatar = optionalRecord(player.avatar);
  const spaceInfo = optionalRecord(player.space_info);

  return {
    uid: string(player.uid),
    nickname: string(player.nickname),
    level: nonNegativeInteger(player.level),
    worldLevel: nonNegativeInteger(player.world_level),
    avatar:
      avatar === null
        ? null
        : {
            id: string(avatar.id),
            icon: string(avatar.icon)
          },
    signature: string(player.signature),
    characterCount: spaceInfo === null ? null : nonNegativeInteger(spaceInfo.avatar_count),
    lightConeCount: spaceInfo === null ? null : nonNegativeInteger(spaceInfo.light_cone_count),
    achievementCount: spaceInfo === null ? null : nonNegativeInteger(spaceInfo.achievement_count),
    characters: dedupeCharacters(array(source.characters))
  };
}
