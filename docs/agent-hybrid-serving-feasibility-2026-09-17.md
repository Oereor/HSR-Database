# HSR Data Agent Phase UI-1 — Hybrid SvelteKit / Vercel Serving Feasibility Audit

审计日期：2026-09-17  
审计分支：`develop`  
范围：只调查当前 checkout 与迁移可行性；本轮未切换 adapter、未新增 route、未修改部署配置或 Agent capability。

## 1. Executive Summary

**结论：单项目 SvelteKit + Vercel hybrid 可行，首选显式采用 `@sveltejs/adapter-vercel`。** 现有页面可以继续在 build time prerender，并由 Vercel 作为 static output/CDN 内容提供；只有未来的 `/api/agent` 保留为非 prerendered Node Function。`/agent` 和 `/en/agent` 本身不需要 SSR，仍应是静态页面 shell，在浏览器交互时调用 `/api/agent`。

当前不存在已证实的平台级 hard blocker，但**现有 Agent runtime 不能不经改造直接部署**：`src/lib/server/generated.ts` 使用 `node:fs/promises` 和 `process.cwd()` 相对路径读取 `src/lib/generated/**`、`static/generated/**`。这些源文件不会因为本地可读就自动成为 Vercel Function 的稳定文件系统契约；`adapter-vercel` 文档也明确提醒不要假设项目文件会随 Function 被复制。迁移前必须建立显式的 server data packaging/read boundary，并在真实 Preview 中检查 Function trace、uncompressed bundle、cold start、内存和数据覆盖。

三个必须先解决的事项是：

1. 为 Function 明确打包并读取 Agent 所需的生成数据；
2. 把硬编码 `build/` 的 clean/post-build verification 迁移到 `.vercel/output` 语义，同时保持现有静态资源闭包验证；
3. 在 Vercel Dashboard/Preview 确认项目 plan、Fluid Compute、Node major、Function duration、Protection 和 build/output settings。Agent 的 180 秒总 ceiling 只有在 Fluid Compute 或允许至少 180 秒的非 Fluid paid plan 配置下才兼容。

因此建议结论是 **Conditional Go**：可以进入一个隔离的 adapter/data-packaging Preview 实验；在 bundle、filesystem 与 duration 三个 gate 通过前，不应合入真实 `/api/agent`，也不应宣称 UI-2 可部署生产。

## 2. Current Deployment Architecture

### 2.1 当前实际版本和 adapter

- `svelte.config.js` 直接使用 `@sveltejs/adapter-static`；lockfile 当前解析为 SvelteKit `2.70.3`、Svelte `5.57.0`、Vite `7.2.4`、adapter-static `3.0.10`。
- adapter 只显式设置 `fallback: '404.html'`。未设置 `pages`、`assets`、`precompress`、`strict`，所以沿用 adapter-static 默认值：`pages = 'build'`、`assets = pages`、`precompress = false`、`strict = true`。
- `kit.prerender.entries` 为 `['*', ...publicEntries]`；`publicEntries` 由生成 manifest 的 locale 与 canonical route inventory 做笛卡尔展开。
- 当前 build 最终是纯静态 `build/`，没有可执行 Function。

### 2.2 `deploy:build` 的真实调用链

```text
Vercel / CI build command（仓库文档约定 pnpm deploy:build）
  -> scripts/deployment/build.ts
  -> validate upstream.lock.json
  -> 设置 HSR_DEPLOYMENT_BUILD / HSR_BUILD_VERSION / pinned commit env
  -> Production: messages:compile
     Preview/local: check:scripts + messages 检查
  -> 按 lock 中 SHA 准备 .upstream/TurnBasedGameData sparse checkout
  -> 按 lock 中 SHA 准备 .upstream/StarRailRes sparse checkout
  -> Preview/local 额外执行 data:search-names:check
  -> data:ensure
  -> data:validate
  -> enemy assets:ensure
  -> general assets:ensure + assets:verify
  -> svelte-kit sync
  -> vite build
  -> adapter-static 写 build/
  -> deploy:verify 扫描 build/ 并验证 generated asset reference closure
  -> Vercel 静态部署
```

`upstream.lock.json` 当前固定 TurnBasedGameData 与 StarRailRes commit。两个 sibling repository 或 `.upstream` checkout 都是 build input，不是浏览器/生产 runtime dependency。TurnBasedGameData 只 sparse-fetch 生成数据需要的 Excel/TextMap/monster 目录；StarRailRes 先获取 index，再按需要准备资产目录。此 deterministic、pinned、build-time 模型应保持不变，不能因引入 Function 改成请求时抓 upstream。

### 2.3 Production、Preview 与本地差异

`scripts/deployment/build.ts` 只有在 `VERCEL_ENV === 'production'` 时走 `production-ci-backed`；其他值（包括本地未设置）都走较完整的 `preview-full`。Production 依赖 protected-main CI 已完成 script/type/name snapshot checks，构建时主要重新编译 messages；Preview/local 重新执行这些检查。两者都会准备 pinned upstream、生成/校验数据与资产、运行 Vite build 和 post-build verification。

仓库现状与任务背景中的“`develop -> 自动 Preview`”并不完全一致：

- `vercel.json` 存在，但只配置 Git deployment policy：`main` enabled、`**` disabled；它没有 build、output、headers、rewrites、regions 或 functions 配置。
- `main` 可由 Vercel Git integration 自动 Production；`develop` push 按当前 `vercel.json` 不会自动部署。
- Preview 当前由 `.github/workflows/vercel-preview.yml` 的手动 workflow 调用 `vercel deploy --target=preview`。
- 仓库 README 声明 Vercel Build Command 使用 `pnpm deploy:build`，但 Dashboard 中实际 Build Command、Output Directory、Framework Preset 无法从 checkout 证明，迁移前必须现场核对。

