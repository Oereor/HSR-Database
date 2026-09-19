# MiHoMo Player Info Phase 2 — Player Overview 实施报告

日期：2026-09-18  
分支：`develop`  
结论：**PASS（浏览器自动化因本机端口权限阻塞，保留一项人工验证）**

## 1. Executive Summary

Phase 2 已完成 Player Info 的第一条前端 vertical slice。网站新增 `/player/` 与 `/en/player/` 静态页面，浏览器根据 URL 中唯一的 `uid` 参数请求同源 `/api/player/`，并展示 Player Hero、公开角色列表及保留 UID 的角色链接。

实现保持了 Phase 1 的 HTTP wire contract 与现有静态部署架构：构建只预渲染页面 shell 和本地 Character catalog，不在构建期间访问 BFF 或 MiHoMo。Player-aware Character Detail、玩家装备/遗器详情和远程 Preview 验收均未进入本阶段。

## 2. Files Changed

主要变更分为以下几组：

- 共享合同与 API 边界：`src/lib/player/contract.ts`、`api/_player/*`、`api/player.ts`
- 浏览器 client/cache/resolver：`src/lib/player/client.ts`、`cache.ts`、`resolve.ts`
- Player 页面与组件：`src/routes/player/*`、`src/lib/components/player/*`
- 本地头像资产：`scripts/assets/*`、`src/lib/data/visual-assets.ts`、`src/lib/domain/visual-assets.ts`
- 路由、部署与导航：`scripts/data/*`、`scripts/deployment/prepare.ts`、`src/lib/navigation.ts`
- Site Messages：`messages/contracts.json`、`messages/zh-CN.json`、`messages/en.json`
- 定向验证：`tests/unit/player-*.test.ts`、相关 navigation/localization/visual-assets tests、`tests/e2e/player.spec.ts`

Phase 1 的 `api/_player/contract.ts` 已删除，由单一共享合同替代。没有新增生产依赖，也没有修改 Player Character Detail。

## 3. Shared Contract Arrangement

`PlayerProfile`、Player Character/Light Cone/Relic/Stat DTO、`PlayerErrorCode` 和错误 envelope 统一位于纯 TypeScript 文件 `src/lib/player/contract.ts`。

浏览器通过普通 type-only import 使用该合同；standalone Function 通过相对路径 type-only import 使用同一来源，因此不会把 Svelte runtime、浏览器模块或 `$lib` alias 引入 Function bundle。API 专属的 `MiHoMoDependencies` 保留在 `api/_player/mihomo.ts`。

Phase 1 的 canonical endpoint、成功 DTO 和错误 code 未改变：

```text
GET /api/player/?uid={uid}
```

## 4. Player Client / Cache

`fetchPlayerProfile(uid)` 固定访问同源 `/api/player/?uid=...`。表单与 client 都会 trim UID，并要求非空、纯数字，不限制位数。

Client 将错误收敛为 `PlayerApiError`：

- 浏览器网络故障：`UPSTREAM_UNAVAILABLE`
- 非法 JSON 或非法错误 envelope：`UPSTREAM_INVALID_RESPONSE`
- 合法错误 envelope：只使用共享的 `code`、`retryable` 和可选 `retryAfterSeconds`
- 页面只将错误 code 映射为本地 Site Message，不展示 raw server text

默认 client 使用模块级内存缓存：

- 成功结果 TTL 为五分钟
- 同 UID 并发请求由 in-flight Promise Map 去重
- 过期结果立即重取
- 失败不进入成功缓存
- 不使用 `sessionStorage`、`localStorage` 或 IndexedDB

`createPlayerProfileClient` 支持注入 `fetch`、时钟和 TTL，便于隔离测试。

## 5. Avatar Pipeline / Resolver

实际 `AvatarPlayerIcon.json` 共 93 条记录，其中 83 条 `Avatar`、10 条 `Hero`。实现以 `ID` 作为 Player avatar identity，并严格接受以下 `ImagePath` 结构：

