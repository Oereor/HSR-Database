import {
  staticTrailblazerText,
  trailblazerGender,
  withTrailblazerGender,
  type TrailblazerGender
} from './trailblazer.js';
import type { CatalogEntry } from './types.js';

export const TEAM_RECOMMENDATIONS_SCHEMA_VERSION = 1 as const;
export const TEAM_RECOMMENDATIONS_ARTIFACT = 'runtime/character-team-recommendations.json';

export interface TeamRecommendationSlot {
  avatarId: string;
  backupAvatarIds: string[];
  backupGroupIds: string[];
}

export interface CharacterTeamRecommendation {
  sourceAvatarId: string;
  teamId: number;
  position: number;
  slots: TeamRecommendationSlot[];
}

export interface CharacterTeamRecommendations {
  schemaVersion: typeof TEAM_RECOMMENDATIONS_SCHEMA_VERSION;
  teamsByAvatar: Record<string, CharacterTeamRecommendation[]>;
  groups: Record<string, string[]>;
}

export interface TeamRecommendationPageData {
  teams: CharacterTeamRecommendation[];
  groups: CharacterTeamRecommendations['groups'];
  characters: TeamCharacterReference[];
}

interface TeamCharacterReference {
  id: string;
  name: string;
  trailblazerName?: Partial<Record<TrailblazerGender, string>>;
}

export function teamRecommendationPageData(
  data: CharacterTeamRecommendations,
  avatarId: string,
  catalog: CatalogEntry[]
): TeamRecommendationPageData | undefined {
  const gender = trailblazerGender(avatarId);
  const counterpart = gender
    ? withTrailblazerGender(avatarId, gender === 'female' ? 'male' : 'female')
    : avatarId;
  const teams = data.teamsByAvatar[avatarId] ?? data.teamsByAvatar[counterpart];
  if (!teams?.length) return;

  const groups: CharacterTeamRecommendations['groups'] = {};
  const ids = new Set<string>();
  const addAvatar = (id: string) => {
    ids.add(withTrailblazerGender(id, 'female'));
    ids.add(withTrailblazerGender(id, 'male'));
  };
  for (const team of teams) {
    for (const slot of team.slots) {
      addAvatar(slot.avatarId);
      slot.backupAvatarIds.forEach(addAvatar);
      for (const groupId of slot.backupGroupIds) {
        groups[groupId] = data.groups[groupId];
        groups[groupId].forEach(addAvatar);
      }
    }
  }
  const characters = catalog
    .filter(({ id }) => ids.has(id))
    .map((entry) => {
      const gender = trailblazerGender(entry.id);
      const name = gender && staticTrailblazerText(entry, gender).name;
      return {
        id: entry.id,
        name: entry.name,
        ...(gender && name && name !== entry.name ? { trailblazerName: { [gender]: name } } : {})
      };
    });
  return { teams, groups, characters };
}

export function presentTeamRecommendations(
  data: TeamRecommendationPageData,
  gender: TrailblazerGender
) {
  const catalog = new Map(data.characters.map((entry) => [entry.id, entry]));
  function display(id: string): CatalogEntry {
    const preferred = withTrailblazerGender(id, gender);
    const entry = catalog.get(preferred);
    if (!entry) throw new Error(`Missing team recommendation avatar ${preferred}`);
    return { id: preferred, name: entry.trailblazerName?.[gender] ?? entry.name };
  }

  return data.teams.map((team) => {
    const starters = new Set(
      team.slots.map(({ avatarId }) => withTrailblazerGender(avatarId, gender))
    );
    function backups(ids: string[]) {
      const seen = new Set(starters);
      return ids.flatMap((id) => {
        const preferred = withTrailblazerGender(id, gender);
        if (seen.has(preferred)) return [];
        seen.add(preferred);
        return [display(id)];
      });
    }
    return {
      teamId: team.teamId,
      sourceAvatarId: team.sourceAvatarId,
      position: team.position,
      slots: team.slots.map((slot) => ({
        avatar: display(slot.avatarId),
        backups: backups(slot.backupAvatarIds),
        groups: slot.backupGroupIds.flatMap((id, index) => {
          const avatars = backups(data.groups[id]);
          return avatars.length ? [{ id, ordinal: index + 1, avatars }] : [];
        })
      }))
    };
  });
}
