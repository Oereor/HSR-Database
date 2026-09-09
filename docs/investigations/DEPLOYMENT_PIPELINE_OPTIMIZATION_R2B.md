# Deployment Pipeline Optimization R2-B

## 1. Summary

R2-B keeps local and Vercel Preview builds fully self-validating while allowing only an explicit `VERCEL_ENV=production` build to trust the protected-main `CI / Correctness` repository gate. The implementation parallelizes independent upstream and asset work, removes repeated data hashing and asset catalog/file scans, replaces final per-reference directory traversal with a single path index, adds monotonic stage telemetry, and makes deployment build versions deterministic per site commit.

Measured on the current locked inputs, the full cold build improved from **419.952s to 332.718s** (20.8%), while the Production cold build completed in **322.464s** (23.2% below the old full baseline). Full and Production warm medians were **77.133s** and **71.486s**. Their final build trees were byte-for-byte identical.

## 2. Source-of-Truth / Reference Notes

Implementation used the post-R2-A `develop` tree at merge commit `3fd234c`, with TurnBasedGameData `8cdb905dc2f8e6fffa9be4eb07af3e34435d6091` and StarRailRes `d226befe3db13f2ec15f4161d5f34b1b607643fe`. Current scripts and tests took precedence over historical timings. The R2-A workflow was confirmed present after PR #13 was merged externally.

## 3. Current Pipeline Before Changes

The previous `deploy:build` was linear: lock → TurnBasedGameData preparation → `check:scripts` → official-name check → data ensure → enemy assets → StarRailRes preparation → general asset ensure → general asset verify → SvelteKit/Vite → final build verify.

Roles were:

- Fetchers/materializers: both pinned upstream preparations.
- Mixed generator/validator stages: messages, data ensure, enemy ensure, general ensure.
- Repository correctness validators: script TypeScript and official-name snapshot checks.
- Artifact validators: general asset deep verify and final emitted-reference closure.

## 4. Preview vs Production Contract

| Stage / invariant                    | Preview              | Production               | GitHub main PR CI           |
| ------------------------------------ | -------------------- | ------------------------ | --------------------------- |
| Message source correctness           | Full check + compile | Compile required modules | Full check                  |
| Script TypeScript correctness        | Required             | Delegated                | `pnpm check` / tests        |
| Official search-name snapshot        | Required             | Delegated                | `data:search-names:check`   |
| Pinned upstream materialization      | Required             | Required                 | Required for CI inputs      |
| Generated data creation/integrity    | Required             | Required                 | Prepare + `data:validate`   |
| Enemy freshness/assets               | Required             | Required                 | Prepared for build/tests    |
| General assets and deep verification | Required             | Required                 | Prepared for build/tests    |
| SvelteKit/Vite build                 | Required             | Required                 | Browser-smoke build         |
| Final emitted artifact closure       | Required             | Required                 | Production deployment owner |

`production-ci-backed` is selected only for exact `VERCEL_ENV=production`. Preview, development, missing, empty, or unknown values select `preview-full`; missing/unknown values log the safe fallback without failing.

## 5. Production CI Ownership

| Check                                 | Why safe to remove from Production                                                           | New correctness owner                               |
| ------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `check:scripts` TypeScript validation | It does not materialize deployment data/assets; Paraglide compilation is retained separately | `CI / Correctness` → `pnpm check`                   |
| `data:search-names:check`             | It validates tracked repository metadata and produces no build prerequisite                  | `CI / Correctness` → `pnpm data:search-names:check` |

No generation, pinned-input, asset, Vite/prerender, or final artifact check was transferred out of Production.

## 6. Implemented Pipeline Changes

### 6.1 Stage Timing

All stages use `performance.now()` and emit `[deploy:timing] <stage> <seconds>s`, including failed stages. A `finally` block always prints the ordered summary and total. Parallel branch failures are collected with their stage/upstream identity.

### 6.2 Data Ensure Validation Reuse

`ensureData()` now records whether the current manifest and every listed artifact were fully validated. An unchanged cache with an unchanged search bundle reuses that proof. Regeneration or search-bundle metadata refresh clears the proof and performs one full validation of the new outputs. Missing/corrupt cache data is never trusted during offline fallback.

