# Build Pipeline Phase 4A — Vite / SvelteKit Build I/O Audit — 2026-09-20

## Executive Summary

本轮只调查、测量和提出 Phase 4B 方案；没有保留 benchmark instrumentation，没有修改正式构建配置，也没有触发远程部署。

结论：

- 当前 warm `vite build` 的最大阶段是 **prerender**。两个主要 baseline 的总 wall 为约 `104–108s`；其中 server bundle 约 `11.7–11.9s`，client bundle 约 `9.5–9.9s`，route analysis / worker setup 约 `6.5–6.8s`，prerender worker 约 `57.0–59.3s`，adapter-static 约 `16.6–18.3s`。
- `2,154` 个本地化页面的成本不是 route discovery。SvelteKit 用 `seen: Set` 在 enqueue 时去重；主要成本是 SSR/rendering、读取和序列化页面数据，以及把 `4,690` 个 prerender 文件、`258,495,167` bytes 写入磁盘。HTML 本身有 `2,154` 个、`164,927,968` bytes；另有同数目的 dependency JSON，共 `70,320,819` bytes。
- `static/generated-assets` 与 `static/generated-enemy-assets` 都会形成三份 byte-for-byte logical materialization：`static` source、`.svelte-kit/output/client`、最终 `build`。两棵视觉资源合计每份 `138,055,266` bytes（`131.66 MiB`），峰值三份为 `414,165,798` logical bytes；新增的两次复制合计 `276,110,532` logical bytes。
- 整个 `static` 由 Vite 的 **client build** 复制到 `.svelte-kit/output/client`；SSR build 的 `copyPublicDir` 实际为 `false`。adapter-static 随后通过 SvelteKit builder 的 `writeClient()` 和 `writePrerendered()` 同步复制到 `build`。adapter 不是直接从 `static` 写最终目录。
- `reportCompressedSize=false` 不值得实施。两个关闭样本为 `115.3s`、`123.2s`，没有比 `104–108s` 主 baseline 稳定变快；profile 中 compression 相关 self samples 约 `0.004s`。输出确实 byte-identical，但收益处于零/噪声范围。
- `['*', ...publicEntries]` 不是重复 render。`'*'` 单独构建只产生默认语言页面并缺少全部 `1,077` 个 `/en/...` 页面；显式 entries 单独构建又因 `/robots.txt`、`/sitemap.xml` unseen 而失败。两部分都需要保留，且 `seen` 已去重共同路径。
- 官方支持的 `prerender.concurrency=4` 产物正确但本地耗时 `123.2s`，比默认 concurrency `1` 慢；不推荐进入 Phase 4B。
- 最有证据的 Phase 4B 工作不是一个 config 开关，而是：**对 prerender 的 Endgame 数据读取/视图构建做独立页面级 profiling，寻找可在受支持业务边界内复用的 immutable parsed/projected data**。这需要保持全部 routes 和输出契约，预期收益尚不能从本轮直接承诺。

远端 Phase 3 Vercel Preview baseline 约 `300s`。本地数字只用于定位 framework-level 成本，不用于推导远端可节省秒数。

## Environment

| Item | Value |
|---|---|
| OS | Windows 11 Pro, `10.0.26200` |
| Machine | HP OMEN Gaming Laptop 16-am0xxx |
| CPU | Intel Core i9-14900HX, 32 logical processors |
| RAM | 32,397 MB reported by Windows |
| Node | `v22.19.0` |
| pnpm | `11.9.0` |
| Vite | `7.2.4` |
| SvelteKit | `2.70.3` |
| adapter-static | `3.0.10` |
| vite-plugin-svelte | `7.3.0` |
| Svelte | `5.57.0` |
| Inputs | warm pinned upstreams, generated data/assets and Paraglide |
| Remote reference | Phase 3 Vercel Preview approximately `300s` |

现有远端记录没有保存 Vercel build machine 的 Node patch、CPU、RAM、disk/load 或 package-manager runtime 元数据，因此无法做严格版本/硬件对比。项目声明 `node >=22`、`packageManager: pnpm@11.9.0`；本轮没有为了猜测远端环境切换本机 runtime。

