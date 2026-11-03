import type {
  DecimalString,
  EnemyHpFinalResolution,
  EnemyHpPhase
} from '../../src/lib/domain/endgame.js';
import { compareDecimals, decimalEquals, multiplyDecimals, parseDecimal } from './decimal.js';
import { effectiveSkillParams, resolveSkillValue } from './enemy-skill-params.js';
import { readRaw } from './raw.js';

type Raw = Record<string, any>;

function positive(value: unknown): DecimalString | undefined {
  try {
    const parsed = parseDecimal(String((value as Raw)?.Value ?? value));
    return compareDecimals(parsed, parseDecimal('0')) > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** The -1 exception is confined to the SkillParam actually read by a phase HP expression. */
function phaseParams(value: Raw, character: Raw, monster: Raw, skills: ReadonlyMap<string, Raw>) {
  const hashes = value?.IsDynamic === true ? value.PostfixExpr?.DynamicHashes : undefined;
  const read =
    Array.isArray(hashes) && hashes.length === 1
      ? character.DynamicValues?.Floats?.[String(hashes[0])]?.ReadInfo
      : undefined;
  const params = new Map<string, readonly (DecimalString | undefined)[]>();
  for (const id of monster.SkillList ?? []) {
    const skill = skills.get(String(id));
    if (!skill?.SkillTriggerKey) continue;
    const values = effectiveSkillParams(skill, monster);
    if (
      read?.Type === 'SkillParam' &&
      read.TriggerKey === skill.SkillTriggerKey &&
      Number.isSafeInteger(read.Index) &&
      read.Index >= 0 &&
      values.length
    ) {
      const matches = (monster.OverrideSkillParams ?? []).filter(
        (row: Raw) => String(row.BOKJJKFCFME) === String(skill.SkillID)
      );
      const base = positive(skill.ParamList?.[read.Index]);
      if (
        matches.length === 1 &&
        Array.isArray(matches[0].PBLPLDJKPEI) &&
        matches[0].PBLPLDJKPEI[read.Index] !== undefined &&
        base &&
        values[read.Index] &&
        decimalEquals(values[read.Index]!, parseDecimal('-1'))
      ) {
        values[read.Index] = base;
      }
    }
    const previous = params.get(skill.SkillTriggerKey);
    params.set(
      skill.SkillTriggerKey,
      previous && JSON.stringify(previous) !== JSON.stringify(values) ? [] : (previous ?? values)
    );
  }
  return params;
}

/** Missing character metadata is unknown; missing/duplicate entries of a known phase are unresolved. */
export function parseEnemyPhaseRatios(
  character: Raw | undefined,
  monster: Raw,
  skills: ReadonlyMap<string, Raw>
): EnemyHpPhase[] | undefined {
  if (!character) return undefined;
  const count = character.MaxMonsterPhase ?? 1;
  if (!Number.isSafeInteger(count) || count < 1) return undefined;
  const list = Array.isArray(character.PhaseList) ? character.PhaseList : [];
  return Array.from({ length: count }, (_, index): EnemyHpPhase => {
    const phase = index + 1;
    const entries = list.filter((row: Raw) => row?.PhaseNum === phase);
    if (
      (entries.length === 0 && count === 1 && list.length === 0) ||
      (entries.length === 1 && !Object.hasOwn(entries[0], 'PhaseMaxHPRatio'))
    ) {
      return { phase, ratio: { status: 'default', value: parseDecimal('1') } };
    }
    if (entries.length !== 1) return { phase, ratio: { status: 'unresolved' } };
    const source = entries[0].PhaseMaxHPRatio;
    const value = resolveSkillValue(
      source,
      phaseParams(source, character, monster, skills),
      character.DynamicValues?.Floats ?? {}
    );
    return {
      phase,
      ratio: value && positive(value) ? { status: 'resolved', value } : { status: 'unresolved' }
    };
  });
}

export function calculatePhaseHp(
  phases: readonly EnemyHpPhase[],
  final: EnemyHpFinalResolution
): EnemyHpPhase[] {
  return phases.map(({ phase, ratio }) => ({
    phase,
    ratio,
    ...(ratio.status !== 'unresolved' && final.status === 'resolved'
      ? { maxHp: multiplyDecimals([final.maxHpPerBar, ratio.value]) }
      : {})
  }));
}

export function createEnemyPhaseHpResolver(root: string, skillRows: readonly Raw[]) {
  const skills = new Map(skillRows.map((row) => [String(row.SkillID), row]));
  const characters = new Map<string, Promise<Raw | undefined>>();
  const monsters = new Map<string, Promise<EnemyHpPhase[] | undefined>>();
  return async (monster: Raw, template: Raw, final: EnemyHpFinalResolution) => {
    const id = String(monster.MonsterID);
    if (!monsters.has(id))
      monsters.set(
        id,
        (async () => {
          const file = template.JsonConfig;
          if (typeof file !== 'string') return undefined;
          if (!characters.has(file))
            characters.set(
              file,
              readRaw<Raw>(root, file).catch((error) => {
                if (error.cause?.code === 'ENOENT') return undefined;
                throw error;
              })
            );
          return parseEnemyPhaseRatios(await characters.get(file), monster, skills);
        })()
      );
    const phases = await monsters.get(id);
    return phases ? calculatePhaseHp(phases, final) : undefined;
  };
}
