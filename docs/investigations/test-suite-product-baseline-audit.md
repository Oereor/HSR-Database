# Test Suite / Product Baseline Audit

Date: 2026-09-11  
Repository: `HSR-Database`  
Branch inspected: `develop`  
Scope: investigation only; no production code, test, fixture, script, config, or ignore rule was changed.

Evidence labels used below:

- **Confirmed**: directly established from current source, Git state/history, or an executed check.
- **Strong inference**: supported by multiple repository signals, but not stated as a current normative contract.
- **Unknown**: repository evidence is insufficient; maintainer intent or external platform state is required.

## 1. Executive Summary

### Bottom line

1. **Confirmed — i18n-era infrastructure still exists, but it is mixed with durable coverage.** `tests/unit/i18n-phase1.test.ts`, `tests/unit/i18n-r1.test.ts`, `tests/unit/i18n-r5.test.ts`, and `tests/support/neutral-artifact-projection.ts` were created during the September 6 i18n migration. Their migration labels, old-output absence assertions, translation-equivalence scaffolding, and exact upstream counts are cleanup candidates. The same files also contain durable contracts such as lossless localization, explicit identity, English projection, route parity, and referential integrity; none should be deleted wholesale.
2. **Confirmed — the product baseline began as an i18n migration equivalence gate.** Git history creates the tooling and fixtures in `470041e` (`Complete migration of LC and Relics`), and the R0/R1–R5 reports repeatedly use it to prove unchanged zh-CN semantics across migration slices. R4.5 later removed migration registries and reduced it from 84,066,966 to 41,481,370 bytes, but the surviving baseline still exhaustively freezes most emitted zh-CN product objects.
3. **Confirmed — the baseline still has useful signal, but its present authority is too broad for routine upstream updates.** It catches localized presentation, routes, formatted tokens, asset URLs, Endgame presentation, Homepage output, five representative Search queries, and actionable localization diagnostics. It also freezes exact catalog membership/order, every visible entity payload, historical Endgame groups, incidental list order, and a hard-coded Character count of 97. A legitimate 4.6 addition will therefore fail by design even when all long-term invariants hold.
4. **Confirmed — the current baseline is tracked, not untracked or ignored.** The baseline contains 1,082 files and 41,473,202 bytes (39.55 MiB on disk), all 1,082 are returned by `git ls-files`, `git status --short` is clean, and `git check-ignore` does not match the baseline. The earlier handoff concern about untracked baseline files is stale for current `develop`.
5. **Confirmed — clean-checkout reproducibility is nevertheless broken.** In an archive of `HEAD` with no ignored/generated artifacts, `pnpm product:baseline:check` performed fresh data generation and general asset generation but failed with 8,036 field differences because `scripts/product-baseline/cli.ts` does not run `assets:ensure:enemies`. The expected Endgame `portraitUrl` fields became `undefined`. The same command passes in the maintainer worktree because ignored `static/generated-enemy-assets/` already exists.
6. **Confirmed — CI masks that baseline lifecycle defect.** `.github/workflows/ci.yml` runs `pnpm ci:prepare` before `pnpm test`; `ci:prepare` runs `assets:ensure:enemies`, and `pnpm test` contains `product-baseline.test.ts`. Thus CI can pass while the advertised standalone `product:baseline:check` cannot run from a clean checkout. Missing fixtures themselves fail loudly with `ENOENT`; they are not auto-generated or silently skipped.
7. **Confirmed — upstream-update PRs currently do not execute the baseline or the main correctness CI.** `update-upstreams.yml` targets `develop` and runs `pnpm deploy:build`. Current `ci.yml` intentionally triggers only for PRs targeting `main`, and `deploy:build` does not call the product baseline or Vitest. The historical R2-A document saying update PRs naturally enter CI is no longer current after commit `ebca109` removed `develop` from the CI trigger.
8. **Confirmed — meaningful same-layer duplication exists.** The 2,148-line `site.spec.ts` retains Search, Endgame, Enemy, asset-fallback, locale, and navigation journeys later covered by dedicated E2E files. There is also duplicate negative architecture coverage for removed root/neutral generated outputs in `i18n-r1.test.ts` and `data-cache.test.ts`. The five-case `ci-smoke.spec.ts` is an intentional smaller CI gate and should not be considered redundant with the full browser suite.
9. **Strong inference — the next cleanup can remove most of the 41.5 MB exhaustive baseline and a modest number of tests, but only after replacement invariants land.** The largest immediate win is not raw test count; it is replacing more than 1,070 per-domain/per-entity baseline files with focused relationship, route, localization, numeric-domain, and schema checks plus a small set of reviewable product goldens. Migration helper/negative assertions and overlapping full-E2E journeys are secondary reductions.

### Recommended disposition

Do not delete the baseline immediately. First make the canonical clean-check path self-contained, extract the valuable hard invariants, retain a small representative product regression set, then retire the exhaustive i18n equivalence baseline. Upstream counts and inventories should become versioned health diagnostics rather than timeless hard product contracts.

## 2. Current Test Architecture

