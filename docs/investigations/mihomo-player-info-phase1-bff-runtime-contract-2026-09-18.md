# MiHoMo Player Info Phase 1：BFF 与 Runtime Contract 实施报告

> 日期：2026-09-18  
> 分支：`develop`  
> 范围：standalone `/api/player/` Function、MiHoMo fetch、runtime validation、窄 DTO、错误与缓存、fixtures、测试、Preview 证据  
> 不包含：Player UI、local resolver、浏览器 cache、Phase 2/3

## 1. Executive Summary

Phase 1 的源码、runtime contract、测试与 Vercel Function 已实施完成：

- 正式 endpoint 为 `GET /api/player/?uid={uid}`；
- 使用 Vercel Web Standard `export default { fetch(request) }`；
- 只产生一个 `api/player.func`，没有额外 helper Functions；
- MiHoMo 响应经过手写 runtime guards 和最小 DTO 投影，不透传 raw response；
- UID、timeout、User-Agent、错误归一化、cache headers 和 process-local in-flight dedupe 均有单测；
- `pnpm check`、50 files / 523 tests、静态 build、2,152 条页面路由验证、CI smoke 5/5 和 Vercel Preview build 均通过；
- 最终 Preview deployment `dpl_7p8SUi4xjBCQzaWMkiLAGXjn7k8A` 为 READY，远端只列出一个 14.07 KB 的 `api/player` Function；
- 真实 MiHoMo 响应成功投影为窄 DTO，检查时有 6 个公开角色且无禁用字段。

最终状态仍为 **Phase 1 FAIL / 待人工闭合 Preview HTTP Gate**。Deployment Protection 阻止了不使用 bypass 的完整 wire-level matrix。一次 `vercel curl` 自动生成了 automation bypass，完成无 UID 请求后已立即撤销，并通过 Vercel API 确认剩余 automation bypass 数量为 0。本轮不保留 bypass、不修改 Protection，也不把未执行的 Preview GET/POST/live matrix 写成 PASS。

## 2. Files Added / Changed

新增 runtime：

- `api/player.ts`
- `api/_player/contract.ts`
- `api/_player/errors.ts`
- `api/_player/mihomo.ts`
- `api/_player/parse.ts`

新增验证资产：

- `tests/fixtures/mihomo/phase1-player-response.synthetic.json`
- `tests/fixtures/mihomo/phase1-queue-timeout.synthetic.json`
- `tests/fixtures/mihomo/phase1-rate-limit.synthetic.json`
- `tests/unit/mihomo-player-parser.test.ts`
- `tests/unit/mihomo-player-handler.test.ts`
- `tsconfig.api.json`

修改 `package.json`：增加 `check:api`，并将其接入现有 `pnpm check`。没有修改 `vercel.json`、SvelteKit adapter、路由、UI、静态数据或依赖。

## 3. Public API Contract

Canonical endpoint：

```text
GET /api/player/?uid=100000001
```

UID 必须恰有一个 query value，trim 后非空且只含十进制数字；始终以 string 处理，不限制长度。

