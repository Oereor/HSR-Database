# Build Pipeline Architecture Audit & Optimization Proposal — 2026-09-20

## 1. Executive Summary

本轮是架构审计，不是性能事故复盘，也没有实施任何 pipeline、CI、Vercel、资源或数据生成改动。调查基于当前 `develop@9771170`、两份 2026-09-20 performance audit、当前生成产物、构建脚本、GitHub Actions 和 SvelteKit adapter 实现。工作树开始时已有一份未跟踪的 Windows performance audit；本轮保留该文件不动。

### 结论

当前 pipeline 的首要问题不是某一个慢函数，而是**职责边界错误**：可变的 Nanoka discovery/download、不可变 pinned upstream 的 materialization、昂贵的代码正确性审计、build-input 完整性检查和 post-build 输出验证都集中在一次部署中。cache miss 会把这些结构性成本同时放大。

最明确的架构修正是：

1. **Enemy assets 改为主仓库内的 repository-tracked immutable snapshot。** 推荐直接跟踪现有 serving layout：`static/generated-enemy-assets/{index.json,README.md,icons/*.webp}`。不建立独立仓库，不使用 Git LFS，不另设内容相同的 source snapshot。
2. **Nanoka 网络访问全部移到 update workflow。** Production 只验证 tracked snapshot 与当前 enemy catalog 精确一致；缺失、损坏或 manifest 不一致立即失败，不联网修补。
3. **保留 pinned TurnBasedGameData / StarRailRes。** 它们比 `Nanoka latest` deterministic，因为 lock 指向 immutable commit。当前不建议把 361.75 MiB generated data 或 116.20 MiB general assets 全部提交进 Git。
4. **把验证按 failure mode 拆层。** PR CI 保留完整语义验证、cross-locale parity、English CJK audit、脚本/type/unit/E2E；Production 保留 source commit、manifest/digest、tracked enemy snapshot、asset completeness、route/output closure 等 build-input/output integrity。
5. **先修 structural parity 内部重复 projection，再设计共享输入。** `ensure` 与 `validate` 不能简单合并；validator 必须继续从落盘 artifact 独立验证 producer 的输出。

最高优先级的 5 项后续工作：

1. Phase 0：补齐 cache reason、CPU/RSS、文件/字节数和 Vite 子阶段 telemetry，并确认 main branch required CI/保护规则。
2. Phase 1：迁移 tracked enemy snapshot，把 Nanoka 完全移出 Production。
3. Phase 2：一次 structural projection 同时 compare/digest；将 data validation 分成 CI semantic audit 与 Production integrity gate。
4. Phase 3：general assets 按 copy/Sharp 类别引入小规模 bounded concurrency，并消除 ensure/verify 重复扫描。
5. Phase 4：针对 SvelteKit static copy amplification 和 prerender I/O 做独立原型，不减少合法 routes。

建议从 **Phase 0 的安全/可观察性小任务开始，随后立即执行 Phase 1**。Phase 1 的纯耗时收益通常只有约 1–60 秒（取决于 cache/network），但它消除了 Production 对 mutable remote service 的 correctness/availability 依赖，架构收益高于单纯秒数。

---

## 2. Evidence and Current Pipeline Map

### 2.1 当前规模

| Item | Current measured value |
|---|---:|
| Data manifest artifacts | 2,124 |
| Data generated tree | 2,121 files / 361.75 MiB |
| Canonical route paths | 1,077 |
| Public locales | 2 (`zh-CN`, `en`) |
| Build HTML | 2,155 files |
| Build JSON | 2,160 files |
| Final `build/` | 7,235 files / 382.78 MiB |
| General generated assets | 2,248 files / 116.20 MiB |
| Enemy snapshot | 210 WebP + index + README / 15.44 MiB |
| Enemy catalog coverage | 605 mapped + 23 unavailable = 628 |
| Unique enemy images | 210 / 15.343 MiB |
| Enemy WebP median / p90 / max | 73.7 / 103.0 / 152.5 KiB |

这些数字来自当前已生成 workspace，代表该 lock 的一次快照，不是永久产品 baseline。

### 2.2 Production 实际路径

```text
Git checkout
   |
   +-- lock validation
   |
   +-- parallel --------------------------------------------------+
   |    messages:compile (Production) / check:scripts (Preview)   |
   |    prepare TurnBasedGameData [network on cold cache]         |
   |    prepare StarRailRes index [network on cold cache]         |
   +--------------------------------------------------------------+
   |
   +-- Preview only: search-name snapshot check
   +-- data:ensure       [child process; parse/generate/hash/validate]
   +-- data:validate     [new child; reread/rebuild/audit]
   |
   +-- parallel --------------------------------------------------+
   |    enemy ensure [Nanoka latest + 628 details + images]       |
   |    general asset ensure -> verify [StarRailRes + Sharp/I/O]  |
   +--------------------------------------------------------------+
   |
   +-- svelte-kit sync [child]
   +-- vite build [client + SSR + prerender + adapter-static]
   +-- deploy:verify
   +-- route verify
```

