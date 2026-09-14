# Production Code Hygiene Audit

调查日期：2026-09-14  
调查对象：live local repository（`develop` / `568b1b208bad4842660b889a56758a0a4ba8b965`）  
性质：只调查；未实施 production/test cleanup

## 1. Executive Summary

当前 production/build code **不存在 significant 的整文件/整子系统 dead code**。`src/lib` 的 TypeScript 模块和 Svelte 组件都能追到 runtime、build、generator、test 或明确的手工维护入口；SvelteKit 文件路由、Changelog 的 `import.meta.glob`、动态 deployment imports 也均有当前职责。

高置信、低风险的清理集中在 **6 个完全没有 live consumer 的声明**，约 80 行：旧遗器中文类型表、迁移期 neutral skill progression type、旧 Endgame route-path builder、未使用的 Navigation type、旧元素标签 helper、旧的“分类并本地化”Enemy skill resolver。它们主要来自初始实现、Enemy/i18n 重构及 R6 route inventory 建立前后。

另有三类适合小范围 implementation review 的债务：

1. `Enemy.weaknesses` 顶层兼容投影仍被 generator/baseline/validator 自我维持，但 detail runtime 已以 `defaultMonster` 为 authority；
2. i18n 迁移保留了 `SITE_NAME`、`NAVIGATION_ITEMS`、`getProductionLocale`、`TextSource` 等 active compatibility names；
3. Search V2 performance script 仍被文档引用，但读取已移除的旧 catalog 路径，当前无法按文档执行。

不应碰的 intentional duplication 包括 locale-neutral domain → 每 locale 独立 projection、Character/Enemy/Relic 的语义独立转换、Endgame 各 mode 的 typed model、一般资产与 Enemy 远程资产的不同 failure/lifecycle contract，以及 `ScheduleDataChallengeMaze`/`ScheduleDataGlobal` 的 typed multi-source 解析。

建议下一轮 cleanup 维持小 diff：先删除 6 个 confirmed dead declarations，再修维护脚本，最后逐项迁移 compatibility surface；不要开启模块合并或 Search/i18n/Endgame redesign。

## 2. Live Repository Baseline

| Item | Live value |
|---|---|
| Branch | `develop`（跟踪 `origin/develop`） |
| Starting HEAD | `568b1b208bad4842660b889a56758a0a4ba8b965` — `Clean-up obsolete baseline and tests` |
| Working tree at start | clean |
| Working tree before report | clean |
| `TurnBasedGameData` | `main...origin/main`，clean（用命令级 `safe.directory` 只读检查） |
| `StarRailRes` | `master...origin/master`，clean（同上） |

与旧材料相比，live repository 已发生关键变化：M1-A3/A4 已把 product baseline 压缩并删除大量 migration-era tests；R6 已采用 `src/lib/generated/views/{locale}`；manifest route inventory 已成为 prerender/sitemap source；MoC 1034/1035 的手工处理已在 `199b7f0` 中由普通 multi-source schedule pipeline 取代。

与本审计最相关的近期提交：

- `568b1b2`：删除 obsolete baseline/tests，说明旧测试存在不能作为当前 production consumer 证据。
- `e88d5fa`：删除 obsolete baseline files。
- `199b7f0`：修复 MoC schedule，明确删除 1034/1035 special process。
- `9b82700`、`0b4c40a`：建立公开双 locale routing/projection 与兼容别名。
- `e525498`、`ff9fd39`：Enemy normalized model 与 detail presentation 演进。
- `dce6fff`：Search V2/FlexSearch 路径及性能脚本的最初版本。

本报告是本次唯一新增文件；未改 production/test behavior。

## 3. Audit Method

实际覆盖 `src/lib/**`、`src/routes/**`、`scripts/**`、`.github/workflows/**`、root executable configs、`package.json`、现行 architecture 文档与相关 tests。

方法包括：

