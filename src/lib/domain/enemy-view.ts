import type { Enemy, EnemySkill, EnemySummonReference } from './types.js';

export interface EnemySummonView extends EnemySummonReference {
  portraitUrl?: string;
}

export interface EnemySkillPhaseView {
  index: number;
  skills: EnemySkill[];
}

export interface EnemyDetailView extends Omit<Enemy, 'summons' | 'skillPhases'> {
  portraitUrl?: string;
  summons: EnemySummonView[];
  skillPhases: EnemySkillPhaseView[];
}
