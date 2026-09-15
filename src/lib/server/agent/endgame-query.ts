import {
  AGENT_PAYLOAD_LIMIT_BYTES,
  type AgentWarning,
  type EndgameProjection,
  type EndgameSortField,
  type NormalizedEndgameRow,
  type QueryEndgameInput
} from '../../agent/contracts.js';
import { compareDecimals, parseDecimal } from '../../domain/decimal.js';
import type { DecimalString } from '../../domain/endgame.js';
import { getAgentDataVersion } from './data-version.js';
import { loadEndgameRows, type LoadRowsOptions } from './endgame-rows.js';
import { rowWarnings, warning } from './warnings.js';

export interface QueryEndgameOptions extends LoadRowsOptions {
  payloadLimitBytes?: number;
}

function sortValue(
  row: NormalizedEndgameRow,
  field: EndgameSortField
): DecimalString | number | null {
  switch (field) {
    case 'groupId':
      return row.season.groupId;
    case 'encounterOrdinal':
      return row.encounter.ordinal;
    case 'battleSlot':
      return row.battleSlot;
    case 'stageId':
      return row.stage.stageId;
    case 'wave':
      return row.wave.numberOrId;
    case 'enemyTemplateId':
      return row.enemy.templateId;
    case 'monsterId':
      return row.enemy.monsterId;
    case 'hpPerBar':
      return row.stats.hpPerBar;
    case 'speed':
      return row.stats.speed;
    case 'toughnessPerBar':
      return row.stats.toughnessPerBar;
  }
}

function compareSortValues(
  left: DecimalString | number | null,
  right: DecimalString | number | null,
  direction: 'asc' | 'desc'
): number {
  if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
  const comparison =
    typeof left === 'number' && typeof right === 'number'
      ? left - right
      : compareDecimals(parseDecimal(String(left)), parseDecimal(String(right)));
  return direction === 'asc' ? comparison : -comparison;
}

function sortRows(rows: NormalizedEndgameRow[], input: QueryEndgameInput): NormalizedEndgameRow[] {
  if (!input.sort.length) return rows;
  return [...rows].sort((left, right) => {
    for (const sort of input.sort) {
      const compared = compareSortValues(
        sortValue(left, sort.field),
        sortValue(right, sort.field),
        sort.direction
      );
      if (compared) return compared;
    }
    return left.evidenceId < right.evidenceId ? -1 : left.evidenceId > right.evidenceId ? 1 : 0;
  });
}

function projectRow(row: NormalizedEndgameRow, include: readonly EndgameProjection[]) {
  const projected: Record<string, unknown> = {
    evidenceId: row.evidenceId,
    grain: row.grain
  };
  if (include.includes('location')) {
    projected.mode = row.mode;
    projected.season = row.season;
    projected.encounter = row.encounter;
    projected.battleSlot = row.battleSlot;
    projected.stage = row.stage;
    projected.wave = row.wave;
  }
  if (include.includes('enemy-identity')) {
    projected.enemy = {
      monsterId: row.enemy.monsterId,
      templateId: row.enemy.templateId,
      name: row.enemy.name,
      detailStatus: row.enemy.detailStatus,
      detailReason: row.enemy.detailReason,
      rank: row.enemy.rank,
      rankCategory: row.enemy.rankCategory
    };
  }
  if (include.includes('enemy-defenses')) {
    projected.enemyDefenses = {
      detailStatus: row.enemy.detailStatus,
      detailReason: row.enemy.detailReason,
      weaknesses: row.enemy.weaknesses,
      resistances: row.enemy.resistances,
      specialResistances: row.enemy.specialResistances
    };
  }
  if (include.includes('instance-stats')) projected.instanceStats = row.stats;
  if (include.includes('mechanics')) projected.mechanics = row.mechanics;
  return projected;
}

function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

export async function queryEndgame(input: QueryEndgameInput, options: QueryEndgameOptions = {}) {
  const [loadedRows, dataVersion] = await Promise.all([
    loadEndgameRows(input.filter, options),
    getAgentDataVersion()
  ]);
  const sorted = sortRows(loadedRows, input);
  const projectedRows = sorted.slice(0, input.limit).map((row) => projectRow(row, input.include));
  const warnings: AgentWarning[] = rowWarnings(sorted, input.include);
  if (sorted.length > input.limit)
    warnings.push(warning('RESULT_TRUNCATED_ROW_LIMIT', sorted.length - input.limit));
  let output = {
    dataVersion,
    rowGrain: 'configured-occurrence' as const,
    matchedRows: sorted.length,
    returnedRows: projectedRows.length,
    truncated: sorted.length > projectedRows.length,
    warnings,
    rows: projectedRows
  };
  const payloadLimit = options.payloadLimitBytes ?? AGENT_PAYLOAD_LIMIT_BYTES;
  if (byteLength(output) > payloadLimit) {
    const payloadWarning = warning('RESULT_TRUNCATED_PAYLOAD_LIMIT', 0);
    warnings.push(payloadWarning);
    while (projectedRows.length && byteLength(output) > payloadLimit) projectedRows.pop();
    payloadWarning.affectedRows = Math.min(input.limit, sorted.length) - projectedRows.length;
    output = {
      ...output,
      returnedRows: projectedRows.length,
      truncated: true,
      rows: projectedRows
    };
  }
  return output;
}
