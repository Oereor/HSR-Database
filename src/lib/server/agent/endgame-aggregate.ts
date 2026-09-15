import {
  AGENT_PAYLOAD_LIMIT_BYTES,
  type AggregateEndgameInput,
  type AggregateMetricValue,
  type AgentWarning,
  type DistinctField,
  type EndgameGroupDimension,
  type EndgameMetric,
  type NormalizedEndgameRow,
  type NumericField
} from '../../agent/contracts.js';
import {
  averageDecimals,
  compareDecimals,
  multiplyDecimals,
  parseDecimal
} from '../../domain/decimal.js';
import type { DecimalString } from '../../domain/endgame.js';
import { getAgentDataVersion } from './data-version.js';
import { loadEndgameRows, type LoadRowsOptions } from './endgame-rows.js';
import { aggregateWarnings, warning } from './warnings.js';

export interface AggregateEndgameOptions extends LoadRowsOptions {
  payloadLimitBytes?: number;
}

interface AggregateGroup {
  dimensions: Record<string, unknown>;
  sourceRows: number;
  metrics: Record<string, AggregateMetricValue>;
  evidenceIds: string[];
  evidenceIdsTruncated: boolean;
}

function dimensionValue(row: NormalizedEndgameRow, dimension: EndgameGroupDimension): unknown {
  switch (dimension) {
    case 'mode':
      return row.mode;
    case 'season':
      return {
        mode: row.mode,
        groupId: row.season.groupId,
        name: row.season.name,
        status: row.season.status
      };
    case 'encounter':
      return {
        mode: row.mode,
        groupId: row.season.groupId,
        id: row.encounter.id,
        name: row.encounter.name,
        ordinal: row.encounter.ordinal,
        variant: row.encounter.variant
      };
    case 'battleSlot':
      return { mode: row.mode, groupId: row.season.groupId, slot: row.battleSlot };
    case 'stage':
      return {
        mode: row.mode,
        groupId: row.season.groupId,
        encounterId: row.encounter.id,
        battleSlot: row.battleSlot,
        stageId: row.stage.stageId,
        level: row.stage.level
      };
    case 'wave':
      return {
        mode: row.mode,
        groupId: row.season.groupId,
        encounterId: row.encounter.id,
        battleSlot: row.battleSlot,
        stageId: row.stage.stageId,
        kind: row.wave.kind,
        numberOrId: row.wave.numberOrId
      };
    case 'enemyTemplate':
      return {
        templateId: row.enemy.templateId,
        name: row.enemy.name,
        rank: row.enemy.rank,
        rankCategory: row.enemy.rankCategory
      };
    case 'monster':
      return {
        monsterId: row.enemy.monsterId,
        templateId: row.enemy.templateId,
        name: row.enemy.name
      };
  }
}

function dimensionsFor(row: NormalizedEndgameRow, dimensions: readonly EndgameGroupDimension[]) {
  return Object.fromEntries(
    dimensions.map((dimension) => [dimension, dimensionValue(row, dimension)])
  );
}

function numericValue(row: NormalizedEndgameRow, field: NumericField): DecimalString | null {
  switch (field) {
    case 'hpPerBar':
      return row.stats.hpPerBar;
    case 'speed':
      return row.stats.speed;
    case 'toughnessPerBar':
      return row.stats.toughnessPerBar;
    case 'level':
      return parseDecimal(String(row.stage.level));
  }
}

function distinctValue(row: NormalizedEndgameRow, field: DistinctField): string {
  switch (field) {
    case 'seasonKey':
      return `${row.mode}:${row.season.groupId}`;
    case 'encounterKey':
      return `${row.mode}:${row.season.groupId}:${row.encounter.id}`;
    case 'stageKey':
      return `${row.mode}:${row.season.groupId}:${row.encounter.id}:${row.battleSlot}:${row.stage.stageId}`;
    case 'waveKey':
      return `${row.mode}:${row.season.groupId}:${row.encounter.id}:${row.battleSlot}:${row.stage.stageId}:${row.wave.kind}:${row.wave.numberOrId}`;
    case 'enemyTemplateId':
      return String(row.enemy.templateId);
    case 'monsterId':
      return String(row.enemy.monsterId);
  }
}

function metricValue(
  rows: readonly NormalizedEndgameRow[],
  metric: EndgameMetric
): AggregateMetricValue {
  if (metric.op === 'rowCount')
    return {
      op: metric.op,
      value: rows.length,
      includedRows: rows.length,
      skippedUnresolvedRows: 0
    };
  if (metric.op === 'countDistinct')
    return {
      op: metric.op,
      value: new Set(rows.map((row) => distinctValue(row, metric.field))).size,
      includedRows: rows.length,
      skippedUnresolvedRows: 0
    };
  const values = rows.flatMap((row) => {
    const value = numericValue(row, metric.field);
    return value === null ? [] : [value];
  });
  const skippedUnresolvedRows = rows.length - values.length;
  if (!values.length)
    return {
      op: metric.op,
      value: null,
      includedRows: 0,
      skippedUnresolvedRows
    } as AggregateMetricValue;
  if (metric.op === 'avg')
    return {
      op: metric.op,
      value: averageDecimals(values),
      includedRows: values.length,
      skippedUnresolvedRows
    };
  let value = values[0];
  for (const candidate of values.slice(1)) {
    const comparison = compareDecimals(candidate, value);
    if ((metric.op === 'min' && comparison < 0) || (metric.op === 'max' && comparison > 0))
      value = candidate;
  }
  return { op: metric.op, value, includedRows: values.length, skippedUnresolvedRows };
}

