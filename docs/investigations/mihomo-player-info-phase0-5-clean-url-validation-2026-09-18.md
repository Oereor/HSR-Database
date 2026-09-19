# MiHoMo Player Info Phase 0.5：Clean URL 修复验证报告

> 验证日期：2026-09-18  
> 分支：`develop`  
> 范围：`adapter-static` 的 extensionless URL 托管、standalone Function 共存、Vercel Preview 产物与部署  
> 边界：未修改 Production，未实现 Player Info，未保留 probe 或 trailing-slash 实验配置

## 1. 结论

**Variant A（Vercel `cleanUrls: true`）FAIL；本轮没有保留 `cleanUrls`。**

`cleanUrls` 在本机 Windows 上使用与 CI 相同的 Vercel CLI 59.16.0 构建时，为 2,153 个 HTML
生成了 2,153 个 per-file overrides。除 9 个根文件外，其余 2,144 个 override key 都包含 Windows
反斜杠。真实 Preview 虽然部署为 READY，但 Vercel 对这 2,144 项逐项报告：

```text
Warning: Override path "characters\1304.html" was not detected as an output path
```

这同时违反本轮的配置规模与无明显回归要求。该部署不能作为稳定的 clean URL 修复，且无需再把
受保护 Preview 中的 UI 恢复行为当作成功证据。

**Variant B（SvelteKit `trailingSlash = 'always'`）的 build/deployment proof 成立，但没有正式采用。**
它保持 `routes=2 / overrides=0`，将详情页生成为 `characters/1304/index.html`；加入 probe 后也只有
`routes=6 / functions=1`。真实 Preview 部署 READY 且没有 override warning。不过当前导航、locale
switch、canonical 和 sitemap 仍以无尾斜杠 URL 为约定，正式采用会是全站 URL migration，必须另行
获得产品确认并补齐 redirect/SEO/链接改造和受保护 Preview HTTP smoke。

最终 Gate：A1 PASS、A2 FAIL、B PASS；**Phase 1 NO-GO**。

## 2. Root cause

当前 SvelteKit 根布局使用默认 `trailingSlash = 'never'`，`adapter-static` 因而生成：

```text
build/characters/1304.html
build/en/characters/1304.html
```

baseline 的 `.vercel/output/config.json` 只有 fallback route，没有 `/characters/1304` 到
`/characters/1304.html` 的映射。因此直接 document request 返回 404，而 `404.html` 中的客户端
代码又能恢复成角色页面，造成“视觉正常、HTTP 错误”的假象。

Vercel 官方文档说明 `cleanUrls: true` 应让 `/about.html` 通过 `/about` 访问，并将 `.html` URL 以
308 规范化到 extensionless URL。本轮失败不是该语义本身不匹配产品，而是实际 Build Output 在
Windows 上产生了大规模、路径分隔符无效的 overrides。

## 3. 环境与 baseline

- 复用现有 `oereo-studio/hsr-database`，Project ID
  `prj_1Vn2RGpC3FkuhINPMwgZx0jBkElK`；没有创建新项目。
- Project Settings：Framework Preset `Other`、Build Command `pnpm deploy:build`、Output Directory
  `build`、Node.js `24.x`。
- 使用 Preview pull：`--environment=preview --git-branch=develop`。
- 仓库全局 CLI 是 48.0.0；本轮实际使用 CI 固定的 Vercel CLI 59.16.0。
- `TurnBasedGameData` 与 `StarRailRes` 初始状态均干净，本轮未修改。

回滚后的 baseline 复建也恢复到同一组指标：

| Metric | Baseline | `cleanUrls` | Delta |
| --- | ---: | ---: | ---: |
| routes | 2 | 4 | +2 |
| overrides | 0 | 2,153 | +2,153 |
| functions | 0 | 0 | 0 |
| static files | 7,126 | 7,126 | 0 |
| HTML files | 2,153 | 2,153 | 0 |

## 4. `cleanUrls` + standalone Function