标记含义：TurnBasedGameData/StarRailRes 的 remote commit 是 immutable input；Nanoka `latest` 是 mutable input。数据和 general assets 有本地 manifest cache，但 fresh Vercel workspace 没有这些 ignored outputs 时必须全量重建。Vercel cache 可以改善时延，不能成为 correctness source。

### 2.3 Stage responsibility matrix

| Stage | Current responsibility | Input mutability | Network? | Cost shape | Cacheable? | Recommended phase | Decision |
|---|---|---|---|---|---|---|---|
| `lock` | parse repository/commit pins | tracked immutable | no | negligible | no need | Production + CI | keep |
| messages/script checks | compile messages; Preview also TS script check | tracked | no | CPU | task cache | PR CI; Production compile only | split/keep |
| prepare TurnBased | fetch pinned commit, sparse checkout | immutable commit | cold yes | network + 451 MiB checkout | yes by commit | Local/CI/Production | keep, narrow paths |
| prepare StarRailRes | fetch index, then expand sparse paths | immutable commit | cold yes | network + checkout | yes by commit | Local/CI/Production | keep, make one-stage |
| search-name check | validate maintained snapshot | tracked + pinned data | no | CPU/I/O | yes | PR CI/update | Production only if CI trust unavailable |
| `data:ensure` | freshness, generation, publication, artifact validation | pinned source | no after prepare | CPU/RAM/I/O | yes by source/schema | Local/CI/Production | retain producer/integrity role |
| `data:validate` | independent schema/semantic/cross-locale/search/endgame/CJK audit | pinned + generated | no | high CPU/RAM (Windows ~3.2 GiB RSS) | partial | PR CI/update; reduced Production gate | split, do not delete |
| enemy ensure | validate cache, query latest, full sync on miss/stale | mutable latest | yes | request fan-out + image I/O | locally | **Upstream update only** | replace in Production with offline validate |
| general asset ensure | requirements + copy/Sharp generation | pinned commit | no after prepare | native CPU + I/O | yes by commit/schema/fingerprint | Local/CI/Production | keep for now |
| assets verify | source/fingerprint/coverage/metadata | pinned + generated | no | metadata I/O | scan reuse possible | CI + Production integrity | keep; share scan context |
| Svelte sync | generated route/types | tracked + generated | no | CPU/I/O | framework cache | Local/CI/Production | keep |
| Vite build | client/server/prerender/static adapter | deterministic inputs | no | CPU + heavy FS | partial | Production/Preview; PR smoke | keep |
| deploy verify | final reference/file closure | build output | no | I/O | no | Post-build | keep |
| route verify | canonical route/output layout | build output | no | I/O | no | Post-build | keep |

`production-ci-backed` 目前只把 message/script 与 search-name checks 做了差异化；`data:validate`、asset validation 和 output verification仍在两种模式执行。这个方向合理，但还没有完成 failure-mode 分层。

---

## 3. Enemy Asset Architecture

### 3.1 Current behavior and problem

当前路径是 `static/generated-enemy-assets/`，整体被 `.gitignore` 排除。`ensureEnemyAssets()` 会：

- 读取 schema 2 manifest；
- 要求 `monsters + unavailable` 精确覆盖当前 628 项 catalog；
- 检查 canonical filename/URL、WebP signature、Sharp format/dimensions；
- 检查 4 个 sanity IDs；
- cache 完整时仍请求 Nanoka `manifest.json`；
- Nanoka version 变化或 cache 不完整时调用 full sync。

Full sync 读取 `monster.json`，但当前代码**只确认它是 object/array，之后完全不使用其内容**。随后对每个 requirement 请求 `/zh/monster/{id}.json`，按 image ID 去重后下载图片；有效的已有 WebP 会 skip。因此“只获取缺失图片”的 primitive 已存在，但它被包在 Production-time full mapping refresh 中。

Fresh deployment 没有 ignored cache，必然走 `manifest missing -> full sync`。这使完全相同的 Git commit 可以随 Nanoka availability/latest 内容得到不同结果或失败，不符合可重复部署。

### 3.2 Storage option comparison

| Option | Extra copy before Svelte | URL/code churn | Git content | Boundary clarity | Verdict |
|---|---:|---|---:|---|---|
| A. Track final `static/generated-enemy-assets` | 0 | none | 15.44 MiB | name says generated, but README can define snapshot ownership | **recommended** |
| B. Track `assets/enemies` then copy to `static` | +15.44 MiB and 212 files/build | none if copied to old URL | same snapshot plus generated copy | clearest source/output vocabulary | reject: bytes are already final serving form |
| C. New content-addressed/vendor layout | at least one materialization or URL migration | medium/high | similar | flexible provider abstraction | not justified at this scale |

