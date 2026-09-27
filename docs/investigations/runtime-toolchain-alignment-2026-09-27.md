# Node 24 / Vite 8 工具链对齐验收

日期：2026-09-27。实施分支：`develop`，基线 HEAD：`a1eee615e4224298dcb886cb6fc23515c0b6f8a9`。本轮承接 [原始 warning/cache 审计](deployment-warning-cache-audit-2026-09-27.md)，保留该未跟踪报告原文。没有 commit、push、PR 或 Vercel Preview/Production 部署。

## 版本与环境

| 项目 | 修改前 | 最终 contract / 实测 |
| --- | --- | --- |
| Node engines | `>=22` | `24.x` |
| 本地 Node | 系统 `22.19.0` | 已有 `24.19.0`，仅进程 PATH 切换，未替换系统安装 |
| `.nvmrc` | 无 | `24` |
| pnpm | packageManager `11.9.0`，engines `>=10` | packageManager 不变；engines `>=11.9.0 <12` |
| Vite | `7.2.4` | 精确 `8.3.1` |
| `@types/node` | `latest` → `26.4.1` | 精确 `24.19.0` |
| Svelte plugin | `7.3.0` | 不变 |
| SvelteKit / Svelte | `2.70.3` / `5.57.0` | 不变 |
| adapter-static / TypeScript | `3.0.10` / `5.9.3` | 不变 |
| Vitest / Playwright | `4.1.11` / `1.62.1` | 不变 |
| CI / updater / Preview setup-node | `22` | `24` |
| workflow Vercel CLI | `59.16.0` | 不变 |

实际 Node executable 为 `C:/Users/unkn0/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`。日志同时记录主进程与通过 PATH 启动的子进程版本/路径，以及 pnpm `11.9.0`。部署脚本通过 `process.execPath` 启动 pnpm 子任务。所有网络访问配置 `http://127.0.0.1:7890`，localhost/127.0.0.1 留作本地 smoke 通信。

计划阶段通过只读 `vercel project inspect hsr-database --scope team_w4psqb7cOf7hHFyLqkWgUNEQ` 确认：`oereo-studio/hsr-database`，project ID `prj_1Vn2RGpC3FkuhINPMwgZx0jBkElK` 与本地链接一致，远程 Node 已为 `24.x`，build command `pnpm deploy:build`，output `build`。无需且未执行远程设置修改。该只读查询使用本机 CLI 48.0.0，不能混同于 workflow 固定的 CLI 59.16.0。

## 受控依赖解析

首次 `pnpm add -D --save-exact vite@8.3.1 @types/node@24.19.0` 意外刷新了其他 `latest`（包括 plugin、Svelte、Vitest）。该次 package/lockfile dependency diff 已撤回。

随后从原 lockfile 恢复，临时把全部非目标直接依赖约束为原 resolved version，执行严格 peer 安装，再恢复它们原有 `latest`、范围或精确 specifier。最终逐项比较 30 个直接依赖，只有 Vite 与 Node typings 改变。`@napi-rs/lzma-linux-x64-gnu@1.5.1` 经引用核对属于移除的 Rollup optional dependency，其元数据随该子树移除。

允许的依赖变化包括：移除 Vite 7 独占 Rollup 4.62.4 / esbuild 0.25.12 及其平台包；增加 Rolldown 1.2.11、Oxc types 0.151.0、pluginutils 1.0.1、Lightning CSS 1.33.0 与平台包、PostCSS 8.5.28、picomatch 4.0.7、nanoid 3.3.19；Node typings 使用 undici-types 7.24.6。其他消费者仍使用原有 Lightning CSS 1.32.0、PostCSS 8.5.25、picomatch 4.0.5 等版本。tsx 需要的 esbuild 0.28.1 保留，也满足 Vite 的 optional peer。长 importer/snapshot key 的大量行变化来自 Vite/Node typings 的 peer context。

最终 `pnpm install --frozen-lockfile --strict-peer-dependencies` 结果与 lockfile 摘要见下方验收记录。未更改 pnpm workspace 的 install-script allowlist。

## Vite 8 兼容性检查

