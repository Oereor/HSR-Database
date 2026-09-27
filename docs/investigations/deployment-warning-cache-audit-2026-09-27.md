# Deployment Warning & Cache Health Audit

审计日期：2026-09-27。范围：`HSR-Database` 当前 `develop`，调查、复现与报告；未实施修复。

本文使用 **Observed** 表示日志、文件或实验直接证据，**Inferred** 表示实现推断，**Recommendation** 表示后续建议。置信度针对具体结论，不把本机实验推广为云端实测。

## 1. Executive Summary

Cold、Immediate Warm #1、Warm #2 和 Vercel-like 四次完整 Production pipeline 均通过。外部 wall time 分别 **238.137 / 85.031 / 76.631 / 77.332 秒**。Cold data/general-assets miss；之后两次 warm 与 Vercel-like 全部 hit，manifest hash 稳定。未复现重复 miss 或自我失效的 cache bug。现有日志应按来源处理，不能把 stderr、数据诊断、cache miss 和平台配置提示统称为故障。

- **明确需要处理的配置风险**：`engines.node >=22` 与 CI Node 22 不构成一致的运行环境；本地 Vercel 设置快照记录 Node 24。`@sveltejs/vite-plugin-svelte 7.3.0` 的 Vite peer range 要求 8，但锁定/安装版本为 Vite 7.2.4。
- **adapter 提示有明确原因**：显式 `fallback: '404.html'` 关闭了 adapter 的 Vercel zero-config；当前 pipeline 确实依赖 `build/` 和 `404.html`，不能为消除提示直接删 options。
- **数据诊断有业务含义**：两种本地化日志已经按 locale/type 汇总；敌人弱点/抗性冲突保留上游事实。它们不是 13,041 个程序错误。
- **缓存需区分进程内验证、本地生成目录与云端持久化**：没有发现仓库将自定义生成目录接入 Vercel persistent build cache 的实现。云端 cache restore 不足以证明这些目录被恢复。
- **未确认废弃的部署实现**：旧式别名、Windows 回退、离线开发 fallback、独立验证层均有调用或明确职责；确认存在过时文档描述。

## 2. Scope 与证据限制

检查 package/lock/config、全部 deployment scripts、data/asset ensure 与验证、GitHub Actions、已安装 adapter 实现、script callers、dependency metadata、构建产物及日志。最终报告按用户指定放在 `docs/investigations/`，覆盖原 prompt 的默认 `data/audit/` 报告位置。

没有执行 Vercel CLI build/deploy/pull、Preview/Production 部署、远程设置修改、updater、主动依赖安装/升级或 commit。pnpm 11 的 script 启动依赖检查在 CI/E2E 日志中自动进入 install/no-op 路径，返回 lockfile up to date / already up to date；这与主动更新依赖不同，lock hash 未变。没有获取云端最新完整 build log；prompt 中的日志片段属于用户提供的历史证据，不能填成当前实测。Vercel 设置来自已有 `.vercel/project.json`，可能过期。

网络访问使用 `http://127.0.0.1:7890`，先验证端口可连接。官方文档与 `pnpm outdated` 在沙箱外只读访问；沙箱内 curl 的 Windows TLS `SEC_E_NO_CREDENTIALS` 失败已记录，不作为项目缺陷。

## 3. Environment

| 项目 | Observed |
| --- | --- |
| Branch / commit | `develop` / `a1eee615e4224298dcb886cb6fc23515c0b6f8a9` |
| 初始工作树 | `git status --short` 空；两个 sibling repo 也为空 |
| OS / CPU / RAM | Windows_NT 10.0.26200；Intel Core i9-14900HX；32 logical CPUs；31.64 GiB |
| Node / pnpm | v22.19.0 / 11.9.0；pnpm 为 npm 安装的 PowerShell launcher |
| package constraints | Node `>=22`；pnpm `>=10`；`packageManager: pnpm@11.9.0` |
| CI / Preview workflow | `actions/setup-node` 22；CI/updater pnpm 11.9.0；Preview CLI 固定 59.16.0 |
| 本地 Vercel settings 快照 | framework `null`；buildCommand `pnpm deploy:build`；outputDirectory `build`；nodeVersion `24.x` |
| Runtime pin files | 无 `.nvmrc`、`.node-version`、repo `.npmrc`、`.vercelignore` |
| pnpm 配置 | `pnpm-workspace.yaml`：空 packages、esbuild allowBuilds/onlyBuiltDependencies；lockfile 9.0 |
| 数据 pin | TurnBasedGameData `4ce30f69b32dc259ab9a8da3ba57035485103221` |
| 资源 pin | StarRailRes `d226befe3db13f2ec15f4161d5f34b1b607643fe` |

Git 初次读取被 sandbox owner mismatch 拒绝。后续使用 command/process scoped `safe.directory`，未写全局 Git 设置。正式构建因 esbuild 的父目录读取限制转到沙箱外运行。不同 sandbox/用户上下文的耗时不混合比较。

## 4. Current Deployment Architecture / Entry Point

Production build entrypoint：**`pnpm deploy:build`** → `tsx scripts/deployment/build.ts`。来源：`package.json:30`、`docs/vercel-deployment-foundation.md` 和已有 Vercel settings；不是普通 `pnpm build`。

Profile precedence：显式 `--profile` 优先；否则 `VERCEL_ENV=production` 或未设置 → production；preview/development → preview；未知值报错。`VERCEL=1` 本身不是 profile selector，却会触发 adapter 平台检测。

```text
lock ─┬─ messages:compile
      ├─ prepareTurnBasedGameData ─ data:ensure ─ benchmarks validate
      └─ prepareStarRailRes
              ↓
production: data:validate:build-inputs
ci:         data:validate:full
              ↓
enemy snapshot validate ║ general assets ensure → assets verify (production/ci)
              ↓
development/ci: search-names check → check → lint → unit tests
              ↓
svelte-kit sync → vite build → output smoke
              ↓
production/ci: asset reference closure → public route verification
```

