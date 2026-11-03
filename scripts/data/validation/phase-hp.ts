import type {
  EndgameDatasetByMode,
  EnemyHpPhase,
  SpawnMonsterGroup
} from '../../../src/lib/domain/endgame.js';
import { decimalEquals, multiplyDecimals, compareDecimals, parseDecimal } from '../decimal.js';
import { effectiveSkillParams, resolveSkillValue } from '../enemy-skill-params.js';
import { readRaw } from '../raw.js';

type Raw = Record<string, any>;

/** Independently reopen raw phase references, rather than trusting generated resolved/default flags. */
export async function validatePhaseHpSemantics(
  root: string,
  datasets: EndgameDatasetByMode,
  templates: readonly Raw[],
  monsters: readonly Raw[],
  skills: readonly Raw[]
) {
  const templateById = new Map(templates.map((row) => [row.MonsterTemplateID, row]));
  const monsterById = new Map(monsters.map((row) => [row.MonsterID, row]));
  const skillById = new Map(skills.map((row) => [String(row.SkillID), row]));
  const characters = new Map<string, Raw | undefined>();
  const expectedByMonster = new Map<number, EnemyHpPhase[] | undefined>();
  for (const dataset of Object.values(datasets))
    for (const group of dataset.groups)
      for (const encounter of group.encounters)
        for (const battle of encounter.battles)
          for (const stage of battle.stages)
            for (const wave of stage.waveModel.waves)
              for (const occurrence of 'enemies' in wave
                ? wave.enemies
                : wave.monsterGroups.flatMap((g: SpawnMonsterGroup) => g.orderedEnemies)) {
                const id = occurrence.monsterId;
                if (!expectedByMonster.has(id)) {
                  const monster = monsterById.get(id)!;
                  const file = templateById.get(monster.MonsterTemplateID)?.JsonConfig;
                  if (typeof file === 'string' && !characters.has(file)) {
                    characters.set(
                      file,
                      await readRaw<Raw>(root, file).catch((error) => {
                        if (error.cause?.code === 'ENOENT') return undefined;
                        throw error;
                      })
                    );
                  }
                  const character = characters.get(file);
                  const count = character?.MaxMonsterPhase ?? 1;
                  let expected: EnemyHpPhase[] | undefined;
                  if (character && Number.isSafeInteger(count) && count > 0) {
                    expected = [];
                    for (let phase = 1; phase <= count; phase++) {
                      const list = Array.isArray(character.PhaseList) ? character.PhaseList : [];
                      const entries = list.filter((row: Raw) => row?.PhaseNum === phase);
                      if (
                        (count === 1 && list.length === 0) ||
                        (entries.length === 1 && !Object.hasOwn(entries[0], 'PhaseMaxHPRatio'))
                      ) {
                        expected.push({
                          phase,
                          ratio: { status: 'default', value: parseDecimal('1') }
                        });
                        continue;
                      }
                      const source = entries.length === 1 ? entries[0].PhaseMaxHPRatio : undefined;
                      const hashes = source?.PostfixExpr?.DynamicHashes;
                      const read =
                        source?.IsDynamic === true && hashes?.length === 1
                          ? character.DynamicValues?.Floats?.[String(hashes[0])]?.ReadInfo
                          : undefined;
                      const params = new Map();
                      for (const skillId of monster.SkillList ?? []) {
                        const skill = skillById.get(String(skillId));
                        if (!skill?.SkillTriggerKey) continue;
                        const values = effectiveSkillParams(skill, monster);
                        const matching = (monster.OverrideSkillParams ?? []).filter(
                          (row: Raw) => String(row.BOKJJKFCFME) === String(skillId)
                        );
                        if (
                          read?.Type === 'SkillParam' &&
                          read.TriggerKey === skill.SkillTriggerKey &&
                          Number.isSafeInteger(read.Index) &&
                          read.Index >= 0 &&
                          matching.length === 1 &&
                          Array.isArray(matching[0].PBLPLDJKPEI) &&
                          matching[0].PBLPLDJKPEI[read.Index] !== undefined &&
                          values[read.Index] &&
                          decimalEquals(values[read.Index]!, parseDecimal('-1'))
                        ) {
                          try {
                            const base = parseDecimal(String(skill.ParamList?.[read.Index]?.Value));
                            if (compareDecimals(base, parseDecimal('0')) > 0)
                              values[read.Index] = base;
                          } catch {
                            /* Explicit malformed base remains unresolved. */
                          }
                        }
                        const previous = params.get(skill.SkillTriggerKey);
                        params.set(
                          skill.SkillTriggerKey,
                          previous && JSON.stringify(previous) !== JSON.stringify(values)
                            ? []
                            : (previous ?? values)
                        );
                      }
                      const value = resolveSkillValue(
                        source,
                        params,
                        character.DynamicValues?.Floats ?? {}
                      );
                      expected.push({
                        phase,
                        ratio:
                          value && compareDecimals(value, parseDecimal('0')) > 0
                            ? { status: 'resolved', value }
                            : { status: 'unresolved' }
                      });
                    }
                  }
                  expectedByMonster.set(id, expected);
                }
                const expected = expectedByMonster.get(id)?.map(({ phase, ratio }) => ({
                  phase,
                  ratio,
                  ...(ratio.status !== 'unresolved' && occurrence.hp.final.status === 'resolved'
                    ? { maxHp: multiplyDecimals([occurrence.hp.final.maxHpPerBar, ratio.value]) }
                    : {})
                }));
                if (JSON.stringify(expected) !== JSON.stringify(occurrence.hp.phases))
                  throw new Error(
                    `Endgame Monster ${id} phase HP differs from raw phase references`
                  );
              }
}
