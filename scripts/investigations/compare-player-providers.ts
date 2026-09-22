import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildEnkaPlayerProfile } from '../../api/_player/enka/pipeline.js';
import { parsePlayerProfile } from '../../api/_player/parse.js';

type RecordValue = Record<string, unknown>;

function record(value: unknown, context: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${context} must be an object`);
  return value as RecordValue;
}

function array(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${context} must be an array`);
  return value;
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(path.resolve(file), 'utf8')) as unknown;
}

export async function comparePlayerProviderFixtures(enkaFile: string, mihomoFile: string) {
  const [enka, mihomo] = await Promise.all([readJson(enkaFile), readJson(mihomoFile)]);
  const enkaResult = buildEnkaPlayerProfile(enka);
  const mihomoProfile = parsePlayerProfile(mihomo);
  const mihomoSource = record(mihomo, 'MiHoMo fixture');
  const rawCharacters = array(mihomoSource.characters, 'MiHoMo characters').map((value) =>
    record(value, 'MiHoMo character')
  );
  const rows = enkaResult.canonical.characters.flatMap((character) => {
    const publicCharacter = mihomoProfile.characters.find(
      (candidate) => candidate.characterId === character.build.avatarId
    );
    const rawCharacter = rawCharacters.find(
      (candidate) => String(candidate.id) === character.build.avatarId
    );
    const statistics = rawCharacter
      ? array(rawCharacter.statistics, 'MiHoMo statistics').map((value) =>
          record(value, 'MiHoMo statistic')
        )
      : [];
    const numeric = new Map(
      statistics.map((stat) => [String(stat.field), Number(stat.value)] as const)
    );
    return Object.entries(character.values).map(([field, local]) => {
      const golden = numeric.get(field);
      const delta = golden === undefined || local === undefined ? null : local - golden;
      return {
        buildId: character.build.buildId,
        avatarId: character.build.avatarId,
        field,
        local,
        mihomo: golden ?? null,
        delta,
        result:
          delta === null
            ? 'not-comparable'
            : Math.abs(delta) <= 1e-12
              ? 'exact'
              : Math.abs(delta) <= 1e-8
                ? 'tolerance'
                : 'mismatch',
        normalizedMiHoMoPresent: publicCharacter !== undefined
      };
    });
  });
  return {
    builds: enkaResult.canonical.characters.length,
    rows,
    summary: Object.fromEntries(
      ['exact', 'tolerance', 'mismatch', 'not-comparable'].map((kind) => [
        kind,
        rows.filter((row) => row.result === kind).length
      ])
    )
  };
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === new URL(`file://${entrypoint.replaceAll('\\', '/')}`).href) {
  const [enkaFile, mihomoFile] = process.argv.slice(2);
  if (!enkaFile || !mihomoFile)
    throw new Error('Usage: pnpm investigate:player-shadow -- <enka.json> <mihomo.json>');
  void comparePlayerProviderFixtures(enkaFile, mihomoFile).then((result) =>
    console.log(JSON.stringify(result, null, 2))
  );
}
