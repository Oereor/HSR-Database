# Enka Production Cutover

> 日期：2026-09-22  
> 分支：`develop`  
> 范围：Enka production cutover、Player 展示区域适配、MiHoMo runtime 清理  
> 交付边界：未 commit、未 push、未部署

## 1. Executive Summary

`/api/player` 已切换为单一 Enka 数据源。正式链路为：

```text
Enka client
  -> response decoder
  -> canonical profile adapter
  -> Phase 1 stat synthesis / presentation
  -> PlayerProfile DTO
```

生产代码中不再存在 MiHoMo client、parser、provider 分支或 fallback。Player 页面现在按 canonical `display.area` 分为“支援角色”和“星海同行”，卡片、链接、详情选择和 keyed identity 均使用不透明 `buildId`，因此同一 `avatarId` 可以在两个区域各保留一个 Build。

Enka/Player 定向测试、TypeScript、Svelte、messages、changed-file lint/format、普通生产构建和 Preview 等价构建均通过。真实 UID smoke 因本机 `127.0.0.1:7890` 没有监听而按约束跳过；Playwright 回归因缺少其管理的 Chromium，在执行断言前停止。

## 2. Production API Cutover

`api/player.ts` 现在使用模块级 Enka client 单例。单例保留 Enka TTL cache 与 per-UID single-flight；测试可注入独立 client 和日志收集器，避免共享状态。

成功 envelope、错误 envelope、HTTP 状态、`Cache-Control` 与 `Vercel-CDN-Cache-Control` 保持原有公开合同。Enka metadata、raw response、`PropertyType` 与内部 diagnostics 不进入浏览器 DTO。

`avatarDetailList: []` 会返回 HTTP 200、基础玩家资料和空 `characters`，不会被改写为 `PLAYER_NOT_FOUND`。

## 3. Final Runtime Architecture

```text
GET /api/player/?uid=...
  -> validate method/query
  -> module-level createEnkaPlayerClient()
     -> GET https://enka.network/api/hsr/uid/{uid}/
     -> 10s timeout
     -> one retry for transient network/timeout/5xx errors
     -> no retry for 429 or typed non-transient errors
     -> decode + canonical adapter
     -> TTL cache + single-flight
  -> resolveCanonicalPlayerProfile()
     -> synthesizePlayerProfile()
     -> presentCanonicalPlayerProfile()
  -> stable PlayerProfile JSON
```

`parseRetryAfter` 已移动到 provider-neutral `api/_player/errors.ts`。Enka client 不再 import 任何 MiHoMo 文件。

## 4. Player Contract / Mapping

`PlayerCharacter` 做了兼容性的加法扩展：

- 必需 `buildId: string`；
- 必需 `display: { area, position?, sourceOrder }`；
- `PlayerDisplayArea = 'assist' | 'showcase' | 'unknown'` 位于 provider-neutral contract，canonical model 复用该类型。

presentation pipeline 从 canonical Build 原样传递 `buildId` 与 `display`，不向客户端暴露 Enka 原始结构。

`playerCharacterHref` 支持可选 `build` 查询参数。详情解析在显式 `build` 存在时精确匹配 `characterId + buildId`；没有 `build` 时继续返回首个同 ID 角色，兼容旧链接；重复、空或过期的显式 `build` 不会误选其他 Build，而会进入原有静态角色状态。

## 5. Character Display UI

Player 页面按 canonical 顺序过滤为两个数组，没有按角色 ID、稀有度或等级重排。两区均复用 `SectionHeading` 和现有 `CharacterOverviewCard`；未知角色继续使用现有防御性卡片。

卡片 keyed identity 与详情 URL 均使用 `buildId`。`unknown` display occurrence 防御性归入星海同行，并由 API 输出 `display_area_drift` 结构化诊断，避免静默丢失角色。

Hero、属性、光锥、遗器、行迹、评分及详情视觉没有重构；详情页仅增加 Build 选择上下文。

## 6. Support Characters

