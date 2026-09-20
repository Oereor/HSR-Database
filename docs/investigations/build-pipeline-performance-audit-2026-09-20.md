# Build Pipeline Performance Audit — 2026-09-20

## 1. Executive Summary

### 结论

本次调查**没有在同机、同依赖、同缓存状态下复现 `89b3b30 -> aa09011` 的代码级大幅性能回归**。

- cold-ish 完整构建中，`aa09011` 的 `data-ensure`、`data-validate`、`assets-ensure` 分别只比 `89b3b30` 慢约 14.6%、4.7%、3.8%，远低于 Production 日志中的 53%、83%、87%。
- warm 完整构建中，两版关键阶段几乎相同：`data-validate` 24.660s vs 24.729s，`assets-ensure` 0.280s vs 0.294s，Vite 26.775s vs 28.486s。
- 两版生成实体数完全一致；数据 artifact 只增加 2 个、61,482 bytes，资源文件只增加 95 个（其中 93 个玩家头像）、约 2.98 MiB。
- Vite 的稳定增量约 1.5–1.7s，与新增约 90 个 transformed modules 相符，不是线上观测到的额外 51s。
- 因为不存在能可靠区分快/慢版本的本地 classifier，本轮没有执行 git bisect，也无法诚实地给出 “first slow commit”。

Production 慢构建中，彼此独立的 CPU/文件系统密集阶段同时放大，而网络/checkout 密集的两个 upstream prepare 阶段几乎不变。结合本地对照，最有力的解释是：**慢部署的有效 CPU / 文件系统 / libvips 吞吐显著低于快部署，放大了管线中既有的串行和重复工作；不是 `aa09011` 中某一处算法或 Player Info 输出规模导致的 70% 级回归。** 由于现有 Production 日志没有 build-machine 资源与 CPU-time 数据，这一项列为 strongly supported，而不是 confirmed。

用户本地感受到的变慢可以由 cache 状态解释：本机完整构建从 cold-ish 的 155–202s 降到 warm 的 60–63s。`aa09011` 同时提升了 data manifest schema 和 asset manifest schema，首次构建会强制重新生成数据与全部资源，之后 `data-ensure` 从约 33s 降到 4.4s，`assets-ensure` 从约 47s 降到 0.3s。

### 已确认的结构性成本

这些成本值得后续优化，但它们在 old/new 两版中都存在，不是本次历史回归的来源：

1. `data-ensure` 和 `data-validate` 是独立 child process，重复读取、解析、hash 和验证同一批大型 JSON。
2. cross-locale structural parity 是最大 CPU 热点：cold `data-ensure` 约 7.2s，`data-validate` 两版均约 6.1–6.2s。
3. structural parity 的成功路径仍对每个对象做四次完整 projection：先生成 `leftProjection/rightProjection`，随后 `digest(left/right)` 又各生成一次。
4. 资源生成按资源串行执行 `stat -> transform`；cold assets profile 中主线程约 46.2s 处于 idle，实际在等待文件系统/libvips。该阶段天然容易被较慢存储或受限 worker 放大。
5. Vite 主进程大部分时间在等待 prerender/adapter 文件工作；新增 Player Info 的稳定成本只有约 1.5s。

## 2. Scope and Pipeline

调查范围为 `package.json`、deployment/data/assets scripts、Vite/SvelteKit 配置、直接依赖模块，以及 `89b3b30..aa09011` 的逐提交历史。没有修改生产逻辑、关闭验证、减少输出或改动两个上游仓库。

Production 实际执行链：

```text
deploy:build
  -> 并行：messages:compile
           prepare TurnBasedGameData
           prepare StarRailRes
  -> data:ensure                 (新 child process)
  -> data:validate               (新 child process)
  -> 并行：assets:ensure:enemies (新 child process)
           assets ensure         (deployment process 内 lazy import)
             -> assets verify
  -> svelte-kit sync             (新 child process)
  -> vite build                  (新 child process)
       -> client build
       -> SSR build / prerender
       -> adapter-static output
  -> deploy:verify               (新 child process)
  -> deploy:verify:routes         (aa09011 新增；新 child process)
```

重要实现细节：