临时 `api/player.ts` 只实现 GET probe 和非 GET 405，没有依赖、MiHoMo 调用、文件系统访问或
SvelteKit import。

| Metric | `cleanUrls` only | `cleanUrls` + probe | Delta |
| --- | ---: | ---: | ---: |
| routes | 4 | 8 | +4 |
| overrides | 2,153 | 2,153 | 0 |
| functions | 0 | 1 | +1 |
| static files | 7,126 | 7,126 | 0 |
| HTML files | 2,153 | 2,153 | 0 |

唯一 Function 位于 `.vercel/output/functions/api/player.func`，runtime 为 `nodejs24.x`。因此
`cleanUrls` 没有破坏 Function bundling，问题集中在静态 overrides。

### 4.1 Preview deployment

- Deployment ID：`dpl_GNkkVgVsBk597oQqUL5HuDakagDS`
- Preview：`https://hsr-database-gzgzhx5qm-oereo-studio.vercel.app`
- Inspector：`https://vercel.com/oereo-studio/hsr-database/GNkkVgVsBk597oQqUL5HuDakagDS`
- 状态：READY；提取 7,135 个 deployment files。
- 平台没有给出 route-limit hard error，但对 2,144 个包含反斜杠的 override 发出 output-path warning。

### 4.2 HTTP smoke

Deployment Protection 开启，CLI 认证不能直接作为普通 HTTP document 认证使用。本轮遵守约束，
没有调用会创建额外 automation-bypass token 的 `vercel curl`，也没有修改 Protection 设置。
Variant A 在 HTTP smoke 前已因 per-page config 膨胀和 2,144 个无效 override warning 满足 FAIL 条件，
所以没有把受保护登录页或浏览器 hydration 结果记作 HTTP PASS。

| URL | Expected | Actual | Result |
| --- | ---: | --- | --- |
| `/` | 200 | 未执行受保护 HTTP smoke | NOT RUN |
| `/characters/1304` | 200 | 未执行受保护 HTTP smoke | NOT RUN |
| `/en/characters/1304` | 200 | 未执行受保护 HTTP smoke | NOT RUN |
| `/characters/1304?phase05=1` | 200 | 未执行受保护 HTTP smoke | NOT RUN |
| `/characters/1304.html` | 308 | 未执行受保护 HTTP smoke | NOT RUN |
| `/en/characters/1304.html` | 308 | 未执行受保护 HTTP smoke | NOT RUN |
| `/phase05-definitely-missing` | 404 | 未执行受保护 HTTP smoke | NOT RUN |
| `GET /api/player` | 200 | bundle/deployment 成立；HTTP 未执行 | NOT RUN |
| `POST /api/player` | 405 | bundle/deployment 成立；HTTP 未执行 | NOT RUN |

代表性 Character、Light Cone、Relic、Enemy、Endgame 与英文路由矩阵同样没有在该失败 Variant 上
继续执行。这样避免将 UI 恢复或 Protection 响应错误地记录为 document 200。

## 5. Route-limit assessment

Vercel 当前 Limits 文档列出 **Routes created per Deployment = 2,048**。官方文档没有在此处明确说明
Build Output `overrides` 是否等同计入该数字；本轮不做该推断。实际证据是：

1. deployment 被平台接受，没有 route-limit hard error；
2. `cleanUrls` 确实生成 2,153 个 per-page overrides，不是常数成本；
3. 该数量已经超过 2,048 的限制量级；
4. 其中 2,144 个在真实部署时被判定为不存在的 output path。

因此本项目不能把当前 Windows prebuilt `cleanUrls` 输出判定为 route/config 安全。

## 6. Variant B：`trailingSlash = 'always'`

Variant A 完全回滚并复建 baseline 后，临时在根布局设置 `trailingSlash = 'always'`。

### 6.1 Build output

- `pnpm build` PASS。
- `build/characters/1304/index.html` 与 `build/en/characters/1304/index.html` 存在。
- 原 `build/characters/1304.html` 不再存在。
- HTML 总数仍为 2,153，静态文件总数仍为 7,126。

