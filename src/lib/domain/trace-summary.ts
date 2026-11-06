import type { Trace } from './types';
import { groupTracesForDisplay } from './trace-groups';

type State = 'active' | 'inactive' | 'unresolved';
export interface TraceStatSummary {
  propertyType: string;
  percent: boolean;
  value: number;
  unresolved: boolean;
  nodes: Array<{ trace: Trace; owner?: Trace; state?: State }>;
}

export function summarizeTraceStats(traces: Trace[], stateOf?: (trace: Trace) => State) {
  const groups = groupTracesForDisplay(traces);
  const owners = new Map(
    groups.abilityGroups.flatMap((group) =>
      group.stats.map((trace) => [trace.id, group.ability] as const)
    )
  );
  const summaries = new Map<string, TraceStatSummary>();
  const independent: Trace[] = [];
  for (const trace of traces
    .filter((trace) => trace.type === 'stat')
    .sort((a, b) => a.anchorOrder - b.anchorOrder || a.id.localeCompare(b.id))) {
    const bonus = trace.statBonus;
    if (
      !bonus ||
      !Number.isFinite(bonus.value) ||
      trace.extraEffects?.length ||
      trace.sourcePointType !== 1 ||
      bonus.propertyType !== trace.propertyType
    ) {
      independent.push(trace);
      continue;
    }
    const key = `${bonus.propertyType}:${bonus.percent}`;
    const summary = summaries.get(key) ?? {
      propertyType: bonus.propertyType,
      percent: bonus.percent,
      value: 0,
      unresolved: false,
      nodes: []
    };
    const state = stateOf?.(trace);
    summary.nodes.push({ trace, owner: owners.get(trace.id), state });
    if (!stateOf || state === 'active')
      summary.value = Number((summary.value + bonus.value).toFixed(10));
    if (state === 'unresolved') summary.unresolved = true;
    summaries.set(key, summary);
  }
  return {
    summaries: [...summaries.values()],
    independent,
    abilities: [...groups.abilityGroups.map((group) => group.ability), ...groups.specialAbilities],
    owners
  };
}

export function formatTraceBonus(value: number, percent: boolean, locale: string): string {
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: percent ? 1 : 0,
    maximumFractionDigits: percent ? 1 : 10
  }).format(Number((value * (percent ? 100 : 1)).toFixed(10)));
  return `${number}${percent ? '%' : ''}`;
}