- deployment 将 `data-ensure` 与 `data-validate` 串行放在两个进程中，无法共享已 parse 的 TextMap、raw tables、projection 或索引。
- `data-ensure` 的 cache hit 仍会 hash/parse 2,000+ 个生成 artifact，并重新 parse 两个完整 TextMap 计算 digest。
- `data-validate` 再次验证所有生成 artifact、再次读取两个 TextMap、再次读取 raw tables，并重建 locale projection、search、endgame 与 structural parity。
- Vite `buildStart` 会再次检查 site messages 和 changelog；`svelte.config.js` 在配置顶层同步读取 generated manifest 并展开全部 prerender entries。
- general assets 与 enemy assets 合理并行；general assets 内部的资源处理则是逐项串行。

## 3. Benchmark Environment

| Item | Value |
|---|---|
| OS | macOS 27.0 (Darwin 27.0.0, arm64) |
| Machine | MacBook Air (Mac14,2) |
| CPU | Apple M2, 8 cores (4 performance + 4 efficiency) |
| Memory | 16 GB |
| Node | v26.5.0 |
| pnpm | 11.9.0 |
| Package lock | `pnpm-lock.yaml` identical between both commits |
| Old commit | `89b3b30f06f64d352d37e53e064cdb85383b8890` |
| New commit | `aa090117a5513e7566fc007d95df78c21d96680a` |
| TurnBased old/new | `8dc7843723cf...` / `4ce30f69b3...` |
| StarRailRes | both `d226befe3db1...` |
| Isolation | detached git worktrees, independent node_modules and generated outputs |
| Mode | `VERCEL_ENV=production`, real deployment script and all production checks |

主 `develop` 分支在调查开始时干净，HEAD 为 `86a2357`。外部仓库初始状态：TurnBasedGameData clean；StarRailRes 预先存在未跟踪 `icon/.DS_Store`。调查没有改动两个外部仓库。

本机 pnpm 11.9.0 是原生 executable；`scripts/deployment/build.ts` 把任意 `npm_execpath` 当作 JavaScript 文件交给 Node，直接运行 `pnpm deploy:build` 会立即失败。基准因此使用同一个顶层 TSX 入口直接启动，内部仍执行原有 pnpm child commands。这个兼容性问题与性能回归无关，但应单独修复。

## 4. Old vs New Benchmark

### 4.1 Production 日志（任务输入）

| Stage | 89b3b30 | aa09011 | Delta | Ratio |
|---|---:|---:|---:|---:|
| messages-and-script-checks | 7.4s | 10.5s | +3.1s | 1.42x |
| prepare-turnbased | 27.8s | 27.5s | -0.3s | 0.99x |
| prepare-starrailres | 53.6s | 53.1s | -0.5s | 0.99x |
| data-ensure | 91.4s | 140.2s | +48.8s | 1.53x |
| data-validate | 63.2s | 115.9s | +52.7s | 1.83x |
| enemy-assets-ensure | 26.0s | 28.7s | +2.7s | 1.10x |
| assets-ensure | 72.4s | 135.3s | +62.9s | 1.87x |
| assets-verify | 0.8s | 1.8s | +1.0s | 2.25x |
| vite-build | 55.0s | 106.2s | +51.2s | 1.93x |
| deploy-verify | 2.6s | 4.8s | +2.2s | 1.85x |
| total | ~313s | ~535s | +222s | 1.71x |

prepare 阶段保持不变，而后续 CPU/文件系统密集阶段广泛同时变慢。这不是单个新 feature code path 的典型形状。

### 4.2 本地 cold-ish 完整构建

两个 worktree 首次运行，均没有 data/asset/enemy cache。upstream 已在本地按 commit 准备，因此 prepare 数字不可与 Vercel clone/fetch 数字比较。enemy assets 包含实时网络下载，亦只作环境记录。

| Stage | 89b3b30 | aa09011 | Delta | Ratio |
|---|---:|---:|---:|---:|
| messages-and-script-checks | 4.329s | 4.509s | +0.180s | 1.04x |
| prepare-turnbased | 0.035s | 0.039s | +0.004s | 1.11x |
| prepare-starrailres | 0.066s | 1.605s | +1.539s | 24.32x* |
| data-ensure | 28.795s | 32.995s | +4.200s | 1.15x |
| data-validate | 23.707s | 24.824s | +1.117s | 1.05x |
| enemy-assets-ensure | 68.748s | 62.380s | -6.368s | 0.91x |
| assets-ensure | 45.263s | 46.963s | +1.700s | 1.04x |
| assets-verify | 0.425s | 0.453s | +0.028s | 1.07x |
| vite-build | 74.641s | 27.899s | -46.742s | 0.37x* |
| deploy-verify | 1.386s | 1.166s | -0.220s | 0.84x |
| route-verify | — | 1.316s | +1.316s | — |
| total | 201.610s | 155.100s | -46.510s | 0.77x* |

