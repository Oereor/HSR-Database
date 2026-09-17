# HSR Data Agent UI-1.5A — Hybrid Foundation Migration 实测报告

日期：2026-09-17  
范围：仅本地 production-like build；未链接 Vercel project、未 push、未创建 Preview/Production deployment。

## 1. Result

**PASS（本地迁移与 artifact contract）**。

`@sveltejs/adapter-vercel` 已生成同时包含完整静态站点与最小 Node Function 的 Build Output API v3 产物。1,076 条 canonical routes、2,152 条 localized public routes、2,152 个 HTML、2,152 个 `__data.json` 和 380 个 occurrence shards 均通过程序化完整性验证；唯一物理 Function 为 1,005,792 bytes，未包含 Agent SDK、DeepSeek、FlexSearch、generated HSR data、静态图片或 `.upstream`。

本结论不等同于真实 Vercel Preview/Production 已通过。Dashboard、CDN/cache headers、Deployment Protection、平台日志与平台打包仍未验证。

## 2. Changes Made

- Dependency：删除 `@sveltejs/adapter-static`，加入 `@sveltejs/adapter-vercel`；lockfile 实际解析为 `6.3.4`，其余直接依赖保持原版本。
- Adapter：`svelte.config.js` 改为无额外 options 的 `adapter()`；manifest entries、locale entries、preprocess、deployment version 和根 `prerender = true` 模型保持不变。
- Probe：新增 `GET /api/_deployment-probe`，显式 `prerender = false`，仅返回 `{ "ok": true }`；没有读取 env、secret、Agent runtime 或游戏数据。
- Clean：exact allowlist 新增 `.vercel/output`，继续清理迁移期 stale `build`，未把 `.vercel` 根目录加入删除范围。
- Verification：主入口从 `build/` 迁移到 `.vercel/output`，保留独立 static asset reference-closure helper，并新增 Build Output v3、完整 route inventory、prerender endpoint、static copy、Function runtime/bundle 检查。
- Launcher：修复 Node 26.5.0 / pnpm 11.9.0 下 native `npm_execpath` 被错误交给 Node 解析的问题；JS CLI 由 Node 启动，native/extensionless/`.exe` 直接执行，无 `npm_execpath` 时回退 PATH `pnpm`。
- Tooling：ESLint 忽略新生成的 `.vercel/**` artifact，避免对 adapter 生成代码运行源码 lint。
- Tests：扩展 clean、launcher、Build Output verifier 测试；完整 fixture 和缺失/损坏/越界/forbidden-content 失败路径均有覆盖。

未修改 `vercel.json`、Node engine、GitHub Actions、prerender architecture、upstream lock、Agent runtime、Agent UI、真实 Agent API 或数据 packaging。

## 3. Final Build Architecture

```text
upstream.lock.json
  ├─ TurnBasedGameData @ 8dc7843723cf...
  └─ StarRailRes       @ d226befe3db1...
             │
             ▼
messages → generated data → generated assets → validation
             │
             ▼
       SvelteKit 2.70.3
             │
             ▼
@sveltejs/adapter-vercel 6.3.4
             │
             ├─ .vercel/output/static
             │    ├─ 2,152 prerendered pages
             │    ├─ 2,152 __data.json files
             │    ├─ 380 occurrence shards
             │    └─ generated/client/static assets
             │
             ├─ .vercel/output/functions
             │    └─ one physical Node Function bundle
             │         └─ /api/_deployment-probe route alias
             │
             └─ .vercel/output/config.json (Build Output API v3)
```

