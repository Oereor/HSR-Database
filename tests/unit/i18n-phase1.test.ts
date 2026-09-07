import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createTextResolver,
  loadTextMap,
  type LocalizationResult,
  type TextResolver
} from '../../scripts/data/localization';
import { getProductionLocale } from '../../scripts/data/locale-registry';
import { readTable } from '../../scripts/data/raw';
import {
  deriveCharacterNames,
  resolveTrailblazerBaseName
} from '../../scripts/data/character-names';
import {
  loadEnemySkillInclusionPolicy,
  resolveEnemySkillSource,
  isIncludedEnemySkill
} from '../../scripts/data/enemy-skill-policy';
import { normalizeEnemyPhases } from '../../scripts/data/enemy-detail';
import { annotateSpecialEffectTokens } from '../../scripts/data/special-effect-triggers';
import { segmentSpecialEffectTriggers } from '../../src/lib/domain/special-effects-presentation';
import {
  collectEndgameSearchOccurrences,
  collectEndgameSearchTargets,
  endgameOccurrenceLocatorKey
} from '../../src/lib/domain/search-index';
import { recommendedGroupId } from '../../src/lib/domain/endgame-view';
import type { EndgameDatasetByMode } from '../../src/lib/domain/endgame';
import type { Character } from '../../src/lib/domain/types';
import { neutralArtifactProjection } from '../support/neutral-artifact-projection';
import { validateMessageSource } from '../../scripts/messages';
import { m } from '../../src/lib/paraglide/messages.js';
import compilerOptions from '../../paraglide.config';

