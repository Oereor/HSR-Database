# Build Pipeline Performance Audit — Windows — 2026-09-20

## 1. Executive Summary

### 结论

本轮在 Windows 设备上可以稳定复现一个**绝对耗时较长、但没有继续漂移的 warm build**：current HEAD `9771170` 的两次 production-equivalent warm build 分别为 `133.821s` 和 `130.039s`，相差 2.9%。由于没有同一 Windows 设备上的历史快样本，不能仅凭这两个绝对值证明“最近发生了 Windows regression”；但约 130s 的 warm 构建足以解释用户感知到的本地等待。

cold-ish current HEAD 为 `230.962s`。进入 warm 状态后总耗时减少 `100.923s`（43.7%，cold/warm ratio 1.776x），几乎全部来自两个 cacheable ensure 阶段：

- `data-ensure`: `54.772s -> 7.081s / 6.995s`
- `assets-ensure`: `60.284s -> 0.641s / 0.600s`
- `data-validate`: 仍为 `47.906s / 46.074s / 48.517s`
- `vite-build`: `50.827s / 63.088s / 57.979s`，存在约 5–12s 运行方差，但没有随连续运行持续恶化

CPU/wall 证据表明，Windows 上的慢不能概括为单一的“磁盘等待”：

- warm `data-validate` 是 CPU/内存压力型：`45.886s wall`，累计 `56.938s user + 3.813s system CPU`，max RSS 约 3.19 GiB。
- cold `assets-ensure` 是 native/worker CPU 与 I/O 混合型：`62.902s wall`，累计 `50.688s user + 9.062s system CPU`。它不像 macOS profile 那样表现为几乎纯 V8 主线程等待；但 V8 主线程是否 idle 仍不能代表 libvips worker 是否空闲。
- Vite 是明确的混合型：`56.859s wall`，累计 `40.843s user + 25.172s system CPU`；同时 V8 profile 有 `34.073s` 主线程 idle、`6.171s copyFile`、`2.407s unlink`。也就是 worker/native CPU 与 prerender/adapter 文件系统等待同时存在。

Windows old/new 控制没有复现版本回归。`89b3b30 -> aa09011`：

- cold-ish 总耗时 `236.199s -> 252.583s`（1.069x）
- warm 总耗时 `133.433s -> 124.475s`（0.933x）
- warm `data-ensure`、`data-validate` 分别只有 1.005x、1.006x；cold 各重阶段只有约 7–9% 增量

因此，与 macOS 结论一致，**没有证据支持 `89b3b30 -> aa09011` 存在 70% 级持续代码性能回归，也没有发现 Windows-specific commit interaction。** Windows 上确有较高的 CPU、内存和文件系统成本，cache miss 会把它们同时暴露出来；这属于现有 pipeline 在当前环境中的吞吐表现，而不是已定位到某个新提交的事故。

Microsoft Defender 实时保护已确认启用，但当前用户不是 Windows 管理员，无法查看 exclusions，也不能运行 Defender Performance Analyzer。因此本轮**没有 per-file/per-process scan-cost 证据，不能把 Defender 定为根因**。本轮没有关闭 Defender、添加 exclusion、修改 Search 或电源计划。

### 核心问题直接回答

