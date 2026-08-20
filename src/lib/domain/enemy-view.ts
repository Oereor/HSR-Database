import type { Enemy, EnemySkill, EnemySummonReference, Monster } from './types.js';

export interface EnemySummonView extends EnemySummonReference {
  portraitUrl?: string;
}

export interface EnemySkillPhaseView {
  index: number;
  skills: EnemySkill[];
}

export interface EnemyDetailView
  extends
    Omit<
      Enemy,
      | 'stats'
      | 'weaknesses'
      | 'resistances'
      | 'specialResistances'
      | 'summons'
      | 'skills'
      | 'skillPhases'
    >,
    Pick<Monster, 'stats' | 'weaknesses' | 'resistances' | 'specialResistances' | 'skills'> {
  defaultMonster: Monster;
  portraitUrl?: string;
  summons: EnemySummonView[];
  skillPhases: EnemySkillPhaseView[];
}