```text
upstream.lock.json
  -> scripts/ci/prepare.ts or scripts/deployment/prepare.ts
  -> pinned TurnBasedGameData + StarRailRes under .upstream/ (CI/deploy)

scripts/data/sync.ts
  -> src/lib/generated/views/{zh-CN,en}/**
  -> static/generated/{zh-CN,en}/**
  -> data/audit/latest.json

scripts/assets/ensure.ts
  -> src/lib/generated-assets/**
  -> static/generated-assets/**

scripts/assets/enemies/ensure.ts       (separate lifecycle)
  -> static/generated-enemy-assets/**

scripts/product-baseline/capture.ts
  reads all of the above generated data, audit summary, general asset manifest,
  and the enemy portrait map
  -> in-memory ProductBaselineCapture

scripts/product-baseline/fixtures.ts
  <-> tests/fixtures/product-baseline/zh-CN/** (tracked authority)

scripts/product-baseline/compare.ts
  -> field-by-field / positional-array differences
  -> data/audit/product-baseline/diff.json (ignored diagnostic)

package scripts
  product:baseline:check  -> fresh data:sync + general assets:ensure + compare
  product:baseline:update -> same capture + destructive fixture rewrite, reason required
  product:baseline:search:update -> Search-only authorized update

Vitest (`pnpm test`)
  -> unit/domain tests
  -> architecture/source-shape tests
  -> product-baseline.test.ts (compares the existing generated cache; no fresh prepare)

Playwright
  -> ci-smoke.spec.ts for the main-PR CI gate
  -> desktop/mobile full E2E suite for local/manual regression

CI / deployment
  main PR CI -> messages -> ci:prepare -> check/lint/test/data validation/build/smoke
  upstream update PR to develop -> deploy:build only
  deploy:build -> prepares data + enemy/general assets + build + artifact verification
  neither deploy:build nor build directly invokes product:baseline:check
```

The central lifecycle mismatch is that `captureProductBaseline()` consumes enemy portrait output, but `product:baseline:check` prepares only data and general assets. `ci:prepare` and `deploy:build` know about the separate enemy-asset stage; the baseline CLI does not.

## 3. Fixture / Baseline Inventory

### Authoritative or test-owned files

| Item | Path | Git status / size | Generator | Consumer | Purpose | Recommendation |
|---|---|---:|---|---|---|---|
| Product baseline metadata | `tests/fixtures/product-baseline/zh-CN/metadata.json` | Tracked; 143 B | `product:baseline:update` and Search-only update | baseline reader/check/test | Format version, locale, last approval reason | **KEEP** while any baseline remains |
| Character baseline | `.../characters/` | Tracked; 98 files; 18,216,506 B | full baseline update | CLI check and `product-baseline.test.ts` | Exact catalog order, full zh-CN catalog/detail DTOs, presentation booleans/routes | **REPLACE WITH FOCUSED INVARIANT**; retain only representative product goldens if desired |
| Light Cone baseline | `.../light-cones/` | Tracked; 170 files; 1,883,460 B | full baseline update | same | Exact membership/order, full localized detail/stats/tokens/routes/fallbacks | **REPLACE WITH FOCUSED INVARIANT** |
| Relic baseline | `.../relics/` | Tracked; 62 files; 213,349 B | full baseline update | same | Exact sets/order/details/pieces/effects plus complete property catalog | **KEEP BUT SIMPLIFY**; piece/FK/token rules already have focused coverage |
| Enemy baseline | `.../enemies/` | Tracked; 629 files; 1,271,718 B | full baseline update | same | Catalog fields, visible IDs/routes/default/selector data, plus opaque semantic hashes for templates/monsters/skills/stats | **REPLACE WITH FOCUSED INVARIANT**; opaque hashes are not reviewable product behavior |
| Endgame baseline | `.../endgame/` | Tracked; 119 files; 19,876,029 B | full baseline update | same | All four modes, all historical groups, full rendered view, enemy joins/assets, boundary recommendations | **REPLACE WITH FOCUSED INVARIANT**; retain a small current/boundary regression matrix |
| Homepage baseline | `.../homepage.json` | Tracked; 8,406 B | full baseline update | same | Current selection/cards/routes/images/navigation/messages/empty states | **KEEP BUT SIMPLIFY**; small and visible, but avoid duplicating message-source ownership |
| Search baseline | `.../search.json` | Tracked; 2,983 B | full or Search-only update | same | Five representative queries and compact results/evidence | **KEEP**; already rationalized and reviewable |
| Localization summary | `.../unresolved-localization.json` | Tracked; 608 B | full baseline update | same | Classification completeness, zero program errors, actionable count and sample | **REPLACE WITH FOCUSED INVARIANT** for hard zero/completeness rules; move counts/samples to health diagnostics |
| Section heading component fixture | `tests/fixtures/SectionHeadingFixture.svelte` | Tracked; one small source fixture | Hand-maintained | `tests/unit/shared-ui.test.ts` | Renders heading levels in component unit tests | **KEEP** |
| Neutral artifact projection helper | `tests/support/neutral-artifact-projection.ts` | Tracked; 110 lines | Hand-maintained allowlists | only `i18n-phase1.test.ts` | Removes localized containers to compare migration-era “neutral” semantics | **RETIRE AFTER CONFIRMATION** after its two durable numeric/identity assertions are rewritten directly |

### Generated / diagnostic artifacts

