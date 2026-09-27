# Deploy Verify Performance Investigation

日期：2026-09-27。范围：Windows 本机完整部署构建与受控文件读取实验。分支 `develop`，HEAD `cdcef344b4cbdbf460f4565a1029779d6cabb043`。本轮没有远程部署、commit、push 或依赖升级。

本文以 **Observed** 标记实测事实，**Inferred** 标记证据推断，**Hypothesis** 标记未证实解释。原始证据保存在 ignored 目录 `data/audit/deploy-verify-performance-2026-09-27/`，下文简称“审计目录”。

## 1. Executive Summary

**耗时位置已经确定，底层责任组件尚未完全确定。** 约 150 秒确实发生在 verifier 函数内部，但主要是逐文件 `readFile` 等待，不是引用提取或闭包判定的 CPU 计算。

- **Observed：**完整 Node 24/Vite 8 pipeline 首次校验 146.660 秒，4,398 次 `readFile` 累计 145.308 秒，占 99.08%。紧接着同进程第二次校验仅 1.550 秒。
- **Observed：**另一轮在 Vite 刚退出后立即启动全新 Node 24 校验子进程，仍需 151.151 秒；随后原父进程仅需 1.506 秒。异常跟随“新产物首次读取”，并不要求部署父进程上下文。
- **Observed：**Node 24/Vite 8 构建后等待 5 秒，首次校验仍需 149.538 秒。不能用短暂等待解决。
- **Observed：**保持 Vite 8，Node 22.19.0 对照的首次校验为 5.178 秒。额外纯文件实验固定 Node 24 写入端、交替 Node 22/24 读取新副本，也复现明显差异，排除了必须运行 Vite 才会出现问题的解释。
- **Observed / Inferred：**首批请求的延迟集中在 `readFile` 内的第一个 `FSREQPROMISE`；结合该版本内置源码，其对应 `open`。样本 HTML 的 open 39.738 毫秒，后续 fstat/read/close 分别 0.064/0.077/0.047 毫秒。
- **Inferred：**问题属于 **Windows 新复制文件首次打开状态与 Node runtime 的交互**。Node 24 相关性有直接对照支持；尚不能指定某个 Node/libuv 缺陷或 Windows filter driver 为最终根因。
- **Hypothesis：**Defender 或其他文件系统过滤组件可能参与。系统拒绝了 Defender 性能记录启动，未获得扫描事件或内核调用栈；不能把它写成事实。

未实施业务代码修复。临时源码 instrumentation 已逐字节恢复；最终只新增本报告。保留 Node 24、Vite 8 和全部部署/校验契约。

## 2. Problem Statement 与基线解释

已完整阅读 [原始 warning/cache 审计](deployment-warning-cache-audit-2026-09-27.md) 与 [Node 24/Vite 8 对齐报告](runtime-toolchain-alignment-2026-09-27.md)。历史数字属于此前实验，不能替代本轮测量：

| 历史条件 | deploy-verify |
| --- | ---: |
| Node 22/Vite 7，本地 warm audit | 4.506–5.434 秒 |
| Node 24/Vite 8，完整 CI | 157.217 秒 |
| Node 24/Vite 8，本地 Production profile | 147.433 秒 |
| 此后独立 Node 24 进程 | 1.369 秒 |

**Inferred：**历史 standalone 使用的是已经经过完整 pipeline 校验的输出，未控制首次读取状态。因此它证明同一实现能够很快完成，却不能单独证明“只有 embedded process 才慢”。本轮把首次读取权交给 fresh child 后，直接推翻了这一过强解释。

历史报告中的“Production”是本地 Production profile 构建，不是此次重新测得的云端生产部署耗时。

## 3. 环境与控制变量

启动时首先检查 Git 状态、diff、HEAD 和 runtime。共享父目录不是 Git 仓库，网站仓库位于 `HSR-Database/`；进入该目录后的初始 `git status --short`、`git diff --stat` 均为空。当前 HEAD 已包含上一轮迁移，不能再把历史报告的旧 HEAD 当作当前状态。

| 项目 | 本轮 Observed |
| --- | --- |
| 正式实验 runtime | Node 24.19.0；libuv 1.52.1；V8 13.6.233.17-node.51 |
| Node 24 executable | `C:/Users/unkn0/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe` |
| 系统默认 / 对照 | `C:/Program Files/nodejs/node.exe`，22.19.0；libuv 1.51.0 |
| 包管理器 | pnpm 11.9.0 |
| Bundler / plugin | Vite 8.3.1 / vite-plugin-svelte 7.3.0 |
| OS / CPU | Windows，Intel Core i9-14900HX，32 logical CPUs |
| 总物理内存 | 33,174,284 KiB，约 31.64 GiB |
| 正式入口 | `pnpm deploy:build`，`VERCEL=1 VERCEL_ENV=production` |
| 工作区 | 所有修改限网站仓库；两个 sibling repo 只读 |

