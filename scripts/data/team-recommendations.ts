import {
  TEAM_RECOMMENDATIONS_SCHEMA_VERSION,
  type CharacterTeamRecommendation,
  type CharacterTeamRecommendations
} from '../../src/lib/domain/team-recommendation.js';
import { readTable } from './raw.js';

type RawTeamRow = Record<string, unknown>;
const decimalId = /^[1-9][0-9]*$/;
const record = (value: unknown): value is RawTeamRow =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const positiveInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

function id(value: unknown, field: string): string {
  if (!positiveInt(value)) throw new Error(`[TeamBuild] Invalid ${field}`);
  return String(value);
}

function ids(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`[TeamBuild] Invalid ${field}`);
  return value.map((entry) => id(entry, field));
}

export function buildCharacterTeamRecommendations(
  teamRows: RawTeamRow[],
  groupRows: RawTeamRow[],
  avatarIds: ReadonlySet<string>
): CharacterTeamRecommendations {
  const groups: CharacterTeamRecommendations['groups'] = {};
  for (const row of groupRows) {
    const groupId = id(row.GroupID, 'GroupID');
    if (Object.hasOwn(groups, groupId)) throw new Error(`[TeamBuild] Duplicate group ${groupId}`);
    groups[groupId] = ids(row.AvatarIDList, `group ${groupId} AvatarIDList`);
  }
  const teamsByAvatar: CharacterTeamRecommendations['teamsByAvatar'] = {};
  for (const row of teamRows) {
    const sourceAvatarId = id(row.AvatarID, 'AvatarID');
    const { TeamID: teamId, Position: position } = row;
    if (!positiveInt(teamId) || !positiveInt(position) || position > 4)
      throw new Error(`[TeamBuild] Invalid TeamID or Position for avatar ${sourceAvatarId}`);
    const key = `${sourceAvatarId}:${teamId}`;
    const members = ids(row.MemberList, `${key} MemberList`);
    if (members.length !== 3)
      throw new Error(`[TeamBuild] Expected three MemberList entries for ${key}`);
    const slots = members.map((avatarId, index) => ({
      avatarId,
      backupAvatarIds: ids(row[`BackupList${index + 1}`], `${key} BackupList${index + 1}`),
      backupGroupIds: ids(row[`BackupGroupList${index + 1}`], `${key} BackupGroupList${index + 1}`)
    }));
    slots.splice(position - 1, 0, {
      avatarId: sourceAvatarId,
      backupAvatarIds: [],
      backupGroupIds: []
    });
    (teamsByAvatar[sourceAvatarId] ??= []).push({ sourceAvatarId, teamId, position, slots });
  }
  for (const teams of Object.values(teamsByAvatar)) teams.sort((a, b) => a.teamId - b.teamId);
  const result = { schemaVersion: TEAM_RECOMMENDATIONS_SCHEMA_VERSION, teamsByAvatar, groups };
  assertCharacterTeamRecommendations(result, avatarIds);
  return result;
}

export async function loadCharacterTeamRecommendations(
  root: string,
  avatarIds: ReadonlySet<string>
) {
  const [teams, groups] = await Promise.all([
    readTable<RawTeamRow>(root, 'TeamBuildConfig'),
    readTable<RawTeamRow>(root, 'TeamBuildGroupConfig')
  ]);
  return buildCharacterTeamRecommendations(teams, groups, avatarIds);
}

export function assertCharacterTeamRecommendations(
  value: unknown,
  avatarIds: ReadonlySet<string>
): asserts value is CharacterTeamRecommendations {
  if (
    !record(value) ||
    value.schemaVersion !== TEAM_RECOMMENDATIONS_SCHEMA_VERSION ||
    !record(value.teamsByAvatar) ||
    !record(value.groups)
  )
    throw new Error('[TeamBuild] Invalid recommendation artifact');
  const { teamsByAvatar, groups } = value;
  const avatar = (id: unknown) => typeof id === 'string' && avatarIds.has(id);
  for (const [groupId, members] of Object.entries(groups))
    if (!decimalId.test(groupId) || !Array.isArray(members) || !members.every(avatar))
      throw new Error(`[TeamBuild] Invalid group or unknown Avatar ID in group ${groupId}`);
  for (const [owner, teams] of Object.entries(teamsByAvatar)) {
    if (!avatar(owner) || !Array.isArray(teams) || !teams.length)
      throw new Error(`[TeamBuild] Invalid team owner ${owner}`);
    let previousTeamId = 0;
    for (const raw of teams) {
      if (
        !record(raw) ||
        raw.sourceAvatarId !== owner ||
        !positiveInt(raw.teamId) ||
        raw.teamId <= previousTeamId ||
        !positiveInt(raw.position) ||
        raw.position > 4 ||
        !Array.isArray(raw.slots) ||
        raw.slots.length !== 4
      )
        throw new Error(`[TeamBuild] Invalid, duplicate or unordered TeamID for ${owner}`);
      const team = raw as unknown as CharacterTeamRecommendation;
      const members = new Set();
      for (const [index, slot] of team.slots.entries()) {
        if (
          !record(slot) ||
          !avatar(slot.avatarId) ||
          members.has(slot.avatarId) ||
          !Array.isArray(slot.backupAvatarIds) ||
          !slot.backupAvatarIds.every(avatar) ||
          !Array.isArray(slot.backupGroupIds) ||
          !slot.backupGroupIds.every(
            (groupId) => typeof groupId === 'string' && Object.hasOwn(groups, groupId)
          ) ||
          (index + 1 === team.position &&
            (slot.avatarId !== owner || slot.backupAvatarIds.length || slot.backupGroupIds.length))
        )
          throw new Error(`[TeamBuild] Invalid slot in ${owner}:${team.teamId}`);
        members.add(slot.avatarId);
      }
      previousTeamId = team.teamId;
    }
  }
}