| Item | Path | Git semantics / observed size | Generator | Consumer | Purpose | Recommendation |
|---|---|---:|---|---|---|---|
| Product diff | `data/audit/product-baseline/diff.json` | Ignored by `data/audit/*`; 3 B after passing check | baseline CLI, on pass and failure | Maintainer only | Full field-level diagnostic | **KEEP** as generated diagnostic; document that it is not authority |
| Latest data audit | `data/audit/latest.json` | Ignored; observed 72,478,087 B | data sync/validation | baseline localization capture and several unit tests | Detailed missing-text/schema/data diagnostics | **KEEP BUT SIMPLIFY** lifecycle; required generated input, not a fixture |
| Other audit captures/logs/screenshots | `data/audit/**` | Ignored; 35 files / ~85 MB observed including `latest.json` | historical investigations/checks | mostly no executable consumer | Forensic/diagnostic artifacts | **SAFE TO RETIRE** selectively when their report has captured the evidence; preserve `latest.json` generation contract |
| Generated product data | `src/lib/generated/**`, `static/generated/**` | Ignored; 2,123 files / ~383 MB observed | data sync/ensure | runtime, tests, baseline capture, build | Build-time cache/output | **KEEP** as generated cache, never baseline authority |
| General asset output | `src/lib/generated-assets/**`, `static/generated-assets/**` | Ignored; 2,155 files / ~119 MB observed | `assets:ensure` | runtime/build/baseline Homepage capture | Build-time asset output | **KEEP** |
| Enemy asset output | `static/generated-enemy-assets/**` | Ignored; 212 files / ~16 MB observed | `assets:ensure:enemies` | runtime and baseline Endgame capture | Downloaded/generated portrait map and WebP files | **KEEP**, but fix orchestration dependency before deleting local caches |
| Playwright outputs | `playwright-report/`, `test-results/`, `coverage/` | Ignored | Playwright/Vitest tooling | Maintainer/CI artifact handling | Diagnostics only | **SAFE TO RETIRE** locally when no longer needed |
| Build/tool caches | `build/`, `.svelte-kit/`, `.vite/`, `.upstream/` | Ignored | build/deployment preparation | build, preview, CI/deploy | Reproducible cache/output | **KEEP** as generated artifacts; safe to clean through the existing allowlisted clean command |

No `tests/**/__snapshots__/` directory and no Vitest snapshot file was found. The product baseline is custom snapshot infrastructure rather than framework-managed snapshots.

## 4. Product Baseline Deep Dive

### 4.1 Origin and historical intent

- **Confirmed:** commit `470041e23245685a44c128c5964cf36f0fd31e27` created `scripts/product-baseline/**`, `tests/unit/product-baseline.test.ts`, and the initial fixture tree in a commit explicitly titled `Complete migration of LC and Relics`.
- **Confirmed:** `docs/investigations/i18n-l10n-r0-product-baseline-2026-09-06.md` describes it as the semantic/rendered baseline needed before architecture rewrite, and R1–R5 reports use zero differences to gate each migration slice.
- **Confirmed:** R4.5 deliberately removed migration registries, exhaustive Search, Character icon ownership, and raw unresolved entries. It states that no “migration-era baseline authority” remained, but it retained the zh-CN product baseline as an authoritative observable-behavior gate.
- **Conclusion:** its **origin is migration equivalence (Confirmed)**; its **current stated intent is long-term zh-CN product regression (Confirmed)**; whether exhaustive all-entity freezing remains maintainer policy after the milestone is **Unknown** and is the central decision for cleanup.

### 4.2 Scripts and data flow

`package.json` exposes three commands:

| Command | Writes tracked fixtures? | Preparation | Result |
|---|---:|---|---|
| `pnpm product:baseline:check` | No | `data:sync`, then `assets:ensure` | Reads tracked fixtures, captures current output, writes ignored `diff.json`, fails on any semantic difference |
| `pnpm product:baseline:update -- --reason "..."` | Yes | same | Deletes and recreates the entire baseline root; refuses an empty reason |
| `pnpm product:baseline:search:update -- --reason "..."` | Yes, metadata + Search only | same | Refuses the update if any non-Search difference exists |

Inputs are generated locale views, Search output, the general visual-asset manifest, the separate enemy portrait mapping, `data/audit/latest.json`, runtime domain/view functions, navigation configuration, and compiled zh-CN site messages. Output is the tracked fixture tree. Comparison recursively checks all object keys and compares arrays by position; missing/extra fields and order changes are hard failures. The only excluded comparison field is `metadata.approvalReason`.

### 4.3 Lifecycle classification

The baseline is a **checked-in source of truth**, not a cache. The diff is a **generated diagnostic artifact**. Generated product/asset data is a **cache/input materialized before comparison**. These responsibilities are conceptually separate, but current orchestration mixes them:

- `product:baseline:check` claims fresh capture authority but omits one required generator.
- `product-baseline.test.ts` reuses whatever ignored generated cache is present and does not prove freshness itself.
- CI makes that unit contract reproducible only because `ci:prepare` runs earlier in the same job.
- Local `pnpm test` and `pnpm data:validate` are not clean-checkout entry points; they assume prior preparation.

### 4.4 Missing baseline behavior

**Confirmed from source:** `readProductBaselineFixtures()` calls `readFile()` for metadata, every catalog order, every listed entity, four fixed Endgame modes, and the three root JSON files. There is no `ENOENT` catch, generation, fallback, or skip. Therefore:

- missing root/metadata -> immediate `ENOENT` failure;
- missing catalog-order file -> immediate failure;
- missing entity listed in order -> immediate failure;
- extra unlisted entity file -> ignored by the reader, although a normal generator update rewrites the entire directory;
- clean clone contains the baseline because it is tracked.

