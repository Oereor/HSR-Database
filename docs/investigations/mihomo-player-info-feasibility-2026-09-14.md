# MiHoMo Player Info 架构兼容性调查

调查日期：2026-09-14  
调查范围：只读代码/数据审计、官方文档核对、实时 HTTP 探测、现有构建产物测量；未实现 Player Info，未修改 adapter、导航或生产 UI。

## 1. Executive Summary

**结论：推荐加入 Player Info，但应作为与现有静态数据库隔离的、可失败的 runtime layer 实施。总体成本为 Medium。**

当前 HSR-Database 是完整的 `adapter-static` 全量预渲染站，不具备运行时 SvelteKit endpoint。MiHoMo 当前也不允许浏览器跨域读取：本次带 `Origin` 的实际 GET 响应没有 `Access-Control-Allow-Origin`，OPTIONS 预检返回 `405`，浏览器同时不能可靠设置官方希望携带的应用级 `User-Agent`。因此 Browser → MiHoMo 不可作为生产方案。

推荐第一版保持 `/player` 为双语静态页面，用 `/player?uid=...` 表示查询；运行时通过一个**极薄、与 SvelteKit 静态数据完全断开的 Vercel 原生 Function/BFF**访问 MiHoMo。这样可以保留 `adapter-static`、现有 `build/`、全部 prerender 页面及 pinned-upstream 构建流程。Function 只负责 UID 校验、MiHoMo v2 请求、超时、响应校验、错误归一化和 CDN 缓存，不得 import 当前 catalog、generated manifest、asset manifest、TurnBasedGameData 或 StarRailRes。

若产品更重视框架可移植性，可改用 `adapter-vercel` + `src/routes/api/player/[uid]/+server.ts`；既有 `prerender=true` 页面仍可静态输出，但该方案会改变最终产物目录和部署验证链，需要调整 `deploy:build`/`deploy:verify`，改造面显著大于原生 Function。**不推荐为了 Player Info 使用 `+page.server.ts`/SSR。**

数据映射不是主要阻碍：Character、Light Cone、Relic Set、Path、Element 的 ID 域与当前 pinned upstream 一致，可靠性高。真正需要适配的是：

- `relic.id` 是玩家装备实例所用的 relic TID，与当前页面的本地 piece ID 不同，应以 `(set_id, type/slot)` 关联；
- MiHoMo `skills` 包含当前网站有意隐藏或未投影的技能变体；
- `skill_trees` 同时承载技能升级点和普通行迹，不能只 join 当前 `Trace[]`；
- `property.type` 比当前 `RelicProperty` 目录更宽，并会受版本差影响；
- 玩家头像 ID 当前没有本地 resolver。

最大长期风险不是 Vercel 体积，而是第三方 API 的 schema/可用性、未公布的 rate limit，以及 MiHoMo 与本地 pinned upstream 的版本错位。通过独立 DTO → normalize → runtime domain → local view model 边界、未知 ID fallback 和薄 Function，可以把这些风险限制在 Player Info 内，不影响其他一级功能。

## 2. Investigation Method and Evidence

本报告按以下优先级取证：当前代码和实际生成物 → pinned upstream/生成数据 → MiHoMo/March7th 官方文档与 OpenAPI → 实时 API 探测 → 历史文档。

本次完成的实测包括：

- 当前分支为 `develop`；调查开始时 HSR-Database、TurnBasedGameData、StarRailRes 均无未提交改动。
- 检查所有 route option、server load、endpoint、部署脚本、Vercel/GitHub 配置和生成数据 loader。
- 测量现有 `build/`：7,126 个文件、394,626,989 bytes；这是调查时已有的当前构建产物，不把它冒充为一次 cold build。
- 对官方客户端文档采用的公开样例 UID `800333171` 请求 `sr_info_parsed` v2，并比对当前 `en` catalog/detail 数据。
- 实测合法请求、非法 UID、未知 UID、带 Origin 的简单 GET 和 CORS preflight。
- 临时 HTTP 探针在调查后已删除，没有保留功能性实验代码。

证据等级：本文的“实测”表示本次直接观察；“代码确认”表示由当前仓库生效代码得出；“文档确认”表示官方页面明确说明；未被官方说明或实测覆盖的行为会标为建议或待验证。

## 3. Current Architecture

### 3.1 生效的部署模型

当前模型是：

```text
adapter-static + 根 layout prerender=true + 显式 route entries
    → 全站 build-time server load
    → build/ 中的 HTML、__data.json、JS/CSS 和本地资源
    → Vercel 静态 CDN
```

这不是 `adapter-vercel + 全站 prerender`，也不是 mixed rendering。

关键事实：

- `svelte.config.js` 直接 import `@sveltejs/adapter-static`，配置 `fallback: '404.html'`。
- `kit.prerender.entries` 为 `['*', ...publicEntries]`；`publicEntries` 来自生成 manifest 的全部 route path × `zh-CN`/`en`。
- 根 `src/routes/+layout.server.ts` 导出 `prerender = true`，并在构建时从 `$lib/server/generated` 读取站点版本。
- 当前所有 `+page.server.ts` 都是 build-time server load；全部动态参数 route 都提供 `entries()`。
- 现有 `+server.ts` 只有 sitemap、robots 和 endgame occurrence JSON 等**可预渲染 endpoint**；它们均为 `prerender = true`。
- 没有任何运行时 `+server.ts`、`+page.server.ts` 或 server action。
- 当前锁文件实际解析到 SvelteKit 2.70.3、Svelte 5.57.0、adapter-static 3.0.10、Vite 7.2.4。

`.svelte-kit/output/server` 是 SvelteKit 构建中间物，不是部署时的 runtime server。最终 `build/` 顶层只有静态目录与文件，没有 Function 或 `.vercel/output/functions`。

### 3.2 `pnpm deploy:build`

生效流程由 `scripts/deployment/build.ts` 编排：

