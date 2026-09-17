# HSR Data Agent — Vercel Route Limit Blocker Investigation

日期：2026-09-17  
调查对象：`develop` / `7f5f89b`  
范围：只调查；未部署、未修改 Dashboard、未实施任何候选架构

## 1. Executive Summary

Preview 失败的主体原因已经确定：当前 `@sveltejs/adapter-vercel` 6.3.4 会为每个非根 prerendered page 生成两条 `config.routes` 规则。项目有 2,152 个本地化静态页面，其中 2,151 个不是根页面，因此仅这部分就产生：

```text
2,151 × 2 = 4,302 routes
```

再加 6 条全局、Function 与 catch-all 规则，本地 `.vercel/output/config.json` 精确包含 **4,308 条 routes**。Vercel 对同一 commit 的真实 Preview 报告 `received 4317`，因此还有 **9 条无法从本地 checkout 直接归属的 deployment routes**。如果该 Preview 启用了 Skew Protection，adapter 会在远端通过 `VERCEL_SKEW_PROTECTION_ENABLED=1` 条件性增加 2 条规则，此时差额应解释为“远端 adapter 4,310 + 另外 7 条平台/项目侧规则”。没有失败 deployment 的最终 Build Output 或 Vercel 内部计数明细，不能在这两种情况间做事实判断。

2,152 个 `overrides` 全部是 HTML clean-URL 映射；它们没有直接相加进本次 `4317`。若 `routes + overrides` 都按条计数，本地产物已是 `4,308 + 2,152 = 6,460`，与真实错误不符。Vercel 公共文档没有完整公开内部计数算法，所以这是一项由真实错误与 artifact 反推得到的强证据，不应扩大成普遍平台保证。

当前 stable 已是 adapter-vercel 6.3.4、SvelteKit 2.70.3；adapter 当前源码仍保留逐页两规则逻辑，没有可配置的 clean-URL/override suppression/route aggregation 选项，也没有找到可用的 stable 修复。改 `trailingSlash` 只会交换 canonical 与 counterpart 的方向，不会消除逐页两条规则。

三条路线的结论：

- **A（保留 adapter-vercel 并压缩 output）技术上可行，但属于 possible but fragile。** 用严格 allowlist 的 2 条 regex 替换 4,302 条逐页规则，预计本地 `config.routes` 可降到 8 条，启用 Skew Protection 时为 10 条；按本次平台差额外推，deployment 约 17 条。不过这需要维护 adapter 产物 post-processor，并在真实 Preview 验证 route order、destination 不存在时的行为、`__data.json` 与 404。
- **B（adapter-static + 同项目原生 `/api` Function）是首选架构。** Vercel 正式支持自定义静态 Output Directory 与 root `api/**` Functions 共存；既有 Production 已证明 2,152 个静态页面可由 `Other + build` 部署且不触发此问题。它避开的是 adapter-vercel 的逐页 routing metadata，而不是 Agent data packaging。代价是原生 Function 不自动继承 SvelteKit `$lib/server` 边界，Vite dev 也不直接运行 root `/api`，因此需要薄适配层、明确 server package 边界、文件追踪验证，并以 `vercel dev` 或 dev proxy 补齐本地开发。
- **C（独立 backend project）目前没有必要。** 它能隔离 backend 生命周期，但会引入前后端 deployment/data revision 配对、Preview 映射、CORS 或跨项目 rewrite、secret 与配额身份一致性等运维成本；当前没有证据证明 B 无法工作。

**Preferred architecture: B。** 但不应立刻回退现有 UI-1.5A 工作；先在临时分支做一个最小 Route B Preview proof，验证 static clean URLs、root Function、runtime import 与 data inclusion，再决定用 B 有意替代 adapter-vercel 部署层。

## 2. Reproduction and Evidence Boundary

### 2.1 Checkout 与版本

- Git：`develop` 与 `origin/develop` 对齐，commit `7f5f89b`。
- `@sveltejs/adapter-vercel`：lockfile 实际解析为 6.3.4。
- `@sveltejs/kit`：2.70.3。
- 构建入口：`pnpm deploy:build`，最终调用 SvelteKit/Vite 并验证 `.vercel/output`。
- `svelte.config.js` 使用 `adapter()` 默认选项；`prerender.entries` 包含 `'*'` 和 manifest 的全部本地化公开路由。
- `vercel.json` 只有 Git deployment policy，没有 rewrites、redirects、headers 或 functions routing。
- GitHub Preview workflow 使用 Node 22、Vercel CLI 59.16.0，并运行 `vercel deploy --yes --target=preview`。

对应 GitHub run 在同一 commit 上失败，Vercel 返回：

```text
Maximum number of routes (rewrites, redirects, etc) exceeded.
Max is 2048, received 4317.
```

### 2.2 本地 artifact 复现

在当前依赖版本下重新生成 `.vercel/output` 并解析 `config.json`，得到：

```text
config.version        3
config.json bytes     548,944
routes.length         4,308
overrides entries     2,152
static HTML           2,152
static __data.json    2,152
physical Functions    1
```

Windows 本地环境不允许 adapter 创建部分目录 symlink，复现时只对已安装依赖做了临时 copy-based 构建兼容处理；route 生成代码和配置内容没有改变，调查结束前该临时修改已恢复。此项是本地 OS 限制，不是 Preview route blocker。

