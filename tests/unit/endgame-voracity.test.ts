import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createVoracityResolver, type StageInvasionRow } from '../../scripts/data/endgame';
import { generatedRoot, resolveDataRoot } from '../../scripts/data/paths';
import { readTable } from '../../scripts/data/raw';
import {
  ENDGAME_TABLE_NAMES,
  TURN_BASED_DEPLOYMENT_PATHS
} from '../../scripts/data/source-requirements';
import type { EndgameMode, EndgameModeDataset, EndgameStage } from '../../src/lib/domain/endgame';
import { getEndgameOccurrenceShard } from '../../src/lib/server/endgame';

const occurrences = (stage: EndgameStage) =>
  stage.waveModel.kind === 'fixed'
    ? stage.waveModel.waves.flatMap((wave) => wave.enemies)
    : stage.waveModel.waves.flatMap((wave) =>
        wave.monsterGroups.flatMap((group) => group.orderedEnemies)
      );

describe('Voracity stage rules', () => {
  it('declares the same minimal source for generation and sparse deployment', () => {
    expect(ENDGAME_TABLE_NAMES).toContain('StageInvasionConfig');
    expect(TURN_BASED_DEPLOYMENT_PATHS.filter((file) => file.includes('Invasion'))).toEqual([
      'ExcelOutput/StageInvasionConfig.json'
    ]);
  });

  it('matches exact MonsterID variants within their stage and maps both known levels', () => {
    const warn = () => {
      throw new Error('unexpected warning');
    };
    const resolve = createVoracityResolver(
      [
        {
          StageID: 420504,
          InvasionID: 2,
          MonsterInvasionList: [{ DBLDCKODNEN: 202206018 }, { DBLDCKODNEN: 202303204 }]
        },
        { StageID: 420503, InvasionID: 1, MonsterInvasionList: [{ DBLDCKODNEN: 202206017 }] }
      ],
      { warn }
    );
    expect(resolve(420504, 202206018)).toBe(2);
    expect(resolve(420504, 202303204)).toBe(2);
    expect(resolve(420503, 202206017)).toBe(1);
    expect(resolve(420504, 2022060)).toBeUndefined();
    expect(resolve(420504, 202206017)).toBeUndefined();
    expect(resolve(420504, 202401604)).toBeUndefined();
    expect(resolve(420503, 202206018)).toBeUndefined();
    expect(resolve(1, 202206018)).toBeUndefined();
  });

  it('ignores selection arrays for every repeated occurrence', () => {
    const rows = [
      {
        StageID: 30324042,
        InvasionID: 2,
        MonsterInvasionList: [{ DBLDCKODNEN: 2012010, LMEBOHHDIAG: [1, 0, 1, 0, 0] }]
      }
    ];
    const resolve = createVoracityResolver(rows, { warn: () => {} });
    expect(Array.from({ length: 12 }, () => resolve(30324042, 2012010))).toEqual(Array(12).fill(2));
  });

  it('reports unknown invasion IDs and omits their level', () => {
    const warnings: unknown[] = [];
    const resolve = createVoracityResolver(
      [{ StageID: 420504, InvasionID: 999, MonsterInvasionList: [{ DBLDCKODNEN: 202206018 }] }],
      {
        warn: (code, _message, context) => {
          warnings.push({ code, context });
        }
      }
    );
    expect(resolve(420504, 202206018)).toBeUndefined();
    expect(warnings).toEqual([
      { code: 'unknown-voracity-invasion', context: { stageId: 420504, invasionId: 999 } }
    ]);
  });
});

describe('Voracity generated delivery', () => {
  it.each(['zh-CN', 'en'] as const)(
    'preserves exact stage rules through %s projection',
    async (locale) => {
      const rules = await readTable<StageInvasionRow>(resolveDataRoot(), 'StageInvasionConfig');
      const matchedStages = new Set<number>();
      for (const mode of ['moc', 'pf', 'as', 'aa'] satisfies EndgameMode[]) {
        const data = JSON.parse(
          await readFile(
            path.join(generatedRoot, 'views', locale, 'endgame', `${mode}.json`),
            'utf8'
          )
        ) as EndgameModeDataset;
        for (const stage of data.groups.flatMap((group) =>
          group.encounters.flatMap((encounter) =>
            encounter.battles.flatMap((battle) => battle.stages)
          )
        )) {
          const rule = rules.find((row) => row.StageID === stage.stageId);
          for (const occurrence of occurrences(stage)) {
            const selected = rule?.MonsterInvasionList.some(
              (entry) => entry.DBLDCKODNEN === occurrence.monsterId
            );
            expect(occurrence.voracityLevel).toBe(selected ? 2 : undefined);
            if (selected) matchedStages.add(stage.stageId);
            else expect(occurrence).not.toHaveProperty('voracityLevel');
          }
        }
      }
      expect([...matchedStages].sort()).toEqual([30324032, 30324042, 30509012]);
    }
  );

  it.each(['zh-CN', 'en'] as const)(
    'preserves pollution in %s occurrence shards',
    async (locale) => {
      for (const monsterId of [5013010, 5014010, 2012010]) {
        const shard = await getEndgameOccurrenceShard(String(monsterId), locale);
        expect(shard).toBeDefined();
        expect(
          Object.values(shard!.occurrences).some(({ occurrence }) => occurrence.voracityLevel === 2)
        ).toBe(true);
      }
    }
  );
});
