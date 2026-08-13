import type { Trace } from './types';

export interface TraceAbilityGroup {
  ability: Trace;
  stats: Trace[];
}

export interface TraceCardGroups {
  abilityGroups: TraceAbilityGroup[];
  standaloneStats: Trace[];
  specialAbilities: Trace[];
}

const compareTrace = (left: Trace, right: Trace): number =>
  left.anchorOrder - right.anchorOrder || left.id.localeCompare(right.id);

export function groupTracesForDisplay(traces: Trace[]): TraceCardGroups {
  const byId = new Map<string, Trace>();
  for (const trace of traces) {
    if (byId.has(trace.id)) throw new Error(`行迹分组存在重复节点：${trace.id}`);
    if (trace.prerequisiteIds.length > 1)
      throw new Error(`行迹 ${trace.id} 存在未经审计的多个前置节点`);
    byId.set(trace.id, trace);
  }

  for (const trace of traces)
    for (const prerequisiteId of trace.prerequisiteIds) {
      if (prerequisiteId === trace.id) throw new Error(`行迹分组存在自引用：${trace.id}`);
      if (!byId.has(prerequisiteId))
        throw new Error(`行迹分组存在悬空前置节点：${trace.id} → ${prerequisiteId}`);
    }

  const regularAbilities = traces
    .filter((trace) => trace.type === 'ability' && trace.sourcePointType !== 5)
    .sort(compareTrace);
  const specialAbilities = traces
    .filter((trace) => trace.type === 'ability' && trace.sourcePointType === 5)
    .sort(compareTrace);
  const groupByAbilityId = new Map(
    regularAbilities.map((ability) => [ability.id, { ability, stats: [] as Trace[] }])
  );
  const standaloneStats: Trace[] = [];

  for (const stat of traces.filter((trace) => trace.type === 'stat').sort(compareTrace)) {
    let current = stat;
    const visited = new Set([stat.id]);
    let ownerId: string | undefined;

    while (current.prerequisiteIds.length) {
      const prerequisite = byId.get(current.prerequisiteIds[0])!;
      if (visited.has(prerequisite.id))
        throw new Error(`行迹分组存在循环：${[...visited, prerequisite.id].join(' → ')}`);
      visited.add(prerequisite.id);
      if (prerequisite.type === 'ability') {
        if (prerequisite.sourcePointType === 5)
          throw new Error(`属性节点 ${stat.id} 指向未经审计的特殊额外能力 ${prerequisite.id}`);
        ownerId = prerequisite.id;
        break;
      }
      current = prerequisite;
    }

    if (ownerId) groupByAbilityId.get(ownerId)!.stats.push(stat);
    else standaloneStats.push(stat);
  }

  return {
    abilityGroups: regularAbilities.map((ability) => groupByAbilityId.get(ability.id)!),
    standaloneStats,
    specialAbilities
  };
}
