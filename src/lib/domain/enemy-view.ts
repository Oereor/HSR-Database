import type { Enemy, EnemySummonReference } from './types.js';

export interface EnemySummonView extends EnemySummonReference {
  portraitUrl?: string;
}

export interface EnemyDetailView extends Omit<Enemy, 'summons'> {
  portraitUrl?: string;
  summons: EnemySummonView[];
}
