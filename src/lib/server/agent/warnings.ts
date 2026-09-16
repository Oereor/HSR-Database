import type {
  AgentWarning,
  AgentWarningCode,
  EndgameMetric,
  EndgameProjection,
  NormalizedEndgameRow
} from '../../agent/contracts.js';

const messages: Record<AgentWarningCode, string> = {
  PF_CONFIGURED_OCCURRENCE_GRAIN:
    'PF 行表示配置中的 occurrence，不代表运行时实际刷新、击杀或出现次数。',
  PF_ROW_COUNT_NOT_RUNTIME_SPAWNS:
    'PF rowCount 仅统计 configured-occurrence rows，不能解释为实际刷新数量。',
  PF_AVG_CONFIGURED_OCCURRENCE_WEIGHTING:
    'PF avg 按 configured-occurrence rows 加权，重复配置会影响平均值。',
  UNRESOLVED_ENEMY_DETAIL: '部分行无法解析 exact Monster detail，未使用 canonical Monster 回退。',
  UNRESOLVED_HP: '部分行的实例 HP 无法由当前配置可靠解析。',
  UNAVAILABLE_SPEED: '部分行缺少可靠的实例速度。',
  UNAVAILABLE_TOUGHNESS: '部分行缺少可靠的每条韧性。',
  RUNTIME_UNCLEAR_EFFECTIVE_TOTAL_HP:
    '部分行包含多阶段、共享/回复/锁定/操纵 HP 或外部机制，effective total HP 无法可靠确定。',
  RESULT_TRUNCATED_ROW_LIMIT: '结果因行数上限被截断。',
  RESULT_TRUNCATED_GROUP_LIMIT: '结果因分组数量上限被截断。',
  RESULT_TRUNCATED_ASSOCIATED_TIES: '并列极值的关联身份或位置因上限被截断。',
  RESULT_TRUNCATED_PAYLOAD_LIMIT: '结果因序列化 payload 上限被截断。'
};

export function warning(code: AgentWarningCode, affectedRows: number): AgentWarning {
  return { code, message: messages[code], affectedRows };
}

export function rowWarnings(
  rows: readonly NormalizedEndgameRow[],
  projections: readonly EndgameProjection[] = []
): AgentWarning[] {
  const result: AgentWarning[] = [];
  const pf = rows.filter(({ mode }) => mode === 'pf').length;
  if (pf) result.push(warning('PF_CONFIGURED_OCCURRENCE_GRAIN', pf));
  const unresolvedDetail = rows.filter(({ enemy }) => enemy.detailStatus === 'unresolved').length;
  if (unresolvedDetail) result.push(warning('UNRESOLVED_ENEMY_DETAIL', unresolvedDetail));
  if (projections.includes('instance-stats') || projections.includes('mechanics')) {
    const unresolvedHp = rows.filter(({ stats }) => stats.hpStatus === 'unresolved').length;
    const unavailableSpeed = rows.filter(({ stats }) => stats.speedStatus === 'unavailable').length;
    const unavailableToughness = rows.filter(
      ({ stats }) => stats.toughnessStatus === 'unavailable'
    ).length;
    const runtimeUnclear = rows.filter(
      ({ stats }) => stats.effectiveTotalHpStatus === 'runtime-unclear'
    ).length;
    if (unresolvedHp) result.push(warning('UNRESOLVED_HP', unresolvedHp));
    if (unavailableSpeed) result.push(warning('UNAVAILABLE_SPEED', unavailableSpeed));
    if (unavailableToughness) result.push(warning('UNAVAILABLE_TOUGHNESS', unavailableToughness));
    if (runtimeUnclear) result.push(warning('RUNTIME_UNCLEAR_EFFECTIVE_TOTAL_HP', runtimeUnclear));
  }
  return result;
}

export function aggregateWarnings(
  rows: readonly NormalizedEndgameRow[],
  metrics: readonly EndgameMetric[]
): AgentWarning[] {
  const result = rowWarnings(rows);
  const pf = rows.filter(({ mode }) => mode === 'pf').length;
  if (pf && metrics.some(({ op }) => op === 'rowCount'))
    result.push(warning('PF_ROW_COUNT_NOT_RUNTIME_SPAWNS', pf));
  if (pf && metrics.some(({ op }) => op === 'avg'))
    result.push(warning('PF_AVG_CONFIGURED_OCCURRENCE_WEIGHTING', pf));
  const numericFields = new Set(
    metrics.flatMap((metric) =>
      'field' in metric && metric.op !== 'countDistinct' ? [metric.field] : []
    )
  );
  if (numericFields.has('hpPerBar')) {
    const count = rows.filter(({ stats }) => stats.hpStatus === 'unresolved').length;
    if (count) result.push(warning('UNRESOLVED_HP', count));
  }
  if (numericFields.has('speed')) {
    const count = rows.filter(({ stats }) => stats.speedStatus === 'unavailable').length;
    if (count) result.push(warning('UNAVAILABLE_SPEED', count));
  }
  if (numericFields.has('toughnessPerBar')) {
    const count = rows.filter(({ stats }) => stats.toughnessStatus === 'unavailable').length;
    if (count) result.push(warning('UNAVAILABLE_TOUGHNESS', count));
  }
  return [...new Map(result.map((item) => [item.code, item])).values()];
}