本轮没有远程部署。

## Build Lifecycle

当前安装源码中的真实调用顺序如下：

```text
vite build (outer SSR/server build)
  |
  +-- SvelteKit route analysis worker
  |
  +-- nested Vite client build
  |     publicDir = <repo>/static
  |     build.copyPublicDir = true
  |     static/* -> .svelte-kit/output/client/*
  |
  +-- SvelteKit prerender worker (default concurrency = 1)
  |     SSR render -> .svelte-kit/output/prerendered/pages
  |     fetched data -> .svelte-kit/output/prerendered/dependencies
  |
  +-- adapter-static closeBundle finalization
        rimraf(build)
        builder.writeClient(build)
          .svelte-kit/output/client -> build (excluding .vite)
        builder.writePrerendered(build)
          prerendered/pages + dependencies + data -> build
        generateFallback(build/404.html)
```

Resolved config 证明：

| Build target | `publicDir` | `copyPublicDir` | `reportCompressedSize` | `outDir` |
|---|---|---:|---:|---|
| outer server | `<repo>/static` | `false` | `true` | `.svelte-kit/output/server` |
| nested client | `<repo>/static` | `true` | `true` | `.svelte-kit/output/client` |

对应源码证据：

- `@sveltejs/kit/src/exports/vite/index.js` 为 client 设置 `copyPublicDir: !ssr`，client 完成后调用 prerender，最后在 server `closeBundle` 中调用 adapter。
- `@sveltejs/kit/src/core/postbuild/prerender.js` 用 `queue(config.prerender.concurrency)`；当前版本默认 concurrency 是 `1`，并用 `seen` Set 阻止同一 decoded path 重复 enqueue。
- `@sveltejs/kit/src/core/adapt/builder.js` 的 `writeClient()` / `writePrerendered()` 使用 SvelteKit 同步 `copy()`。
- `@sveltejs/adapter-static/index.js` 先 `rimraf`，再 `writeClient`、`writePrerendered`，然后生成 fallback。

因此，当前 public/static copy 的责任边界是：**Vite client build 做第一次 materialization，SvelteKit builder 在 adapter-static 指令下做第二次 materialization。**

## Local Baseline

`svelte-kit sync` 先运行两次；Vite 第一次带 `--profile` 用于 warm-up/profile，因后两次明显比第一次慢而按要求增加第三次。主 baseline 使用第二、第三次。

| Stage | Wall | CPU | RSS | Notes |
|---|---:|---:|---:|---|
| `svelte-kit sync` | `1.62–1.70s` | `1.75–1.77s` | `144–147 MiB` | 两次均成功 |
| server bundle | `11.7–11.9s` | included below | included below | outer Vite transform/render/writeBundle start |
| route analysis + prerender worker setup | `6.5–6.8s` | included below | included below | analysis and two worker startups combined |
| Vite client | `9.5–9.9s` | included below | included below | includes first static copy |
| prerender worker | `57.0–59.3s` | worker + I/O | worker + parent | `2,154` HTML plus endpoints/dependencies |
| adapter-static | `16.6–18.3s` | mostly FS | included below | removal, client/prerender copies, fallback |
| **Vite total** | **approximately `104–108s`** | **`115–119s` aggregate process CPU** | **`2,157 MiB` measured peak in representative run** | baseline 2/3 |

第三个 baseline 的完整 process telemetry 是 `107.744s wall`, `83.687s user`, `35.594s system`, `2,156.6 MiB peak RSS`。CPU 总和超过 wall，符合 native/compiler/worker 并行和 OS I/O CPU 的组合；同时 profile 的大量 main-thread idle 证明 build 不是纯 CPU-bound。

第一次 profile run 约 `75s`，明显快于后续 `104–115s` 样本。后续连续样本稳定在较慢区间，显示本机 Windows filesystem/cache/background load 方差很大。报告不以第一次最好成绩作为 baseline，也不将本地 wall 外推到 Vercel。

## Static Asset I/O

### Materialized trees