SvelteKit currently materializes the same 131.64 MiB general+enemy static tree three times at build peak:

```text
static/*
   -> .svelte-kit/output/client/*
   -> build/*
```

Measured general/enemy directories have identical file sets and byte sizes in all three locations. Option B would add a fourth physical representation for enemy bytes. Therefore the simplest single-repo design is to keep the current URL-compatible directory and change its status from ignored ephemeral cache to reviewed tracked snapshot.

The word `generated` is no longer ideal, but renaming 605 manifest URLs and consumers provides no architectural benefit. Document it as “generated at update time, immutable at build time.”

### 3.3 Tracked/untracked boundary

Track:

```text
static/generated-enemy-assets/
  README.md
  index.json
  icons/Monster_<imageId>.webp
```

Continue ignoring only atomic temp/backup files (for example `.Monster_*.tmp-*.webp`), not the snapshot directory. Update scripts may write tracked files; Production validator must be read-only.

### 3.4 Manifest target contract

Keep fields with an explicit purpose:

- `schemaVersion`: parser/contract invalidation;
- `source`, `sourceVersion`, `resourceType`: provenance;
- `catalogFingerprint`: canonical hash of sorted current catalog IDs (include names only if name provenance is intentionally part of the contract);
- `monsters`, `unavailable`: exact catalog coverage and TemplateID→image mapping;
- `images[imageId] = { size, sha256 }`: bind manifest to tracked bytes and catch wrong-but-valid WebP efficiently.

Do not store a repeated source URL per image; it is derivable from provider + image ID. A separate tool-version string is unnecessary if schema changes whenever output semantics change. Keep a timestamp only when the snapshot content actually changes; do not update `generatedAt` merely because a scheduled check ran.

Git itself protects object bytes at checkout, but manifest digests make provider/file association testable without trusting Git state and give useful PR diagnostics. Production may do cheap size/hash checks plus current WebP signature/metadata checks; 210 files / 15.3 MiB is small.

### 3.5 Git and LFS assessment

The current snapshot is 15.44 MiB; the 210 WebPs average 74.8 KiB. Ordinary Git is appropriate.

- One initial snapshot is modest even relative to the current unpacked object store (~24.4 MiB) and is tiny compared with generated/build trees.
- Normal updates should add only new/changed image IDs. Unchanged WebPs keep identical Git blobs.
- A pathological full replacement each update would grow history by ~15.3 MiB/version; that is a monitoring threshold, not the observed update model.
- There is no current binary history from which to claim an empirical churn rate. The updater should report added/replaced/deleted bytes per PR; reconsider LFS only if real history shows sustained large replacement churn.

Git LFS would add credentials, local tooling and deployment restore failure modes without solving a current size problem. Do not introduce it now.

### 3.6 Provenance and legal housekeeping

Current generated README records `static.nanoka.cc`, resource type, update command, and explicitly says no upstream license is asserted. Root README acknowledges TurnBasedGameData, StarRailRes and MiHoMo, but not Nanoka. Root disclaimer says game images remain with their rightsholders and the repository MIT license does not cover third-party assets. StarRailRes has a copied AGPL license; no equivalent Nanoka license/NOTICE was found.

Before merging tracked enemy binaries:

1. Add Nanoka to Data Sources/Acknowledgements and link the source service.
2. Keep source version and source hostname in the manifest/README.
3. State explicitly that no redistribution license was confirmed and obtain human approval of redistribution/legal posture.
4. Do not imply the repository MIT license covers these WebPs.

This is a human risk decision, not a blocker to the technical design. The report does not assume the assets are freely redistributable.

---

## 4. Enemy Incremental Update Design

### 4.1 Target algorithm

```text
current generated enemy catalog
            +
tracked manifest + tracked WebPs
            |
            v
validate old snapshot and compute requirement diff
            |
            +-- unchanged ID + confirmed mapping + valid digest/WebP -> reuse
            +-- new ID / retryable unavailable                    -> resolve mapping
            +-- changed mapping                                  -> fetch new imageId if absent
            +-- corrupt/missing referenced file                  -> repair download
            +-- no-longer-referenced image                       -> prune after success
            |
            v
stage manifest/files -> full offline validation -> atomic publish
            |
            v
human-reviewable Git diff / PR
```

Prune should occur only after every operational request succeeds and the staged snapshot validates. Automation may enable prune by default because Git makes deletion reviewable/recoverable, but the PR summary must list removed TemplateIDs/imageIDs. A Nanoka outage must leave the previous tracked snapshot untouched and fail/update no PR; it must not affect Production.

### 4.2 Version semantics and refresh policy

Existing evidence cannot prove that an existing `MonsterTemplateID` keeps the same `image_path` across Nanoka versions. Therefore:

