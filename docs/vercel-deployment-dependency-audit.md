# Vercel Deployment Dependency Audit

调查日期：2026-09-02（本地 checkout）  
范围：只读调查 `HSR-Database`、`TurnBasedGameData`、`StarRailRes`；未修改业务代码、package.json、pipeline 或上游仓库。

## 1. Executive Summary

- 网站使用 SvelteKit + Vite + `@sveltejs/adapter-static`，`build` 输出纯静态站点到 `build/`；页面和预渲染 endpoint 在运行时不需要 sibling repository、GitHub 或外部 API。
- 两个上游目前都是 **build-time only**：`prebuild` 调用 `data:ensure` 与 `assets:ensure`，读取上游、生成 JSON/图片并将它们编入静态输出。构建完成后可删除两个上游而不影响静态站点运行。
- `TurnBasedGameData` 的真实输入不是整个仓库，而是约 72 个 `ExcelOutput/*.json`、`TextMap/TextMapCHS.json`，以及敌人机制扫描涉及的 `Config/ConfigCharacter/Monster`、对应 `Config/ConfigAbility/Monster` 和 `Config/ConfigAbility/BattleEvent` 文件；应采用 pinned sparse/partial checkout（必要时保守扩大 Config 范围），而非每次下载完整仓库。
- `StarRailRes` 已有按生成目录推导的 allowlist/manifest：当前 97 角色、169 光锥、60 遗器套装、184 遗器部件、18 属性、7 元素、9 命途、6 导航、1 品牌、4 高难图标，共 821 个生成文件、约 111.15 MB。它天然适合 pinned sparse checkout + manifest selective fetch；不建议把 1.22 GB 完整仓库或 `.git` 带入 Vercel。
- 推荐架构：HSR 仓库增加（下一阶段实现）两个上游的显式 SHA lock；构建机按 SHA 获取 TurnBased 的 sparse snapshot 和 StarRailRes 的 sparse/manifest snapshot；运行时只发布 `build/`。不推荐 `latest HEAD`。

## 2. Current Project Architecture

证据：`package.json`、`svelte.config.js`、`vite.config.ts`、`src/routes/+layout.ts`。

| 项目 | 实测结论 |
|---|---|
| Framework/bundler | SvelteKit 2.70.2、Svelte 5.56.8、Vite 7.2.4 |
| Adapter/output | `@sveltejs/adapter-static`，`fallback: '404.html'`，输出 `build/` |
| Package manager | pnpm 11.9.0（`packageManager`）；Node `>=22`，pnpm `>=10`；TypeScript 5.9.3 |
| App model | 静态预渲染（SPA fallback + prerendered HTML/data），不是生产 SSR server |
| Server runtime | 无持久 server runtime；源码中的 `+page.server.ts`/`+server.ts` 在 build/prerender 阶段读取已生成文件 |
| External runtime | 无 GitHub、上游仓库或外部 API；唯一浏览器 fetch 是本地 `/generated/endgame-occurrences/...` |

实际 scripts：`dev`、`predev`、`build`、`prebuild`、`preview`、`check`、`lint`、`test`、`test:e2e`，以及 `data:{audit,sync,validate,ensure}`、`assets:{sync,ensure,validate,verify,clean}` 等；没有独立 `generate` script，生成由 `data:sync`/`assets:sync` 完成。

## 3. Current Build Pipeline

```text
HSR_DATA_ROOT=../TurnBasedGameData       HSR_ASSET_ROOT=../StarRailRes
             |                                      |
      data:ensure -> data:sync (when stale)   assets:ensure -> assets:sync (when stale)
             |                                      |
 src/lib/generated/*.json, static/generated/search.json   static/generated-assets/*
             \                                      /
                 vite build + SvelteKit prerender
                              |
                         build/ (static)
```

关键代码：`scripts/data/paths.ts`/`raw.ts`/`sync.ts`；`scripts/assets/paths.ts`/`shared.ts`/`sync.ts`；`svelte.config.js`。

## 4. TurnBasedGameData Dependency Audit

### 4.1 访问点