This behavior is appropriate for an authoritative expected output. The correctness defect is not missing fixture tracking; it is missing preparation of an ignored input consumed by the capture.

### 4.5 What is actually frozen

#### Characters, Light Cones, and Relics

The baseline retains the full catalog entry and nearly the full generated detail object for every entity, including localized strings, formatted token arrays, stats, profiles, relationships already protected elsewhere, fallback state, and exact catalog order. Character files dominate at 18.2 MB; the largest single file is `characters/entities/1415.json` at 616,097 bytes.

Useful long-term signal: routes, required displayed identity, valid numeric/stat shapes, safe text tokens, presentation fallbacks, stable explicit relationships.  
Incidental upstream state: exact number of entities, exact membership/order, every wording/token for all historical entities, and full payload equality after a legitimate upstream addition.

#### Enemies

R4.5 removed registry files but `captureEnemies()` still builds content registries and stores SHA-256 references such as `templateRef`, `monsterRefs`, and `defaultMonsterRef` in each visible entity. Registry values are not included in the fixture. A stat, skill, summon, or template change therefore appears as an opaque hash replacement rather than the changed semantic field. This is compact but poorly reviewable and is closer to an implementation digest than a product-visible contract.

#### Endgame

Every group stores a full `buildGroupView()` presentation. In addition, each group is assigned the complete mode-wide `periods` array. One period/schedule change is therefore repeated in every group fixture for that mode. Commit `199b7f0` demonstrates this amplification: a MoC schedule fix changed 58 group/recommendation files. The baseline also stores all historical groups and exact group order.

Useful signal: schedule boundary resolution, selected encounter identity, explicit enemy joins, route validity, HP/speed/toughness domains, localized mechanics, current/upcoming behavior, portrait fallback.  
Incidental/duplicated state: the same mode-wide period list copied into every group, full historical presentation dumps, exact archive lengths/order, and fields already validated by Endgame domain/view tests.

#### Homepage, Search, and localization health

- Homepage is small and reviewable, but exact localized messages duplicate message catalogs as source of truth.
- Search has already been reduced to five representative queries and is appropriately scoped for a product golden.
- Localization capture correctly hardens classification completeness and zero program errors, but exact actionable counts/samples are upstream health observations and should not make ordinary upstream additions fail unless required/reachable fallback semantics are violated.

### 4.6 Determinism and reviewability

Positive findings:

- Object keys are canonicalized with `localeCompare(..., 'en')`.
- JSON is deterministic and excludes `undefined`.
- Endgame recommendation time is fixed at `2026-09-05T00:00:00Z` plus explicit begin/end boundary timestamps.
- No absolute paths, random values, or generation timestamps were found in the fixture schema.
- Per-entity files bound diffs better than one 41 MB monolith.

Weaknesses:

- Arrays are positional, so incidental ordering is authoritative.
- Exact catalog membership/order and a CLI assertion of exactly 97 Characters guarantee churn on legitimate upstream additions.
- Enemy content digests hide which internal semantic field changed.
- Endgame duplicates mode-wide period data across every group.
- Full localized token trees produce large diffs whose product consequence can be hard to identify.
- `writeProductBaselineFixtures()` removes the whole fixture directory before rewriting it. The command is reason-gated and explicit, but interruption can leave a partial local baseline; Git can recover tracked state.

## 5. Test Redundancy Findings

### 5.1 Confirmed same-layer E2E overlap

`tests/e2e/site.spec.ts` predates the specialized suites and has grown to 2,148 lines / 60 tests. Later dedicated suites cover the same product surfaces at the same browser layer:

| Overlap | Evidence | Recommendation |
|---|---|---|
| Search behavior | `site.spec.ts` includes global Search URL/history, category cards, Endgame occurrences, shard races, layout, and identity tests; `search-v2.spec.ts`, `search-artwork.spec.ts`, and localization E2E later own Search failure/retry/long-result/artwork/locale behavior | Assign each journey to one file; remove exact same-layer duplicates after assertion-by-assertion review |
| Endgame navigation/presentation | `site.spec.ts` includes Endgame Search/display and character/enemy links; `endgame.spec.ts` has 29 direct Endgame journeys; `localization-correctness.spec.ts` loops all locales/modes and repeats mode/season/enemy navigation | Keep domain-specific UI composition in `endgame.spec.ts`, locale preservation in localization E2E, and remove route-only duplicates |
| Enemy detail/overview | `site.spec.ts` has Enemy catalog/rank/weakness/assets/layout; `enemy-detail.spec.ts`, `overview-icons.spec.ts`, and localization E2E repeat rank, direct navigation, icons, and fallback behavior | Retain one owner for rank copy, one for detail interactions, one responsive icon matrix |
| Shared layout/navigation | `site.spec.ts` includes mobile navigation, detail heading/hero/grid/layout checks; dedicated `navigator.spec.ts` and `shared-detail-navigation.spec.ts` cover the same components more explicitly | Move residual unique assertions, then retire duplicate broad journeys |

This is real redundancy because both sides are Playwright product integration tests, not different unit/architecture/E2E responsibilities.

### 5.2 Intentional overlap that should stay

- `ci-smoke.spec.ts` deliberately samples five critical journeys on one project while the full suites cover depth and responsive matrices. The Playwright configuration excludes smoke from desktop/mobile projects. This is a separate gate/latency responsibility: **KEEP**.
- Unit filter/domain tests and browser interaction tests may mention the same behavior but protect different failure layers: **KEEP** unless their assertions are literally implementation duplicates.
- The compact five-query Search baseline and Search unit/E2E tests have different golden/domain/integration roles: **KEEP**, with one clear owner per assertion.