- `rg`/exact-symbol search：声明、imports、string paths、dynamic imports、TODO/legacy/compatibility 关键词；
- module/component tracing：逐一检查 `src/lib` TS/Svelte 文件是否有 consumer；
- package/workflow/deployment tracing：核对每个 CLI/generator/asset/deploy entry；
- generated producer/reader tracing：核对 `views/{locale}`、static Search、Endgame shards、manifest routes；
- Git history：`git log -- <file>`、`git blame`、`git show` 验证模糊候选的引入和替代原因；
- static/runtime sanity：TypeScript/Svelte check、ESLint、unit tests、data validation、production Vite build；
- SvelteKit convention review：保留 `+page*`、`+server.ts`、params matchers、hooks 等无普通 import 的 entry；
- dynamic loading review：保留 Changelog `import.meta.glob` 与 deployment/product-baseline lazy imports。

`tsconfig.json`/`tsconfig.scripts.json` 没有开启 `noUnusedLocals` 或 `noUnusedParameters`；ESLint 的 recommended rules 能发现普通局部 unused，但 exported declarations 被视为 module API。因此本报告不把 clean ESLint 等同于无 dead export。

## 4. Candidate Inventory

| Candidate | Path / Symbol | Historical role | Current consumers | Evidence | Classification | Suggested action |
|---|---|---|---|---|---|---|
| Old relic slot Chinese table | `src/lib/domain/constants.ts:19` `relicTypeNames` | Initial CHS presentation authority | none | exact symbol only at declaration; locale projection owns labels now; present since `5a06e8d` | SAFE TO REMOVE | Delete declaration |
| Orphan neutral DTO | `src/lib/domain/neutral.ts:81` `NeutralSkillProgression` | R2 neutral-model migration | none | exact symbol only at declaration; introduced in `470041e` and never connected | SAFE TO REMOVE | Delete interface |
| Old route list builder | `src/lib/server/endgame.ts:297` `getEndgameRoutePaths` | Pre/R6 Endgame route construction | none | exact symbol only at declaration; route entries use `getEndgameGroupEntries`; manifest routes own inventory | SAFE TO REMOVE | Delete function |
| Orphan inferred type | `src/lib/navigation.ts:107` `NavigationItem` | Public navigation type convenience | none | exact symbol only at declaration | SAFE TO REMOVE | Delete type alias |
| Old element projection helper | `scripts/data/enemy-detail.ts:221` `normalizedElementLabel` | Original Enemy localized element adapter | none | exact symbol only at declaration; projection now lives in `projection/enemy.ts` | SAFE TO REMOVE | Delete function and now-unused imports if any |
| Old combined Enemy skill resolver | `scripts/data/enemy-skill-policy.ts:134` `resolveEnemySkillSource` | Classified semantics and resolved localized copy together | none | exact symbol only at declaration; history/docs describe pre-neutral architecture; `classifyEnemySkillSource` + locale projection replaced it | SAFE TO REMOVE | Delete function and now-unused imports |
| Top-level Enemy weaknesses projection | `src/lib/domain/types.ts:319`, `projection/enemy.ts:359` | Detail/Endgame compatibility after Enemy normalization | generator, validators, compact baseline; not detail runtime | `buildEnemyDetailPageData` consumes canonical monsters; catalog builder still destructures compatibility field | PROBABLY OBSOLETE | Build catalog from `defaultMonster.weaknesses`, migrate fixture/validator, bump schema if required |
| Search performance harness | `scripts/investigations/search-performance.ts:20` | Search V2 benchmark | `docs/search-v2.md` manual entry | still reads removed `src/lib/generated/catalogs/*.json`; current path is `views/{locale}/catalogs` | KEEP BUT SIMPLIFY | Repair path/locale/placeholder assumptions and add a smoke preflight |
| Base-locale constants | `SITE_NAME`, `NAVIGATION_ITEMS` | pre-i18n call sites and compact baseline | baseline capture and unit tests | current production UI uses locale-aware functions | KEEP BUT SIMPLIFY | Migrate baseline to explicit locale functions, then remove duplicated constants |
| Build compatibility aliases | `getProductionLocale`, `TextSource` | staged i18n migration names | sync, projection, investigation scripts, tests | multiple active imports; alias comments match reality | KEEP BUT SIMPLIFY | Rename consumers in a dedicated mechanical change |
| 80 file-local exported symbols | concentrated in `domain/endgame*.ts`, `domain/types.ts`, `domain/neutral.ts` | broad internal schema surface | only their defining file | exact symbol has no cross-file consumer, but most compose current internal models | PROBABLY OBSOLETE | Optionally remove `export` modifiers only; do not delete declarations |
| Generated compatibility-path measurement | `scripts/data/measure-generated.ts:30` | prove old outputs remain absent | `data:measure` package command | directory helper is also called on file paths and reports `{0,0}` for a file because `readdir(file)` is swallowed | KEEP BUT SIMPLIFY | Use a file-aware existence/stat check; keep absence assertions |