| 文件 | function/script | 用途 |
|---|---|---|
| `scripts/data/paths.ts` | `resolveDataRoot`, `assertDataRoot`, `sourceCommit` | 解析 `HSR_DATA_ROOT`，检查输入，读取 `git rev-parse HEAD` |
| `scripts/data/raw.ts` | `readRaw`, `readTable` | 以 lossless JSON 读取 `ExcelOutput/*.json` |
| `scripts/data/localization.ts` | `loadTextMap` | 读取 `TextMap/TextMapCHS.json` |
| `scripts/data/sync.ts` | `syncData` | 合并角色 LD 表、解析角色/光锥/遗器/敌人/文本并生成站点 JSON、manifest、审计 |
| `scripts/data/endgame.ts` | `loadTables`, `findAbilityBody`, `scanMechanics` | 读取 Endgame Excel 表及敌人 Config/Ability；扫描 BattleEvent layout/body |
| `scripts/data/ensure.ts` | top-level ensure | 按生成 manifest 的 `sourceCommit` 决定是否重生成 |
| `tests/unit/*`、investigation scripts | fixtures/checks | 测试和调查也可读取 sibling；不属于 production runtime |

### 4.2 实际读取范围

- `ExcelOutput`：同步脚本的固定表集合 + `character-sources.ts` 中 8 个 LD 表；Endgame 额外加载 schedule、tierce、stage/infinite、boss extra 等表。当前 checkout 可核对到 **72 个实际存在的 Excel 文件，72,840,542 bytes（约 69.4 MiB）**。
- `TextMap/TextMapCHS.json`：51,518,878 bytes（约 49.1 MiB），是唯一实际加载语言表；其他 28 个 TextMap 文件不在当前生成路径中。
- 敌人机制的动态 Config（由 `MonsterTemplateConfig.JsonConfig` 追踪）：538 个 `Config/ConfigCharacter/Monster` 文件、3,818,568 bytes；330 个对应 `Config/ConfigAbility/Monster` 文件、42,163,525 bytes；`Config/ConfigAbility/BattleEvent` 当前扫描目录 254 文件、19,596,262 bytes。动态引用可能随上游 schema 扩大，以上是本 checkout 的实测直接集合。
- 未发现读取 TurnBasedGameData 的 Story、Stages 或完整 `Config` 树的 production 路径；它们属于仓库总体积而非当前网站直接输入。

### 4.3 是否需要整个仓库？

结论：**不需要 whole repository**。固定 Excel/TextMap 是若干文件级依赖；敌人 Config 是按模板引用的目录内子集；BattleEvent 目前按目录枚举 layout 再按名称读取，故该子目录不能仅凭少数文件名安全裁剪，至少需保留可扫描的 BattleEvent 集合或改为预计算索引（本轮不实现）。

### 4.4 Git metadata

有。`sourceCommit()` 使用 `git rev-parse HEAD`，`syncData()` 使用 `git log -1 --pretty=%s` 解析游戏版本。没有 `git log` 历史、tag 或 timestamp 参与数据内容。因依赖 SHA，archive/sparse snapshot 可行，但部署输入必须保留一个可验证的 commit 标识；不需要 `.git` 目录本身。

### 4.5 Pipeline 与生成结果

`TurnBasedGameData -> readRaw/readTable + TextMap resolver + domain normalizers -> src/lib/generated/{manifest,catalogs,details,endgame,...}.json + static/generated/search.json -> SvelteKit prerender -> build HTML/JSON/JS`。

生成 manifest 当前：schema 33，source commit `014e33e2404f8cd668bf06fc2ea6db53b6bc3992`，game version `4.5.0`/`4.5`，角色 97、光锥 169、遗器 60、敌人 628。浏览器不接触原始 TurnBased 文件。

## 5. StarRailRes Dependency Audit

### 5.1 访问点与用途

`scripts/assets/paths.ts` 验证仓库和必需目录并读取 `git rev-parse HEAD`；`scripts/assets/shared.ts` 的 `read*Sources` 从 `index_new/cn/{characters,light_cones,relic_sets,relics,properties}.json` 将稳定 ID 映射到源文件；`buildAssetFiles` 使用 `copyFile`/`sharp` 复制或转换；`scripts/assets/ensure.ts` 通过 manifest、commit 和文件存在性判断缓存是否有效。

