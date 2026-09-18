import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  Character,
  CharacterProfile,
  DataManifest,
  RelicProperty
} from '../../src/lib/domain/types';

interface ProgressionEvidence {
  schema_version: 1;
  source: string;
  characters: Array<{
    label: 'low-investment-normal' | 'memory' | 'enhanced';
    id: string;
    enhanced: boolean;
    skills: Array<{ id: string; level: number }>;
    skill_trees: Array<{ id: string; level: number; max_level: number }>;
  }>;
}

interface OptionalUnknownEvidence {
  schema_version: 1;
  source: string;
  player: { avatar: null; space_info: null };
  characters: Array<{
    id: string;
    enhanced: boolean;
    skill_trees: never[];
    light_cone: { id: string };
    relics: Array<{
      set_id: string;
      type: number;
      main_affix: null;
      sub_affix: Array<{ type: string; display: string; percent: boolean; count: number }>;
    }>;
  }>;
}

const root = process.cwd();
const fixtureRoot = path.join(root, 'tests', 'fixtures', 'mihomo');
const generatedRoot = path.join(root, 'src', 'lib', 'generated');
const characterRoot = path.join(generatedRoot, 'views', 'zh-CN', 'details', 'characters');

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

async function readCharacter(id: string): Promise<Character> {
  return readJson<Character>(path.join(characterRoot, `${id}.json`));
}

function progressionIds(profile: CharacterProfile): string[] {
  return profile.skillCards.flatMap((card) =>
    card.progressions.map((progression) => progression.id)
  );
}

describe('MiHoMo Phase 0 fixtures', () => {
  it('connects every real skill-tree entry to exactly one local progression or trace', async () => {
    const fixture = await readJson<ProgressionEvidence>(
      path.join(fixtureRoot, 'phase0-progression-evidence.real.json')
    );

    expect(fixture.source).not.toMatch(/uid|nickname|signature/i);
    for (const sample of fixture.characters) {
      const character = await readCharacter(sample.id);
      const profile = sample.enhanced ? character.profiles.enhanced : character.profiles.base;
      expect(profile, `${sample.id} profile`).toBeDefined();

      const progression = progressionIds(profile!);
      const traces = profile!.traces.map((trace) => trace.id);
      const localIds = [...progression, ...traces];
      const treeIds = sample.skill_trees.map((tree) => tree.id);

      expect(new Set(treeIds).size, `${sample.id} duplicated tree id`).toBe(treeIds.length);
      expect(new Set(localIds).size, `${sample.id} ambiguous local id`).toBe(localIds.length);
      expect(treeIds.sort(), `${sample.id} missing or extra tree id`).toEqual(localIds.sort());
      expect(
        sample.skill_trees.every(
          ({ level, max_level }) => Number.isInteger(level) && level >= 0 && level <= max_level
        )
      ).toBe(true);
    }
  });

  it('records inactive traces as explicit level zero rather than omitted entries', async () => {
    const fixture = await readJson<ProgressionEvidence>(
      path.join(fixtureRoot, 'phase0-progression-evidence.real.json')
    );
    const sample = fixture.characters.find(({ label }) => label === 'low-investment-normal')!;
    const character = await readCharacter(sample.id);
    const traceIds = new Set(character.profiles.base.traces.map((trace) => trace.id));
    const inactiveIds = sample.skill_trees
      .filter(({ level }) => level === 0)
      .map(({ id }) => id)
      .sort();

    expect(inactiveIds).toEqual(['1304209', '1304210']);
    expect(inactiveIds.every((id) => traceIds.has(id))).toBe(true);
  });

  it('uses skill-tree ids for memory progressions that skills do not cover', async () => {
    const fixture = await readJson<ProgressionEvidence>(
      path.join(fixtureRoot, 'phase0-progression-evidence.real.json')
    );
    const sample = fixture.characters.find(({ label }) => label === 'memory')!;
    const character = await readCharacter(sample.id);
    const localProgressionIds = progressionIds(character.profiles.base);
    const treeById = new Map(sample.skill_trees.map((tree) => [tree.id, tree]));
    const skillIds = new Set(sample.skills.map((skill) => skill.id));

    expect(localProgressionIds).toEqual(expect.arrayContaining(['1413301', '1413302']));
    expect([treeById.get('1413301')?.level, treeById.get('1413302')?.level]).toEqual([6, 6]);
    expect(skillIds.has('1413301')).toBe(false);
    expect(skillIds.has('1413302')).toBe(false);
  });

  it('selects the enhanced local profile for an enhanced upstream character', async () => {
    const fixture = await readJson<ProgressionEvidence>(
      path.join(fixtureRoot, 'phase0-progression-evidence.real.json')
    );
    const sample = fixture.characters.find(({ label }) => label === 'enhanced')!;
    const character = await readCharacter(sample.id);

    expect(sample.enhanced).toBe(true);
    expect(character.profiles.enhanced).toBeDefined();
    expect(sample.skill_trees.map(({ id }) => id).sort()).toEqual(
      [
        ...progressionIds(character.profiles.enhanced!),
        ...character.profiles.enhanced!.traces.map(({ id }) => id)
      ].sort()
    );
  });

  it('keeps nullable fields and unknown ids as explicit unresolved test vectors', async () => {
    const [fixture, manifest, properties] = await Promise.all([
      readJson<OptionalUnknownEvidence>(
        path.join(fixtureRoot, 'phase0-optional-unknown.synthetic.json')
      ),
      readJson<DataManifest>(path.join(generatedRoot, 'manifest.json')),
      readJson<RelicProperty[]>(
        path.join(generatedRoot, 'views', 'zh-CN', 'catalogs', 'relic-properties.json')
      )
    ]);
    const sample = fixture.characters[0];
    const relic = sample.relics[0];

    expect(fixture.player.avatar).toBeNull();
    expect(fixture.player.space_info).toBeNull();
    expect(relic.main_affix).toBeNull();
    expect(manifest.routes.characters).not.toContain(sample.id);
    expect(manifest.routes['light-cones']).not.toContain(sample.light_cone.id);
    expect(manifest.routes.relics).not.toContain(relic.set_id);
    expect(properties.map(({ propertyType }) => propertyType)).not.toContain(
      relic.sub_affix[0].type
    );
    expect(relic.sub_affix[0].count).toBe(0);
  });
});