const root = path.resolve(process.env.HSR_DATA_ROOT ?? '../TurnBasedGameData');
const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
const synthetic = async (): Promise<TextResolver> => {
  const locale = getProductionLocale();
  const resolver = await createTextResolver(
    { locale: locale.locale, textMapCode: locale.textMapCode },
    {}
  );
  return {
    ...resolver,
    resolve: (source): LocalizationResult<string> => ({
      status: 'available',
      value:
        source.ref.kind === 'hash' ? `Synthetic ${source.ref.hash}` : `Synthetic ${source.ref.key}`,
      ref: source.ref
    })
  };
};
describe('Phase 1 localization boundaries', () => {
  it('projects declared neutral fields, including exact growth and resistance values', () => {
    const sample = {
      id: '1',
      name: '中文',
      baseStats: { stages: [{ fromLevel: 1, toLevel: 20, hp: { base: 100, perLevel: 3.5 } }] },
      profiles: { base: { traces: [{ id: '2', prerequisiteIds: ['1'], type: 'stat' }] } }
    };
    const project = (value: unknown) =>
      neutralArtifactProjection('src/lib/generated/views/zh-CN/details/characters/1.json', value);
    expect(
      project({ ...sample, name: 'Other language', description: 'Other description' })
    ).toEqual(project(sample));
    const changed = structuredClone(sample);
    changed.baseStats.stages[0].hp.perLevel = 3.6;
    expect(project(changed)).not.toEqual(project(sample));
    const enemy = { id: '2', resistances: [{ element: 'Fire', name: '火', value: 0.2 }] };
    const other = structuredClone(enemy);
    other.resistances[0].value = 0.3;
    expect(neutralArtifactProjection('/enemies/2.json', other)).not.toEqual(
      neutralArtifactProjection('/enemies/2.json', enemy)
    );
  });

  it('derives multi-path identity and official aliases from provenance with arbitrary labels', async () => {
    const commit = (await json('upstream.lock.json')).turnBasedGameData.commit;
    const chs = await deriveCharacterNames(root, commit);
    const other = await deriveCharacterNames(root, commit, await synthetic());
    const sources = (names: typeof chs) =>
      Object.fromEntries(
        Object.entries(names.snapshot.characters).map(([id, value]) => [
          id,
          {
            canonicalSource: value.canonicalSource,
            aliases: value.officialAliases.map(({ value, ...source }) => {
              void value;
              return source;
            })
          }
        ])
      );
    expect(sources(other)).toEqual(sources(chs));
    expect(Object.keys(other.snapshot.characters)).toHaveLength(97);
    for (const id of ['1001', '1224'])
      expect(other.snapshot.characters[id].officialAliases).toHaveLength(1);
    expect(other.baseNames['8001']).toContain('4036035618718239522');
    expect(() => resolveTrailblazerBaseName([], {} as TextResolver)).toThrow('provenance');
  });

  it('keeps kind/tag, inclusion and phases for every source skill under synthetic and missing descriptions', async () => {
    const rows = await readTable<Record<string, unknown>>(root, 'MonsterSkillConfig');
    const policy = await loadEnemySkillInclusionPolicy();
    const locale = getProductionLocale();
    const chs = await createTextResolver(
      { locale: locale.locale, textMapCode: locale.textMapCode },
      await loadTextMap(root, locale.textMapCode)
    );
    const other = await synthetic();
    for (const row of rows) {
      const context = { enemyId: 'source-contract', skillId: String(row.SkillID) };
      const a = resolveEnemySkillSource(row, context, chs, policy);
      const b = resolveEnemySkillSource(row, context, other, policy);
      const neutral = (value: typeof a) => ({
        id: context.skillId,
        kind: value.kind,
        tag: value.tag.code,
        included: value.visible,
        phases: normalizeEnemyPhases(row.PhaseList)
      });
      expect(neutral(b)).toEqual(neutral(a));
    }
    const row = rows.find((row) => isIncludedEnemySkill(row, policy))!;
    const missing = {
      ...other,
      resolve: (
        source: Parameters<TextResolver['resolve']>[0],
        context?: Parameters<TextResolver['resolve']>[1]
      ) =>
        source.provenance?.field === 'SkillDesc'
          ? ({ status: 'missing', ref: source.ref } as const)
          : other.resolve(source, context)
    };
    const result = resolveEnemySkillSource(
      row,
      { enemyId: 'missing-fixture', skillId: String(row.SkillID) },
      missing,
      policy
    );
    expect(result.visible).toBe(true);
    expect(result.localizedTextStatus).toBe('missing');
    expect(() => isIncludedEnemySkill({ ...row, PhaseList: [999] }, policy)).toThrow(
      'source changed'
    );
    expect(() => isIncludedEnemySkill({ ...row, SkillID: 999999999 }, policy)).toThrow(
      'source changed'
    );
  }, 30_000);

  it('keeps explicit special-effect triggers when visible words change', async () => {
    let triggers = 0;
    for (const file of await readdir('src/lib/generated/views/zh-CN/details/characters')) {
      const character = (await json(
        `src/lib/generated/views/zh-CN/details/characters/${file}`
      )) as Character;
      for (const profile of Object.values(character.profiles)) {
        for (const card of profile.skillCards)
          for (const variant of card.variants)
            for (const level of variant.levels) {
              const tokens = level.descriptionTokens;
              const translated = tokens.map((original) => {
                const token = { ...original };
                delete token.semanticReference;
                return { ...token, value: token.type === 'icon' ? '' : 'Arbitrary visible words' };
              });
              const annotated = annotateSpecialEffectTokens(
                translated,
                character.id,
                profile.specialEffects
              );
              const before = segmentSpecialEffectTriggers(tokens, true);
              const after = segmentSpecialEffectTriggers(annotated, true);
              expect(
                after.map(({ kind, tokens }) => [
                  kind,
                  tokens.map(({ semanticReference }) => semanticReference)
                ])
              ).toEqual(
                before.map(({ kind, tokens }) => [
                  kind,
                  tokens.map(({ semanticReference }) => semanticReference)
                ])
              );
              triggers += before.filter(({ kind }) => kind === 'special-effect-trigger').length;
            }
      }
    }
    expect(triggers).toBe(40);
    expect(
      segmentSpecialEffectTriggers(
        [{ type: 'text', value: '特殊效果', underline: true, color: '#f9b0f0' }],
        true
      )[0].kind
    ).toBe('text');
  }, 30_000);

  it('preserves Endgame membership and recommendations when names are missing', async () => {
    await expect(readFile('src/lib/generated/endgame/moc.json', 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    });
    const datasets = Object.fromEntries(
      await Promise.all(
        ['moc', 'pf', 'as', 'aa'].map(async (mode) => [
          mode,
          await json(`src/lib/generated/views/zh-CN/endgame/${mode}.json`)
        ])
      )
    ) as EndgameDatasetByMode;
    const changed = structuredClone(datasets);
    for (const data of Object.values(changed)) for (const group of data.groups) group.name = '';
    for (const { occurrence } of collectEndgameSearchOccurrences(changed)) occurrence.name = '';
    const locators = (data: EndgameDatasetByMode) =>
      collectEndgameSearchOccurrences(data).map(({ reference, occurrence }) => ({
        locator: reference.locator,
        monsterId: occurrence.monsterId,
        templateId: occurrence.monsterTemplateId,
        hp: occurrence.hp,
        speed: occurrence.speed,
        toughness: occurrence.toughness,
        mechanics: occurrence.mechanics
      }));
    expect(locators(changed)).toEqual(locators(datasets));
    expect(locators(changed)).toHaveLength(8167);
    const now = Date.parse('2026-09-05T00:00:00Z');
    for (const mode of ['moc', 'pf', 'as', 'aa'] as const)
      expect(recommendedGroupId(changed[mode].groups, now)).toBe(
        recommendedGroupId(datasets[mode].groups, now)
      );
    const names = new Map(
      collectEndgameSearchOccurrences(datasets).map(({ occurrence }) => [
        String(occurrence.monsterTemplateId),
        occurrence.name ?? ''
      ])
    );
    const translated = new Map([...names].map(([id]) => [id, `Translated ${id}`]));
    const identity = (data: EndgameDatasetByMode, labels: ReadonlyMap<string, string>) =>
      collectEndgameSearchTargets(data, labels).map((target) => ({
        id: target.id,
        locators: target.occurrences.map(({ locator }) => endgameOccurrenceLocatorKey(locator))
      }));
    expect(identity(changed, translated)).toEqual(identity(datasets, names));
  }, 30_000);
});