- Same Nanoka version + catalog additions: resolve only new IDs and selected previously unavailable IDs.
- New Nanoka version: refresh mapping for all required IDs unless a future, tested index contract can prove mappings in one response; reuse unchanged valid image files and download only new/changed image IDs.
- Periodic forced full mapping refresh is a safety valve, not a Production action.
- If refresh produces identical mapping, unavailability set and bytes, leave the tracked manifest untouched and produce an empty Git diff. Record the observed latest version in workflow logs/summary, not by churning timestamps.

This can still make hundreds of detail requests when the provider version changes, but they happen in a controlled maintenance job rather than in deployment.

### 4.3 `monster.json` finding

The current sync fetches `/hsr/{version}/monster.json` but discards its contents. Tests deliberately return `[]`, proving no production field depends on it. The task environment could not inspect the live schema reliably because Windows Schannel proxy credentials returned `SEC_E_NO_CREDENTIALS`; no claim about its fields is made.

Next implementation must first capture a reviewed fixture/schema and test whether the index contains ID, name and `image_path`. If yes, target:

```text
one version request + one monster index request
  + exceptional/missing detail requests
  + missing image downloads
```

If not, retain detail requests in update-time sync. Simply removing detail requests based on the filename `monster.json` would be unsafe.

### 4.4 Workflow integration recommendation

Use a combination model:

1. The existing scheduled/manual upstream updater remains the owner of TurnBasedGameData/StarRailRes locks.
2. When TurnBasedGameData changes, generate the new enemy catalog and run incremental enemy sync in the same PR; a new required enemy without snapshot coverage fails that update PR.
3. Also provide a manual/scheduled enemy-only refresh path for Nanoka changes that do not coincide with TurnBasedGameData.
4. Reuse one automation branch/PR when practical; include text summary of version, new/reused/repaired/pruned/unavailable images and byte delta so binary changes are reviewable.

Nanoka unavailability should fail only the sync job. Existing snapshot validation can still pass, but the updater must not falsely mark a requested refresh successful. Bot permissions already allow contents/PR writes in the upstream workflow; binary additions need explicit `git add` scope and existing human review preference must remain.

---

## 5. StarRailRes and General Asset Architecture

### 5.1 Why it is more deterministic

`upstream.lock.json` pins StarRailRes to `d226befe...`. Preparation fetches that exact commit with `--filter=blob:none --depth=1`, sparse checkout is enabled, and manifest validation checks `sourceCommit + schemaVersion + requirementsFingerprint + files/metadata`. A cache miss repeats deterministic transforms from an immutable source.

Nanoka currently starts from `manifest.hsr.latest`; the same site commit at two times can resolve a different provider version. That is the decisive architectural difference.

### 5.2 Acquisition findings

`prepareStarRailRes()` currently performs two sparse sets:

1. `prepareCheckout(..., starRailIndexPaths)` checks out eight index files.
2. It immediately calls `setSparseCheckout(index + asset directories)`.

No consumer runs between these steps. On a fresh partial clone, expanding the sparse set can trigger another checkout/worktree update and lazy blob fetch. The likely historical reason is “validate indexes before materializing optional assets,” but current code does not actually parse/validate indexes between steps. Use the full required path set in the initial `prepareCheckout`, then validate required indexes while treating individual missing asset files through the existing fallback policy.

For TurnBasedGameData, pinned sparse checkout is fundamentally sound. `ExcelOutput/` is overbroad: current checkout contains 2,185 files / 265.90 MiB while consumers name a bounded set of tables. TextMaps are 104.50 MiB and Config paths 80.58 MiB. Replacing `ExcelOutput/` with an explicit maintained table list is a low-risk network/disk optimization if a contract test proves every referenced table is present. Dynamic Config paths need more care and should not be narrowed by guesswork.

### 5.3 What general asset generation does

Current output categories:

| Category | Files | MiB | Operation |
|---|---:|---:|---|
| Character preview | 97 | part of 46.762 | copy |
| Character portrait | 97 | part of 46.762 | Sharp resize + WebP |
| Player avatars | 93 | 2.775 | copy |
| Character detail icons | 1,330 files / 1,547 resolved keys | 7.410 | dedup source; Sharp 64×64 PNG |
| Light-cone preview | 169 | part of 53.083 | copy |
| Light-cone portrait | 169 | part of 53.083 | Sharp resize + WebP |
| Relic icons/pieces/properties | 263 | 6.049 | copy |
| Elements/paths | 16 | 0.071 | Sharp 64×64 PNG |
| Navigation/utility/endgame | 13 | 0.044 | Sharp trim + resize PNG |
| Branding | 1 | 0.004 | copy |

`processRequested()` is `for ... await stat -> await transform`; categories are also invoked sequentially. Manifest cache avoids all regeneration when source commit, schema, requirements and files validate, but ignored outputs do not exist in a fresh deployment.