1. **Q1 — 是否稳定复现“明显变慢”？** 可以稳定复现约 130–134s 的 warm build 和约 231s 的 cold-ish build，但没有同机历史快基线，且连续 warm 没有漂移；所以复现了“慢的体验”，没有复现“持续恶化的 regression”。
2. **Q2 — 慢在哪？** warm 主要是 `data-validate`（46–49s）和 `vite-build`（58–63s）；cold-ish 额外加入 `data-ensure`（54.8s）与 `assets-ensure`（60.3s）。
3. **Q3 — 多算还是多等？** `data-validate` 主要多算；cold assets 是 native CPU/I/O 混合；Vite 是 worker/native CPU 与主线程文件等待并存。
4. **Q4 — cache 能否解释？** 能解释 cold-ish 比 warm 多出的约 101s，不能解释 warm 中持续存在的约 46–49s validate 与 58–63s Vite。
5. **Q5 — Defender/filesystem/Sharp？** NTFS 与 Vite 文件操作成本有直接 profile 证据；Sharp/libvips 工作量有直接 CPU 证据，但没有异常配置；Defender 只确认启用，没有因果证据。
6. **Q6 — old/new 是否接近？** 是。warm 关键数据阶段几乎相同，cold 重阶段只相差约 7–9%，没有持续版本回归。
7. **Q7 — 与 Vercel 5min -> 9min 是否同类？** “较低有效 CPU/native/filesystem throughput 放大多个既有重阶段”仍是相容的共同模式，但 Windows 不能证明 Linux/Vercel 的具体原因相同。

## 2. Relationship to macOS Audit

沿用 macOS 报告的以下结论：

- 不重新做完整 Git history audit，也不做没有 classifier 的 bisect。
- ensure/validate 重复加载、structural parity 重复 projection、assets 串行处理、Vite prerender/adapter 文件操作是既有优化机会，而不是已经证明的回归来源。
- old/new 的 ratio 与 hotspot pattern 比跨硬件 absolute seconds 更有意义。

本轮补上了 macOS 报告缺失的 Windows 证据：同机 cold/warm、进程内 CPU/resource usage、Windows native Sharp/libvips、NTFS/Defender/Search/power 状态，以及 Windows old/new 控制。

跨系统 absolute time 不作快慢判定。Mac 使用 Apple M2、Node 26.5.0；Windows 使用 i9-14900HX、Node 22.19.0。可比较的是：

- Mac warm old/new 1.04x；Windows warm old/new 0.93x。
- Mac cold data/assets old/new 为 1.15x/1.04x；Windows 为 1.08x/1.09x。
- 两边都没有出现 Production 日志中 1.5–1.9x 的稳定版本差异。

## 3. Windows Environment

| Item | Value |
|---|---|
| OS | Microsoft Windows 11 Pro, 25H2, build 26200.9457, x64 |
| CPU | Intel Core i9-14900HX, 24 physical / 32 logical cores |
| RAM | 32 GiB physical；环境采集时约 15.3 GiB free |
| System architecture | x64 |
| Node | v22.19.0, win32-x64 |
| pnpm | 11.9.0 |
| Git | 2.53.0.windows.1 |
| PowerShell | 7.6.5 Core |
| Power plan | Balanced (`381b4222-f694-41f0-9685-ff5bb260df2e`) |
| Power | AC online；未充电、未放电 |
| Project path | `C:\Users\<user>\Documents\Projects\HSR-Database-Project\HSR-Database` |
| Volume | `C:`, ordinary NTFS fixed volume, not Dev Drive |
| Disk | KIOXIA KBG60ZNV1T02, NVMe, GPT, healthy |
| Disk capacity/free | 952.5 GiB total；采集时约 249.5 GiB free |
| Current branch/HEAD | `develop`, `977117024f3e3090b9ef79cf788fb331f5f929bd` |
| Initial working tree | clean |
| Windows Search | Running, Automatic |
| Sync software | OneDrive process running；项目路径不在 OneDrive/Dropbox/Google Drive 目录中 |
| Defender | AV/antispyware/behavior/IOAV/realtime protection all enabled |
| Defender engine/platform | engine 1.1.26080.3；platform 4.18.26080.4；signature 1.459.295.0 |
| Defender exclusions | unavailable: administrator required |

`UV_THREADPOOL_SIZE` 未设置。`os.availableParallelism()` 为 32；Sharp 0.35.3，libvips 8.18.3，`sharp.concurrency()` 默认为 32。没有在实验中修改这些值。