### 5.3 Duplicate architecture absence checks

`i18n-r1.test.ts` verifies that old root Light Cone, Relic, Character, and neutral Character artifacts are absent. `data-cache.test.ts` verifies the schema-43 dual-locale tree and absence of neutral/source staging and root compatibility output. These are the same architecture boundary at the same unit/file-system layer. Consolidate into the latter/currently named cache/output contract, then retire the R1-specific duplicates.

### 5.4 Duplicate baseline execution

The CLI check and the first `product-baseline.test.ts` case call the same capture, fixture reader, and comparator. Their difference is lifecycle: the CLI performs partial fresh preparation and writes diagnostics; the unit test consumes the existing cache. Keeping both currently creates two notions of authority. After fixing preparation, prefer one canonical contract invocation plus small unit tests for comparator/fixture safety behavior.

## 6. Migration-only Candidates

| Candidate | Migration goal complete? | Durable coverage inside? | If removed now | Recommendation |
|---|---:|---:|---|---|
| `tests/support/neutral-artifact-projection.ts` | Yes | Only indirectly: numeric/resistance fields should remain locale-neutral | Loses the synthetic check that localized labels do not alter selected structure | **RETIRE AFTER CONFIRMATION**; rewrite those few assertions against explicit domain DTO invariants first |
| `i18n-phase1.test.ts`: neutral projection case | Yes | Growth/resistance numeric invariance | Loses useful numeric invariance if deleted wholesale | **REPLACE WITH FOCUSED INVARIANT** |
| `i18n-phase1.test.ts`: arbitrary-label identity comparisons | Yes | Strong durable identity/provenance rule | Loses protection against name-derived relationships | **KEEP BUT SIMPLIFY** and rename out of migration phase terminology |
| `i18n-phase1.test.ts`: all-source-skill synthetic parity | Yes | Enemy policy fail-closed and locale-neutral inclusion are durable | Loses broad policy drift detection | **KEEP BUT SIMPLIFY**; separate policy/inclusion invariant from translation-equivalence loop |
| `i18n-phase1.test.ts`: exact 40 triggers, 8,167 occurrences | Yes | Explicit trigger/Endgame identity is durable | Loses identity checks, but exact counts cause false failures on upstream growth | **REPLACE WITH FOCUSED INVARIANT** using completeness/uniqueness/reference resolution rather than counts |
| `i18n-r1.test.ts`: removed migration copies | Yes | General absence of duplicate authority remains architectural | Coverage remains in `data-cache.test.ts` | **SAFE TO RETIRE** after consolidation is verified in the same change |
| `i18n-r1.test.ts`: Relic identity/tokens and ExtraEffect registry | Yes | Yes | Would lose explicit FK/uniqueness rules | **KEEP BUT SIMPLIFY** and rename by domain contract |
| `i18n-r5.test.ts`: dual-locale/TextMap projection | Yes | Yes, central long-term localization contract | Would lose English completeness, no-CHS-fallback, safe TextMap semantics | **KEEP BUT SIMPLIFY**; remove exact upstream counts/schema literals unless independently meaningful |
| Exhaustive zh-CN product baseline | Original migration complete | Yes, but mixed with incidental state | Immediate deletion would lose broad visible regression coverage | **REPLACE WITH FOCUSED INVARIANT**, then retire exhaustive fixtures |
| Historical ignored i18n audit captures | Yes | No executable consumer found; reports preserve conclusions | Loses only local forensic detail | **SAFE TO RETIRE** when present and no active investigation needs them |

No active production compatibility branch or persisted old pre-i18n output tree was found. Current tests assert that those outputs are absent, rather than using them as live comparison sources.

## 7. Long-term Invariants Worth Preserving

The following baseline signals should become explicit validators/tests before exhaustive fixtures are retired:

1. **Required localization resolution:** every required, emitted, product-reachable `TextRef` is either resolved in its own locale or produces an explicit allowed fallback state; invalid references/description parameters/category-D program errors are zero.
2. **No cross-locale fallback:** English projection never silently substitutes CHS game data; localized projections preserve the same stable semantic IDs and explicit relationships.
3. **Explicit FK integrity:** Character skill/progression/trace/eidolon/ExtraEffect relations, Relic pieces/properties, Enemy template/monster/skill/summon relations, and Endgame enemy occurrence references resolve exactly once.
4. **Generated route integrity:** every catalog/Search/Endgame target href resolves to a generated public entity/route for the same locale; no dangling IDs or locale loss.
5. **Asset reference integrity:** required generated asset URLs exist in the appropriate manifest; allowed missing assets carry a reachable accessible fallback and do not block build. Enemy portraits must use the enemy-asset preparation lifecycle explicitly.
6. **Schema drift detection:** reject unknown required discriminants/fields where code cannot safely interpret them, but report additive supported fields/enums as actionable diagnostics instead of whole-output snapshot churn.
7. **Numeric/stat domains:** finite/parseable decimal values, non-negative counts, valid level/promotion boundaries, unique ordered levels, resolvable HP/toughness/speed calculations, and explicit status/reason for missing values.
8. **Endgame integrity:** mode/group/encounter/stage/wave ownership, explicit occurrence identity, recommendation boundary behavior, schedule ordering, generated group routes, and current/upcoming/history classification.
9. **Search model integrity:** every indexed document and Endgame target has a valid stable identity/category/locale/route; representative ranking/alias/failure/retry contracts remain focused tests.
10. **Small product goldens:** retain reviewable fixtures for a deliberately chosen Character, Light Cone, Relic, Enemy, Endgame current/boundary case, Homepage, and five Search queries where exact rendered semantics are genuinely review-required.