Node 24 通过当前命令进程的 PATH 显式选择；没有替换系统 Node。Node 22 只用于一轮受控对照，没有修改 `.nvmrc`、engines 或 lockfile。所有正式构建在相同的沙箱外用户上下文运行；此前已确认沙箱会阻断 esbuild 的目录读取。网络文档读取使用验证可连接的 `127.0.0.1:7890` 代理。

四轮 data、general-assets、enemy-assets 均 hit，两个 pinned checkout 均 reused；没有清理数据或资源缓存。固定的日志原因是 `manifest-source-and-artifacts-match`、`manifest-source-and-files-match`、`tracked-snapshot-valid`。

| Run | 启动 CPU load 快照 | 可用物理内存 KiB | 源码诊断 diff SHA-256 前缀 |
| --- | ---: | ---: | --- |
| R1 | 26% | 15,318,824 | `e77888436d5c393d` |
| R2 | 29% | 15,430,800 | `282bb796efc51f91` |
| R3 Node 22 | 0% | 15,742,616 | `2676c1c693d4ee2f` |
| R4 delay 5s | 25% | 15,284,604 | `2676c1c693d4ee2f` |

每轮完整 metadata、diff、运行日志均已保存。CPU load 是启动瞬间的系统快照，不是整轮平均值；主机并非隔离 benchmark 环境。R3 的负载不同，故另做交替 reader 的小实验以减少一次整轮比较的混杂因素。

## 4. Relevant Architecture

源代码边界：[`build.ts`](../../scripts/deployment/build.ts)、[`verify-build.ts`](../../scripts/deployment/verify-build.ts)、[`telemetry.ts`](../../scripts/deployment/telemetry.ts)。

```text
PowerShell audit runner
└─ Node 24 pnpm deploy:build
   └─ tsx CLI
      └─ Node 24 deployment/build.ts             ← 部署父进程 / verifier 所在进程
         ├─ data/messages 等 pnpm 子任务
         ├─ in-process assets ensure / verify（含 Sharp metadata）
         ├─ Node 24 pnpm exec svelte-kit sync
         ├─ Node 24 pnpm exec vite build
         │  └─ Windows command wrapper → Node 24 vite/bin/vite.js
         │     └─ SvelteKit / bundler worker threads
         └─ in-process output smoke → asset closure → route verification

R2 额外插入：Node 24 --import tsx verify-only.mjs（在任何完整闭包扫描前）
```

`runPnpm` 使用 `spawn`，`shell:false`、`stdio:'inherit'`、`windowsHide:true`。存在 `npm_execpath` 时，命令为 `process.execPath` 加 pnpm entrypoint。Promise 在该 pnpm child 的 `close` 事件才 resolve；不是 `exec`、不是 Vite JS API 嵌入部署父进程，也没有由该 wrapper 创建的 stdout/stderr 读取管道或自定义 IPC。

实际调用链：

```text
runDeploymentBuild
  timed('vite-build') → svelte-kit sync → runPnpm(['exec','vite','build'])
  verifyBuildSmoke
  timed('deploy-verify') → verifyBuildAssetClosure
    walk → readdir → path.relative / paths.add → stat → textFiles.push
    对 textFiles 串行：readFile('utf8')
      → referencedAssetUrls（两个正则 + 每文件 URL Set）
      → URL 过滤 / decodeURIComponent / query/hash 移除 / 路径检查
      → index.paths.has → missing 集合
    missing gate → console.log → 返回 FileSummary
  logFileSummary（计时范围外）
  timed('route-verify')
```

**Observed：**`deploy-verify` timer 紧邻 `operation()`，结束于 `await operation()` 的 finally；它包含 closure 自身的 inventory、读取、检查和摘要输出，不包含 Vite、route verification 或 `logFileSummary`。`withProcessTelemetry` 包装的是 general-assets ensure，不包装闭包校验。不存在 timer 把 Vite 退出等待算进 150 秒的证据。

## 5. Instrumentation 与测量限制

临时修改仅涉及 `build.ts`、`verify-build.ts`，其原始字节先备份。诊断 helper 位于 ignored 审计目录；结束后恢复两个源码文件并核对 hash、Git diff。

- `performance.now()` 计时；UTC epoch 用于跨进程时间线。读取仍是原始串行 `fs/promises.readFile(file,'utf8')`，没有改并发、过滤文件、添加内容缓存或改变错误判定。
- readdir/stat/readFile 记录 count、total、bytes、first 10、slowest 20、直方图与 p50/p95/p99/max，不打印逐文件大日志。
- 标记 inventory、selection/index 完成、读取/提取/check 完成；同步小段累计单独计时。读取、提取、lookup 本来就逐文件交错，不能伪装成三个连续批处理阶段。
- `monitorEventLoopDelay({resolution:10})`、eventLoopUtilization、CPU/memory、低频 active requests 摘要及 GC PerformanceObserver。
- Vite/pnpm 专用 preload 观察关键输出及 exit；保留 inherited stdio。preload 也会在 worker 加载，所以同 PID 的多个 node-start 不能计为多个 OS 进程。
- R3/R4 仅对首 10 次 readFile 临时启用 async_hooks，记录 `FSREQPROMISE` / `FILEHANDLECLOSEREQ` 从 init 到 before 的时差。它包括 native 请求及调度等待，不是内核 syscall profiler。