Vercel 官方把 `.vercel/output` 定义为文件系统部署契约，`static/` 作为 CDN 静态资源，`.func` 目录作为 Function artifact；本实现按该结构验证。[Build Output API](https://vercel.com/docs/build-output-api)，[Vercel primitives](https://vercel.com/docs/build-output-api/primitives)，[SvelteKit adapter-vercel](https://svelte.dev/docs/kit/adapter-vercel)。

## 4. Static Preservation Results

| Invariant | Result |
| --- | ---: |
| Canonical routes（manifest 重算） | 1,076 |
| Localized public routes | 2,152 |
| `config.json` prerender overrides | 2,152 |
| Static HTML | 2,152 |
| `__data.json` | 2,152 |
| Occurrence shards | 380 |
| `generated-assets` files | 2,153 |
| `generated-enemy-assets` files | 212 |
| `robots.txt` | static, present |
| `sitemap.xml` | static, 2,152 URLs, probe absent |
| Source `static/` exact-case/size copy | PASS |
| Generated asset URL closure | PASS（4,378 text files / 9,312 indexed paths） |

对旧 `build/` 与新 `.vercel/output/static/` 做 checksum 比较后，内容层面的唯一差异是缺少旧 adapter-static 生成的 `404.html`。其余文件内容全部相同；mtime 不计入差异。

## 5. Probe Function Results

- Route：`GET /api/_deployment-probe`
- Source behavior：`prerender = false`，body 为 `{"ok":true}`
- Routing config：`^/api/_deployment-probe/?(?:/__data.json)?$` → `/api/_deployment-probe`
- Physical artifact：`.vercel/output/functions/![-]/catchall.func`
- Route aliases：`functions/api/_deployment-probe.func`、`functions/api/_deployment-probe/__data.json.func`
- Unique physical Functions：1
- Runtime metadata：`nodejs24.x`，`launcherType: Nodejs`，SvelteKit `2.70.3`
- Regular files：77
- Uncompressed logical bytes：1,005,792（约 0.96 MiB）
- Compressed bytes：**N/A**；adapter 未输出规范化平台压缩包，本地不伪造平台压缩账单或上传体积。

最大的 bundle files：

| Bytes | File |
| ---: | --- |
| 271,064 | `.svelte-kit/vercel-tmp/manifest.js` |
| 148,691 | `.svelte-kit/output/server/chunks/visual-assets.js` |
| 134,122 | `.svelte-kit/output/server/index.js` |
| 105,492 | `.svelte-kit/output/server/chunks/index.js` |
| 58,823 | `.svelte-kit/output/server/chunks/utils.js` |
| 43,824 | `.svelte-kit/output/server/entries/pages/_layout.svelte.js` |

`visual-assets.js` 是共享 server code，不是静态图片 payload。路径扫描、依赖目录扫描和文本 signature 扫描均确认：没有 `.upstream`、`src/lib/generated`、`static/generated`、`generated-assets`、`generated-enemy-assets`、AI SDK、DeepSeek、FlexSearch、`DEEPSEEK_API_KEY` 或 `runDataAgent`。

该 bundle 远低于 Vercel 当前标准 Function 250 MB uncompressed limit；本轮没有启用 Large Functions。[Vercel Functions limits](https://vercel.com/docs/functions/limitations)。

## 6. Deployment Verification Changes

Verifier 现在以 `.vercel/output` 为主 deployment root：

1. 要求 `config.json`、`static/`、`functions/` 存在，解析并验证 Build Output API `version === 3`。
2. 从真实 generated manifest 计算 canonical/localized inventory，通过 `overrides.path` 映射逐条检查 2,152 个 HTML 与对应 `__data.json`。
3. 检查 sitemap URL 数、probe 排除、robots、两种 locale 的 380 个 occurrence shards。
4. 将源 `static/` 的每个文件按 exact-case 和 byte size 与 output 对比。
5. 在 `.vercel/output/static` 上继续执行原有 generated asset missing/wrong-case/traversal closure 检查。
6. 从 `config.routes` 查找 probe routing，再解析 route alias 的真实 `.func` target；对 symlink 去重并验证 `.vc-config.json` Node runtime。
7. 统计唯一物理 Function 的 files/bytes/largest files，并拒绝 Agent、HSR deployment data、静态资源目录与 `.upstream` 泄漏。

Function 定位依赖 documented `.func` primitive、route config 和 realpath containment，不硬编码 `![-]/catchall.func` 私有名称。`overrides` 的用途与 v3 schema 对齐官方规范。[Build Output configuration](https://vercel.com/docs/build-output-api/configuration)。

## 7. Clean Safety Changes

- 删除目标是精确的 `.vercel/output`，不是 `.vercel`。
- 旧 `build` 仍作为 stale migration artifact 被清理。
- root containment、tracked non-`.gitkeep` refusal、symlink/junction target/parent guard 和 protected metadata digest guard 均保留。
- 单元测试实际创建 `.vercel/project.json`，确认清理后内容不变。
- 单元测试确认 tracked `.vercel/output/source.ts` 和 `.vercel/output` 内 symlink 都会在任何删除发生前拒绝执行。

## 8. Local Validation

| Command / check | Result | Notes |
| --- | --- | --- |
| manifest baseline measurement | PASS | 1,076 canonical / 2,152 localized |
| `pnpm install --frozen-lockfile` | PASS | adapter-vercel 6.3.4；无 unrelated direct upgrades |
| targeted deployment tests | PASS | 38/38 |
| `pnpm check` | PASS | Svelte 0 errors / 0 warnings；scripts TS pass |
| `pnpm lint` | PASS | Prettier + ESLint |
| `pnpm test` | PASS | 51 files / 574 tests |
| `pnpm test:e2e:smoke` with existing build | PASS | 5/5 Chromium smoke tests |
| plain `pnpm build` on local Node 26.5.0 | EXPECTED FAIL | adapter-vercel rejects unsupported Node 26 before adaptation |
| `pnpm build` under existing Node 24.19.0 runtime | PASS | `.vercel/output` generated |
| `pnpm deploy:verify` | PASS | full static + Function verification |
| `pnpm deploy:build` under Node 24.19.0 | PASS | full orchestration, 66.664 s |
| local preview route probes | PASS | probe/pages/locale/404/trailing slash checked |
| `git diff --check` | PASS | no whitespace errors |

Node 26 failure是 adapter 6.3.4 的明确版本 gate，不是 launcher 回归。项目文件没有更改 Node major；验收使用本机已有的 Node 24.19.0 runtime。launcher regression tests 覆盖 `.js/.cjs/.mjs`、native extensionless、Windows `.exe` 和 PATH fallback。

`deploy:build` 实测阶段耗时：data validation 27.277 s，Vite/adaptation 26.888 s，deployment verify 1.470 s，总计 66.664 s。该时间只代表本机热数据/资源缓存条件，不代表 Vercel build time。

## 9. Output Size Comparison

这里的 bytes 是 regular files 的 uncompressed logical byte sum；symlink aliases 不重复计费，不代表 Vercel 上传压缩包或账单。

| Artifact | Files | Logical bytes |
| --- | ---: | ---: |
| Before: `build/` | 7,126 | 394,715,881 |
| After: `.vercel/output/static/` | 7,125 | 394,713,772 |
| Unique physical probe Function | 77 | 1,005,792 |
| `config.json` | 1 | 548,944 |
| Total `.vercel/output` regular files | 7,203 | 396,268,508 |

Static delta：`-1 file / -2,109 bytes`，精确对应旧 `build/404.html`；checksum comparison 未发现其他内容差异。静态最大文件为 `en/search/__data.json`（2,544,697 bytes）。

## 10. Known Differences

### Locally verified

- Output contract：`build/` → `.vercel/output/{static,functions,config.json}`。
- 404：不再生成 fallback `404.html`；本地 preview unknown route 返回 404 HTML，由 SvelteKit/framework routing 处理。
- Trailing slash：`/characters/1001/` 返回 `307`，`Location: /characters/1001`，保持 `never` 语义。
- Known routes：所列代表页面均为 200 HTML。
- Function route：probe 和当前 reroute 产生的 `/en/api/_deployment-probe` alias 在本地均返回 `200 application/json` 与 `{"ok":true}`。后者只记录为非正式 alias，不是公共 contract。
- Occurrence body：代表 shard 返回正确 JSON body；Vite preview 对 extensionless static file 报 `text/html`，因此真实平台 Content-Type 必须在 Preview 复核。
- Node：本地产物 metadata 是 `nodejs24.x`；Node 26.5.0 build 被 adapter 拒绝。

### Requires real Vercel Preview

- Framework Preset/Build Command/Output Directory 是否由 Dashboard 与 framework detection 正确识别。
- Static asset CDN/cache headers、`x-vercel-cache`、compression、upload/package size 与 billing。
- Vercel 404 body/status、redirect、locale reroute、extensionless JSON Content-Type。
- Function cold/warm behavior、Function logs、region、duration、memory、Fluid Compute 与 Protection。
- Native dependency platform compatibility；Vercel 官方也说明本地 build architecture 不能证明平台 Linux artifact compatibility。[Build Output API known limitations](https://vercel.com/docs/build-output-api)。

## 11. Dashboard Checklist

| Dashboard fact | Status |
| --- | --- |
| Framework Preset | **Unknown — user must verify** |
| Build Command | **Unknown — user must verify** |
| Output Directory | **Unknown — user must verify** |
| Node major | **Unknown — user must verify** |
| Plan | **Unknown — user must verify** |
| Fluid Compute enabled? | **Unknown — user must verify** |
| Function default/max duration | **Unknown — user must verify** |
| Function memory | **Unknown — user must verify** |
| Region | **Unknown — user must verify** |
| Deployment Protection | **Unknown — user must verify** |
| Preview environment variables | **Unknown — user must verify** |
| Production environment variables | **Unknown — user must verify** |

真实 Agent rollout 前还必须确认 project plan、Fluid Compute 和 180 s Agent duration 是否可用；本轮 probe 没有配置或继承假定的 180 s timeout。

## 12. Preview Validation Checklist

用户触发 develop Preview workflow 后，对以下真实路径逐项检查 HTTP status、redirect/`Location`、`Content-Type`、`Cache-Control`、`x-vercel-cache`、rendered content、locale 和 asset loading：

- [ ] `/`、`/en`
- [ ] `/characters`、`/characters/1001`、`/en/characters/1001`
- [ ] `/light-cones`、`/light-cones/20000`
- [ ] `/relics`、`/relics/101`
- [ ] `/enemies`、`/enemies/1002011`
- [ ] `/endgame`、`/endgame/moc/100`
- [ ] `/search`
- [ ] `/robots.txt`、`/sitemap.xml`
- [ ] `/generated/zh-CN/endgame-occurrences/1002020`：要求 body 可解析为 JSON，并重点核对平台 `Content-Type`
- [ ] `/_app/version.json` 以及页面引用的 `_app`、`generated-assets`、`generated-enemy-assets` URL
- [ ] `/this-route-does-not-exist`：要求 404，检查 body 与 locale behavior
- [ ] `/characters/1001/`：要求 redirect 到无尾斜杠 canonical URL
- [ ] `/api/_deployment-probe`：要求 `200`、`application/json`、精确 body `{"ok":true}`
- [ ] `/en/api/_deployment-probe`：记录当前实际 alias 行为，但不得把它发布为正式 API contract

Probe 另需在 Vercel Function logs 中确认发生真实 Function invocation；日志与 response 均不得暴露 secret、env、filesystem path、provider 或游戏数据。重复请求至少两次，记录 `x-vercel-cache`、延迟和 cold/warm log 差异。若启用 Deployment Protection，同时检查浏览器与自动化访问行为。

## 13. Remaining Blockers Before UI-1.5B

| Gate | Status |
| --- | --- |
| Adapter/output blocker | None locally |
| Static regression | None detected |
| Build verifier blocker | None |
| Launcher blocker | Fixed with regression coverage |
| Local default Node 26 alignment | Open operational issue；supported Node 20/22/24 required for adapter 6.3.4 build |
| Dashboard facts | Open；all unknown |
| Real Preview validation | Open |
| Agent data packaging | Intentionally not started；this is UI-1.5B scope |

Function foundation 已成立，但本轮没有证明真实 Agent data 能以受控体积进入 Function，也没有验证 FlexSearch memory、cold/warm runtime 或 250 MB Agent bundle gate。

## 14. Recommendation

**CONDITIONAL GO — 可以进入 UI-1.5B Agent Data Packaging Experiment，但必须先满足两个外部 gate：**

1. Vercel Dashboard 确认 supported Node major、framework/build/output 设置，以及 plan / Fluid Compute / duration / memory / region / Protection。
2. 一次 develop Preview 按第 12 节通过，尤其确认静态 cache headers、extensionless occurrence JSON Content-Type、404/trailing slash、locale alias 和真实 Function logs。

UI-1.5B 只能开始 Agent-only server data artifact 的最小化与 bundle/memory 实验；不得把本报告视为真实 `/api/agent`、180 s execution、rate limit 或生产上线已获批准。