### 5.2 当前资源类别与数量

角色 preview/portrait、光锥 preview/portrait、遗器套装 icon、遗器部件 icon、遗器属性 icon、元素 icon、命途 icon、导航 icon、品牌 icon、高难模式 icon。当前 manifest（schema 11，source commit `d226befe3db13f2ec15f4161d5f34b1b607643fe`）无 missing 项：97+97+169+169+60+184+18+7+9+6+1+4 = **821 files**。

### 5.3 使用方式

属于 **C + E**：build 时按 ID/index 解析，使用 `copyFile` 或 `sharp` 生成到 `static/generated-assets`；portrait 输出 WebP，图标按尺寸输出 PNG。浏览器只引用 `/generated-assets/...` URL（`src/lib/data/visual-assets.ts`），不存在浏览器直读 sibling 的方式 A/B。

### 5.4 构建后可移除？

可以。当前 `build/` 已包含 111,148,316 bytes 的生成视觉资源；静态页面只依赖这些发布文件和 manifest，不依赖 StarRailRes 路径或 `.git`。

## 6. Asset Dependency Audit

已有 `src/lib/generated-assets/manifest.json`、`AssetRequirements`、ID→filename resolver、`manifestCoversRequirements` 和 `manifestFilesExist`。因此可天然用于 selective fetch：先由生成 catalog 得到 ID 集合，再从上游 index 得到精确源路径，最后只取得所需文件。当前 manifest 本身记录生成后 ID 集合，不记录远程下载 URL 的完整逐文件清单；若采用 API/raw selective fetch，下一阶段可在不改变 UI 模型的前提下派生该清单。

## 7. Repository / Asset Size Measurements

工作树大小不含 `.git`；`.git` 为本地目录实测值。

### Table 1 — Repository Size

| Repository | Working Tree Size | .git Size | File Count |
|---|---:|---:|---:|
| TurnBasedGameData | 2,596,506,270 bytes (2.42 GiB) | 4,316,341,423 bytes (4.02 GiB) | 137,845 |
| StarRailRes | 1,220,652,116 bytes (1.14 GiB) | 2,817,936,257 bytes (2.62 GiB) | 5,642 |

### Table 2 — Actual Dependency Scope

| Upstream | Required Paths | Required Size | Required File Count |
|---|---|---:|---:|
| TurnBasedGameData | 72 Excel tables + `TextMap/TextMapCHS.json` + traced Monster Character/Ability + BattleEvent | minimum measured ~189.9 MB (dynamic Config set; may expand) | 72 + 1 + 538 + 330 + 254 = 1,195 (overlap/optional references possible) |
| StarRailRes | five CN indexes + referenced image/icon paths | 111,148,316 bytes generated output | 821 generated files; source exact set can be derived from manifest/index |

“Required” here means files read or generated for the current checkout, not the complete upstream working tree.

## 8. Production Build Measurements

### Table 3 — Production Build

| Metric | Value |
|---|---|
| Build command | `pnpm build` (`prebuild`: `pnpm data:ensure && pnpm assets:ensure`; then `vite build`) |
| Build duration | **28.725 s** (esbuild/Vite run outside restricted sandbox) |
| Output directory | `build/` |
| Output size | 424,898,752 bytes (405.2 MiB) |
| Output file count | 3,420 |
| Static generated assets | 111,148,316 bytes / 821 files |
| Generated data (`src/lib/generated`) | 180,714,729 bytes / 965 files (build’s `generated/` subtree 11,578,005 bytes / 175 files plus per-route data) |
| Largest output classes | enemies 220,613,772 bytes / 1,257 files; generated-assets 111,148,316 / 821; endgame 27,625,810 / 231 |

第一次在受限沙箱执行同一命令时，`vite` 因 esbuild 访问父级路径得到 `Access is denied`；允许后重跑成功。该失败是执行环境权限问题，不是项目输入缺失。

## 9. Build-Time vs Runtime Dependencies

### Table 4 — Build / Runtime Dependency