普通 `pnpm build` 的 `prebuild` 使用 sibling defaults 且不等价于上述流程。编排器直接 `pnpm exec vite build`，不会重复触发 `prebuild`。Production 是可信 CI 后的 build-input gate；CI 保留完整 semantic audit。`.github/workflows/ci.yml` 在 `develop → main` PR 运行 `ci:validate`，再复用产物跑 `test:e2e:smoke`。Preview workflow 是人工 dispatch 的云端部署流程，本轮只阅读。

`HSR_DEPLOYMENT_BUILD=1` 在编排器中禁用上游不可用时的宽松 fallback；expected source SHA 来自 lock。`HSR_BUILD_VERSION` 使用真实 Vercel/GitHub commit SHA 或当前 Git HEAD，不使用时间戳。数据/资源根被设为仓库内 `.upstream/*`。

## 5. Experiment Methodology

日志目录（ignored，未提交）：`data/audit/deployment-warning-cache-2026-09-27/`。每轮单独保存 `*.stdout.log`、`*.stderr.log`、`*.result.json`，包含外部 wall time、退出码和 manifest/lock SHA-256。`[deploy:stage]`、`[deploy:resource]`、`[deploy:io]` 保留原始输出。

冷实验只移除以下目录的可重建内容：`src/lib/generated`、`static/generated`、`src/lib/generated-assets`、`static/generated-assets`、`src/lib/paraglide`、`project.inlang/cache`、`build`、`.svelte-kit`、`.vite`。清理前校验绝对路径在网站 repo 内、没有 symlink/junction、没有 tracked source；保留 `.gitkeep`。保留 `node_modules`、两个 pinned checkout、tracked enemy snapshot、lock、人工 aliases、官方名称快照。故本轮 Cold 是 **project generated-cache cold**，不是 fresh clone/network cold。

首次 sandbox cold 在 Vite 被 `Cannot read directory '../../../..': Access is denied` 阻止，exit 1，wall 219.570s；数据及资源 miss/generation 均成功。完整证据保存为 `sandbox-cold.*`。随后重新清理同一生成目录，在沙箱外从 Cold 重跑；正式四轮使用完全相同入口，连续执行，没有修改 source/lock 或中间清理缓存。

Vercel-like 仅新增 `VERCEL=1`、`VERCEL_ENV=production`；未伪造 build-machine、cache restore 或 commit 环境。CI 使用仓库规定的 `pnpm ci:validate`。环境统一传递 HTTP(S)/ALL_PROXY、npm proxy 和 Git http.proxy；本机 loopback 不经过外网代理。

## 6. Build Timing Comparison / CI Results

全部数值为秒；stage 是脚本 wall time，external wall 包含 pnpm 启动。并发 prepare / asset validation 不能简单相加；每种状态只有一个正式样本，不能解释成统计分布或云端性能。

| Stage | Cold | Warm #1 | Warm #2 | Vercel-like | Full CI | 云端 log |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| lock | 0.002 | 0.002 | 0.001 | 0.001 | 0.002 | 未提供 |
| messages-compile | 6.728 | 4.276 | 3.395 | 3.444 | 3.414 | — |
| prepare-turnbased | 0.397 | 0.287 | 0.228 | 0.255 | 0.231 | — |
| prepare-starrailres | 0.387 | 0.279 | 0.195 | 0.249 | 0.226 | — |
| data-ensure | 72.982 | 8.147 | 6.832 | 6.470 | 6.881 | — |
| relic-score-benchmarks-validate | 1.669 | 1.454 | 1.103 | 1.080 | 1.130 | — |
| data-validate-build-inputs | 9.119 | 6.362 | 5.542 | 5.692 | 包含在 full | — |
| data-validate-full | — | — | — | — | 37.283 | — |
| enemy-assets-validate | 2.715 | 1.870 | 1.735 | 1.928 | 1.580 | — |
| assets-ensure | 47.210 | 0.185 | 0.207 | 0.178 | 0.163 | — |
| assets-verify | 8.114 | 5.136 | 4.489 | 4.388 | 4.515 | — |
| search-names-check | — | — | — | — | 1.510 | — |
| check | — | — | — | — | 30.057 | — |
| lint | — | — | — | — | 37.475 | — |
| test | — | — | — | — | 22.769 | — |
| vite-build | 79.773 | 51.144 | 47.867 | 46.885 | 67.783 | — |
| output-smoke | 0.002 | 0.002 | 0.001 | 0.002 | 0.001 | — |
| deploy-verify | 8.239 | 5.434 | 4.506 | 5.269 | 6.156 | — |
| route-verify | 2.228 | 1.636 | 1.492 | 1.916 | 2.173 | — |
| pipeline total | 236.861 | 84.302 | 75.968 | 75.846 | 221.801 | — |
| external wall | **238.137** | **85.031** | **76.631** | **77.332** | **224.235** | — |
| exit code | 0 | 0 | 0 | 0 | 0 | — |

| Cache | Cold | Warm #1 | Warm #2 | Vercel-like | CI |
| --- | --- | --- | --- | --- | --- |
| data | miss: manifest-missing-or-invalid | hit | hit | hit | hit |
| general-assets | miss: manifest-or-files-stale | hit | hit | hit | hit |
| pinned checkouts | reused ×2 | reused ×2 | reused ×2 | reused ×2 | reused ×2 |
| enemy snapshot | tracked-snapshot-valid | 同左 | 同左 | 同左 | 同左 |

Cold → Warm #1 外部耗时减少 **153.105s / 64.3%**，→ Warm #2 减少 **161.506s / 67.8%**。data+assets ensure 从 120.192s 降为 8.332s / 7.039s，实际减少 111.860s / 113.153s，命中有明确收益。余下差异包含 Vite、文件系统/工具预热与机器方差，不应全部归因于自定义 cache。Warm 仍完整执行 data input、asset metadata、Vite、route/output verification。

