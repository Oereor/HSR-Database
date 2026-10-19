/** Profile inputs, before merging the regular and LD sources. */
export const RATING_V2_TABLE_NAMES = [
  'RelicMainAffixAvatarValue',
  'RelicSubAffixAvatarValue',
  'RelicMainAffixBaseValue',
  'RelicSubAffixBaseValue'
] as const;
export const RATING_V2_SOURCE_NAMES = [
  ...RATING_V2_TABLE_NAMES,
  'AvatarConfig',
  'AvatarConfigLD',
  'AvatarRelicRecommend',
  'AvatarRelicRecommendLD'
] as const;
export type RatingV2SourceDigests = Record<(typeof RATING_V2_SOURCE_NAMES)[number], string>;

/** Schema 2 policy / schema 6 Profile: SHA-256 of stable, losslessly parsed table content. */
export function assertRatingV2SourceDigests(
  value: unknown
): asserts value is RatingV2SourceDigests {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== RATING_V2_SOURCE_NAMES.length ||
    RATING_V2_SOURCE_NAMES.some((name) => !Object.hasOwn(value, name)) ||
    Object.values(value).some(
      (digest) => typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)
    )
  )
    throw new Error(
      'Invalid Rating V2 source digests: all eight reviewed source tables are required'
    );
}