| Dependency | Build Time | Runtime | Can Be Removed After Build? |
|---|---|---|---|
| TurnBasedGameData | `data:ensure`/`data:sync` 读取 Excel、TextMap、Config，并记录 SHA/version | 不需要；运行时读取 `src/lib/generated`/`static/generated` | Yes |
| StarRailRes | `assets:ensure`/`assets:sync` 读取 index 与源图片，生成 `static/generated-assets` 并记录 manifest | 不需要；浏览器只取 `/generated-assets/*` | Yes |

## 10. Reproducibility Audit

当前生成物**包含** TurnBased SHA（`src/lib/generated/manifest.json`）和 StarRailRes SHA（视觉 manifest），但这些目录在 `.gitignore` 中，HSR-Database 源仓库没有提交的 upstream lock；README 只有示例 SHA/checkout 命令，不能作为当前 commit 的强制输入。当前两个本地 checkout 分别为 TurnBased `014e33e...`、StarRailRes `d226befe...`。

因此仅 checkout 同一个 HSR-Database commit，一个月后不能保证相同 upstream 版本；缺失的是 source-controlled version pinning。建议 `upstream.lock.json` 至少记录 repo、commit SHA、获取方式/稀疏路径版本（可选 gameVersion、校验哈希、更新时间）。

### Upstream removal scenarios

| Scenario | install | generate | build | runtime |
|---|---|---|---|---|
| A. 只有 HSR-Database | 不受影响（依赖均为 devDependencies） | 失败：`data:ensure` 找不到 `HSR_DATA_ROOT`，`assets:ensure` 找不到 `HSR_ASSET_ROOT`；除非已有匹配的生成缓存且 ensure 能继续 | 在当前干净、无生成物 checkout 通常失败；已有完整匹配缓存时可能继续 | 已有 `build/` 可运行；新构建不能依赖运行时补救 |
| B. build 时有两个 upstream，build 后删除 | 不受影响 | 成功 | 成功 | 成功；静态产物自包含 |
| C. 只有 TurnBasedGameData | 不受影响 | 数据生成可做；资源 ensure/sync 失败或只能使用已有匹配缓存/缺失 fallback | 可能成功但视觉资源取决于缓存；在无 StarRailRes 的全新环境不能保证完整资产 | 已生成且发布的资源可运行；无新运行时上游访问 |
| D. 只有 StarRailRes | 不受影响 | `data:ensure` 失败，无法生成/验证数据；assets 可能独立成功 | 全新环境失败于数据阶段 | 仅已有 build 可运行 |

`data:ensure` 在发现已有 schema/commit 匹配的生成数据时，对暂时不可用的上游有容错；这不改变首次 build 仍需要上游的事实。

## 11. Vercel Compatibility / Constraints

- Isolated checkout：直接只 checkout HSR-Database 时，默认 sibling 路径不存在；必须在 Build Step 前提供 pinned snapshots 或改造获取步骤。
- 23 GB build disk：完整两个工作树约 3.56 GB，连同 `.git` 约 10.7 GB，低于 23 GB 但会浪费大量下载/解包空间；推荐裁剪后输入。
- 45 分钟 build limit：本次命中缓存的真实 build 28.7 秒，余量约 44 分 31 秒；首次全量生成/网络下载尚未在本地测量，不能把 28.7 秒当作 cold build 上限。
- 1 GB cache key：HSR-Database 生成数据约 180.7 MB、生成资源约 111.1 MB，低于 1 GB；完整 `.git` 不应写入 cache。
- Output file count 3,420：已有一定静态文件数量，主要来自 628 敌人页面；目前不是 Vercel 硬限制，但应避免继续把原始上游文件发布为 output。

## 12. Deployment Strategy Comparison

### Table 5 — Deployment Strategy Comparison