### 2.3 已知与未知边界

已知：本地产物逐项可解释 4,308 条 `routes`；真实 Vercel deployment 计数为 4,317；两者来自同一 commit 与同一 stable adapter 版本。

未知：失败 deployment 的最终远端 `.vercel/output/config.json`、Skew Protection 状态、以及 Vercel 在接收 Build Output 后追加的内部 route records 没有公开在 workflow log 中。因此剩余 9 条不能可靠命名。GitHub annotation 只保留了 Vercel CLI 的总数和 exit code。

## 3. Exact 4317 Route Anatomy

### 3.1 本地 `config.routes` 精确分类

| Source | Count | Evidence |
|---|---:|---|
| Reserved `__pathname` query transform | 1 | `src: ".*"`，删除 request query 中的 `__pathname` |
| Prerender clean path → slash counterpart rewrite | 2,151 | 每个非根 prerender page 一条，例如 `/characters/1001 → /characters/1001/` |
| Slash counterpart → canonical clean path 308 | 2,151 | 每个非根 prerender page 一条，例如 `/characters/1001/ → /characters/1001` |
| Immutable asset cache header | 1 | `/_app/immutable/.+`，一年 immutable cache |
| Filesystem handler | 1 | `{ "handle": "filesystem" }` |
| Missing immutable asset 404 | 1 | `/_app/immutable/.+`，404 + `no-store` |
| Physical Function route | 1 | `^/api/_deployment-probe/?(?:/__data.json)?$ → /api/_deployment-probe` |
| SvelteKit catch-all Function route | 1 | `/.* → /![-]/catchall` |
| **Local `config.routes` subtotal** | **4,308** | `routes.length` |

核算：

```text
1 + 2,151 + 2,151 + 1 + 1 + 1 + 1 + 1 = 4,308
```

逐页规则占本地 routes 的 `4,302 / 4,308 = 99.86%`，占 Vercel 报告总数的 `4,302 / 4,317 = 99.65%`。

### 3.2 `overrides` 精确分类

| Override type | Count | Evidence |
|---|---:|---|
| Prerender HTML | 2,152 | `index.html → ""`、`characters/1001.html → "characters/1001"` 等 |
| `__data.json` | 0 | 无 override key 以 `__data.json` 结尾 |
| Endpoint JSON | 0 | 无对应 override |
| Other | 0 | 全部 2,152 项均为 `.html` |
| **TOTAL overrides** | **2,152** | `Object.keys(config.overrides).length` |

这些 override 的职责是把实际 `.html` 文件暴露为无扩展名的 clean URL；它们不是 redirect，也不承担 locale detection。英文页面与中文页面只是同一生成循环中的不同 prerender page。

### 3.3 从 4,308 到 4,317

| Source | Count | Confidence / evidence |
|---|---:|---|
| 本地 Build Output `config.routes` | 4,308 | Exact；当前 checkout 实测 |
| 远端 build 条件性 Skew Protection routes | 0 或 2 | Unknown；adapter 源码在 `VERCEL_SKEW_PROTECTION_ENABLED=1` 时增加 2 条 |
| 其他平台/项目侧 route records | 9 或 7 | Unknown；由 4,317 减去前两项得到，公开日志没有逐项明细 |
| **Vercel interpreted TOTAL** | **4,317** | Exact；真实 Preview error |

因此最诚实的数学关系是：

```text
Skew Protection 未启用：4,308 + 9 unknown = 4,317
Skew Protection 已启用：4,308 + 2 + 7 unknown = 4,317
```

