import { expect, it } from 'vitest';
import { buildCharacterTeamRecommendations } from '../../scripts/data/team-recommendations';
import {
  presentTeamRecommendations,
  teamRecommendationPageData
} from '../../src/lib/domain/team-recommendation';

const roster = ['10', '11', '12', '13', '14', '15', '16', '8007', '8008'];
const avatarIds = new Set(roster);
const row = {
  AvatarID: 8007,
  TeamID: 2,
  Position: 3,
  MemberList: [10, 11, 12],
  BackupList1: [8008, 16, 14, 14, 11],
  BackupList2: [16],
  BackupList3: [],
  BackupGroupList1: [501, 500],
  BackupGroupList2: [],
  BackupGroupList3: []
};
const groups = [
  { GroupID: 500, AvatarIDList: [13, 12, 15] },
  { GroupID: 501, AvatarIDList: [8007, 8008, 13, 13, 14] }
];

it('uses stable source ownership, ordered teams and slot-relative backups', () => {
  const data = buildCharacterTeamRecommendations([row, { ...row, TeamID: 1 }], groups, avatarIds);
  const catalog = roster.map((id) => ({
    id,
    name: `Avatar ${id}`,
    ...(id === '8008' ? { trailblazerText: { female: [{ path: ['name'], value: 'Stelle' }] } } : {})
  }));
  expect(teamRecommendationPageData(data, '16', catalog)).toBeUndefined();
  const page = teamRecommendationPageData(data, '8008', catalog)!;
  expect(page.teams.map(({ teamId }) => teamId)).toEqual([1, 2]);
  expect(page.teams[0].sourceAvatarId).toBe('8007');
  expect(page.teams[0].slots.map(({ avatarId }) => avatarId)).toEqual(['10', '11', '8007', '12']);
  expect(page.teams[0].slots[1].backupAvatarIds).toEqual(['16']);
  expect(page.teams[0].slots[2].backupAvatarIds).toEqual([]);
  expect(page).not.toHaveProperty('groups');
  expect(page.teams[0].slots[0]).not.toHaveProperty('backupGroupIds');
  expect(page.characters.map(({ id }) => id)).toEqual([
    '10',
    '11',
    '12',
    '14',
    '16',
    '8007',
    '8008'
  ]);

  const [female] = presentTeamRecommendations(page, 'female');
  expect(female.slots[2].avatar).toEqual({ id: '8008', name: 'Stelle' });
  const firstSlot = female.slots[0];
  expect(firstSlot.backups.map(({ id }) => id)).toEqual(['16', '14']);
  expect(presentTeamRecommendations(page, 'male')[0].slots[2].avatar.id).toBe('8007');
  expect(data.groups['501']).toEqual(['8007', '8008', '13', '13', '14']);

  const both = buildCharacterTeamRecommendations(
    [row, { ...row, AvatarID: 8008 }],
    groups,
    avatarIds
  );
  expect(teamRecommendationPageData(both, '8008', catalog)?.teams[0].sourceAvatarId).toBe('8008');
});

it.each([
  [[row, row], groups],
  [[{ ...row, Position: 5 }], groups],
  [[{ ...row, MemberList: [10, 11] }], groups],
  [[{ ...row, MemberList: [10, 11, 11] }], groups],
  [[{ ...row, BackupGroupList1: [999] }], groups],
  [[{ ...row, BackupList2: [999] }], groups],
  [[row], [{ GroupID: 501, AvatarIDList: [999] }]]
])('rejects invalid source ownership, position, or references (%#)', (teams, alternativeGroups) => {
  expect(() => buildCharacterTeamRecommendations(teams, alternativeGroups, avatarIds)).toThrow(
    '[TeamBuild]'
  );
});