```text
读取 upstream.lock.json
  ├─ messages/script checks
  ├─ 准备 pinned TurnBasedGameData
  └─ 准备 pinned StarRailRes
        ↓
data ensure/validate + asset ensure/verify
        ↓
svelte-kit sync + vite build
        ↓
deploy:verify 扫描 build/ 的资源引用闭包
```

`upstream.lock.json` 当前固定 TurnBasedGameData commit `8dc7843...` 与 StarRailRes commit `d226bef...`。两个上游只参与构建；运行时浏览器读取生成 JSON、HTML 和 `/generated-assets/*`，不访问 sibling repo。

`VERCEL_ENV=production` 使用 `production-ci-backed` 模式，只编译 messages，假定 GitHub CI 已做完整 correctness；Preview/未识别环境执行更完整的 script/search-name 检查。`vercel.json` 仅允许 `main` 自动部署，其他分支默认不创建 Vercel deployment；PR correctness 由 `.github/workflows/ci.yml` 承担。

### 3.3 当前能否原样增加 runtime endpoint？

不能。动态 UID 不可能在构建期枚举并预渲染。`adapter-static` 的职责是输出静态文件；即使借助 SPA fallback 绕过 strict 检查，也不会凭空产生可以执行 GET handler 的 runtime。SvelteKit 官方也明确说明：若只预渲染部分页面、其余动态渲染，需使用其他 adapter。

### 3.4 adapter-vercel 的影响

切换到 `adapter-vercel` 后，可以保留根 `prerender=true`：已预渲染 route 仍是静态资产，非预渲染 endpoint 才进入 Function。官方文档确认预渲染页面不会留在 runtime server bundle；因此“换 adapter 必然把 394 MB 静态站塞入 Function”并不成立。

但当前仓库存在实际迁移成本：

- 新增并固定 `@sveltejs/adapter-vercel`，修改 `svelte.config.js` 和 lockfile；
- 最终部署产物变为 Vercel Build Output，而当前 `deploy:verify` 固定扫描 `build/`；
- 部署/体积测试、CI contract、Preview/Production 行为都要重新校准；
- 若动态 page 继承根 `+layout.server.ts`，它会在 runtime 执行读取 generated manifest，增加文件系统和 bundle 风险；
- server route 若 import `$lib/server/generated`、`$lib/data/visual-assets` 或 detail loader，相关 JSON/manifest 会进入可达依赖图。

纯 `+server.ts` endpoint 不执行 page/layout load，因此可以通过严格 import 边界保持小型；仍建议启用 route-level split 或实际检查 `.vercel/output/functions` 后再决定。

## 4. MiHoMo API Findings

### 4.1 官方契约