调查文档写出的旧版完整 SHA `89b3b30f06f64d352d37e53e064cdb85383b8890` 不存在于本仓库；短 SHA `89b3b30` 唯一解析为实际测试的 `89b3b30fa9de5cef5d69452442214ed1d79cb06b`。

## 4. Current HEAD Benchmark

所有正式数字来自 detached worktree、`VERCEL_ENV=production` 的真实 `pnpm deploy:build`。由于 Codex 文件系统沙箱会阻止 esbuild 读取 `C:\` 根目录并使 Vite 必然失败，正式 build 在相同用户环境下、文件系统沙箱外执行。沙箱外运行不是 Windows 管理员 elevation，也没有修改系统安全设置。

| Stage | Cold-ish | Warm 1 | Warm 2 |
|---|---:|---:|---:|
| messages-and-script-checks | 4.039s | 3.529s | 3.630s |
| prepare-turnbased | 0.152s | 0.148s | 0.149s |
| prepare-starrailres | 0.245s | 0.220s | 0.234s |
| data-ensure | 54.772s | 7.081s | 6.995s |
| data-validate | 47.906s | 46.074s | 48.517s |
| enemy-assets-ensure | 2.320s | 1.937s | 2.081s |
| assets-ensure | 60.284s | 0.641s | 0.600s |
| assets-verify | 4.853s | 4.685s | 4.975s |
| vite-build | 50.827s | 63.088s | 57.979s |
| deploy-verify | 5.721s | 6.232s | 4.926s |
| route-verify | 2.544s | 2.482s | 2.406s |
| **total** | **230.962s** | **133.821s** | **130.039s** |

Cache 状态：

- Cold-ish 删除了 worktree 内 data artifacts、general asset manifest/files、`.svelte-kit`、`.vite` 与 build output；没有删除 pnpm store 或依赖。
- 两个 pinned upstream sparse checkout 已本地准备，prepare 数字不含 GitHub clone/fetch。
- Nanoka 敌人资源因 Git/curl Schannel 在自动化凭据上下文中返回 `SEC_E_NO_CREDENTIALS`，使用主工作区已有的完整、可验证 enemy cache；因此 enemy stage 在三次中都是 warm，不属于 cold 网络样本。
- Warm 1/2 命中 data/general-assets/enemy cache；`data-validate` 与 Vite 仍执行完整工作。

Cold-ish 到 Warm 1：总时间减少 43.7%。`data-ensure + assets-ensure` 从 115.056s 降到 7.722s，足以解释绝大部分差异。`data-validate` 没有 cache shortcut；Vite 在 cold-ish 反而更快，说明 Vite 的约 5–12s 变化是运行/机器状态方差，不是简单的 project-local cache 单调收益。

直接运行 `pnpm deploy:build` 在 Windows 上没有复现 macOS 报告中的 `npm_execpath` executable 兼容错误。最初失败来自 upstream 网络/Schannel 凭据上下文，使用本地 pinned objects 后 pipeline 正常执行。

## 5. CPU vs Wall-Time Analysis

采样方法：给目标 Node process 预加载只记录 telemetry 的临时 module，在 `exit` 时读取 `process.cpuUsage()` 和 `process.resourceUsage()`。`data-ensure`、`data-validate`、`assets-ensure` 均直接运行目标 TSX entry；Vite 直接运行其 Node entry。数字只描述该 Node process 及其线程，不把 deployment parent 的 CPU 当作 child 总 CPU。CPU 为进程所有线程累计，因此可以大于 wall。

| Stage / cache state | Wall | User CPU | System CPU | Max RSS | Assessment |
|---|---:|---:|---:|---:|---|
| data-ensure, warm | 6.381s | 5.672s | 1.156s | 874 MiB | CPU/I/O mixed；cache hit 仍 hash/parse/verify |
| data-validate | 45.886s | 56.938s | 3.813s | 3,264 MiB | CPU- and memory-pressure-heavy |
| assets-ensure, cold | 62.902s | 50.688s | 9.062s | 207 MiB | native/worker CPU + filesystem mixed |
| Vite build, warm profile | 56.859s | 40.843s | 25.172s | 2,044 MiB | worker/native CPU + main-thread/file wait mixed |

Vite V8 profile 的主要 self/sample time：

| Area | Sample time |
|---|---:|
| `(idle)` | 34.073s |
| `copyFile` | 6.171s |
| `unlink` | 2.407s |
| Tailwind `generate` | 1.884s |
| `mkdir` | 1.194s |
| `rmdir` | 0.750s |
| `realpath` | 0.732s |
| GC | 0.683s |
| `stat` | 0.673s |
| `readdir` | 0.604s |

V8 `(idle)` 不能解释为整个 process 没有工作：同一窗口内 worker/native CPU 仍计入进程 CPU。这正是为什么同时采集 wall、进程 CPU 与 V8 main-thread profile 是必要的。

`data-validate` 的 Windows V8 profile 保留了与 Mac 相同的 hotspot 拓扑，但分配/GC 成本更突出：

| Area | Windows sample time | Mac reference |
|---|---:|---:|
| structural parity `project` | 10.187s | 6.066s |
| garbage collector | 10.366s | 3.177s |
| validation main body | 3.886s | 2.883s |
| English CJK `collectStrings` | 1.536s | 1.177s |
| English CJK audit | 1.345s | 1.007s |
| generated artifact validation | 1.419s | 1.217s |

这不是跨硬件 absolute benchmark，但它回答了 hotspot 是否改变：没有出现 Windows-only 新业务热点，仍是 structural projection、GC、CJK scan 和 artifact validation；其中 GC 的相对放大尤其明显，与 3.19 GiB max RSS 的进程数据一致。warm `data-ensure` profile 则主要是 `3.954s idle`、`1.411s validateGeneratedArtifacts` 和 `0.261s` hash update，符合 cache-hit 路径仍读取/hash/parse artifacts 的实现。

## 6. Windows-specific Findings

### Defender

已确认 realtime protection、behavior monitor 与 IOAV protection 开启。没有 Defender Performance Analyzer 的 per-file/per-process 结果，因此 Defender 影响为 possible，不是 confirmed 或 strongly supported。

### NTFS / filesystem

项目位于普通 NTFS NVMe 卷，磁盘健康、空间充足、不是网络盘或同步目录。Vite profile 中 34.1s main-thread idle，且 `copyFile/unlink/mkdir/rmdir/stat/readdir` 有直接样本，支持 adapter/prerender 对 Windows 文件操作吞吐敏感。证据不支持“磁盘损坏”或“空间不足”。

### Sharp / libvips / libuv

Sharp 0.35.3 / libvips 8.18.3 为正常 win32-x64 binary；Sharp concurrency 32，`UV_THREADPOOL_SIZE` 未被用户覆盖。cold assets 约 59.8 CPU-seconds / 62.9 wall-seconds，表明 native transform 确实消耗大量 CPU，但没有异常并发设置、错误 binary 或纯等待失速的证据。Windows 上该阶段与 Mac 的“V8 main thread idle”并不冲突：libvips work 不运行在 V8 main thread。

### Cache

Cache 是本轮最强的 Windows-specific operational factor：同一 HEAD 同机从 231s cold-ish 降至 130–134s warm。它解释单次突增，不解释 warm baseline 中的完整 validate/Vite 成本。

### Power / load

设备在 AC power，Balanced plan。未修改计划，也没有观察到低电量放电状态。没有同步采得可靠的 per-core frequency/thermal trace，因此 thermal throttling 与 Balanced plan 影响均为 possible，但当前证据不足。

Windows Search 正在运行；OneDrive 也在运行但项目不在其目录中。没有与慢阶段同步的 SearchIndexer/OneDrive 资源 trace，当前证据不支持把它们列为原因。

## 7. Defender Analysis

`New-MpPerformanceRecording` 与 `Get-MpPerformanceReport` cmdlet 存在，但当前用户不是 Windows 管理员；`Get-MpPreference` 也明确返回 exclusions 需要管理员权限。依照调查规则，本轮没有请求 Windows elevation、没有绕过权限，也没有通过关闭 realtime protection 或新增 exclusion 做 A/B。

```text
Defender Performance Analyzer skipped:
administrator privileges unavailable
```

因此本轮只能确认 Defender 在场，不能回答其扫描成本是否足以解释构建耗时。没有证据支持现在建议 exclusion。

## 8. Windows old/new Comparison

### Cold-ish

| Stage | 89b3b30 | aa09011 | Ratio |
|---|---:|---:|---:|
| data-ensure | 55.943s | 60.251s | 1.077x |
| data-validate | 47.175s | 50.639s | 1.073x |
| assets-ensure | 59.909s | 65.548s | 1.094x |
| vite-build | 58.686s | 58.634s | 0.999x |
| **total** | **236.199s** | **252.583s** | **1.069x** |

### Warm（版本比较主依据）

| Stage | 89b3b30 | aa09011 | Ratio |
|---|---:|---:|---:|
| data-ensure | 7.232s | 7.269s | 1.005x |
| data-validate | 50.547s | 50.831s | 1.006x |
| assets-ensure | 0.644s | 0.565s | 0.877x |
| vite-build | 61.311s | 50.014s | 0.816x |
| **total** | **133.433s** | **124.475s** | **0.933x** |

`aa09011` cold-ish 多出 16.384s，但它包括新增 route verification（2.840s），且 data/assets 的增量只有各 4–6s。warm 的两个 data 阶段几乎相同，新版总时间反而更短；Vite 的 11.3s 反向差异落在本轮已观察到的明显运行方差中，不能解释成新版优化，也不能用来指控旧版 regression。

与 Mac 一致的关键 pattern 是：稳定 warm 的 data ensure/validate 与 assets hit 没有版本级放大；cold 新版只有小幅工作量增量。Windows 没有出现只在新版发生的 1.5–1.9x stage slowdown，因此不进入 Windows-specific diff investigation 或 bisect。

## 9. Root Cause Assessment

### Confirmed

1. current HEAD 的 Windows warm build 稳定在约 130–134s；连续运行没有持续恶化。
2. cold-ish cache state 将 total 放大到 231s；data/general-assets cache 命中可减少约 101s 总耗时。
3. warm 的主要固定成本是完整 `data-validate` 和 Vite；cold 额外暴露 data/assets generation。
4. `data-validate` 是 CPU/内存压力型；Vite 是 worker/native CPU 与文件系统等待混合型；cold assets 是 native CPU/I/O 混合型。
5. Windows old/new 没有持续 commit-level regression，结论与 Mac 一致。
6. Defender realtime protection 开启；磁盘为健康、空间充足的本地 NTFS NVMe。

### Strongly supported

1. 用户感知的单次大幅变慢可由 project cache miss 放大既有重阶段解释。
2. Windows warm baseline 的主要成本来自既有验证/构建工作量及当前设备上的有效 CPU、内存与文件操作吞吐，而非 Player Info 输出规模或单个新提交。
3. Vite prerender/adapter 的大量文件操作是环境吞吐敏感点；较慢的 filesystem/native scheduling 会放大它。

### Possible

1. Defender 扫描是否贡献了 NTFS 文件操作延迟；需要管理员手动运行官方 Performance Analyzer 才能确认。
2. Balanced power plan、thermal/frequency 或并发系统负载是否解释某些 5–12s 方差；本轮没有可靠同步 trace。
3. Windows Search 或其它进程在用户曾观察到的某次慢构建中是否产生了竞争；当前 run 没有支持证据。

### Ruled out / Not supported

1. `89b3b30 -> aa09011` 的 70% 级持续代码 regression。
2. Windows-specific 新版 interaction。
3. pnpm executable 兼容问题导致本轮慢构建；Windows 直接入口可以工作。
4. 用户覆盖 `UV_THREADPOOL_SIZE`、异常 Sharp concurrency 或错误架构 binary。
5. 磁盘不健康、空间不足、网络/同步盘。
6. “Defender 一定是根因”或“Sharp 只是等待、没有 CPU 工作”。

## 10. Relationship to Vercel Slow Build

Windows 与 Vercel slow build 的共同形状仍然是：同一串行 pipeline 中多个 CPU/native/filesystem-heavy stage 会被较低有效吞吐共同放大。Windows CPU/profile 证明这种放大机制在技术上真实存在，而不是纯推测。

但两者不能等同：

- Vercel 是 Linux build machine；Windows 是 NTFS/Defender 环境。
- Windows warm assets 几乎完全 cache hit，而 Vercel 慢构建的 assets generation 为 135s。
- Windows 没有 Vercel build-machine CPU、memory、disk、load、cache restore telemetry。
- Windows assets 显示大量 native CPU；现有 Vercel 日志只有 wall，无法判断同一比例的 CPU/wait。

所以可以说二者**呈现相容的 throughput-amplification pattern**，但现有证据不足以认为它们是同一具体系统原因，更不能用 Windows Defender 解释 Vercel。

## 11. Recommended Next Step

按证据优先级：

1. **F — 增加 Vercel telemetry。** 在未来 production build 中记录每阶段 wall、目标进程 CPU/resource usage、RSS、cache hit/miss reason、输出数量；为 Vite 增加 client/server/prerender/adapter 子阶段，为 assets 增加 transform 数与累计 native wait。只有这一步能验证 5min -> 9min 的 Linux build-machine 吞吐假设。
2. **A — 关闭 commit-level 性能事故调查，另开正常 pipeline optimization。** Windows 和 Mac 两轮都排除了持续版本回归。可按既有证据评估 structural parity 重复 projection、ensure/validate 重复加载、asset bounded concurrency 和 Vite output 文件操作，但不在本调查实施。
3. **B — 仅在仍有明显的 Windows episodic outlier 时，由管理员手动运行 Defender Performance Analyzer。** 记录 top processes/paths/extensions/scans；不要先关闭 Defender 或添加 exclusion。
4. **D — 把 cache reason telemetry 纳入日常日志。** 当前 cache 差异已确认很大，但没有发现错误 invalidation；先提高可观察性，不重设 cache design。
5. **C — Sharp/libvips 专项调查优先级较低。** 默认版本、架构与并发正常，且进程 CPU 与 wall 匹配；只有在后续出现 assets-only outlier 时再做 concurrency/native trace。

不建议进入 **E — Windows-specific code regression investigation**，因为缺少稳定版本差异 classifier。

## 12. Methodology and Limitations

- 三个 detached worktree 使用独立 generated/build output 与 node_modules；pnpm store 未清空。
- upstream pinned commits 从本机只读 sibling repositories 的 Git objects 建立 sparse checkout；没有修改两个上游仓库。
- enemy cache 预热，避免将自动化网络凭据故障混入 build 性能；enemy cold 网络成本不在本轮结论范围内。
- 正式计时在 Codex 文件系统沙箱外进行，因为 esbuild 在沙箱内会因无权读取 `C:\` 根目录而失败。没有获得 Windows administrator token。
- CPU telemetry 是目标 Node process 的进程内统计；deployment parent 没有被错误解释为所有 children 的 CPU 汇总。
- 没有 Defender ETL、ETW disk trace 或同步 per-core thermal/frequency trace，因此 Defender、具体 I/O latency 与 thermal 不能提升为 confirmed。
- CPU profile 是 sampling 近似值；sample time 不应与进程 CPU time直接相加。
- 报告没有实施任何性能优化或系统配置修改。