| Directory | Files | Bytes | MiB |
|---|---:|---:|---:|
| `static` | 2,465 | 142,135,193 | 135.55 |
| `static/generated-assets` | 2,248 | 121,841,064 | 116.20 |
| `static/generated-enemy-assets` | 212 | 16,214,202 | 15.46 |
| `static` other assets | 5 | 4,079,927 | 3.89 |
| `.svelte-kit/output/client` | 2,545 | 142,921,971 | 136.30 |
| `.svelte-kit/output/server` | 119 | 1,867,077 | 1.78 |
| `.svelte-kit/output/prerendered` | 4,690 | 258,495,167 | 246.52 |
| `build` | 7,235 | 401,396,891 | 382.80 |

`generated-assets` 和 `generated-enemy-assets` 在 `static`、client output、`build` 三处的 file count 和 byte count 完全相同。抽样 SHA-256 也相同：

| Sample | Bytes | SHA-256 (all three locations) |
|---|---:|---|
| `generated-assets/branding/train-party.png` | 4,652 | `834d995d02d8f7a2d67c6135ffb2a8edb8e864d7b38ee9fee3f3356d032e0001` |
| `generated-assets/characters/portrait/1001.webp` | 308,922 | `4ea127da60532c465f27a444dd8f990e0aae32ea0dc0aab298e719d70708d1f7` |
| `generated-enemy-assets/icons/Monster_1002011.webp` | 27,938 | `6d536b860769bdd386466959ba281c8dcdd2dcd6ef86075c1fbc2ca7c7288331` |

### Copy count, bytes and wall

使用当前 SvelteKit `copy()` 实现对相同 source trees 做两个独立 warm copy 样本。Vite 的安装源码使用同样的同步 recursive `readdir/stat/mkdir/copyFile` 形态，但没有公开单独 copy timing hook，因此第一行是相同输入/操作的隔离 proxy，不是 Vite 内部毫秒级计时：

| Copy/materialization | Files | Logical bytes | Wall samples |
|---|---:|---:|---:|
| Vite client: `static -> output/client` | 2,465 | 142,135,193 | `2.46s`, `4.55s` |
| adapter `writeClient` | 2,544 | 142,899,616 | `3.65s`, `4.62s` |
| adapter prerender pages | 2,536 | 188,174,348 | `5.16s`, `5.95s` |
| adapter prerender dependencies | 2,154 | 70,320,819 | `4.64s`, `5.17s` |
| adapter prerender data | 0 | 0 | `<0.001s` |
| remove combined copied tree | 7,234 | 401,394,783 | `6.13s`, `5.41s` |

`writeClient` 排除 `.vite/manifest.json`，因此比 client tree 少一个文件、22,355 bytes。adapter 再生成一个 `404.html`，形成最终 7,235 文件。

隔离 benchmark 的 `adapter-client` wall 样本实际还复制了这个 22,355-byte manifest，因而是对正式 `writeClient` 略偏保守的 proxy；报告的 files/bytes 已按 framework filter 修正。

一次 build 中三次 copy materialization 的 payload 合计约 `543,529,976` logical bytes（`518.35 MiB`）：

```text
static -> client                 142,135,193 bytes
client -> build                 142,899,616 bytes
prerendered -> build            258,495,167 bytes
```

在所有最终目录同时存在时，`static + client + server + prerendered + build` 的 logical file-size footprint 约 `946,816,299` bytes（`902.95 MiB`），未计 `.svelte-kit` 的 generated/types 等其它内容。

这些是 logical materialization/file-size 数字，不是设备层实际 read/write bytes。NTFS cache、compression、antivirus 和 storage controller 都可能改变物理 I/O。V8 profile 的 self samples 提供了独立方向性证据：`copyFile 8.578s`、`unlink 2.770s`、`mkdir 1.553s`、`stat 1.042s`、`rmdir 1.016s`、`readdir 1.009s`。

## Prerender

### Entries and route set

当前 manifest：

```text
routePaths:       1,077
publicLocales:    2 (zh-CN, en)
explicit entries: 2,154
configured:       ['*', ...publicEntries]
```

最终正常输出：

