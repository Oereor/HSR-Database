import type {
  NeutralExEidolon,
  NeutralSeriesSkill,
  NeutralSkillVariant
} from '../../../src/lib/domain/neutral.js';
import { parameterized, params, rows, textSource, type Raw } from './shared.js';
const ids = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

/** Resolve external conditions through explicit config keys, never a SkillID suffix. */
export function buildSeriesSkills(
  avatarId: string,
  skills: NeutralSkillVariant[],
  tables: Record<string, unknown>
): NeutralSeriesSkill[] {
  const result = new Map<string, NeutralSeriesSkill>();
  for (const row of rows(tables, 'AvatarSeriesSkill').filter(
    (row) => String(row.AvatarID) === avatarId
  )) {
    const skillId = String(row.SkillID);
    const level = Number(row.Level);
    const skill = skills.find((skill) => skill.id === skillId);
    const source = skill?.levels.find((candidate) => candidate.level === level);
    const condition = row.UnlockCondition as Raw | undefined;
    const match =
      typeof condition?.Param === 'string' ? /^(\d+)\.(\d+)$/.exec(condition.Param) : null;
    if (
      !skill ||
      skill.category !== 'elation-ascension' ||
      skill.progressionId ||
      !source ||
      !match ||
      !(
        (level === 1 &&
          condition?.Type === 'AvatarLevel' &&
          match[1] === '1511' &&
          match[2] === '0') ||
        (level === 2 &&
          condition?.Type === 'AvatarEidolon' &&
          match[1] === '1511' &&
          match[2] === '2')
      )
    )
      throw new Error(
        `[character/series] AvatarSeriesSkill ${avatarId}:${skillId}:${level}: unsupported condition or invalid skill relation`
      );
    const group = result.get(skillId) ?? { avatarId, skillId, states: [] };
    if (group.states.some((state) => state.level === level))
      throw new Error(`[character/series] duplicate AvatarSeriesSkill ${skillId}:${level}`);
    group.states.push({
      ...source,
      condition: {
        type: condition!.Type as 'AvatarLevel' | 'AvatarEidolon',
        param: String(condition!.Param),
        externalAvatarId: match[1],
        threshold: Number(match[2])
      },
      relatedAvatarIds: ids(row.RelateAvatarIDList)
    });
    result.set(skillId, group);
  }
  for (const skill of skills.filter((skill) => skill.category === 'elation-ascension')) {
    const group = result.get(skill.id);
    if (!group || group.states.length !== skill.levels.length || group.states.length !== 2)
      throw new Error(
        `[character/series] missing AvatarSeriesSkill states for ${avatarId}:${skill.id}`
      );
    group.states.sort((a, b) => a.level - b.level);
  }
  return [...result.values()];
}

/** Obfuscated fields are mapped only where actual 4.7 references establish their meaning. */
export function buildExEidolons(
  avatarId: string,
  tables: Record<string, unknown>
): NeutralExEidolon[] {
  return rows(tables, 'AvatarExRankConfig')
    .filter((row) => String(row.ACCJKGEKHKP) === avatarId)
    .map((row) => {
      const id = String(row.PHFMCACHFIJ);
      return {
        id,
        entityId: `ex-rank:${avatarId}:${id}`,
        avatarId,
        nameSource: textSource(row.OENAMINOLLF),
        descriptionSource: parameterized(row.NMAHGFAPENI, row.NNACKOBKFGE),
        params: params(row.NNACKOBKFGE),
        extraEffectIds: ids(row.BDECHFIJBFA),
        iconPath: typeof row.OLOIFNNLKJP === 'string' ? row.OLOIFNNLKJP : undefined,
        relatedSkillIds: [
          ...new Set(
            rows(tables, 'AvatarSkillConfig')
              .filter((skill) => ids(skill.RelatedExRankIDList).includes(id))
              .map((skill) => String(skill.SkillID))
          )
        ]
      };
    });
}