依据 [Vite 8 官方迁移说明](https://vite.dev/guide/migration) 并核对安装包实现：

- 采用 Vite 8 默认 Baseline 2026-01-01 浏览器目标：Chrome/Edge 107 → 111、Firefox 104 → 114、Safari 16.0 → 16.4；安装包同时列出 iOS 16.4。未添加旧浏览器 target 覆盖。
- Rolldown/Oxc 接管 bundling、JS transform/minification 和 dependency optimization。项目没有自定义 Rollup/esbuild/minifier 配置需要转换；保留现有 Vite/Svelte 配置。
- 检查自定义 `buildStart`/`handleHotUpdate` hooks、Paraglide、Tailwind 和 Svelte plugin 组合；构建覆盖 message/changelog 校验、SSR/client 编译与 prerender。HMR hook 保留原样，本轮没有单独执行交互式 HMR 验证。
- SSR、CommonJS interop、环境加载的迁移风险由实际 build 与 smoke 检查覆盖；未引入自定义 Environment API、环境替换或 SSR 配置。
- chunk 名、hash、体积允许变化；最终发布目录必须仍为静态 `build/`，不包含 `.svelte-kit/output/server` 中间产物。

## Cache reason 改善

保持 `[deploy:cache] <owner> result=... reason=...` 协议。仅通过内部类型化结果与可选诊断回调传递当前操作已观察到的原因，不增加 manifest/TextMap 读取、artifact validation 或图片内容检查。

| 范围 | 原因 |
| --- | --- |
| Data manifest | `manifest-missing`、`manifest-read-failed`、`manifest-parse-failed`、`manifest-schema-invalid` |
| Data artifact/source | 保留 `generated-artifacts-invalid`；区分 `source-changed` / `textmap-changed`，同时变化时 source 优先 |
| Data search | 保留 `+search-artifact-refreshed` 后缀，刷新后仍按原流程验证一次 |
| General asset manifest | `manifest-missing`、`manifest-read-failed`、`manifest-parse-failed` |
| General asset checks | `filesystem-observation-failed`、`source-changed`、`requirements-fingerprint-changed`、`manifest-schema-invalid`、`requirements-coverage-mismatch`、`generated-files-missing` |
| Hit/fallback | 原有 hit reason、`source-unavailable-valid-cache`、general-assets `no-valid-fallback` 不变 |

General assets 仍先观察文件系统，再按 source → fingerprint → schema/coverage → files 顺序短路；expected commit 门禁仍在观察前。schema/coverage 中原本会抛出的异常不转换成 rebuild。Data reader 保留异常对象，asset reader 保留失败返回 `undefined` 的契约。`manifestFilesExist` 仍返回 boolean；只报告文件存在性或 observation failure，没有虚构 `generated-files-invalid` 内容校验。

Cache schema（data 46、general assets 16、enemy snapshot 3）、keys、持久化、发布流程、校验复用和 enemy telemetry 均不变。新增/扩展 fixture/mock 测试覆盖 read/parse/schema、source/TextMap、hit 不 sync、miss 一次 sync、一次 candidate validation、search refresh、离线 fallback、deployment source failure 和 malformed manifest 异常。

## 文档修订

- README / AGENTS：Node/pnpm baseline，中文无前缀与 `/en/` 双语公开路由，URL-authoritative locale 和显式 message locale。
- 现行架构文档：data schema 46、general asset schema 16、tracked enemy snapshot schema 3，以及完整 CI 与 Production integrity 的分工。
- 部署基础文档：移除过时 enemy ensure 入口，明确 `validate.ts` 离线验证与 `sync.ts` 显式更新边界；updater 先刷新所有维护产物再检查 diff。
- 搜索文档：`views/{locale}/search-inputs.json`、`static/generated/{locale}/search.json`、Search schema 3、中文 alias-only refresh、当前 updater/CI 顺序。
- 既有历史测量的 Node 22、schema、旧路径和结果保留在历史章节，不重写为当前事实。

## 验收结果

| 验收 | 结果 | 外部耗时 |
| --- | --- | --- |
| Node 主/子进程、pnpm | `24.19.0` / `24.19.0` / `11.9.0` | 各阶段 runtime log |
| 受控安装 + strict frozen install | exit 0；无 engine mismatch、无目标 peer mismatch；最终锁文件前后摘要一致 | 最后一次 0.35s |
| 初始缓存定向测试 | 3 files / 29 tests 通过 | 14.62s（Vitest 2.52s） |
| `pnpm ci:validate` | exit 0；67 files / 714 tests；Svelte 0 errors / 0 warnings；type/lint/full semantic/build/route/closure 全通过 | 344.09s |
| `PLAYWRIGHT_REUSE_BUILD=1 pnpm test:e2e:smoke` | 5/5 通过，无重建 | 6.79s |
| `VERCEL=1 VERCEL_ENV=production pnpm deploy:build` | exit 0；Production integrity、adapter、output smoke、route/closure 全通过 | 210.73s |
| 最终诊断边界复核 | 3 files / 32 tests；脚本 TypeScript 与定向 ESLint 通过 | 定向测试 6.31s（Vitest 2.77s） |
| 最终 diff / 输出 / 摘要 | `git diff --check` 通过；30 个直接依赖仅目标两项变化；465 个受保护文件无变化 | 只读检查 |

完整 CI 已包含新增真实 observation failure 与 no-valid-fallback 测试。最后审查补了一项 parsed-null fixture，并把该情况下的默认日志原因从 missing 改为 schema invalid；原有 rebuild 行为不变，新增分支经过最终定向测试、脚本类型检查与 lint，没有重复整套 CI。最后清理 Rollup 已移除子树的残留 lockfile 元数据后再次执行 strict frozen install，安装的 resolved versions 未变化。

两个主流水线的实际 cache 记录均为：

```text
[deploy:cache] data result=hit reason=manifest-source-and-artifacts-match
[deploy:cache] general-assets result=hit reason=manifest-source-and-files-match
[deploy:cache] enemy-assets result=hit reason=tracked-snapshot-valid
```

两份 pinned checkout 均复用。没有首次 rebuild，因此未补额外 warm build，也未执行四轮 benchmark。Production stage：data ensure 5.165s、build-input validation 4.268s、assets ensure 0.160s、assets verify 1.107s、enemy snapshot validate 0.804s、Vite 46.381s、route verify 1.175s。

Smoke 覆盖首页与客户端导航、搜索页语言切换及结果、敌人直达与核心交互、资源失败时 accessible fallback、移动导航。没有变更现有场景或门禁。

### 静态输出

- 仍为 **1,077 个 locale-neutral route paths × 2 locales = 2,154 个 page indexes**；HTML 共 2,155 个，包含 `build/404.html`。
- trailing slash 的配置/路由源码摘要不变，现有 route/internal-link verification 通过。
- 资源闭包扫描 4,398 个文本文件，索引 9,430 条路径；无缺失视觉资源引用。
- `build/generated/` 共 384 份 JSON response（含 380 个无 `.json` 扩展名的 prerender endpoint），26,631,122 bytes，全部可解析，逐文件摘要与上一轮 inventory 相同；其中 4 份 static JSON 与源文件逐字节一致。
- 最终 build 为 7,240 files / 409,057,123 bytes（390.11 MiB）；旧 Vite 7 基线 7,245 files / 409,735,659 bytes。差异允许来自 bundling，不作为性能收益结论。
- `build/` 中未出现 server、`.svelte-kit`、`.upstream`、`node_modules`、scripts 或 source 中间目录。日志中的 `.svelte-kit/output/server/*` 仍只是构建中间产物。

### Warning 与耗时观察

| 类别 | 结果与处置 |
| --- | --- |
| Vite/plugin peer mismatch | 对齐 Vite 8 后严格安装通过；plugin 7.3.0 未降级 |
| Node engines 平台提示 | `24.x` 不再开放未来 major，且与只读确认的项目 Node 24.x 一致；相关触发条件已消除，**未声称完成云端复验** |
| adapter-static 提示 | 本地 Vercel-like Production 仍输出 `Detected Vercel. Please remove adapter-static options to enable zero-config mode`；保留 fallback 配置，没有为消除日志改变部署语义 |
| 上游数据诊断 | full CI 保留 zh/en classified fallback 各 13,041、optional missing 1,716/1,704、enemy conflict 13（每 locale 一次）、544 个缺失 TextHash 与 A 类 544；未过滤或改写 |
| 终端颜色冲突 | smoke 保留 7 次 `NO_COLOR` / `FORCE_COLOR` 提示 |
| 本地 analytics 404 | smoke 保留 6 次 `/_vercel/insights/script.js` 404；未禁用线上 analytics |
| 新增 `PLUGIN_TIMINGS` | CI 与 Production 各出现两组，来自 Rolldown 的默认耗时检查，见下文 |

根据 [Rolldown 官方 bundlerTimings 说明](https://rolldown.rs/reference/InputOptions.checks#bundlertimings)，该提示在内部 build 超过 3s、插件时间相对 link stage 较大时出现；回调计时包含其内部 await，`closeBundle` 可发生在 build 计时结束之后，所以回调总时间可以超过 build 时间。本地安装代码确认默认启用。Production 的 client 提示主要为 `vite:prepare-out-dir`；SSR 提示主要为 SvelteKit `writeBundle` 31.4s、`closeBundle` 7.6s，另有 Paraglide、Tailwind 和 guard。构建与 smoke 成功，没有发现对应兼容错误；保留提示，不通过关闭 checks、删插件或削弱校验掩盖它。

**待观察的流水线耗时：**资源闭包校验在 CI/Production 中分别为 157.217s / 147.433s，旧审计约 4.5–5.4s。因该差异重复出现，额外对同一校验函数做了一次只读、独立进程的 I/O 拆分：Node 24 下仅 **1.369s**，读取 4,398 files 共 0.747s，readdir 共 0.110s，stat 共 0.191s，结果相同。这证明脱离完整流水线后未复现慢路径，但尚不能区分流水线进程状态、文件系统时序或主机负载等原因；不能据此断言纯 Node/Vite 回归，也不能宣称性能改善。本轮保留校验，实现未扩展到并发扫描或架构调整。后续若需要性能收敛，应直接在流水线内采样该阶段，避免再跑无目标的多轮 benchmark。

## 最终边界与摘要

| 文件/缓存 | 最终 SHA-256 | 与基线关系 |
| --- | --- | --- |
| `pnpm-lock.yaml` | `edc794bfcf588fcc50da1a1b8e0ce56db7c1132c3f78ef76644e89c2382fdb43` | 仅工具链依赖树/peer metadata 变化，36 个 package records 增加、57 个移除 |
| data manifest | `45e732303eb5d9d9fecc17b9c61dd5ec58e7256ae995a8f7cf06c29825e98373` | 不变 |
| general asset manifest | `183b46319fe6e17f5d9a7e5686baa3786ceac31d6cf649ea8d4e7587aa057d16` | 不变 |
| `upstream.lock.json` | `6ee8c45ff895943056e2f199664b521a3b292a0fa1f8e9ba30d79de045dd82c2` | 不变 |
| 原审计报告 | `dec52f9c99f6633bc1f3ebd3c7f74fe8fd0c7d2501ab13d8b41f1e653a65784f` | 不变，仍未跟踪 |

465 个受保护文件包括 tracked `src/`、`static/`、`data/`、upstream lock、Svelte/adapter 配置、Vercel 配置及原审计报告，摘要全部相同。因此网站 API/业务类型、UI、路由/404 配置、enemy snapshot、评分数据与 maintained metadata 未变化。新的 helper 只传递诊断，不引入 cache persistence 或改变 key/schema。

三个 workflow 的 diff 各只有 setup-node 22 → 24；触发器、权限、pnpm/CLI 版本、门禁、命令和分支策略均保留。工作树只包含本计划的配置、依赖、scripts、测试、现行文档和新报告；未跟踪 generated outputs、日志或无关文件。

两个 sibling repo 最终状态均与基线相同且干净：TurnBasedGameData `main` @ `4ce30f69b32dc259ab9a8da3ba57035485103221`，StarRailRes `master` @ `d226befe3db13f2ec15f4161d5f34b1b607643fe`。网站仍在原 `develop` HEAD，没有 staging、commit、push、PR 或远程部署；系统 Node 仍为 22.19.0。

剩余事项仅为：未来经授权的云端部署复验、上述流水线内闭包扫描时延的进一步定位。交互式 HMR 与旧浏览器完整兼容矩阵不在本次验收范围；浏览器目标提高是已确认的兼容性决策。

原始 stdout/stderr、耗时、进程版本、安装日志、direct dependency 前后清单、lockfile 比较及文件摘要保存在 ignored `data/audit/runtime-toolchain-alignment-2026-09-27/`。日志辅助脚本初次启动 CI 时遇到 PowerShell 单字符串 splatting 问题，修正为 `string[]` 后启动实际 CI；该问题未改变项目构建入口。
