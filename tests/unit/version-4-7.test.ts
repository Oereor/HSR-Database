import { beforeAll, expect, it } from 'vitest';
import { loadCharacterDomainTables } from '../../scripts/data/character-sources';
import {
  buildCharacterDomain,
  type CharacterDomainBuild
} from '../../scripts/data/domain/character';
import { buildSeriesSkills } from '../../scripts/data/domain/character-extensions';
import { createTextResolver, loadTextMap } from '../../scripts/data/localization';
import { projectCharacterView } from '../../scripts/data/projection/character';
import { getLocaleProjectionPolicy } from '../../scripts/data/projection/policy';
import { resolveDataRoot } from '../../scripts/data/paths';
import { resolvePlayerExEidolonState } from '../../src/lib/player/character';
import type { Character } from '../../src/lib/domain/types';

let build: CharacterDomainBuild;
const views = new Map<string, Character[]>();
beforeAll(async () => {
  const root = resolveDataRoot();
  build = buildCharacterDomain({ tables: await loadCharacterDomainTables(root) });
  for (const locale of ['zh-CN', 'en'] as const) {
    const code = locale === 'en' ? 'EN' : 'CHS';
    const resolver = await createTextResolver(
      { locale, textMapCode: code },
      await loadTextMap(root, code)
    );
    const policy = getLocaleProjectionPolicy(locale);
    const context = {
      locale,
      resolver,
      extraEffectsById: new Map(build.extraEffects.map((effect) => [effect.id, effect])),
      charactersById: new Map(build.characters.map((character) => [character.id, character])),
      skillCategoryLabels: policy.skillCategoryLabels,
      skillEffectLabels: policy.skillEffectLabels,
      composePathName: policy.composeCharacterPathName,
      normalizeBaseName: policy.normalizeCharacterBaseName
    };
    views.set(
      locale,
      build.characters.map((character) => projectCharacterView(character, context))
    );
  }
}, 30000);

it('preserves all real series relations and external conditions without training progressions', () => {
  const owners = build.characters.filter(
    (character) => character.profiles.base.seriesSkills.length
  );
  expect(owners).toHaveLength(9);
  expect(
    owners.flatMap((character) =>
      character.profiles.base.seriesSkills.flatMap((series) => series.states)
    )
  ).toHaveLength(18);
  for (const characters of views.values()) {
    for (const character of characters.filter(
      (character) => character.profiles.base.seriesSkills.length
    )) {
      const profile = character.profiles.base;
      const card = profile.skillCards.find((card) => card.category === 'elation-ascension')!;
      expect(card.progressions).toEqual([]);
      expect(card.variants[0].progressionId).toBeNull();
      expect(
        card.externalCondition?.states.map((state) => [
          state.level,
          state.condition.externalAvatarId,
          state.condition.threshold
        ])
      ).toEqual([
        [1, '1511', 0],
        [2, '1511', 2]
      ]);
      expect(card.variants[0].levels.map((level) => level.level)).toEqual([1, 2]);
    }
    const aha = characters.find((character) => character.id === '1511')!.profiles.base;
    expect(
      aha.specialEffects
        .filter((entry) => entry.kind === 'series-skill-link')
        .map((entry) => entry.linkedAvatarId)
    ).toEqual(['1506', '1505', '1501', '1502', '1503', '1513', '8009', '8010', '1511']);
    expect(
      aha.skillCards
        .find((card) => card.category === 'talent')!
        .variants.map((variant) => variant.id)
    ).toEqual(['151104', '151104:global-buff:1', '151131']);
  }
});

it('resolves series records by actual foreign keys and rejects duplicate or unsupported conditions', () => {
  const source = build.characters.find((character) => character.id === '1511')!.profiles.base;
  const skill = {
    ...source.skills.find((skill) => skill.category === 'elation-ascension')!,
    id: '42'
  };
  const records = source.seriesSkills[0].states.map((state) => ({
    AvatarID: 1511,
    SkillID: 42,
    Level: state.level,
    UnlockCondition: { Type: state.condition.type, Param: state.condition.param },
    RelateAvatarIDList: []
  }));
  expect(buildSeriesSkills('1511', [skill], { AvatarSeriesSkill: records })[0].skillId).toBe('42');
  expect(() =>
    buildSeriesSkills('1511', [skill], { AvatarSeriesSkill: [...records, records[0]] })
  ).toThrow(/duplicate/);
  expect(() =>
    buildSeriesSkills('1511', [skill], {
      AvatarSeriesSkill: [{ ...records[0], UnlockCondition: { Type: 'Unknown', Param: '1511.0' } }]
    })
  ).toThrow(/unsupported/);
});

it('keeps three ExRanks independent from ordinary E1 and retains missing activation provenance', () => {
  for (const characters of views.values()) {
    const owners = characters.filter((character) => character.profiles.base.exEidolons.length);
    expect(owners.map((character) => character.id)).toEqual(['1204', '1213', '1308']);
    for (const character of owners) {
      const profile = character.profiles.base;
      const ex = profile.exEidolons[0];
      expect(profile.eidolons).toHaveLength(6);
      expect(profile.eidolons.some((eidolon) => eidolon.id === ex.id)).toBe(true);
      expect(ex.entityId).toBe(`ex-rank:${character.id}:${ex.id}`);
      expect(ex.relatedSkillIds.length).toBeGreaterThan(0);
      expect(ex.iconKey).toBeUndefined();
      expect(ex.name && ex.description && ex.badgeLabel).toBeTruthy();
    }
  }
  expect(resolvePlayerExEidolonState()).toEqual({ displayState: 'inactive', source: 'missing' });
  expect(resolvePlayerExEidolonState('active')).toEqual({
    displayState: 'active',
    source: 'player'
  });
});

it('projects the real Aha E2 macro to a fixed E2 interaction without leaking source syntax', () => {
  for (const characters of views.values()) {
    const e2 = characters
      .find((character) => character.id === '1511')!
      .profiles.base.eidolons.find((eidolon) => eidolon.rank === 2)!;
    expect(e2.description).not.toContain('#{');
    const reference = e2.descriptionTokens!.find((token) => token.type === 'interaction');
    expect(reference?.interaction).toEqual({ kind: 'series-skill', skillId: '151129', level: 2 });
    expect(e2.descriptionTokens!.some((token) => token.underline && token.type === 'text')).toBe(
      true
    );
    expect(e2.descriptionTokens!.map((token) => token.value).join('')).not.toContain('#{');
  }
});

it('diagnoses unknown macros and unverified series references', async () => {
  const resolver = await createTextResolver(
    { locale: 'en', textMapCode: 'EN' },
    { '1': 'Before #{unknown_macro:123} after' }
  );
  const source = {
    kind: 'direct',
    ref: { kind: 'hash', hash: '1' as import('../../src/lib/domain/types').TextHash }
  } as const;
  expect(resolver.projectGameText(source).status).toBe('unsupported');
  expect(resolver.getDiagnostics()['unsupported-template'].count).toBe(1);
  const real = await createTextResolver(
    { locale: 'en', textMapCode: 'EN' },
    await loadTextMap(resolveDataRoot(), 'EN')
  );
  expect(
    real.projectGameText({
      kind: 'direct',
      ref: { kind: 'symbolic', key: 'AvatarRankDesc_151102' }
    }).status
  ).toBe('unsupported');
});
