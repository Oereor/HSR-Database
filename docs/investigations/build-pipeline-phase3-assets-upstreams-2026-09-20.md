# Build Pipeline Refactor Phase 3 — Assets / Upstreams — 2026-09-20

## Executive Summary

Phase 3 removes the redundant StarRailRes sparse expansion, narrows TurnBasedGameData to the real deployment source set, and makes cold general-asset generation bounded and deterministic.

- StarRailRes now receives its eight indexes and eleven asset directories in the initial sparse checkout.
- TurnBased uses 81 exact Excel files, two TextMaps and the existing three dynamic Config directories. The prepared tree fell from 4,676 files / 472,882,878 bytes to 2,572 files / 267,724,085 bytes.
- General assets use one shared copy queue and one shared Sharp queue. The chosen defaults are copy `1`, Sharp `2`, sequential pools.
- A final published-tree observation supplies file names, sizes and lazily cached metadata to ensure, telemetry and verify. The verifier still independently derives expected files and image contracts.
- The 2,248 generated files are byte-for-byte identical to the Phase 2 baseline.

Phase 1 tracked enemy assets and the Phase 2 validation/profile split are unchanged.

## Baseline

The implementation started from the local `develop` worktree containing the uncommitted Phase 2 implementation. It was not reset or replaced.

| Metric | Phase 2 baseline |
|---|---:|
| TurnBased prepared tree | 4,676 files / 472,882,878 bytes |
| TurnBased `ExcelOutput/` | 2,185 files / 278,813,183 bytes |
| required 81 Excel tables | 81 files / 73,654,390 bytes |
| generated general assets | 2,248 files / 121,841,064 bytes |
| historical cold asset ensure | 45.263–46.963s |
| historical warm asset ensure | 0.280–0.294s |
| historical asset verify | 0.425–0.724s |
| Phase 2 Production total | 101.208s |
| Phase 2 Correctness-equivalent total | 202.116s |

The output baseline was captured as sorted relative path, size and SHA-256 before implementation.

## Upstream Preparation

### StarRailRes

Before, `prepareCheckout()` materialized only indexes and `prepareStarRailRes()` immediately called a second `sparse-checkout set` for indexes plus source directories. No consumer ran between them.

After, one `starRailSparsePaths` specification is passed to the initial preparation. Individual optional files remain governed by the existing asset missing/fallback policy; required index and directory identity is still checked by the checkout and asset-root contracts.

### TurnBasedGameData

The current Git helper already uses non-cone sparse checkout, including exact TextMap files. Switching to exact Excel files therefore does not introduce a new Git mode or brittle internal mechanism.

The shared source registry is consumed by data generation, Endgame loading, root validation and deployment preparation. It contains:

- 45 main data-generation tables;
- eight LD character tables;
- 34 Endgame tables;
- character-name-only `FateRinOwner`;
- asset-requirement-only `AvatarPlayerIcon`;
- 81 unique tables after deduplication.

Full Correctness currently adds no table beyond Production generation. Investigation-only tables such as the extended enemy-variant audit inputs are intentionally excluded. Dynamic Monster/BattleEvent Config directories remain directory-scoped because their filenames are derived at runtime.

| TurnBased materialization | Files | Bytes |
|---|---:|---:|
| before | 4,676 | 472,882,878 |
| after | 2,572 | 267,724,085 |
| reduction | 2,104 | 205,158,793 (43.4%) |

The checkout validator now compares the actual sparse specification as well as remote, HEAD and required paths. A stale broad cache is therefore narrowed instead of being accepted merely because all required files happen to exist. Missing raw files report `Required TurnBased source file is not materialized: ...`.

## Concurrency Benchmarks

All candidates regenerated and validated the complete 2,248-file tree in a disposable directory. Each recorded candidate was sampled twice; file count and bytes were identical in every run.

### Copy candidates

Sharp was fixed at `1` and pools were sequential. The total is Sharp-dominated, and copy concurrency produced no material improvement.

| Copy pool | Wall samples | Representative max RSS | Decision |
|---:|---:|---:|---|
| 1 | 57.344s / 58.187s | 218 MiB | chosen; lowest concurrency within 5% |
| 2 | 57.010s / 57.654s | 221 MiB | rejected; no meaningful gain |
| 4 | 57.532s / 58.086s | 214 MiB | rejected; no meaningful gain |
| 8 | 57.625s / 57.745s | 210 MiB | rejected; no meaningful gain |

### Sharp candidates

| Sharp pool | Wall samples | Representative max RSS | Decision |
|---:|---:|---:|---|
| 1 | 57.762s / 57.329s | 222 MiB | safe baseline |
| 2 | 33.598s / 33.178s | 271 MiB | chosen |
| 4 | 21.741s / 21.852s | 359 MiB | rejected for oversubscription/RSS |