`*` 首次旧版 Vite 承担了机器上的冷编译/文件缓存成本；其 warm run 降至 26.775s。prepare-starrailres 的绝对差异只有 1.5s，且本地均为 checkout reuse。不能用这些星标值作版本归因。

### 4.3 本地 warm 完整构建（可比主结果）

| Stage | 89b3b30 | aa09011 | Delta | Ratio |
|---|---:|---:|---:|---:|
| messages-and-script-checks | 2.045s | 2.054s | +0.009s | 1.00x |
| prepare-turnbased | 0.037s | 0.034s | -0.003s | 0.92x |
| prepare-starrailres | 0.104s | 0.081s | -0.023s | 0.78x |
| data-ensure | 4.463s | 4.384s | -0.079s | 0.98x |
| data-validate | 24.660s | 24.729s | +0.069s | 1.00x |
| enemy-assets-ensure | 1.324s | 0.938s | -0.386s | 0.71x |
| assets-ensure | 0.280s | 0.294s | +0.014s | 1.05x |
| assets-verify | 0.724s | 0.633s | -0.091s | 0.87x |
| vite-build | 26.775s | 28.486s | +1.711s | 1.06x |
| deploy-verify | 1.212s | 1.144s | -0.068s | 0.94x |
| route-verify | — | 1.269s | +1.269s | — |
| total | 60.482s | 63.007s | +2.525s | 1.04x |

新版多出的 2.525s 总耗时中，1.269s 是 `2ca3b12` 明确新增的 route verification；剩余约 1.3s 在正常运行方差内，且主要与 Vite 多编译约 90 个模块一致。

### 4.4 输出规模

| Metric | 89b3b30 | aa09011 | Delta |
|---|---:|---:|---:|
| Domain counts | 97 chars / 169 LC / 60 relic / 628 enemies | 相同 | 0 |
| Data artifacts | 2,122 | 2,124 | +2 (+0.09%) |
| Data artifact bytes | 382,959,419 | 383,020,901 | +61,482 (+0.016%) |
| Route paths | 1,076 | 1,077 | +1 |
| Generated asset files | 2,153 | 2,248 | +95 (+4.41%) |
| Generated asset disk use | ~126.2 MiB | ~129.2 MiB | ~+3.0 MiB |

## 5. Profiling Findings

### 5.1 `data-ensure`

在 `aa09011` 上强制 cold generation 后运行 V8 CPU profile：

| Self time | Function / area | Observation |
|---:|---|---|
| 7.187s | `structural-parity.ts: project` | 最大业务 CPU hotspot |
| 3.502s | garbage collector | 大量临时 projection/JSON 对象 |
| 1.384s | `structuredClone` | projection / artifact 构建 |
| 1.339s | `sync.ts` main body | 顶层同步编排 |
| 1.283s | `verifyGeneratedArtifacts` | 生成后再读取/校验 |
| 1.247s | `validateGeneratedArtifacts` | 对全部 artifact 逐个 read/hash/parse |
| 1.189s | `writeJson` | 序列化与输出 |
| 1.152s + 1.047s | English CJK scan | 递归字符串收集与审计 |
| 0.986s | crypto hash update | artifact/TextMap digest |
| 0.434s | `loadTextMap` | 两 locale TextMap load/parse |

主要发现：

- `syncData` 会为 `zh-CN`、`en` 构建完整 projection，并执行 structural parity。
- `assertCrossLocaleStructuralParity` 在正常成功路径先计算两份 projection，再由 `digest()` 各重新计算一次，造成四次深度递归、key sort、对象创建和 stringify。
- `ensureData` 在生成前/后验证 artifact；之后 deployment 又启动完整 `data-validate`。正确性检查没有被绕过，但数据与索引不能跨进程复用。
- `aa09011` 新增的 player-equipment artifact 只带来 2 个 locale 文件和约 61 KiB，不足以解释线上额外 49s。

### 5.2 `data-validate`

old/new 独立 V8 profiles 的主要 self time：