describe('Site messages', () => {
  it('renders both configured catalogs with explicit locale and matching parameters', async () => {
    const english = (await json('messages/en.json')) as Record<string, string>;
    expect(m.home_recent_character_warp({}, { locale: 'zh-CN' })).toBe('最近限定角色跃迁');
    expect(m.home_recent_light_cone_warp({}, { locale: 'zh-CN' })).toBe('最近限定光锥跃迁');
    expect(m.overview_page_count({ currentPage: 2, pages: 9 }, { locale: 'zh-CN' })).toBe(
      '第 2 / 9 页'
    );
    expect(m.overview_result_count({ count: 100 }, { locale: 'zh-CN' })).toBe('共 100 个结果');
    expect(m.home_recent_character_warp({}, { locale: 'en' })).toBe(
      english.home_recent_character_warp
    );
    expect(m.overview_page_count({ currentPage: 2, pages: 9 }, { locale: 'en' })).toBe(
      english.overview_page_count.replace('{currentPage}', '2').replace('{pages}', '9')
    );
    expect(m.overview_result_count({ count: 100 }, { locale: 'en' })).toBe(
      english.overview_result_count.replace('{count}', '100')
    );
    expect(compilerOptions.strategy).toEqual(['url', 'baseLocale']);
  });
  it('rejects duplicate/missing keys and changed parameter shapes', () => {
    expect(() => validateMessageSource('{"common_close":"a","common_close":"b"}', {})).toThrow();
    expect(() => validateMessageSource('{}', { common_close: [] })).toThrow('Missing required');
    expect(() =>
      validateMessageSource('{"overview_result_count":"{total}"}', {
        overview_result_count: ['count']
      })
    ).toThrow('parameter contract');
  });
});