### Resource diagnostics

| 进程/阶段 | Cold user/system CPU 秒；max RSS MiB | Warm #1 | Warm #2 | Vercel-like | CI |
| --- | --- | --- | --- | --- | --- |
| data-ensure | 67.766 / 10.515；2499.6 | 5.000 / 0.547；877.2 | 4.078 / 0.547；883.3 | 3.907 / 0.375；884.0 | 4.188 / 0.469；886.1 |
| data-build-inputs/full | 6.000 / 1.156；747.6 | 4.157 / 0.922；747.4 | 3.875 / 0.656；747.0 | 4.156 / 0.579；747.3 | full 46.969 / 2.969；3238.8 |
| general-assets | 68.188 / 13.141；265.7 | 0.172 / 0.109；132.8 | 0.172 / 0.140；134.7 | 0.110 / 0.047；134.4 | 0.125 / 0.016；132.4 |

Cold structural parity：17 comparisons / 34 projections，wall 14.794s；CI 同工作量 9.757s。CPU 可因 native parallel work 高于 wall。仓库现有 telemetry 不提供整棵进程树 aggregate peak，也没有 Vite 子进程峰值；以上不能充当完整 deployment peak memory。没有观察到 OOM。

### Correctness output

`pnpm ci:validate` **通过，224.235s**：full semantic validation、search-names check、Svelte check、scripts/API TypeScript、Prettier、ESLint、unit、Vite、smoke、asset closure 和 route verify 均通过。Svelte check **0 errors / 0 warnings**，Vitest **65 files / 686 tests passed**，runner duration 16.16s。没有 observed TS/ESLint/CSS/Svelte/deprecated API/experimental API/unhandled rejection/duplicate route warning。

CI stderr 除命令回显外有 8 行业务诊断：与 cold 相同的 6 行 locale/enemy summary，另有 544 个 unresolved TextHash 与对应 A 类 544 条唯一记录。Cold 有 6 行；Warm #1/#2 无业务 stderr diagnostic；Vercel-like 的 adapter warning 出现在 **stdout**，说明仅 grep stderr 会漏掉真正 framework warning。

Paraglide 每次 Vite 的第一阶段 `Compilation complete`、另一阶段 `Compilation skipped — inputs unchanged` 是正常行为，不是同一份编译失败后重试。`messages:compile`/`messages:check` 均运行 scripts/messages.ts，名称为 check 仍会 compile；CI 的多处调用有后续减重复空间，但只占小部分总耗时。Vite 大部分日志为 client/server file size listing。

未额外重复 `ci:develop`，因为 full correctness 包含其 repository checks；未跑全部 desktop/mobile/component 套件，因为当前 CI gate 定义的是 smoke。本轮未做 fresh dependency installation；pnpm 自动 no-op 验证不能证明 fresh installer 没有 engine/peer diagnostics。

### CI browser smoke

`PLAYWRIGHT_REUSE_BUILD=1 CI=1 pnpm test:e2e:smoke` **通过，5/5，Playwright 7.5s，外部 11.129s，exit 0**。复用上述 CI build 与已安装 Chromium；覆盖首页/client navigation、search locale switch、敌人 level/variant interaction、缺图 fallback、mobile navigation。没有运行 browser installer。

Observed 7 次 `Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.`：Node 22 `internal/tty` 在两个颜色环境变量同时存在时发出，进程局部 warning；Playwright webserver/worker 环境会影响颜色设置。属于终端输出策略冲突，无数据/页面语义影响，后续可统一 test runner 的颜色策略，不必改生产 runtime。

Observed 6 次 `[WebServer] [404] GET /_vercel/insights/script.js`：根 layout 的 `injectAnalytics()` 使用 `@vercel/analytics/sveltekit` 默认 production script path，本地 Vite preview 不提供该 Vercel 平台 endpoint。这解释本地 analytics 不工作；不证明 Vercel 线上 analytics 404，也不证明线上集成一定正常。可作为本地 smoke 的已知环境噪音，若未来想隐藏需专门定义 local telemetry policy。

pnpm 输出 `Lockfile passes supply-chain policies (verified 21d ago)` 是缓存的 policy 验证信息，不是“当前重新安全审计通过”。已安装 pnpm 11.9.0 的默认 `verify-deps-before-run=install` 解释 auto no-op install；本轮所有 lock hashes 保持一致。

## 7. Warning Inventory / Source Tracing

下表中的“预期”不等于永远无需关注。未触发的分支只作为静态 inventory，不声称已复现。