### 5.4 Track derived general assets?

Do not commit all general assets in the first redesign:

- 116.20 MiB / 2,248 files is ~7.5× the enemy snapshot.
- They are reproducible from a pinned source commit, unlike current enemies.
- Portraits and detail icons are real derived formats; source/output separation has value.
- Upstream and requirements updates can churn many binaries.

Nor is it attractive to track only the 623 obvious copy-only files now: it creates two ownership/invalidation models and still requires StarRailRes for transforms. Reconsider per category only after telemetry shows a stable class dominates cold deployments and measured Git churn is acceptable.

Recommended near-term design remains source-only StarRailRes + deterministic build-time transform, with:

- explicit cache key: StarRailRes commit + asset schema + requirements fingerprint + transform policy/version;
- cache hit followed by existing integrity validation;
- cache miss performing a correct full generation;
- small fixed concurrency pools, not `availableParallelism()` workers.

For copy-only work, file-level concurrency around 4–8 is a reasonable benchmark range. For Sharp transforms, begin at 2 and compare 1/2/4 while recording wall/CPU/RSS/FDs; libvips already has internal concurrency. Preserve requested order in manifest/error reporting. Category-level parallelism is useful only when it does not overlap multiple large portrait streams and inflate memory.

---

## 6. Data Pipeline Architecture

### 6.1 Current work classification

| Work | Class | Current location | Target |
|---|---|---|---|
| parse raw tables/TextMaps, build domains/projections | generation | `data:sync` via ensure | producer in Local/CI/Production |
| write search/endgame/index/artifacts | generation | `data:sync` | producer |
| manifest/source/TextMap/artifact digests | output integrity | ensure + validate | producer postcondition + Production gate |
| schema and generated-file inventory | independent validation | ensure + validate | keep independent validator |
| search/endgame rebuild and compare | independent semantic validation | validate | PR CI/update |
| cross-locale structural parity | cross-locale invariant | sync + validate | producer prepublish + independent PR CI |
| English CJK scan | audit | sync + validate | producer policy check + PR CI; not every Production if CI-backed |
| relation/localization health audits | audit/semantic validation | sync + validate | PR CI/update |
| raw canonical stat/skill recomputation | independent validation | validate | PR CI/update |

Separate child processes currently prevent retained heap from one stage contaminating the next, but force repeated TextMap/raw/artifact parse. Windows measured `data:validate` around 3.2 GiB max RSS; simply merging processes can worsen peak memory even if wall time falls.

### 6.2 Preserve independence while sharing safe work

Allowed to share or cache, keyed by immutable source digests:

- raw file bytes/digests;
- parsed immutable TextMaps/tables;
- indexes over immutable rows;
- already-created structural projections and their digests;
- generated artifact file index/stat results within one orchestration invocation.

Must remain independently checked from disk:

- generated artifact JSON schema/content;
- manifest ↔ actual file inventory/digests;
- current catalog/routes/search/endgame closure;
- locale structural invariants;
- provider/source commit and TextMap digest;
- producer output must not be accepted solely because producer reports success.

A safe target is a shared library with two explicit entry points, not one “trusted ensure”: producer builds and validates its staged output before atomic publish; validator reopens the published artifacts and applies independent contracts. Cross-process acceleration may use a content-addressed parsed-input cache, but every cache record must be keyed/verified by source digest and cache miss must be correct.

### 6.3 Structural parity

The implementation confirms the prior profile: `assertCrossLocaleStructuralParity()` first calls `project(left/right)`, then `digest(left/right)` calls `project()` again. Success therefore walks/allocates both object graphs twice (four projections total), contributing high GC.

Refactor target:

```text
leftProjection  = project(left)
rightProjection = project(right)
compare projections
hash canonical serialization of those same projections
```

Avoid building a second canonical tree; if possible stream canonical serialization/hash from the one projection. Tests must cover admitted localized fields, numeric/identity drift, array order, first-difference paths, digest stability and old/new real dataset parity. This is a medium-risk correctness optimization even though the code change is small.

### 6.4 CI versus Production

Production may omit expensive semantic revalidation only after all of these are true:

- PR CI is required for merges to `main` and cannot be bypassed silently;
- Vercel Production builds exact protected-main commits;
- upstream/update PRs run the same full semantic suite;
- direct/manual Production builds without trusted CI fall back to full validation;
- Production still validates pinned source and all build inputs actually present in its environment.

Recommended split:

- `validate:full` (PR/update/Preview): all current `data:validate` semantics.
- `validate:build-inputs` (trusted Production): source commit, manifest/schema, TextMap/artifact digests, inventories, catalog/route closure and tracked enemy/general asset integrity.
- post-build verify: actual output routes/references/files.