成功响应：

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Cache-Control: public, max-age=0, must-revalidate
Vercel-CDN-Cache-Control: public, s-maxage=300, stale-while-revalidate=600
```

示意 body：

```json
{
  "uid": "100000001",
  "nickname": "Synthetic Player",
  "level": 70,
  "worldLevel": 6,
  "avatar": { "id": "200001", "icon": "icon/avatar/200001.png" },
  "signature": "Synthetic fixture only",
  "characterCount": 42,
  "lightConeCount": 57,
  "achievementCount": 888,
  "characters": []
}
```

非 GET 返回 405、`Allow: GET`、`Cache-Control: no-store` 和同形 JSON error：

```json
{ "error": { "code": "METHOD_NOT_ALLOWED", "retryable": false } }
```

`/api/player` 的 308 → `/api/player/` 继续由 Vercel trailing-slash 规则负责，Function 不自行重定向。

## 4. Minimal DTO

`PlayerProfile` 仅保留：

- 玩家 UID、nickname、level、worldLevel、nullable avatar、signature；
- nullable character/light-cone/achievement counts；
- 公开角色的 ID、养成、skill tree、nullable light cone、relics 和 stats。

角色 DTO 不包含 name、rarity、icon、preview、portrait、path、element、描述、rank icons 或 slot 语义。光锥不包含静态 metadata。遗器不包含实例 ID、name、set name、rarity、icon、numeric value 或 step。`skills`、`properties`、`relic_sets` 完全舍弃。

## 5. Upstream Projection Rules

- `space_info.avatar_count -> characterCount`
- `space_info.light_cone_count -> lightConeCount`
- `space_info.achievement_count -> achievementCount`
- `characters[].id -> characterId`
- 缺失 `enhanced` 默认 `false`
- `skill_trees[]` 只投影 `id + level`，保留顺序和 `level: 0`
- `light_cone.id -> lightConeId`
- `relic.set_id -> setId`
- `relic.sub_affix[].count` 原样保留，包括 0
- stats 顺序由 `statistics` 决定，`attributes` / `additions` 按 `field` join；重复 join source 稳定保留第一条
- duplicate character ID 稳定保留第一条，不进行复杂 merge

所有 stats 数值来自上游 `display` string；numeric `value` 不进入 DTO。

## 6. Validation Strategy

入口类型为 `unknown`，只对投影需要的 branch 和字段进行手写 guard：

- object / array / string / boolean 必须类型正确；
- 等级、rank、promotion 和 count 必须是非负整数；
- relic type 必须为整数 `1..6`；
- `avatar`、`space_info`、`light_cone`、`main_affix` 可缺失或 null；
- `attributes` / `additions` 缺失时视为空 join source，存在时 item 必须有效；
- optional branch 存在但 projected field 类型错误时拒绝整个响应；
- 未知额外字段和未知静态 ID 不导致失败。

没有引入 Zod、Valibot、Joi、Ajv 或完整 MiHoMo schema mirror。

## 7. Error Mapping

| Error code | HTTP | Retryable | Source |
| --- | ---: | --- | --- |
| `INVALID_UID` | 400 | false | 缺失、空、非数字或重复 UID |
| `PLAYER_NOT_FOUND` | 404 | false | upstream 404 |
| `RATE_LIMITED` | 429 | true | upstream 429 |
| `UPSTREAM_TIMEOUT` | 504 | true | AbortError、本地 10 秒 timeout 或 queue timeout body |
| `UPSTREAM_UNAVAILABLE` | 503 | true | network failure、普通 5xx 或其他非成功 status |
| `UPSTREAM_INVALID_RESPONSE` | 502 | true | 200 invalid JSON 或 projected schema 错误 |

`Retry-After` 支持非负秒数和 HTTP-date。所有错误设置 `Cache-Control: no-store`，不包含 raw body、exception message、stack 或上游 support URL。

## 8. Timeout / User-Agent

每次 upstream request 固定为：

```text
GET https://api.mihomo.me/sr_info_parsed/{encodedUid}?version=v2&language=cn
User-Agent: HSR-Database-PlayerInfo/1.0 (+https://hsrarchive.cc)
Accept: application/json
```

使用 10 秒 `AbortController`；不设置 force update、不 retry、不转发浏览器 cookies 或 arbitrary headers。

## 9. Cache Strategy

成功：

```http
Cache-Control: public, max-age=0, must-revalidate
Vercel-CDN-Cache-Control: public, s-maxage=300, stale-while-revalidate=600
```

失败：

```http
Cache-Control: no-store
```

同一 warm instance 内使用 `Map<string, Promise<PlayerProfile>>` 合并相同 UID 的并发请求。Promise 无论成功或失败都会在 settle 后删除；它不是 durable/global cache。

## 10. Fixture Coverage

继续复用 Phase 0 的真实、去隐私化 progression fixtures；Phase 1 synthetic fixture 覆盖：

- 普通/忆灵 progression、inactive level 0、enhanced true 与 enhanced 缺失；
- avatar/space info/light cone/main affix nullable 行为；
- unknown character/light-cone/relic/property IDs；
- sub-affix count 0；
- stats 非 index 顺序 join、missing base/addition、display string；
- duplicate character、unknown fields 和 malformed projected fields；
- queue timeout 与 rate-limit bodies。

fixtures 不包含真实 UID、nickname、signature、token、cookie 或完整私人 account response。

## 11. Test Results

| Check | Result |
| --- | --- |
| targeted MiHoMo parser/handler/Phase 0 | PASS，3 files / 35 tests |
| `pnpm check` | PASS，0 errors / 0 warnings；包含 `check:api` |
| `pnpm test -- --reporter=verbose` | PASS，50 files / 523 tests |
| targeted Prettier / ESLint | PASS |
| `pnpm build` | PASS |
| `pnpm deploy:verify:routes` | PASS，2,152 public page indexes |
| CI smoke | PASS，5/5；使用本机 4317 端口和既有 Chromium |
| `vercel build --target=preview`，CLI 59.16.0 | PASS |

默认 `pnpm test:e2e:smoke` 仍因 Windows 保留 4173 端口在 server 启动前 `EACCES`；使用忽略目录中的临时 config 改为 4317 后同一组测试 5/5 PASS，临时 config 已删除。

全仓 `pnpm lint` 仍因任务前已有的同一组 15 个未修改文件的 Prettier 格式失败；本轮全部新增/修改文件的 targeted Prettier 和 ESLint 均通过，没有批量格式化无关文件。

## 12. Vercel Function Bundle Audit

本地 `.vercel/output`：

- routes：9
- overrides：0
- Functions：1，`api/player.func`
- runtime：`nodejs24.x`
- architecture：`x86_64`
- handler：`api/player.js`
- bundle：40,442 bytes，包含 source maps 与 package metadata

runtime files 只有：

```text
api/player.js
api/_player/errors.js
api/_player/mihomo.js
api/_player/parse.js
对应 source maps
.vc-config.json
package.json
```

`contract.ts` 为纯类型，编译后不产生 runtime file。bundle 未包含 `TurnBasedGameData`、`StarRailRes`、generated catalogs、Svelte components、browser bundle 或大型 JSON。

最终远端 Preview inspect 列出唯一 Function：`api/player`，14.07 KB，region `iad1`。

## 13. Preview Validation

- Deployment ID：`dpl_7p8SUi4xjBCQzaWMkiLAGXjn7k8A`
- Preview：`https://hsr-database-3jgzu8n6r-oereo-studio.vercel.app`
- Inspector：`https://vercel.com/oereo-studio/hsr-database/7p8SUi4xjBCQzaWMkiLAGXjn7k8A`
- Target / state：`preview` / READY
- Production：未部署、未 promote
- Project Settings / Protection：未修改

前一份同实现 Preview `dpl_A41kNtzWTLwrM8sGfSrx4hw9hKkj` 已取得以下真实 wire evidence；最终 deployment 在 safe-integer 边界加固后重新构建和部署，但因不再创建 bypass，尚未重复该请求：

```text
GET /api/player/
-> 400
-> Content-Type: application/json; charset=utf-8
-> Cache-Control: no-store
-> {"error":{"code":"INVALID_UID","retryable":false}}
```

该响应证明 Web `default.fetch` export 在真实 Vercel runtime 中被正确执行；没有重现 Phase 0.6 错误 default function export 的 504。

未闭合的 Preview 项目：

- `/api/player -> 308 -> /api/player/`
- valid UID GET 200 与 success cache headers
- POST 405 + `Allow: GET`
- 中文/英文静态页面真实 document 200
- 缺失路径真实 404
- Function log 无 unhandled exception

Deployment Protection 阻止无 bypass 的独立 HTTP 客户端。Codex in-app browser 对该受保护 deployment 返回 `ERR_BLOCKED_BY_CLIENT`。因此没有将 build route 规则、单测或浏览器不可达结果替代为 wire PASS。

## 14. Live MiHoMo Smoke

通过 `127.0.0.1:7890` 本地代理请求 MiHoMo parsed V2，并把响应仅在内存中交给实际 Vercel bundle 内的 `parsePlayerProfile`：

- upstream：200
- projected characters：6
- 顶层 DTO keys 与正式 `PlayerProfile` 一致
- static/forbidden fields：0
- 未输出或保存 UID、nickname、signature 或 raw response

该结果证明当前 live schema 可以通过 runtime guards 和窄投影，但它不是受保护 Preview endpoint 的 end-to-end 200 证据。

## 15. Known Limitations

- 完整 Preview HTTP matrix 仍需用户在现有已认证会话中人工完成，或提供不要求创建 automation bypass 的认证 HTTP 方式。
- `METHOD_NOT_ALLOWED` 只用于 endpoint method error；正式 `PlayerErrorCode` 仍保持六个 UID/upstream 错误码。
- CDN cache 与 process-local dedupe 不保证跨 region、跨 instance 或持久缓存。
- Phase 1 不解析本地 Character、Light Cone、Relic 或 affix metadata。

## 16. Phase 2 Recommendation

**当前不建议进入 Phase 2。** 先闭合上述 Preview GET redirect、valid GET、POST、static page 和 404 的 wire matrix。其余 Phase 1 源码、测试、bundle 与 direct live projection 已具备进入人工验收的条件。

本轮没有修改 Player UI，也不会自动继续实现 Phase 2。