```text
SpriteOutput/AvatarRoundIcon/Avatar/<basename>.png
```

93 个 basename 均可唯一映射到 `StarRailRes/icon/avatar/<basename>`，源图片均存在。资产管线只复制这 93 个实际需求文件，输出为：

```text
/generated-assets/player-avatars/{avatarId}.png
```

Visual Asset Manifest schema 从 15 升至 16，并将 `playerAvatars` 纳入 requirement fingerprint、fallback、文件闭包、尺寸统计和缺图验证。部署 sparse checkout 增加 `icon/avatar/`；导航图标复用已有 `FriendIcon.png`。

`resolvePlayerAvatar(id)` 只返回 manifest 中确认可用的本地 URL。`null`、未知 ID、manifest 缺图或浏览器图片加载失败均显示本地占位符，不使用 MiHoMo 返回的远程 `avatar.icon`。

资产同步结果：93 个 Player avatar，0 缺失，约 2.78 MiB。

## 6. Character Resolver

Player 页面 server load 直接读取当前 locale 的既有 Character catalog。浏览器建立 `characterId -> CatalogEntry` Map，再按 BFF 原始 `characters[]` 顺序解析，不重新排序，也不复制 Character 静态数据到 Player DTO。

已知角色复用 `CharacterOverviewCard` 和本地 preview；未知角色保留在列表中，显示不可点击的轻量卡片“未知角色 / ID …”，避免静默丢失或跳转到必然 404 的详情页。

统一链接 helper 输出：

```text
/characters/{id}/?uid={uid}
/en/characters/{id}/?uid={uid}
```

locale、query 与 trailing slash 均由现有 routing helper 保证。

## 7. `/player/` State Flow

当前 URL 是查询状态的唯一来源：

- 无 `uid`：idle
- 空值、非数字或重复 `uid`：本地 `INVALID_UID`，不发请求
- 合法 `uid`：loading -> success/error
- 表单提交先 `goto()` 到 locale-aware canonical URL，再由统一 reactive flow 发请求
- back/forward 重新读取 URL，并可命中模块缓存
- 同 URL 可重试；失败不会被缓存
- UID 切换时立即清空旧 profile，避免把旧 Hero 误认为新 UID
- 请求序号会忽略迟到响应，避免跨 UID race

`/player/` 已加入 canonical route inventory。canonical routes 从 1,076 增至 1,077；两个 locale 共生成 2,154 个 public page indexes。

## 8. Player Hero

Player Hero 展示：

- 本地玩家头像
- nickname
- 开拓等级
- 均衡等级
- signature
- UID
- 角色数
- 光锥数
- 成就数

`null` count 显示 `-`，与真实 `0` 区分。签名保留换行并允许长文本安全折行；空签名显示 `-`。

桌面布局为身份区与统计区横排；窄屏改为上下排列，三个统计项仍保持三列，并通过 `minmax(0, 1fr)` 和断行规则避免横向滚动。

## 9. Public Character Cards

成功态始终保留 Hero，并显示“公开角色”区域。非空列表按 BFF 顺序渲染已知/未知角色；零角色显示局部 empty state，不把整个查询视为错误。

Phase 2 不区分支援角色与星海同行，也不向 `CharacterOverviewCard` 注入等级、星魂或装备等 Player-only 状态。

## 10. Unknown / Missing Fallbacks

本阶段的降级边界如下：

- 未知、空或加载失败的 Player avatar：本地可访问占位符
- 未知 Character ID：不可点击的 ID 卡片
- `null` account count：`-`
- 空 signature：`-`
- 零公开角色：Hero 下方局部 empty state
- API 错误：稳定、本地化、无 raw server detail 的状态文案
- manifest 缺图：resolver 返回 `null`，不产生 broken remote image

## 11. i18n / Responsive / Accessibility