Assertions that should not survive as timeless contracts:

- exactly 97 Characters, 169 Light Cones, 60 Relics, 628 Enemies, 1,144 Search documents, 190 targets, 8,167 occurrences, or 184 Relic pieces without a product-semantic reason;
- exact complete catalog membership and ordering across an upstream version bump;
- all historical rows and localized text/token payloads frozen by default;
- opaque registry/content hashes whose underlying changed field is unavailable in the diff;
- the complete mode-period list duplicated into every Endgame group fixture;
- exact internal registry shape or generated-cache layout beyond the small public architecture boundary;
- bounded diagnostic sample identity when only completeness/error count is contractual.

## 8. Clean Checkout / Reproducibility Findings

### Executed clean-archive experiment

An isolated `git archive HEAD` was expanded under ignored `data/audit/maintenance-10-clean-check/checkout`. It contained all 1,082 tracked baseline files, zero generated product files, no build output, and only the tracked `data/audit/.gitkeep`. Existing sibling upstream repositories were mounted by absolute `HSR_DATA_ROOT` / `HSR_ASSET_ROOT`; no sibling file was changed. The temporary checkout was removed after evidence collection.

Observed results:

| Command / condition | Result | Interpretation |
|---|---|---|
| `pnpm messages:check` | Passed; 324 messages / 2 locales | Message compilation is self-contained after dependencies exist |
| `pnpm data:validate` before preparation | Failed `ENOENT` on `src/lib/generated/manifest.json` | Not a clean-checkout entry point; requires data preparation |
| `pnpm test` before preparation | Sandbox/esbuild config-loading failure in the nested archive | Inconclusive for missing generated data; current tests clearly contain import-time/generated-file consumers and CI prepares them first |
| `pnpm product:baseline:check` | Failed after fresh data/general asset generation: 8,036 differences, expected enemy `portraitUrl` -> `undefined` | **High-priority confirmed reproducibility defect:** hidden dependency on ignored enemy-asset output |
| Same baseline command in current maintainer worktree | Passed: 97 Characters, seven areas, zero differences | Existing ignored `static/generated-enemy-assets/` masks the defect |

The standalone baseline failure is deterministic from the source graph:

```text
captureEndgame()
  -> loadEnemyPortraitMap()
  -> static/generated-enemy-assets mapping

product baseline runFreshGeneration()
  -> data:sync
  -> assets:ensure
  -X no assets:ensure:enemies
```

### Fresh-clone command semantics

| Entry point | Depends on tracked baseline? | Depends on ignored/generated state? | Clean behavior |
|---|---:|---:|---|
| `pnpm messages:check` | No | Generates Paraglide output | Self-preparing |
| `pnpm data:validate` | No | Yes: generated manifest/data/audit | Fails until `data:sync`/`data:ensure`/`ci:prepare` |
| `pnpm product:baseline:check` | Yes | Yes: data, general assets, enemy assets | Attempts preparation but currently omits enemy assets and fails clean |
| `pnpm check` | No | Generates messages/Svelte metadata; source checks may import generated message code | Passed in the prepared worktree |
| `pnpm lint` | No | No required test artifact | Current HEAD fails Prettier on two tracked JSON files; ESLint itself passes |
| `pnpm test` | Yes, through one test | Yes: many generated data/audit/assets consumers | Reproducible in CI only after `ci:prepare`; current prepared worktree passes |
| `pnpm build` | No direct baseline dependency | `prebuild` ensures data and general assets; missing enemy assets are allowed to degrade | Current prepared worktree passes |
| `pnpm deploy:build` | No | Self-prepares pinned data, enemy assets, general assets | Source graph and unit tests confirm no baseline invocation |
| `pnpm deploy:build:clean` | No | Deletes allowlisted generated output then calls deploy build | Designed as self-preparing; not executed in this audit due external checkout/download cost |

Therefore the answer to “delete all ignored/untracked artifacts, then run canonical checks” is **no** for the current command set. The CI-specific sequence is closer to reproducible because `ci:prepare` is an undocumented prerequisite of tests/data validation and supplies the missing enemy assets. The standalone major-change baseline command remains incorrect in that environment.

## 9. Git / Ignore Findings

1. **Confirmed:** all 1,082 product baseline files are tracked; the full `tests/fixtures` inventory is 1,083 tracked files including `SectionHeadingFixture.svelte`; there are zero disk-only fixture files.
2. **Confirmed:** no `.gitignore`, `.git/info/exclude`, global excludes file, or Git attribute suppresses the product baseline. `git check-ignore` exits non-match for its metadata file.
3. **Confirmed:** `.prettierignore` excludes `tests/fixtures/product-baseline`, intentionally preserving canonical fixture output and avoiding formatting churn. This is not a Git ignore rule.
4. **Confirmed:** `.gitignore` line `data/audit/*` ignores diagnostics while preserving `data/audit/.gitkeep`. This covers `latest.json`, baseline `diff.json`, historical logs, captures, scripts, and screenshots. The rule is intentionally broad for generated audits, but it can retain stale local evidence and conceal machine-history dependencies if a consumer reads an audit file without first regenerating it.
5. **Confirmed:** generated data/general assets/enemy assets are separately ignored. The split is legitimate for build artifacts, but orchestration must declare all three generators wherever a fresh capture consumes them.
6. **Strong inference:** the original “untracked baseline” observation likely referred either to a pre-commit migration worktree or to ignored `data/audit`/generated inputs. Current history shows the baseline was added in `470041e`; no present untracked fixture supports the claim.