| Function / area | 89b3b30 | aa09011 | Assessment |
|---|---:|---:|---|
| structural parity `project` | 6.240s | 6.066s | 稳定，无回归 |
| validation main body | 3.181s | 2.883s | 稳定 |
| garbage collector | 3.142s | 3.177s | 稳定 |
| English CJK `collectStrings` | 1.203s | 1.177s | 稳定 |
| English CJK audit | 1.027s | 1.007s | 稳定 |
| decimal `parts` | 0.734s | 0.745s | 稳定 |
| generated artifact validation | 4.109s | 1.217s | old 更慢；文件缓存方差，不是 new 回归 |

`data-validate` 会重新读取两个 locale 的完整 product tree、190 个 English occurrence shards、多组 raw Excel tables，并重建 search/endgame/structural parity。它确实包含高成本重复工作，但 old/new profile 没有新热点，也没有热点放大。

### 5.3 `assets-ensure`

`aa09011` cold V8 profile：

- wall time 约 47s；V8 主线程约 46.159s 标记为 idle。
- JavaScript self time 极低；耗时主要在等待 Sharp/libvips 与文件系统操作。
- `processRequested` 对每个 requested asset 串行执行 `await stat()`，随后串行 `await transform()`。
- 生成后 `validateGeneratedAssetFiles` 又逐文件调用 Sharp metadata 验证；deployment 随后还执行 `assets-verify`，不过通过 context/file index 避免了一部分目录重复扫描。

对照结果更关键：old/new cold 分别 45.263s / 46.963s，仅 +1.700s。新增 93 个头像是 plain `copyFile`，与该小增量吻合，不能解释线上 +62.9s。该阶段对 build machine 的存储吞吐和 libvips scheduling 很敏感，因此环境差异会被串行管线放大。

### 5.4 Vite / SvelteKit

Vite `--profile` 与构建日志：

| Metric | 89b3b30 | aa09011 |
|---|---:|---:|
| client modules | 701 | 791 |
| server modules | 688 | 778 |
| client build | 2.43s | 2.72s |
| server/prerender build | 21.52s | 23.01s |
| main-thread idle samples | 16.834s | 17.722s |
| `copyFile` samples | 2.388s | 3.014s |
| `rmSync` samples | 1.157s | 1.328s |
| Tailwind generate | 0.343s | 0.369s |

新增 Player UI 确实把 transformed modules 增加约 90 个，但实际稳定成本只有约 1.5s。profile 没有出现昂贵的 Player Info 顶层初始化；主要等待仍是 prerender/adapter 文件复制。`svelte.config.js` 顶层只读取一次 manifest 并展开 routes，没有发现每页重新 load 全量数据的新增副作用。

首次旧版 Vite 74.641s、随后 26.775s，说明本机的 OS/file/compiler cold state 可以制造约 48s 的单次差异。任何未记录 cache state 的“本地明显变慢”都不足以定位代码回归。

## 6. Git History Correlation

`89b3b30..aa09011` 中与 build cost 最相关的提交：

### `2ca3b12 Add trailing slash for site routers`

- 新增 `deploy:verify:routes` 并在 deployment build 末尾运行。
- 本地实测固定成本约 1.269–1.316s。
- route paths 只增加 1 条；不解释 Vite +51s。

### `617c2f1 Complete Phase 2 of MiHoMo API integration`

- 新增 player route/UI 与 93 个玩家头像需求。
- asset schema 15 -> 16，导致已有本地 asset cache 首次失效并进行全量重建。
- stable cold asset 增量 1.700s；Vite transformed modules +90。
- 这是本地“一次构建突然慢很多”的重要 cache invalidation 触发点，但不是持续的 87% assets regression。

### `c9571d8 Fix asset pipeline error`

- 把 data root 显式传给 asset requirements，修正 deployment source resolution。
- 没有改变核心循环、并发模型或 transform 数量。

### `43b3435 Complete Phase 4 of MiHoMo API integration`

- data schema 42 -> 43；新增每 locale 一份 `player-equipment.json`。
- 会令旧 data cache 首次失效；最终只增加 2 个 artifact / 61,482 bytes。
- cold `data-ensure` 增量 4.2s，`data-validate` 增量 1.1s；warm 两版相同。

### 其它提交

`b03bd4a`、`84a9a9b` 主要删除兼容/死代码；`73b11c0` 主要移动组件；后续 MiHoMo phases 主要增加 UI/runtime API。没有提交把 structural parity、artifact verification 或 asset processing 从并发改成串行；这些热点在 `89b3b30` 已存在。

### Bisect 决策

