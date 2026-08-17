import type { DecimalString, EnemyOccurrence } from '../../src/lib/domain/endgame.js';
import { compareDecimals, parseDecimal } from './decimal.js';
import { buildEndgameData } from './endgame.js';
import { createTextResolver, loadTextMap } from './localization.js';
import { assertDataRoot } from './paths.js';
import { resolvePureFictionFinalHp } from './pure-fiction-hp.js';

interface DiagnosticRow {
  groupId: number;
  encounterId: string;
  slot: number;
  stageId: number;
  waveId: number;
  monsterGroupId: number;
  position: number;
  monsterId: number;
  monsterTemplateId: number;
  name?: string;
  commonFactors: {
    hpBase: DecimalString;
    instanceRatio: DecimalString;
    levelRatio: DecimalString;
    eliteRatio: DecimalString;
  };
  runtimeLevelRatio?: DecimalString;
  ability?: string;
  hpAddedRatio?: DecimalString;
  totalRatio?: DecimalString;
  roundingRole?: 'ordinary' | 'leader';
  baseEncounterMaxHpPerBar: DecimalString;
  runtimeBaseMaxHpPerBar?: DecimalString;
  unroundedFinalMaxHpPerBar?: DecimalString;
  final: EnemyOccurrence['hp']['final'];
}

const root = assertDataRoot();
const text = await createTextResolver(await loadTextMap(root));
const { datasets } = await buildEndgameData(root, text);
const rows: DiagnosticRow[] = [];

for (const group of datasets.pf.groups)
  for (const encounter of group.encounters)
    for (const battle of encounter.battles)
      for (const stage of battle.stages) {
        if (stage.waveModel.kind !== 'spawn-sequence') continue;
        for (const wave of stage.waveModel.waves) {
          const modifier = wave.pureFictionMechanic?.hpModifier;
          if (!modifier) continue;
          for (const monsterGroup of wave.monsterGroups)
            monsterGroup.orderedEnemies.forEach((occurrence, position) => {
              const trace = resolvePureFictionFinalHp({
                hpBase: occurrence.hp.hpBase,
                instanceRatio: occurrence.hp.instanceRatio,
                levelRatio: occurrence.hp.levelRatio,
                eliteRatio: occurrence.hp.eliteRatio,
                baseEncounterMaxHpPerBar: occurrence.hp.baseEncounterMaxHpPerBar,
                rank:
                  occurrence.hp.final.status === 'resolved' &&
                  occurrence.hp.final.rounding === 'truncate'
                    ? 'LittleBoss'
                    : 'Minion',
                modifier
              }).trace;
              rows.push({
                groupId: group.groupId,
                encounterId: encounter.id,
                slot: battle.slot,
                stageId: stage.stageId,
                waveId: wave.waveId,
                monsterGroupId: monsterGroup.monsterGroupId,
                position: position + 1,
                monsterId: occurrence.monsterId,
                monsterTemplateId: occurrence.monsterTemplateId,
                ...(occurrence.name ? { name: occurrence.name } : {}),
                commonFactors: {
                  hpBase: occurrence.hp.hpBase,
                  instanceRatio: occurrence.hp.instanceRatio,
                  levelRatio: occurrence.hp.levelRatio,
                  eliteRatio: occurrence.hp.eliteRatio
                },
                ...(trace ? { runtimeLevelRatio: trace.runtimeLevelRatio } : {}),
                ...(wave.ability ? { ability: wave.ability } : {}),
                ...(modifier.status === 'resolved'
                  ? {
                      hpAddedRatio: modifier.hpAddedRatio,
                      totalRatio: modifier.totalRatio
                    }
                  : {}),
                ...(trace ? { roundingRole: trace.roundingRole } : {}),
                baseEncounterMaxHpPerBar: occurrence.hp.baseEncounterMaxHpPerBar,
                ...(trace
                  ? {
                      runtimeBaseMaxHpPerBar: trace.runtimeBaseMaxHpPerBar,
                      unroundedFinalMaxHpPerBar: trace.unroundedFinalMaxHpPerBar
                    }
                  : {}),
                final: occurrence.hp.final
              });
            });
        }
      }

const resolved = rows.filter(
  (
    row
  ): row is DiagnosticRow & { final: Extract<DiagnosticRow['final'], { status: 'resolved' }> } =>
    row.final.status === 'resolved'
);
const unresolved = rows.filter((row) => row.final.status === 'unresolved');
const nonPositive = resolved.filter(
  (row) => compareDecimals(row.final.maxHpPerBar, parseDecimal('0')) <= 0
);
const contexts = new Map<string, Set<string>>();
for (const row of rows) {
  const key = [row.groupId, row.encounterId, row.slot, row.stageId, row.waveId, row.monsterId].join(
    '/'
  );
  const value =
    row.final.status === 'resolved' ? row.final.maxHpPerBar : `unresolved:${row.final.reason}`;
  const values = contexts.get(key) ?? new Set<string>();
  values.add(value);
  contexts.set(key, values);
}
const conflicts = [...contexts].filter(([, values]) => values.size > 1);
const templateInstances = new Map<number, Set<number>>();
for (const row of rows) {
  const ids = templateInstances.get(row.monsterTemplateId) ?? new Set<number>();
  ids.add(row.monsterId);
  templateInstances.set(row.monsterTemplateId, ids);
}
const sameTemplateDifferentInstances = [...templateInstances]
  .filter(([, ids]) => ids.size > 1)
  .map(([monsterTemplateId, ids]) => ({ monsterTemplateId, monsterIds: [...ids].sort() }));
const roleRanges = Object.fromEntries(
  (['ordinary', 'leader'] as const).map((role) => {
    const values = resolved
      .filter((row) => row.roundingRole === role)
      .map((row) => row.final.maxHpPerBar);
    values.sort(compareDecimals);
    return [role, { occurrences: values.length, min: values[0], max: values.at(-1) }];
  })
);
const finalValues = resolved.map((row) => row.final.maxHpPerBar).sort(compareDecimals);
const unknownModifiers = new Map<string, number>();
for (const row of unresolved) {
  const key = row.final.reason;
  unknownModifiers.set(key, (unknownModifiers.get(key) ?? 0) + 1);
}

console.log(
  JSON.stringify(
    {
      summary: {
        occurrences: rows.length,
        resolved: resolved.length,
        unresolved: unresolved.length,
        minHp: finalValues[0],
        maxHp: finalValues.at(-1),
        rankRanges: roleRanges,
        nonPositive: nonPositive.length,
        sameContextConflicts: conflicts.length,
        sameTemplateDifferentInstances: sameTemplateDifferentInstances.length,
        unknownModifiers: Object.fromEntries(unknownModifiers)
      },
      anomalies: {
        unresolved,
        nonPositive,
        conflicts: conflicts.map(([context, values]) => ({ context, values: [...values] })),
        sameTemplateDifferentInstances: sameTemplateDifferentInstances.slice(0, 20)
      }
    },
    null,
    2
  )
);

const printAll = process.argv.includes('--all');
const selected = printAll
  ? rows
  : rows.filter((row) => row.groupId === 2025 && row.encounterId === '20254');
const traces = printAll
  ? selected
  : [
      ...new Map(
        selected.map((row) => [[row.slot, row.stageId, row.waveId, row.monsterId].join('/'), row])
      ).values()
    ];
for (const row of traces) console.log(JSON.stringify({ trace: row }));