| Output | Count | Bytes |
|---|---:|---:|
| HTML | 2,154 | 164,927,968 |
| dependency JSON | 2,154 | 70,320,819 |
| extensionless endpoint files | 380 | 22,504,437 |
| sitemap/robots endpoint files | 2 | 741,943 |
| **prerender total** | **4,690** | **258,495,167** |

HTML 平均 `76,568` bytes。最大页面是 `en/search/index.html`（2,173,538 bytes）和 `search/index.html`（2,106,222 bytes），但只有两页；它们不是 2k routes 的总量根因。

| Route category | HTML count | HTML bytes | Average | p95 | Max |
|---|---:|---:|---:|---:|---:|
| enemies | 1,258 | 85,531,259 | 67,990 | 158,278 | 478,794 |
| endgame | 232 | 32,719,063 | 141,030 | 198,174 | 213,285 |
| characters | 196 | 30,726,510 | 156,768 | 266,410 | 407,307 |
| light-cones | 340 | 8,744,079 | 25,718 | 29,819 | 117,251 |
| relics | 122 | 2,738,307 | 22,445 | 23,726 | 72,011 |
| search | 2 | 4,279,760 | 2,139,880 | 2,173,538 | 2,173,538 |

### What costs time

Evidence supports this ranking:

1. **SSR/page rendering and data work**: prerender worker alone is about `57–59s`; a representative worker CPU profile shows `readJson` in the generated Endgame path, decimal formatting in `endgame-view`, JSON response work and GC among the leading non-idle samples.
2. **Filesystem writes and metadata operations**: prerender writes `258.5 MB / 4,690 files`; parent profile is `57.47%` idle and has `21.44%` filesystem-labelled self samples.
3. **Serialization**: present but not the dominant parent-process hotspot (`0.15%` coarse self-sample classification); worker JSON/string work is included in rendering.
4. **Route discovery/dedup**: not material. `seen` Set makes mixed entries idempotent, and no evidence shows discovery consuming meaningful wall time.
5. **Adapter processing**: not route rendering, but the second large stage because it deletes the prior final tree and copies client/prerender outputs synchronously.

Module-level caches exist for generated search data, Endgame datasets, enemy references and group views. The profile nevertheless shows generated JSON reads in framework workers; worker/module boundaries mean caches are per worker/build process, not a cross-build cache. The evidence does not support a claim that every route re-parses every large JSON file, but it does justify a narrower Endgame/page-family profiling task.

No 2,000-line per-route timer was added. Current SvelteKit has no public per-route timing hook, and instrumenting the private prerender scheduler would violate the investigation boundary. Category output sizes above identify volume and long-tail candidates without pretending they are render-time measurements.

## Vite Option Experiments

| Experiment | Wall | Output/correctness | Decision |
|---|---:|---|---|
| current config, main baseline | `104–108s` | 7,235 files; stable tree hash | reference |
| `reportCompressedSize=false`, run 1 | `115.3s` | byte-identical | no benefit |
| `reportCompressedSize=false`, run 2 | `123.2s` | byte-identical | no benefit |
| `entries=['*']` | `87.7s` | missing all 1,077 `/en/...` pages; route verification failed | reject |
| explicit entries only | failed after bundles | `/robots.txt` and `/sitemap.xml` unseen | reject |
| `prerender.concurrency=4` | `123.2s` | byte-identical; route and asset closure pass | reject locally |
| client `copyPublicDir=false` | failed after client build | prerender 404 on `/generated-assets/branding/train-party.png` | reject |

Normal, compressed-off and concurrency outputs shared this complete build tree SHA-256 manifest digest:

```text
83591a859e7475d6f6d2e59d93511c89a0e7f862b19162737db5cc069891022b
```

### `reportCompressedSize`

Vite reports gzip only for emitted client bundle assets, not the 2,465 copied static files. In the profile, compression-labelled self time was approximately `0.004s`; disabling reporting did not reduce client phase or total wall. This is **not worthwhile** for Phase 4B.

### `copyPublicDir`

The option is framework-controlled and currently necessary. Setting it false for the nested client eliminated the first materialization but also removed public assets from SvelteKit's client asset set; prerender immediately failed when crawling a referenced generated asset. A manual replacement copy would merely move the same work and is not a valid optimization. Do not change this option under the current architecture.

