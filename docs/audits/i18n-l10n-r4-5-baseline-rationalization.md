# R4.5 Baseline Rationalization

## 1. Executive Summary

R4.5 converts the zh-CN regression system from migration-era freezing to explicit product, domain, architecture, and upstream-health contracts. The product baseline remains authoritative for observable behavior, while large internal registries, exhaustive Search captures, Character icon provenance maps, and raw unresolved-localization inventories are removed from baseline authority.

No English data, locale routes, production behavior, upstream pins, aliases, or reviewed Enemy policy were changed.

## 2. Starting State

- Repository: `HSR-Database`, branch `develop`, HEAD `cd2383a1c520c1a2726845922273cb72635242e1`.
- HSR-Database working tree was clean before R4.5.
- Locked upstream commits remained `TurnBasedGameData@8cdb905dc2f8e6fffa9be4eb07af3e34435d6091` and `StarRailRes@d226befe3db13f2ec15f4161d5f34b1b607643fe`.
- Sibling repositories were inspected read-only and not modified.
- Initial product baseline: 1,091 files, 84,066,966 bytes.

## 3. Baseline / Fixture Inventory

| Area        | Before files |   Before bytes | After files |    After bytes |
| ----------- | -----------: | -------------: | ----------: | -------------: |
| Characters  |           98 |     18,216,506 |          98 |     18,216,506 |
| Endgame     |          122 |     21,228,481 |         119 |     19,875,200 |
| Enemies     |          634 |     37,828,267 |         629 |      1,271,718 |
| Light Cones |          170 |      1,883,460 |         170 |      1,883,460 |
| Relics      |           62 |        213,349 |          62 |        213,349 |
| **Total**   |    **1,091** | **84,066,966** |   **1,082** | **41,481,370** |

Additional reductions:

- Search fixture: 3,036,077 → 2,983 bytes.
- Character icon ownership fixture: 1,415,151 bytes → removed.
- Raw unresolved-localization fixture: 236,846 → 9,562 bytes.

## 4. Classification Model

### Product behavior

Catalog order, localized presentation, formatted descriptions/tokens, visible stats, grouping, routes, fallback states, Homepage output, and displayed assets remain in the product baseline.

### Data/domain integrity

Stable IDs, relationships, Character progression ownership, Relic piece identity, Enemy policy, Endgame occurrence identity, and referential integrity remain protected by focused unit/domain tests.

### Architecture invariants

Locale-qualified generated artifacts, browser boundaries, unsupported-locale failures, and removal of neutral/source compatibility trees remain protected by architecture tests.

### Upstream health

Counts, source revisions, missing hashes, and asset inventories remain diagnostics and validation inputs, not timeless product snapshots.

### Migration/forensic

Ignored `data/audit/i18n-phase1`, `data/audit/i18n`, `data/audit/cleanup`, product-baseline diagnostics, maintenance logs, and Search performance captures were deleted after their useful measurements were recorded here. Historical R0–R4 reports remain unchanged.

### Redundant

Enemy registries, Endgame registries, exhaustive Search output, Character icon source/resolved digests, and complete unresolved-entry lists duplicated focused tests or represented internal implementation shape.

## 5. Deleted Migration / Forensic Assets

Deleted ignored local captures had no executable consumers after R4. Historical reports remain the investigation record. The tracked `data/audit/.gitkeep` and current generated `data/audit/latest.json` remain.

## 6. Product Baseline Before vs After

The capture model now stores only product-visible fields and omits upstream provenance, internal registries, generated cache identity, and migration-era representation. Field-level comparison and explicit `--reason` update commands remain unchanged.

## 7. Character Coverage Changes

The Character product entities remain protected. The large icon ownership/source/digest fixture was removed; existing visual-asset tests retain zero-missing checks plus targeted Himeko talent/assist and servant/memosprite mappings. Character semantic/domain tests retain progression and ExtraEffect ownership coverage.

## 8. Light Cone Coverage Changes

Visible catalog/detail, stats, passive/superimposition text, story fallback, assets, and routes remain covered. No Light Cone product behavior was removed.

## 9. Relic Coverage Changes

Visible set/piece presentation, sources, effects, tokens, routes, and catalog behavior remain covered. Strict piece-ID parsing and uniqueness remain focused in `i18n-r1.test.ts`.

## 10. Enemy Coverage Changes

Visible Enemy entities remain in the baseline. Five large internal registries, including the stat-series registry, were removed. Enemy-domain, policy, asset, and detail tests continue to protect inclusion semantics, stable relationships, visible skills, fail-closed hashes, and asset fallbacks.