The repository contains a PR CI workflow now, but it triggers only for PRs targeting `main`; the upstream automation PR targets `develop` and compensates by running full `deploy:build`. Branch protection/required-check state is not stored in this repository and must be confirmed in Phase 0.

---

## 7. Build / Adapter I/O

### 7.1 Measured amplification

Current asset bytes appear identically in:

| Location | General | Enemy |
|---|---:|---:|
| `static/` | 116.20 MiB | 15.44 MiB |
| `.svelte-kit/output/client/` | 116.20 MiB | 15.44 MiB |
| `build/` | 116.20 MiB | 15.44 MiB |

SvelteKit first creates the client output; adapter-static then `writeClient(build)` and copies prerendered pages/dependencies/data. Thus generated assets alone account for ~394.9 MiB of simultaneous materialized bytes across those three trees, before upstream/source images and prerendered route data.

The final `build/` is 382.78 MiB. `.svelte-kit/output/prerendered` is 246.52 MiB. The 1,077 canonical route paths × 2 public locales explain 2,154 localized entries; the fallback yields 2,155 HTML files. Trailing-slash layout produces per-route directories/index files and increases mkdir/readdir/stat operations, but it is a routing contract, not a valid target for route reduction.

### 7.2 Recommendation

Do not couple Phase 1 enemy migration to SvelteKit internals. Direct tracked serving assets have the minimum copies possible under the current adapter.

For Phase 4, prototype and measure one change at a time:

- supported adapter/build-output configuration that avoids an unnecessary intermediate copy;
- safe reflink/hardlink only if cross-platform and Vercel packaging semantics are proven;
- narrower verification scans using one indexed file walk;
- Vite/Svelte prerender concurrency and output profile with RSS/FD limits;
- duplicate route payload/storage optimization as a separate product-artifact project.

Do not write directly into undocumented `.svelte-kit` internals, do not symlink deploy output without platform proof, and do not reduce routes.

---

## 8. Vercel Build Cache

Repository-tracked inputs and cache have different roles:

```text
tracked/pinned input = correctness and reproducibility
ephemeral cache      = performance only
```

No current repository configuration proves that `.upstream`, `src/lib/generated`, `static/generated-assets` or enemy assets are restored by Vercel. Dependency/framework caching may occur, but should be observed in logs rather than assumed.

Reasonable cache candidates and keys:

| Directory/artifact | Invalidation key | Miss behavior | Validation on hit |
|---|---|---|---|
| pinned upstream partial checkout | repository URL + commit + sparse-path schema | fetch exact commit | remote, HEAD, sparse config/paths |
| generated data | data schema + TurnBased commit + TextMap/input digests + maintained metadata digest | regenerate | artifact inventory/digests/schema |
| general assets | asset schema + StarRailRes commit + requirements fingerprint + transform policy | regenerate | source commit, coverage, metadata |
| Vite intermediates | lockfile/tool versions + source/generated digests | rebuild | framework-owned |

Do not put the enemy snapshot only in Vercel cache. After Phase 1, it is a tracked build input; a cache miss remains offline and correct.

---

## 9. Correctness Guarantees Inventory

| Guarantee | Current enforcement | Future enforcement if moved |
|---|---|---|
| upstream commit pinned | lock + checkout inspect/assert + manifests | update PR + Production checkout/input gate |
| data schema/artifact inventory/digests | ensure + validate | producer postcondition + independent CI + Production input gate |
| cross-locale structural parity | sync + validate | producer prepublish + full PR CI validator |
| English CJK policy | sync + validate | update/PR CI; trusted Production consumes validated artifacts |
| search index consistency | sync + validate | update/PR CI; Production digest/inventory |
| Endgame validity/shard closure | sync + validate + route verify | update/PR CI + Production output closure |
| enemy catalog coverage | enemy cache validator | update PR + offline PR/Production snapshot validator |
| enemy bytes are valid WebP | signature + Sharp metadata | updater + PR CI + Production input gate; optional sha256 |
| enemy provenance/version | manifest/README | tracked manifest/README + root acknowledgement |
| general asset source/fingerprint | manifest/ensure/verify | unchanged; reuse scan context |
| asset dimensions/formats | Sharp metadata validation | generation postcondition + CI/Production verify |
| missing optional StarRailRes fallback | manifest missing sets + UI fallback | unchanged |
| route completeness | data manifest + Svelte prerender + route verify | Production post-build verify + PR smoke |
| final referenced files exist | deploy verify | Production post-build verify |
| site messages/changelog valid | commands + Vite plugins | PR CI; lightweight buildStart defense remains |
| script/types/tests | Preview/PR CI | required PR CI; not repeated in trusted Production |

No guarantee is intentionally removed. Work that leaves Production must have an explicit PR/update enforcement point and a trusted-main prerequisite.

---

## 10. Proposed Target Pipeline