| Metric | trailingSlash only | trailingSlash + probe | Delta |
| --- | ---: | ---: | ---: |
| routes | 2 | 6 | +4 |
| overrides | 0 | 0 | 0 |
| functions | 0 | 1 | +1 |
| static files | 7,126 | 7,126 | 0 |
| HTML files | 2,153 | 2,153 | 0 |

### 6.2 Preview deployment

- Deployment ID：`dpl_6dx3f4PNJKHeAE4uBSpqYL4kJov6`
- Preview：`https://hsr-database-f26ejspd8-oereo-studio.vercel.app`
- Inspector：`https://vercel.com/oereo-studio/hsr-database/6dx3f4PNJKHeAE4uBSpqYL4kJov6`
- 状态：READY；提取 7,135 个 deployment files；没有 override/route-limit warning。

Deployment Protection 同样阻止了无 bypass secret 的自动 HTTP smoke。本轮不创建 token，因此
Variant B 的结论限于 build/deployment proof，不能写成完整 HTTP PASS。

### 6.3 Migration impact

`trailingSlash = 'always'` 不能作为单行修复直接保留。构建后的主页仍包含
`href="/characters"`、`href="/characters/1304"` 等无尾斜杠链接；正式迁移至少需要：

- 在共享 `localizedHref` / `localeCounterpartHref` 层统一 canonical 尾斜杠并保留 query/hash；
- 更新站内导航、搜索结果、Endgame、详情返回链接和浏览器 history 写入；
- 让 canonical、hreflang 与 sitemap 输出带尾斜杠；
- 为现有 extensionless 外链制定到带斜杠 canonical 的 redirect，并验证 308 与 query/hash 保留；
- 更新 route/test expectations，并在真实 Preview 上完成中文、英文、资源、locale 与前进后退 smoke。

这会改变全站公开 URL convention，需用户明确批准后另行实施。

## 7. 官方行为基线

- [Vercel project configuration (`cleanUrls`)](https://vercel.com/docs/project-configuration/vercel-json)
- [Vercel limits](https://vercel.com/docs/limits)
- [SvelteKit page options (`trailingSlash`)](https://svelte.dev/docs/kit/page-options#trailingSlash)
- [SvelteKit adapter-static](https://svelte.dev/docs/kit/adapter-static)

核对结果：SvelteKit 默认 `never` 生成 `about.html`；`always` 生成 `about/index.html`。官方
`adapter-static` 文档也明确建议，在 host 不会为 `/a` 提供 `/a.html` 时使用 `always`。

## 8. Gate 与清理状态

| Gate | 状态 | 结论 |
| --- | --- | --- |
| A1 — standalone Function coexistence | **PASS** | Phase 0 的 HTTP 证据保持有效；本轮两个 Variant 均再次完成 bundle/deployment proof。 |
| A2 — extensionless static hosting | **FAIL** | `cleanUrls` 产生不可接受且无效的 per-page overrides；未形成可保留修复。 |
| B — MiHoMo fixtures | **PASS** | 本轮未修改 Phase 0 已验证的数据合同。 |

清理后：

- `vercel.json` 已恢复 baseline，没有保留 `cleanUrls`；
- 临时 `api/player.ts` 已删除；
- 临时 `trailingSlash = 'always'` 已删除；
- 没有 Production deployment、Project Settings、adapter、域名或 DNS 变更；
- 没有 bypass token、正式 BFF、Player route/UI、DTO 或 MiHoMo fetch；
- 没有新增本地 smoke 断言：在尚无可保留托管修复时，本地 Vite 200 断言无法防止本次 Vercel
  hosting regression，容易制造错误安全感。

**Phase 1：NO-GO。** 下一步需要用户决定是否批准一个独立的 trailing-slash URL migration；在该
迁移完成真实 Preview HTTP smoke 前，Gate A2 继续保持 FAIL。
