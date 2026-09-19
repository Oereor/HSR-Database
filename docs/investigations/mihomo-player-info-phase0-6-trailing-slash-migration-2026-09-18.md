# MiHoMo Player Info Phase 0.6：全站尾斜杠路由迁移

> 日期：2026-09-18；仓库：`HSR-Database` 的 `develop`（基线 `f8596b3`）  
> 范围：静态页面 URL convention、Vercel Preview 与临时 Function 共存验证；未实施 Player Info Phase 1

## 1. 结论

全站页面已改用 trailing-slash URL。SvelteKit 继续以 `adapter-static` 预渲染，Vercel 继续使用现有 `Other` preset、`pnpm deploy:build` 和 `build` 输出目录。最终无 probe Preview [dpl_Kb4fQRpP9YLEkKCatQjk6D5SeKrn](https://vercel.com/oereo-studio/hsr-database/Kb4fQRpP9YLEkKCatQjk6D5SeKrn) 为 **READY**，构建产物有 5 条高层 routes、0 overrides、0 Functions。页面目录索引、站内链接与浏览器最终 URL 均符合新约定。

**Phase 1：NO-GO（验证未闭合，而非已发现最终静态页面 404）。** Preview Deployment Protection 使未认证的独立 HTTP 客户端先收到 SSO 响应；现有已登录浏览器能展示页面，却不能从所用只读浏览器接口取得原始 document response status/`Location`。因此不能把 hydration 或最终页面渲染当作 HTTP 200，也不能把构建路由规则当作已实测 308/404。远端 POST 405 同样尚待认证 HTTP 验证。未修改 Protection，也未创建 bypass token。

## 2. 根因与实施边界

迁移前 `adapter-static` 为 `/characters/1304` 生成 `characters/1304.html`。Vercel 当前静态托管不会自动将无扩展名详情请求映射到该文件；真实 document request 为 404，`404.html` 与客户端路由恢复只掩盖了视觉症状。`cleanUrls` 的 Windows prebuilt 路径和 2,153 个 per-file overrides 已在 Phase 0.5 被否决。

本轮只更改 URL 输出约定；未切换 adapter、SSR、Framework Preset、Production Settings、Protection、域名或 Production deployment。未增加逐页 redirect/rewrite、`cleanUrls` 或 SEO 新功能，也未更改 manifest 中无尾斜杠的 route identity、生成数据及 Paraglide 生成文件。

## 3. 源码改动

- `src/routes/+layout.server.ts`：保留 `prerender = true`，增加 `trailingSlash = 'always'`；`siteUrl` 去除末尾 `/`，避免拼接双斜杠。`svelte.config.js` 的 `404.html` fallback 保持原样。
- `vercel.json`：增加 `"trailingSlash": true`，保留原 Git deployment 配置；无 `cleanUrls`。
- `src/lib/i18n/routing.ts`：`trailingSlashHref` 只规范化站内页面 pathname；`localizedHref`、`canonicalHref`、`localeCounterpartHref` 复用它。根路径、`/en/`、幂等输入、query/hash 均正确；外部、协议相对、仅 query/hash 的相对地址及有扩展名的文件资源不追加 `/`。
- `src/lib/navigation.ts`：先规范化当前路径与导航项，再精确判断首页和以前缀判断分类子路由。四类 catalog、共享详情 enhanced toggle 和搜索提交的 `goto` 使用规范化 pathname，保留已有 query/hash；搜索提交现在也保留 hash。首页卡片、分类详情、返回链接、搜索与 Endgame 的最终 href 由共享 helper 统一输出。
- 根布局现有 canonical/hreflang、现有 sitemap 改为尾斜杠页面路径；未新建 SEO 机制。`docs/architecture/localization-and-data-generation.md` 更新 URL convention。
- `scripts/deployment/verify-routes.ts` 与 `deploy:verify:routes` 纳入部署构建：逐一校验 manifest 的 2,152 个公开 locale 页面目录 `index.html`、旧同级 `.html` 不存在、渲染的内部页面链接不漏尾斜杠或产生双斜杠、`404.html` 存在。更新 routing、navigation、localization、Vercel、组件及桌面/移动浏览器预期，并加入 `tests/e2e/trailing-slash.spec.ts`。

## 4. 构建与静态产物

| 项目 | 迁移前 | 最终迁移后 |
| --- | ---: | ---: |
| manifest route identities | 1,076，保留无尾斜杠 | 1,076，未改数据模型 |
| 两种 locale 页面目录索引 | 原为页面 `.html` | 2,152 个 `index.html` |
| HTML 总数（含 fallback） | 2,153 | 2,153 |
| Vercel static files | — | 7,126 |
| Vercel routes / overrides / functions | Phase 0.5 proof 参考 2 / 0 / 0 | **5 / 0 / 0** |

总 HTML 数不变：1,076 条 route identity × 2 locale = 2,152 个页面，另有一个 `404.html`。变化是页面文件位置，而非页面数量。`build/characters/1304/index.html`、`build/en/characters/1304/index.html` 及其他四类详情/Endgame 索引存在；旧 `characters/1304.html` 和英文对应文件不存在。fallback、`sitemap.xml`、`robots.txt`、图片和许可证文件仍在。静态路由校验全部通过。

固定 Vercel CLI `59.16.0`，沿用现有 `oereo-studio/hsr-database` 项目与本机 `127.0.0.1:7890` 代理。最终 `vercel build --target=preview` 为 5 routes、0 overrides、0 Functions、7,126 static files、2,153 HTML；没有 per-page override、无效 Windows output path 或 route-limit warning。高层规则含 extensionless → slash 的 308、文件扩展名路径去 slash 的 308，以及 `404.html` 的 404 fallback。CLI 的 Node/pnpm engine 提示不属于路径/route-limit 警告。

## 5. 临时 Function 与未来 BFF URL

临时 `api/player.ts` 加入时，Preview build 为 **9 routes / 0 overrides / 1 Function**，7,126 静态文件与 2,153 HTML 未变。修正后的 probe Preview [dpl_ELaUwyBXV8ocX3PKvGjfWgnZmN5o](https://vercel.com/oereo-studio/hsr-database/ELaUwyBXV8ocX3PKvGjfWgnZmN5o) 为 READY，部署列出 `api/player` Function；Vercel 运行日志明确记录 `GET /api/player/` **200**。浏览器也可访问同一部署的静态页面，证明两类产物共存。

首次 probe 使用默认导出 `(Request) => Response`，Vercel 日志明确告警返回的 `Response` 被忽略，最终超时 504。随后改为 Node `(IncomingMessage, ServerResponse) => void`、通过 `res.end()` 输出，重建部署后 GET 200。已部署 bundle 的本地调用验证 `GET` 为 JSON 200，`POST` 为 JSON 405 且 `Allow: GET`；**远端 POST 405 尚未直接观测**。browser-use 的安全策略拒绝构造 POST 表单，不采用间接绕过。

Vercel 输出路由规则显示 `/api/player` 符合 308 → `/api/player/`，但因 Protection 尚未取得独立 HTTP 的实际状态/`Location` 链。未来 BFF 暂以 `/api/player/?uid={uid}` 为候选 canonical，须在 Phase 1 前由认证 HTTP 验证锁定；页面概念 URL 则为 `/player/`、`/player/?uid=...`、`/characters/{id}/?uid=...`。probe 源文件已删除；最终 Preview 为 **0 Functions**，没有正式 BFF 或 Player 页面。

## 6. Preview 证据矩阵

最终 Preview：[https://hsr-database-c2nnt76qa-oereo-studio.vercel.app](https://hsr-database-c2nnt76qa-oereo-studio.vercel.app)，deployment `dpl_Kb4fQRpP9YLEkKCatQjk6D5SeKrn`，`vercel inspect` 确认 target `preview`、READY、无 Function。未认证独立 HTTP 请求受 Deployment Protection SSO 拦截；下表的“浏览器结果”仅说明现有会话的最终 URL 和文档内容，**不是原始 HTTP status 的替代品**。

| 请求/场景 | 浏览器最终结果或构建证据 | 原始 HTTP 验证 |
| --- | --- | --- |
| `/` | 首页文档与导航可见 | 200 待认证 HTTP 确认 |
| `/characters`、`/characters/1304` | Vercel 输出规则为 308；旧详情浏览器落在 `/characters/1304/` | 308 与 `Location` 待确认 |
| `/characters/`、`/characters/1304/` | 目录索引存在；详情显示“砂金” | 200 待确认 |
| `/characters/1304?phase06=1` | 最终 `/characters/1304/?phase06=1` | 308/最终 200 待确认 |
| `/en/characters/1304`、`/en/characters/1304/` | 英文目录索引与 Aventurine 文档可见 | 308/200 待确认 |
| `/en/characters/1304?uid=168902602&foo=a&foo=b#stats` | 最终 slash URL 保留重复 query 与 hash | 308/200 待确认；hash 不发送到服务器 |
| 光锥、遗器、敌方、Endgame 详情 | 最终 slash URL 与各自 h1、canonical pathname 可见 | 各真实 document 200 待确认 |
| 文件资源 | 产物保留无 slash 文件路径，本地请求测试为 200 | Preview 资源 HTTP 待确认 |
| `/phase06-definitely-missing`、末尾带 `/` | 规则为 308 后 404 fallback；浏览器未显示站点详情文档 | 最终真实 404 待确认 |
| `/api/player`、`/api/player/`（临时 probe Preview） | 规则为 308；Vercel Function 日志 `GET /api/player/ = 200` | redirect 链与 POST 405 待确认 |

本地 Playwright 的 response 断言不是 Vercel 托管行为的证据。Protected Preview 的页面渲染不被标记为 Gate A2 的真实 HTTP PASS；需要有权限的用户通过现有认证方式逐项检查 status、`Location`、最终 body/content-type、query 与缺失路径，不创建长期 bypass token。

## 7. 交互、测试与问题

- `pnpm check`：0 errors、0 warnings；`pnpm test`：48 files / 493 tests 通过；`pnpm build` 与 `pnpm deploy:verify:routes` 通过。
- 本地桌面/移动 Playwright 聚焦 locale、Search V2、新增尾斜杠测试：66 passed / 2 skipped；Endgame 统一敌方卡 href 另 2 passed。CI smoke 在临时 4317 端口配置下 5/5 passed。覆盖站内导航、语言切换、UID/重复 query/hash、搜索前进后退、代表页面 direct document、文件资源、缺失路径和移动端导航。临时 Playwright config 位于忽略的 `.vercel/`，未纳入源码。
- 早期较广的桌面/移动选择集为 105 passed、5 skipped、26 failed；其中 16 个 locale regex、2 个敌方 href regex、2 个搜索拦截路径旧预期已修正，并由上述聚焦回归通过。其余 Endgame 失败源于 2026-09-18 当前/历史赛期随日期变化的既有固定预期，与本轮 URL 迁移无关，未扩张修改。
- 修改文件 targeted Prettier/ESLint 通过；`git diff --check` 通过。全仓 `pnpm lint` 仍因 15 个**未修改的既有文件**的 Prettier 格式失败，未批量改无关文件。本机默认 smoke 4173 端口 `EACCES`，用忽略的 4317 配置验证。一次 Vercel build 的数据校验遭 Windows `0xC0000005` 原生异常，独立重跑通过，之后 probe 与最终 Preview builds 均通过。
- Preview 拉取配置中的 `PUBLIC_SITE_URL` 为空，现有 canonical/hreflang 的 host 因而回退 `http://localhost:5173`；本轮已确保其 pathname 尾斜杠一致，但未改 Production/Preview Project Settings。部署域名上的 SEO host 修正是独立配置问题，不作为 HTTP 路由成功证据。
- `TurnBasedGameData` 保持 `4ce30f69b32dc259ab9a8da3ba57035485103221`、`StarRailRes` 保持 `d226befe3db13f2ec15f4161d5f34b1b607643fe`，两者工作树干净。没有提交、推送或 PR。

## 8. Gate 与下一步

| Gate | 状态 | 未闭合点 |
| --- | --- | --- |
| A1 — standalone Function coexistence | **PARTIAL，未标 PASS** | bundle/Preview 共存和远端 GET 200 已证实；远端 POST 405、两种 API URL 的完整重定向/query contract 尚需认证 HTTP。 |
| A2 — static hosting / trailing slash | **PARTIAL，未标 PASS** | 最终 Preview READY、索引/规则/浏览器最终文档均正确；真实 308 → document 200、缺失最终 404 的 wire-level matrix 尚需认证 HTTP。 |
| B — MiHoMo fixture contract | **PASS** | 继承 Phase 0 验证；本轮未改 fixture 合同。 |

**Phase 1：NO-GO。** 请用户以现有 Vercel 权限完成受保护 Preview 的独立 HTTP matrix（含 probe Preview 的 GET/POST 与 `/api/player` 两种路径）；提供 status、`Location`、query 和最终响应证据后再重新判定 A1/A2。若 probe deployment 无法再认证访问，可在明确授权且遵守相同边界下重新部署短期 probe 并清理；本轮不继续 Phase 1。