诊断会引入少量 CPU、分配与日志成本；R1 的 146.667 秒 stage 与历史 147.433 秒非常接近，且差异已在不带 pipeline instrumentation 的纯文件实验复现。没有强制 GC，没有降低任何 gate。

时间线有两个需明确的命名限制：`T0` 实测点位于 `pnpm exec vite build` 启动前，`vite-build` stage 还包含此前的 svelte-kit sync；`T16-verifier-return-observed` 位于调用者收到 timed 返回之后，所以在日志中排在 `T17` 后面。真正函数 return 在 T15 与 T17 之间；该区间约 7 毫秒，不能隐藏 150 秒。这里保留真实测点而不重命名伪造顺序。

## 6. 完整 pipeline 实验结果

以下 verifier 数字采用函数内诊断 wall；stage 包含摘要序列化等约 6–10 毫秒额外开销。

| Run / hypothesis | 首次完整读取者 | 首次 verify | 同进程第二次 | 其他结果 | 整轮外部 wall |
| --- | --- | ---: | ---: | --- | ---: |
| R1：先拆时间线 | Node 24 部署父进程 A | 146.660s | 1.550s | deploy stage 146.667s | 208.460s |
| R2：是否 parent-local | 新 Node 24 child | 151.151s | — | 原父进程随后 A/B 为 1.506/1.415s | 216.479s |
| R3：Node 是否重要 | Node 22 部署父进程 A，Vite 8 不变 | 5.178s | 3.726s | deploy stage 5.187s | 78.321s |
| R4：等待是否恢复 | Node 24，Vite 后等待 5.012s | 149.538s | 2.162s | deploy stage 149.546s | 224.629s |

整轮外部 wall 包含本轮额外重复扫描、fresh child 或等待，不能直接作为正常 production pipeline 的优化前后对比。四轮全部 exit 0，均通过输出 smoke、闭包与 2,154 条 public page indexes/internal links 检查。

全部扫描结果：7,240 files / 409,054,964 bytes；4,398 个选定文本文件，共读取 247,761,136 bytes；路径 Set 大小 9,430；missing=0。**9,430 是目录与文件的 path index 条目数，不是独立视觉资源引用数。** 本轮数量以当前 HEAD 实际输出为准，不硬套历史报告 bytes。

## 7. Full Pipeline Timeline / Child Lifecycle

R1，以 `2026-09-27 04:53:28.906 UTC` 的 Vite 命令启动为相对零点：

| 节点 | 相对秒 | 观察 |
| --- | ---: | --- |
| T0 Vite command start | 0.000 | svelte-kit sync 已结束 |
| T1 pnpm spawn | 0.010779 | pnpm PID 45532，部署父 PID 20508 |
| 实际 Vite Node start | 0.354 | PID 39484；PPID 11248 为 command wrapper |
| T2 client 打印 built | 9.668 | 文本为 built in 2.97s |
| T2 SSR 打印 built | 35.756 | 文本为 built in 34.58s |
| adapter 写出 build 完毕 | 42.541 | Wrote site to build |
| 实际 Vite Node exit | 42.542 | code 0，04:54:11.448 UTC |
| pnpm 自身 exit hook | 42.637 | code 0 |
| T3 parent 收到 pnpm exit | 42.645877 | 04:54:11.551 UTC |
| T4 parent 收到 pnpm close | 42.646231 | 04:54:11.552 UTC |
| T5 vite-build stage finished | 42.646681 | close → stage finish 0.450ms |
| T6 deploy-verify invoked | 42.690577 | intervening routing import / output smoke |
| T7 verifier entered | 42.691805 | 04:54:11.597 UTC；T5 → T7 45.124ms |
| T8 first readdir start | 42.692330 | enter → I/O 0.525ms |
| T9 first readdir returned | 42.692711 | operation latency 0.157ms |
| T10/T11 inventory + text selection + path index done | 43.380871 | inventory 688.634ms |
| first readFile returned | 43.381480 | 404.html，0.267ms |
| T12/T13/T14 reads/extraction/lookup done | 189.350697 | 逐文件交错流程整体完成 |
| T15 closure finished | 189.351324 | 摘要已输出 |
| 真正 function return | T15 与 T17 之间 | 未单独取得独立时间戳，区间小于 7ms |
| T17 stage timer stopped | 189.358161 | stage 146.667s |
| T16 caller observed returned summary | 189.358397 | stage wrapper 已返回 |

**Observed：**pnpm exit→close 0.354ms；Vite 最后的 built 文本→真正 exit 约 6.786s，这是真实的 adapter/closeBundle 收尾时间，但发生在 verifier 前。`vite-build` stage 为 44.089s，其中约 1.443s 是 sync，实际 Vite command wall 42.647s。没有额外 150 秒的 child 存活、pipe draining 或 wrapper resolve 等待。

