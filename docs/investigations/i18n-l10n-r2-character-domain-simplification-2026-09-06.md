# HISTORICAL / NON-NORMATIVE — see [Localization and Data Generation Architecture](../architecture/localization-and-data-generation.md) for the current system.

# R2 Character i18n/l10n Domain Simplification

## 1. Outcome

Character generation now follows the durable in-memory pipeline:

`raw Character tables → locale-neutral domain + shared ExtraEffect registry → zh-CN projection → route-shaped product views`

The zh-CN product baseline remains authoritative and unchanged. Character no longer requires a persisted neutral-domain artifact or root compatibility copies.

## 2. Character domain changes

- `CharacterDomain` retains durable semantic data under `profiles.base` and `profiles.enhanced`.
- Duplicated top-level energy, skills, traces, eidolons, special-effect, progression, and profile-intro mirrors were removed.
- Unused naming members and empty progression fields were removed.
- `buildCharacterDomain()` now returns `{ characters, extraEffects }`; Character records retain only `extraEffectIds`.
- Domain validation checks every referenced ExtraEffect ID against the single build-level registry.
- The Character projector receives that registry explicitly and preserves ordering, grouping, icons, parameters, diagnostics, and semantic relations.

## 3. Naming and GameText

Projected Character names are now the parity source for official/Search canonical labels, while reviewed alias provenance remains enforced. Trailblazer and March 7th path variants, `baseName`/`fullName`, aliases, ordering, and Homepage joins remain unchanged.

Character descriptions use one `projectGameText()` call. The projection exposes both plain text and markup-preserving output so numeric/percentage formatting, line breaks, colors, underline, icons, unbreak, gender branches, nickname substitution, and SpecialEffect references remain stable.

## 4. Artifact and consumer cutover

Character product consumers and validators read:

- `src/lib/generated/views/zh-CN/catalogs/characters.json`
- `src/lib/generated/views/zh-CN/details/characters/*.json`

The following are no longer written or required:

- `src/lib/generated/neutral/domains/characters.json`
- `src/lib/generated/catalogs/characters.json`
- `src/lib/generated/details/characters/*.json`

Enemy root compatibility outputs and shared raw source staging remain intact.

## 5. Generated size/count impact

Current authoritative Character output is 98 localized files (97 details plus one catalog), totaling **8,109,548 bytes**. The removed Character root compatibility set was 98 duplicate files (one catalog plus 97 details); it is no longer materialized. The removed persisted neutral Character domain was approximately **15.2 MB** at the pre-cutover measurement. No replacement cache or domain artifact was introduced.

## 6. Validation

Passed:

- `pnpm data:sync`
- `pnpm assets:ensure`
- `pnpm messages:check`
- `pnpm data:validate` (1,127 zh-CN search records; expected 544 missing TextMap CHS hashes audited)
- `pnpm product:baseline:check` (**0 semantic differences**)
- `pnpm check` (0 Svelte/type diagnostics and script typecheck errors)
- `pnpm lint`
- `pnpm test` (36 files, 403 tests passed)
- `pnpm build`
- `pnpm test:e2e` (229 passed, 3 skipped)

The first sandbox attempt at Vite/Vitest startup hit the known esbuild directory-access restriction; rerunning with the project’s approved filesystem access completed the checks above.

## 7. Protected boundaries

Enemy, Endgame, English production, `/en` routing, Search ranking behavior, Homepage behavior, upstream locks, aliases, and protected baseline fixtures were not changed. The generated Character absence assertions and Enemy/Endgame compatibility coverage remain in place.

> HISTORICAL / NON-NORMATIVE — for the current architecture, see [Localization and Data Generation Architecture](../architecture/localization-and-data-generation.md).