```text
UPSTREAM / ENEMY UPDATE
  update immutable TurnBased + StarRailRes locks
  prepare pinned sources
  generate data
  incremental Nanoka mapping/image sync into tracked snapshot
  generate/validate general assets
  full data + asset + provenance validation
  produce review summary and PR
                         |
                         v
PR CI (required for main)
  messages/types/lint/unit
  prepare exact pinned upstreams
  deterministic generation
  independent full semantic validation
  offline enemy snapshot validation (no Nanoka)
  general asset validation
  build + route/output smoke/E2E
                         |
                         v
PRODUCTION (protected main commit)
  compile messages
  prepare exact pinned upstreams (cache optional)
  validate tracked enemy snapshot offline
  data ensure + build-input integrity gate
  general asset ensure/verify (cache optional)
  Svelte/Vite build
  route/reference/output verification
```

The long-term option of tracking selected general derived assets remains open, but is not a prerequisite for the target boundary.

---

## 11. Local Developer and Command Model

### Fresh clone

1. Install dependencies.
2. Materialize pinned TurnBasedGameData/StarRailRes through one documented prepare command, or point environment variables at read-only sibling repositories at the pinned commits.
3. Enemy assets require no network: they arrive with Git checkout.
4. Run data/general asset ensure once; subsequent dev starts reuse validated manifests.

### Normal development

`pnpm dev` should remain an “ensure local generated prerequisites, then start Vite” experience. It should not query Nanoka. Current `predev` already omits enemy ensure; tracked snapshot makes this behavior correct rather than accidental.

### Updates

- Upstream changed: explicit `update:upstreams` workflow/command, followed by full generation/validation.
- Enemy changed: explicit `update:enemy-assets`, which is the only normal command allowed to contact Nanoka.
- Production/local read-only validation: `validate:enemy-assets`, never `ensure` with network fallback.

### Command hierarchy

Do not mass-rename scripts for aesthetics. Introduce clear developer-facing orchestration and keep old commands as documented/internal aliases during migration:

```text
prepare:pinned          materialize lock inputs
update:upstreams        mutate lock + dependent snapshots
update:enemy-assets     networked, mutating tracked snapshot
validate:build-inputs   fast deployment integrity
validate:full           expensive independent PR/update audit
build                   deterministic offline application build after prepare
deploy:build            full Production orchestrator
```

Current naming inconsistency is specifically that enemy `ensure` may discover latest/network-sync, while general/data `ensure` primarily means validate-or-generate from pinned input. Fix that semantic boundary; do not rename every historical command.

---

## 12. Failure Modes

| Case | Target behavior | Enforcement |
|---|---|---|
| A. Nanoka offline | Production succeeds if tracked snapshot is valid; update sync fails without modifying snapshot | offline Production validator; atomic updater |
| B. StarRailRes GitHub offline | cold Production currently/future fails because source is not tracked; warm cache may help but is not guaranteed | exact pinned fetch + clear failure; optional verified cache |
| C. TurnBased adds enemy before snapshot update | update PR/PR CI fails; no Production network fallback | catalog fingerprint/exact coverage |
| D. tracked WebP corrupt | updater, PR CI and Production input gate fail before Vite | sha256/size + WebP signature/Sharp metadata |
| E. manifest/file mismatch | same early failure | exact file set and manifest mapping validation |
| F. Nanoka version changes, required output unchanged | updater reports check but leaves Git diff empty; no timestamp/version-only churn | semantic diff before publish |
| G. StarRailRes cache absent | fetch pinned commit and deterministically regenerate | cache-miss correctness path |
| H. CI trust unavailable/direct Production | fall back to full validation mode | explicit mode selection, not optimistic skip |

---

## 13. Optimization Roadmap

### Phase 0 — Observability and safety gates

- **Scope:** stage wall/CPU/resource/RSS; cache hit/miss reason; input/output file+byte counts; Vite client/server/prerender/adapter timing; confirm main branch protection and required CI; fix pnpm executable detection separately if still reproducible.
- **Files:** `scripts/deployment/build.ts`, stage helpers/tests, CI documentation.
- **Benefit:** makes later savings attributable; enables safe CI/Production split.
- **Risk:** low; logging volume/measurement overhead.
- **Tests:** mocked timing/resource tests; two same-commit builds produce identical output digests.
- **Rollback:** remove telemetry calls; no data migration.
- **Success:** every deployment identifies cache reason and resource shape; overhead <1% or <1 s; branch gate documented.

### Phase 1 — Enemy Asset Snapshot Migration