未执行。文档要求只有在阶段回归稳定、且有可靠便宜 classifier 时才 bisect。本地 warm 结果没有快/慢分类边界，cold 结果也只显示小增量；此时 bisect 会把文件缓存/机器方差错误归因给随机 commit。

## 7. Root Cause Assessment

### Confirmed

1. **本地无法复现 89b3b30 -> aa09011 的 70% 级持续回归。** warm 总耗时仅 +4.2%，其中一半是新增 route verification。
2. **Player Info 输出增长不是主因。** 数据 +0.016%，资源文件 +4.41%，对应本地 data/assets/Vite 小幅增量。
3. **本地 cache invalidation 可制造显著的一次性变慢。** data schema 与 asset schema 提升会让首次构建执行全量生成；warm 后关键 ensure 阶段从约 80s 合计降至约 4.7s。
4. **管线存在可量化的既有重复工作。** structural parity 在 ensure/validate 各花约 6–7s；artifact/TextMap/raw data 被不同进程重复读取和 parse。
5. **assets 和 Vite 对 I/O 吞吐敏感。** 两个 profile 的主线程均大部分时间 idle，分别等待 libvips/文件操作与 prerender/adapter copy。

### Strongly supported

1. **慢 Production build 的主要差异来自 build-machine 的有效 CPU/文件系统吞吐或同类运行时资源条件，而不是 HSR-Database 的特定 regression commit。** 证据包括：prepare 时长不变；多个独立重阶段同步放大；同机 old/new 不放大；输出规模近乎不变；profile 热点结构稳定。
2. **较慢环境放大了既有串行/重复设计。** 尤其 asset 串行 transform、structural projection、全 artifact hash/parse 与 adapter copy。

### Possible / 尚未验证

1. 两次 Vercel build 是否使用了不同 CPU allocation、存储层、Node patch version、构建区域或邻居负载。现有日志没有这些字段。
2. 慢构建是否遇到 thermal/fair-share throttling、较低 libvips worker 吞吐或文件 cache 完全冷却。
3. Vercel build cache restore 状态是否不同。单凭 stage wall time 无法区分。

## 8. Recommended Fix Plan

本轮没有实施以下优化。

### P0 — 先补齐可归因的 build telemetry

- 在每个 stage 同时记录 wall time、`process.cpuUsage()`、`process.resourceUsage()`、RSS、`os.availableParallelism()`、Node/pnpm 版本、关键输出文件数与 cache hit/miss 原因。
- 对 assets 额外记录各类别 transform 数、Sharp 操作数与累计等待；对 Vite 记录 client/server/prerender/adapter 子阶段。
- 目标：下一次 Production 变慢时区分 CPU throughput、I/O wait、cache invalidation 与工作量增长。
- 风险：低；只添加日志，不改变行为。
- 验证：同一 commit 连跑至少两次 Production-equivalent build，确认 telemetry 不改变输出 digest，且额外开销可忽略。

### P0 — 修复本地 pnpm executable 启动兼容性

- `runPnpm` 不应假设 `npm_execpath` 一定是可由 `process.execPath` 执行的 JS 文件。
- 风险：低，但涉及所有 deployment child commands。
- 验证：分别从 `pnpm deploy:build`、直接 TSX 和 CI package-manager 入口运行轻量 mocked deployment test，再做一次完整 build。

### P1 — 消除 structural parity 内部的重复 projection

- 一次生成 left/right projection，直接对这两个 projection hash；不要让 `digest()` 再次递归 projection。
- 预计同时改善 cold `data-ensure` 与 `data-validate`，本机上限约为每阶段数秒。
- 风险：中；这是核心跨 locale 正确性验证，必须保证 digest 输入与当前完全一致。
- 正确性验证：现有 structural parity tests，加 synthetic mismatch path 测试；old/new generated manifest 和 artifact digest 全量比较。
- 性能验证：同一数据集分别 profile 修改前后，至少 3 次，报告 `project` self time 与 GC time。

### P1 — 为 asset transform 引入有界并发

- 将逐资源串行 `stat -> transform` 改为小的固定并发池；不同资源类别可分别限制，避免 Sharp 内存/线程过载。
- 预计主要改善 cold `assets-ensure`，尤其在高延迟文件系统上。
- 风险：中高；可能引入 FD 压力、内存峰值、libvips 争用和非确定错误顺序。
- 正确性验证：manifest、文件集合、尺寸/格式与全量 digest 必须完全一致；继续保留现有 metadata validation。
- 性能验证：并发度 1/2/4/8 的受控 benchmark，记录 wall/CPU/RSS，不以单次最快值决策。