| 类别 / Message | Source / ownership | Trigger / 预期 | 当前影响、风险与建议 |
| --- | --- | --- | --- |
| A 平台：`Detected engines node >=22 ... automatically upgrade` | Vercel 平台；第三方；用户历史日志 | 宽 major range；预期配置提示；本地普通 Vite 不会输出 | 当前未证明故障，但 CI/Production major 漂移；应明确支持矩阵。High |
| B 框架：`Detected Vercel. Please remove adapter-static options...` | adapter-static 3.0.10 `index.js:54–64`；第三方 | `platform.test()` 检测真值 `VERCEL` 且 options 对象存在；预期 | 保留当前静态部署语义。迁移输出/routing 是独立工作，不应只为消 warning。High |
| C dependency：Vite peer mismatch | plugin package.json `peerDependencies.vite`；第三方 metadata | 7.3.0 要求 `^8.0.0-beta.7 || ^8.0.0`，实际 7.2.4 | 安装与兼容性风险，成功 build 不代表满足 supported contract；安排版本矩阵修复。High |
| A/C test runtime：`NO_COLOR ... FORCE_COLOR` | Node `internal/tty`；第三方；E2E 实测7次 | 同时设置两变量；预期颜色控制冲突 | 无产品行为影响；可统一 test env，保留也安全。High |
| D/G local server：analytics script 404 | layout `injectAnalytics` + analytics SDK 默认 path + Vite preview；本地组合；E2E 实测6次 | 本地没有 Vercel analytics endpoint | 本地观测边界；不能推广到线上，通常无需修改生产代码。High |
| D repository：上游不可用使用缓存/无图降级 | `scripts/data/ensure.ts:117–139`、`assets/ensure.ts:84–113`、`assets/sync.ts`；第一方 | local source unavailable，且 fallback valid；production 禁止宽松回退 | 开发兼容功能，非 dead branch。本轮未触发；保留。High |
| D repository：upstream retry / Windows copy fallback | `scripts/deployment/git.ts:148–192`；第一方 | fetch/sparse 临时失败或 rename 重试耗尽；未触发 | 处理真实 I/O/Windows 环境风险，不因本轮未触发删除。High |
| D repository：staging/backup cleanup failed | `assets/sync.ts`、`assets/enemies/sync.ts`；第一方 | 发布后备份或暂存清理异常；未触发 | 主输出可有效但需检查磁盘残留；不能当普通噪音吞掉。High |
| D repository：visual assets missing / enemy portrait fallback | `assets/shared.ts:348–375`、`src/lib/server/enemy-assets.ts:45–89`；第一方 | manifest 合法缺失项或运行时映射不可用；本次通用资产 missing=0 | 可接受的局部缺图与损坏/错误映射要分开；保留明确 fallback。High |
| E data：`localization/classified-fallback` | `robustness-invariants.ts:120–205`；第一方验证上游 | 已分类且允许 fallback；预期 | 每 locale 13,041 references，不是 13,041 独立 bug；保留可追溯汇总。High |
| E data：`localization/optional-missing` | 同上 | 非 available、非 required reachable without fallback；预期 | zh-CN 1,716 / en 1,704；可选文本缺失，不应强行跨语言补值。High |
| E data：`enemy/weakness-resistance-conflict` | `robustness-invariants.ts:281–295`；第一方验证上游 | weakness 与 resistance 并存；预期 upstream characteristic | 13 conflicts，样本 enemy 3021022 Physical 0.2；按 locale 验证重复报告，不能把两次相加当 26 个敌人错误。High |
| E data：full validation 的描述/TextHash/占位符/A-B-C 分类摘要 | `scripts/data/validate.ts:1145–1171`；第一方 | 已分类原始描述、文本或参数缺失 | 有明确 audit backing；D 类程序错误与 unknown reachable schema 仍是 hard failure。详见 CI 实测。High |
| F cache：`data result=miss reason=manifest-missing-or-invalid` | `scripts/data/ensure.ts:111–177`；第一方 | manifest 不存在/读取或 schema 验证失败 | Cold 正常；warm 若重复才需定位。reason 合并多种情况，诊断可细分。High |
| F cache：`general-assets ... manifest-or-files-stale` | `scripts/assets/ensure.ts:53–83`；第一方 | source/requirements/schema/文件检查未形成有效 context | Cold 正常；建议细分 missing/schema/source/files 原因。High |
| F cache：`enemy-assets result=hit reason=tracked-snapshot-valid` | `scripts/assets/enemies/validate.ts:15`；第一方 | 受版本控制的快照离线验证成功 | 这是 snapshot validation，不是跨 deployment 缓存命中率；命名可更准确。High |
| G info：pnpm `$ tsx ...`、Paraglide compiled、Vite client/server sizes、`Use pnpm ... preview` | pnpm/Paraglide/Vite/SvelteKit；第三方 | 正常 script/build lifecycle | stderr 或黄色文本不必然表示异常；不应以文本匹配 warning 数替代分类。High |
| G info：`Update available! 11.9.0 → 12.6.0` | pnpm update notifier；第三方；CI stdout 实测 | 检测到 package manager 更新信息 | 不代表当前 pnpm 不受支持；不能跟随提示自动升级，本轮未执行。High |
| G info：`Lockfile passes supply-chain policies (verified 21d ago)` / `Already up to date` | pnpm script 前置依赖检查；第三方 | 缓存的 policy 验证与 no-op install | 不能当成本轮 fresh security audit；lock/hash 保持不变。High |
| G info：`deploy:stage/resource/io`、structural parity | repo telemetry；第一方 | 计时、资源与验证统计 | 审计有用，应保留。max-rss 为所在进程高水位，不是全部子进程总峰值。High |
| 环境失败：esbuild Access denied、curl TLS credentials、pnpm why SQLite | sandbox/tool execution；本地环境 | 限制访问父目录/TLS/store | 与生产 warning 区别记录；无依据认为仓库代码损坏。High |

静态扫描还覆盖 `unknown SkillEffect`、hidden discriminants、Endgame stance 非正/非整、unknown DebuffResist、版本 subject 解析失败、relation diagnostic 等分支。它们是有条件的 schema/upstream 诊断，不能将未出现的分支计入本次 observed warning。未知且 product-reachable 的若干值走 error，不是 warning suppress。

## 8. Node Engine Warning

**Observed：** CI/updater/Preview workflow Node 22；本机 22.19.0；package Node `>=22`；本地 Vercel 快照 24.x。没有实际云端 `node -v` 本轮记录。

**官方行为：** [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) 说明 package engines 可覆盖项目设置，当前支持 24/22/20，宽下界可映射到最新支持 major。不能写成 Vercel 一定会顺序选择 23/25；平台是否支持该 major 才是前提。

**Inferred：** 当前配置已允许 Production 24、CI 22，而不是仅未来风险。本机成功不能证明 Node 24 runtime/API 路径全部验证过。`>=22` 还允许低于部分工具实际要求的 22.12/22.13 patch；pnpm 11.9.0 自身要求 Node `>=22.13`，`engines.pnpm >=10` 比正式 11.9.0 声明宽；`@types/node 26` 可能让 TS 接受旧 runtime 没有的 API。

