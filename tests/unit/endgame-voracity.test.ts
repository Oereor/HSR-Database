import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createVoracityResolver,
  type StageInvasionBuffRow,
  type StageInvasionRow
} from '../../scripts/data/endgame';
import type { MazeBuffRow } from '../../scripts/data/maze-buffs';
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

const invasionBuffs: StageInvasionBuffRow[] = [1, 2, 3, 4].map((level) => ({
  InvasionID: level,
  MazeBuffID: 3034000 + level
}));
const mazeBuffs: MazeBuffRow[] = [1, 2, 3, 4].map((level) => ({
  ID: 3034000 + level,
  InBattleBindingKey: `ChallengePeakBattle_GluttonyAbility_LV${level}`
}));

describe('Voracity stage rules', () => {
  it('declares the same minimal source for generation and sparse deployment', () => {
    expect(ENDGAME_TABLE_NAMES).toContain('StageInvasionConfig');
    expect(ENDGAME_TABLE_NAMES).toContain('StageInvasionBuff');
    expect(TURN_BASED_DEPLOYMENT_PATHS.filter((file) => file.includes('Invasion'))).toEqual([
      'ExcelOutput/StageInvasionBuff.json',
      'ExcelOutput/StageInvasionConfig.json'
    ]);
  });

  it('matches exact MonsterID variants within their stage for all configured levels', () => {
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
        { StageID: 420503, InvasionID: 1, MonsterInvasionList: [{ DBLDCKODNEN: 202206017 }] },
        { StageID: 420505, InvasionID: 3, MonsterInvasionList: [{ DBLDCKODNEN: 5014020 }] },
        { StageID: 420506, InvasionID: 4, MonsterInvasionList: [{ DBLDCKODNEN: 5014020 }] }
      ],
      invasionBuffs,
      mazeBuffs,
      { warn }
    );
    expect(resolve(420504, 202206018)).toBe(2);
    expect(resolve(420504, 202303204)).toBe(2);
    expect(resolve(420503, 202206017)).toBe(1);
    expect(resolve(420505, 5014020)).toBe(3);
    expect(resolve(420506, 5014020)).toBe(4);
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
    const resolve = createVoracityResolver(rows, invasionBuffs, mazeBuffs, { warn: () => {} });
    expect(Array.from({ length: 12 }, () => resolve(30324042, 2012010))).toEqual(Array(12).fill(2));
  });

  it('reports unknown invasion IDs and omits their level', () => {
    const warnings: unknown[] = [];
    const resolve = createVoracityResolver(
      [{ StageID: 420504, InvasionID: 999, MonsterInvasionList: [{ DBLDCKODNEN: 202206018 }] }],
      invasionBuffs,
      mazeBuffs,
      {
        warn: (code, _message, context) => {
          warnings.push({ code, context });
        }
      }
    );
    expect(resolve(420504, 202206018)).toBeUndefined();
    expect(warnings).toEqual([
      {
        code: 'unknown-voracity-invasion',
        context: { stageId: 420504, invasionId: 999, matches: 0 }
      }
    ]);
  });

  it.each([
    {
      name: 'duplicate invasion config',
      invasion: [invasionBuffs[0], invasionBuffs[0]],
      buffs: mazeBuffs,
      code: 'unknown-voracity-invasion'
    },
    {
      name: 'missing maze buff',
      invasion: [invasionBuffs[0]],
      buffs: [],
      code: 'unknown-voracity-maze-buff'
    },
    {
      name: 'duplicate maze buff',
      invasion: [invasionBuffs[0]],
      buffs: [mazeBuffs[0], mazeBuffs[0]],
      code: 'unknown-voracity-maze-buff'
    },
    {
      name: 'invalid binding key',
      invasion: [invasionBuffs[0]],
      buffs: [{ ID: 3034001, InBattleBindingKey: 'unrelated' }],
      code: 'invalid-voracity-binding'
    }
  ])('reports $name instead of silently losing pollution', ({ invasion, buffs, code }) => {
    const warnings: string[] = [];
    const resolve = createVoracityResolver(
      [{ StageID: 1, InvasionID: 1, MonsterInvasionList: [{ DBLDCKODNEN: 10 }] }],
      invasion,
      buffs,
      { warn: (warning) => warnings.push(warning) }
    );
    expect(resolve(1, 10)).toBeUndefined();
    expect(warnings).toEqual([code]);
  });

  it('resolves a real v4.6 AA occurrence from the upstream tables', async () => {
    const root = resolveDataRoot();
    const [rules, invasion, buffs] = await Promise.all([
      readTable<StageInvasionRow>(root, 'StageInvasionConfig'),
      readTable<StageInvasionBuffRow>(root, 'StageInvasionBuff'),
      readTable<MazeBuffRow>(root, 'MazeBuff')
    ]);
    const rule = rules.find((row) => row.StageID === 30510011);
    expect(rule?.InvasionID).toBe(3);
    expect(rule?.MonsterInvasionList.some((entry) => entry.DBLDCKODNEN === 5014020)).toBe(true);
    const resolve = createVoracityResolver(rules, invasion, buffs, {
      warn: () => {
        throw new Error('unexpected warning');
      }
    });
    expect(resolve(30510011, 5014020)).toBe(3);
    expect(resolve(30510011, 5023010)).toBeUndefined();
  });
});

describe('Voracity generated delivery', () => {
  it.each(['zh-CN', 'en'] as const)(
    'preserves exact stage rules through %s projection',
    async (locale) => {
      const rules = await readTable<StageInvasionRow>(resolveDataRoot(), 'StageInvasionConfig');
      const invasion = await readTable<StageInvasionBuffRow>(
        resolveDataRoot(),
        'StageInvasionBuff'
      );
      const buffs = await readTable<MazeBuffRow>(resolveDataRoot(), 'MazeBuff');
      const levelByInvasion = new Map(
        invasion.map((row) => {
          const bindingKey = buffs.find(
            (buff) => buff.ID === row.MazeBuffID && buff.Lv === 1
          )?.InBattleBindingKey;
          const level = Number(bindingKey?.match(/_LV([1-9]\d*)$/)?.[1]);
          expect(Number.isSafeInteger(level) && level > 0).toBe(true);
          return [row.InvasionID, level];
        })
      );
      const matchedStages = new Set<number>();
      let realLevelThreeFound = false;
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
            const level = rule ? levelByInvasion.get(rule.InvasionID) : undefined;
            expect(occurrence.voracityLevel).toBe(selected ? level : undefined);
            if (selected && level) matchedStages.add(stage.stageId);
            else expect(occurrence).not.toHaveProperty('voracityLevel');
            if (mode === 'aa' && stage.stageId === 30510011 && occurrence.monsterId === 5014020) {
              expect(stage.level).toBe(95);
              expect(occurrence.voracityLevel).toBe(3);
              realLevelThreeFound = true;
            }
          }
        }
      }
      expect(matchedStages.size).toBeGreaterThan(0);
      expect(realLevelThreeFound).toBe(true);
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
      const levelThreeShard = await getEndgameOccurrenceShard('5014020', locale);
      expect(levelThreeShard).toBeDefined();
      expect(
        Object.values(levelThreeShard!.occurrences).some(
          ({ key, occurrence, level }) =>
            JSON.parse(key)[4] === 30510011 &&
            occurrence.monsterId === 5014020 &&
            occurrence.voracityLevel === 3 &&
            level === 95
        )
      ).toBe(true);
    }
  );
});