## 11. Endgame Coverage Changes

Visible mode/group/stage presentation, schedules, recommendations, mechanics, waves, Enemy joins, HP/phase data, and routes remain captured. Internal occurrence/mechanic registry snapshots were removed; Endgame domain/view tests retain identity and referential-integrity coverage.

## 12. Search Coverage Changes

The baseline now keeps five representative product queries covering canonical names, a Light Cone, an Enemy, an Endgame target, and a no-result query. Existing Search tests retain normalization, aliases, category discoverability, ranking classes, valid target identity, shard loading/retry, and Endgame expansion behavior. Exhaustive documents, query matrices, shard membership, and incidental tie ordering are no longer frozen.

## 13. Unresolved Localization Coverage

The raw 544-entry inventory was replaced with classification completeness, invalid-program-error counts, actionable reachable-required fallback count, and a bounded sample. The baseline no longer treats the current aggregate unresolved total as product behavior.

## 14. Focused Invariant Tests Added

The existing focused suites now serve as the authority for the removed data:

- `visual-assets.test.ts` for zero-missing Character icons and targeted ownership/resolution mappings;
- `i18n-r1.test.ts` for Relic piece identity and Character domain/ExtraEffect relationships;
- `enemy-domain.test.ts`, `i18n-phase1.test.ts`, and Enemy detail tests for policy and stable semantics;
- `endgame.test.ts` and `endgame-view.test.ts` for occurrence identity and presentation relationships;
- `search.test.ts` and `search-metadata.test.ts` for functional/ranking/integrity Search behavior;
- `product-baseline.test.ts` to prevent migration registries and exhaustive inventories from returning to the product contract.

## 15. Tests / Tooling Removed or Replaced

Removed baseline writers/readers for Enemy and Endgame registries and Character icon ownership. Search capture now uses a representative matrix. Unresolved localization capture stores actionable summaries and bounded samples. Explicit check/update separation and maintainer reasons remain required.

## 16. Coverage-Loss Audit

| Removed protection                     | Replacement/disposition                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| Enemy registries                       | Focused Enemy domain/policy/detail tests; visible entities remain in baseline             |
| Endgame registries                     | Focused Endgame identity/view tests; visible presentation remains in baseline             |
| Character icon source/resolved digests | Visual asset manifest, zero-missing, Himeko, and servant/memosprite tests                 |
| Exhaustive Search JSON                 | Functional, ranking, alias, shard, retry, and Endgame Search tests plus five-query matrix |
| Raw unresolved entries                 | Invalid/unclassified/actionable fallback invariants and bounded samples                   |
| Ignored migration captures             | Historical reports and Git history; no current executable role                            |

No removed protection was changed merely to hide a product regression.

## 17. Fixture Size Impact

The tracked product baseline decreased from 84,066,966 to 41,481,370 bytes, a reduction of 42,585,596 bytes (approximately 50.7%), while retaining all domain areas and a green semantic comparison.

## 18. Full Validation Results

- `data:sync`: passed.
- `assets:ensure`: passed.
- `messages:check` and scripts TypeScript check: passed.
- `product:baseline:check`: passed with 0 semantic differences.
- Focused Vitest invocation: 37 files / 409 tests passed.
- Full `check`: passed with 0 Svelte/type diagnostics.
- Full `lint`: passed.
- Full Vitest suite: 37 files / 409 tests passed.
- Production `build`: passed.
- Playwright E2E: 229 passed, 3 intentional skips.

## 19. Production-Code Changes

Production implementation changes = 0. Changes are limited to baseline capture/comparison tooling, tests, fixtures, documentation, and ignored local audit evidence.

## 20. Remaining Test Debt

Character, Light Cone, and Relic entity fixtures still contain large visible text/token payloads. They remain product-visible and should only be reduced through future field-level review. Endgame presentation remains intentionally substantial because it protects high-value user-visible content.

## 21. R5 Readiness

The repository has a maintainable zh-CN product contract, focused locale-neutral invariants, explicit architecture-boundary tests, and no migration-era baseline authority. It is ready for a separately scoped English projection implementation.

## 22. Recommendation for English Projection

Proceed only as a separate change: add a LocaleRegistry entry and English site-message catalog, project the same semantic domains through the existing resolver, emit locale-qualified artifacts, and retain the zh-CN product baseline as the regression gate. Do not introduce English production routes or TextMapEN generation in R4.5.