### P2 — 减少 ensure/validate 跨进程重复加载

- 可选方向：让 ensure 产出可验证的结构校验摘要，validate 在独立检查摘要完整性的同时避免重复构建全部 projection；或在一个受控 process 中共享只读 parsed inputs。
- 预计改善 `data-validate` 和总内存分配。
- 风险：高；不能让 validate 变成“相信 ensure”，必须保留独立发现损坏/错误的能力。
- 验证：注入损坏 artifact、错误 TextMap、locale structural mismatch，确认 validate 仍独立失败。

### P2 — 分解 Vite 的 prerender 与 adapter timing

- 先加 hook/计时，不先改 prerender entries 或减少页面。
- 若后续确认 adapter copy 是主瓶颈，再研究输出发布方式；不能通过减少 routes 或跳过验证获得假加速。
- 风险：低（计时）到高（改变 adapter/output）。

## 9. Appendix

### 9.1 实际 benchmark 命令

在各 detached worktree 中，以对应 40-character SHA 运行：

```bash
VERCEL_ENV=production \
GITHUB_SHA=<commit> \
/usr/bin/time -p ./node_modules/.bin/tsx scripts/deployment/build.ts
```

两个完整构建各运行两次：第一次记录 cold-ish data/assets/enemy cache，第二次记录 warm/repeated 状态。

### 9.2 CPU profile 命令

```bash
HSR_DATA_ROOT=.upstream/TurnBasedGameData \
HSR_DEPLOYMENT_BUILD=1 \
node --cpu-prof --cpu-prof-dir=.profiles --import tsx scripts/data/validate.ts

HSR_DATA_ROOT=.upstream/TurnBasedGameData \
HSR_DEPLOYMENT_BUILD=1 \
node --cpu-prof --cpu-prof-dir=.profiles-data-ensure --import tsx scripts/data/ensure.ts

HSR_DATA_ROOT=.upstream/TurnBasedGameData \
HSR_ASSET_ROOT=.upstream/StarRailRes \
HSR_DEPLOYMENT_BUILD=1 \
node --cpu-prof --cpu-prof-dir=.profiles-assets-ensure --import tsx scripts/assets/ensure.ts

./node_modules/.bin/svelte-kit sync
./node_modules/.bin/vite build --profile
```

CPU profiles、raw logs、worktrees 和临时 manifest backup 仅用于调查，不应进入 Git。

### 9.3 Relevant git commands

```bash
git log --reverse --oneline 89b3b30..aa09011
git diff --stat 89b3b30..aa09011
git diff --name-status 89b3b30..aa09011
git log --reverse --stat 89b3b30..aa09011 -- scripts src vite.config.ts svelte.config.js
```

### 9.4 原始 timing 摘要

```text
89b3b30 cold-ish
messages 4.329  data-ensure 28.795  data-validate 23.707
enemy-assets 68.748  assets-ensure 45.263  assets-verify 0.425
vite 74.641  deploy-verify 1.386  total 201.610

aa09011 cold-ish
messages 4.509  data-ensure 32.995  data-validate 24.824
enemy-assets 62.380  assets-ensure 46.963  assets-verify 0.453
vite 27.899  deploy-verify 1.166  route-verify 1.316  total 155.100

89b3b30 warm
messages 2.045  data-ensure 4.463  data-validate 24.660
enemy-assets 1.324  assets-ensure 0.280  assets-verify 0.724
vite 26.775  deploy-verify 1.212  total 60.482

aa09011 warm
messages 2.054  data-ensure 4.384  data-validate 24.729
enemy-assets 0.938  assets-ensure 0.294  assets-verify 0.633
vite 28.486  deploy-verify 1.144  route-verify 1.269  total 63.007
```

### 9.5 调查限制

- 没有取得两次 Vercel build machine 的 CPU、memory、disk、load、Node patch 或 cache restore 元数据，因此外部吞吐差异无法提升为 confirmed。
- 本地 upstream prepare 使用已存在的 sparse checkout；prepare timing 不是 Vercel clone benchmark。
- enemy asset cold run 包含外部网络下载，不能用于代码性能归因。
- CPU profile 的 self time 是采样近似值；用于识别热点，不应与未 profile 的 wall time直接相加。