R2 同样先收到 pnpm close，T5 后约 0.584ms 开始 fresh child spawn；该 child 约 123ms 后进入 verifier。新进程拥有相同 Node 24 executable、cwd、继承环境；诊断输出前缀不同，入口改用 `node --import tsx`，不经过 tsx CLI wrapper。即便去掉原父进程/CLI 历史，仍复现 151 秒。

### PLUGIN_TIMINGS

保留所有 Rolldown checks 与原始输出，没有 suppress。主要日志如下，数值为各 hook 自己的计时，不能不加区分相加成 CPU 时间：

| Hook | R1 | R2 | R3 Node 22 | R4 |
| --- | ---: | ---: | ---: | ---: |
| vite:prepare-out-dir / renderStart | 未单列提示 | 未单列提示 | 1.5s | 1.6s |
| SvelteKit compile / writeBundle | 30.4s | 31.5s | 32.0s | 34.2s |
| SvelteKit compile / closeBundle | 6.8s | 8.1s | 8.0s | 8.9s |
| Paraglide / buildStart | 1.3s | 1.4s | 2.1s | 1.4s |
| Tailwind / transform | 未单列提示 | 1.0s | 1.1s | 1.2s |

R1/R2 只触发 SSR timing 提示，R3/R4 同时触发 client 与 SSR；未单列不能解释成 0。hook 输出全部在实际 Vite exit 前结束。生命周期证据与 [Rolldown 官方 timing 定义](https://rolldown.rs/reference/InputOptions.checks#bundlertimings) 一致，但本轮结论主要由本地实测得到。

## 8. Event Loop / Active Handles

**Observed：**R1 的 Vite exit/close 处父进程有 2 个 Socket 和 1 个 ChildProcess；进入 verifier 时 ChildProcess 已消失，仅剩 2 个 Socket，以及 smoke 尾部的 FileHandleCloseReq。首次 I/O 后为 1 个 FSReqPromise。采样未见 MessagePort、持续 worker handle 或不断累积的 ChildProcess。

2 个 Socket 与继承 stdout/stderr 的 pipe 表现相符，没有导出 socket 地址或敏感数据。`_getActiveHandles()` 不枚举所有内部线程和 timer；结合 `getActiveResourcesInfo()` 与实际子进程 exit，只能说未观察到异常残留，不能声称列出了整个 OS 的全部句柄。

| 区间 | event loop utilization | idle | delay min / mean / max | p50 / p95 / p99 |
| --- | ---: | ---: | --- | --- |
| R1 A | 1.77% | 144.065s | 9.036 / 15.467 / 25.788ms | 15.516 / 19.939 / 21.922ms |
| R1 B | 63.83% | 0.561s | 9.036 / 10.007 / 11.002ms | 10.011 / 10.109 / 10.281ms |
| R2 fresh child | 1.58% | 148.758s | 9.019 / 15.483 / 25.739ms | 15.532 / 19.972 / 21.742ms |
| R4 delay A | 1.80% | 146.851s | 9.019 / 15.441 / 25.592ms | 15.491 / 19.644 / 21.725ms |

**Inferred：**event loop 能按十几毫秒尺度继续调度，长期空闲等待 I/O；没有阻塞主线程 150 秒的证据。慢轮 timer 粒度比快速轮更粗，但不能由 15ms 峰值分布直接断言 Windows timer-resolution 是根因。R1 在 146 秒内取得了持续请求采样，主要是单个 FSReqPromise。

## 9. CPU / Memory / GC

| 校验 | user CPU | system CPU | GC count | GC total | GC max |
| --- | ---: | ---: | ---: | ---: | ---: |
| R1 A 146.660s | 2.610s | 1.688s | 111 | 72.963ms | 3.642ms |
| R1 B 1.550s | 0.735s | 0.765s | 21 | 27.001ms | 2.194ms |
| R2 child 151.151s | 2.781s | 1.453s | 91 | 62.259ms | 3.023ms |
| R3 Node 22 A 5.178s | 2.234s | 1.079s | 101 | 73.743ms | 2.792ms |
| R4 delay A 149.538s | 2.828s | 1.922s | 115 | 74.574ms | 2.165ms |

GC `detail.kind` 原始计数保留；R1 为 kind 1/4/8 各 83/14/14，通常对应 minor/major/incremental。Observer 异步投递存在窗口边界误差，表格不是精确 stop-the-world 总和；但总量/最大值均远小于 150 秒，足以排除巨大 GC pause 的解释。

R1 关键节点内存，单位 MiB，CPU 为进程累计 user/system 秒：

| 节点 | CPU user/system | RSS | heapUsed | external | arrayBuffers |
| --- | --- | ---: | ---: | ---: | ---: |
| T5 | 1.015 / 1.015 | 84.86 | 14.52 | 4.04 | 1.14 |
| T7 | 1.015 / 1.015 | 85.84 | 14.95 | 4.13 | 1.23 |
| T10 | 1.421 / 1.312 | 102.99 | 24.61 | 4.12 | 1.22 |
| T12 / T15，几乎相邻 | 3.625 / 2.703 | 123.9 | 21.44 | 4.39 | 1.49 |

这些是关键节点快照，不是整个进程树峰值。没有观察到内存耗尽；没有用 RSS 的绝对值替代因果证据。Node promise 文件操作使用底层 threadpool，wall 等待不能视为 JS CPU 工作量，参见 [Node 文件系统 API](https://nodejs.org/docs/latest-v24.x/api/fs.html#promises-api)。

## 10. Filesystem Timing 与同步业务逻辑

### R1 A/B 分解

| 项目 | 首次 A | 第二次 B | 计时关系 |
| --- | ---: | ---: | --- |
| filesystem inventory | 688.634ms | 431.546ms | 包含下列 readdir/stat 与 path index/selection |
| 2,191 次 readdir | 216.528ms | 132.272ms | inventory 子项 |
| 7,240 次 stat | 338.900ms | 206.496ms | inventory 子项 |
| 4,398 次 readFile | 145,308.446ms | 776.834ms | 247,761,136 bytes，相同工作量 |
| 引用正则提取 + 每文件 URL Set 构造 | 281.420ms | 168.292ms | 同步 |
| URL 规范化、过滤与循环，不含 membership 计时 | 119.427ms | 59.232ms | 由组合项扣除 membership 得到，非纯 decode 时间 |
| closure Set membership | 37.435ms | 15.026ms | 同步 `index.paths.has` |
| report rendering / console enqueue | 0.053ms | 0.094ms | 不代表外部 PowerShell 最终 flush 时间 |
| 其余循环/诊断/时间戳开销 | 约 225ms | 约 99ms | residual，无百秒未归属区间 |

R4 进一步拆分 integrated inventory：path join/relative normalization 84.037ms，path Set insertion 10.682ms，text selection 7.365ms；inventory 总计 856.495ms。这些子项不可再次加到 inventory 总数上。路径 index 在读取前已建立，URL Set 则在每份文本解析时建立。

### 首批 I/O 与读取分布

R1 第一次 readdir 0.157ms；第一次 stat 0.108ms；第一次 readFile 是已被 output smoke 读取的 `404.html`，仅 0.267ms。因此“第一份文件快”不等于后续全部快。

| R1 前 10 次 readFile | 毫秒 |
| --- | ---: |
| 404.html | 0.267 |
| characters/1001/index.html | 56.688 |
| characters/1001/__data.json | 21.401 |
| characters/1002/index.html | 50.865 |
| characters/1002/__data.json | 22.720 |
| characters/1003/index.html | 50.595 |
| characters/1003/__data.json | 20.531 |
| characters/1004/index.html | 68.302 |
| characters/1004/__data.json | 18.623 |
| characters/1005/index.html | 66.609 |

| readFile 分布 | R1 A | R1 B | R2 fresh child | R3 Node 22 A | R4 delay A |
| --- | ---: | ---: | ---: | ---: | ---: |
| p50 ms | 26.389 | 0.141 | 27.422 | 0.664 | 27.136 |
| p95 ms | 66.367 | 0.353 | 68.582 | 1.270 | 69.192 |
| p99 ms | 80.834 | 0.521 | 84.049 | 2.180 | 84.172 |
| max ms | 792.639 | 3.532 | 829.672 | 151.292 | 735.961 |

R1 A 直方图：<1ms 112 次，1–10ms 211 次，10–100ms 4,062 次，≥100ms 13 次。R1 B：<1ms 4,374 次，1–10ms 24 次，无 ≥10ms。最慢样本包括 `light-cones/23028/__data.json` 792.639ms、`search/index.html` 663.794ms、`en/search/index.html` 562.642ms；完整 slowest 20 在 JSON 中。

**Observed：**没有“单次首 I/O 卡 145 秒”；几千次首次文本打开延迟逐步累积。

### readFile 内部阶段

R4 首 10 文件的 async_hooks 记录表明，除 smoke 已读的 404 外，第一个 FSREQPROMISE 常为 13–68ms，而后续请求多在亚毫秒级。R4 `characters/1001/index.html`：

| native 请求顺序 | latency | 归属 |
| --- | ---: | --- |
| 第一个 FSREQPROMISE | 39.738ms | Inferred：open |
| 第二个 FSREQPROMISE | 0.064ms | Inferred：fstat |
| 第三个 FSREQPROMISE | 0.077ms | Inferred：read |
| FILEHANDLECLOSEREQ | 0.047ms | Observed 类型；close |

顺序映射依据两个实际 executable 导出的 `process.binding('natives')['internal/fs/promises']`：`readFile` 先 `await open`，再 `readFileHandle` 中 fstat/read，最后 close。未改读取算法以取得这些阶段。样本文件小于一次读取 buffer 限制；不能把此四请求模型硬套到所有大文件。这里定位的是请求的提交到回调等待区间，尚未区分 libuv 队列、系统 open、filter driver 与调度各占多少。

## 11. Same-Process / Fresh-Process 的意义

R1 与 R4 都是 A 慢、B 快，且 A/B 之间没有写文件或应用层缓存。R2 把首次完整扫描交给新 child，child 慢、原父进程快。

**Inferred / High：**一次扫描造成的可复用状态能跨进程影响下一次扫描，问题不主要来自 parent 的 tsx、Sharp、GC 或 worker 残留。该状态可能是 OS cache 或安全扫描结果，当前不能区分。R2 的 fast parent 是第二个读取者，不能称为独立 first-touch 对照；正是这一顺序被显式控制，才解释了历史 standalone 的快速结果。

## 12. Delay / Build Output Stability

R4 从 T5 后等待 5.012s，再走原 smoke/closure；A 149.538s、B 2.162s。**Observed：5 秒 delay 不恢复性能。** 没有继续无目标尝试 15 秒或更多等待值。

R4 同时启动只读取目录和 stat 的独立 snapshot helper，在约 +0/+1/+5 秒开始观察；三次分别耗时约 510/353/683ms，最后一次与 verifier inventory 有部分重叠，这是该轮 inventory 较 R1 略高的可能扰动。helper 不读取文本内容，没有提前完整预热 closure 工作量。

三次快照均为 7,240 files / 409,054,964 bytes，latest mtime `1790485476770.8684`，路径/size/mtime 清单 SHA-256 均为 `f8146149a8b23b9d5664e7f01cd4659060f7109a7b70f716793491d584b6bffd`。latest mtime 早于 T5。**Observed：没有目录仍在持续写入的迹象。** 为避免内容读取本身改变实验，没有在第一次 closure 前做全文件内容 hash；metadata 稳定不能冒充逐字节快照证明。

## 13. Node Runtime A/B 与最小文件复现

完整 R3 保持 Vite 8.3.1，仅将运行环境切换为已有 Node 22.19.0；初次 closure 5.178s，而 Node 24 的三个 first-touch 条件均约 147–151s。Node 22 是诊断变量，不是正式 runtime 回滚。其 engine mismatch 属于实验预期；lockfile 未变化。

为进一步排除“是 Vite writer 改变而非 reader 改变”，另运行纯 `.mjs` 文件实验，不加载 tsx、Vite、Sharp 或 verifier：

1. 固定 Node 24 writer，读取已完成产物 `build/en/search/index.html`，2,174,938 bytes。
2. 在审计目录通过 `fs.copyFile` 生成新的三个副本；交替 reader 顺序为 Node 24、22、22、24，每组使用不同新文件。
3. 新 reader 进程只串行执行原生 `fs.promises.readFile(file,'utf8')`，记录请求阶段。
4. 另以 `writeFile` 产生同内容文件，区分复制与直接写入；最后对哈希相同的 relocated Node 24 executable 重复小实验。

| 新文件产生方式 / reader | 初次文件读取观察 |
| --- | --- |
| Node 24 copyFile → Node 24 reader | 6 个样本均 579–647ms |
| 同一 writer copyFile → Node 22 reader | 6 个样本均 2.606–4.382ms |
| copyFile → relocated Node 24 reader | 6 个样本均 547–651ms |
| copyFile → Node 22 reader，第二组交替实验 | 6 个样本均 2.089–5.363ms |
| Node 24 writeFile → Node 24 reader | 每组三份中第一份约 500–504ms，之后约 2ms |
| Node 24 writeFile → Node 22 reader | 每组第一份约 417–523ms，之后多数约 2ms，另有 23ms 样本 |

**Observed：**复制文件上的差异无需 bundler，也无需部署父进程；固定 writer 后 reader runtime 仍有影响。相同 Node 24 executable 换路径不能消除，两个原始 executable 的 Authenticode 状态均 Valid。临时 executable 副本已删除，hash 对照保留。

**Inferred：**这比“Node 24 所有 I/O 都慢”更具体：现象涉及文件创建/复制方式、首次读取状态以及 reader runtime 的交互。直接 writeFile 的首个慢样本也能影响 Node 22，说明不能把全部系统 first-open 成本归给 Node 24 JS 实现。没有用 copy/write 差异改造正式 adapter。

安装的 SvelteKit `src/utils/filesystem.js` 在普通 copy 分支使用 `fs.copyFileSync(from,to)`，builder.writePrerendered 通过该 copy 工具发布 pages/dependencies/data。它为复制文件的小复现提供架构关联，但不等于已证明某个 copy flag 就是根因。

还只读比较了 [Node 24.19.0 的 libuv Windows fs 源码](https://github.com/nodejs/node/blob/v24.19.0/deps/uv/src/win/fs.c) 与 [Node 22.19.0 对应源码](https://github.com/nodejs/node/blob/v22.19.0/deps/uv/src/win/fs.c)。未从该文件的 open/read 主体 diff 找到可直接解释 150 秒的补丁；不能凭版本不同指定一个 libuv bug。没有做 patch bisect、替换 libuv 或 Node 24 小版本大矩阵。

## 14. Vite / Rolldown A/B

**未运行 Vite 7 对照。** Node 22/Vite 8 已恢复到旧基线量级，且纯文件复制/读取即可复现慢路径。继续换 bundler 不能优先回答哪个 native/系统组件导致 first-open 等待，故按 prompt 的最小实验原则停止扩展矩阵。

**Inferred / High：**Vite/Rolldown child 生命周期不是本次 150 秒的承载位置；Vite 8 也不是复现所必需的条件。仍不声称已证明所有 bundler 输出写法对文件状态毫无影响。

## 15. Windows / Defender / Open Handles 的证据边界

系统存在 MsMpEng 与 SearchIndexer；普通只读查询能够看到进程及 working set，但 CPU 计数为 null，不能据此计算扫描消耗。没有发现可直接调用的 handle/handle64/Procmon 工具，未安装第三方依赖。

尝试系统已有 `New-MpPerformanceRecording -RecordTo <审计目录>/run2-defender.etl -Seconds 20`，WPR 返回 `0x80070005 Access is denied`，没有成功 ETL。外层 shell exit 0 不代表记录成功。该路径在一次明确权限失败后停止，未绕过权限、关闭防护或增加 exclusion。

[Microsoft 官方性能分析说明](https://learn.microsoft.com/en-us/defender-endpoint/tune-performance-defender-antivirus) 要求管理员 PowerShell 启动记录。若后续由具备相应权限的维护者继续，应对这个已缩小的纯 copy/read 复现采样，关联确切文件、进程与扫描耗时；若 Defender 事件不能解释，再调查其他 filesystem filter、open 调用栈与 libuv worker 队列。

**Hypothesis：**实时扫描可能造成首次打开等待及跨进程扫描后复用，但当前缺少直接事件归因。不能写“Defender 已证实”“文件锁已证实”或“纯磁盘带宽不足”。Node 进程 active handles 不能代替跨进程开放文件句柄清单；其他程序是否短时持有 build/.svelte-kit 文件仍未核实。

## 16. Root Cause Classification / Confidence

| 候选 | 判定 | 事实等级 / 置信度 |
| --- | --- | --- |
| A Telemetry boundary bug | 否；函数内时间与 stage 对齐，99% 在 readFile | Observed / High |
| B Vite child lifecycle | 否；exit/close 在 verifier 前完成 | Observed / High |
| C Parent state / worker / GC | 非主要解释；fresh child 首扫也慢，原 parent 次扫快 | Inferred / High |
| D Filesystem post-build state | 有明确 first-touch、copy/write、跨进程复用证据 | Observed / High |
| E Validator implementation interaction | 无对应 evidence；inventory/regex/index/check 成本小；纯原生读取可复现 | Inferred / High |
| F Node 24 runtime effect | reader runtime 是重要变量；未定位 Node/libuv 内部缺陷 | Observed 相关性 / High；内部缺陷归因未定 |
| G Vite 8 / Rolldown effect | 生命周期解释被排除；bundler 不是复现必要条件 | Inferred / High |
| H Host environment | Windows 系统层或 filter 交互仍是候选，Defender 未证实 | Hypothesis / 未定 |
| I Non-reproducible transient | 否；三轮 Node 24 first-touch 稳定复现，另有纯文件复现 | Observed / High |

最终保留 **D/F 与 H 的边界不确定性**：已找到业务层以下的等待位置与可复现触发条件，但没有完整 native/OS 追踪来判定具体责任组件。不能将本机结果推广为 Linux/Vercel 云端回归；本轮没有远程复验。

## 17. Recommended Fix / Why No Fix Is Yet Justified

**本轮不修改正式 verifier 或 orchestration。** timer 正确，校验没有多扫 bug；并发、预读、文件缓存、sleep、child isolation 都不能作为已有证据支持的最小修复。预读只会把首次打开的代价移到另一个阶段，child isolation 已被实测否定，sleep 5 秒也无效。

下一步应围绕审计目录里的少量 copy/read 文件复现，获取具备权限的系统性能记录或在第二台 Windows 主机重复，区分 runtime 自身和本机 filter 交互；随后才决定是否需要一个有明确上游依据的 Node 24 patch 调整。没有证据支持回滚 Node 22、降级 Vite、修改 adapter 或削弱 closure gate。

**合并建议：**Node 24/Vite 8 的正确性与既定架构决策仍成立，可以保留迁移；但不能把本次性能问题标记为已修复，也不建议以“性能验收已闭环”的名义无条件合并。如果合并门槛允许记录并跟踪仅本机已证实的性能问题，可将此次调查作为明确的未解决项；本报告不声称云端同样慢或云端已通过性能验收。

## 18. Changes Made 与证据索引

永久交付只有本 Markdown 报告。临时 `build.ts` / `verify-build.ts` 已恢复原始字节，未保留内部 API telemetry；未修改 package、lock、schema、cache 或生成流程。

审计目录中保留以下 ignored 证据，不提交大日志：

| 文件组 | 内容 |
| --- | --- |
| `run1.*` | 原始完整时间线、A/B、metadata、source diff、stdout/stderr |
| `run2.*` / `run2-child.*` | fresh child first-touch 与后续 parent A/B |
| `run3-node22.*` | Node 22/Vite 8 对照与首批 native request trace |
| `run4-delay5.*` | delay、A/B、native request trace、三次 snapshot |
| `*.verify-N.json` | wall/CPU/GC/loop、I/O分布、first10/slowest20、进度采样 |
| `*.lifecycle.jsonl` | Vite/pnpm start/output/exit 事件，含原始 PLUGIN_TIMINGS |
| `first-read-probe*.json` | 原 executable 与 relocated executable 的交替 reader 实验 |
| `first-read-probe.mjs` | 无 Vite 的小复现脚本，直接 Node 运行 |
| `build.original.ts` / `verify-build.original.ts` | 本轮开始前源码字节备份 |
| `build.instrumented.ts` / `verify-build.instrumented.ts` | 最终临时源码版本，供人工复核 |
| `diag.mjs` / `lifecycle.cjs` / `run.ps1` | 测量和启动 helper |
| `restored-source-hashes.json` / `relocated-hashes.json` | 恢复/可执行文件同一性证据 |
| `defender-recording-limitation.txt` | OS 权限失败记录，不伪装为成功扫描 |
| `final-targeted-tests.log` | 恢复后 2 files / 8 tests 通过 |

`micro.mjs` 是准备后未执行的辅助草稿，不作为结论证据。早期 `instrument.cjs` 是 R1 patch helper，后续实验增加了 fresh/delay/细分计时；精确后期变体以保留的 instrumented source 和各轮 diff 为准。源码恢复后，普通部署入口不会加载这些 ignored helper。

## 19. Validation

**Observed：**四次本地 Production profile 实验均 exit 0，cache hit、输出 smoke、missing=0、2,154 public routes/internal links 全部通过。每次 A/B 的 file/text/path counts 与 bytes 相同。

恢复正式源码后，Node 24 执行：

```text
pnpm exec vitest run tests/unit/deployment-verify-build.test.ts tests/unit/deployment-verify-routes.test.ts
Test Files 2 passed; Tests 8 passed
```

覆盖正向 URL 与缺失/大小写/非法编码等负向闭包门禁，以及相关路由契约。没有永久代码修改，故依照本轮 prompt 不重复完整 `ci:validate`、整库 lint 或浏览器 smoke。不存在为通过测试而改变 fixture/assertion 的操作。

四轮 metadata 与最终检查保持以下 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| pnpm-lock.yaml | `edc794bfcf588fcc50da1a1b8e0ce56db7c1132c3f78ef76644e89c2382fdb43` |
| upstream.lock.json | `6ee8c45ff895943056e2f199664b521a3b292a0fa1f8e9ba30d79de045dd82c2` |
| data manifest | `45e732303eb5d9d9fecc17b9c61dd5ec58e7256ae995a8f7cf06c29825e98373` |
| general asset manifest | `183b46319fe6e17f5d9a7e5686baa3786ceac31d6cf649ea8d4e7587aa057d16` |

## 20. Final Git Status 与约束确认

最终网站 `git status --short`：

```text
?? docs/investigations/deploy-verify-performance-2026-09-27.md
```

`git diff --check` 通过；tracked source 无 diff；两个 sibling repositories 的最终 status 与初始一致，均为空。没有切换/修改它们的分支或内容。所有临时输出都在网站仓库 ignored 审计目录；没有修改共享父目录。

```text
Vite 8 retained
Vite 8 default browser target retained
Node 24 retained
adapter-static behavior unchanged
404/routing semantics unchanged
closure validation semantics unchanged
no Production deployment
no unrelated dependency changes
```

`build/`、fallback 404、trailing slash、`/en/`、route verification、data diagnostics、cache key/schema 与 persistent cache architecture 均保持原契约。

## 21. 最终九问

| 问题 | 回答 |
| --- | --- |
| Q1：150 秒在哪？ | verifier 进入之后，inventory 结束之后，4,398 次串行 readFile 的累计等待；首批内部请求进一步指向 open。 |
| Q2：是业务逻辑耗时吗？ | timer 确实覆盖真实 verifier 执行，但主要是 I/O 等待；引用提取/规范化/membership 不到半秒。 |
| Q3：与 Vite 8/Rolldown 生命周期有关吗？ | 未发现；实际 exit/close 已完成，纯文件实验不需要 Vite。 |
| Q4：与 Node 24 有关吗？ | 是重要变量：Node 22/Vite 8 为 5.178s，Node 24 约 147–151s；固定 writer 的交替 reader 也支持相关性。但未证明具体 Node 内部 bug。 |
| Q5：与 Windows/主机有关吗？ | 很可能是 runtime 与 Windows first-open 状态交互；Defender、其他 filter、底层实现尚未最终区分，未做跨 OS 验证。 |
| Q6：稳定复现吗？ | 本机 Node 24 三轮首次扫描和纯复制文件样本均复现；再次扫描快。 |
| Q7：需要代码修复吗？ | 当前没有足够证据支持修改项目业务代码。性能问题真实存在，需继续系统/runtime 归因。 |
| Q8：最小修复是什么？ | 尚未确定。sleep、child isolation、预读、并发或缓存都不应作为本轮修复提交。 |
| Q9：迁移适合合并吗？ | 正确性与既定迁移方向可保留；性能不能按已解决验收。不建议无条件宣布性能闭环或将本机结果外推云端。 |