`display.area === 'assist'` 进入独立“支援角色 / Support Character”区域。

支援区域使用简单 grid：默认窄屏 1 列，`min-width: 821px` 后为 3 列。数据不截断，因此异常地返回超过 3 个支援角色时会继续换行显示。

## 7. Astral Companion Characters

`showcase` 与防御性 `unknown` occurrence 进入独立“星海同行 / Starfaring Companions”区域。

该区域继续复用 `OverviewGrid variant="character"` 和现有响应式角色卡。在宽桌面容器中沿用既有 6-card row，窄屏行为也保持现状；数据不截断。

## 8. Empty / Privacy States

两个区域没有数据时分别显示轻量、本地化 empty-state 文案，不生成占位卡。

存在玩家但没有公开角色时，基础 Player Hero 仍正常展示，两个区域显示各自 empty state。handler 单元测试覆盖了空 `avatarDetailList` 返回 200 的路径。

## 9. Error Handling

公开错误 taxonomy 保持：

- `INVALID_UID` -> 400；
- `PLAYER_NOT_FOUND` -> 404；
- `RATE_LIMITED` -> 429，可携带 `retryAfterSeconds`；
- `UPSTREAM_INVALID_RESPONSE` -> 502；
- `UPSTREAM_UNAVAILABLE` -> 503；
- `UPSTREAM_TIMEOUT` -> 504。

所有错误响应继续使用 `Cache-Control: no-store`。429 不重试；transient network/timeout/5xx 最多重试一次。

结构化日志事件明确区分 `upstream_error`、`rate_limit`、`timeout`、`decode_error`、`unknown_entity`、`synthesis_failure` 与 `display_area_drift`。日志不包含 UID、昵称、签名或 raw build/relic payload。

## 10. Enka Client / Cache Status

以下行为保留并有定向测试覆盖：

- `User-Agent: HSR-Database-PlayerInfo (+https://hsrarchive.cc)`；
- 10 秒默认 timeout；
- transient error 一次 retry；
- 429 不 retry；
- upstream TTL cache；
- 同 UID single-flight；
- `Retry-After` delta-seconds 与 HTTP-date 解析。

## 11. MiHoMo Removal

已删除：

- `api/_player/mihomo.ts`；
- `api/_player/parse.ts`；
- MiHoMo handler/parser/Phase 0 tests；
- `tests/fixtures/mihomo/` 全部 fixture；
- provider comparison 与 MiHoMo-only stat audit scripts；
- `investigate:player-shadow` package script；
- 当前 README、Player 页面与全站 footer 中的 active MiHoMo attribution。

依赖没有 MiHoMo-only package，`pnpm-lock.yaml` 未变化。

## 12. Remaining Historical MiHoMo References

排除历史资料后，对 `api`、`src`、`tests`、`scripts`、README、package files 与 messages 搜索 `mihomo`、`api.mihomo.me`、`sr_info`、`sr_info_parsed`，结果为零。

全仓库剩余命中仅属于以下允许范围：

1. `docs/investigations/` 的历史可行性、Phase 0-4、架构、性能、Enka 迁移与数值审计报告。这些文件准确描述当时的 provider、已执行的验证和历史结论，修改或删除会破坏审计记录。
2. `src/lib/content/changelog/{zh-CN,en}/2026-09-19-player-info-v1.svx`。这是 Player Info v1 发布时的真实更新日志。
3. 本报告本身。它必须记录已删除内容、残留扫描与迁移结论，因此会包含 MiHoMo 字样。

不存在生产 runtime 命中。

## 13. Test Changes

新增或调整的重点覆盖包括：

- handler 请求 Enka endpoint、发送 custom User-Agent 并执行完整 pipeline；
- 400/404/424/429/5xx、timeout、invalid JSON/decode 的稳定映射；
- 空 showcase 返回 profile；
- 同一 avatarId 在 assist/showcase 各保留一张卡；
- Build-aware URL、query 解析、精确详情选择与旧链接兼容；
- 中英文 section heading、分组数量、unknown 防御性分组和 empty state；
- stat synthesis、equipment、component 与 generated runtime 回归。

