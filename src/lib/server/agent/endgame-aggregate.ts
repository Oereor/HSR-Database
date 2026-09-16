import { createHash } from 'node:crypto';
import {
  AGENT_PAYLOAD_LIMIT_BYTES,
  ARG_EXTREMA_TIE_LIMIT,
  type AggregateEndgameInput,
  type AggregateMetricValue,
  type AgentWarning,
  type AssociatedExtremum,
  type AssociatedSelect,
  type DistinctField,
  type EndgameGroupDimension,
  type EndgameMetric,
  type NormalizedEndgameRow,
  type NumericField,
  type SelectEndgameExtremaInput
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

type EndgameAnalysisSort =
  | { by: 'dimension'; dimension: EndgameGroupDimension; direction: 'asc' | 'desc' }
  | { by: 'metric'; metric: string; direction: 'asc' | 'desc' };

export interface EndgameAnalysisInput extends Omit<AggregateEndgameInput, 'metrics' | 'sort'> {
  metrics: EndgameMetric[];
  sort: EndgameAnalysisSort[];
}

export interface AggregateGroup {
  dimensions: Record<string, unknown>;
  sourceRows: number;
  metrics: Record<string, AggregateMetricValue>;
}

interface ModelAggregateMetric {
  value: string | number | null;
  approximate?: boolean;
  associated?: AssociatedExtremum[];
  tiedRowCount?: number;
  tieCount?: number;
  returnedTies?: number;
  tiesTruncated?: boolean;
  includedRows: number;
  skippedUnresolvedRows: number;
}

function scalarDimensionValue(
  row: NormalizedEndgameRow,
  dimension: Exclude<EndgameGroupDimension, 'weakness'>
): unknown {
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

function dimensionValues(row: NormalizedEndgameRow, dimension: EndgameGroupDimension): unknown[] {
  if (dimension !== 'weakness') return [scalarDimensionValue(row, dimension)];
  if (row.enemy.detailStatus === 'unresolved') return [];
  const values = new Map(
    row.enemy.weaknesses.map(({ element, name }) => [element, { element, name }])
  );
  return [...values.values()].sort((left, right) => left.element.localeCompare(right.element));
}

function dimensionAssignments(
  row: NormalizedEndgameRow,
  dimensions: readonly EndgameGroupDimension[]
): Array<Record<string, unknown>> {
  let assignments: Array<Record<string, unknown>> = [{}];
  for (const dimension of dimensions) {
    const values = dimensionValues(row, dimension);
    if (!values.length) return [];
    assignments = assignments.flatMap((assignment) =>
      values.map((value) => ({ ...assignment, [dimension]: value }))
    );
  }
  return assignments;
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

const associatedSelectOrder = [
  'enemyTemplate',
  'monster',
  'location'
] as const satisfies readonly AssociatedSelect[];

function associatedValue(
  row: NormalizedEndgameRow,
  selected: readonly AssociatedSelect[]
): AssociatedExtremum {
  const selection = new Set(selected);
  const result: AssociatedExtremum = {};
  for (const field of associatedSelectOrder) {
    if (!selection.has(field)) continue;
    if (field === 'enemyTemplate')
      result.enemyTemplate = {
        enemyTemplateId: row.enemy.templateId,
        name: row.enemy.name,
        rank: row.enemy.rank,
        rankCategory: row.enemy.rankCategory
      };
    if (field === 'monster')
      result.monster = {
        monsterId: row.enemy.monsterId,
        enemyTemplateId: row.enemy.templateId,
        name: row.enemy.name
      };
    if (field === 'location')
      result.location = {
        mode: row.mode,
        season: {
          groupId: row.season.groupId,
          name: row.season.name,
          status: row.season.status
        },
        encounter: {
          id: row.encounter.id,
          name: row.encounter.name,
          ordinal: row.encounter.ordinal,
          variant: row.encounter.variant
        },
        battleSlot: row.battleSlot,
        stage: {
          stageId: row.stage.stageId,
          ordinal: row.stage.ordinal,
          level: row.stage.level
        },
        wave: {
          kind: row.wave.kind,
          numberOrId: row.wave.numberOrId,
          monsterGroupId: row.wave.monsterGroupId,
          configuredPosition: row.wave.configuredPosition
        }
      };
  }
  return result;
}

function canonicalText(value: unknown): string {
  return JSON.stringify(canonicalize(value));
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
  if (!values.length) {
    if (metric.op === 'argMin' || metric.op === 'argMax')
      return {
        op: metric.op,
        value: null,
        associated: [],
        tiedRowCount: 0,
        tieCount: 0,
        returnedTies: 0,
        tiesTruncated: false,
        includedRows: 0,
        skippedUnresolvedRows
      };
    return {
      op: metric.op,
      value: null,
      includedRows: 0,
      skippedUnresolvedRows
    } as AggregateMetricValue;
  }
  if (metric.op === 'avg')
    return {
      op: metric.op,
      value: averageDecimals(values),
      includedRows: values.length,
      skippedUnresolvedRows
    };
  const direction = metric.op === 'min' || metric.op === 'argMin' ? 'min' : 'max';
  let value = values[0];
  for (const candidate of values.slice(1)) {
    const comparison = compareDecimals(candidate, value);
    if ((direction === 'min' && comparison < 0) || (direction === 'max' && comparison > 0))
      value = candidate;
  }
  if (metric.op === 'argMin' || metric.op === 'argMax') {
    const tiedRows = rows.filter((row) => {
      const candidate = numericValue(row, metric.field);
      return candidate !== null && compareDecimals(candidate, value) === 0;
    });
    const distinct = new Map<
      string,
      { associated: AssociatedExtremum; stableLocationKey: string }
    >();
    for (const row of tiedRows) {
      const associated = associatedValue(row, metric.select);
      const key = canonicalText(associated);
      const current = distinct.get(key);
      if (!current || row.evidenceId < current.stableLocationKey)
        distinct.set(key, { associated, stableLocationKey: row.evidenceId });
    }
    const ties = [...distinct.entries()]
      .sort(
        ([leftKey, left], [rightKey, right]) =>
          leftKey.localeCompare(rightKey) ||
          left.stableLocationKey.localeCompare(right.stableLocationKey)
      )
      .map(([, item]) => item.associated);
    const associated = ties.slice(0, ARG_EXTREMA_TIE_LIMIT);
    return {
      op: metric.op,
      value,
      associated,
      tiedRowCount: tiedRows.length,
      tieCount: ties.length,
      returnedTies: associated.length,
      tiesTruncated: ties.length > associated.length,
      includedRows: values.length,
      skippedUnresolvedRows
    };
  }
  return { op: metric.op, value, includedRows: values.length, skippedUnresolvedRows };
}

export function aggregateRows(
  rows: readonly NormalizedEndgameRow[],
  input: EndgameAnalysisInput
): AggregateGroup[] {
  const buckets = new Map<
    string,
    { dimensions: Record<string, unknown>; rows: NormalizedEndgameRow[] }
  >();
  for (const row of rows) {
    for (const dimensions of dimensionAssignments(row, input.groupBy)) {
      const key = JSON.stringify(dimensions);
      const bucket = buckets.get(key);
      if (bucket) bucket.rows.push(row);
      else buckets.set(key, { dimensions, rows: [row] });
    }
  }
  if (!rows.length && !input.groupBy.length) buckets.set('{}', { dimensions: {}, rows: [] });
  return [...buckets.values()].map(({ dimensions, rows: group }) => ({
    dimensions,
    sourceRows: group.length,
    metrics: Object.fromEntries(
      input.metrics.map((metric) => [metric.as, metricValue(group, metric)])
    )
  }));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value))
    return value
      .map(canonicalize)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)])
  );
}

