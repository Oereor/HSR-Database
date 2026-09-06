import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { SemanticTag } from '../../src/lib/domain/types.js';
import { hashOf, numberOf } from './raw.js';
import type { TextResolver } from './localization.js';
import { formatGameMarkup } from './text.js';
import { gameTextToPlain } from '../../src/lib/domain/game-text.js';

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
export interface EnemySkillInclusionPolicy {
  schemaVersion: 1;
  sourceCommit: string;
  reason: string;
  skills: Record<
    string,
    { sourceSignature: string; included: boolean; descriptionHash: string | null }
  >;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)])
    );
  return value;
}
/** Raw source only: includes hash provenance, never resolved text. */
export function enemySkillSourceSignature(row: Record<string, unknown>) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(row)))
    .digest('hex');
}
export async function loadEnemySkillInclusionPolicy(): Promise<EnemySkillInclusionPolicy> {
  const policy = JSON.parse(
    await readFile(
      new URL('../../data/policies/enemy-skill-inclusion.json', import.meta.url),
      'utf8'
    )
  );
  if (policy.schemaVersion !== 1) throw new Error('Unsupported enemy inclusion policy');
  return policy;
}
export function isIncludedEnemySkill(
  row: Record<string, unknown>,
  policy: EnemySkillInclusionPolicy
): boolean {
  const id = String(row.SkillID);
  const entry = policy.skills[id];
  if (!entry || entry.sourceSignature !== enemySkillSourceSignature(row))
    throw new Error(
      `MonsterSkillConfig.${id} inclusion source changed; review neutral policy before generation`
    );
  return entry.included;
}

/**
 * Resolve only locale-neutral Enemy skill semantics.  This function must not
 * consult TextMap or translated labels; the returned refs are projected later.
 */
export function classifyEnemySkillSource(
  row: Record<string, unknown>,
  context: EnemySkillSourceContext,
  policy: EnemySkillInclusionPolicy
) {
  const visible = isIncludedEnemySkill(row, policy);
  return {
    visible,
    kind: normalizeEnemySkillKind(row.SkillTypeDesc, '', context),
    tag: normalizeEnemySkillTag(row.SkillTag, '', context)
  };
}

export function resolveEnemySkillSource(
  row: Record<string, unknown>,
  context: EnemySkillSourceContext,
  text: TextResolver,
  policy: EnemySkillInclusionPolicy
) {
  const visible = isIncludedEnemySkill(row, policy);
  const resolve = (field: string) =>
    text.resolveRef(
      row[field],
      { entity: 'enemy-skill', id: context.skillId, field },
      {
        requirement: field === 'SkillDesc' ? 'optional' : 'required',
        visibility: visible ? 'emitted' : 'hidden',
        fallbackUsed: visible && (field === 'SkillName' || field === 'SkillDesc'),
        productRouteReachability: visible ? 'reachable' : 'unreachable'
      }
    );
  const kindLabel = resolve('SkillTypeDesc');
  const tagLabel = resolve('SkillTag');
  const kind = normalizeEnemySkillKind(row.SkillTypeDesc, kindLabel, context);
  const tag = normalizeEnemySkillTag(row.SkillTag, tagLabel, context);
  const formattedDescription = formatGameMarkup(
    resolve('SkillDesc'),
    Array.isArray(row.ParamList) ? row.ParamList.map(numberOf) : []
  );
  const localizedTextStatus = gameTextToPlain(formattedDescription.text).trim()
    ? ('available' as const)
    : ('missing' as const);
  return { kindLabel, kind, tag, visible, formattedDescription, localizedTextStatus };
}