**Recommendation：** 单独确认 cloud build/runtime 版本，明确选择 22.x 或把 Node 24 作为独立 migration，并对 CI、Vercel、types、pnpm 最低要求做一致化验证。本轮不机械建议“降级到 22”，也未修改 engines。High（静态配置）；Medium（当前云端实况）。

## 9. adapter-static / Vercel Warning

来源为已安装 `node_modules/@sveltejs/adapter-static/{index.js,platforms.js}`，不依赖远程文档猜测。`platforms.js` 对 `!!process.env.VERCEL` 检测平台；有 options 就 log.warn；不代表 `fallback` 无效，也不代表构建失败。

| 行为 | 当前显式 options | 无 options 的 Vercel zero-config |
| --- | --- | --- |
| 输出目录 | pages/assets 默认 `build` | `.vercel/output/static` |
| Fallback | `generateFallback(.../404.html)` | 无默认 fallback，不自动生成现有 404 shell |
| strict dynamic route guard | fallback 存在时跳过该 guard | 没 fallback 时未完全 prerender 的动态 route 可触发错误 |
| 平台 routing manifest | adapter 不写 zero-config manifest | `.vercel/output/config.json` v3：redirects、overrides、immutable cache header、filesystem handler |
| trailing slash | `+layout.server.ts` always；`vercel.json` true；目录 index 验证 | 对已有 prerender redirects/pages 产生具体 overrides 与 308/内部映射规则 |
| locale entries | manifest 的 publicLocales/routePaths，zh-CN 与 `/en` | 配置仍决定 entries；adapter 本身不会删除 en，但输出与 hosting routing 需另验 |
| repo verifier | smoke 和 route verify 都读取 `build/404.html` | 默认路径和 fallback 假设不再成立；不能直接复用 |

`verifyBuildSmoke`（`verify-build.ts:88–101`）要求首页、en 首页及 404；`verify-routes.ts:9–37` 要求 directory index、规范 trailing slash、没有残留 `route.html` 并读取 404。当前 404 是 adapter 生成的客户端 fallback shell，不能把其内容等同于完整的 wire-level 404 行为。云端未知路由 HTTP status、redirect precedence 需独立验证。

zero-config 可以让平台输出 contract 更显式，但没有证据说明会降低 data/Sharp/prerender 成本。迁移要同时审查 outputDirectory、404、redirect、locale route、API coexistence、smoke/route verification。**保留此 warning 合理，不建议只为消 warning 迁移。** Confidence High。

## 10. Data Diagnostics

`syncData` 在发布之前对两个 locale 各执行 `assertValidationReport`；warning 每份报告最多展示 20 个 issue，超出提示 `data/audit/latest.json`。`validateLocalizationHealth` 本身已经把 fallback/optional 按 type 合并，只附首个 sample；不应再建议从 13,041 行压缩为一行，因为现在就是一行计数。

规则并未弱化：unclassified/invalidProgramStateErrors、错误 locale/TextMap、invalid reference、required+emitted+reachable 而无允许 fallback 都是 error；`assertValidationReport` 有 errors 才 throw，warnings 没有数值阈值。full validation 的程序级 D 类与核心关联错误也直接失败。

`data/audit/latest.json` 包含 locale 健康、missingTextAudit、enemy/relation/endgame audit 等；`data:audit` 是另一个人工审计入口，不能与 latest 混同。日志和已有文档/tests证明这些信息有定位入口，但本轮不能证明维护者实际阅读频率。

优化建议是保留 locale、counts、sample 和详细报告位置；可合并跨 locale 重复的 neutral enemy conflict summary，增加相对上一 pin 的 delta。不要删除 validator、强制填值或把 optional missing 升级成错误。Production warm 不重新 sync；其诊断量应由实际触发阶段解释。

## 11. Cache Architecture / Data Cache

Data manifest：`src/lib/generated/manifest.json`，schema **46**（`generated-artifacts.ts:7`）。生成由 `sync.ts` 在 staging 中产出 artifact metadata、验证后原子发布，详细 audit 独立写到 `data/audit/latest.json`。

| 输入/属性 | 是否用于命中判断 |
| --- | --- |
| upstream SHA | 是，当前源 commit 对比 manifest.sourceCommit |
| 两 locale TextMap digest | 是，parse 后 JSON.stringify 的 SHA-256；不是原始文件字节 hash |
| artifact file SHA/bytes/schema/inventory | 是；2,126 个 artifacts 重新读取/parse/hash；另有 homepage/search contracts |
| locale/public route schema | manifest shape/version 校验；zh-CN/en 必须存在 |
| 搜索 aliases/metadata | ensureSearchDocuments 重建中文 search 对比 serialized bytes，有变化仅刷新其 metadata/revision |
| 网站 commit、generator source hash、Node/pnpm/dependency version | 不直接参与 cache key；HSR_BUILD_VERSION 只影响站点构建版本 |
| timestamp、mtime、绝对路径 | 不参与；data manifest 无 generatedAt/source absolute path |

无 manifest/旧 schema/parse failure → `manifest-missing-or-invalid`；artifact invalid → `generated-artifacts-invalid`；source/TextMap 改动 → `source-or-textmap-changed`；search-only rewrite → reason 追加 `+search-artifact-refreshed`。source unavailable 仅普通开发可使用已验证缓存，deployment 必须 fail。

`dataRevision` 从 upstream SHA、TextMap digests 和 artifacts metadata 计算，不包含 wall clock；`canonicalJsonDigest` 实际保留 JS property insertion order，没有递归排序，TextMap key 顺序改变可能产生保守 miss，但不会产生 wrong hit。不能据函数名声称跨任意 JSON key ordering 规范化。

**边界风险（Inferred）：** generator 逻辑变更但未 bump schema、不改变已检查 contract 时，现有 warm 数据可能仍有效地通过旧 artifact 自校验；cache key 不自动代表“当前生成代码”。测试明确要求无 generatorVersion。这是需维持的显式 schema/version discipline，不是本轮无 source change 下观察到的 false hit。若未来接入跨 commit 持久化，必须先设计 producer/dependency key。