### 6.3 Asset Requirement / Verify Reuse

General asset ensure now returns an `AssetValidationContext` containing the parsed requirements, manifest, source commit, and per-directory filename sets. Deployment deep verify consumes that context while retaining image format, dimensions, alpha, mapping, fingerprint, coverage, and source-commit checks. Standalone `assets:ensure` and `assets:verify` still build their own complete context.

### 6.4 Final Artifact Path Index

Final verification walks `build/` once, records all exact relative paths, and separately records the existing HTML/JS/CSS/JSON scan set. Generated-resource references use O(1) exact-case lookup after the existing decoding, query/hash removal, traversal, and malformed-URL rules.

### 6.5 Upstream / Stage Parallelism

After lock loading, message/script preparation and both independent upstream preparations start together. Data waits only for TurnBasedGameData; StarRailRes continues concurrently. After data and both upstreams are ready, enemy asset ensure runs in parallel with the sequential general ensure/deep-verify branch. Vite waits for both asset branches, and final verification waits for Vite.

The first cold measurement attempt encountered a zero-progress GitHub partial-clone transfer while Git was fetching StarRailRes promised blobs. It was interrupted after confirming the process was blocked in network `index-pack`, and its exact child processes were terminated. The immediate retry completed normally; this event is excluded from timing results.

## 7. GitHub CI Trigger Adjustment

`.github/workflows/ci.yml` now triggers only for pull requests targeting `main`. Workflow name `CI`, job name `Correctness`, read-only permissions, command coverage, frozen install, and absence of workflow-level path filters remain unchanged. The upstream updater still targets `develop`; direct develop work is validated by Vercel Preview's full path.

## 8. Correctness / Failure-Injection Verification

| Failure                             | Preview full                                                  | GitHub CI owner                                  | Production optimized                                                     |
| ----------------------------------- | ------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| Type-only script error              | `check:scripts` failed with TS2322                            | `pnpm check` catches the same error              | Repository type stage intentionally omitted; mode contract test confirms |
| Missing generated homepage artifact | Data gate detected it and regenerated/validated locked output | `data:validate` failed with ENOENT before repair | `data:ensure` retains detection, materialization, and final validation   |
| Missing required general asset      | Deep verify failed with manifest/file mismatch                | CI preparation/deep asset contracts catch it     | Deep verify remains required                                             |
| Wrong-case emitted asset reference  | Final closure failed with the exact source/reference          | Not transferred                                  | Final closure remains required                                           |

All injected source/build changes were restored. The data artifact was restored through the real deterministic regeneration path and passed `data:validate` afterward.

## 9. Artifact Equivalence

SvelteKit's default timestamp build version initially caused expected version/chunk-name cascades between otherwise equal builds. Deployment builds now set `kit.version.name` from `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA`, or the local site Git revision. This preserves update-version behavior while making same-commit deployment artifacts reproducible.

| Metric                 |                                                               Full | Production optimized | Difference |
| ---------------------- | -----------------------------------------------------------------: | -------------------: | ---------: |
| Files                  |                                                              7,122 |                7,122 |          0 |
| Total bytes            |                                                        394,355,499 |          394,355,499 |          0 |
| HTML route files       |                                                              2,153 |                2,153 |          0 |
| Data manifest SHA-256  |                                                              equal |                equal |       none |
| Asset manifest SHA-256 |                                                              equal |                equal |       none |
| Full tree SHA-256      | `ae091fe6af2b3229faa33f3e82d8bc93d8c6ee5beecd9e8b4c423e0c87e2e6d0` |                 same |    0 files |

## 10. Before / After Timing

Stage durations overlap after R2-B, so their sum is intentionally larger than total wall time.

