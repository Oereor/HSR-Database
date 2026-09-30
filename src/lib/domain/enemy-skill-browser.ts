import type { EnemySkillPhaseView, EnemySkillView } from './enemy-view';

/** Keep the concrete Monster's skill order when a phase narrows the browser. */
export function enemySkillsInPhase(
  skills: EnemySkillView[],
  phase: EnemySkillPhaseView | undefined
): EnemySkillView[] {
  if (!phase) return skills;
  const ids = new Set(phase.skills.map((skill) => skill.id));
  return skills.filter((skill) => ids.has(skill.id));
}

export function resolveEnemySkillSelection(
  skills: EnemySkillView[],
  phases: EnemySkillPhaseView[],
  previousPhaseIndex: number | undefined,
  previousSkillId: string | undefined
): { phaseIndex: number | undefined; skillId: string | undefined } {
  const currentPhase = phases.find((phase) => phase.index === previousPhaseIndex);
  if (previousSkillId && skills.some((skill) => skill.id === previousSkillId)) {
    const containingPhase =
      (currentPhase?.skills.some((skill) => skill.id === previousSkillId) && currentPhase) ||
      phases.find((phase) => phase.skills.some((skill) => skill.id === previousSkillId));
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