## 5. SAFE TO REMOVE

### 5.1 Six dead declarations

The six declarations listed above meet the high threshold:

- no live direct import or same-file call/type reference;
- no re-export or barrel consumer (the project has no general barrel export surface);
- no dynamic import/string reference;
- no package/workflow/deploy entry role;
- no generated producer/reader role;
- no current test import or unique contract;
- not a SvelteKit filename convention;
- history shows either an old implementation or a type introduced during a migration and never wired.

Estimated removal: 6 declarations, roughly 80 lines plus a few imports. Runtime/build risk is very low. The highest-risk item in this otherwise safe set is `getEndgameRoutePaths`, so its cleanup should still run build + sitemap/prerender coverage.

No complete file is classified SAFE TO REMOVE. In particular, manual scripts referenced by package scripts or current docs are not orphan files.

## 6. KEEP BUT SIMPLIFY

1. **Search performance harness** — its capability remains documented and useful, but R6 moved catalogs under `views/{locale}`. Repair rather than delete.
2. **Base-locale presentation constants** — `SITE_NAME` and `NAVIGATION_ITEMS` duplicate locale-aware functions only to support compact zh-CN baseline/tests. A behavior-preserving cleanup can make the baseline request `zh-CN` explicitly.
3. **Compatibility names** — `getProductionLocale = getPublicLocale` and `TextSource = BuildTextProvenance` are genuine aliases with many current consumers. Rename callers before deletion; do not remove first.
4. **Generated measurement** — retain checks for removed namespaces, but make file checks meaningful instead of passing a path to a directory-only walker.
5. **Asset resolver layers** — injected-manifest `resolve*Asset` functions provide validation/test seams, while `get*Url` wrappers provide runtime defaults. The pattern is repetitive but not dead; if simplified, preserve injection and fail-closed behavior.

## 7. KEEP — INTENTIONAL

- Search normalization, semantic evidence classification and deterministic ranking remain necessary after FlexSearch; FlexSearch supplies recall, not naming authority or final ordering.
- Locale-neutral domain models and per-locale projections intentionally duplicate traversal structure to prevent translated strings from becoming domain identity and to prohibit EN → CHS fallback.
- Character, Light Cone, Relic and Enemy transformers share shapes but have different upstream schemas and semantics. Presentation unification does not justify domain unification.
- MoC/PF/AS/AA models and UI sections remain mode-specific. Their mechanics and failure contracts differ.
- `ScheduleDataChallengeMaze` plus `ScheduleDataGlobal` support is config-faithful. Commit `199b7f0` added exact-ID, ambiguity and boundary validation after removing the 1034/1035 special process.
- `getEndgamePeriodFallbackName` is the shared valid-unknown-period presentation path and is used both in locale projection and runtime view construction.
- General StarRailRes assets and Enemy portrait assets are separate by design: local indexed assets versus a remote/cacheable/fail-soft Enemy pipeline.
- Enemy missing-portrait fallbacks, asset manifest validation, atomic publication, and deployment clean allowlists are safety boundaries, not obsolete workarounds.
- Changelog locale files with no direct imports are loaded by `import.meta.glob`; SvelteKit route and matcher files are convention consumers.

