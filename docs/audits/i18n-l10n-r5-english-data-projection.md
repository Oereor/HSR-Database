# R5 Real English Data Projection

## 1. Executive Summary

R5 generates complete `zh-CN` and `en` product/Search artifacts from one construction of the five locale-neutral domains. English uses pinned TextMapEN and a new manually maintained Site Message catalog. The public SvelteKit product remains zh-CN-only.

## 2. Starting State

Work began on `develop`. The locked TurnBasedGameData commit was `8cdb905dc2f8e6fffa9be4eb07af3e34435d6091`; sibling repositories were clean and left unchanged. The starting and final zh-CN product-baseline checks reported zero semantic differences.

## 3. Locale Configuration

The LocaleRegistry now separates generation from public routing. `zh-CN` and `en` have projection and Site Message support; only `zh-CN` has public-routing capability.

## 4. Site Messages

`messages/en.json` contains English values for all 101 existing keys. Keys and placeholder sets exactly match `messages/zh-CN.json`. Both catalogs are maintainer-owned; no translation or synchronization service was added. `messages:check` parses and compiles every configured locale and rejects duplicates, invalid keys, empty values, missing/extra keys, and placeholder drift.

## 5. TextMapEN Integration

Local and deployment validation require both `TextMapCHS.json` and `TextMapEN.json` at the pinned commit. Each locale owns an independent resolver; EN resolution never consults CHS. Character canonical names and official aliases are derived from English upstream text using the existing stable naming provenance, with no second maintained snapshot.

## 6. Multi-Locale Generation Architecture

Raw tables and Character, Light Cone, Relic, Enemy, and Endgame semantic domains are constructed once. Locale projection contexts then supply the matching resolver, Site Messages, presentation policy, diagnostics, naming metadata, Search alias source, and shard policy. Both generated roots are staged and validated before the existing rollback-safe two-root publication swap.

## 7. Character EN

English projects 97 Character details and a 97-entry catalog with the same AvatarIDs, profiles, skill/card/variant ownership, traces, eidolons, ExtraEffect/SpecialEffect relations, assets, and route targets as zh-CN.

## 8. Light Cone EN

English projects 169 Light Cone details plus the catalog. Equipment IDs, ranks, paths, stats, passive levels, assets, and ordering are structurally identical to zh-CN.

## 9. Relic EN

English projects 60 Relic sets, 184 pieces, and 21 Relic properties. Set/piece identity, slots, effects, stat policy, assets, and ordering are shared; category and composition wording is locale-owned.

## 10. Enemy EN

English projects 628 Enemy templates with unchanged MonsterID relations, included skills, phases, summons, stats, weaknesses, resistances, mechanics, and inclusion policy. Enemy, skill, element, and special-resistance fallbacks are English projection policy and never CHS text.

## 11. Endgame EN

| Mode | Groups | Encounters | Battle slots | Stages | Raw occurrences |
| ---- | -----: | ---------: | -----------: | -----: | --------------: |
| MoC  |     56 |        615 |        1,223 |  1,478 |           7,188 |
| PF   |     26 |        104 |          211 |    211 |          17,900 |
| AS   |     20 |         80 |          163 |    163 |             183 |
| AA   |      9 |         45 |           45 |     45 |             198 |

## 12. Homepage EN

The English Homepage dataset is projected from the same gacha rows and stable Character/Light Cone identities as zh-CN.

## 13. Search EN

Each locale emits 1,144 Search documents and 190 Endgame targets containing 8,167 presented occurrence references. English has zero player-alias-bearing targets. A deterministic pure builder emits 190 EN occurrence shards under `static/generated/en/endgame-occurrences/`. The zh-CN prerender endpoint and current client behavior are unchanged.

## 14. Cross-Locale Identity Verification

Pre-publication structural comparison reported zero differences across catalogs/details, Character profiles, Light Cones, Relic sets/pieces/properties, Enemy templates/monsters/included skills/summons, all Endgame modes and occurrences, Homepage identities, Search documents/targets, route-neutral links, and occurrence shard locators.

## 15. EN Localization Health

| Metric                       |   Count |
| ---------------------------- | ------: |
| Total classified resolutions | 123,188 |
| Available                    | 108,443 |
| Absent                       |  12,898 |
| Missing                      |   1,847 |
| Empty                        |       0 |
| Invalid                      |       0 |
| Unsupported                  |       0 |
| Fallback used                |  13,041 |
| Required                     |  83,556 |
| Optional                     |  39,632 |
| Emitted                      |  94,611 |
| Hidden                       |  28,577 |
| Route reachable              | 118,520 |
| Route unreachable            |   4,668 |
| Unclassified                 |       0 |
| Invalid program-state errors |       0 |

The mechanical CJK scan covered `views/en/**`, `static/generated/en/**`, and `messages/en.json`: 0 hits, 0 Site Message leaks, and 0 unexplained fallback leaks.

## 16. Manifest / Cache / Atomic Generation

The private manifest is schema 42 and retains stable top-level public routes, counts, game version, source commit, and `dataRevision`. It adds both generated locales, the public locale, per-locale TextMap digests, summaries, health, and artifact totals. Freshness/integrity validation rejects incomplete trees, extra files, stale TextMap digests, and artifact digest mismatches. Alias-only refresh remains zh-CN-only.

## 17. Browser / Build Boundary

All ordinary server product loaders still read `views/zh-CN`. There is no `/en` route, switcher, locale API, automatic detection, redirect, or English SEO. No raw TextMap or upstream data enters the browser bundle.

## 18. Tests Added/Changed

Coverage includes dual catalog evaluation, key/placeholder parity, LocaleRegistry capabilities, real TextMapEN GameText parameters/percentages/markup/icons/line breaks/gender/nickname, no-CHS fallback, EN Search without player aliases, EN shards, locale-scoped caches, schema-42 integrity, rollback behavior, and structural/CJK checks in the normal sync/validate path.

## 19. zh-CN Product Baseline

The final baseline contains 97 Characters across seven product areas and reports 0 semantic differences. No baseline expectation was updated.

## 20. Full Validation Results

All required gates passed:

- `pnpm data:sync`, `pnpm assets:ensure`, `pnpm messages:check`, and `pnpm data:validate`;
- `pnpm product:baseline:check`: 0 semantic differences;
- `pnpm check`: 0 errors and 0 warnings;
- `pnpm lint`;
- `pnpm test`: 38 files / 413 tests passed;
- `pnpm build`;
- `pnpm test:e2e`: 229 passed / 3 skipped;
- `git diff --check`.

## 21. Artifact Size / Generation Impact

The manifest covers 2,122 artifacts and 382,935,970 bytes. The zh-CN share is 966 files / 185,388,306 bytes. English is 1,156 files / 197,547,664 bytes, including 190 occurrence shards. Generated data and audits remain ignored build output.

## 22. Known English Wording Follow-ups

English Site Message wording and upstream English terminology can be refined without updating a giant content snapshot. Health counts are version-scoped audit data, not frozen expectations.

## 23. Remaining UI Localization Work

Public routing, locale-aware navigation, route loaders, page/component Site Message conversion, SEO/hreflang, redirects, and responsive bilingual product QA remain intentionally out of scope.

## 24. R6 Readiness

R5 provides complete generated English views, Search, shards, identity checks, health diagnostics, and rollback-safe publication while preserving the zh-CN boundary.

## 25. Recommendation for R6

Proceed with public English routing only as a separate product change. Reuse the generated artifacts and LocaleRegistry capabilities; do not relax structural parity, resolver provenance, CJK classification, or the zh-CN baseline gate.