| Strategy | Reproducibility | Build traffic/time | Complexity | Maintenance | Suitability |
|---|---|---|---|---|---|
| Public Git submodule | High (SHA pinned) | full selected checkout; `.git`/large assets risk | Low–medium | submodule UX/update friction | Technically compatible with Vercel, but weak for 1.22 GB StarRailRes |
| Pinned full clone | High | highest; unnecessary 3.8 GB working trees + history | Low | Medium | Acceptable fallback, not preferred |
| Pinned sparse/partial checkout | High | TurnBased ~190 MB measured direct scope; StarRailRes indexes + dirs | Medium | Medium | **Best baseline for both** |
| Manifest selective fetch | High if SHA + file list pinned | Lowest StarRailRes payload; many HTTP requests/API failure modes | High | Medium–high | Strong StarRailRes second stage; needs robust downloader/cache |
| Vendored subset | Very high | No upstream network at build | Low build complexity | Large update/license noise | Good if accepting ~111 MB asset duplication; data vendoring less attractive |
| External asset CDN | High with versioned URLs | Fast deploy, shifts transfer outside build | High (storage/CORS/cache) | High | Not necessary at current 111 MB generated asset scale |
| Build from latest HEAD | None | variable | Low | deceptively low | **Do not use**; same HSR commit can produce different site/data |

TurnBased is not a good per-file API-fetch target because table and Config cross-references are broad. StarRailRes has stable ID/index mapping and a small generated allowlist, so manifest selective fetch is realistic.

## 13. Recommended Architecture

```text
HSR-Database commit
        + upstream.lock.json (TurnBased SHA, StarRailRes SHA)
        |                         |
 pinned sparse TurnBased      pinned sparse/manifest StarRailRes
        |                         |
      data:ensure/sync       assets:ensure/sync (821-file output)
                 \             /
                 SvelteKit static build
                          |
                  Vercel CDN: build/
```

### 推荐方案

Source-controlled lock + Build Step 获取 pinned SHA；TurnBased 使用 partial+sparse（保留固定 Excel/TextMap 与被追踪 Config/BattleEvent），StarRailRes 使用 sparse checkout，随后按现有 AssetRequirements/manifest 只处理实际资源。构建后运行时完全与 GitHub 和两个上游解耦。

### 次选方案

把已生成的 StarRailRes 子集（约 111 MB）作为受控 vendored artifact，TurnBased 仍使用 pinned sparse fetch。适合优先保证部署稳定、可接受仓库体积和资源更新噪声的阶段。

### 不推荐方案

完整 submodule/full clone（下载和 `.git` 浪费大）、无锁的 latest HEAD、当前规模下直接引入外部 CDN。Submodule 本身并非 Vercel 禁止项，但对本仓库的 StarRailRes 体积收益/维护比不佳。

## 14. Upstream Update Strategy

推荐 Option A：定期检查 upstream SHA → 更新 lock → PR → Vercel Preview → data/assets validate + 人工确认 → merge → production。它能在 schema-breaking 更新时提供失败证据、预览和回滚。Option B（发现更新后 Deploy Hook、build 读取 latest）实现简单但不可复现、难调试、无法可靠回滚；不适合生产数据站点。

## 15. Risks / Unknowns

- 本地 cold build 下载时间尚未测量；当前 28.7 秒是已有生成缓存命中后的真实构建。
- `endgame.ts` 会枚举 BattleEvent layout 并按名称扫描；若做过度 Config sparse，可能漏掉未来动态引用，需在实施阶段加入路径审计/失败测试。
- StarRailRes index 可能出现 `null` 或文件未提交；现有 pipeline 会记录 manifest missing 并 fallback，但 selective downloader 仍需明确缺失处理。
- 上游许可：StarRailRes 仓库附带 AGPL-3.0，网站已保留 `static/licenses/StarRailRes-AGPL-3.0.txt`；派生/托管方案仍需维护 attribution。
- 当前 HSR-Database 工作树在调查前已有大量用户修改；本轮未清理或覆盖这些修改。

## 16. Proposed Next Implementation Steps

1. 设计并提交 `upstream.lock.json` schema（两个 repo 的 SHA、来源、可选路径/校验）。
2. 实现构建环境准备器：按 lock 获取 TurnBased sparse snapshot，并验证 required files/commit。
3. 将 StarRailRes 的 manifest/allowlist 转为可审计的 source-path 清单，评估 sparse 与逐文件 fetch 的网络请求上限。
4. 在干净环境进行 cold build、删除上游后的 preview smoke test，并测量首次下载/生成时间。
5. 最后再选择 Vercel Build Command、cache key 和更新自动化；本报告未实施任何部署配置。
