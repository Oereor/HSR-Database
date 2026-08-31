import type { EndgameBattleSlotView, EndgameWaveView } from '$lib/domain/endgame-view';

export type EndgameEnemyCardVariant = 'standard' | 'compact';

export type EndgameWaveLayoutPolicy = 'paired' | 'stacked';

export interface EndgameWaveGroupPresentation {
  key: string;
  level: number;
  ordinal: number;
  wave: EndgameWaveView;
}

export interface EndgameWaveRowPresentation {
  key: string;
  groups: EndgameWaveGroupPresentation[];
}

const MAX_PAIRED_ENEMY_CARDS = 4;

export function buildEndgameWaveGroups(
  battle: EndgameBattleSlotView
): EndgameWaveGroupPresentation[] {
  return battle.stages
    .flatMap((stage) =>
      stage.waves.map((wave) => ({
        key: `${stage.key}:${wave.key}`,
        level: stage.level,
        wave
      }))
    )
    .map((group, index) => ({ ...group, ordinal: index + 1 }));
}

function waveGroupCardCount(group: EndgameWaveGroupPresentation): number {
  return Math.max(1, group.wave.enemies.length);
}

export function buildEndgameWaveRows(
  groups: EndgameWaveGroupPresentation[],
  policy: EndgameWaveLayoutPolicy
): EndgameWaveRowPresentation[] {
  if (policy === 'stacked') return groups.map((group) => ({ key: group.key, groups: [group] }));

  const rows: EndgameWaveRowPresentation[] = [];
  for (let index = 0; index < groups.length;) {
    const first = groups[index];
    const second = groups[index + 1];
    const canPair =
      second && waveGroupCardCount(first) + waveGroupCardCount(second) <= MAX_PAIRED_ENEMY_CARDS;
    const rowGroups = canPair ? [first, second] : [first];
    rows.push({
      key: rowGroups.map((group) => group.key).join('|'),
      groups: rowGroups
    });
    index += rowGroups.length;
  }
  return rows;
}

export function formatChineseOrdinal(value: number): string {
  if (!Number.isInteger(value) || value <= 0 || value >= 100) return String(value);
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (value < 10) return digits[value];
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${tens === 1 ? '' : digits[tens]}十${digits[ones]}`;
}