export function aggregateEvidenceId(input: {
  dataRevision: string;
  filter: EndgameAnalysisInput['filter'];
  groupBy: EndgameAnalysisInput['groupBy'];
  metrics: EndgameAnalysisInput['metrics'];
  dimensions: Record<string, unknown>;
}): string {
  const semantics = {
    ...(input.groupBy.includes('weakness') ? { multiValuedGrouping: 'explode-v1' } : {}),
    ...(input.metrics.some(({ op }) => op === 'argMin' || op === 'argMax')
      ? { associatedExtrema: `all-distinct-associated-v1-cap-${ARG_EXTREMA_TIE_LIMIT}` }
      : {})
  };
  const canonical = canonicalize({
    dataRevision: input.dataRevision,
    filter: input.filter,
    groupBy: input.groupBy,
    metrics: [...input.metrics].sort((left, right) => left.as.localeCompare(right.as)),
    dimensions: input.dimensions,
    ...(Object.keys(semantics).length ? { semantics } : {})
  });
  return `ag1/${createHash('sha256').update(JSON.stringify(canonical)).digest('hex')}`;
}

function modelMetric(value: AggregateMetricValue): ModelAggregateMetric {
  if (value.op === 'argMin' || value.op === 'argMax')
    return {
      value: value.value,
      associated: value.associated,
      tiedRowCount: value.tiedRowCount,
      tieCount: value.tieCount,
      returnedTies: value.returnedTies,
      tiesTruncated: value.tiesTruncated,
      includedRows: value.includedRows,
      skippedUnresolvedRows: value.skippedUnresolvedRows
    };
  if (value.op !== 'avg')
    return {
      value: value.value,
      includedRows: value.includedRows,
      skippedUnresolvedRows: value.skippedUnresolvedRows
    };
  return {
    value: value.value?.exactDecimal ?? value.value?.decimalApprox ?? null,
    ...(value.value ? { approximate: value.value.approximate } : {}),
    includedRows: value.includedRows,
    skippedUnresolvedRows: value.skippedUnresolvedRows
  };
}