### 2.4 本轮实测

- `pnpm build`：通过；702 个 SSR modules、689 个 client modules，adapter-static 正常写出 `build/`。
- `pnpm deploy:build`：在本机 Node `v26.5.0` + pnpm `11.9.0` 下，脚本把原生 `npm_execpath` 交给 `node` 执行而失败；这是本地 launcher/version 组合问题，不是数据或 Svelte build 失败。
- 使用同一 orchestration entry 的 `node --import tsx scripts/deployment/build.ts`：`preview-full` 全链路通过，总计约 63.4 秒；`deploy:verify` 扫描 4,379 个文本文件并索引 9,313 个 paths。
- 该次产物：7,126 files、394,715,881 logical bytes；其中 2,153 HTML、2,152 `__data.json`。这只是当前 static baseline，不是 adapter-vercel 后的大小预测。

### 2.5 adapter-static 特定耦合

“Vite/SvelteKit build 能通过”不等于“deployment pipeline 不变”。至少以下代码直接依赖 static output：

- `scripts/deployment/verify-build.ts` 默认扫描 `<siteRoot>/build`；切换 adapter 后会失去或错误验证最终 deployment artifact。
- `scripts/deployment/clean.ts` allowlist 含 `build`，不含 `.vercel`；迁移后 clean contract 需要重新定义并继续保持防误删保护。
- `tests/unit/deployment-clean.test.ts` 明确断言 `build` allowlist 与 symlink/tracked-file guard；需要同步扩展。
- 多份 deployment 文档和部分历史测试说明把 `build/` 当最终发布单元。
- 当前 `fallback: '404.html'` 是 adapter-static 行为；adapter-vercel 不接受这个 static fallback option。

现有 CI 的 build/test orchestration 可大体保留，但 post-build verification 与其单元测试不能原样保留。

## 3. Current Prerender Model

### 3.1 全局规则

根 `src/routes/+layout.server.ts` 导出 `prerender = true`，所以现有页面默认静态化。`svelte.config.js` 从 `src/lib/generated/manifest.json` 取得两个 public locales（`zh-CN`、`en`）和 1,076 个 canonical `routePaths`，经 locale mapper 得到 2,152 条显式 public entries，再与 `'*'` 一同交给 prerenderer。

当前 manifest 的 catalog route inventory 是：

| Domain | IDs |
| --- | ---: |
| Characters | 97 |
| Light Cones | 169 |
| Relics | 60 |
| Enemies | 628 |

`scripts/data/routes.ts` 生成 canonical、locale-neutral 的 route paths。中文使用无前缀路径，英语使用 `/en` 前缀；`hooks.ts` 的 reroute 将 localized URL 映射到同一 route tree，server hook 设置 locale 与 HTML `lang`。

### 3.2 显式 prerender 与动态参数枚举

以下 route 当前显式 `prerender = true` 或继承根设置，并在 build time 完成：

- `/` 与 `/en`
- catalog list/detail：`/characters/**`、`/light-cones/**`、`/relics/**`、`/enemies/**` 及 `/en/**`
- `/endgame`、四种 mode（`moc`、`pf`、`as`、`aa`）及各 group detail；group entries 由生成数据枚举
- `/search` 与 `/en/search`
- `/robots.txt`、`/sitemap.xml`
- `/generated/[locale]/endgame-occurrences/[targetId]`：虽然源码是 `+server.ts`，实际通过 `entries` 枚举并输出静态 JSON shard

`/agent`、`/en/agent` 和 `/api/agent` 当前都不存在，也尚未进入 manifest/route inventory。

### 3.3 sitemap、trailing slash、error/fallback

- sitemap 从当前生成 route inventory 和 locale alternate 生成，属于 prerendered endpoint；未来页面 route 加入 inventory 后应包含 `/agent` 与 `/en/agent`，API 不应进入 sitemap。
- 项目没有覆写 `trailingSlash`，使用 SvelteKit 默认 `never`；当前静态输出形态是例如 `characters.html`，平台负责规范化无尾斜杠 URL。
- `src/routes/+error.svelte` 提供已匹配应用错误 UI；adapter-static 另生成单一 `404.html` fallback，无法按请求实时选择 locale。
- 迁移为 adapter-vercel 后，未匹配 URL 将由 SvelteKit/Vercel catch-all 返回错误，而不是复用 adapter-static 的 fallback 文件。语义可以保持 404，但响应 body、locale、cache/header 与尾斜杠 redirect 都必须在 Preview 做回归，不能假定字节级一致。

### 3.4 Root prerender 与未来 API

