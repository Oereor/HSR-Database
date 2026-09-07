import type { Enemy } from '../../src/lib/domain/types.js';
import type {
  EndgameDatasetByMode,
  EndgameGroup,
  EndgameStage
} from '../../src/lib/domain/endgame.js';
import {
  buildOccurrenceView,
  buildPeriodView,
  endgameEnemyReferenceKey,
  presentedStageWaves,
  resolveEndgameEnemyReference,
  type EndgameEnemyReference,
  type EndgameViewPresentation
} from '../../src/lib/domain/endgame-view.js';
import {
  endgameOccurrenceLocatorKey,
  type EndgameOccurrenceLocator,
  type EndgameOccurrenceShard,
  type EndgameSearchTargetEntry,
  type SearchLocale
} from '../../src/lib/domain/search-index.js';

export interface EndgameOccurrenceShardBuildInput {
  locale: SearchLocale;
  datasets: EndgameDatasetByMode;
  enemies: readonly Enemy[];
  targets: readonly EndgameSearchTargetEntry[];
  presentation: EndgameViewPresentation;
  now: number;
}

function groupFor(datasets: EndgameDatasetByMode, locator: EndgameOccurrenceLocator): EndgameGroup {
  const group = datasets[locator.mode].groups.find(({ groupId }) => groupId === locator.groupId);
  if (!group)
    throw new Error(`Endgame shard locator is missing group ${locator.mode}:${locator.groupId}`);
  return group;
}

function stageFor(group: EndgameGroup, locator: EndgameOccurrenceLocator): EndgameStage {
  const stage = group.encounters
    .find(({ id }) => id === locator.encounterId)
    ?.battles.find(({ slot }) => slot === locator.battleSlot)
    ?.stages.find(({ stageId }) => stageId === locator.stageId);
  if (!stage)
    throw new Error(
      `Endgame shard locator is missing stage ${endgameOccurrenceLocatorKey(locator)}`
    );
  return stage;
}

function waveIndexFor(stage: EndgameStage, locator: EndgameOccurrenceLocator): number {
  if (stage.waveModel.kind !== locator.wave.kind) return -1;
  return stage.waveModel.waves.findIndex((wave) =>
    locator.wave.kind === 'fixed'
      ? 'wave' in wave && wave.wave === locator.wave.number
      : 'waveId' in wave && wave.waveId === locator.wave.infiniteWaveId
  );
}

/** Pure deterministic shard construction over already projected locale data. */
export function buildEndgameOccurrenceShards(
  input: EndgameOccurrenceShardBuildInput
): Record<string, EndgameOccurrenceShard> {
  const enemyByTemplate = new Map(input.enemies.map((enemy) => [enemy.id, enemy]));
  const referenceCache = new Map<string, EndgameEnemyReference>();
  const referenceFor = (monsterId: number, templateId: number): EndgameEnemyReference => {
    const key = endgameEnemyReferenceKey(monsterId, templateId);
    const cached = referenceCache.get(key);
    if (cached) return cached;
    const enemy = enemyByTemplate.get(String(templateId));
    const reference = enemy
      ? resolveEndgameEnemyReference(enemy, monsterId)
      : { weaknesses: [], exists: false };
    referenceCache.set(key, reference);
    return reference;
  };

  return Object.fromEntries(
    [...input.targets]
      .sort((left, right) => Number(left.id) - Number(right.id))
      .map((target) => {
        const groups = new Map<string, EndgameGroup>();
        const occurrences: EndgameOccurrenceShard['occurrences'] = {};
        for (const { locator } of target.occurrences) {
          const group = groupFor(input.datasets, locator);
          groups.set(`${locator.mode}:${locator.groupId}`, group);
          const stage = stageFor(group, locator);
          const waveIndex = waveIndexFor(stage, locator);
          const presented = waveIndex < 0 ? undefined : presentedStageWaves(stage)[waveIndex];
          const entry = presented?.find(
            ({ occurrence }) => occurrence.monsterId === locator.monsterId
          );
          if (!entry)
            throw new Error(
              `Endgame shard locator cannot be resolved: ${endgameOccurrenceLocatorKey(locator)}`
            );
          const key = endgameOccurrenceLocatorKey(locator);
          occurrences[key] = {
            key,
            occurrence: buildOccurrenceView(
              entry.occurrence,
              referenceFor(entry.occurrence.monsterId, entry.occurrence.monsterTemplateId),
              entry.count,
              input.presentation
            ),
            level: stage.level
          };
        }
        const shard: EndgameOccurrenceShard = {
          schemaVersion: 2,
          locale: input.locale,
          target: { kind: 'endgame', id: target.id },
          periods: [...groups.values()].map((group) => ({
            mode: group.mode,
            period: buildPeriodView(group, input.now, input.presentation)
          })),
          occurrences
        };
        return [target.id, shard];
      })
  );
}
