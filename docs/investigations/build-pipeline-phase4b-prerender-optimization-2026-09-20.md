# Build Pipeline Phase 4B — Prerender Application Data Optimization — 2026-09-20

## Executive Summary

Phase 4B instrumented the application-owned prerender boundary, measured the existing caches, and retained one bounded local winner:

- Endgame enemy detail reads are now shared by `locale:templateId`. The existing concrete enemy cache remains keyed by locale, template and MonsterID, while each multi-megabyte detail is parsed once and immediately reduced to a small immutable reference index. The full parsed detail is not retained.
The representative warm total moved from `95.582–104.872s` before the change to `80.725–88.152s` with the template cache. The measured intervals do not overlap. Aggregate process-tree CPU moved from `107.469–116.797s` to `93.375–100.719s`. Peak RSS moved from `2,017–2,126 MiB` to `1,581–1,723 MiB`; the optimization did not trade wall time for memory.

A second prototype reused two fixed-option `Intl.NumberFormat` instances and reduced the measured total further to `70.311–78.371s`. It was nevertheless reverted: the formatter lives in a shared domain module, so the source change altered client chunks and failed the strict full-tree byte-parity requirement. No decimal memoization remains in the final code.

Existing dataset, group-view and search-index caches were already effective. `buildModeView` ran 238 times but used only `81.5ms` aggregate, so no mode-view cache was added. Period presentation and occurrence-shard caching were also rejected.

The final recommendation is to validate the retained local winner in one normal Vercel Preview against the approximately `300s` Phase 3 reference. No remote Preview was created in this phase; the Preview and Production deployment profiles below were executed locally only.

## Existing Cache Audit

The complete before profile covered `2,154` pages plus `380` generated occurrence endpoints.

| Cache | Hits | Misses | Finding |
|---|---:|---:|---|
| `datasetCache` | 3,502 | 8 | Correctly reads four modes once per locale; unchanged. |
| `enemyCache` | 6,120 | 826 | Correctly reuses concrete MonsterID references, but its 826 misses re-read only 380 distinct locale/template details. |
| `groupViewCache` | 3,272 | 222 | Exactly one miss per locale/group and heavy reuse from Chinese occurrence fallback; unchanged. |
| `searchIndexCache` | 380 | 2 | Exactly one miss per locale; unchanged. |
| new template projection | 446 | 380 | Eliminates duplicate detail reads while preserving all 826 concrete pair results. |

The new template cache stores projected `EndgameEnemyReference` maps rather than raw enemy detail objects. Its key explicitly includes locale and template ID. The existing pair cache still owns portrait enrichment and concrete MonsterID identity.

## Profiling Results

### Route families

Application request wall is aggregate loader/render time, not an independently timed framework stage. Nested calls overlap and must not be added to Vite wall.

| Family | Calls | Aggregate wall |
|---|---:|---:|
| home | 2 | 0.090s |
| characters | 196 | 3.867s |
| light-cones | 340 | 2.464s |
| relics | 122 | 0.843s |
| enemies | 1,258 | 17.705s |
| endgame pages | 232 | 8.868s |
| search | 2 | 0.870s |
| generated occurrence endpoints | 380 | 8.318s |
| other routes/endpoints | 4 | 0.157s |

### Endgame functions

| Operation | Calls | Aggregate wall | Decision |
|---|---:|---:|---|
| `buildModeView` | 238 | 0.082s | Too small; do not cache. |
| `buildGroupView` | 222 | 2.911s before | Optimize formatter construction, not the already-cached group view. |
| `buildResolvedGroupView` | 222 | 169.426s nested wait | Dominated by concurrent detail I/O/parse; not additive wall. |
| `getEndgameGroup` | 3,494 | 202.531s nested wait | Existing cache handles 3,272 hits. |
| `getEndgameOccurrenceShard` | 380 | 7.960s | Each English shard is consumed once; Chinese fallback reuses group cache. |

### JSON reads

Before optimization, all instrumented generated JSON reads totaled 3,544 calls and 997,461,639 bytes. Enemy details accounted for 2,082 calls and 864,740,185 bytes; this includes 1,256 normal enemy detail pages plus 826 Endgame pair misses.

After template projection, enemy-detail reads fell to 1,636 calls and 410,138,739 bytes. The exact eliminated work is 446 reads and 454,601,446 bytes. Aggregate enemy-detail parse wall fell from `9.749s` to `3.609s` in the representative profile. The largest duplicate was `8002050.json`, previously read 49 times per locale.

## Implemented Optimization

### Enemy template projection

- Boundary: application server Endgame resolver only.
- Key: `${locale}:${templateId}`.
- Value: a promise of a read-only MonsterID-to-reference map, or `undefined` for a missing detail.
- Lifecycle: module/process lifetime, matching the existing generated-data caches.
- Immutability: projected references and weakness arrays are frozen; per-pair results copy the weaknesses array before entering a group view.
- Locale isolation: the cache key includes `zh-CN` or `en`, and a bilingual integration test resolves the same group concurrently.
- Failure behavior: missing detail remains a graceful `exists: false` reference; a present detail missing the concrete MonsterID remains an explicit error.

## Rejected Candidates