## 8. PROBABLY OBSOLETE / UNKNOWN

### Probably obsolete

- **`Enemy.weaknesses` top-level detail field.** Runtime detail view derives from `defaultMonster`, while generator/validator/baseline keep the duplicate field alive. Removing it changes serialized artifact shape and compact baseline, so it is not SAFE despite strong architectural evidence.
- **Many file-local `export` modifiers.** A scan found 80 symbols whose only live references are inside their defining file (18 in `domain/endgame.ts`, 10 each in `domain/neutral.ts` and `domain/endgame-view.ts`, 11 in `domain/types.ts`, remainder spread across small modules). De-exporting is likely safe, but the value is cosmetic and schema-boundary intent is not recorded consistently. Review by module, not as an 80-symbol bulk edit.

### Unknown

- Whether maintainers still use `data:measure` and Search performance measurement outside documented/package entry points cannot be proven from Git. This affects whether to repair or retire them, not whether current runtime is correct.
- Whether internal exported domain types are intentionally kept for ad-hoc investigation scripts outside the repository. The package is private and exposes no package API, but external local consumers cannot be ruled out from repository evidence alone.

## 9. Search V2 Findings

No live old handwritten scorer, flattened-label path, 80-result cap, pre-FlexSearch index helper, result adapter or deprecated Endgame scan path was found.

Current architecture is coherent: generated `SearchDocument` data is normalized/versioned; FlexSearch returns document keys; `bestSearchEvidence` classifies canonical/official/player names and exact/prefix/contains quality; `compareSearchMatches` provides deterministic ordering; Endgame results expand through locale shards. These are complementary responsibilities.

The only concrete Search hygiene issue is the documented performance harness using pre-R6 catalog paths. It is a stale maintenance tool, not a second production search implementation.

## 10. i18n/l10n Findings

No CHS-only runtime resolver, neutral migration adapter, dual TextMap authority, cross-locale fallback or old route-locale accommodation remains in the production route/load path.

Canonical contracts are active and should remain:

- URL-derived locale via Paraglide/SvelteKit hooks;
- unprefixed `zh-CN`, `/en` for English;
- explicit locale parameter for generated loaders;
- independent locale projection and no EN → CHS game-data fallback;
- `localizedHref`/`canonicalHref`/`localeCounterpartHref` as the route boundary;
- Paraglide Site Messages for site-owned copy.

Migration names `getProductionLocale` and `TextSource`, plus base-locale `SITE_NAME`/`NAVIGATION_ITEMS`, are real cleanup targets but currently active. Their comments are not stale; they accurately flag transitional ownership.

## 11. Endgame Findings

No live 1034/1035 conditional, ID arithmetic, year cutoff, allow/deny list, manual visibility intervention, `recommendationEligible`, or old ScheduleDataChallengeMaze-only assumption was found.

The present schedule resolver accepts typed source sets, performs exact ID matching, rejects cross-source ambiguity, and requires a single explicit begin/end boundary. `ScheduleDataGlobal` is used only where supported (currently MoC); PF/AS keep their own schedule tables. This is intentional.

Unnamed periods, including 1035, use the shared localized fallback. Old groups such as MoC 101/900 and PF 2001 appear in tests because the live data model intentionally supports historical data; they are not evidence of obsolete branches.

Confirmed Endgame cleanup is limited to unused `getEndgameRoutePaths`. The manifest route inventory and SvelteKit entries already provide the current route generation path.

## 12. Domain Findings

### Character

No old DTO, recommendation bridge or character-specific name-matching classifier was found. Neutral extraction, skill classification and locale projection remain separated. `NeutralSkillProgression` is an isolated migration type and can be deleted.

### Light Cone

No orphan adapter or duplicate active projection was found. Preview versus portrait asset functions correspond to different UI payloads and must remain distinct.

### Relic

`relicTypeNames` is a dead CHS table superseded by locale projection policy. Relic set, piece and property asset resolvers serve distinct generated namespaces; do not merge them by shape alone.