- **Scope:** track current serving snapshot; split networked `update` from offline `validate`; add catalog fingerprint/image integrity metadata; integrate TurnBased-dependent and enemy-only workflow paths; update provenance.
- **Files:** `.gitignore`, `scripts/assets/enemies/{ensure,sync,shared}.ts`, `package.json`, `tests/unit/enemy-assets.test.ts`, update workflow/tests, README/acknowledgements, tracked snapshot.
- **Benefit:** zero Nanoka requests in Production; deterministic/offline deployment; fresh build avoids 628 detail requests and image fetches.
- **Risk:** medium due binary review, manifest migration and unresolved redistribution permission.
- **Prerequisite:** human provenance/legal approval; initial snapshot reviewed.
- **Tests:** Nanoka-offline Production validation; new/missing/corrupt/changed/pruned cases; atomic failure; exact catalog coverage; empty-diff version update; URL compatibility.
- **Rollback:** revert tracking/commands and restore old ensure behavior; no external data store involved.
- **Success:** network-disabled clean checkout reaches enemy validation; missing/corrupt snapshot fails before Vite; no Nanoka hostname appears in Production request logs.

### Phase 2 — Data Validation Deduplication

- **Scope:** remove structural parity double projection; instrument allocations; define `validate:full` vs `validate:build-inputs`; optionally add digest-keyed immutable parse/index cache while preserving independent artifact validation.
- **Files:** `scripts/data/structural-parity.ts`, `ensure.ts`, `validate.ts`, generated-artifact helpers, robustness/data tests, deployment mode tests.
- **Benefit:** lower CPU/GC/RSS; remove inappropriate Production audits only after CI trust.
- **Risk:** medium/high because locale and semantic guarantees are central.
- **Prerequisite:** Phase 0 CI trust and baseline telemetry.
- **Tests:** synthetic mismatch matrix; real old/new projection/digest parity; corrupted producer output caught by validator; full CI suite.
- **Rollback:** retain old full validator and feature-flag/command boundary; caches are disposable.
- **Success:** structural `project` calls halve on success; no digest/output difference; Production integrity gate substantially below current full validate while PR full validation retains all failures.

### Phase 3 — General Asset Generation

- **Scope:** make StarRailRes sparse checkout one-stage; narrow TurnBased Excel paths with a completeness test; add separate bounded pools for copy and Sharp work; share file index/metadata between ensure and verify; evaluate explicit caches.
- **Files:** `scripts/deployment/{prepare,git}.ts`, `scripts/assets/{shared,sync,ensure,verify}.ts`, relevant unit tests.
- **Benefit:** lower cold checkout and 45–65 s general asset generation; fewer redundant stats/metadata opens.
- **Risk:** medium/high from memory, FD and libvips contention.
- **Prerequisite:** Phase 0 native CPU/RSS/FD telemetry.
- **Tests:** concurrency 1/2/4/8 controlled benchmark; byte-for-byte manifest/file-set and decoded metadata parity; deterministic error order; missing fallback.
- **Rollback:** concurrency=1 and old sparse list; generated cache disposable.
- **Success:** ≥25% cold asset wall reduction on reference machines with <20% RSS increase, no FD failures and identical output digests where codecs are deterministic.

### Phase 4 — Vite / Adapter I/O

- **Scope:** profile static copy, prerender and adapter independently; prototype supported copy elimination/reflink or better indexed verification; separately evaluate route payload duplication.
- **Files:** Svelte/Vite config, deployment verification, possibly adapter configuration; no route removal.
- **Benefit:** reduce repeated ~131.64 MiB asset copying and environment-sensitive filesystem work.
- **Risk:** high; framework/platform output semantics and cross-platform filesystems.
- **Prerequisite:** Phase 0 substage telemetry and stable Phase 1 layout.
- **Tests:** clean Linux/Windows builds; Vercel local/Preview output manifest; all 2,154 localized entries + fallback; no symlinks/missing assets; identical public URLs.
- **Rollback:** return to stock adapter-static copy path.
- **Success:** measured lower bytes written/copy time with identical route/file/reference verification; no dependence on warm cache.

### Priority rationale

This ordering considers reproducibility, failure isolation, maintainability and implementation risk—not only seconds. Enemy migration ranks before potentially larger data/Sharp savings because it removes mutable network input from Production. Structural parity is next because it has direct profile evidence and a bounded correctness test surface. Adapter experimentation comes last because it crosses framework/platform boundaries.

---

## 14. Investigation Limitations and Workspace Hygiene

- No Production pipeline, workflow, Vercel setting, `.gitignore`, asset or binary was changed.
- No old/new bisect or historical regression investigation was repeated.
- Live Nanoka schema inspection was attempted through the required local proxy, but Windows Schannel returned `SEC_E_NO_CREDENTIALS`; the report therefore treats index usability and existing-ID mapping stability as unknown.
- Vercel branch protection/cache configuration outside the repository was not observable and is an explicit Phase 0 check.
- General asset transform output was classified from implementation and current files; no concurrency optimization was run.
- Measurements used existing generated/build outputs and read-only filesystem inspection. No temporary download, binary, profile, benchmark output or investigation cache was created.