- **Mode view cache:** 238 constructions cost only `81.5ms`, far below the 5% threshold and local build variance.
- **Period presentation cache:** construction is a small locale closure and did not appear as a material hotspot.
- **Larger group-view cache:** the existing cache already had 3,272 hits and exactly 222 required locale/group misses.
- **Raw enemy-detail cache:** it would retain approximately 150MB of JSON text-equivalent source data plus parsed object overhead. Projecting immediately keeps only 3,446 small bilingual reference entries.
- **Occurrence shard cache:** English shards are read once; Chinese fallback already converges on the existing group cache.
- **Decimal formatter reuse:** the prototype reduced 222 `buildGroupView` calls from `1.977–2.911s` to `0.366–0.442s`, but changed shared client chunks and therefore the complete build tree. It was reverted despite the measurable speedup.
- **Decimal value memoization:** unnecessary and potentially unbounded; it was not implemented.
- **Mode/presentation mutation or global locale state:** not introduced.

## A/B Benchmarks

All samples used the same Node `v22.19.0`, pnpm `11.9.0`, route set, warm generated inputs and default SvelteKit prerender concurrency. `HSR_PRERENDER_PROFILE=1` was enabled symmetrically for the measured A/B groups. A PowerShell harness sampled the Vite process tree every 250ms. Instrumentation and the harness were removed afterward.

| Sample | Vite total wall | Aggregate CPU | Peak RSS | Client log | Outer pre-adapter log |
|---|---:|---:|---:|---:|---:|
| before 1 | 95.582s | 107.469s | 2,125.5 MiB | 8.39s | 78s |
| before 2 | 104.872s | 116.797s | 2,017.4 MiB | 11.06s | 87s |
| template cache 1 | 88.152s | 100.719s | 1,580.5 MiB | 8.87s | 72s |
| template cache 2 | 80.725s | 93.375s | 1,722.6 MiB | 8.36s | 66s |
| formatter prototype 1 (reverted) | 78.371s | 93.516s | 1,720.8 MiB | 7.47s | 63s |
| formatter prototype 2 (reverted) | 70.311s | 79.031s | 1,683.5 MiB | 7.17s | 55.24s |

The standard Vite log does not independently expose server-bundle, route-analysis, prerender and adapter-static wall for this application instrumentation. Those cells are therefore not invented. Phase 4A's separately instrumented unchanged-framework reference remains: server `11.7–11.9s`, client `9.5–9.9s`, route setup `6.5–6.8s`, prerender worker `57.0–59.3s`, adapter `16.6–18.3s`.

Application counters provide the direct causal evidence:

| Metric | Before | Retained template cache | Reverted formatter prototype |
|---|---:|---:|---:|
| Endgame dataset reads | 8 | 8 | 8 |
| enemy detail reads caused by Endgame | 826 | 380 | 380 |
| concrete enemy pair constructions | 826 | 826 | 826 |
| mode view builds | 238 | 238 | 238 |
| group view builds | 222 | 222 | 222 |
| group-view construction wall | 2.911s | 1.977–2.285s | 0.366–0.442s |

## Output Parity

The unchanged public contract was verified:

- 2,154 public HTML routes;
- 4,690 prerender files;
- 7,235 final build files;
- route closure and generated-asset closure;
- representative Endgame landing, all four mode overviews and representative season details in both locales;
- deterministic content comparison with a fixed `HSR_BUILD_VERSION`.

The unoptimized and retained-template-cache builds both produced:

```text
7,235 files
401,401,157 bytes
SHA-256 tree manifest 8ce84156996c8c4dc32ba1f4403fe5b2b9d284770947bd76a1becba199e3b186
```

Both contained `2,154` public HTML routes and `4,690` prerender files. The comparison used the same explicit version value so SvelteKit app-version hashes could not introduce expected metadata drift.

## Tests / Verification

- Final targeted command `pnpm test -- tests/unit/endgame-search-assets.test.ts`: passed, 4 tests in 1 file.
- Existing resolver tests cover multiple MonsterIDs in one template, canonical/concrete separation, missing concrete IDs and missing-detail fallback behavior. The added integration coverage loads the same Endgame group in `zh-CN` and `en` concurrently, verifies locale-specific weakness labels with identical element identities, and the fixed-version full-tree comparison proves that the projected resolver output remains identical.
- `pnpm check`: passed with 0 errors and 0 warnings.
- `pnpm lint`: passed.
- Full `pnpm test`: passed, 50 files and 550 tests.
- Final ordinary `pnpm build`: passed; the Vite build completed in `49.75s` and adapter-static wrote the local `build` tree.
- Local Preview profile: passed in `71.545s`; Vite build `59.893s`, output smoke passed, and the output contained 7,235 files / 401,396,891 bytes.
- Local Production profile: passed in `91.500s`; Vite build `63.161s`, output smoke passed, generated-asset closure scanned 4,393 text files / 9,425 indexed paths, and route closure passed for 2,154 public pages.
- The final Production output contained 7,235 files / 401,396,891 bytes. The byte difference from the fixed-version parity sample above is expected build-version metadata; the strict comparison used `HSR_BUILD_VERSION=phase4b-parity` on both sides.
- Both upstream repositories remained clean at their initial branches: `TurnBasedGameData` on `main` and `StarRailRes` on `master`.

## Remote Deployment

No Vercel Preview or Production deployment was triggered during Phase 4B implementation.

Remote deployment count: `0`.

## Recommendation

The retained local winner is clear and bounded: repeated Endgame enemy-detail I/O/parse was removed without changing routes, schemas, framework configuration, adapter behavior or output bytes. The formatter prototype demonstrated a possible future server-module split but was correctly rejected from this phase. One normal Vercel Preview is recommended to compare the remote Vite/prerender stage with the approximately `300s` Phase 3 reference. Production deployment remains a separate user decision.