### Enemy

`resolveEnemySkillSource` and `normalizedElementLabel` are pre-neutral/pre-projection remnants with no consumers. The current `classifyEnemySkillSource` and `projection/enemy.ts` path is authoritative. `defaultMonsterId` and `defaultMonster` are active variant-selection contracts. Only the duplicated top-level `weaknesses` projection is probably obsolete.

## 13. Data / Generation / Asset Pipeline Findings

No orphan generated producer, orphan reader, second canonical preparation path or legacy output writer was found. Package scripts, CI and deployment converge on `data:ensure`/`data:validate`, asset ensure/verify, and manifest-backed loaders. Removed root compatibility outputs are explicitly checked by tests/measurement rather than produced.

The canonical readers use `src/lib/generated/views/{locale}` and `static/generated/{locale}`. Endgame source occurrence shards stay private and the SvelteKit generated endpoint enriches public shards with portraits, matching the architecture document.

General and Enemy asset pipelines should remain separate. Both validate manifests and missing files, but only Enemy assets include remote transport/cache/retry/temporary-file cleanup. Their apparently duplicate existence checks protect different publication contracts.

`measure-generated.ts` should be corrected during tooling cleanup because its directory walker silently treats a file path as empty. This does not affect production generation or validation.

## 14. Routing / UI Shared Findings

All SvelteKit route files and params matchers have convention consumers. No duplicate route helper with identical current semantics was found. `getEndgameRoutePaths` is the exception: manifest routes and `getEndgameGroupEntries` cover current consumers.

All shared Svelte components have at least one live importer; no orphan component or global CSS class was identified. Repeated Character/Light Cone/Relic/Enemy card shells reflect domain-specific props and are not candidates for a broad UI merge. `SectionHeading`, `GameText`, semantic icon labels, detail navigation and fallback surfaces have live consumers and tests.

## 15. TODO / Comment Findings

No production `TODO`, `FIXME`, `HACK`, `remove later` or contradictory completed-work comment was found.

| Comment group | Classification | Reason |
|---|---|---|
| `SITE_NAME` / `NAVIGATION_ITEMS` base-locale compatibility | still actionable | accurately describes current baseline-only consumers |
| `getProductionLocale` compatibility alias | still actionable | active in sync/investigation/tests |
| `TextSource` legacy provenance name | still actionable | active across sync and projections |
| `Enemy.weaknesses` deprecated compatibility projection | still actionable | duplicate serialized field remains |
| `measure-generated` removed compatibility paths | intentional current check | paths should remain absent; measurement implementation needs repair |
| Test variables/comments named `legacy` | intentional historical coverage | exercise supported old game data/schema rejection, not dead production paths |

## 16. Proposed Cleanup Plan

### Phase 1 — confirmed dead declarations

Delete the six SAFE declarations, remove imports made unused, and keep each domain in a small commit. Do not mix formatting or schema changes.

### Phase 2 — maintenance tooling

Repair Search performance catalog paths and explicit locale handling; add an early file-existence diagnostic. Correct `data:measure` file-versus-directory measurement. These changes do not alter product behavior.

### Phase 3 — active compatibility aliases

Migrate `TextSource` → `BuildTextProvenance` and `getProductionLocale` → explicit `getPublicLocale`; make baseline capture call locale-aware Site/navigation functions with `zh-CN`; then delete aliases/constants. Keep this separate from generated schema work.

### Phase 4 — optional generated schema cleanup

Decide whether to remove `Enemy.weaknesses`. If approved, build catalogs directly from `defaultMonster`, update validators/types/baseline intentionally, and document the artifact schema impact.

### Phase 5 — optional API-surface tightening

Review file-local exports module by module. Remove only `export` modifiers; do not inline or merge domain types merely to reduce counts.

## 17. Risk Matrix