## 12. General Assets 与 Enemy Snapshot

通用资源 manifest：`src/lib/generated-assets/manifest.json` schema **16**；发布文件在 `static/generated-assets/`。miss 时 copy/Sharp 队列写 staging，独立验证并 atomic publish；本轮生成 623 copies、1,625 Sharp transforms，missing=0，copy concurrency=1、Sharp=2，阶段不 overlap。

requirements fingerprint 对 character IDs、avatar source mapping、detail icons、light cones、relic pieces/properties、elements/paths/navigation/branding/utility/endgame icons 规范排序后 SHA-256。它不是全仓库 hash，也不是生成实现/Sharp 版本 hash。source commit、schema、requirements coverage 与文件存在性决定 ensure hit。

`generatedAt` 仅创建 manifest 时变化，不用于 freshness；mtime 不用于 cache key。`AssetFilesystemObservation` 持有文件名/size/绝对路径与 lazy Sharp metadata，**只在当前 invocation 内复用**，没有把绝对路径存成跨机器 persistence key。

ensure 的 `manifestFilesExist` 不核对每张图内容 hash；Production/CI 后续 `assets:verify` 重新从 contract 检查图片 format/dimensions 等，重用同次 filesystem observation。不能把 general asset cache 称为与 data 一样逐文件内容寻址，也不能把同 format/dimensions 的任意替换图称为必然被检测。当前假定 pinned immutable source + 受控 generator；跨机器/版本持久化应补充 key 与完整性设计。

Enemy resources 是 tracked schema-3 snapshot：`static/generated-enemy-assets/index.json`、README、210 张 WebP，合计 212 files/16,214,202 bytes；mapped=605、unavailable=23。部署只离线 validate；updater 的 `update:enemy-assets` 才联网更新。本轮未运行 updater、未删除快照。该 `hit` 不属于“项目缓存是否从 Vercel 恢复”的证据。

## 13. Vercel Build Cache vs Application Cache