Player 导航位于“总览 / Overview”之后，中文为“玩家信息”，英文为“Player Info”。页面标题、说明、表单、状态、错误、统计、图片 alt、占位说明、未知角色与空态文案均已加入 zh-CN/en Site Messages。

locale switch 的 query preservation 已由 routing test 覆盖。表单具有可见 label、`inputmode="numeric"`、关联 validation message、键盘提交与 loading disabled 状态；loading/error 使用轻量 `aria-live`，Hero 统计使用语义化 description list，头像和占位符均具有可访问名称。

## 12. Targeted Tests

已通过的定向测试：

- Player client、resolver、components、navigation、localization 与 Phase 1 handler：7 个 test files，54 tests passed
- Visual asset pipeline：1 个 test file，24 tests passed
- 合计：78 targeted tests passed

覆盖包括 canonical endpoint、成功 DTO、typed error、Retry-After、malformed response、network fallback、in-flight dedupe、cache hit/expiry、93 条 authoritative avatar mapping、本地缺图降级、已知/未知 Character、locale-aware href、Hero null counts、表单 a11y、导航顺序与 locale query preservation。

另已通过：

- targeted Prettier
- targeted ESLint
- `pnpm messages:check`：357 messages × 2 locales
- `pnpm assets:verify`
- `pnpm check`：0 errors / 0 warnings

## 13. Build Validation

以下验证均通过：

- `pnpm build`
- `pnpm deploy:verify:routes`
- route verifier：2,154 public page indexes and internal links
- `build/player/index.html` 存在
- `build/en/player/index.html` 存在
- 静态产物具有正确的 locale metadata 与 Player navigation
- 静态 HTML/JS 未发现 `api.mihomo.me` 或 fixture 中的远程 avatar URL

因此构建期间不会请求 MiHoMo 或 `/api/player/`，MiHoMo 可用性不会阻塞静态 build/deploy。

## 14. Deferred Manual / Preview Validation

仅 Player Playwright spec 的 desktop/mobile 运行未完成。启动既有固定端口 `127.0.0.1:4173` 时，Windows 返回：

```text
listen EACCES: permission denied 127.0.0.1:4173
```

按照本阶段的外部阻塞纪律，该验证分支只尝试一次，未改端口、未改配置，也未启动 remote Preview deployment。

后续人工验收只需在可用的 Vercel runtime 或可绑定该端口的本地环境中运行 `tests/e2e/player.spec.ts`，确认：

1. desktop/mobile 的提交、loading、Hero 与 known/unknown cards；
2. 英文 locale 的 URL/link；
3. back/forward 的 cache reuse；
4. 图片加载失败时的占位符；
5. 窄屏无横向滚动。

## 15. Known Limitations

- 页面刷新会清空 module-level cache，这是预期行为。
- 完整 live same-origin BFF flow 留待 Vercel runtime 人工验收；Phase 1 wire contract 未在本阶段重复部署验证。
- Character Detail 当前只保留 `uid` query，不读取或展示 Player state。
- Player progression、技能树、光锥、遗器与 stats 已在共享 DTO 中保留，但 Overview 不展示这些详情。
- 未实现 UID history、账户系统、收藏、Player Endgame 或 build score。

## 16. Repository Integrity and Phase 3 Recommendation

收尾检查确认：

- 网站仓库分支：`develop`
- `TurnBasedGameData` 工作树干净，HEAD 为 `4ce30f69b32dc259ab9a8da3ba57035485103221`
- `StarRailRes` 工作树干净，HEAD 为 `d226befe3db13f2ec15f4161d5f34b1b607643fe`
- 两个 sibling upstream 均未被修改
- 未执行 remote Preview deployment

Phase 2 的代码、资产、i18n、定向测试、类型检查、生产构建和路由验证均满足完成条件，因此结论为 **PASS**。建议在完成上述单项浏览器人工验收后进入 Phase 3；Phase 3 应让 Character Detail 消费已保留的 `uid`，并复用本阶段的 shared contract、client cache 和 resolver，不应重新建立第二套 Player fetch/cache。