| Candidate | Confidence | Runtime risk | Build/deploy risk | Test coverage | Cleanup recommendation |
|---|---:|---:|---:|---|---|
| Six dead declarations | High | Low | Low | indirect check/build; some replacement paths strongly covered | Phase 1 |
| Search performance stale path | High | None to product | Low, manual tooling only | no script smoke test | Phase 2 repair |
| `data:measure` file handling | High | None to product | Low, diagnostic only | none focused | Phase 2 repair |
| Base-locale constants | High that duplication exists | Low | Low–medium due baseline | direct baseline/unit coverage | Phase 3 migration |
| `getProductionLocale` / `TextSource` | High that aliases are transitional | Low if mechanical | Medium across generator | data/unit coverage | Phase 3 migration |
| `Enemy.weaknesses` | Medium-high | Low if catalog preserved | Medium due serialized data/schema | validator + compact baseline | Phase 4 after approval |
| 80 file-local export modifiers | Medium | None at runtime | Low | typecheck/build | Optional; low value |
| Search ranking/normalization | High KEEP | High if removed | High | focused Search tests + E2E | Do not remove |
| Endgame typed multi-source/fallback | High KEEP | High | High | focused unit/data/E2E | Do not remove |
| Separate locale/domain/asset pipelines | High KEEP | High | High | broad | Do not merge broadly |

## 18. Validation Strategy for Cleanup

For Phase 1:

```text
pnpm check
node node_modules/eslint/bin/eslint.js .
pnpm test
pnpm exec vite build
```

Add `pnpm data:validate` when removing either data helper to prove no hidden generator effect. For `getEndgameRoutePaths`, inspect prerender output/sitemap and run the Endgame route unit/E2E subset.

For Phase 2, run the repaired measurement command against a production preview and verify its output path; add a focused unit test for file/directory existence measurement.

For Phase 3, run `pnpm data:validate`, `pnpm product:baseline:check`, Search metadata tests, localization correctness tests, full unit tests and production build. The baseline command performs `data:sync`, so run it only in an implementation task where generated rewrites are expected and reviewed.

For Phase 4, additionally run `pnpm data:sync`, inspect manifest/schema diffs, `pnpm product:baseline:check`, Enemy/Endgame/Search focused tests, E2E smoke and full production build. Run deployment verification if artifact paths or manifest fields change.

### Commands executed during this audit

| Command | Result |
|---|---|
| `pnpm check` | passed: 0 Svelte errors/warnings; script TypeScript passed. Vite config initially hit sandbox access errors, then Svelte fallback completed successfully |
| `pnpm lint` | failed at Prettier precheck on 5 pre-existing files: `.github/workflows/vercel-preview.yml`, `data/search/character-official-names.generated.json`, `tests/unit/vercel-config.test.ts`, `upstream.lock.json`, `vercel.json`; no files changed |
| `node node_modules/eslint/bin/eslint.js .` | passed |
| `pnpm test` | first sandbox run could not load Vite config; approved out-of-sandbox rerun passed: 45 files, 476 tests |
| `pnpm data:validate` | passed for source `8dc7843723cf`; 1144 Search records per locale, 190 English Endgame shards; existing classified warnings reported |
| `pnpm exec vite build` | passed; 701 SSR and 688 client modules transformed; adapter-static output produced |

Not run: `pnpm product:baseline:check` because its implementation unconditionally runs `data:sync` and writes diagnostics, contrary to this audit's no-rewrite boundary; full E2E and `deploy:build:clean` were not necessary for consumer tracing. `pnpm build` was replaced with direct `pnpm exec vite build` to avoid prebuild `data:ensure`/asset mutation.

## 19. Open Questions

1. Is the Search V2 performance harness still part of the maintainer's regular release workflow? If yes, repair it in Phase 2; if no, remove both the script and its current documentation together after explicit confirmation.
2. Is the top-level serialized `Enemy.weaknesses` field an external/off-repository artifact contract? No in-repository runtime consumer requires it, but this cannot be disproved from local Git alone.
3. Are file-local exported domain types intentionally consumed by ad-hoc scripts outside this repository? If not, their export modifiers can be narrowed gradually, but this is low-value cleanup.