function groupRows(
  rows: readonly NormalizedEndgameRow[],
  input: AggregateEndgameInput
): AggregateGroup[] {
  const buckets = new Map<
    string,
    { dimensions: Record<string, unknown>; rows: NormalizedEndgameRow[] }
  >();
  for (const row of rows) {
    const dimensions = dimensionsFor(row, input.groupBy);
    const key = JSON.stringify(dimensions);
    const bucket = buckets.get(key);
    if (bucket) bucket.rows.push(row);
    else buckets.set(key, { dimensions, rows: [row] });
  }
  if (!rows.length && !input.groupBy.length) buckets.set('{}', { dimensions: {}, rows: [] });
  return [...buckets.values()].map(({ dimensions, rows: group }) => {
    const evidenceIds = group.map(({ evidenceId }) => evidenceId).sort();
    return {
      dimensions,
      sourceRows: group.length,
      metrics: Object.fromEntries(
        input.metrics.map((metric) => [metric.as, metricValue(group, metric)])
      ),
      evidenceIds: evidenceIds.slice(0, 8),
      evidenceIdsTruncated: evidenceIds.length > 8
    };
  });
}

function compareText(left: unknown, right: unknown): number {
  const a = JSON.stringify(left);
  const b = JSON.stringify(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareAverage(
  left: Extract<AggregateMetricValue, { op: 'avg' }>,
  right: Extract<AggregateMetricValue, { op: 'avg' }>
): number {
  if (left.value === null || right.value === null)
    return left.value === right.value ? 0 : left.value === null ? 1 : -1;
  return compareDecimals(
    multiplyDecimals([left.value.numerator, parseDecimal(String(right.value.denominator))]),
    multiplyDecimals([right.value.numerator, parseDecimal(String(left.value.denominator))])
  );
}

function compareMetrics(left: AggregateMetricValue, right: AggregateMetricValue): number {
  if (left.op === 'avg' && right.op === 'avg') return compareAverage(left, right);
  if (left.value === null || right.value === null)
    return left.value === right.value ? 0 : left.value === null ? 1 : -1;
  if (typeof left.value === 'number' && typeof right.value === 'number')
    return left.value - right.value;
  if (typeof left.value === 'string' && typeof right.value === 'string')
    return compareDecimals(left.value, right.value);
  return 0;
}

function sortGroups(groups: AggregateGroup[], input: AggregateEndgameInput): AggregateGroup[] {
  if (!input.sort.length) return groups;
  return [...groups].sort((left, right) => {
    for (const sort of input.sort) {
      const comparison =
        sort.by === 'dimension'
          ? compareText(left.dimensions[sort.dimension], right.dimensions[sort.dimension])
          : compareMetrics(left.metrics[sort.metric], right.metrics[sort.metric]);
      if (comparison) return sort.direction === 'asc' ? comparison : -comparison;
    }
    return compareText(left.dimensions, right.dimensions);
  });
}

function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

export async function aggregateEndgame(
  input: AggregateEndgameInput,
  options: AggregateEndgameOptions = {}
) {
  const [rows, dataVersion] = await Promise.all([
    loadEndgameRows(input.filter, options),
    getAgentDataVersion()
  ]);
  const allGroups = sortGroups(groupRows(rows, input), input);
  const groups = allGroups.slice(0, input.limit);
  const warnings: AgentWarning[] = aggregateWarnings(rows, input.metrics);
  if (allGroups.length > input.limit)
    warnings.push(warning('RESULT_TRUNCATED_GROUP_LIMIT', allGroups.length - input.limit));
  let output = {
    dataVersion,
    rowGrain: 'configured-occurrence' as const,
    sourceRows: rows.length,
    matchedGroups: allGroups.length,
    returnedGroups: groups.length,
    truncated: allGroups.length > groups.length,
    warnings,
    groups
  };
  const payloadLimit = options.payloadLimitBytes ?? AGENT_PAYLOAD_LIMIT_BYTES;
  if (byteLength(output) > payloadLimit) {
    const payloadWarning = warning('RESULT_TRUNCATED_PAYLOAD_LIMIT', 0);
    warnings.push(payloadWarning);
    while (groups.length && byteLength(output) > payloadLimit) groups.pop();
    payloadWarning.affectedRows = Math.min(input.limit, allGroups.length) - groups.length;
    output = { ...output, returnedGroups: groups.length, truncated: true, groups };
  }
  return output;
}