[官方 build cache 文档](https://vercel.com/docs/deployments/troubleshoot-a-build#understanding-build-cache) 说明依赖与 framework-specific 目录依据 framework preset 缓存，restore 在 install/build 之前；key 包含 project、framework、root、Node、package manager、branch 等。文档明确不能自行任意配置缓存文件集合。因此不能只因目录被 ignored 或 build 写入，就声称它被 persistent cache 保存。

```text
Vercel build cache → dependencies / platform-selected framework files
                     [未找到仓库接线]
HSR custom cache  → src/lib/generated + static/generated
                  → src/lib/generated-assets + static/generated-assets
                  → .upstream pinned checkouts
CI semantic audit → data/audit/latest.json（额外 companion artifact）
```

现有 `.vercel/project.json` framework=null；repo 无 custom restore/save hook、无这几个目录的 `actions/cache`；Actions setup-node 的 `cache: pnpm` 缓存包管理器内容，不等同于以上树。**Inferred / Medium-High：若云端同 pin 连续 miss 而本地 warm hit，优先调查 persistence/environment boundary，而非认定 ensure 算法失效。** 本轮没有最新云端连续两次日志或 restored file listing，因此不能宣称每次远程部署必 miss。

未来实验应只读采集 restore 后四个生成目录、manifest 是否存在、大小/schema/key；记录 Node/pnpm/preset。若设计持久化，须先明确容量与 atomic restoration，排除 `.git`、absolute path 和环境私有数据；保留 cold correctness，并将 CI 用的 `latest.json` 依赖纳入设计。不要未经验证把全部 upstream Git object 塞入缓存或改平台 cache 设置。

## 14. Cache Determinism

正式 Cold/Warm #1/Warm #2/Vercel-like 四轮记录的以下 SHA-256 完全一致：

| 文件 | SHA-256 |
| --- | --- |
| data manifest | `45e732303eb5d9d9fecc17b9c61dd5ec58e7256ae995a8f7cf06c29825e98373` |
| general asset manifest | `183b46319fe6e17f5d9a7e5686baa3786ceac31d6cf649ea8d4e7587aa057d16` |
| upstream.lock.json | `6ee8c45ff895943056e2f199664b521a3b292a0fa1f8e9ba30d79de045dd82c2` |
| pnpm-lock.yaml | `59472a7fd8d9aed0ebc8f583e177ccb300ce991e48bf3e2be3232a6d5f4223f9` |

Data revision 为 `cd5dfeafbce9e6c086098955ec2bd1f68b8d385aeea7dcbf10a2486fbb097050`。首次 sandbox cold 的 data manifest hash 与正式重新生成的 Cold 也一致，提供了两次实际 regeneration 的稳定性证据。资源 manifest 在两次独立 cold regeneration 中 hash 不同，至少其 `generatedAt` 时间不同是确定的实现原因；没有保存首次全部资源 manifest 作字段级 diff，因此不声称差异仅有 timestamp。正式 warm 不 rewrite，hash 始终相同。

每轮 data validation 对 manifest 中所有 artifact bytes/hash 做验证；这比只比较 manifest 文件存在性强。通用资产稳定 hash 加验证结果证明本轮正常 reuse，并不等于所有图片在跨 OS/Sharp 版本重建时 byte-identical。四轮最终产物数量/总字节数相同；没有逐轮保存整棵 build 的 file hash，因此不以总字节数宣称四轮 bundle 全部 byte-identical。额外保存的 Vercel-like inventory 与随后 CI build **逐一比较 7,245 个文件 SHA-256，changed=[]**；这是这两轮的完整文件内容稳定性证据。CI 的 data/asset manifests 同样与前三轮一致。

## 15. Build Output Sanity Check

Vercel-like 完成后的只读逐文件 SHA-256 inventory：**7,245 files / 409,735,659 bytes / 390.75 MiB**，不是 prompt 的旧基线约 7,241 / 382 MiB。本轮四次 build 均相同；没有旧同 commit output，不能把差值称为回归。

| 组成 | 文件数 | Bytes |
| --- | ---: | ---: |
| general assets | 2,248 | 121,841,064 |
| tracked enemy snapshot | 212 | 16,214,202 |
| generated public JSON 两 locale 合计 | 384 | 26,631,122 |
| `/en/` 页面与 page data | 2,154 | 122,974,455 |
| client `_app` | 89 | 792,966 |
| HTML 全部 | 2,155 | — |
| JSON 全部 | 2,160 | — |

2,154 个公开页面 index 加 404，对应 manifest 1,077 locale-neutral page routes × 2。资源引用闭包扫描 4,403 个文本文件、索引 9,435 路径，route/slash/404 verifier 均通过。build 中没有 `.upstream`、`.git`、`node_modules`、`src` 或 `server` 路径段；data runtime/private source tree 没有整树复制到 public。

`.svelte-kit/output/server` 是 SvelteKit SSR/prerender 中间产物，不是 `outputDirectory=build` 的静态发布树。日志里的 `2026-09-03-initial-release.js` / `...2.js` 等是两个 locale 的同名 changelog 模块经 bundler 消歧；不能把两份 server listing 当作同一 chunk 被重复发布。HTML 与 `__data.json` 服务首次渲染/客户端导航，两种 locale、overview/detail、preview/portrait 各有用途。

最终 build 精确内容 hash 找到 **73 组 byte-identical 文件**，保留每组一份后理论可省 **417,770 bytes（约 0.10%）**；较大样本是不同角色/形态 ID 的技能/星魂图标，例如 `11212_technique.png` / `1212_technique.png`、`8007_rank6.png` / `8008_rank6.png`。这是小规模语义 URL 重复，不是整套 JSON 重复复制的证据，不值得仅为文件数重构 routing。全表保留于 `build-inventory.json` / `build-sanity.json`。

## 16. Potential Stale / Legacy Implementation

| Candidate | Why it appears stale | Why it may still be needed / evidence | 判定 |
| --- | --- | --- | --- |
| `adapter({fallback:'404.html'})` | 平台要求删除 options | smoke/route verifier 直接读取该文件；静态契约 | intentional，保留 |
| `scripts/assets/validate.ts` | 仅调用 verifyAssets 的小 wrapper | package `assets:validate` 仍指向它；对外命令兼容 | 可简化 alias，非 orphan |
| `assets:sync:enemies` / `assets:ensure:enemies` | 历史命名 | 转发 updater/离线 snapshot validator，仍是 package script | compatibility aliases，未确认删除安全 |
| `scripts/data/validate.ts` | 新增 full/build-inputs 后像旧入口 | validate-full → validation/full → dynamic import validate.ts | 核心 full validator，明确使用 |
| ensure 后又 production validate | 验证 artifact 有重叠成本 | producer postcondition 与独立 reopen trust boundary 不同；CI 还验证语义 | 值得测量，不能直接合并/删除 |
| standalone `prebuild` 与 deploy build | 两套相似动作 | developer sibling flow vs pinned deployment profiles；编排不调用 build | 明确入口差异，非双执行 bug |
| Windows rename/copy fallback | workaround 分支本轮未进入 | Windows EPERM/EACCES/EBUSY 有明确处理；测试/历史记录有依据 | 保留；本轮无充分理由淘汰 |
| offline source fallback | production 永远禁用 | predev/prebuild 仍支持离线已验证数据 | 有效 local branch |
| Enemy manifest schema 1/2 loader | snapshot 已 schema 3 | runtime decoder 显式接受 1/2/3；有历史 fixture/兼容职责 | potential legacy；单独契约调查后决定 |
| `Enemy.weaknesses @deprecated` | 类型注明 deprecated | projection/enemy.ts:359、384–390 仍生成和解构用于 catalog | 仍有消费者；不能删除 |
| `scripts/investigations/search-performance.ts` | 没有 package alias | `docs/search-v2.md:96` 明确手工命令 | documented maintenance tool |
| 部署文档旧 enemy ensure/schema2；architecture schema44；AGENTS 中文-only | 与当前 snapshot3、data46、en public route 不一致 | 新段落/代码已更新，旧文字残留 | **confirmed stale documentation**，不是 confirmed dead implementation |

关键词只是定位线索。没有证据支持“warning 多 → 大量 stale code”；本轮未发现 confirmed orphaned deployment/build implementation。兼容接受旧 schema 的最小范围及外部手工使用无法仅靠静态引用完全证明。

## 17. Script Reachability / Call Graph

`call-graph.json` 保存 **105 个 scripts** 的 TS AST string-relative import 与 package script 映射，唯一没有代码/package caller 的 `search-performance.ts` 有明确文档手工入口；`script-references.json` 保存文档/配置补充引用。该分析不把文件名相似或单次 grep 无结果视为删除依据；动态/外部手工调用仍需文档核对。

| 分类 | 代表 |
| --- | --- |
| definitely used | deployment/build/clean/verify-build/verify-routes；data/ensure/sync/validate-full；assets/ensure/verify/enemies/validate |
| indirectly used | deployment/git/lock/prepare/telemetry；data/validation/full → validate.ts；assets/shared/observation/pool |
| maintained/manual/updater | update-upstream-lock、enemy sync/network/curl/snapshot、search-names update、player-aliases sync、data audit/debug/measure、relic-score maintenance |
| documented manual-only | investigations/search-performance.ts |
| confirmed orphaned | 未确认 |

Actions updater 直接调用 upstream lock、enemy snapshot、official name、alias sync/check，并显式维护这些 tracked 文件。不能因 production build 不调用这些工具而把它们认定为 abandoned。

## 18. Dependency / Toolchain Hygiene

Observed installed/lock：SvelteKit 2.70.3、adapter-static 3.0.10、Svelte 5.57.0、vite-plugin-svelte 7.3.0、Vite 7.2.4、Vitest 4.1.11、TypeScript 5.9.3、Playwright 1.62.1、Paraglide 2.25.0、sharp 0.35.3。

plugin 7.3.0 的 Vite 8 peer mismatch 是明确 actionable finding；Kit 自身同时支持 Vite 7/8，不能以 Kit 宽 range 抵消 plugin 限制。`latest` specifier 被 lockfile/frozen install 固定，因此不代表每次 deployment 自动升级；但下一次维护 refresh 范围很宽，应显式测试版本组合。未做 fresh install；pnpm 11 默认 `strict-peer-dependencies=false`，现有 no-op 检查无 warning 不能证明依赖矩阵兼容。

`pnpm outdated --format json` exit 1 表示存在 outdated 结果，stderr 空，14 个 direct dependencies 可更新，均 `isDeprecated=false`。其中 TypeScript 7.0.2、Vite 8.3.1、Vitest 5.0.2 是 registry 返回的 major 差异，不是本轮升级建议；其余包括 patch/minor。版本查询是 2026-09-27 快照，原 JSON 保留。

lockfile 未发现 `deprecated:` 元数据；这不是完整供应链安全审计，也不证明所有 transitive package 在 registry 永无 deprecated。依赖使用同时覆盖源码、Vite/Svelte/ESLint/Prettier 配置、inlang module 配置与 CLI，未确认可直接移除的 direct package。锁文件证明 Vite 7.2.4 → esbuild 0.25.12，tsx 4.23.13 → esbuild 0.28.1；两份来自不同工具约束，不应强制 dedupe。沙箱内 `pnpm why` 的 SQLite store 权限失败不属于构建异常。

## 19. Findings by Severity / Proposed Follow-up

| 类别 | 后续工作 | 收益 / 风险 / 验收条件 | Confidence |
| --- | --- | --- | --- |
| A Should Fix | 对齐 plugin/Vite peer matrix | 消除 unsupported combination；升级有 compiler/runtime 风险。锁文件审查、正确性 pipeline、关键浏览器 smoke | High |
| A Should Fix | 明确 Node/pnpm/runtime/types 支持矩阵 | 避免 CI22/Prod24+ 漂移；先核实云端版本，major migration 独立审阅 | High（风险） |
| A Should Fix | 更新现行文档中的旧 schema/敌人流程/locale 描述 | 低风险维护收益；不改代码或输出契约 | High |
| B Worth Optimizing | 记录 cache miss 子原因与 restored manifest inventory | 区分冷启动、schema、source、artifact 损坏；低风险但注意日志体积 | High |
| B Worth Optimizing | 在 producer key 设计后评估 persistent cache | 能节省生成成本；错误跨 commit reuse 风险高，必须 cold/warm correctness 一致 | Medium |
| B Worth Optimizing | 缩减 Vite file listing、跨 locale 重复 neutral summary | 改善可读性；保留 counts、样本、error、详细 artifact | High |
| B Worth Optimizing | 统一 messages compile 重复执行、测量重复验证 I/O | 要先区分 plugin/CLI/compiler trust boundary；不能降低门禁 | Medium |
| C Expected / Keep | adapter warning、upstream data characteristics、enemy unavailable23、schema/route/assets validators | 保留当前业务/部署语义，不追求零 warning | High |
| C Expected / Keep | Windows 发布 fallback、开发离线 fallback、手工/updater tools | 有调用边界和合理用途 | High |
| D Separate Investigation | zero-config feasibility | 必须同时验 404、slash、locales、outputDirectory、API 与 manifest routing；无部署性能收益证据 | High（需独立） |
| D Separate Investigation | 云端连续 build cache/file inventory 与 Node24 实验 | 本机不能证明云端持久化/当前 runtime；不需本轮部署 | High（限制） |
| D Separate Investigation | producer schema discipline、异常 cache schema、自定义资产内容完整性 | 现有 key 不自动纳入脚本/工具版本；接入持久化前必须封闭这些边界 | Medium |

建议顺序：先消除 peer/runtime 矩阵不确定性并修订文档，再改进 miss observability，最后设计持久化；zero-config 单列评估。本轮所有建议均未实施。

## 20. Things Explicitly Not Changed

未修改 runtime configuration、engines、adapter options、404/prerender/trailing slash、upstream lock、maintained snapshots、源逻辑、评分算法、UI 或 dependency lock。未操作两个 sibling repo 的内容/分支。未执行 Vercel Preview/Production 部署，未提交 commit。临时 helper 在实验完成后删除，日志/数据证据保留于 ignored audit 目录。

## 21. Final Verification / Conclusion

最终 `git status --short`：

```text
?? docs/investigations/deployment-warning-cache-audit-2026-09-27.md
```

`git diff --check` 无输出；两个 sibling repo 的最终 `git status --short` 与初始一致，均为空。无 tracked source diff、无新 commit。运行中的暂存资源目录已由 pipeline 正常收尾，审计的 `run.ps1` 和 `inspect.cjs` helper 已删除。原始日志、结果 JSON、cache hashes、call graph、依赖查询、官方文档快照及 output inventory 保留在 ignored audit 目录，可本地复核；未把大体积日志或 generated artifacts 写进报告目录。

**结论：** 当前 cache 的本地 Cold/Warm 行为正常，重复 hit 与 manifest/content 稳定性有实测支持；未发现本轮条件下的 confirmed cache bug 或 confirmed stale implementation。存在可确认的 peer dependency 配置不兼容、Node 支持矩阵漂移风险和过时文档。adapter 提示、已分类 upstream diagnostic 与部分本地 E2E 日志来源清楚，可保留。云端 cache persistence、实际 Node major、zero-config routing 迁移仍需独立证据，不能用本地成功替代。