旧 MiHoMo-specific 测试和 fixture 已删除，未保留双 provider 测试架构。

## 14. Validation Performed

已完成：

- `pnpm install --frozen-lockfile --offline`：通过，无 lockfile 修改；
- messages compile/check：386 messages、2 locales，通过；
- Enka/Player 定向 Vitest：11 files、100 tests，全通过；
- `pnpm check:api`：通过；
- `pnpm check`：通过，Svelte 0 errors / 0 warnings；
- changed-file Prettier check：通过；
- changed-file ESLint：通过；
- `git diff --check`：通过；
- `pnpm build`：通过；
- `pnpm deploy:build:preview`：通过，包含 generated data/assets reuse、Vite production build 与 output smoke；
- 应用内浏览器窄屏检查 `/player/`：页面加载、Enka attribution 正确、无浏览器错误日志；
- active MiHoMo residual scan：零命中；
- `TurnBasedGameData` 与 `StarRailRes` 工作区：无改动。

## 15. Validation Skipped / Environment Limitations

1. **Live smoke 未执行。** `127.0.0.1:7890` 没有监听。按照约束，没有改用直连、没有循环请求、没有保存 raw profile。
2. **Playwright E2E 未执行到断言。** 首次由 webServer 构建等待超时；复用已构建产物后，Playwright 报其管理的 Chromium executable 缺失。未为此下载浏览器或改动生产代码。
3. **完整 test suite 未运行。** 定向测试、类型检查、Svelte 检查、lint/format 与两种构建已覆盖本次风险面。
4. **真实 Vercel Preview 未创建。** 本轮明确不部署，因此未取得远端 Function inspect、cold start 或真实 Enka egress 证据。

## 16. Build / Bundle Notes

Preview 等价构建成功，输出 7,235 files、401,368,335 bytes（382.77 MiB），output smoke 验证 `404.html`、`en/index.html`、`index.html` 均存在。

Player 页面 server entry 为 46.06 kB；client Player node 为 108.86 kB。`runtime/player.json` 为 566,165 bytes，仍低于既有 600 KB generation-test 上限。

为估算 production Function 影响，使用与当前 Node 目标一致的 esbuild 对 `api/player.ts` 做了单入口临时 bundle（包含 `runtime/player.json`）：621,533 bytes raw、46,368 bytes gzip。临时文件测量后已删除。这是源码 bundle 估算，不等同于 Vercel 最终 `.func` 封装体积；最终值应在 Preview inspect 中记录。

## 17. Vercel Preview Manual Acceptance Checklist

部署 Preview 后按以下清单人工验收：

- [ ] 正常公开 UID：Player Hero、记录、支援角色与星海同行均可加载；
- [ ] 重复角色：同一 avatarId 在两个区域各显示一张卡，链接包含不同 `build`；
- [ ] 详情数据：分别打开两个 Build，确认属性、光锥、遗器、行迹和星魂属于对应 Build；
- [ ] 旧链接：仅含 `uid` 的角色链接仍选择首个相同 characterId；
- [ ] 过期 Build：显式无效 `build` 回退静态角色状态，不误选其他 Build；
- [ ] 桌面布局：支援角色 3 列、星海同行宽屏 6-card row；
- [ ] 窄屏布局：支援角色 1 列，星海同行沿用现有响应式 fallback；
- [ ] 中文与英文：标题、empty state 与 Enka attribution 正确；
- [ ] invalid UID：400 对应的前端错误状态；
- [ ] nonexistent UID：404 对应的前端错误状态；
- [ ] empty/private showcase：基础 profile 仍显示，空区域没有占位卡；
- [ ] 限流/上游异常：公开 envelope、状态码与 no-store header 稳定；
- [ ] Vercel inspect：只有预期的 `api/player` Function，记录最终 bundle 大小；
- [ ] Function logs：事件 taxonomy 正确，且不出现 UID、昵称、签名或 raw payload。