### Prerender entries

`'*'` expands only non-parameterized prerenderable route IDs. Route-level `entries()` supplies parameter values, while explicit localized entries supply the `/en` prefix that route-level entries currently do not generate. The two sources overlap for default-language routes, but `enqueue()` returns immediately when `seen.has(decoded)`; overlap is Set lookup, not duplicate render/write.

## Profiles

The Vite `--profile` artifact sampled `76.804s` in the fast warm-up run. Top self samples:

| Sample/group | Self time | Share |
|---|---:|---:|
| idle | 44.140s | 57.47% |
| filesystem-labelled group | 16.467s | 21.44% |
| `copyFile` | 8.578s | 11.17% |
| Rollup/Vite-labelled group | 5.779s | 7.52% |
| Tailwind `generate` | 2.364s | 3.08% |
| Svelte-labelled group | 1.451s | 1.89% |
| GC | 1.207s | 1.57% |
| serialization-labelled group | 0.116s | 0.15% |
| compression-labelled group | 0.004s | 0.01% |

分类是按 frame name/URL 的 coarse self-sample grouping，不能相加为完整 exclusive subsystem wall time；但它可靠地区分了 copy/wait 与 gzip-reporting 的数量级。

额外 Node CPU profile 验证了 worker 进程：route analysis/prerender worker 都由 `worker_threads` 创建；代表性 busy worker 中 Endgame `readJson` 约 `3.5s` self，随后是 GC、decimal formatting、module/file open/stat 与 JSON response work。该 profile 来自 disposable `copyPublicDir=false` 诊断，在资产 404 后提前退出，因此只用于 hotspot identification，不作为完整 route-category timing。

## Candidate Optimizations

### Tier 1 — Supported / low risk

| Candidate | Local measured saving | Risk | Framework support | Maintenance / fragility | Recommend |
|---|---:|---|---|---|---|
| Keep current entries; document why both halves exist | avoids a future incorrect “optimization” | low | public config | low | **yes, documentation only** |
| Add optional phase telemetry around existing public build command | observability only | low | Vite plugin hooks | low | optional; do not make default noisy |
| `reportCompressedSize=false` | none measured | low | Vite public option | low | **no** |
| `prerender.concurrency=4` | `-15s` to `-19s` (regression) | low correctness, performance regression | SvelteKit public option | low | **no** |

There is no measured Tier 1 config change that safely speeds up the current workload.

### Tier 2 — Supported but architectural

| Candidate | Evidence / expected local benefit | Risk | Support / maintenance | Recommend |
|---|---|---|---|---|
| Profile and reduce repeated Endgame generated-data reads/view construction within existing server loaders | prerender is `57–59s`; worker shows `readJson`/formatting hotspot; saving not yet measured | medium; must preserve locale and route output | application boundary, not framework private API | **Phase 4B first investigation/implementation candidate** |
| Reduce prerender payload only through lossless representation changes | `258.5 MB` intermediate, `235.2 MB` HTML+dependency JSON; potential I/O/serialization benefit unknown | medium/high; hydration and page semantics | supported app rendering changes | only after route-family measurement |
| Revisit static asset serving architecture | duplicate visual logical bytes are `263.32 MiB` beyond source; first copy costs `2.5–4.6s` | high; prerender currently requires client asset set | requires a supported SvelteKit design, not a flag | research only; no Phase 4B commitment |

The first Tier 2 item must begin with supported page/load instrumentation and a bounded Endgame fixture. It should not merge worker processes, preload the entire 361 MiB generated dataset, or introduce global mutable locale state.

### Tier 3 — Fragile / filesystem hacks

| Candidate | Possible ceiling | Risk / fragility | Recommend |
|---|---:|---|---|
| hardlink/reflink client assets into `build` | adapter client copy roughly `3.7–4.6s` locally | custom adapter or private output paths; NTFS/Linux/Vercel semantics differ | no |
| hardlink/reflink prerender outputs | adapter prerender copies roughly `9.8–11.1s` | same plus deployment packager/link handling | no |
| manually manipulate `.svelte-kit/output` | up to adapter copy stage | undocumented layout, upgrade fragile | no |
| monkey-patch prerender scheduler | unknown | private implementation and correctness risk | no |