[SvelteKit page options](https://svelte.dev/docs/kit/page-options) 的当前规则是：child page 可以覆盖 ancestor layout 的 option；`prerender = true` 的 route 会从 dynamic SSR manifest 排除。`+server.ts` 可以自行导出 `prerender`，但它**不受 layout option 直接影响**；如果一个 prerendered page 在 build 时 fetch 该 endpoint，endpoint 可继承该 page 的 prerenderability。

因此未来 `/api/agent/+server.ts` 的最小安全规则是：

- 显式 `export const prerender = false`，避免其行为取决于 crawler 或未来 page fetch graph；
- 不放进 `kit.prerender.entries`，也不实现 `entries`；
- `/agent` 保持 `prerender = true`，只在浏览器用户操作后 fetch API，不能在 prerender load 中调用 Agent；
- `/en/agent` 同样静态化，并显示英文占位与显式中文入口，不做 redirect。

这不会让 build crawler 尝试执行 POST Agent，也不会迫使页面 SSR。

## 4. Adapter Migration Analysis

| Adapter | 当前目标的适配度 | 关键语义 | 结论 |
| --- | --- | --- | --- |
| `adapter-static` | 不足 | 输出静态目录；没有运行未来 POST handler 的 runtime | 保留它无法实现同一 SvelteKit deployment 内的 `/api/agent` |
| `adapter-auto` | 能检测 Vercel | build 时选择/安装平台 adapter，但不利于锁定 adapter 版本和显式控制 Vercel route config | 不推荐生产长期使用 |
| `adapter-vercel` | 最合适 | 输出 Vercel Build Output API：prerendered/client assets 进入 `.vercel/output/static`，未 prerendered routes 进入 Function | 推荐显式安装并固定版本 |

SvelteKit 官方明确写明部署到 Vercel 应使用 [`adapter-vercel`](https://svelte.dev/docs/kit/adapter-vercel)；[`adapter-auto`](https://svelte.dev/docs/kit/adapter-auto) 虽能自动选择平台 adapter，但官方也建议在目标平台确定后安装特定 adapter，以改善依赖锁定、CI 安装与配置能力。Vercel 自己的 [SvelteKit 指南](https://vercel.com/docs/frameworks/full-stack/sveltekit) 同样建议显式安装，以获得版本稳定性和 Vercel-specific options。

### 4.1 Mixed output 的语义

采用 adapter-vercel 后：

```text
SvelteKit build
  -> prerendered pages/endpoints + client/static assets
       -> .vercel/output/static
       -> Vercel static/CDN serving
  -> non-prerendered route manifest
       -> one or more Node Functions
       -> /api/agent request-time execution
```

prerendered routes被排除于 dynamic SSR manifest，因此不会为了 `/api/agent` 自动进入 Function，也不应增加 Agent cold-start code path。未 prerendered routes 默认可合并在一个 Function；当前若只有 `/api/agent`，该 Function 实际上就是 Agent server graph。`split: true` 是以后出现更多动态 route、需要隔离 bundle/config 时的优化工具，不是首个迁移必须项。

### 4.2 URL、headers 与缓存

- 保持相同 route tree、locale mapping 和默认 `trailingSlash = 'never'` 时，canonical URLs 理论上不变；adapter 会为静态页面写 routing overrides/redirects，但必须对现有 URL 清单逐条 Preview smoke。
- `_app/immutable/**` 由 adapter/Vercel 作为 immutable assets 处理。项目自己的 `static/generated*` URL 没有内容 hash，也没有仓库级 Cache-Control 定义，不能擅自提升为永久 immutable。
- 当前没有通用 security headers、rewrites 或自定义 redirects。robots/sitemap 只显式设置 content type。
- Vercel static files 自动走 CDN；Function 响应默认不是可长期 CDN 缓存的静态资产。未来 Agent endpoint 仍应显式表达 private/no-store 意图，但 exact cache contract 属于 UI-2。

切换 adapter 会改变 output composition 与 404 path，不应承诺 header 与 caching 完全无变化；应记录当前 Production baseline，再在 Preview 比较 `status`、`location`、`cache-control`、`content-type`、`x-vercel-cache` 和 locale error body。

## 5. Proposed Hybrid Route Classification

| Classification | Routes / assets | Serving model |
| --- | --- | --- |
| Static/prerendered（现有） | `/`, catalog list/details, `/endgame/**`, `/search`, `/robots.txt`, `/sitemap.xml`, localized `/en/**`, generated occurrence JSON shards | Build time -> `.vercel/output/static` -> CDN/static |
| Static/prerendered（未来） | `/agent`, `/en/agent` | 静态 HTML shell；浏览器交互时调用 API |
| Dynamic/server（未来） | `POST /api/agent` | 唯一有意设计的动态业务 route；Node Vercel Function，显式 `prerender = false` |
| Build-only | pinned upstream checkout、generator/audit scripts、asset preparation | Vercel build container；不进入 request runtime |
| Special/regression-sensitive | unknown routes、404、trailing-slash redirects、Deployment Protection | Preview 中验证平台 routing 与保护层 |

普通页面、图片、navigation icons、`generated-assets` 与 `generated-enemy-assets` 不应经过 Agent Function。

“只有 `/api/agent` 使用 Function”指唯一的动态业务 route。adapter 仍会生成框架 routing/catch-all 以处理未匹配 URL 和动态错误响应；静态 routing override 会让已 prerender 的已知 URL 直接命中 static output。Preview 验收应分别证明已知页面不触发 Function，以及未知路径仍返回正确 404。

## 6. Agent Runtime Deployment Compatibility

### 6.1 推荐 server-only 边界

当前公开 runtime entry point 是 `src/lib/server/agent/runtime.ts` 的 `runDataAgent`。未来 endpoint 应只从 `$lib/server/agent/runtime`（或位于 `$lib/server` 的一个很薄 application wrapper）调用它。`src/lib/agent/contracts.ts` 可继续放浏览器安全的共享类型；DeepSeek SDK、AI SDK、model factory、tools、data source 与 secret access 必须留在 `$lib/server/**`。

[SvelteKit server-only modules](https://svelte.dev/docs/kit/server-only-modules) 会阻止 client graph import `$lib/server/**`、`*.server.*` 与 private env modules。当前检索没有发现 client-visible route/component 导入 `$lib/server/agent`。未来 endpoint 本身位于 `+server.ts`，再沿 `$lib/server` 边界导入 runtime，可以让 accidental client bundling 在 build time 失败，而不是靠约定。

### 6.2 Secret 与环境变量

当前 CLI 通过：

```text
node --env-file-if-exists=.env.local --import tsx ...
```

加载 `.env.local`；`src/lib/server/agent/model.ts` 从 `process.env.DEEPSEEK_API_KEY` 读取 key，并支持可选 base URL/model。`.env*` 默认被忽略，`.env.example` 当前未列 DeepSeek 变量。

未来 route 最清晰的 SvelteKit boundary 是在 server-only module 中使用 [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private)，将值显式传给现有 runtime 的 environment input；这会在请求/runtime 读取环境值，也能由 Vite dev 加载本地 `.env.local`。`$env/static/private` 也是 server-only，但在 build 时静态替换，更适合真正 build-time constant；对 Preview/Production 分离的 provider secret，dynamic/private 更直观。两者都不得从 client module re-export。

[Vercel environment variables](https://vercel.com/docs/environment-variables) 支持 Production、Preview、Development scope，并支持对 Preview branch 做覆盖。因此同名 `DEEPSEEK_API_KEY` 可以在 Preview 与 Production 配不同值；更低 quota 是 DeepSeek/provider 侧 key/account policy，Vercel 只负责注入不同 secret。本轮不创建或迁移任何 key。

### 6.3 Agent 数据的真实读取路径

当前 server data layer 并不在 runtime 访问 sibling repositories：

- Endgame：`src/lib/generated/views/zh-CN/endgame/{moc,pf,as,aa}.json`
- Enemy details：`src/lib/generated/views/zh-CN/details/enemies/*.json`
- Search：`static/generated/zh-CN/search.json`
- Inventory/version：`src/lib/generated/manifest.json`

这些都是 pinned upstream 在 build time 生成的 deployment artifacts。问题在于读取方式：`src/lib/server/generated.ts` 使用 `node:fs/promises`、`path.resolve('src', 'lib', 'generated')`、`path.resolve('static', 'generated')` 和动态文件名。Node Function 本身支持 `fs`，但 Vercel Function 的可读部署文件只限于实际被 file tracing/adapter 打包的内容；`process.cwd()` 的源码布局也不是稳定公开契约。[adapter-vercel 的 filesystem troubleshooting](https://svelte.dev/docs/kit/adapter-vercel#troubleshooting-accessing-the-file-system) 明确指出 serverless functions 不会自动复制项目文件，并建议对已打包 assets 使用 `$app/server.read`。

所以结论是：

- 没有 sibling checkout runtime blocker；
- 有一个**当前实现级 filesystem/path blocker**；
- 不能靠把整个 `src/lib/generated` 或 `static` 无选择塞进 Function 解决；
- 迁移实验应生成一个明确的 Agent-only artifact set，并使用静态可追踪的 asset/import map 或 `$app/server.read` 读取；若继续使用 `fs`，必须以 adapter 实际 traced output 为契约并做完整数据覆盖测试。

当前 adapter-vercel route config 提供 runtime、region、duration、memory、split、ISR 等选项，但没有一个可依赖的 adapter-level `includeFiles` 选项。不要在未验证的配置字段上设计方案。

### 6.4 数据量、index 初始化与复用

静态测量的 Agent 直接数据候选为：

| Data | Files/bytes observed |
| --- | ---: |
| 4 个中文 Endgame JSON + 628 个中文 Enemy details | 632 files / 172,008,549 bytes |
| 中文 Search JSON | 1,991,510 bytes |
| Generated manifest | 351,492 bytes |
| 合计 | 174,351,551 bytes（约 166.3 MiB） |

这不是最终 Function bundle 大小：file tracing、压缩、生成策略、代码与依赖、是否误带其他 locale/domain 都会改变结果。整个 `src/lib/generated` 的 allocated size 约 366 MiB，不能整体打包。AI SDK、DeepSeek provider、FlexSearch、Zod 及其 transitives 还会增加 Function 大小。

Search JSON 在 build time 生成，但当前 `EntitySearchService` 会在每个 cold process 首次使用时构建内存 FlexSearch index；`serviceCache`、manifest/search/endgame/enemy caches 都是 module scope，所以 warm instance 可复用。Fluid Compute 允许一个实例处理多个 invocation，module state 可能复用甚至面对并发，但不能假设持久、全局唯一或跨实例共享。当前 Promise/map cache 适合避免同一 process 的重复加载；仍需实测 cold/warm latency 与 peak memory，不在本轮优化。

### 6.5 Node/runtime compatibility

- `package.json`: Node `>=22`、pnpm `>=10`、packageManager `pnpm@11.9.0`。
- GitHub Actions：Node 22、pnpm 11.9.0。
- 本地本轮：Node 26.5.0、pnpm 11.9.0。
- 没有 `.nvmrc` 或 `.node-version`。
- AI SDK 7 / `@ai-sdk/deepseek` 当前 package metadata 要求 Node >=22；FlexSearch/Zod 无已发现的更高障碍。

Vercel 当前 [supported Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) 是 24.x（默认）、22.x、20.x。`engines.node = ">=22"` 会匹配 Vercel 最新可用 major，当前即 24.x，而不是强制 22；这造成 CI 22、本地 26、Vercel 可能 24 的三方漂移。22/24 对当前依赖原则上兼容，但迁移前应在 Dashboard 与 Preview log 证实版本，并在后续决定固定 `22.x` 还是统一升级 CI 到 24；本轮不改版本。

Node runtime 是首选，Edge 不适合当前 `fs`、`path`、Node crypto 和依赖边界。CLI、Inspector、eval、profile 都直接消费同一 Node runtime，不依赖 Svelte adapter；adapter migration 不应修改它们，也不应让 CLI 经 HTTP 调自己的网站。

## 7. Function Limits

### 7.1 Bundle size

[Vercel Functions limits](https://vercel.com/docs/functions/limitations) 的标准 Node Function 上限仍是 **250 MB uncompressed**，包含代码、依赖与被打包文件；请求与响应 body 上限均为 4.5 MB。Vercel 在 2026-06 推出的 [Large Functions](https://vercel.com/changelog/vercel-functions-can-now-be-up-to-5-gb-in-package-size) 可在 Fluid Compute 上支持最高 5 GB，但仍是 public beta，旧项目需要 opt-in，且有 Secure Compute/Static IP 等限制；它不应成为首选架构的默认前提。

约 166.3 MiB 原始 Agent data 已明显接近标准上限，但仍不能据此判定 pass/fail。必须在迁移实验中：

1. 用实际 `adapter-vercel` build 生成 `.vercel/output/functions/**`；
2. 逐 Function 计算 uncompressed/compressed bytes，列出 traced files；
3. 可在 Preview 设置 `VERCEL_ANALYZE_BUILD_OUTPUT=1` 获取平台分析；
4. 断言只含 Agent 所需中文 Endgame/enemy/search/manifest，不含英语、catalog UI DTO、图片、整个 `static/`、`.upstream`；
5. 在标准 250 MB path 上验证，再决定是否需要数据裁剪/专用 artifact；不要先依赖 beta 5 GB。

Prerendered website assets按 adapter 语义留在 `.vercel/output/static`，不会仅因同项目 hybrid 自动进入 Function。真正决定 Function bundle 的是 server import/file trace 和显式 packaged assets。

### 7.2 Duration、Fluid Compute 与 plan

当前 Agent contract：总 timeout 180 秒、单 step 60 秒、单 tool 30 秒、最多 8 model steps/8 tool calls。本轮不改变它们。

Vercel 当前限制如下：

| Runtime mode | Hobby | Pro | Enterprise | 180s contract |
| --- | --- | --- | --- | --- |
| Fluid Compute | default/max 300s | default 300s, max 800s | default 300s, max 800s | 兼容 |
| Existing non-Fluid | default 10s, max 60s | default 15s, max 300s | default 15s, max 900s | Hobby 不兼容；Pro/Enterprise 需配置至少 180s |

Pro/Enterprise 还有 1,800 秒 beta，但本项目无需求。项目 plan、Fluid 状态和 Dashboard duration 在 checkout 中不可见；所以当前答案只能是 Conditional。未来 route 可通过 adapter route config 设置 `maxDuration`，但在知道 plan/Fluid 前不应写死一个不可用值。Preview 与 Production 使用同一平台 runtime 模型，不过环境值、Protection 与 production-only optimizations 可能不同。

### 7.3 Runtime、region 与 memory

- adapter-vercel 生成 Vercel Node Function；是否使用 Fluid Compute 是项目/环境设置，不由“使用 adapter”自动证明。
- serverless default region 是 `iad1`；项目没有 region 配置。静态页面继续从 CDN edge 提供，不受 Function region 选择影响。
- DeepSeek API 的最佳网络路径与主要用户地域尚无实测。首轮保留默认 region，收集 Preview 外呼 latency 后再决策；不要为了推测性优化增加 config。
- Fluid 默认内存为 2 GB/1 vCPU（Hobby 固定；Pro/Enterprise 可在 Dashboard 调整到 4 GB/2 vCPU）。166 MiB 原始 JSON 加 parse/index/SDK heap 可能显著膨胀，必须记录 cold-start peak memory 与并发，而不是用文件字节代替 heap 评估。

## 8. Existing Pipeline Impact

| Area | Can remain | Required migration work / validation |
| --- | --- | --- |
| `deploy:build` orchestration | pinned fetch、messages、data/assets ensure/validate、Svelte build 顺序可保留 | post-build output 从纯 `build/` 改为 Vercel Build Output；修复本地 Node 26 + native pnpm launcher 兼容性可独立处理 |
| `upstream.lock.json` | 原样保持 | 验证 Function artifacts只来自同一次 pinned build |
| Data generation | build-time 继续 | 增加/明确 Agent-only server artifact 的序列化与完整性验证；禁止 runtime upstream fetch |
| Asset generation | 原样生成到 `static/generated*` | 确认复制到 `.vercel/output/static`；Function trace 不含视觉资产 |
| Route inventory | 现有 1,076 canonical paths 与双 locale model 保持 | 产品实现时只把 `/agent` 加入 public route inventory；`/api/agent` 不进入 sitemap/prerender entries |
| Sitemap/robots | 继续 prerender | 增加页面后检查 sitemap；API 不暴露在 sitemap |
| `deploy:verify` | exact-case/reference-closure 责任必须保留 | 改为识别 `.vercel/output/static`，并新增 Function manifest/bundle/data coverage audit |
| Clean/tests | 防误删 guard 与测试理念保留 | 明确 allowlist `.vercel/output` 而非宽泛删除 `.vercel`；更新 `deployment-clean`/build tests |
| GitHub Actions | Node 22、数据验证、build/e2e 流程大体保留 | 适配新 output，加入 hybrid route/static regression 和 Function artifact size checks；不是本轮修改 |
| Vercel Preview | 继续用手动 workflow | 当前 workflow 不应再假设只有 static output；真实调用 API、logs、Protection、env、duration |
| Vercel Production | main policy保持 | Production 只在 Preview gates 全过后迁移；先记录旧站 URL/header/storage baseline |
| Deploy Storage | static 内容仍单份放 static output | 新增 Function bundle；无法静态推断最终总量，必须 before/after measurement |

当前 build logical bytes 约 394.7 MB。迁移后 `.vercel/output/static` 应承载相同数量级的页面和视觉资产，Function 额外承载 server code/Agent data。adapter 不应重复把所有 prerender assets放进 Function，但动态 import/文件 trace 错误会导致意外重复；实际 Preview artifact 才是判据。

`vercel.json` 现有 Git policy 应保留。adapter 本身与 route-level runtime/duration/region 配置已足以表达第一版 hybrid；除非 Vercel Dashboard 或 route config 无法表达特定 project-level需求，不应把同一配置同时写在 `vercel.json` 与 route 中。

## 9. Local Development

未来在 `/api/agent/+server.ts` 存在且 server data packaging 同时支持 dev source layout 后，普通 `pnpm dev` 足以运行 SvelteKit endpoint；同源 `/agent -> /api/agent` 不需要 dev proxy，也不需要 Vercel CLI。Vite/SvelteKit 会加载 `.env.local`，private env 只可在 server module 使用。

要保留两套读取环境：开发时可以从生成源码目录读取，部署时必须从明确 packaged assets 读取；最好通过一个 server-only loader contract 统一，而不是让 UI/API 知道路径。Vercel CLI 只用于最终平台模拟、Preview deploy 与受保护 deployment 的 `vercel curl`，不应成为日常 UI 开发前置条件。

现有 `predev` 已运行 `data:ensure` 和 `assets:ensure`，所以本地 endpoint 的数据准备可以沿用；CLI/Inspector/eval/profile 继续走现有 Node command 与 `.env.local`，不被 adapter 取代。

## 10. Preview-first Rollout

最安全的 rollout 是在独立迁移分支/Preview 完成，不先改变 `main` Production：

1. 在 Vercel Dashboard 记录当前 Framework Preset、Build Command、Output Directory、Node major、plan、Fluid Compute、region、duration、Protection 与 Production/Preview env scope。
2. 记录当前 Production 的代表 URL、404、trailing slash、headers、static asset cache、deployment file/byte baseline。
3. 只切 adapter 与 output-aware verification，不加真实 Agent；部署 Preview 并对全部 route inventory 做 static regression。
4. 加一个无 secret、无业务数据的临时 server probe 来验证 Function routing/runtime/logs；该实验不得成为正式 API contract。
5. 解决 Agent-only data packaging 后再构建，检查 traced files、bundle/heap/cold-warm latency 和数据覆盖。
6. 为 Preview 配独立 `DEEPSEEK_API_KEY`，真实调用现有 runtime；Production 同名变量可以保持未配置，或 Production branch 根本不包含 route，直到 gate 通过。
7. 使用受保护 Preview 时，通过已授权 browser/session、`vercel curl` 或 Vercel shareable link 调试；不要误把 Protection 的 401/HTML 当 API 错误。

[Deployment Protection](https://vercel.com/docs/deployment-protection) 的实际 project setting 无法由仓库确认。Preview Function 的代码/runtime 语义与 Production相同，但 Preview env、域名、Protection、traffic 和生产 bytecode/cache optimization 可能不同，所以 Preview 通过是必要条件，不是生产性能保证。

当前 develop 不自动触发 Preview，必须使用手动 workflow 或调整未来流程；本轮不修改该约定。

## 11. Migration Risks

### Hard blocker

- **已证实的平台级 hard blocker：无。** SvelteKit/Vercel 支持同一 deployment 的 prerendered static output 与 Node Function。
- **当前实现若原封不动上线则被阻断：有。** CWD-relative dynamic filesystem reads 没有可靠 Function packaging contract。

### Must solve before migration

- 设计并验证 Agent-only generated data packaging/read boundary；不得依赖 sibling repo或未 trace 的源码路径。
- 改造 `deploy:verify`、clean allowlist 与相关测试，使 `.vercel/output/static` 和 Functions 都被验证。
- 用真实 Preview 确认 standard Function 是否低于 250 MB；当前静态分析无法作 Yes/No。
- 确认 plan/Fluid/duration；180 秒在 non-Fluid Hobby 上不兼容。
- 明确并对齐 Node major，至少消除 CI 22 / Vercel possible 24 / local 26 的未知行为。

### Migration concern

- 404 fallback、unknown route locale、trailing slash redirects 和 cache headers 可能与 adapter-static baseline 不完全一致。
- JSON parse + FlexSearch cold-start 的峰值内存、时延与并发需量测。
- `.vercel/output` 会改变 deployment storage composition；不能复用旧的“只发布 build/”结论。
- Dashboard build/output config、Protection 和自动部署策略不在仓库内，存在 configuration drift。
- 本地 Node 26 下 `pnpm deploy:build` 的 native `npm_execpath` 调用失败，虽不阻碍 Node 22 CI，但会影响可复现本地验收。

### Non-blocker backlog

- 是否为 route `split: true`；第一版只有一个动态 endpoint 时收益有限。
- 是否调整 region；先量测 DeepSeek latency。
- Large Functions beta；仅在标准 bundle gate 失败且无法合理缩减时考虑。
- exact caching、quota、rate limiting、visitor/IP signal、BotID、Redis/KV、circuit breaker 与 API JSON contract；hybrid endpoint 提供实现位置，但这些属于 UI-2。

## 12. Architecture Alternatives

| Dimension | A. 单项目 `adapter-vercel` hybrid | B. 静态站 + 独立 Agent service/project |
| --- | --- | --- |
| Migration complexity | 中：adapter/output verification/data packaging | 中高：新项目、部署、域名/CORS、版本与 secret 管理 |
| Operational complexity | 低：同一 build、same-origin、同一 Preview | 高：两个 deployment 生命周期和监控面 |
| Local dev | `pnpm dev` 同源 route | 需同时启动/代理两个服务 |
| Security boundary | `$lib/server` + private env + Function | 物理项目边界更强，但跨域/鉴权面更大 |
| Deployment coupling | Agent 与同一 pinned data commit 原子部署 | 必须显式同步 site/data/backend version |
| Static preservation | 现有 pages 继续 prerender/CDN | 完全不动静态 adapter |
| Agent data availability | 需解决 Function packaging；可与 build 原子生成 | 仍需复制/发布同一 Agent data，问题不会消失 |
| Maintainability | 首选：一套 route/types/build | 两套 repo/project/runbook |

推荐 A。B 只有在 Preview 证明以下任一事实时才升级为首选：标准/可接受的 Function packaging 无法容纳数据；180 秒/内存/并发在现有 plan 无法满足；或组织上明确需要独立安全、成本和扩缩容边界。

不增加方案 C。Vercel root `api/` 原生 Function 看似能保留 adapter-static，但会形成框架外 handler、独立 local dev/typing/data packaging，并可能与 SvelteKit `/api/**` routing 产生优先级复杂性；对需要直接复用 `$lib/server/agent` 的本项目，它不是更小的长期迁移面。

## 13. Recommended Migration Plan

### Step 0 — 固化 baseline 与 Dashboard facts

记录 Production/Preview 配置、Node、plan/Fluid、duration、Protection、region、build/output settings；保存当前 route/header/404/trailing/static storage baseline。

### Step 1 — 仅迁移 adapter 和 artifact verification

在实验分支安装并固定 `@sveltejs/adapter-vercel`，切换 `svelte.config.js`；保持根 prerender、entries、route inventory、upstream lock 和生成流程不变。让 clean/verify/tests 理解 `.vercel/output/static` 与 function manifests。此时不加 Agent endpoint。

### Step 2 — 证明 static preservation

本地 build 后比较全部 2,152 localized page entries、prerendered endpoints、asset reference closure、sitemap、status、canonical URLs、trailing slash 和 404。Preview 上确认这些请求命中 static/CDN 而非 Function。

### Step 3 — 证明最小 Node Function

增加一个实验性的无 secret probe，显式 `prerender = false`、Node runtime；确认 function output、logs、Protection、duration config 和 same-origin routing。完成实验后再决定是否保留 health route。

### Step 4 — 建立 Agent-only data artifact

从同一 pinned build 输出只包含中文 Endgame、enemy detail、search 与必要 manifest 的显式 artifact/index；通过静态 asset map/`$app/server.read` 或已证明的 traced package 读取。为 4 modes、628 enemies、search/manifest 写 deployment artifact coverage assertions，禁止视觉资产、英语/无关 catalog 与 `.upstream` 进入 Function。

### Step 5 — 量测 Function 而非估算

检查 `.vercel/output/functions` traced file list、uncompressed/compressed bytes、cold/warm latency、FlexSearch initialization、peak memory、并发 module-cache 行为和 180 秒 timeout。标准 250 MB gate、plan/Fluid duration gate 任一失败都先停止，不进入真实 endpoint。

### Step 6 — 才接入真实 `/api/agent`

用薄 `+server.ts` 调 `$lib/server/agent/runtime`，Preview-only secret，保持 CLI/Inspector 原入口；UI-2 再定义请求/响应、validation、rate/quota/security/circuit-breaker 与 no-store headers。

### Step 7 — Production gate

Preview 功能、性能、storage、Protection 与安全验收通过后，更新规范文档和运维 runbook，再合入 `main`。Production 第一次 hybrid deploy 后重跑完整 URL/header/storage/Function smoke，并保留可回滚到上一静态 deployment 的路径。

## 14. Likely Files Touched

### Must change（未来迁移）

| Path | Reason |
| --- | --- |
| `package.json` | adapter dependency；可能增加 artifact audit script |
| `pnpm-lock.yaml` | 固定 adapter-vercel 版本 |
| `svelte.config.js` | 从 static adapter 切到 Vercel adapter，保留 prerender entries |
| `scripts/deployment/verify-build.ts` | 验证 `.vercel/output/static`、Functions 与 data coverage |
| `scripts/deployment/clean.ts` | 安全清理新 output，不能宽泛删除未知 `.vercel` 内容 |
| `tests/unit/deployment-clean.test.ts` 及 deployment build tests | 固化新 artifact/guard contract |
| `src/routes/api/agent/+server.ts` | UI-2 才新增的动态 server boundary |

### Likely change

| Path | Reason |
| --- | --- |
| `src/lib/server/generated.ts` 或新的 `$lib/server/agent/*-loader.ts` | 消除不可靠 CWD/source path 读取，支持 packaged assets |
| `scripts/data/**` 中负责 Agent artifact 的生成/验证代码 | 产出最小、可追踪、pinned 的 server data set |
| `.env.example` | 只记录变量名与 scope，不包含 secret |
| `src/routes/agent/**`、messages、`scripts/data/routes.ts` | 后续产品阶段加入静态中英文页面和 route inventory |
| `.github/workflows/**` | 仅在新 output checks/Preview smoke 需要时调整 |
| `vercel.json` | 通常不需改；仅保留现有 Git policy，除非 route config/Dashboard 无法表达已证实需求 |

### Should remain untouched

- `upstream.lock.json` 与 pinned upstream fetch semantics；
- sibling `TurnBasedGameData`、`StarRailRes` repository；
- Agent 的 `ToolLoopAgent`、tools、prompt、model/provider、step/tool/timeout/evidence/locale/capability contract；
- static visual asset pipeline 与 URL taxonomy；
- CLI、Inspector、eval、profile 作为 runtime 的独立 consumers。

## 15. Documentation Follow-up

| File | Current statement | Why stale after migration | Recommended update scope |
| --- | --- | --- | --- |
| `docs/architecture/localization-and-data-generation.md` | Agent 仅本地 CLI/Inspector；public site fully static | hybrid 后存在公开 server Function | 定义 static vs server route、server-only/data/env boundary 与 pinned build/runtime 分工 |
| `README.md` | static deployment、Agent 本地运行、Preview 流程 | 不再是纯 static，develop 也并非自动 Preview | 更新 adapter/output、local API dev、env scope、手动/自动 Preview事实 |
| `docs/vercel-deployment-foundation.md` | 最终只发布 `build/` | 最终单元变为 `.vercel/output` + Function | 重写 artifact、verify、clean、rollback 与 Dashboard requirements |
| `docs/vercel-deployment-dependency-audit.md` | production runtime 无 server dependency | Agent Function 有 Node runtime与 packaged generated data | 增补 runtime dependency/size/duration，不改写历史测量 |
| 新的 hybrid deployment runbook（建议） | 当前不存在 | 需要可操作的 Preview/Production 验收 | 记录 env、Protection、Function logs、bundle/duration/storage、rollback checklist |
| 历史 Agent feasibility/UI audits | 按当时事实记录 static-only | 未来会成为历史状态 | 保留历史，不追改结论；用新规范链接说明 superseded scope |

## Yes / No / Conditional Answers

| Question | Answer | Basis |
| --- | --- | --- |
| Q1. 能否切换到 adapter-vercel，而让现有大多数页面继续 prerender？ | **Yes** | `prerender = true` routes 仍输出 static，并从 dynamic manifest 排除。 |
| Q2. `/agent` 本身能否继续静态化？ | **Yes** | 页面 shell 可 prerender；只在浏览器交互后 fetch API。 |
| Q3. 能否只有 `/api/agent` 使用 Vercel Function？ | **Yes** | 它可成为唯一动态业务 route；框架仍保留 unknown-route/error catch-all。 |
| Q4. 当前 `deploy:build` 能否基本保留？ | **Conditional** | 上游/生成/build orchestration 可保留，但 `build/` clean/verify/test contract 必须迁移。 |
| Q5. `upstream.lock` 架构能否保持不变？ | **Yes** | upstream 继续只在 build time 固定和生成数据。 |
| Q6. 当前 Agent runtime 所需数据能否在 Function 内取得？ | **Conditional** | 数据已在 build 生成，但必须建立显式 packaging/read boundary 后才能保证。 |
| Q7. 当前 runtime 是否存在本地 filesystem/path blocker？ | **Yes** | CWD-relative 动态 `fs` 读取不是可靠的 Vercel Function 文件契约。 |
| Q8. 当前 Agent timeout 是否兼容 Vercel runtime limit？ | **Conditional** | Fluid 默认 300s 可用；non-Fluid Hobby 最大 60s，不可用；项目设置未知。 |
| Q9. `DEEPSEEK_API_KEY` 能否安全按 Preview/Production 分开配置？ | **Yes** | Vercel env scope + SvelteKit private env/server-only boundary 支持。 |
| Q10. 普通 `pnpm dev` 是否可以运行未来 endpoint？ | **Yes** | SvelteKit dev 原生运行 `+server.ts` 并加载 `.env.local`；不需 proxy/CLI。 |
| Q11. 是否存在 Function bundle size blocker？ | **Unknown / requires Preview experiment** | 约 166.3 MiB 原始数据接近 250 MB标准上限，最终 trace/依赖大小未知。 |
| Q12. 是否有理由把 Agent 拆成独立项目？ | **No（当前）** | 尚无真实 blocker；拆分不会消除数据 packaging，且增加 CORS/版本/运维耦合。 |
| Q13. 是否可以安全进入下一阶段 `/api/agent` security + quota design？ | **Conditional** | 先通过 adapter、data packaging、bundle 和 duration Preview gates；之后可以。 |

## Official References

- [SvelteKit: Page options and prerender](https://svelte.dev/docs/kit/page-options)
- [SvelteKit: adapter-static](https://svelte.dev/docs/kit/adapter-static)
- [SvelteKit: adapter-vercel](https://svelte.dev/docs/kit/adapter-vercel)
- [SvelteKit: adapter-auto](https://svelte.dev/docs/kit/adapter-auto)
- [SvelteKit: Server-only modules](https://svelte.dev/docs/kit/server-only-modules)
- [SvelteKit: `$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private)
- [Vercel: SvelteKit framework guide](https://vercel.com/docs/frameworks/full-stack/sveltekit)
- [Vercel: Function limits](https://vercel.com/docs/functions/limitations)
- [Vercel: Fluid Compute](https://vercel.com/docs/fluid-compute)
- [Vercel: Supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Vercel: Environment variables](https://vercel.com/docs/environment-variables)
- [Vercel: Function regions](https://vercel.com/docs/functions/configuring-functions/region)
- [Vercel: Cache-Control headers](https://vercel.com/docs/caching/cache-control-headers)
- [Vercel: Deployment Protection](https://vercel.com/docs/deployment-protection)
- [Vercel changelog: Large Functions up to 5 GB](https://vercel.com/changelog/vercel-functions-can-now-be-up-to-5-gb-in-package-size)