Sharp `2` reduces wall by about 42% relative to `1`. Its measured peak was about 21–26% above the serial samples, narrowly outside the nominal 20% target, but the absolute peak stayed below 272 MiB on an 8 GiB deployment class. The large wall reduction and small absolute footprint justify the documented guardrail exception; Sharp `4` was rejected.

### Pool overlap

For copy `1` / Sharp `2`, sequential samples were 33.692s / 33.606s and overlapping samples were 32.992s / 33.246s. The approximately 1.6% gain is below the required 5%, while overlap did not reduce memory. Pools therefore run sequentially.

## Chosen Asset Scheduler

- `copy concurrency = 1`
- `Sharp concurrency = 2`
- `overlap = false`
- no `UV_THREADPOOL_SIZE` or `sharp.concurrency()` change

Tasks are planned in stable requirement/category order. Copy and Sharp categories share their respective global queue. Once a worker fails, neither pool takes new work; in-flight failures settle and are reported by stable original task order. Manifest `available`, `missing` and resolved mappings are constructed from the original request order, not completion order.

Character-detail transforms are grouped by physical source before scheduling. The current 1,547 logical references therefore produce 1,330 physical files and metadata is inspected once per physical file.

## Output Parity

The final default candidate and a real clean `assets:ensure` produced:

```text
copies=623
Sharp transforms=1,625
missing=0
files=2,248
bytes=121,841,064
```

The post-change tree matched the captured Phase 2 relative path, size and SHA-256 list exactly. Transform settings, manifest schema 16, available/missing sets, resolved URLs and public paths did not change.

## Ensure / Verify

Before, cold generation performed staging metadata validation, then separately scanned/stat-ed the published tree for summaries and cache validation; build telemetry scanned it again, and verify opened metadata per logical manifest reference.

After:

1. staging is independently observed and metadata-validated before publication;
2. atomic publication replaces the old tree and rolls back if manifest publication fails;
3. the final published tree is observed once for file names and sizes;
4. ensure, build telemetry and verify share that final observation for the current process only;
5. verify independently derives expected files and dimensions/formats, lazily opening each physical file once.

No observation is serialized or trusted across builds, and no new all-file hash contract was added.

## Real Verification

| Check | Result |
|---|---|
| targeted pool/Git/asset tests | passed, 36 tests |
| script TypeScript gate | passed |
| clean real asset generation | passed, 34.267s |
| real asset verification | passed, 2,248 metadata inspections |
| byte-for-byte output parity | passed |
| atomic manifest-publication rollback fixture | passed |
| `pnpm check` | passed |
| `pnpm lint` | passed |
| `pnpm test` | passed, 50 files / 549 tests |
| `pnpm ci:develop` | passed, 122.008s total |
| `pnpm ci:validate` | passed, 169.002s total |
| Preview-equivalent build | passed with unusable process-local proxy, 126.868s total |
| Production-equivalent build | passed with unusable process-local proxy, 106.720s total |
| Playwright smoke | environment-blocked: matching Chromium executable is not installed; no download/retry |
| disposable fresh upstream materialization | environment-blocked: local partial-clone shared clone could not hydrate a promisor object, and the safer temporary-worktree alternative was rejected by the read-only repository boundary |

The final profile observations were:

- Development: cached upstream preparation, 7.135s data ensure, 0.190s asset ensure, 15.826s tests and 57.879s Vite build.
- Correctness: 39.010s full data validation, 1.218s asset verification with 2,248 metadata inspections, 14.919s tests and 58.076s Vite build.
- Preview under unusable `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`: cached upstreams and assets, 113.822s Vite build, no network dependency.
- Production under the same unusable proxy: 6.473s build-input validation, 3.929s asset verification, 71.425s Vite build and complete reference/route closure.

The disposable fresh preparation attempt did not alter either sibling repository. Exact sparse identity is still covered by the real prepared caches and by tests for pinned checkout identity, sparse-path escaping and stale broad-cache narrowing.

## Rejected Experiments

- copy concurrency above `1`: no result outside normal filesystem variance.
- Sharp concurrency `4`: faster, but unnecessary CPU/RSS oversubscription for the approximately two-core deployment target.
- overlapping copy and Sharp pools: less than 5% improvement.
- cone-mode TurnBased redesign: rejected because the existing helper already safely supports exact non-cone paths required by TextMaps and StarRailRes indexes; changing mode would add complexity while materializing broader directories.
- further Config narrowing: rejected because runtime-derived Config filenames do not have a sufficiently static consumer contract.

## Existing Guarantees and Deferred Work

- Production, Preview, Development and Correctness make zero Nanoka requests; tracked enemy snapshot validation is unchanged.
- Correctness still runs `data:validate:full`; Production still runs `data:validate:build-inputs`; Preview and Development add no expensive data validator.
- `static/generated-enemy-assets/` is untouched and `static/generated-assets/` remains ignored build output.
- Vite/SvelteKit prerender, adapter-static copy amplification, hardlink/reflink and route-output optimization remain Phase 4 work.
