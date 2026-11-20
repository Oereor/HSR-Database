import type { DescriptionToken } from './types.js';

export type TrailblazerGender = 'female' | 'male';
export const DEFAULT_TRAILBLAZER_GENDER: TrailblazerGender = 'female';

const avatarPairs = [
  { male: '8001', female: '8002' },
  { male: '8003', female: '8004' },
  { male: '8005', female: '8006' },
  { male: '8007', female: '8008' },
  { male: '8009', female: '8010' }
] as const;

const avatarPairsById = new Map<string, (typeof avatarPairs)[number]>(
  avatarPairs.flatMap((pair) => [
    [pair.male, pair],
    [pair.female, pair]
  ])
);

export function isTrailblazerGender(value: unknown): value is TrailblazerGender {
  return value === 'female' || value === 'male';
}

export function trailblazerGender(avatarId: string): TrailblazerGender | undefined {
  const pair = avatarPairsById.get(avatarId);
  return pair && (pair.male === avatarId ? 'male' : 'female');
}

export function withTrailblazerGender(avatarId: string, gender: TrailblazerGender): string {
  return avatarPairsById.get(avatarId)?.[gender] ?? avatarId;
}

export function isVisibleStaticCharacter(avatarId: string, gender: TrailblazerGender): boolean {
  return withTrailblazerGender(avatarId, gender) === avatarId;
}

export function trailblazerNickname(locale: 'zh-CN' | 'en', gender: TrailblazerGender): string {
  if (locale === 'zh-CN') return gender === 'male' ? '穹' : '星';
  return gender === 'male' ? 'Caelus' : 'Stelle';
}

export interface TrailblazerTextChange {
  path: (string | number)[];
  value: string | DescriptionToken[] | null;
}

export interface WithTrailblazerText {
  trailblazerText?: Partial<Record<TrailblazerGender, TrailblazerTextChange[]>>;
}

/** Apply locale-matched generated text changes without mutating the canonical or player view. */
export function staticTrailblazerText<T extends object>(
  value: T & WithTrailblazerText,
  gender: TrailblazerGender
): T {
  const changes = value.trailblazerText?.[gender];
  if (!changes?.length) return value;
  const view = { ...value };
  const copies = new WeakSet<object>([view]);
  for (const { path, value: text } of changes) {
    let node = view as Record<string | number, unknown>;
    for (const key of path.slice(0, -1)) {
      const child = node[key] as Record<string | number, unknown>;
      if (!copies.has(child)) {
        const copy = Array.isArray(child) ? [...child] : { ...child };
        node[key] = copy;
        copies.add(copy);
      }
      node = node[key] as Record<string | number, unknown>;
    }
    const key = path[path.length - 1];
    if (text === null) delete node[key];
    else node[key] = text;
  }
  return view;
}

export function staticCharacterEntries<T extends WithTrailblazerText & { id: string }>(
  entries: T[],
  gender: TrailblazerGender
): T[] {
  return entries
    .filter(({ id }) => isVisibleStaticCharacter(id, gender))
    .map((entry) => staticTrailblazerText(entry, gender));
}
