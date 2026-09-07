# HISTORICAL / NON-NORMATIVE — see [Localization and Data Generation Architecture](../architecture/localization-and-data-generation.md) for the current system.

# R1 Target Architecture Spine

## 1. Executive Summary

R1 keeps production `zh-CN` only and introduces a single runtime locale registry (`zh-CN → CHS`, with `en → EN` represented but disabled). Light Cone and Relic generation now writes product views under `views/zh-CN`; the root compatibility tree retains only Character and Enemy catalogs/details plus shared Endgame/Homepage outputs. Relic effects expose safe `DescriptionToken[]` alongside the existing plain description, with the approved baseline fixture extension.

## 2. Starting State

The worktree contained the R0 semantic baseline and the existing Character/Light Cone/Relic domain/projector work. Fresh `pnpm product:baseline:check` passed before the R1 changes with zero semantic differences. The branch is `develop`; unrelated pre-existing dirty files were preserved.

## 3. Scope Actually Changed

- Added `scripts/data/locale-registry.ts` and routed production resolver/manifest configuration through it.
- Removed persisted Light Cone/Relic domain artifacts from the mandatory domain artifact set.
- Stopped emitting root Light Cone/Relic catalogs/details/relic-property artifacts.
- Added strict Relic piece-ID parsing and Relic effect tokens.
- Moved Relic effect-summary composition behind the site-message source.
- Updated bounded validators, asset readers, unit coverage, and the CHS baseline fixtures.

Character, Enemy, Endgame, Search ranking, routes, Homepage joins, upstream pins, and asset repositories were not intentionally redesigned.

## 4. New Minimal Spine

`LOCALE_REGISTRY` is the value-level source for locale, TextMap code, site-message locale, and production enablement. Unsupported locales fail explicitly; English remains disabled. New LC/Relic projector contexts use the registry-derived locale type and result-based resolver API. Transitional resolver adapters and manifest fields remain only for untouched migration branches.

## 5. Light Cone

### Before

The domain builder/projector already separated semantic data from localized output, but the generated neutral domain file and root compatibility copy were treated as required by validators and asset tooling.

### After

The in-memory flow is raw tables → `buildLightConeDomain()` → `projectLightCone()` → localized catalog/detail output. Views remain route-shaped and preserve all existing IDs, ordering, stats, passive ranks, parameters, labels, search inputs, Homepage joins, and assets.

### Removed/deferred migration dependencies

Light Cone is no longer persisted in `neutral/domains/light-cones.json` and is no longer emitted in the root compatibility tree. Shared raw source staging and root manifest compatibility remain temporarily for other domains.

## 6. Relic

### Before

Relic used a locale-neutral domain but persisted the domain artifact, emitted duplicate root files, composed effect summaries with Chinese punctuation in the projector, and exposed only reparsed plain effect strings.

### After

Relic follows the same in-memory builder/projector path. Effects retain `description` and now also expose resolver-produced `descriptionTokens`; the detail UI renders the tokens through `DescriptionText` with the existing fallback behavior.

### Piece identity rule

Upstream `RelicDataInfo` has no separate stable piece-ID field. The accepted source-backed rule is the complete symbolic form `RelicName_<digits>`, isolated in `parseRelicPieceId()` and rejected on malformed input. The generated dataset contains 184 unique piece IDs.

### Locale-owned formatting

The `relic_effect_summary` site message owns `{required}件：{description}` composition. The resulting zh-CN summary remains equal to the ratified product text.

## 7. Persisted Artifact Changes

Character remains the only persisted neutral domain artifact required by the current validator. Raw source shards remain because Enemy/Endgame and shared validation still consume the staging boundary. LC/Relic product artifacts are authoritative only under `src/lib/generated/views/zh-CN`.

## 8. Compatibility Residue Still Deferred

The root compatibility tree, migration labels, neutral aggregate/source shards, and legacy resolver adapters remain where Character/Enemy/Endgame still require them. Global compatibility deletion, public/private manifest redesign, Character refactoring, and Enemy/Endgame migration are deferred to later phases.

## 9. Tests Added/Removed/Changed

- Added locale-registry, strict piece-ID, 184-piece uniqueness, and token/text-equivalence tests.
- Updated data validation, ensure, asset requirements, and data tests to read LC/Relic product data from `views/zh-CN`.
- Extended the product baseline fixture with Relic effect tokens using the explicit approval reason: `R1 Relic effect token DTO adoption; text, routes, and rendered semantics unchanged`.
- No expected-failure, skip, or weakened assertion was introduced.

## 10. Product Baseline Results

Fresh generation, asset ensure, and `pnpm product:baseline:check` pass with **0 semantic differences** across all seven product areas.

## 11. Full Validation Results

Passed:

- `pnpm check:scripts`
- `pnpm data:validate`
- `pnpm product:baseline:check`

`pnpm check` and the full Vitest startup were attempted; the restricted shell's Vite/esbuild process received an access-denied error while resolving the workspace config, before application assertions ran. Build and E2E remain to be run in the normal project environment.

## 12. Code/Artifact Size Impact

The generated root tree no longer contains Light Cone/Relic duplicate product files or Relic property catalog output. The localized view tree remains complete. Neutral raw source staging is retained temporarily; no second staging system was added.

## 13. Remaining Risks

- Shared validators and some historical tests still encode transitional schema/layout assumptions outside the migrated LC/Relic slice.
- Relic token adoption expands the serialized DTO and requires reviewers to keep the fixture diff limited to token fields.
- Root compatibility removal for Character/Enemy/Endgame and neutral source cleanup remain coupled to later migrations.

## 14. Recommendation for R2

Keep Character semantically frozen and use the R0 baseline while simplifying its domain graph and persisted artifact authority. Do not enable English or begin Enemy/Endgame migration until the next identity and compatibility contracts are separately ratified.

> HISTORICAL / NON-NORMATIVE — for the current architecture, see [Localization and Data Generation Architecture](../architecture/localization-and-data-generation.md).