## 10. Recommended Cleanup Plan

### Phase 1 — repair lifecycle and name authorities

- Make one documented preparation owner for clean local checks.
- Ensure the canonical product regression path prepares enemy assets before capture.
- Decide whether `pnpm test` is intentionally a prepared-workspace command or should invoke a lightweight prerequisite; document the choice.
- Separate authoritative tracked fixtures from generated diagnostics in naming/docs.
- Restore a green formatting baseline for the two tracked JSON files in a separately authorized maintenance change.

### Phase 2 — add focused hard invariants

- Add required TextRef, explicit FK, route target, asset reference, numeric-domain, schema-drift, Endgame identity/schedule, Search target, and cross-locale parity validators.
- Failure messages must identify domain/entity/path and the broken relation, not only a digest or giant JSON diff.
- Keep upstream counts/new enums/inventory changes as diagnostics unless they violate a stated supported-domain rule.

### Phase 3 — shrink and retire migration baseline authority

- Select a small representative product-golden matrix and document why each exact output needs review.
- Stop freezing complete catalog order/membership and all historical localized payloads.
- Remove opaque Enemy digest references or replace them with explicit targeted invariants.
- Remove duplicated `periods` data from every Endgame group golden.
- Once replacements are green, retire the exhaustive per-entity baseline and reason-gated whole-tree updater.

### Phase 4 — consolidate migration and duplicate tests

- Rename durable assertions out of `i18n-phase1` / `i18n-r1` / `i18n-r5` milestone names and group them by current contract.
- Retire `neutral-artifact-projection.ts` after direct invariants replace it.
- Consolidate old-output absence assertions into one generated-artifact architecture test.
- Give Search, Endgame, Enemy detail, shared layout, and locale navigation one owner each in the full E2E suite; preserve the separate CI smoke gate.

### Phase 5 — 4.6 update drill

- Run from a true clean checkout with pinned 4.6 candidates.
- Require generation, focused invariants, unit/domain tests, main product E2E smoke, build, deploy verification, and selected full E2E.
- Verify that legitimate added rows create health diagnostics but not mass failures.
- Inject representative broken FK, missing required TextRef, dangling route, missing required asset, invalid numeric value, and unsupported schema discriminant; confirm each produces one actionable failure.
- Confirm both upstream repositories and protected metadata remain unchanged.

## 11. Risk Matrix

| Candidate | Cleanup confidence | Coverage lost if removed now | Replacement needed | Risk |
|---|---:|---|---|---|
| Historical ignored audit captures with no consumer | High | Forensic detail only | No, once findings are documented | Low |
| Duplicate R1 old-output absence assertions | High | None if `data-cache.test.ts` remains | Consolidation proof | Low |
| `neutral-artifact-projection.ts` | Medium-high | Locale-neutral numeric/identity comparison | Direct DTO/domain invariants | Medium |
| Exact counts in i18n tests/CLI | High | Detects any upstream membership change, including legitimate additions | Completeness, uniqueness, minimum/domain support diagnostics | Low-medium |
| Duplicate same-layer E2E journeys in `site.spec.ts` | Medium | A missed unique selector/interaction assertion | Assertion ownership map before deletion | Medium |
| Enemy opaque baseline hashes | High | Broad change detection, poor diagnosis | Explicit monster/template/skill/stat FK and schema validators | Medium |
| Full Character/Light Cone localized dumps | Medium | Accidental visible wording/token regression across every entity | Small golden sample + token/localization invariants | Medium-high |
| Full Endgame historical presentation dump | Medium | Broad schedule/view/enemy-join regression detection | Current/boundary goldens + Endgame relational/schedule/route validators | High |
| Entire product baseline tooling immediately | Low | All broad zh-CN semantic regression detection | All Phase 2 replacements and representative goldens | Critical |
| `ci-smoke.spec.ts` | Very low | Main-PR browser safety gate | Not applicable | Critical; keep |

## 12. Proposed 4.6 Readiness Test Set

### Hard-fail generation and validation

1. Pinned source/asset commits and required sparse paths are present.
2. Supported schema discriminants and required fields parse; unknown required variants identify the source table/record/field.
3. Every required product-reachable localization reference resolves in the requested locale; no CHS fallback enters English game data.
4. All explicit FKs resolve exactly once; duplicate IDs and dangling Character/Relic/Enemy/Endgame relationships fail.
5. All generated catalog/Search/Endgame routes resolve to same-locale public targets.
6. Required assets resolve; optional assets expose explicit unavailable state and accessible fallback.
7. Numeric/stat values satisfy domain rules and retain exact decimal strings where required.
8. Endgame schedules, recommendation boundaries, occurrence identities, stages/waves, and enemy joins are internally consistent.
9. Search documents/targets/shards have valid stable identity and route/model relationships.
10. Generated artifact manifests/digests match the files produced in the same run.

