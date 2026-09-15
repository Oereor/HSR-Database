import type { EndgameDatasetByMode, EndgameMode } from '../../domain/endgame.js';
import type { Enemy } from '../../domain/types.js';
import { AGENT_LOCALE } from '../../agent/contracts.js';
import { getEnemyDetail, getGeneratedEndgameDataset } from '../generated.js';

export interface AgentDataSource {
  getEndgameDataset<TMode extends EndgameMode>(mode: TMode): Promise<EndgameDatasetByMode[TMode]>;
  getEnemyDetail(templateId: number): Promise<Enemy>;
}

export const defaultAgentDataSource: AgentDataSource = {
  getEndgameDataset: (mode) => getGeneratedEndgameDataset(mode, AGENT_LOCALE),
  getEnemyDetail: (templateId) => getEnemyDetail(AGENT_LOCALE, String(templateId))
};