| Stage                     |  Before cold | After full cold | After production cold | Warm median (full / production) |
| ------------------------- | -----------: | --------------: | --------------------: | ------------------------------: |
| Lock                      |       0.003s |          0.001s |                0.001s |                 0.002s / 0.002s |
| Messages/script checks    |       6.364s |          6.503s |                3.474s |                 6.649s / 3.400s |
| TurnBasedGameData prepare |      36.646s |         39.679s |               46.748s |                 0.195s / 0.192s |
| StarRailRes prepare       |      95.742s |        138.625s |              126.520s |                 0.263s / 0.275s |
| Search-name check         |       1.181s |          1.326s |                     — |                      1.230s / — |
| Data ensure               |      50.533s |         52.587s |               50.426s |                 6.767s / 6.730s |
| Enemy asset ensure        |      95.294s |        119.514s |              137.064s |                 1.374s / 1.318s |
| General asset ensure      |      58.071s |         62.145s |               64.009s |                 0.168s / 0.153s |
| General asset verify      |       5.892s |          5.760s |                5.857s |                 4.982s / 4.996s |
| Vite/prerender            |      48.106s |         69.577s |               53.272s |               52.671s / 51.776s |
| Final deploy verify       |      22.119s |          4.955s |                5.545s |                 4.578s / 4.528s |
| **Total wall**            | **419.952s** |    **332.718s** |          **322.464s** |           **77.133s / 71.486s** |

### 10.1 Full / Preview

Warm runs were 78.134s, 76.223s, and 77.133s (median 77.133s, range 1.911s). The largest stable algorithmic gain is final verification, reduced from about 22.1s to a 4.6s warm median. Data ensure also avoids its former second full artifact validation.

### 10.2 Production Optimized

Warm runs were 72.489s, 71.486s, and 71.446s (median 71.486s, range 1.043s). Compared with full, Production saves the script typecheck portion and official-name check while retaining message generation and every artifact prerequisite/gate.

## 11. Test Results

- `pnpm check`: passed, 0 errors and 0 warnings.
- `pnpm check:scripts`: passed after failure injection was removed.
- `pnpm messages:check`: passed, 322 messages across 2 locales.
- `pnpm lint`: passed (Prettier and ESLint).
- `pnpm test`: 42 files, 440 tests passed.
- Targeted R2-B contracts: 19 passed.
- `pnpm data:validate`: passed after regeneration; 544 pre-existing missing-CHS TextHash warnings remain.
- `pnpm product:baseline:check`: passed, 97 characters across seven areas with 0 differences.
- `pnpm test:e2e`: 287 passed, 7 skipped (294 total).
- Standalone `pnpm data:ensure`, `pnpm assets:ensure`, `pnpm assets:verify`, and `pnpm deploy:verify`: passed.
- Preview/full and Production clean/warm builds: passed, including final closure and protected-metadata checks.
- Final local fallback build: passed in `preview-full` mode with an explicit unavailable/fallback log; final Production build passed in 72.396s.

## 12. Expected Vercel Impact

Local cold wall time improved by 87–97 seconds despite network and Vite variance. Vercel should show the same structural savings from overlapping upstream fetches, overlapping asset branches, single-pass final verification, and the shorter Production correctness gate. Actual platform wall time must be read from Vercel logs rather than inferred from this machine.

## 13. Remaining Bottlenecks

Cold work remains dominated by StarRailRes promised-blob materialization, Nanoka enemy download/generation, and general image generation. Warm work is dominated by SvelteKit prerender. Enemy freshness still performs its required external version query.

## 14. Deferred Work

No artifact DTO/schema change, search-index reuse, enemy shard, lazy shard, coefficient reconstruction, external blob storage, Build Output API migration, Turborepo, remote task cache, or freshness-policy change was introduced.

## 15. Manual Vercel Verification

After the first push, verify:

- Preview logs contain `[deploy] mode=preview-full` and include `search-names-check`.
- Production logs contain `[deploy] mode=production-ci-backed`, omit repository-only checks, and retain data/assets/Vite/final verify.
- Both logs include `[deploy:timing] summary`.
- If Vercel does not expose `VERCEL_ENV`, the log says it is unavailable and safely uses full validation; check Vercel System Environment Variables rather than adding branch inference.

## 16. Recommendation

Ship R2-B as the deployment-orchestration boundary. Validate one real Preview and one real Production deployment, then stop. The remaining cold cost is dominated by upstream/network and image generation policy; it should not be addressed by R2-C/cache architecture without a separate measured decision.