### Focused unit/domain contracts

- Text parsing/interpolation/token safety and invalid-state handling.
- Character progression/skill/ExtraEffect ownership and level-stat boundaries.
- Relic piece identity/property/effect-token integrity.
- Enemy inclusion policy, template/concrete ownership, stat/skill/summon resolution, fail-closed schema handling.
- Endgame view composition, schedule edges, occurrence identity, HP/toughness/speed domains.
- Search normalization, official/player aliases, ranking classes, retry/cache behavior, target resolution.
- Locale registry, route counterpart behavior, message parameter contracts, and EN/zh-CN structural parity.
- Architecture boundaries preventing browser access to raw Config/TextMaps/sibling repositories.

### Small reviewable product regressions

- Homepage in zh-CN and EN.
- One representative entity per domain, plus deliberately selected enhanced/servant/fallback cases.
- Current/upcoming Endgame and begin/end boundary cases for each mode; no full historical archive dump.
- Five representative Search queries (the current compact fixture is a good base).
- EN changelog rendering, language switch/path-query-hash preservation, Search result navigation, and asset fallback.

### Upstream health diagnostics, not automatic contract failures

- row/document/target/occurrence counts and deltas;
- optional missing TextHashes and bounded samples;
- new enum/discriminant observations that are not product-reachable;
- asset inventory additions/removals;
- catalog/order changes;
- localized wording/token churn without unresolved required references.

This model makes normal 4.6 additions visible without requiring a 41 MB rebaseline, while broken references, projection gaps, invalid domains, and dangling user routes fail with precise diagnostics.

## 13. Commands / Evidence

### Repository and history inspection

- `git branch --show-current`, `git status --short`, `git status --ignored`
- `git ls-files tests/fixtures`, disk-vs-index comparison
- `git check-ignore -v`, `.git/info/exclude`, `core.excludesFile`, `git check-attr`
- `git log`, `git log --diff-filter=A`, `git show --stat`, and targeted history for baseline, i18n tests, E2E suites, and CI trigger changes
- `rg` across `package.json`, scripts, tests, workflows, configuration, and docs
- PowerShell file count/size and test line/case inventories

### Executed validation in the current prepared worktree

| Command | Result |
|---|---|
| `pnpm product:baseline:check` | Passed; fresh data sync, cached general/enemy assets available, 97 Characters / seven areas / zero differences |
| `pnpm data:validate` | Passed; known 544 missing CHS TextHash warnings; 1,144 Search records per locale; 190 English Endgame shards |
| `pnpm check` | Passed outside the sandbox config-loader restriction; 0 Svelte errors / 0 warnings; script typecheck passed |
| `pnpm test` | Passed outside the sandbox config-loader restriction; 43 files / 462 tests |
| `pnpm build` | Passed; static adapter wrote `build/` |
| `pnpm lint` | Failed at Prettier stage on tracked `data/search/character-official-names.generated.json` and `upstream.lock.json` |
| direct `eslint .` via local binary | Passed with no output |

`pnpm deploy:build`, `pnpm deploy:build:clean`, and the full Playwright suite were not run. They are expensive and may prepare/download external state; their baseline involvement was established directly from their scripts/workflows and the complete Vitest suite includes their orchestration contract tests. The production build and CI smoke/full-E2E source topology were inspected.

### Clean-archive evidence

- Archive contained 1,082 baseline files and no generated/build artifacts.
- `messages:check` passed.
- `data:validate` failed before preparation with missing generated manifest.
- `product:baseline:check` failed with 8,036 missing enemy portrait URL differences after its own advertised preparation.
- The nested-archive `pnpm test` attempt was invalidated by Windows sandbox/esbuild parent-directory access restrictions and is not used as proof of a product failure.
- Temporary archive/junction artifacts were removed. A pnpm dependency directory disturbed by the temporary junction experiment was restored from the frozen lockfile; no tracked file changed.

Final Git checks showed the website, `TurnBasedGameData`, and `StarRailRes` worktrees clean. Upstream HEADs remained `TurnBasedGameData@8dc7843723cf6f2d6acafee0b3fb152c90994208` and `StarRailRes@d226befe3db13f2ec15f4161d5f34b1b607643fe`.

## 14. Open Questions

1. **Unknown — exact product-golden policy:** does the maintainer want every historical zh-CN wording/token change to require explicit review forever, or only representative high-risk surfaces? Repository history establishes the former during migration, not the desired post-migration boundary.
2. **Unknown — GitHub branch protection:** current files prove that CI only triggers for `main` PRs, but repository rulesets may independently block merging upstream-update PRs into `develop`. External GitHub configuration was not inspected.
3. **Unknown — canonical local entry point:** should maintainers always run `ci:prepare` before `test`/`data:validate`, or should a single local verification command own preparation? Current docs and scripts expose both prepared-only and self-preparing commands without one unambiguous clean-check contract.
4. **Unknown — enemy asset availability policy for baseline checks:** should a local baseline check download/ensure enemy portraits, validate only manifest references, or exclude optional portrait URLs from the hard product golden? The current implementation accidentally relies on cache history and does not encode the decision.
5. **Unknown — acceptable 4.6 health thresholds:** counts should generally be diagnostic, but maintainers may want explicit lower bounds or maximum-drop thresholds for selected public domains. Those thresholds require product policy, not inference from current 4.5 counts.