[March7th API 总览](https://march7th.xyz/zh/api/)要求频繁请求的网站/机器人在 `User-Agent` 中写入应用名称，并说明 parsed API 返回文本、图片路径；图片源对应 StarRailRes。

[Parsed Player Data](https://march7th.xyz/zh/api/parsed.html)当前说明：

- endpoint：`GET /sr_info_parsed/{uid}`；
- language 默认 `cn`，别名 `l`/`lang`；支持 `cn/chs/cht/en/...`；
- version 默认 `v2`，别名 `v`/`ver`；
- `is_force_update` 默认 `false`，含义是不使用缓存数据；
- 请求示例携带 `User-Agent: Your-App-Name`。

[Raw Player Data](https://march7th.xyz/zh/api/raw.html)的 `/sr_info/{uid}` 更接近游戏原始结构，字段缺省较多，适合作为协议/诊断参考，不适合作为第一版 UI 主源。它确认展示角色未设置时字段可以缺失，skill tree 只包含已解锁点，装备光锥可为空对象。

[User Activity](https://march7th.xyz/zh/api/activity.html)的 `/sr_activity/{uid}` 返回活动文本及内容 ID，但不属于第一阶段 Player Info 核心，应后置；活动文本是 locale-dependent MiHoMo metadata，数据所有权也更难本地化。

[实时 OpenAPI](https://api.mihomo.me/openapi.json)列出了 raw、parsed、activity 和 panel endpoint 及 query 参数，但成功响应 schema 为空；OpenAPI `info.version=0.1.0` 是服务文档版本，不能替代 parsed payload 的 `v2`。因此项目必须自建窄 schema/fixture，不能依赖生成 OpenAPI client。

### 4.2 v2 第一阶段相关 schema

```text
root
├─ player
│  ├─ uid, nickname, level, world_level, friend_count
│  ├─ avatar { id, name, icon }
│  ├─ signature, is_display
│  └─ space_info
│     ├─ memory_data { level, chaos_id, chaos_level, chaos_star_count }
│     └─ universe_level, avatar_count, light_cone_count, relic_count,
│        achievement_count, book_count, music_count
└─ characters[]
   ├─ id, rarity, rank, level, promotion, enhanced, pos[]
   ├─ path, element, icon/preview/portrait, rank_icons[]
   ├─ skills[] { id, level, max_level, type, effect, ... }
   ├─ skill_trees[] { id, level, max_level, anchor, parent, icon }
   ├─ light_cone? { id, rank, level, promotion, attributes[], properties[], ... }
   ├─ relics[] { id, type, set_id, rarity, level, main_affix, sub_affix[] }
   ├─ relic_sets[] { id, num, properties[], ... }
   ├─ statistics[]
   ├─ attributes[]
   ├─ additions[]
   └─ properties[]
```

`attributes/additions/properties/statistics` 的数值应视为 MiHoMo 对“该玩家此刻面板”的计算结果；名称、图标、`display` 仅是辅助 metadata。浮点 `value` 存在二进制小数尾差，UI 不应直接 `String(value)`，应使用明确 formatter；MiHoMo `display` 可以作为 unknown-property fallback，但不能成为全站静态属性文案来源。

`pos` 在当前响应中是数组而非单个整数，一个角色可出现在多个 showcase 位置；normalize 时应去重、排序并保留原序语义，不能强制成 `position: number`。

### 4.3 实时 HTTP 行为（2026-09-14）

| Probe | Result |
| --- | --- |
| 合法公开 UID，`lang=en`，带应用 UA | `200 application/json`，约 179 KB |
| 非法字符串 UID | `400 {"detail":"Invalid uid"}` |
| 合法格式但不存在的 UID | `404 {"detail":"User not found"}` |
| 带 `Origin: https://example.com` 的 GET | `200`，**无** `Access-Control-Allow-Origin` |
| CORS OPTIONS preflight | `405`，`Allow: GET`，无 CORS allow headers |

成功响应同时出现 `Expires`（12 小时）、`Cache-Control: max-age=43200`、第二个 `Cache-Control: no-cache`、`X-Cache: MISS` 和 `cf-cache-status: DYNAMIC`。这些 header 的组合语义矛盾，不能把“MiHoMo 必然在 CDN 缓存 12 小时”作为架构保证；只能确认 API 有自己的缓存/force-update 概念。

官方没有给出明确 rate-limit 数字。不得在代码、UI 或报告中虚构每分钟配额。

未找到官方对 private/hidden profile 的独立 HTTP 状态承诺。可靠的产品处理方式是：成功 envelope 中 `player.is_display=false` 与空/缺失 `characters` 分开解释；不要把“关闭展示”“没有设置展示角色”“解析结果部分缺失”都归一成 404。

## 5. Data Mapping

### 5.1 Mapping matrix

| MiHoMo v2 | Current model/upstream domain | Mapping | Reliability | Notes |
| --- | --- | --- | --- | --- |
| `player.uid` | 无静态实体 | direct runtime value | High | 保持 string，避免前导/范围假设 |
| `player.avatar.id` | 当前无 PlayerAvatar model/resolver | none | Low | 这是 head icon ID，不是 Character ID |
| `character.id` | `Character.id` / `AvatarConfig.AvatarID` | exact string ID | High | 实测 8/8 命中 |
| `character.path.id` | `Character.path` / `AvatarBaseType.ID` | exact code | High for known character | UI 应优先使用 Character 本地值 |
| `character.element.id` | `Character.element` / `DamageType.ID` | exact code | High for known character | UI 应优先使用 Character 本地值 |
| `skill.id` | `SkillVariant.id` / `AvatarSkillConfig.SkillID` | exact upstream ID, partial projection | Medium | MiHoMo 包含网站有意隐藏的 internal/variant skill；不能要求每项命中可见 `SkillVariant` |
| `skill_tree.id` | `AvatarSkillTreeConfig.PointID`；当前分流为 `SkillProgression.id` 或 `Trace.id` | exact upstream PointID, union join | Medium–High | 不能只查 `Trace[]`；PointType/Enhanced profile 需参与 |
| `light_cone.id` | `LightCone.id` / `EquipmentConfig.EquipmentID` | exact string ID | High | 实测 8/8 命中 |
| `relic.set_id` / `relic_sets[].id` | `RelicSet.id` / `RelicSetConfig.SetID` | exact string ID | High | 实测 48/48 equipped pieces 的 set 命中 |
| `relic.id` | 当前 `RelicSet.pieces[].id` | **not direct** | Low | 实测 MiHoMo `61271` 对应本地 piece `31271`，ID 前缀语义不同 |
| `(relic.set_id, relic.type)` | `RelicSet.pieces[]` by set + slot | type 1..6 → HEAD/HAND/BODY/FOOT/NECK/OBJECT | High | 推荐的 piece identity；需 fixture 验证 slot 表 |
| `property.type` | `RelicProperty.propertyType` 或未来通用 stat registry | exact code when present | Medium | 当前 `RelicProperty` 只覆盖 21 个遗器词条；最终面板还会出现更宽属性域 |
| `property.field` | 无稳定 domain key contract | normalized alias | Low–Medium | 适合显示排序/兼容，不应当主键 |
| `icon/preview/portrait` | StarRailRes source paths；当前本地 resolver | ID-derived local resolver | Medium–High | path 形状一致，但当前 pipeline 会改名/转码，不能直接把 path 当 public URL |
| `pos[]` | 无现有模型 | runtime showcase positions | High | 保持数组 |

### 5.2 实时样本与 pinned 数据的比对

对同一 v2 响应的系统比对结果：

- 8 个 character ID、8 个 light-cone ID 全部命中当前 catalog；
- 48 件 equipped relic 的 `set_id` 全部命中当前 60 个 Relic Set catalog；
- direct `relic.id` 全部不命中当前 piece ID，证明不能直接 join；
- MiHoMo skills 中存在当前 Character view 有意不投影的技能变体；
- skill-tree PointID 必须同时在 skill progression 与普通 Trace 中查找；
- 样本中出现当前 `RelicProperty` 没有的 `ElationDamageAddedRatioBase`、`SpeedAddedRatio`，说明属性 registry 不能等同于遗器词条目录。

以上是 ID domain 和当前投影语义的证据，不代表一个 UID 覆盖所有未来 schema。实施时仍需用跨版本 fixture 和全量 pinned table contract test 固化。

### 5.3 pinned upstream 落后时的 fallback

任何 join 都必须返回 `known | unknown`，不得 throw 导致整个页面失败：

| Unknown type | UI fallback | Link behavior |
| --- | --- | --- |
| Character | MiHoMo locale-matched name（仅 fallback）+ `ID xxxx` + 通用剪影 | 不生成本地 detail link |
| Light Cone | MiHoMo name + ID + rarity/rank/level | 不生成无效 link |
| Relic Set/Piece | MiHoMo set/name + slot + level；本地图缺失占位 | 只有 set 已知才链接 set detail |
| Skill/Trace | 显示 MiHoMo fallback name/等级或“未知行迹 ID”；保留原 ID | 不猜名称、不合并到错误卡片 |
| Property | 用已验证的 `display` + locale-matched fallback name；图标缺失不影响数值 | 不丢弃未知属性 |
| Asset | 本地 placeholder/首字母/语义图标 | 默认不回退到不固定版本的远程 `master` 图片 |

页面顶部可显示“玩家数据可能领先于本站游戏数据版本”的非阻断提示，并附本站 `gameVersion/dataRevision`；已知卡片继续正常渲染。

## 6. Data Ownership and Runtime Data Architecture

### 6.1 数据所有权

建议采用以下边界。

**直接采用 MiHoMo：** UID、昵称、签名、开拓等级、均衡等级、好友数、展示开关、space progress/counts、展示位置、角色 level/promotion/rank/enhanced、技能/行迹当前等级、装备光锥 level/promotion/rank、遗器 rarity/level/主副词条数值、套装激活数量、最终面板数值。

**只作 fallback：** 玩家头像 name/icon、Character/Light Cone/Relic/Path/Element/Skill/Trace/Property 的 name、description、rarity、静态图片路径、MiHoMo `display` 字符串。

**已知本地实体时忽略 MiHoMo static metadata：** 名称、介绍、path/element 文案、rarity、技能/行迹静态说明、光锥/遗器静态说明、图片 URL。它们由 HSR-Database 的 locale projection 与 pinned asset pipeline 负责。

不要把 MiHoMo DTO spread 到 `Character`、`LightCone` 或 `RelicSet`。静态实体回答“它是什么”，runtime snapshot 回答“这个玩家把它培养成什么状态”。

### 6.2 推荐的模型流水线

```text
MiHoMo JSON (untrusted, version=v2)
        ↓ narrow runtime validation
MihomoPlayerInfoDto
        ↓ normalization / error isolation
PlayerInfoSnapshot (locale-neutral dynamic state + fallback metadata)
        ↓ client join by stable IDs
PlayerInfoViewModel
        ↑
localized static player lookup shards + local asset resolvers
```

建议模型职责：

- `MihomoPlayerInfoDto`：只描述实际使用字段；数组/可缺省字段按外部输入处理，额外字段忽略。
- `PlayerInfoSnapshot`：稳定的内部 runtime contract；UID 为 string；nullable/empty 语义显式；数值不混入本地静态 entity。
- `PlayerInfoViewModel`：加入本地 `Character/LightCone/RelicSet` identity、localized label、URL 和 resolved asset；只存在于 UI adapter 层。
- `source` metadata：`apiVersion: 'v2'`、`fetchedAt`、`cacheStatus`、`warnings[]`，支持 stale/partial 提示。

当前项目没有 Zod/Valibot 等 runtime schema dependency，而是大量使用针对项目契约的手写 validator。第一版建议延续这一做法，写**窄且分层的 type guard/decoder**，不要手工复制 MiHoMo 全量 179 KB schema；若后续覆盖 Activity/Panel 导致手写验证失控，再独立评估 schema library。

推荐目录（职责级别，不是本次实现）：

```text
api/player/[uid].ts                       # Vercel-native thin HTTP boundary
src/lib/player-info/contracts.ts          # stable snapshot/result contracts
src/lib/player-info/mihomo/dto.ts         # external DTO types
src/lib/player-info/mihomo/validate.ts    # untrusted JSON decoder
src/lib/player-info/mihomo/normalize.ts   # DTO → snapshot
src/lib/player-info/join.ts               # snapshot + local lookup → view model
src/lib/player-info/errors.ts             # normalized public error taxonomy
src/lib/components/player-info/*          # player-only components
src/routes/player/+page.server.ts          # prerendered shell data only
src/routes/player/+page.svelte             # client query/load/state machine
static/generated/{locale}/player-info/*   # optional compact/lazy static lookup shards
tests/fixtures/mihomo/*                    # sanitized versioned fixtures
```

共享给原生 Function 的文件必须是纯 TypeScript，不得通过 barrel 间接 import Svelte、Paraglide、generated data 或 asset manifest。

## 7. UI Reuse Audit

| Candidate | Class | Recommendation |
| --- | --- | --- |
| `SectionHeading` | A — Direct reuse | 语义和布局均通用 |
| `RarityStars` | A — Direct reuse | 只需 numeric rarity，适合光锥/遗器/角色 |
| `SemanticIconLabel` | A — Direct reuse | 已有 Path/Element 本地 resolver 与缺图状态 |
| `OverviewGrid` | A — Direct reuse | 展示角色响应式网格可直接使用 `character` variant |
| `CompactEntityCard` | A/B | 光锥摘要可直接 slot 组合；不要加入 player mode |
| `DetailArtwork` | A/B | Player Hero/Build Hero 可组合；头像无 resolver 时需外层 fallback |
| `OverviewHero` | B — Composition | 可承载页面标题；UID form 放在独立 section，不污染 hero API |
| `EntityOverviewCard` | B/C | 可参考/组合其 artwork 与 fallback；玩家卡的密度和信息层次不同，不直接加十几个 props |
| `RelicPropertyToken` | C — Extract primitive | 当前只接收静态 `RelicProperty`；可抽取 icon+label primitive，玩家 stat 仍用 sibling component |
| artwork missing handling | C — Extract primitive | 多组件重复 `failedSource/visibleSource`；只有在 Player Info 与现有组件都真正需要时再抽取 |
| `CharacterOverviewCard` | D — Derived sibling | 新建 `PlayerCharacterCard`，共享 Rarity/Path/Element/artwork helpers |
| Character detail hero | D — Derived sibling | 新建 `PlayerCharacterBuildHero`；静态 `DetailPage` 与培养快照语义不同 |
| Light Cone summary | D/B | 优先 `CompactEntityCard` composition；复杂时建 `PlayerLightConeCard` |
| Relic item UI | D — Derived sibling | 当前 UI 是 Relic Set catalog/detail，不是 6 件具体装备 |
| stat/property table | D — Derived sibling | 新建 `PlayerStatList`/`PlayerPropertyRow`，输入 runtime value/display contract |
| loading/error/empty | D — Derived shared family | 当前只有 route error 和零散 `.empty-state` markup，没有可直接复用的 async state component |
| `CharacterOverviewCard` 直接塞培养 props | E — Do not reuse | 它绑定 `CatalogEntry` 和 catalog navigation 语义 |
| `BaseStatsPanel` | E — Do not reuse | 它从静态 progression + level slider计算理论基础属性，不代表玩家最终面板 |
| `DetailPage` | E — Do not reuse | 已是多 entity 大型分支组件，且 `detail:any`；继续加 player mode 会放大耦合 |
| `RelicOverviewCard`/`RelicDetailPage` | E — Do not reuse | set-level静态内容与 equipped piece 语义不同 |
| `FilterChip` 当普通 badge | E — Do not reuse | 它是可点击、`aria-pressed` 的 filter control，不是静态 tag |
| 根 `+error.svelte` | E — Do not reuse | API 失败应是可重试的页面内状态，不能升级为整条 route error |

建议的 Player UI 组件是 siblings，而不是 `<CharacterOverviewCard playerMode showLevel ...>`。可以共享 token、resolver、RarityStars、SemanticIconLabel、SectionHeading、CompactEntityCard 等小 primitive。

## 8. Routing Options

| Option | Static compatibility | Shareable | SSR/Function page | SEO/privacy | Complexity |
| --- | --- | --- | --- | --- | --- |
| `/player?uid=100...` | Excellent；只预渲染 `/player`/`/en/player` | Yes | No | canonical 可固定 `/player`；建议整页 noindex | Low |
| `/player/[uid]` | Poor with current adapter；无限 UID 不可 entries | Yes, cleaner | 需要 mixed adapter、SPA rewrite 或平台 rewrite | UID 进入 path/log/sitemap 风险更明显 | Medium–High |
| `/player#uid=...` | Excellent | Yes | No | fragment 不发给 server，但分享/状态管理较别扭 | Low，收益有限 |

**推荐 `/player?uid=`。** Query 变化由 client navigation/history 管理，静态 shell 不因 UID 重建。第一版 Player Info 没有需要搜索引擎索引的稳定内容，SSR 不提供足够收益。

建议 section 顺序：

1. UID Query（初始空态、格式帮助、submit）；
2. Player Profile Hero（nickname、UID、等级、签名、公开状态）；
3. Account/Space summary（可折叠或简洁统计）；
4. Public Characters grid；
5. 选中角色 Build panel：等级/星魂/技能/行迹；
6. Light Cone；
7. Relics + active sets；
8. Final stats/properties；
9. source version/staleness/partial warning。

不进入 sitemap；设置 `robots=noindex,nofollow`（或至少 noindex）并把 canonical 指向无 query 的 locale route。若未来需要索引 `/player` 的产品说明，可把可索引说明页与 noindex 查询结果区分，但不要索引每个 UID。

## 9. API Access Options

| Option | Feasibility | Advantages | Problems | Verdict |
| --- | --- | --- | --- | --- |
| A. Browser → MiHoMo | 当前不可行 | 无自身 Function | 实测无 CORS allow；OPTIONS 405；不能设置应用 UA；无法统一 cache/timeout/error/abuse | Reject |
| B. SvelteKit `+server.ts` BFF | 可行，需 adapter-vercel | 同框架路由/类型/本地 dev；可统一 UA/cache/error | 改 adapter 和部署验证；必须审计 Function dependency graph | Good alternative |
| C. `+page.server.ts`/SSR | 技术可行，架构不合适 | 首屏 HTML 可含玩家数据 | 每次 UID page 变成 runtime；继承 layout/generated loader 风险；loading/retry 差；扩大失败域 | Reject for v1 |
| D. Vercel-native `/api` Function + adapter-static | 可行 | 保持现有静态 adapter/build；Function 天然与 Svelte route graph 隔离；最小 deploy side effect | 平台耦合；`vite dev` 不自动仿真；需 Function 独立测试与 Preview proof | **Recommended** |
| E. 独立 Worker/service | 可行 | 最强隔离、可跨站复用 | 新服务、域名、部署与监控，超出第一版需要 | Defer |

Vercel 官方说明 root `api` 目录可定义原生 Function；静态文件与 Function 是独立 deployment primitive。该能力让项目无需切换 Svelte adapter 即可增加薄动态层。实施前必须在真实 Preview 中证明项目当前 Framework Preset/Output Directory 会同时发布 `build/` 与 `api/**`，并把这项 proof 作为 Phase 0 gate。

不建议用 `vercel.json` external rewrite 直接代理 MiHoMo：它无法完成应用 UA、schema validation、timeout/error taxonomy、force-update 禁止和按 UID/lang 的缓存治理，且 SvelteKit/Vercel 官方对 framework rewrite 也提示有限制。

## 10. Recommended Architecture

```text
                         BUILD TIME
TurnBasedGameData + StarRailRes (pinned commits)
                ↓ existing sync/projection/assets
   static catalogs + compact Player lookup shards + local assets
                ↓
        adapter-static → build/ → Vercel CDN

                         RUNTIME
Browser /player?uid=...
    ├─ loads static shell + locale messages + local lookup/assets
    └─ GET /api/player/{uid}?locale=en
                 ↓
        thin Vercel Function/BFF
        - validate UID
        - force version=v2, is_force_update=false
        - set identifiable User-Agent
        - timeout + response size guard
        - validate/normalize/error-map
        - CDN cache by UID + locale
                 ↓
             MiHoMo

MiHoMo stable IDs → client join → local static identity/assets
unknown IDs       → isolated fallback card, never page failure
```

推荐 BFF 只返回 `PlayerInfoSnapshot` 或稳定 result envelope，不返回 HSR 静态 entity。这样 Function 不需要本地 catalog，静态数据不会进入 Function bundle。客户端从 `/player` prerender data 或按需 static shard 获得本地 lookup。

第一阶段明确请求 `version=v2`，不要依赖服务端默认值；locale 映射为 `zh-CN → cn`、`en → en`。本地 entity 文案永远优先，MiHoMo locale 仅服务 unknown-ID fallback，避免中英文站出现两套正常 metadata。

## 11. Cache, Rate Limit and API Etiquette

建议初始策略（这是工程起点，不是官方 rate-limit）：

- 正常请求固定 `is_force_update=false`；第一版 UI 不提供 force update。
- Function 对同一 `UID + locale + apiVersion` 做 CDN shared cache；建议从 5–15 分钟 fresh TTL、15–30 分钟 stale-while-revalidate 起步，在 Preview/production telemetry 后调整。
- 浏览器不长期缓存敏感查询结果；可用 memory/session cache 去重同一页面内并发和返回导航。
- Function 使用 `Vercel-CDN-Cache-Control` 控制共享缓存，并让浏览器 `max-age=0`；公共 UID 响应对所有访客一致，适合 shared cache，但 cache key 必须包含 locale/version。
- 同一进程增加 in-flight request coalescing 只能作为优化，不能当全局限流器；serverless 实例间不共享内存。
- 设短 upstream timeout（建议起点 6–8 秒）和响应体上限；超时返回 normalized `upstream_timeout`，不阻塞静态站其他功能。
- Refresh 按钮只重新请求 HSR endpoint；若 CDN 仍 fresh，显示缓存结果。若产品确需 bypass，应由受控 server policy 决定，不能把 `is_force_update=true` 暴露给任意用户。
- UA 形如 `HSR-Database/<release> (+public project/contact URL)`，不要包含 UID、访问者信息或 secret。
- 不根据未知配额设计“每分钟 N 次”。对 upstream 429 原样尊重 `Retry-After`（若存在），向 UI 返回可重试时间；没有 header 时采用有上限的退避，GET handler 内不自动多次轰炸。
- 5xx/timeout 可在 CDN 层保留最近成功 snapshot 并标 stale；不得把错误响应长时间缓存成成功。

## 12. Failure, Loading and Compatibility Strategy

Player page 应有独立 state machine：

| State | Required behavior |
| --- | --- |
| 初始未输入 UID | 展示输入说明，不发请求 |
| loading | 保留输入与旧结果；ARIA live 状态；可取消前一个 fetch |
| invalid UID | 客户端先校验，服务端再次校验；聚焦输入错误 |
| player not found | 显示 404 语义但不进入根 route error |
| `is_display=false` | Profile 可用则显示 profile；明确“角色展示已关闭” |
| showcase enabled but zero characters | 独立 empty state，不等同 private/not found |
| timeout/429/5xx | 可重试 inline error；数据库导航与静态页不受影响 |
| schema changed | `provider_schema_error` + request correlation；不显示误解析数据 |
| partial response | 显示可验证 section，按 section 标 unavailable；记录 warnings |
| unknown local ID | fallback card + version mismatch notice；不生成错误 link |
| missing local asset | 现有 resolver 返回 undefined，显示 local placeholder |
| stale cache | 保留数据并显示“缓存于/可能过期”，后台刷新 |

每个 section 的失败边界应独立：例如一个未知 property 不应隐藏整件 relic，一个未知 relic 不应隐藏 Character，一个 Character normalize 失败也不应抹掉 Player Profile。

昵称、签名和 MiHoMo fallback 文本均是不可信纯文本；依赖 Svelte escaping，不以 `{@html}` 渲染，不把内容插入 meta description 或日志字段。

## 13. Internationalization, Assets and Privacy

### 13.1 Locale strategy

- 新导航和所有状态/按钮/错误通过现有 Paraglide Site Messages，补齐 `zh-CN` 和 `en`。
- route 仍使用当前 URL strategy：`/player` 与 `/en/player`；不要增加 mutable locale state。
- 请求 MiHoMo 时显式映射 locale，但已知游戏 entity 的名称、说明、Path/Element、属性名称与图片由本站对应 locale projection/asset manifest 决定。
- API fallback metadata 只能在本地 join 失败时显示，并附 unknown/version mismatch 语义。
- 数值格式用本站 locale formatter；不要盲用 MiHoMo `display`，除非 property 未知。

### 13.2 StarRailRes paths

实测 MiHoMo 路径如：

```text
icon/character/1413.png
image/character_preview/1413.png
image/character_portrait/1413.png
icon/light_cone/23049.png
icon/relic/127_0.png
```

它们与 StarRailRes 目录约定一致，但当前网站的 public URL 并不相同：pipeline 按 ID 输出 `/generated-assets/characters/...`，部分 portrait 转为 WebP，并用 manifest allowlist 判断可用性。因此应执行：

```text
MiHoMo entity ID/set+slot
  → current get*Url resolver
  → local /generated-assets/*
```

而不是把 MiHoMo path 拼到本站或远程 `master` URL。

当前已有 Character preview/portrait、Light Cone preview/portrait、Relic Set/piece、Property、Path、Element resolver，且缺图返回 `undefined`。玩家 head avatar 尚无 resolver。第一版可使用通用本地头像 placeholder；是否把全部 pinned head icons 纳入 pipeline，应在测量文件数/bytes 后另做小改动，不应 runtime 下载未知版本图片。

### 13.3 Privacy and URLs

- 第一版默认不写数据库、不发 analytics event 携带 UID、不把 UID写入错误 message/structured logs。
- 默认不使用 localStorage 保存最近 UID；如产品希望“最近查询”，应 opt-in，并提供清除入口。session memory 已足够改善一次会话体验。
- Query URL、Function URL 和访问日志仍会暴露 UID；UI 应说明数据来自公开展示，不把 UID 与站内身份绑定。
- `/player` 和 UID 查询结果 noindex；不将 UID 变体写入 sitemap。
- 不在 server logs 记录完整 upstream body、昵称、签名、角色面板；只记录 correlation ID、错误类别、耗时和脱敏/散列后的诊断 key（若确有必要）。
- 不建立账号系统或持久化玩家快照。

## 14. Deployment Impact

### 14.1 推荐方案的产物影响

保持 `adapter-static` + Vercel 原生 Function 时：

- 现有约 394.6 MB、7,126 文件的静态输出结构不变；新增两份 locale shell、JS 和可选 compact lookup shards。
- TurnBasedGameData、StarRailRes、`src/lib/generated/views` 不需要进入 Function。
- Function 增量应由 handler + pure validator/normalizer 构成，预期相对静态站很小；在没有 `.vercel/output` 实测前不承诺具体 KB/MB。
- Vercel Deploy Storage 会增加 Function bundle 和少量静态文件，但不会复制 394 MB 静态 catalog 到 Function，只要 import boundary 被 contract test 和产物审计守住。
- Vercel Production 仍运行现有 `pnpm deploy:build`；平台在构建阶段另外识别 `api/**`。Preview 需要真实 Vercel build 验证二者共存。
- 当前 `deploy:verify` 只验证 `build/` asset closure，不能验证 Function bundle；需要新增 Function forbidden-import/size audit。

建议 CI 加入以下 invariant：

```text
api/player dependency graph must not contain:
  src/lib/server/generated
  src/lib/generated/**
  src/lib/generated-assets/**
  scripts/data/**
  scripts/assets/**
  TurnBasedGameData / StarRailRes paths
```

### 14.2 adapter-vercel alternative

若切 adapter：既有页面理论上仍 prerender 并作为 static assets，不进入 Function；但 `.vercel/output` 会替代当前单纯 `build/` 作为完整 deployment artifact。需要重写/扩展 `deploy:verify`、更新 deployment unit tests，并分别测量：

- `.vercel/output/static` 总 bytes/file count；
- `.vercel/output/functions/*` uncompressed/compressed size；
- Function traced files；
- Preview 与 Production 的 route manifest；
- cold start 与 upstream timeout。

该方案不会改变 pinned upstream 的数据所有权，但迁移测试面较大，因此不应作为第一版默认。

### 14.3 SSR page 的体积风险

动态 `+page.server.ts` 最危险，因为它容易复用现有 `$lib/server/generated` loader 和根 layout server load。当前 detail/catalog JSON 很大，静态产物优化正依赖 build-time serialization；把这些 server imports 带到 runtime 会增加 Function bundle、文件 tracing、cold start，并可能依赖部署文件系统。薄 endpoint + client-side static join 可以从结构上避免这一风险。

## 15. Testing Strategy

| Layer | Tests |
| --- | --- |
| DTO decoder | required/optional/null/extra fields、数组上限、错误路径、v2 fixture |
| Normalizer | UID string、pos array、空 equipment、隐藏展示、部分 Character、浮点/display |
| Mapper/join | Character/LC/Set high-confidence join；set+slot relic join；skill/PointID union；unknown fallback |
| Error normalization | 400 invalid、404 not found、429、timeout、5xx、non-JSON、oversize、schema drift |
| BFF handler | UA、`version=v2`、`is_force_update=false`、locale allowlist、cache headers、abort timeout |
| Components | initial/loading/empty/private/stale/partial/unknown asset；keyboard/ARIA/reduced motion |
| Route | `/player`/`/en/player` prerender；query history；noindex/canonical；其他 static routes 不回归 |
| Deployment contract | `build/` 保持 static；Function forbidden imports；bundle size snapshot；Preview smoke |

准备经过脱敏和最小化的固定 fixture：至少 success-full、success-no-showcase、success-hidden、success-partial、unknown-new-version、每类 error。fixture 要记录 `apiVersion` 与 capture date，不长期依赖真实 UID。

真实 MiHoMo smoke test 不放在每次 PR correctness 主路径；可做低频手动/定时、单 UID、`is_force_update=false`、带 UA 的非阻断检查。CI 的 deterministic test 全部 mock fetch。

## 16. Estimated Change Surface

### 新增

- `api/player/[uid].ts` 及纯 runtime integration modules；
- `src/routes/player/+page.server.ts`（只做 prerender shell/static lookup）与 `+page.svelte`；
- `src/lib/player-info/**` contracts、mapper、state machine；
- `src/lib/components/player-info/**` sibling components；
- 双语 Site Messages；
- sanitized MiHoMo fixtures、unit/component/E2E/deployment tests；
- 可选 `static/generated/{locale}/player-info/**` compact shards；
- 可选 Player navigation icon/head-avatar asset requirements。

### 小幅修改

- `src/lib/navigation.ts` 与 navigation icon key/asset requirement；
- sitemap/manifest route generation：加入静态 `/player`，但不加入 UID；
- deployment/CI contract：构建并审计原生 Function；
- Product baseline fixtures（新增页面/导航，不重写现有 detail baseline）。

### 不应修改

- `Character`、`LightCone`、`RelicSet` 静态 domain；
- `DetailPage`、`CharacterOverviewCard`、`BaseStatsPanel` 的 player mode；
- TurnBasedGameData/StarRailRes；
- adapter（推荐方案）；
- 大型静态 data pipeline，除非只增加有明确体积预算的 compact lookup projection。

## 17. Cost and Risk Matrix

评分：1=低，5=高；基于推荐的 static shell + Vercel-native thin BFF。

| Dimension | Score | Assessment |
| --- | ---: | --- |
| Implementation complexity | 3 | async state、外部 schema、join、6 件遗器和完整 build panel 带来中等工作量 |
| Architectural impact | 2 | 独立 runtime domain；不改现有静态 entity/adapter |
| Deployment impact | 2 | 增加一个 Function；需要首次平台共存与 bundle proof |
| Maintenance burden | 3 | MiHoMo schema/version、错误语义和 fixture 需持续维护 |
| Upstream API dependency | 4 | 无 SLA/rate-limit contract；CORS 迫使依赖 BFF；需 stale/failure strategy |
| UI complexity | 4 | 培养详情、属性、遗器、mobile states 比 catalog card 更复杂 |
| Regression risk | 2 | import 边界和 sibling component 可把风险限制在新 route |
| Privacy risk | 2 | 公开 UID、无持久化；仍需避免 URL/log/analytics 扩散 |
| Static storage risk | 2 | compact shards 很小；禁止复制完整 details 到新 locale shell |

总体：**Medium**。若改为 adapter-vercel + SSR page，architectural/deployment/regression 分别会上升约 1–2 级。

## 18. Phased Recommendation

### Phase 0 — Deployment and contract spike

- 在短期分支添加最小 Vercel-native hello/proxy Function，真实 Preview 验证与 `adapter-static build/` 共存；
- 记录 Function traced files/size，证明没有 generated/upstream 进入 bundle；
- 用 mock 完成 UA、timeout、cache、error contract；
- spike 通过后再进入产品实现，失败则回退到 adapter-vercel thin `+server.ts` 方案。

### Phase 1 — Profile and showcase foundation

- `/player?uid=`、双语导航/messages、noindex；
- profile/space summary + showcase character cards；
- Character/LC/Relic Set 基础 join 和未知 ID fallback；
- 完整 loading/error/private/empty/stale 状态；
- 不提供 force update，不持久化 UID。

### Phase 2 — Character build details

- 技能/skill-tree union mapper；
- 光锥培养、6 件遗器、套装激活、最终 stats/properties；
- 按角色懒加载 compact local metadata shard，控制 `/player` shell payload；
- 建立 property formatter/registry，不把它塞入 `RelicProperty`。

### Phase 3 — Local database linkage and polish

- 已知 Character/Light Cone/Relic Set 互相链接；
- asset/head-avatar pipeline 的体积评估与可选扩展；
- production cache/timeout/429 telemetry 后调参；
- accessibility、mobile、partial-data recovery 的完整 E2E。

### Deferred — User Activity

`/sr_activity` 与 Endgame 的 ID/文本所有权、历史时效和本地 mode mapping 另做调查。它不应阻塞 Player Info，也不应在第一阶段顺带扩大范围。

## 19. Open Questions Requiring Product Decisions

1. 是否接受一个 Vercel-specific 原生 Function，以换取不改 adapter 和最小部署风险？若必须平台可移植，则选择 adapter-vercel thin endpoint 并接受较大迁移面。
2. unknown/new-version entity 的产品策略：显示 MiHoMo locale fallback + placeholder，还是只显示 ID/“本站数据尚未更新”？本报告推荐前者。
3. 玩家头像第一版是否接受通用 placeholder？若必须显示头像，需要为 pinned head icons 扩展 asset pipeline 并先测量体积。
4. `/player` 是否整页 noindex？本报告推荐是；若希望搜索引擎收录功能说明，需要拆分 indexable landing 与 noindex result semantics。
5. 是否允许 opt-in 保存最近查询 UID？本报告默认不持久化。
6. 可接受的数据新鲜度目标是多少？建议先以 5–15 分钟本站 CDN TTL 实施，再根据实际使用和 MiHoMo 礼仪调节，而不是提供 force refresh。

## 20. Final Recommendation

在不破坏 static-first、pinned-upstream 和现有 Vercel 体积优化的前提下，最合理的第一版是：

> **`/player?uid=` 双语静态 shell + Vercel-native thin BFF + 独立 PlayerInfo runtime model + 客户端按 ID 加入本地 compact catalog/assets。**

该设计保留现有数据库的静态事实来源，MiHoMo 只提供玩家状态；第三方 API 不可用、schema 变化或领先 pinned upstream 时，只降级 Player Info，不影响 Character、Light Cone、Relic、Enemy 和 Endgame。

UI 上直接复用 SectionHeading、RarityStars、SemanticIconLabel、OverviewGrid、CompactEntityCard 等小 primitive；为 Player Profile、Player Character、equipped relic 和 final stat 创建 sibling components。不要把成熟 catalog/detail 组件改成 mode-prop 集合。

Phase 0 的真实 Vercel Preview 共存与 Function bundle proof 是实施 gate；一旦证明原生 Function 与当前项目设置不兼容，再选择 adapter-vercel thin endpoint，而不是 SSR Player page。

## Sources

- [March7th: MiHoMo API](https://march7th.xyz/zh/api/)
- [March7th: Parsed Player Data](https://march7th.xyz/zh/api/parsed.html)
- [March7th: Raw Player Data](https://march7th.xyz/zh/api/raw.html)
- [March7th: User Activity](https://march7th.xyz/zh/api/activity.html)
- [MiHoMo live OpenAPI](https://api.mihomo.me/openapi.json)
- [SvelteKit: Static site generation / adapter-static](https://svelte.dev/docs/kit/adapter-static)
- [SvelteKit: Vercel adapter](https://svelte.dev/docs/kit/adapter-vercel)
- [Vercel: SvelteKit](https://vercel.com/docs/frameworks/full-stack/sveltekit)
- [Vercel: Functions](https://vercel.com/docs/functions)
- [Vercel: Project configuration and native `api` functions](https://vercel.com/docs/project-configuration/vercel-json)
- [Vercel: Cache-Control headers](https://vercel.com/docs/caching/cache-control-headers)
- [Vercel: Build Output API primitives](https://vercel.com/docs/build-output-api/primitives)