## 18. Remaining Risks

- 尚未在真实 Vercel serverless 网络环境验证 Enka TLS、egress、timeout、rate limit 与 User-Agent 接受情况；
- 尚未取得真实 UID 的重复 Build 样本进行端到端人工确认；
- Playwright 浏览器运行时缺失，响应式与详情交互仍需 Preview 人工验收；
- Enka schema 新实体可能产生 `unknown_entity` / `synthesis_failure`；当前实现会保留角色并记录克制诊断，但仍需要运营观察；
- 本地 esbuild 数字不是 Vercel `.func` 的最终尺寸。

这些风险不构成提交到 Vercel Preview 进行人工验收的代码 blocker。

## 19. Final Recommendation

建议现在部署 Vercel Preview，按第 17 节完成真实网络、重复 Build、响应式布局和 Function inspect 验收；通过后再决定 Production 发布。

### 对迁移文档 25 个问题的直接回答

1. **`/api/player` 是否已经完全切换至 Enka？** 是。
2. **Production runtime 是否还会请求 MiHoMo？** 不会。
3. **MiHoMo fallback 是否已经不存在？** 是，不存在 provider fallback 或开关。
4. **MiHoMo HTTP client 是否已删除？** 是。
5. **MiHoMo parser 是否已删除？** 是。
6. **MiHoMo-only types/config/tests 是否已清理？** 是；历史文档和真实 changelog 除外。
7. **`_flat` 是否仍不是 runtime dependency？** 是；runtime 只使用生成的 `runtime/player.json`。
8. **stat synthesis 是否继续使用 Phase 1 正式实现？** 是，handler 调用 `resolveCanonicalPlayerProfile`，复用正式 synthesis/presentation pipeline。
9. **支援角色是否独立 section？** 是。
10. **`_assist=true` 是否进入支援角色？** 是；adapter 将其映射为 `display.area = 'assist'`。
11. **星海同行角色是否独立 section？** 是。
12. **是否允许同 avatarId 同时存在于两个 section？** 是；`buildId` 是 key、URL 与详情选择身份。
13. **支援角色桌面是否 3-column、窄屏是否 1-column？** 是。
14. **星海同行桌面是否采用 6-card row，并复用现有 Character Overview responsive grid？** 是；复用 `OverviewGrid variant="character"`，最终像素级行为待 Preview 人工验收。
15. **Character Detail UI 是否保持原样？** 是；仅新增 Build-aware 数据选择和 keyed context。
16. **玩家存在但没有公开角色时是否还能正常显示 profile？** 是，返回 200 并显示基础资料与 empty states。
17. **公开错误状态是否仍然稳定？** 是。
18. **Enka TTL/cache/single-flight 是否保持？** 是，模块级 client 单例保留全部行为。
19. **是否进行了 live smoke？如果没有，为什么？** 没有；本地代理端口 7890 未监听，按约束立即停止该验证路径。
20. **进行网络访问时是否使用了 `127.0.0.1:7890`？** 本轮没有发出 Enka 网络请求；未绕过指定代理。
21. **运行了哪些测试？** 11-file/100-test Enka/Player Vitest、messages、API/scripts/Svelte TypeScript、changed-file lint/format、普通 build、Preview 等价 build、浏览器窄屏 smoke 与残留扫描。
22. **哪些测试因环境限制被跳过？** 真实 UID live smoke、Playwright E2E 断言、远端 Vercel Preview/Function inspect 和完整 test suite。
23. **是否存在任何阻止部署 Vercel Preview 人工验收的已知 blocker？** 没有已知代码 blocker。
24. **全仓库还剩哪些 MiHoMo 相关命中，为什么保留？** 仅历史 investigation reports、2026-09-19 Player Info v1 双语 changelog 和本迁移报告；它们是审计/发布历史，不参与 runtime。
25. **是否建议用户现在部署 Preview 进行最终验收？** 是。
