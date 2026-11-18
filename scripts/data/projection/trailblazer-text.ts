import { isDeepStrictEqual } from 'node:util';
import {
  trailblazerNickname,
  type TrailblazerGender,
  type TrailblazerTextChange,
  type WithTrailblazerText
} from '../../../src/lib/domain/trailblazer.js';
import type { TextResolver } from '../localization.js';
import { trailblazerMacro } from '../localization.js';

const textFields = new Set([
  'name',
  'baseName',
  'fullName',
  'description',
  'elementName',
  'pathName',
  'story',
  'lore',
  'backgroundDescription',
  'descriptionText',
  'descriptionMarkup',
  'descriptionTokens'
]);

export function assertTrailblazerTextVariants(record: Record<string, unknown>, location: string) {
  if (!Object.hasOwn(record, 'trailblazerText')) return;
  const variants = record.trailblazerText;
  const fail = () => {
    throw new Error(`[game-text] Invalid Trailblazer text variants at ${location}`);
  };
  if (!variants || typeof variants !== 'object' || Array.isArray(variants)) return fail();
  for (const [gender, changes] of Object.entries(variants)) {
    if (!['female', 'male'].includes(gender) || !Array.isArray(changes) || !changes.length)
      return fail();
    const paths = new Set<string>();
    for (const change of changes) {
      if (!change || !Array.isArray(change.path) || !change.path.length) return fail();
      const leaf = change.path.at(-1);
      const key = JSON.stringify(change.path);
      if (!textFields.has(leaf) || paths.has(key)) return fail();
      paths.add(key);
      let parent: unknown = record;
      for (const segment of change.path.slice(0, -1)) {
        if (
          !parent ||
          typeof parent !== 'object' ||
          (Array.isArray(parent) ? !Number.isSafeInteger(segment) : typeof segment !== 'string') ||
          ['trailblazerText', '__proto__', 'prototype', 'constructor'].includes(segment) ||
          !Object.hasOwn(parent, segment)
        )
          return fail();
        parent = (parent as Record<string | number, unknown>)[segment];
      }
      if (!parent || typeof parent !== 'object' || Array.isArray(parent)) return fail();
      if (change.value === null) {
        if (!Object.hasOwn(parent, leaf)) return fail();
      } else if (leaf === 'descriptionTokens') {
        if (
          !Array.isArray(change.value) ||
          change.value.some(
            (token: unknown) =>
              !token ||
              typeof token !== 'object' ||
              !('value' in token) ||
              typeof token.value !== 'string'
          )
        )
          return fail();
      } else if (typeof change.value !== 'string') return fail();
    }
  }
}

function textChanges(
  base: unknown,
  variant: unknown,
  path: TrailblazerTextChange['path'] = []
): TrailblazerTextChange[] {
  if (isDeepStrictEqual(base, variant)) return [];
  const key = path.at(-1);
  if (
    typeof key === 'string' &&
    textFields.has(key) &&
    (typeof variant === 'string' ||
      variant === undefined ||
      (key === 'descriptionTokens' && Array.isArray(variant)))
  ) {
    if (trailblazerMacro.test(JSON.stringify(variant) ?? ''))
      throw new Error(`Unresolved Trailblazer macro at ${path.join('.')}`);
    return [{ path, value: (variant ?? null) as TrailblazerTextChange['value'] }];
  }
  if (Array.isArray(base) && Array.isArray(variant) && base.length === variant.length)
    return base.flatMap((item, index) => textChanges(item, variant[index], [...path, index]));
  if (
    base &&
    variant &&
    typeof base === 'object' &&
    typeof variant === 'object' &&
    !Array.isArray(base) &&
    !Array.isArray(variant)
  ) {
    const previous = base as Record<string, unknown>;
    const next = variant as Record<string, unknown>;
    const changed = [...new Set([...Object.keys(previous), ...Object.keys(next)])].flatMap(
      (field) => textChanges(previous[field], next[field], [...path, field])
    );
    // Markup and its corresponding tokens are selected together even when only one differs.
    if (
      Array.isArray(next.descriptionTokens) &&
      changed.some(
        ({ path: keys }) =>
          keys.length === path.length + 1 &&
          ['description', 'descriptionText', 'descriptionMarkup', 'descriptionTokens'].includes(
            String(keys.at(-1))
          )
      )
    ) {
      for (const field of [
        'description',
        'descriptionText',
        'descriptionMarkup',
        'descriptionTokens'
      ]) {
        if (
          field in next &&
          !changed.some(
            ({ path: keys }) => keys.length === path.length + 1 && keys.at(-1) === field
          )
        )
          changed.push({
            path: [...path, field],
            value: next[field] as TrailblazerTextChange['value']
          });
      }
    }
    return changed;
  }
  throw new Error(`Trailblazer text projection changed non-text data at ${path.join('.')}`);
}

/** Project the normal record first and replay only records that consumed a contextual source. */
export function projectWithTrailblazerText<T extends object>(
  primary: TextResolver,
  variants: TextResolver,
  project: (resolver: TextResolver) => T
): T & WithTrailblazerText {
  let sensitive = false;
  const base = project({
    ...primary,
    resolve(source, context) {
      sensitive ||= primary.usesTrailblazerText(source);
      return primary.resolve(source, context);
    },
    projectGameText(source, context) {
      sensitive ||= primary.usesTrailblazerText(source);
      return primary.projectGameText(source, context);
    }
  });
  if (!sensitive) return base;

  const trailblazerText: NonNullable<WithTrailblazerText['trailblazerText']> = {};
  for (const gender of ['female', 'male'] as const satisfies readonly TrailblazerGender[]) {
    const context = {
      trailblazerGender: gender,
      nickname: trailblazerNickname(primary.locale, gender)
    };
    const result = project({
      ...variants,
      trailblazerGender: gender,
      resolve: (source, options) => variants.resolve(source, { ...options, ...context }),
      projectGameText: (source, options) =>
        variants.projectGameText(source, { ...options, ...context })
    });
    const changes = textChanges(base, result);
    if (changes.length) trailblazerText[gender] = changes;
  }
  return Object.keys(trailblazerText).length ? { ...base, trailblazerText } : base;
}

export function catalogTrailblazerText(
  { trailblazerText }: WithTrailblazerText,
  fields: readonly string[]
): WithTrailblazerText {
  if (!trailblazerText) return {};
  const entries = Object.entries(trailblazerText).flatMap(([gender, changes]) => {
    const matching = changes.filter(
      ({ path }) => path.length === 1 && fields.includes(String(path[0]))
    );
    return matching.length ? [[gender, matching] as const] : [];
  });
  return entries.length ? { trailblazerText: Object.fromEntries(entries) } : {};
}
