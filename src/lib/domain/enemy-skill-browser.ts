import type { EnemySkillView } from './enemy-view';
import type { EnemySkillPhase } from './types';

/** Keep the concrete Monster's skill order when a phase narrows the browser. */
export function enemySkillsInPhase(
  skills: EnemySkillView[],
  phase: EnemySkillPhase | undefined
): EnemySkillView[] {
  if (!phase) return skills;
  const ids = new Set(phase.skillIds);
  return skills.filter((skill) => ids.has(skill.id));
}

export function resolveEnemySkillSelection(
  skills: EnemySkillView[],
  phases: EnemySkillPhase[],
  previousPhaseIndex: number | undefined,
  previousSkillId: string | undefined
): { phaseIndex: number | undefined; skillId: string | undefined } {
  const currentPhase = phases.find((phase) => phase.index === previousPhaseIndex);
  if (previousSkillId && skills.some((skill) => skill.id === previousSkillId)) {
    const containingPhase =
      (currentPhase?.skillIds.includes(previousSkillId) && currentPhase) ||
      phases.find((phase) => phase.skillIds.includes(previousSkillId));
    if (containingPhase || phases.length === 0)
      return { phaseIndex: containingPhase?.index, skillId: previousSkillId };
  }

  const fallbackPhase =
    (currentPhase && enemySkillsInPhase(skills, currentPhase).length && currentPhase) ||
    phases.find((phase) => enemySkillsInPhase(skills, phase).length) ||
    phases[0];
  return {
    phaseIndex: fallbackPhase?.index,
    skillId: enemySkillsInPhase(skills, fallbackPhase)[0]?.id
  };
}