function modelGroup(group: AggregateGroup, input: EndgameAnalysisInput, dataRevision: string) {
  return {
    evidenceId: aggregateEvidenceId({
      dataRevision,
      filter: input.filter,
      groupBy: input.groupBy,
      metrics: input.metrics,
      dimensions: group.dimensions
    }),
    dimensions: group.dimensions,
    sourceRows: group.sourceRows,
    metrics: Object.fromEntries(
      Object.entries(group.metrics).map(([alias, value]) => [alias, modelMetric(value)])
    )
  };
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

function sortGroups(groups: AggregateGroup[], input: EndgameAnalysisInput): AggregateGroup[] {
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

export async function executeEndgameAnalysis(
  input: EndgameAnalysisInput,
  options: AggregateEndgameOptions = {}
) {
  const [rows, dataVersion] = await Promise.all([
    loadEndgameRows(input.filter, options),
    getAgentDataVersion()
  ]);
  const allGroups = sortGroups(aggregateRows(rows, input), input);
  const groups = allGroups
    .slice(0, input.limit)
    .map((group) => modelGroup(group, input, dataVersion.dataRevision));
  const warnings: AgentWarning[] = aggregateWarnings(rows, input.metrics);
  const omittedAssociatedTies = groups.reduce(
    (total, group) =>
      total +
      Object.values(group.metrics).reduce(
        (subtotal, metric) =>
          subtotal +
          (metric.tiesTruncated ? (metric.tieCount ?? 0) - (metric.returnedTies ?? 0) : 0),
        0
      ),
    0
  );
  if (omittedAssociatedTies)
    warnings.push(warning('RESULT_TRUNCATED_ASSOCIATED_TIES', omittedAssociatedTies));
  if (allGroups.length > input.limit)
    warnings.push(warning('RESULT_TRUNCATED_GROUP_LIMIT', allGroups.length - input.limit));
  let output = {
    dataVersion,
    rowGrain: 'configured-occurrence' as const,
    sourceRows: rows.length,
    ...(input.groupBy.includes('weakness')
      ? {
          grouping: {
            explodedDimensions: ['weakness'] as const,
            semantics: 'explode-v1' as const
          }
        }
      : {}),
    matchedGroups: allGroups.length,
    returnedGroups: groups.length,
    truncated: allGroups.length > groups.length || omittedAssociatedTies > 0,
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

export async function aggregateEndgame(
  input: AggregateEndgameInput,
  options: AggregateEndgameOptions = {}
) {
  return executeEndgameAnalysis(input, options);
}

function extremaAnalysisInput(input: SelectEndgameExtremaInput): EndgameAnalysisInput {
  return {
    locale: input.locale,
    filter: input.filter,
    groupBy: input.groupBy,
    metrics: input.extrema,
    sort: input.sort.map((sort) =>
      sort.by === 'extremum'
        ? { by: 'metric' as const, metric: sort.extremum, direction: sort.direction }
        : sort
    ),
    limit: input.limit
  };
}

export async function selectEndgameExtrema(
  input: SelectEndgameExtremaInput,
  options: AggregateEndgameOptions = {}
) {
  const output = await executeEndgameAnalysis(extremaAnalysisInput(input), options);
  return {
    ...output,
    groups: output.groups.map(({ metrics, ...group }) => ({ ...group, extrema: metrics }))
  };
}