不能把 9 条直接命名为 framework preset、clean URLs、locale 或某一种 normalization；checkout 没有这项证据。也不能用 `routes + overrides` 解释：那会得到 6,460，不是 4,317。由此可合理推断本 deployment 的 2,152 个 overrides 没有被同口径逐条计入 route cap，但 Vercel [Limits](https://vercel.com/docs/limits) 与 [Build Output API configuration](https://vercel.com/docs/build-output-api/configuration) 没有完整公开所有内部计数细节。

## 4. adapter-vercel Generation Trace

`svelte.config.js` 从 manifest 生成 1,076 条 canonical routes × 2 个 locale，共 2,152 条 `prerender.entries`。adapter 6.3.4 的 `static_vercel_config()` 实际执行逻辑如下：

1. 遍历 `builder.prerendered.redirects`，保留真正的 SvelteKit prerender redirects。
2. 遍历 `builder.prerendered.pages`。
3. 根页面只创建 `index.html → path: ""` override，不创建 slash pair。
4. 对每个非根页面：
   - 计算 path 的 slash counterpart；
   - 创建 canonical path → counterpart 的内部 rewrite；
   - 创建 counterpart → canonical path 的 308 redirect；
   - 创建 `page.file → clean path` override。
5. 加入 reserved query transform、immutable cache、可选 Skew Protection、filesystem handler、immutable 404。
6. 为非 prerender endpoint/function 添加 routing；最后加入 SvelteKit catch-all。

单个当前风格页面的物理与 metadata 关系是：

```text
.vercel/output/static/characters/1001.html
.vercel/output/static/characters/1001/__data.json

override:
  characters/1001.html -> characters/1001

routes:
  /characters/1001  -> /characters/1001/
  /characters/1001/ -> 308 /characters/1001
```

`__data.json` 是普通静态文件，不产生逐页 override，也不单独产生 route。一个非根 prerender page 的 route-limit 成本是 **2 routes**；根页面是 **0 routes + 1 override**。

当前 [adapter-vercel 文档](https://svelte.dev/docs/kit/adapter-vercel) 提供的主要选项是 runtime（已 deprecated）、regions、split、external、memory、maxDuration、ISR 与 images；没有 clean URL strategy、prerender output layout、override suppression、filesystem routing 或 route aggregation 选项。

## 5. Stable Version and Vercel Limit Semantics

### 5.1 Stable 版本调查

2026-09-17 查询 npm registry：

```text
@sveltejs/adapter-vercel latest = 6.3.4
@sveltejs/adapter-vercel next   = 7.0.0-next.9
@sveltejs/kit latest            = 2.70.3
@sveltejs/kit next              = 3.0.0-next.27
```

当前项目已在 latest stable。官方仓库 main 上 adapter package 仍为 6.3.4，逐页 pair 逻辑未改变；[6.3.4 changelog](https://github.com/sveltejs/kit/blob/main/packages/adapter-vercel/CHANGELOG.md) 的相关修复是 immutable 404 cache behavior，不是 route aggregation。调查官方源码、changelog 与相关 issue/PR 搜索后，没有找到已经发布的 stable route-count fix。Prerelease 不应作为此 Production 架构的解决方案。

### 5.2 2048 的公开语义

Vercel [Limits](https://vercel.com/docs/limits) 将 Hobby 与 Pro 的 “Routes created per Deployment” 都列为 2,048；因此普通 Pro 升级不能解决。这个限制涵盖 deployment 中的 routes，包括 rewrites、redirects、headers，以及通过 [Build Output API](https://vercel.com/docs/build-output-api) 配置的 route rules。`handle: filesystem`、header-only rules 和 Function dispatch 在当前错误口径中也表现为 route entries。

公开文档分别定义了 `routes` 和 `overrides`，但没有承诺内部 quota 对每一种 metadata、framework-injected record 和 platform normalization 的完整计数公式。当前 artifact 与 `4317` 的差异只能支持两项经验结论：

- `config.routes` 是绝对主体；
- 2,152 个 overrides 没有在本次 deployment 中按一项一条直接加到 4,317。

Enterprise 可以定制该额度，但不应为 adapter 输出膨胀支付架构成本，也不是推荐路径。Bulk Redirects 解决的是大量业务 redirect mapping，不适用于框架为静态页面生成的内部 clean-URL 路由。

## 6. Route A — Keep adapter-vercel, Reduce Metadata

### 6.1 A1：官方配置

结论：**不存在直接解决此问题的官方 adapter option。** `split` 影响 Function 拆分，ISR 影响 page serving model，regions/runtime/memory/duration/external/images 均不改变 prerender page 的两条 slash rules。

### 6.2 A2：`trailingSlash`

adapter 的循环依据最终 prerender `path` 是否以 `/` 结尾选择 counterpart：

- `never`：`/foo` 为 canonical，counterpart 是 `/foo/`；物理页面通常为 `foo.html`。
- `always`：`/foo/` 为 canonical，counterpart 是 `/foo`；物理页面通常为 `foo/index.html`。
- `ignore`：页面输出形态可能随 route 改变，但 adapter 对每个非根 prerender page 仍执行同一个 counterpart pair 生成流程。

所以 `always`/`ignore` 不会从根本上把 4,302 降到 2,048 以下。`always` 还会改变全站 canonical URL、sitemap、内部链接与 SEO 语义，不是轻量修复。

### 6.3 A3：物理布局与 clean URLs

[Build Output API primitives](https://vercel.com/docs/build-output-api/primitives) 说明静态文件按其 output path 提供；`.html` 文件要暴露为不同的无扩展名 URL，需要 clean URL behavior 或 override/routing metadata。当前 adapter 选择：

- 页面 HTML 为 `foo.html`；
- `overrides` 暴露 `/foo`；
- route pair 规范化 `/foo` 与 `/foo/`；
- `foo/__data.json` 保持真实路径，供 SvelteKit client navigation 使用。

把 HTML 改为 `foo/index.html` 并不会自动保留“无尾斜线 canonical”语义；它更自然地对应 `/foo/`，仍需 redirect `/foo/ → /foo` 或改变全站 URL。创建无扩展名物理文件还必须保证 HTML Content-Type，并非传统静态服务器经验可以替代的 Build Output API contract。

### 6.4 A4/A5/A6：post-process、regex 与 filesystem

Build Output API 是正式支持的 deployment filesystem contract，`routes` 支持 PCRE source 和 capture groups，`handle: filesystem` 可在规则序列中让真实静态文件优先。因此，从平台 primitive 角度，聚合规则是允许的；但 adapter 没有提供 hook 或兼容性承诺，直接重写 adapter 产物仍是自维护层。

一个可调查的 deterministic 方案是：

1. 保留 2,152 个 HTML overrides、静态文件和 `__data.json`。
2. 删除 4,302 条逐页 slash pair。
3. 以严格的页面 route grammar allowlist 生成 2 条聚合规则：
   - canonical clean path → slash counterpart 的内部 rewrite；
   - slash counterpart → canonical path 的 308 redirect。
4. 保留 query transform、immutable rules、filesystem、Function 与 catch-all 的原始顺序。

allowlist 必须只覆盖实际页面家族，例如中英文 `search`、catalog、数字 ID detail、endgame mode/group，不能使用宽泛的 `/(.*) → /$1.html`。宽泛规则会碰撞：

- `/_app/**` assets；
- `/generated/**` JSON 与 380 个 occurrence shards；
- `/api/**`；
- `__data.json`；
- 含点扩展名的资源；
- 不存在目标与 404；
- URL encoding、大小写和未来新增 route。

关键未证实点是：rewrite destination 不存在时，Vercel 是否会继续执行预期 fallback，以及 override、filesystem 与后续 catch-all 的实际顺序是否完全等价。文档给出了 route 顺序与 `handle: filesystem` primitive，但不足以替代 Preview 行为测试。

分类：**possible but fragile**。它可以由生成器 + schema/invariant verifier 管理，但每次 adapter upgrade 都需要重新 diff route contract；一旦 allowlist 落后，新页面可能被 Function catch-all 或 404 接管。

### 6.5 A7：overrides 是否为主要问题

否。overrides 是 2,152 个 HTML 的 clean-URL 映射，但本次 cap 的主体是 4,302 条 `routes`。为了降低 route cap，不必先删除 overrides；贸然删除反而会失去 `/characters/1001` 到 `characters/1001.html` 的映射。

理论上可通过物理 layout + 全局 clean URL strategy 一并消除逐页 overrides，但这不是 adapter-vercel 当前支持的配置，并会扩大对 SvelteKit client navigation、Content-Type 和 canonical URL 的验证面。

### 6.6 Route A 预测 budget

```text
query transform                         1
aggregated page regex rules             2
immutable cache + immutable 404         2
filesystem handler                      1
Function route                          1
SvelteKit catch-all                     1
local config.routes subtotal            8
optional Skew Protection                2
observed platform/project residual    7–9
predicted interpreted total           ~17
```

2,152 overrides 保留；按本次 error 的经验计数，它们不会逐项占用 2,048 route quota。该预算比上限低两个数量级，但只有真实 Preview 能确认最终计数。

### 6.7 Future Experiment A（不在本轮实施）

1. 在临时分支固定 adapter 6.3.4 与 route inventory。
2. 写一次性 post-processor，只识别并替换经 verifier 证明完整的 4,302 条 pair。
3. 断言所有其他 route JSON 深比较不变，overrides/HTML/`__data.json`/Function 文件摘要不变。
4. 对每个公开 URL 测试无斜线 200、尾斜线 308、client navigation data 200、Content-Type、404 与 assets。
5. 特别测试不存在但匹配 grammar 的 ID，确认不会错误 fallback。
6. 本地确认 `routes.length = 8`（或 Skew 条件下 10）。
7. 只部署 Preview，记录平台最终 route count；通过后再讨论是否接受长期 post-processor 维护责任。

## 7. Route B — adapter-static + Native Vercel Function

### 7.1 B1：同项目组合是否正式支持

是。Vercel [Configure a Build](https://vercel.com/docs/builds/configure-a-build) 支持自定义 Build Command 与 Output Directory，静态 output 由 CDN 提供；Vercel [Functions](https://vercel.com/docs/functions) 与 [Functions API reference](https://vercel.com/docs/functions/functions-api-reference) 支持项目根 `api/**` 中的 TypeScript/JavaScript Node Function。静态输出与原生 Function 是同一 deployment 的不同 primitives，不要求拆项目。

对这个组合，**Framework Preset = Other** 更清晰：

- `pnpm deploy:build` 生成 `build/`；
- Output Directory 指向 `build`；
- root `api/agent.ts` 由 Vercel 原生 Function builder 处理；
- 不让 SvelteKit preset 再运行 adapter-vercel 并重建 `.vercel/output`。

### 7.2 B2：为什么能避开 2048

普通 Output Directory 的静态文件直接作为 deployment static files 上传，不需要 adapter-vercel 为每个 prerender page写两条 `config.routes`。现有 Production 在迁移前已经以 `adapter-static + Other + build` 成功部署相同规模站点，这是项目级实证；若静态文件天然每页消耗两条 deployment routes，旧 Production 同样会超过 2,048。

加入一个 `api/agent.ts` 会增加一个原生 Function及少量固定平台 routing，不会把 2,152 个静态页面转换成 4,302 条 adapter rules。精确总数必须由未来 `vercel build`/Preview 读取，但基于 Vercel generic static builder、一个 Function 与本项目旧 Production，预期是 **个位数到低双位数**，而不是随页面数线性增长。

### 7.3 B3：Clean URLs

Vercel [`cleanUrls`](https://vercel.com/docs/project-configuration/vercel-json) 能把 `about.html` 暴露为 `/about` 并将 `.html` URL 规范化；其文档默认值是 false。旧 Production 实际能访问 `/characters/1001`，但当前 checkout 无法证明当时是 Dashboard、project inference、历史 config 还是其他 platform behavior 提供 clean URL。

能确定的是：旧部署路径没有生成 adapter-vercel 的逐页 rules，且真实 URL 可用。不能确定的是它当时的最终 route metadata 与隐式设置。因此 Route B 实验必须同时：

- 下载/检查本地 `vercel build` 产物或 Preview build metadata；
- 测试 `/foo`、`/foo/`、`/foo.html` 的 status/Location/Content-Type；
- 决定是否把 `cleanUrls: true` 与 trailing-slash policy 明确写入版本控制，避免依赖 Dashboard 隐式状态。

预期 `cleanUrls` 由 generic builder 生成少量全局规则，而不是每个静态文件两条规则；仍以 Preview route count 为 acceptance gate。

### 7.4 B4：复用当前 Agent runtime

当前 `src/lib/server/agent/runtime.ts` 的运行时依赖以 npm package 和相对 `.js` imports 为主：`ai`、DeepSeek provider、contracts、model、tools。model 从 `process.env` 读取配置，没有 `$env/dynamic/private`。这使“薄 root API handler 调用现有 runtime”在 Node Function 中具备较高可行性。

但不能直接假设完整兼容：

- Vercel 原生 TS bundling 不等同于 SvelteKit/Vite transform；`$lib/*` value import 若进入 runtime graph 可能失败。
- 当前 generated-data reader 使用 `node:fs/promises` 与 `path.resolve()` 读取项目文件；动态路径通常不能仅靠静态 import tracing 保证打包。
- TypeScript aliases 与 `.svelte-kit/tsconfig` 不应成为原生 Function 的隐式依赖。
- AI SDK、DeepSeek 与 Node-only code适合 Node runtime，但仍需用真实 function bundle 验证 ESM resolution。

结论：**需要薄 adapter layer + 可独立构建的 server package 边界；不是零改动直接 import 的承诺。**

### 7.5 B5：`$lib/server` 安全边界

root `/api` Function 不拥有 SvelteKit 对 `$lib/server` 的 compile-time client-import protection。应通过以下工程约束恢复等价保障：

- 把可复用 runtime/data code 放入明确的 server-only internal package/module tree；
- 为 native Function 使用独立 tsconfig/build check；
- lint/import-graph test 禁止 browser routes/components 导入该边界；
- secrets 只在 Function 入口/服务端模块读取；
- 保留浏览器 bundle scan，确保 provider key 与 generated server artifact 未进入 client chunks。

这属于 Route B 的维护成本，但不是架构 blocker。

### 7.6 B6：Local development

`pnpm dev` 当前只启动 SvelteKit Vite dev server，不会自动执行项目根 `api/agent.ts`。采用 B 后有三种选择：

1. 使用官方推荐的 `vercel dev` 同时模拟静态/Framework 与 platform Functions；
2. 在 Vite dev 中保留一个仅开发用的 SvelteKit endpoint/proxy，生产由 root Function 承担；
3. 单独启动 Function dev runner，再由 Vite proxy `/api/agent`。

最少平台偏差的 acceptance 环境是 `vercel dev`。如果产品要求 `pnpm dev` 单命令，则需把它改为编排 Vite + Function，或维护 dev-only proxy。CLI/Inspector 可以继续调用共享 runtime，不应复制业务逻辑。

### 7.7 B7：Data packaging 仍未解决

Route B 只解决 route-count，不会自动解决 Agent generated server data 的部署打包。Function 仍需：

- 可追踪的 Agent-only artifact；
- 对动态 `fs` 路径使用明确 bundling/includeFiles 配置或改成静态可追踪 import；
- 验证压缩与解压后的 Function size不超过 Vercel限制；
- 防止完整 upstream repository/TextMap 被打包；
- 用 `dataRevision`/`agentVersion` 校验回答与网页数据版本。

Vercel [Advanced Function Configuration](https://vercel.com/docs/functions/configuring-functions/advanced-configuration) 可用于 runtime、duration 与文件 inclusion 等配置，但最终 bundle 仍需实测。上一轮约 0.96 MiB 的 probe 不能代表真实 Agent data bundle。

### 7.8 B8：Build/deploy pipeline impact

若 Route B 通过实验，未来变更应是有意替代部署层，而不是粗暴 reset UI-1.5A：

- `svelte.config.js` 恢复 adapter-static 输出 `build/`；
- `deploy:build` 的数据、资源、校验 orchestration 保留；
- verifier 改为同时验证 `build/` 静态闭包与 native Function source/build contract；
- `.vercel/output` 专用 verifier 与 probe 的价值需要逐项迁移或移除；
- Preview workflow 继续 `vercel deploy`，但 Framework/Output contract 改回 generic static + native Function；
- 先在 Preview 证明 clean URLs、Function、secrets、data artifact 和 route count，再考虑 Production。

预计 Dashboard 最终配置见第 13 节。

### 7.9 Future Experiment B（推荐下一步，不在本轮实施）

1. 从当前 commit 创建临时实验分支，不动 Production。
2. 恢复 adapter-static，继续生成完整 2,152 页面到 `build/`。
3. 新增最小 root `api/_deployment-probe.ts`，先只返回版本 JSON；随后增加一个只 import runtime、不读取大数据的 compile probe。
4. 使用 Framework Preset `Other`、Build Command `pnpm deploy:build`、Output Directory `build` 做 `vercel build`。
5. 检查产物与 route metadata，目标为个位数到低双位数，硬门槛 `< 100`。
6. 用 `vercel dev` 测试 `/`、中文/英文 detail、search、endgame、assets、JSON、`__data.json`、404 与 API。
7. Preview 验证 `/foo`、`/foo/`、`/foo.html`、canonical、sitemap、client navigation；记录最终平台 route count。
8. 把最小 probe 换为 thin Agent handler，验证 runtime ESM import、env、streaming/timeout 与 data inclusion；检查 Function bundle size。

只有第 5–8 步全部通过，才实施正式 Route B migration。

## 8. Route C — Separate Agent Backend Project

### 8.1 Deployment 与版本耦合

拆项目后 frontend deployment 与 backend data artifact 不再天然同一 commit。至少需要：

- 在两个 artifact 中嵌入相同 `upstream.lock.json` digest / `dataRevision` / `agentVersion`；
- backend response 暴露版本，frontend 在初始化或诊断时检测 mismatch；
- cache key 包含 data revision，不能让新网页命中旧 backend answer；
- deployment pipeline 实施“先 backend、验证、再 frontend”或版本化 backend URL；
- rollback 时成对选择兼容版本。

固定 staging backend 会让 Preview UI 测试到不同数据；每个 frontend Preview 配对应 backend Preview 则需要自动发现 URL、secret 与清理机制。

### 8.2 Same-origin 与 CORS

独立 `agent.hsrarchive.cc`：需要 CORS allowlist、Origin/CSRF policy、cookie SameSite/Domain、BotID 与 visitor quota identity 在跨域情况下的定义，并单独配置 Protection。

前端 project 用 `/api/agent` rewrite 到 backend：浏览器保持 same-origin，CORS 更简单，但每个环境需要正确 backend target；Preview URL 是动态的，容易指向错误版本。该 rewrite 本身只需少量 route，不会接近 2,048，但多了一层失败与观测链路。

### 8.3 Preview 与 secrets

两个 project 意味着两组 Production/Preview env scopes、Protection、日志、部署权限和 retention。开发分支需要 either 固定共享 staging backend（存在版本漂移）或自动部署/关联 backend Preview（增加 CI/CD 编排）。DeepSeek key、quota storage、BotID 与 abuse controls 也要决定由哪一侧拥有。

### 8.4 何时 C 才值得成为首选

只有出现至少一个经实验确认的 blocker 才应升级到 C：

- Route B 无法在同一 deployment 同时保留 clean static URLs 与 native Function；
- runtime/data bundle 超过 Function size、build tracing 或生命周期约束，而独立 backend 可采用更合适的运行形态；
- backend 需要独立扩缩容、区域、安全边界或发布频率；
- 同项目 local dev/observability 无法达到可维护水平；
- 多个 frontend 将共享同一 Agent API，使独立 versioned service 的收益超过协调成本。

目前这些都未被证明，因此 C 不是 MVP 首选。

## 9. Other Rejected Alternatives

### 9.1 大量页面改 SSR/ISR

当前 2,151 个非根静态页各花 2 routes。按本次 9 条 residual 粗算，要低于 2,048，最多保留约 1,017 个 prerender pages，总计至少要把 **1,135 个页面**动态化。

仅将 628 个 enemy canonical routes 的双 locale detail（1,256 pages）动态化，会剩约 896 个静态页面，估算：

```text
2 × (896 - 1) + 6 local fixed + 9 residual ≈ 1,805 routes
```

虽然勉强过线，但只剩约 243 条增长空间，并把 1,256 个高价值数据库页面改为 Function/CDN runtime，增加 invocation、cold start、cache invalidation、可用性与 SEO 风险。它仍没有解决 adapter 的 O(page count) 输出模型，因此不优于 A/B。

### 9.2 删除英文或 Enemy pages

不可接受。英文 locale 与完整数据库 detail 是产品能力，不是冗余数据；删内容只是在绕开错误的 deployment representation。

### 9.3 Pro、Enterprise、Bulk Redirects

- Pro 同样是 2,048，无效。
- Enterprise custom quota 技术上可缓解，但不应成为默认架构决策。
- Bulk Redirects 不适用于这些 framework-internal clean-URL rules。

## 10. Comparison Matrix

| Dimension | A adapter-vercel optimized | B adapter-static + native Function | C separate backend |
|---|---|---|---|
| Route limit | 预计约 17；需 Preview 证明 | 预计个位数到低双位数；不随页面数线性增长 | 两项目各自很低 |
| Static preservation | 完整保留 | 完整保留；沿用历史 static 模式 | 前端完整保留 |
| Public URL compatibility | 可保留，但 regex/顺序必须证明 | 可保留；cleanUrls 行为必须明确配置/验证 | 可保留，API hostname/rewrite 改变 |
| SvelteKit integration | 最强，Function 是 `+server.ts` | 静态站保留；API 脱离 SvelteKit adapter | frontend 保留，backend 独立 |
| Agent runtime reuse | 直接 | Conditional；薄 adapter + bundle proof | Conditional；可自由组织 backend package |
| `$lib/server` boundary | 原生 compile-time 保护 | 无等价原生保护，需 package/lint/build guard | 后端项目物理边界最强 |
| Local dev | `pnpm dev` 最自然 | 需 `vercel dev`、proxy 或双进程编排 | 两服务/远端 staging，最复杂 |
| Data packaging | 仍需解决 | 仍需解决 | 仍需解决，但生命周期独立 |
| Preview workflow | 单 project；post-process 后验证 | 单 project；需验证 generic build + API | 两 Preview 配对或共享 staging |
| Secrets | 单 project | 单 project | 两 project scope/rotation |
| Rate/quota future | 同源容易 | 同源容易 | 跨域或 rewrite 后需统一身份 |
| Version coupling | 同 deployment | 同 deployment | 必须显式 dataRevision 协调 |
| Operational complexity | 中：自维护 adapter output | 中低：官方 primitives，但要补 dev/build 边界 | 高：双项目发布与观测 |
| Migration risk | 中高：routing contract 脆弱 | 中：回到已验证 static 基础并新增 Function | 高：平台与流程拆分 |
| Maintainability | 对 adapter 版本敏感 | 最佳长期候选 | 只有独立生命周期有真实收益时合理 |

## 11. Recommended Architecture

**Preferred architecture: B — adapter-static + same-project native Vercel Function.**

理由：

1. route explosion 不是页面数量本身造成，而是 adapter-vercel 对每个页面生成两条 routing metadata；B 从根源移除这条 O(N) 路径。
2. 项目旧 Production 已证明相同静态页面规模能在 `Other + build` 下成功运行。
3. 静态站与 root Functions 共存是 Vercel 的正式能力，不需要依赖未公开的 adapter internals。
4. 与 C 相比仍保持同 project、same-origin、同 deployment version 与一套 secrets/Preview。
5. A 的预计 route budget 很优秀，但维护自定义 Build Output post-processor 会把 adapter 的内部生成顺序变成项目契约；长期风险高于 B。

该推荐是“先做 proof，再迁移”，不是立即回退。若 B 的真实实验在 clean URLs、runtime bundling 或 Agent data inclusion 上出现不可接受 blocker，再回看 A；只有 A、B 都被实证阻断时才升级到 C。

## 12. Recommended Next Experiment

下一次只做 **Experiment B**，目标不是完成 Agent，而是一次性回答四个架构 gate：

```text
Gate 1  2,152 static pages + 1 native Function 的最终 route count < 100
Gate 2  现有 clean URLs、slash canonical、__data.json、404 全部等价
Gate 3  native Function 能 bundle/import 当前 runtime 的最小切片
Gate 4  Agent-only data 能显式进入 bundle，且 size 有充足余量
```

预期 route count：个位数到低双位数；acceptance ceiling 设为 100，给未来 headers/rewrites/Functions 留出远大于需求的空间。若结果仍接近 2,048，则停止迁移并取得构建产物逐项分析，而不是继续部署。

## 13. Dashboard Implications

当前 Dashboard 为 UI-1.5A 临时状态：SvelteKit preset、`pnpm deploy:build`、Output Directory override off。本轮不修改。

若 Route B 最终通过，目标配置应为：

```text
Framework Preset: Other
Build Command: pnpm deploy:build
Output Directory: build
Node.js: 22（与 CI/engines 对齐）
```

clean URL 与 trailing-slash policy 应尽量进入 version-controlled `vercel.json`，但具体字段只在 Experiment B 对三种 URL 行为验证后确定。不要依赖无法审计的历史 Dashboard 隐式设置。Production 仍保持当前正常的旧 deployment，直到 Preview 全部 gate 通过；不得 promote 失败 Preview。

若最终选择 A，则 Dashboard 继续使用 SvelteKit preset、`pnpm deploy:build`、Output Directory override off，post-processor 必须成为 versioned build step并被 verifier 强制检查。

## 14. Risks and Required Platform Confirmation

### 14.1 主要风险

- **计数差额：** 4,317 中的 7/9 条没有内部明细；虽然不影响主体归因，但会影响完全 forensic accounting。
- **A 的 route semantics：** missing destination 是否继续 fallback、override 与 filesystem 顺序需要 Preview 证明。
- **B 的 clean URLs：** 历史 Production 行为已证实，但具体配置来源未知。
- **B 的 runtime bundling：** 动态文件读取、ESM、TypeScript aliases 和 server-only boundary 必须实测。
- **Data bundle：** A/B/C 都不能免除 250 MB 等 Function artifact 限制与最小数据打包要求。
- **增长：** 任何最终方案都应把 route budget 压到低双位数，而不是停在 2,047。

### 14.2 可直接提交给 Vercel Support 的问题

1. For deployment `7f5f89b`, can Vercel provide the exact 4,317 route records grouped by Build Output `config.routes`, framework/project injected routes, and platform normalization routes?
2. Does each Build Output API `overrides` entry count toward “Routes created per Deployment”? If not, are any override-derived internal records counted?
3. Was `VERCEL_SKEW_PROTECTION_ENABLED=1` set for the failed Preview, and did its two adapter-generated Set-Cookie routes count toward 4,317?
4. Which seven or nine routes were added after the submitted Build Output `config.json`, and which project setting generated each one?
5. For a generic static Output Directory with `cleanUrls: true`, is route quota consumption constant or proportional to the number of `.html` files?
6. When a Build Output regex rewrite destination does not exist, does routing continue after `handle: filesystem`, or is the rewritten request terminal/404?

## 15. Yes / No / Conditional Answers

| Question | Answer | Basis |
|---|---|---|
| Q1. 4317 是否可以完全由当前 output artifact 解释？ | **No** | 本地 artifact 精确为 4,308 routes；剩余 9，或 Skew 开启时 2 + 7，缺少远端明细。 |
| Q2. 2152 prerender pages 是否是 route explosion 的主体？ | **Yes** | 2,151 个非根页面 × 2 = 4,302，占本地 99.86%、失败总数 99.65%。 |
| Q3. adapter-vercel 是否存在官方配置可直接消除这个问题？ | **No** | 6.3.4 options 无 clean URL aggregation、override suppression 或 static route compression。 |
| Q4. 改 trailingSlash 是否能从根本上解决？ | **No** | adapter 仍为每个非根页面生成 canonical/counterpart 两条规则，只改变方向与物理 layout。 |
| Q5. 不改变公开 URL 的前提下，是否能压缩到 <2048？ | **Conditional** | A 的 allowlisted regex 预计可做到，但 route fallback/order 必须 Preview 验证；B 可从生成模型上规避。 |
| Q6. 是否可以压缩到远低于 2048，从而留有增长空间？ | **Conditional** | A 预计约 17；B 预计个位数到低双位数，均需真实 Preview 计数。 |
| Q7. post-process Build Output 是否属于可维护方案？ | **Conditional** | 平台 API 支持 regex，但 adapter 没有 post-process contract；分类为 possible but fragile，不是首选。 |
| Q8. adapter-static + root /api Function 是否被 Vercel正式支持？ | **Yes** | 自定义 static Output Directory 与 root `api/**` Functions 都是官方 deployment primitives。 |
| Q9. Route B 是否实际避开 2048 route limit？ | **Yes** | 它不生成 adapter-vercel 的 4,302 条逐页规则；旧 Production 已成功部署同规模静态站。混合形态精确数字仍需 gate。 |
| Q10. Route B 能否可靠复用当前 Agent runtime？ | **Conditional** | runtime 大多是 npm/相对 import，但要补薄 adapter、server boundary、ESM 与 data inclusion proof。 |
| Q11. Route B 是否需要 vercel dev 才能本地开发 API？ | **Yes** | 默认 `pnpm dev`/Vite 不运行 root `/api`; 除非另建 dev proxy 或双进程 runner。 |
| Q12. Route C 是否目前有必要？ | **No** | B 尚未出现实证 blocker，拆项目会先引入 version/Preview/CORS/secret 协调成本。 |
| Q13. 是否有必要减少 prerender 页面？ | **No** | 需动态化至少约 1,135 页才过线，且只是缓解 O(N) 输出，破坏静态目标。 |
| Q14. 是否应该回退 UI-1.5A migration？ | **Conditional** | 本轮不回退；若 B proof 通过，应以新 migration 有意替代 adapter 部署层并保留可复用工作。 |
| Q15. 下一步应该做哪一个最小实验？ | **Conditional** | 执行 Experiment B：完整 static + 一个 native probe，`vercel build`/Preview 验 route count、clean URL、runtime import、data bundle。 |

## 16. Official References

- Vercel: [Limits](https://vercel.com/docs/limits)
- Vercel: [Build Output API](https://vercel.com/docs/build-output-api)
- Vercel: [Build Output API configuration](https://vercel.com/docs/build-output-api/configuration)
- Vercel: [Build Output API features](https://vercel.com/docs/build-output-api/features)
- Vercel: [Build Output API primitives](https://vercel.com/docs/build-output-api/primitives)
- Vercel: [Configure a Build](https://vercel.com/docs/builds/configure-a-build)
- Vercel: [Project configuration / vercel.json](https://vercel.com/docs/project-configuration/vercel-json)
- Vercel: [Functions](https://vercel.com/docs/functions)
- Vercel: [Functions API reference](https://vercel.com/docs/functions/functions-api-reference)
- Vercel: [Advanced Function Configuration](https://vercel.com/docs/functions/configuring-functions/advanced-configuration)
- Vercel: [SvelteKit framework guide](https://vercel.com/docs/frameworks/full-stack/sveltekit)
- Vercel: [Skew Protection](https://vercel.com/docs/skew-protection)
- Vercel: [System Environment Variables](https://vercel.com/docs/environment-variables/system-environment-variables)
- SvelteKit: [adapter-vercel documentation](https://svelte.dev/docs/kit/adapter-vercel)
- SvelteKit: [adapter-vercel source](https://github.com/sveltejs/kit/blob/main/packages/adapter-vercel/index.js)
- SvelteKit: [adapter-vercel changelog](https://github.com/sveltejs/kit/blob/main/packages/adapter-vercel/CHANGELOG.md)

## 17. Final Decision

`4317` 的工程根因不是“Vercel 无法承载 2,152 个静态页面”，而是 adapter-vercel 6.3.4 将 2,151 个非根 prerender pages 展开成 4,302 条逐页 clean/slash route rules。当前 artifact 已精确解释 4,308 条；其余 7/9 条需要 Vercel 的远端 artifact 或内部明细才能命名。

在保留完整静态站、英文站和现有公开 URL 的前提下，route explosion 可以消除。A 能以聚合规则把预算降到约 17，但维护边界脆弱；B 使用官方 static + native Function primitives，预计 route 数更低且长期更清晰。故推荐先执行最小 Route B proof，成功后再用受控 migration 替代 adapter-vercel 部署层；当前 Production、Dashboard 与 migration commit 在本轮保持不变。
