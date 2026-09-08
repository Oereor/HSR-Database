# CI / Test Hygiene Implementation R2-A

## 1. Summary

R2-A is code complete. The repository now has a regular pull-request correctness workflow, a stable required-check contract, a focused browser smoke suite, recovered product baselines, locale-aware weakness text, and deterministic synchronization for the two previously flaky browser scenarios.

This change does not remove, reorder, or weaken any correctness stage in `deploy:build`. No main-push or scheduled heavy workflow was added. Live GitHub trigger/status verification and branch protection remain manual follow-up work after the first push.

## 2. Baseline Failures

The baseline was re-measured from the pre-change working tree rather than copied from the earlier R2 investigation.

| Signal                        | Before R2-A                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm messages:check`         | Passed: 322 messages across 2 locales                                                                |
| `pnpm check`                  | Passed with 1 unused CSS warning                                                                     |
| `pnpm lint`                   | Failed on formatting in 3 existing Markdown files                                                    |
| `pnpm test`                   | 421 passed, 2 failed                                                                                 |
| `pnpm data:validate`          | Passed with 544 known missing CHS TextHash warnings; 1,144 records per locale and 190 English shards |
| `pnpm product:baseline:check` | Failed only on the homepage tagline                                                                  |
| `pnpm test:e2e`               | 274 passed, 15 failed, 2 flaky, 3 skipped in 5.2 minutes                                             |

The 15 Playwright failures and 2 flaky results reduced to seven actionable classes: changelog date presentation, stale enemy rank copy, obsolete navigator copy, stale homepage/footer copy, Chinese weakness punctuation, obsolete Hero selectors, locale-navigation synchronization, and missing-icon request/hydration timing.

## 3. Failure Classification

| Test or baseline                                              | Classification        | Evidence                                                                                         | Action                                                                                         |
| ------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Homepage tagline                                              | `STALE_BASELINE`      | Current message and approved product surface use `——愿此行，终抵群星`                            | Updated the product fixture and made E2E read the message source                               |
| English enemy rank                                            | `STALE_BASELINE`      | Current English messages define `Normal`, `Elite`, and `Boss`                                    | Unit/E2E expectations now derive from message sources                                          |
| Chinese footer                                                | `STALE_BASELINE`      | Current message source uses `本站为玩家制作的非官方数据网站`                                     | E2E derives the wording from the message source                                                |
| Changelog raw date                                            | `OBSOLETE_ASSERTION`  | The product exposes a semantic `time` element and localized visible date                         | Asserted `datetime` plus localized text                                                        |
| Navigator secondary brand                                     | `OBSOLETE_ASSERTION`  | `HSR Data Archive` is no longer a product contract                                               | Retained brand-region accessibility and navigation behavior                                    |
| Old Hero CSS selector                                         | `OBSOLETE_ASSERTION`  | DOM composition changed while icon presentation semantics remained stable                        | Asserted `data-icon-presentation`, `data-label-size`, and computed product dimensions          |
| Chinese weakness ASCII comma                                  | `REAL_REGRESSION`     | Chinese accessible lists should use the locale's enumeration comma                               | Added and shared `formatLocalizedList`                                                         |
| Search locale roundtrip                                       | `FLAKY_OR_RACE`       | The assertion could run between document navigation and hydration                                | Added explicit document/URL/app-ready/locale UI synchronization                                |
| Missing-icon fallback                                         | `FLAKY_OR_RACE`       | Lazy loading delayed requests, and a failed image could finish before hydration attached `error` | Scroll/observe requests in the test and detect already-failed images on mount in the component |
| Exact viewport-independent content repeated on desktop/mobile | `DUPLICATED_COVERAGE` | The same content contract had no responsive dimension                                            | Kept a single-project assertion while preserving responsive layout/navigation coverage         |

No failure remained `UNKNOWN`, and no valuable suite was deleted merely because it was red.

## 4. Updated Baselines

| Item               | Old expectation                               | New expectation                  | Why                                                           |
| ------------------ | --------------------------------------------- | -------------------------------- | ------------------------------------------------------------- |
| Homepage tagline   | `HONKAI: STAR RAIL DATA ARCHIVE`              | `——愿此行，终抵群星`             | The latter is the current approved Chinese product copy       |
| English enemy rank | `Normal Enemy` / `Elite Enemy` / `Boss Enemy` | `Normal` / `Elite` / `Boss`      | These are the current English message values                  |
| Chinese footer     | `本站为非官方玩家制作的数据网站`              | `本站为玩家制作的非官方数据网站` | The message source and product UI agree on the latter wording |

Exact marketing copy is owned by the message/product layer. E2E confirms that the user-visible surface renders that source instead of maintaining an additional independent string.

## 5. Obsolete Assertions Replaced

- Changelog coverage now verifies `<time datetime="2026-09-03">2026年9月3日</time>`. This preserves machine-readable date semantics and Chinese localization without requiring an obsolete raw display format.
- Navigator coverage no longer requires the retired secondary string. It still verifies that the brand region is accessible and that navigation works.
- Hero coverage no longer reaches through the old `.entity-overview-card [data-label-size="large"]` implementation path. Stable product-semantic attributes and rendered icon/text sizes replace it.

## 6. Real Regressions Fixed

An internal `formatLocalizedList(values, locale)` contract now joins Chinese values with `、` and English values with `, `. Both `EnemyWeaknessGroup` and the enemy detail surface use it for accessible weakness text.

Unit coverage verifies Chinese, English, and empty lists. Playwright verifies the visible/icon group and its accessible text. This fixes the product behavior rather than relaxing the assertion to accept an ASCII comma in Chinese.

The unused relic CSS selector reported by `svelte-check` was removed after confirming there was no consumer.

## 7. Flaky Tests Fixed

The application shell exposes `data-app-ready="true"` only after hydration. Locale roundtrip tests now wait for the complete document navigation, exact path/search/hash preservation, the hydrated shell, the target `html[lang]`, and locale-specific visible results. No fixed sleep was added.

Missing-icon tests register interception before navigation, scroll the lazy image into the load region, request eager decoding where the broader regression test needs it, wait until intercepted requests are observed, and then inspect fallback semantics. `SemanticIconLabel` also checks `complete && naturalWidth === 0` on mount, covering a failed request that completed before the hydrated `error` listener existed. Retry count was not increased.

The two race-focused scenarios were run with `--retries=0 --repeat-each=3`: 18 of 18 executions passed on their first attempt.

## 8. E2E Hygiene Changes

Viewport-independent copy, rank, date, footer, and weakness contracts now run in one browser project. Desktop/mobile coverage remains for behavior with a genuine responsive dimension, including layout and mobile navigation. This changes the full-suite accounting from 3 to 7 intentional skips without lowering the relevant behavior coverage.

A dedicated `ci-smoke` project and `tests/e2e/ci-smoke.spec.ts` cover five critical journeys:

1. Homepage and client navigation.
2. Locale switching plus Search query/hash roundtrip.
3. Direct Enemy navigation and a core interaction.
4. Local asset fallback after intercepted failures.
5. Mobile navigation to a representative overview.

The regular desktop/mobile projects ignore the smoke-only spec, so the five CI scenarios are not silently duplicated in the full suite.

`PLAYWRIGHT_REUSE_BUILD=1` makes Playwright start only `vite preview`; CI performs the production build once before smoke instead of triggering a second build.

## 9. GitHub PR CI Design

| Contract field          | Value                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow file           | `.github/workflows/ci.yml`                                                                                                                                    |
| Display name            | `CI`                                                                                                                                                          |
| Trigger                 | Pull requests targeting `develop` or `main`                                                                                                                   |
| Permissions             | `contents: read`                                                                                                                                              |
| Concurrency             | One run per PR/ref, with obsolete runs cancelled                                                                                                              |
| Job                     | `Correctness` on `ubuntu-latest`, 30-minute timeout                                                                                                           |
| Path filters            | None                                                                                                                                                          |
| Local observed duration | Core/data inputs plus a warm build/smoke are roughly 2–4 minutes; cold GitHub checkout, upstream fetch, dependency/browser install remain to be measured live |

The single runner avoids generating or transferring roughly 490 MB of intermediate generated data and assets between separate jobs. Its order is frozen dependency installation; `check`; `lint`; pinned input preparation; Vitest; search-name validation; generated-data validation; one production build; Chromium installation; smoke against that build.

`ci:prepare` reuses the deployment lock and preparation functions to materialize pinned TurnBasedGameData and StarRailRes checkouts under `.upstream`, then runs data, enemy-asset, and general-asset ensure commands. It does not call or modify `deploy:build`.

A workflow contract unit test locks the target branches, read-only permission, workflow/job names, absence of dangerous path filters, frozen installation, complete command set, and build-reuse environment.

## 10. Required Status Check Contract

The stable check to select in GitHub is:

```text
CI / Correctness
```

It is unique and always created for qualifying pull requests. Internal steps can evolve without changing branch protection. Because the workflow has no workflow-level `paths` or `paths-ignore`, documentation-only or unusual diffs cannot leave the required check permanently pending.

Code complete. The check cannot be selected as required until a pushed pull request has caused GitHub to publish it at least once.

## 11. Upstream Workflow Integration

`.github/workflows/update-upstreams.yml` is unchanged. Its pull requests target `develop`, so they naturally enter the same `CI / Correctness` path. The upstream automation does not duplicate correctness tests and should not receive a bypass from the correctness gate.

Pinned inputs used locally were TurnBasedGameData `8cdb905dc2f8e6fffa9be4eb07af3e34435d6091` and StarRailRes `d226befe3db13f2ec15f4161d5f34b1b607643fe`; preparation reused the existing checkouts.

The two sibling read-only upstream worktrees both returned an empty `git status --short` after validation; no upstream source state was changed.

## 12. Branch Protection Manual Steps

Manual GitHub configuration is required because GitHub CLI/API access was unavailable in this environment.

For both `develop` and `main`, open **Settings → Rules → Rulesets** (or **Settings → Branches**) and configure:

1. Require a pull request before merging.
2. Require status checks to pass and select the exact check `CI / Correctness` after its first successful PR run appears.
3. Require branches to be up to date before merging.
4. Block direct pushes for ordinary contributors/automation.
5. Do not let upstream automation bypass the correctness requirement.

This repository change does not claim that those platform settings are already active.

## 13. Before / After Test Results

| Signal                    | Before                                                   | After                                                                                  |
| ------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `messages:check`          | Passed                                                   | Passed: 322 messages / 2 locales                                                       |
| `check`                   | Passed with 1 warning                                    | Passed: 0 errors, 0 warnings                                                           |
| `lint`                    | Failed: 3 formatted files                                | Passed                                                                                 |
| Vitest                    | 421 passed, 2 failed                                     | 426 passed, 0 failed; 41 files, 13.69 seconds                                          |
| `data:search-names:check` | Not separately reported                                  | Passed: 97 AvatarIDs at the pinned commit                                              |
| `data:validate`           | Passed with 544 known TextHash warnings                  | Passed with the same 544 known warnings; 1,144 records per locale / 190 English shards |
| Product baseline          | Homepage tagline failed                                  | Passed: 7 product areas, 97 characters, 0 differences                                  |
| Playwright smoke          | Did not exist                                            | 5 passed, 0 failed in 5.6 seconds against a reused build                               |
| Full Playwright           | 274 passed, 15 failed, 2 flaky, 3 skipped in 5.2 minutes | 287 passed, 0 failed, 0 flaky, 7 skipped in 1.9 minutes                                |
| `deploy:build`            | Existing contract                                        | Passed unchanged; 97.573 seconds overall, closure scanned 4,375 text files             |
| `deploy:verify`           | Existing contract                                        | Passed independently; closure scanned 4,375 text files                                 |

The three pre-existing Markdown formatting failures in `README.md`, `DEPLOYMENT_ARTIFACT_PIPELINE_AUDIT_R2.md`, and `DEPLOYMENT_STORAGE_AUDIT.md` were normalized with the repository's Prettier configuration.

## 14. Failure-Injection Verification

All injected changes were temporary and were reverted before final validation.

| Injected failure                                                    | Expected gate               | Observed result                                                               |
| ------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| Assigned a number to a typed string in the locale formatter         | Core / `pnpm check`         | Failed with `Type 'number' is not assignable to type 'string'`                |
| Changed the Chinese list-format assertion to an impossible value    | Core / `pnpm test`          | Failed 1 targeted Vitest assertion; 2 sibling tests passed                    |
| Changed a generated homepage fixture without updating its digest    | Data / `pnpm data:validate` | Failed with `Generated artifact digest mismatch: views/zh-CN/homepage.json`   |
| Changed the smoke homepage heading to a nonexistent accessible name | E2E Smoke                   | Failed the `ci-smoke` semantic locator on its first run with retries disabled |

Restored targeted unit, generated-data, and smoke validations passed afterward.

## 15. Remaining Issues

- The 544 missing CHS TextHash warnings are unchanged known data debt; validation remains green and this work does not conceal them.
- Local preview logs still contain expected 404s for Vercel Insights outside Vercel.
- Live `pull_request` triggering, GitHub runner duration, displayed check name, and success/failure status still need verification on the first pushed PR.
- Branch protection/ruleset configuration is manual and remains incomplete until performed in GitHub.
- This PR intentionally does not add a main/release heavy workflow. Full dual-viewport E2E, product baseline, and clean deployment validation remain local/deployment checks pending later evaluation.

## 16. R2-B Readiness

The code-side prerequisites for a PR correctness owner are implemented and locally verified, but R2-B must not begin removing repository correctness work from Vercel Preview yet.

R2-B becomes eligible only after a real pull request demonstrates `CI / Correctness` success and failure behavior on GitHub and both `develop` and `main` require that check through branch protection/rulesets. Until then, the existing `deploy:build` correctness sequence and final artifact contract remain the safety owner and must stay unchanged.
