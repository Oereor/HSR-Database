import type { SemanticTag } from '../../src/lib/domain/types.js';
import { hashOf } from './raw.js';

export const enemySkillKinds: Readonly<Record<string, 'skill' | 'talent'>> = {
  '4236760374151560033': 'skill',
  '11653660973383561666': 'talent'
};
export const enemySkillTagCodes: Readonly<Record<string, string>> = {
  '13718219806540082081': 'AoEAttack',
  '3085594440740593641': 'Support',
  '4014610187872883999': 'SingleAttack',
  '17899413561707685112': 'Blast',
  '10170918581498782760': 'Talent',
  '15002512898524986554': 'Other',
  '3873562591188485106': 'Summon',
  '11980319872483820444': 'Enhance',
  '2002671141766797902': 'Charge',
  '15410695618716790376': 'Impair',
  '13370021643324878838': 'Defence',
  '1514416618212734134': 'LockOn',
  '17118023451154285269': 'Restore',
  '3319273756603801898': 'Bounce',
  '9948694534139632886': 'Shared',
  '17776936731021324007': 'Barrage',
  '16409958361388240841': 'Sweep'
};
export interface EnemySkillSourceContext {
  enemyId: string;
  skillId: string;
}
function semanticCode<T extends string>(
  mapping: Readonly<Record<string, T>>,
  ref: unknown,
  label: string,
  sourceField: string,
  context: EnemySkillSourceContext
): T {
  const textHash = hashOf(ref);
  const code = textHash && mapping[textHash];
  if (!code)
    throw new Error(
      `Unknown enemy skill source: ${JSON.stringify({ ...context, sourceField, textHash: textHash ?? null, resolvedCHS: label })}`
    );
  return code;
}
export function normalizeEnemySkillKind(
  ref: unknown,
  label: string,
  context: EnemySkillSourceContext
) {
  return semanticCode(enemySkillKinds, ref, label, 'SkillTypeDesc', context);
}
export function normalizeEnemySkillTag(
  ref: unknown,
  label: string,
  context: EnemySkillSourceContext
): SemanticTag {
  return {
    code: semanticCode(enemySkillTagCodes, ref, label, 'SkillTag', context),
    label,
    known: true
  };
}
/**
 * Resolve only locale-neutral Enemy skill semantics.  This function must not
 * consult TextMap or translated labels; the returned refs are projected later.
 */
export function classifyEnemySkillSource(
  row: Record<string, unknown>,
  context: EnemySkillSourceContext
) {
  return {
    kind: normalizeEnemySkillKind(row.SkillTypeDesc, '', context),
    tag: normalizeEnemySkillTag(row.SkillTag, '', context)
  };
}
