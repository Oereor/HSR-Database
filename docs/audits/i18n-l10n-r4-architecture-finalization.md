# R4 Migration Garbage Collection & Architecture Finalization

## 1. Executive Summary

R4 removed persisted neutral/source staging, root Homepage compatibility output, migration manifest labels, and deprecated TextResolver adapters. Production remains zh-CN-only and the product baseline remains unchanged.

## 2. Starting State

The repository started on `develop` at `f88078f2347aa4e11a44e72ec6152c9c99c8126f` with the pinned upstream commits from `upstream.lock.json`. The worktree and sibling repositories were clean. Fresh generation and the product baseline passed before cleanup.

## 3. Migration Residue Inventory

The consumer inventory was completed before deletion:

| Classification | Decision                                                                                                                                                                                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durable        | Raw readers, all five domain builders/projectors, `LocaleRegistry`, result-based localization, `GameText`, reviewed Enemy policy, aliases, Search identity, product-baseline fixtures, route generation, asset fallback, and domain invariant tests remain.                        |
| Transitional   | Neutral/source snapshots, root catalogs/details/Endgame/Homepage, locale-local manifest, `static/generated/meta.json`, schema-40 phase metadata, neutral projection helpers, and their cache assertions were removed after their consumers moved to raw inputs or localized views. |
| Test-only      | Focused raw-input fixtures, result-state coverage, product-baseline capture, browser-boundary assertions, freshness checks, and deleted-path assertions remain. Adapter-compatibility-only tests were removed.                                                                     |
| Debug          | Persisted neutral/source debug dumps were removed. Read-only generated metrics and audit output remain.                                                                                                                                                                            |
| Dead           | `resolveHash`, `resolveRef`, `resolveSymbolic`, the text-map-only constructor, unused compatibility exports, and stale schema assertions were removed.                                                                                                                             |
| Unknown        | None remained after the final production, script, test, and documentation reference search.                                                                                                                                                                                        |

## 4. Final Architecture

```text
pinned upstream → lossless readers → in-memory domains → locale projection
→ views/zh-CN + locale Search → schema-41 private manifest → SvelteKit
```

## 5. Root Compatibility Removal

Homepage is emitted and loaded only from `views/zh-CN/homepage.json`; root compatibility catalogs/details/endgame/Homepage files are no longer produced.

## 6. Neutral/Source Staging Removal

`src/lib/generated/neutral/**` is no longer generated or required. Upstream integrity is checked directly at the pinned input boundary.

## 7. TextResolver API Finalization

`resolve`, `projectGameText`, explicit result states, diagnostics, and provenance remain. `resolveHash`, `resolveRef`, `resolveSymbolic`, and the legacy constructor overload were removed; Character naming and Enemy presentation callers now use explicit result handling.

## 8. Manifest / Artifact Integrity

Schema 41 stores private provenance and per-emitted-JSON byte/SHA-256 metadata. Public layout data is limited to game version and a short data revision. Cache validation checks the actual localized product/Search tree.

## 9. Orchestration Cleanup

Generation writes validated temporary trees and publishes them with rollback-safe directory replacement. No replacement migration staging system was introduced.

## 10. Tests Removed/Replaced/Added

Migration cache tests now validate schema 41 and absence of staging. Baseline capture reads pinned raw tables instead of neutral snapshots. Localization tests use result-based APIs. The full Vitest suite passed: 37 files, 408 tests.

## 11. Final Generated Artifact Layout

Only `src/lib/generated/views/zh-CN/**`, `src/lib/generated/manifest.json`, and `static/generated/zh-CN/search.json` are authoritative generated product data.

## 12. Product Baseline Results

`pnpm product:baseline:check` passed with 0 semantic differences.

## 13. Full Validation Results

The complete handoff gate passed: `pnpm data:sync`, `pnpm assets:ensure`, `pnpm messages:check`, `pnpm data:validate`, `pnpm product:baseline:check`, `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm test:e2e`. Vitest passed 37 files / 408 tests. Playwright passed 229 tests with 3 intentional project/device skips. The validator continues to report the known 544 unresolved upstream TextHashes as audit records; this is not a new R4 regression.

## 14. Artifact / Performance Impact

The fresh post-R4 product tree contains 966 files / 183,553,461 bytes under `src/lib/generated` and one 1,991,510-byte locale Search file under `static/generated`. Retained neutral/source, root compatibility, locale-manifest, and static-meta paths contain 0 files / 0 bytes. The private manifest is 156,665 bytes; representative localized payloads are Homepage 492 bytes, Character catalog 33,637 bytes, Character 1001 detail 54,789 bytes, and Search 1,991,510 bytes. Generation took 12.1 seconds and the complete production build took 38.8 seconds on the validation machine. `pnpm data:measure` reports these sizes without mutating generated output.

## 15. Documentation Finalization

The normative architecture is [Localization and Data Generation Architecture](../architecture/localization-and-data-generation.md). Earlier R0–R3 reports are historical and non-normative.

## 16. Remaining Active Migration References

Active runtime references to neutral/source staging, migration labels, and deprecated resolver methods are zero. Historical reports may mention them for archaeology.

## 17. Remaining Technical Debt

Only non-migration UI-message coverage and measured payload-size improvements remain; neither is part of R4.

## 18. R5 Readiness

The semantic domains and resolver boundary are ready for an offline TextMapEN projection smoke test without enabling English production.

## 19. Recommendation for R5

Project the existing domains with pinned TextMapEN, report explicit missing/unsupported states, verify locale-independent IDs and browser boundaries, and defer routing/product enablement until that audit passes.