No hardlink/reflink prototype was run. A usable implementation would require replacing adapter-static behavior or depending on private output paths, contrary to the current architecture boundary; the measured ceiling does not justify that maintenance cost.

## Rejected Ideas

- **Disable compressed-size reporting**: byte-safe but no measurable benefit.
- **Use `'*'` only**: faster only because it silently removes every English page.
- **Use explicit routes only**: loses standalone prerendered endpoints and fails SvelteKit unseen-route validation.
- **Raise prerender concurrency to 4**: supported and correct, but slower on the measured workload.
- **Disable public copy**: fails prerender asset closure before adapter finalization.
- **Replace Vite copy with a manual Node copy**: same materialization under a different owner, with no demonstrated I/O reduction.
- **Custom adapter/hardlinks/private `.svelte-kit` paths**: cross-platform and upgrade fragile for a local ceiling of seconds, not tens of seconds.
- **Reduce locales or historical pages**: prohibited and unnecessary; the route set is product output.

## Network Attempts

No network access required. Framework evidence came from the installed package source; all experiments used local warm inputs.

## Remote Deployment

No Vercel Preview or Production deployment was triggered during Phase 4A.

Remote deployment count for this phase: `0`.

The approximately `300s` Phase 3 remote Preview remains the reference. Local evidence suggests prerender/application data work is the only candidate deserving implementation work before one normal Phase 4B Preview validation; it does not establish a remote saving.

## Phase 4B Proposal

1. **Do not change Vite/SvelteKit config merely for apparent wins.** Retain `reportCompressedSize`, `copyPublicDir`, `['*', ...publicEntries]`, adapter-static and default prerender concurrency. Measured benefit: none; validation: ordinary production build and existing closure checks.
2. **Add disposable, supported route-family timing around application loaders/render inputs**, aggregated by `home`, `characters`, `light-cones`, `relics`, `enemies`, `endgame`, `search`, and generated endpoints. Do not patch SvelteKit internals. Risk: low if instrumentation is temp or opt-in. Validation: timing disabled by default and output tree hash unchanged.
3. **Investigate Endgame cache/reuse boundaries first.** Confirm which JSON reads and view projections repeat across entries/locales inside a single prerender worker; implement only a bounded immutable per-locale/per-dataset cache or preprojection with measured benefit. Risk: medium. Validation: unit tests for loader semantics, both locales, full route closure, asset closure and byte/semantic comparison of representative Endgame pages.
4. **Re-run A/B after the application change**, two warm samples each, recording the same server/client/prerender/adapter timestamps, CPU/RSS and output tree digest. Accept only a saving larger than observed variance with unchanged 2,154-page route set.
5. **Use one normal Vercel Preview only after a local winner exists.** Compare against the approximately `300s` reference, but report the full remote stage log and runtime metadata rather than attributing all difference to the code change.

Phase 4B should not include a custom adapter, hardlinks/reflinks, manual `.svelte-kit` manipulation, dependency/runtime upgrades, route reductions or an external build cache.

## Verification Summary

| Check | Result |
|---|---|
| two `svelte-kit sync` runs | passed |
| three current-config Vite builds including `--profile` | passed |
| two `reportCompressedSize=false` builds | passed; output byte-identical |
| `entries=['*']` build + route verification | build completed; verification correctly failed on 1,077 missing English pages |
| explicit-only entries | correctly failed on unseen `robots.txt` / `sitemap.xml` |
| concurrency 4 build | passed; route and asset closure passed; output byte-identical |
| `copyPublicDir=false` | correctly failed on missing generated static asset during prerender |
| restored normal build | passed |
| restored route verification | passed: 2,154 public page indexes and internal links |
| restored asset closure | passed: 4,393 text files, 9,425 indexed paths |
| normal build tree digest | stable across baseline/restored runs |

All `.cpuprofile`, timing logs and temporary instrumentation were disposable investigation artifacts and are not part of the repository result.
