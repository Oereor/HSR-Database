import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { Character } from '../../../src/lib/domain/types.js';
import type { Locale, TextMap } from '../localization.js';
import { createTextResolver } from '../localization.js';
import { readTable } from '../raw.js';
import { parameterized, textSource, type Raw } from '../domain/shared.js';

/** Compare published collections against independently reopened raw foreign keys and text. */
export async function validateCharacterExtensionSemantics(
  rawRoot: string,
  generatedRoot: string,
  textMaps: Record<Locale, TextMap>
): Promise<void> {
  const [series, exRanks, skills] = await Promise.all(
    ['AvatarSeriesSkill', 'AvatarExRankConfig', 'AvatarSkillConfig'].map((name) =>
      readTable<Raw>(rawRoot, name)
    )
  );
  const ids = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);
  const equal = (actual: unknown, expected: unknown, field: string) => {
    if (!isDeepStrictEqual(actual, expected))
      throw new Error(`[character/extensions] ${field} differs from pinned raw semantics`);
  };
  for (const locale of ['zh-CN', 'en'] as const) {
    const resolver = await createTextResolver(
      { locale, textMapCode: locale === 'en' ? 'EN' : 'CHS' },
      textMaps[locale]
    );
    const catalog: { id: string }[] = JSON.parse(
      await readFile(path.join(generatedRoot, 'views', locale, 'catalogs/characters.json'), 'utf8')
    );
    for (const { id } of catalog) {
      const character: Character = JSON.parse(
        await readFile(
          path.join(generatedRoot, 'views', locale, 'details/characters', `${id}.json`),
          'utf8'
        )
      );
      const profile = character.profiles.base;
      const ownerRows = series.filter((row) => String(row.AvatarID) === id);
      equal(
        profile.seriesSkills.map((group) => group.skillId).sort(),
        [...new Set(ownerRows.map((row) => String(row.SkillID)))].sort(),
        `${locale}:${id}:series IDs`
      );
      for (const group of profile.seriesSkills) {
        const sourceRows = ownerRows
          .filter((row) => String(row.SkillID) === group.skillId)
          .sort((a, b) => Number(a.Level) - Number(b.Level));
        equal(group.states.length, sourceRows.length, `${id}:series states`);
        const card = profile.skillCards.find(
          (card) => card.externalCondition?.skillId === group.skillId
        );
        if (!card || card.progressions.length)
          throw new Error(
            `[character/extensions] missing external-condition card ${id}:${group.skillId}`
          );
        const variant = card.variants.find((variant) => variant.id === group.skillId)!;
        for (const [index, row] of sourceRows.entries()) {
          const condition = row.UnlockCondition as Raw;
          equal(
            {
              type: group.states[index].condition.type,
              param: group.states[index].condition.param
            },
            { type: condition.Type, param: condition.Param },
            `${id}:${group.skillId}:condition`
          );
          equal(
            group.states[index].relatedAvatarIds,
            ids(row.RelateAvatarIDList),
            `${id}:${group.skillId}:targets`
          );
          const skill = skills.find(
            (skill) =>
              String(skill.SkillID) === group.skillId && Number(skill.Level) === Number(row.Level)
          );
          if (!skill)
            throw new Error(
              `[character/extensions] missing source skill ${group.skillId}:${row.Level}`
            );
          const expected = resolver.projectGameText(
            parameterized(skill.SkillDesc, skill.ParamList)!,
            { scalingParamIndexes: new Set(variant.scalingParamIndexes) }
          );
          if (expected.status !== 'available')
            throw new Error(`[character/extensions] unresolved series text ${group.skillId}`);
          equal(
            variant.levels.find((level) => level.level === Number(row.Level))?.description,
            expected.value.text,
            `${locale}:${group.skillId}:${row.Level}:text`
          );
        }
        equal(
          profile.specialEffects
            .filter((entry) => entry.kind === 'series-skill-link')
            .filter((entry) => entry.rootSkillId === group.skillId)
            .map((entry) => ({
              avatar: entry.linkedAvatarId,
              skill: entry.skill.id,
              order: entry.order
            })),
          ids(sourceRows[0].RelateAvatarIDList).map((avatar, order) => ({
            avatar,
            order,
            skill: String(
              series.find((row) => String(row.AvatarID) === avatar && Number(row.Level) === 1)
                ?.SkillID
            )
          })),
          `${id}:series summary`
        );
      }
      const ownerEx = exRanks.filter((row) => String(row.ACCJKGEKHKP) === id);
      equal(
        profile.exEidolons.map((ex) => ex.id).sort(),
        ownerEx.map((row) => String(row.PHFMCACHFIJ)).sort(),
        `${id}:ExRank IDs`
      );
      for (const source of ownerEx) {
        const ex = profile.exEidolons.find((ex) => ex.id === String(source.PHFMCACHFIJ))!;
        const name = resolver.resolve(textSource(source.OENAMINOLLF)!);
        const desc = resolver.projectGameText(
          parameterized(source.NMAHGFAPENI, source.NNACKOBKFGE)!
        );
        if (name.status !== 'available' || desc.status !== 'available')
          throw new Error(`[character/extensions] unresolved ExRank text ${ex.entityId}`);
        equal(ex.entityId, `ex-rank:${id}:${source.PHFMCACHFIJ}`, `${id}:ExRank identity`);
        equal(ex.name, name.value, `${locale}:${ex.entityId}:name`);
        equal(ex.description, desc.value.markup, `${locale}:${ex.entityId}:description`);
        equal(
          ex.extraEffects?.map((effect) => effect.id) ?? [],
          ids(source.BDECHFIJBFA),
          `${id}:ExRank effects`
        );
        equal(
          ex.relatedSkillIds,
          [
            ...new Set(
              skills
                .filter((skill) => ids(skill.RelatedExRankIDList).includes(ex.id))
                .map((skill) => String(skill.SkillID))
            )
          ],
          `${id}:ExRank skill references`
        );
      }
      if (JSON.stringify(profile).includes('#{'))
        throw new Error(`[character/extensions] unresolved game macro ${locale}:${id}`);
    }
  }
  console.log(`[character:extensions] series=${series.length} exRanks=${exRanks.length} locales=2`);
}
