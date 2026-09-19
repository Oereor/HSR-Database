# MiHoMo Player Info 实现可行性调查

> 调查日期：2026-09-18  
> 调查范围：`HSR-Database` 当前 `develop` 分支、当前锁定的 `TurnBasedGameData` / `StarRailRes`、MiHoMo V2 实际响应与官方文档、SvelteKit 与 Vercel 官方文档  
> 本报告只做实现前调查；未创建 Player 页面、Vercel Function，未修改组件、路由、适配器、Vercel 配置或依赖。

## 1. Executive Summary

### 1.1 结论

**确认可行，建议按计划继续采用 `adapter-static + one standalone Vercel Function`。**

最小侵入的实现方式是：

1. 继续由现有 `adapter-static` 预渲染全部公开页面；
2. 在仓库根目录增加一个原生 Vercel Function：`api/player.ts`；
3. 浏览器只请求同源 `/api/player?uid=...`；
4. BFF 固定请求 `GET https://api.mihomo.me/sr_info_parsed/{uid}?version=v2&language=cn`，做超时、错误归一化、窄 DTO 投影与 CDN 缓存；
5. `/player` 和 `/characters/{id}?uid=...` 仍是静态 HTML 路由，玩家数据只在浏览器运行时加载；
6. 静态名称、描述、图片、遗器部位与推荐属性继续由本地生成数据解析，不把 MiHoMo 当作静态数据库。

该方案不要求切换 `adapter-vercel`，不要求 Agent，不要求数据库，也不需要新增服务端运行时依赖。当前代码库内没有架构级 blocker。

### 1.2 实施前必须先解决的三个问题

| 优先级 | 问题 | 结论 / 处理方式 |
| --- | --- | --- |
| P0 | 真实 Vercel 项目设置与 route 计数尚不在仓库内 | 先执行一次 `vercel pull`、`vercel build` 和 Preview 部署，核对 `.vercel/output/config.json`、Function bundle 与实际路由数；这是部署门槛，不是当前架构 blocker。 |
| P0 | “技能等级只读 `skills`”不成立 | 忆灵技能的可见 `SkillVariant.id` 在实测响应的 `skills` 中缺失；应以本地 `SkillProgression.id -> MiHoMo skill_trees[].point_id` 作为等级主连接，`skills` 只作普通技能的交叉校验/回退。 |
| P1 | Player Hero 头像没有现成本地解析链路 | `StarRailRes/icon/avatar` 与 `TurnBasedGameData/AvatarPlayerIcon.json` 能提供数据，但当前稀疏同步、资产 manifest 和 URL helper 都未覆盖；实现前需决定补齐管线，或明确 V1 使用 placeholder。建议补齐本地管线。 |

另有一个必须补样本确认的问题：未激活行迹在 parsed V2 中究竟表现为 `level: 0` 还是条目缺失。现有三个实测 UID 的角色均没有提供足够的未激活样本，不能把“缺失等于未激活”当成已验证合同。

### 1.3 关键调查事实

- 当前 `svelte.config.js` 使用 `@sveltejs/adapter-static`，输出目录为默认 `build/`，并预渲染 `routePaths × 2 locales`。
- 当前生成 manifest 有 1,076 个 canonical route path，对应 2,152 个本地化公开页面；现有 `build/` 共 2,153 个 HTML（含 fallback）。
- 先前 `adapter-vercel` 方案触发的是框架生成 route 数膨胀；独立 `/api/player` 不要求把静态页面转换为 Functions。
- 根目录没有 `.vercel/`，`vercel.json` 只包含 Git deployment 配置，因此 Framework Preset、Build Command、Output Directory 的线上实际值不能仅凭仓库确认。
- 实测 MiHoMo parsed V2 能投影玩家、公开角色、角色养成、光锥、遗器和统计字段；但官方 OpenAPI 的成功响应 schema 是空对象，不能依赖自动生成客户端。
- 当前本地静态数据可以直接解析角色、光锥、遗器套装、遗器部位和属性类型；玩家头像是唯一明确的静态 ID domain gap。
- 实测 `relic.set_id + relic.type` 能唯一定位当前本地遗器部件，`affix.type` 能匹配当前本地 `RelicProperty.propertyType`。

## 2. Current Repository / Deployment Architecture

### 2.1 构建与部署现状

| 项目 | 当前事实 | 对 Player Info 的影响 |
| --- | --- | --- |
| SvelteKit adapter | `svelte.config.js` 使用 `adapter-static`，fallback 为 `404.html` | 必须保留；Player 页面仍是静态入口，动态数据走独立 BFF。 |
| 全局预渲染 | `src/routes/+layout.server.ts` 导出 `prerender = true` | `/player` 与角色详情都可继续预渲染；query 不产生新的静态页面。 |
| 路由来源 | `scripts/data/routes.ts` 构造 `routePaths`；`svelte.config.js` 扩展为中文与英文入口 | 实现时只需将 `/player` 加入 canonical route inventory；`?uid=` 不进入 manifest。 |
| 部署构建 | `pnpm deploy:build` -> `scripts/deployment/build.ts` | 继续负责数据锁定、生成、资产校验和静态构建；无需让它执行 MiHoMo 请求。 |
| 静态产物校验 | `scripts/deployment/verify-build.ts` 校验 `build/` 中资源闭包 | 仍保留，但它不会验证 Vercel Function bundle；需新增独立部署验收。 |
| Vercel 配置 | `vercel.json` 目前只有 Git deployment 配置 | 不足以还原线上 Project Settings；不能凭仓库断言 Framework Preset / Build Command。 |
| 本地开发 | `pnpm dev` 是普通 Vite dev server | 不会自动执行根目录原生 `api/` Function；集成开发使用 `vercel dev`。 |
| 依赖 | 无 Zod/Valibot/服务端 HTTP client | 原生 `fetch`、`AbortController` 和手写窄 guard 足够；V1 无需新增 runtime dependency。 |

当前锁定上游：

- `TurnBasedGameData`: `4ce30f69...`
- `StarRailRes`: `d226befe...`

数据源职责应保持不变：`TurnBasedGameData` 是静态语义权威，`StarRailRes` 是视觉资源来源；MiHoMo 只提供玩家的动态状态。

### 2.2 当前静态规模

当前生成数据中有：

- 1,076 个 canonical route path；
- 2 个公开 locale（`zh-CN`、`en`）；
- 2,152 个本地化公开路由；
- 97 个角色、169 个光锥、60 个遗器套装、21 个遗器属性、628 个敌人；
- 现有 `build/` 中 2,153 个 HTML 文件（包含 fallback）。

这些数值说明两件事：

1. 当前静态部署已经能承载超过 2,048 个静态 HTML 文件；Vercel 的 “Routes Created per Deployment” 限制不能简单等同于静态文件数量。
2. 不能再次让框架 adapter 为每个静态页面生成额外的 Vercel route 配置；独立 Function 必须与现有静态输出并列，而不是替换 adapter。

## 3. `adapter-static + BFF` Feasibility

### 3.1 推荐文件结构

```text
HSR-Database/
├── api/
│   ├── player.ts                    # 唯一公开 Function: GET /api/player
│   └── _player/
│       ├── config.ts                # upstream URL、UA、timeout、cache 常量
│       ├── contract.ts              # Function 内部输入 guard / DTO 投影
│       ├── errors.ts                # 状态码与错误归一化
│       └── project.ts               # MiHoMo response -> minimal DTO
├── src/lib/player-info/
│   ├── contracts.ts                 # 浏览器侧 DTO/error TypeScript 类型
│   ├── client.ts                    # same-origin fetch + session cache + in-flight dedupe
│   └── resolvers.ts                 # 动态 ID -> 本地静态 metadata
└── src/routes/player/...
```

`api/_player/*` 使用下划线前缀，明确它们是实现文件而不是公开 endpoint。Vercel Function 不应运行时导入 `$lib`、生成目录或 Node 文件系统 loader；Vercel 官方说明 Functions 的 TypeScript path mapping/project references 有限制，使用相对导入更稳妥。

浏览器与 Function 可以共享“JSON 形状”的设计，但不建议为了消除少量重复而让 Function bundle 穿透 SvelteKit alias。最稳妥的边界是：

- Function 内部有运行时 guard 与投影；
- `src/lib/player-info/contracts.ts` 只保存前端消费类型；
- 契约通过 fixtures/contract tests 保持一致，而不是通过复杂跨边界 runtime import 耦合。

### 3.2 是否需要改 Framework Preset / `vercel.json`

**不建议改变 Framework Preset。** 当前线上静态部署既然已经工作，Player Info 不应借机改变 preset。仓库本身无法证明线上 preset 的当前值，所以 Phase 0 应从 Vercel Project Settings 拉取并记录事实。

**原生 `/api` Function 的发现本身不要求新增 `vercel.json`。** Vercel 支持在根目录 `api/` 中放 TypeScript Function；`functions` 配置只在需要 `maxDuration` 等覆盖项时添加。V1 可以先不改 `vercel.json`，在函数内实现更短的 upstream timeout。

如果当前 Project Settings 没有明确输出目录，则应确认它仍识别 adapter-static 的 `build/`。不要在没有 Preview 证据时同时修改 preset、build command、output directory 和 Function 配置。

### 3.3 route limit 风险

预期结果是：保留现有静态文件交付方式，只增加一个 `/api/player` 逻辑路由，不会重演 `adapter-vercel` 为大量页面生成 route 配置的失败模式。

但“准确增加 1 条 route”属于平台构建结果，不能只靠源码推断。必须把以下检查设为合并门槛：

1. `vercel pull` 获取真实项目设置；
2. `vercel build` 生成 `.vercel/output`；
3. 检查 `.vercel/output/config.json` 中 `routes` / `overrides` 的数量和内容；
4. 确认存在 `.vercel/output/functions/api/player.func`（具体目录名以实际输出为准）；
5. Preview 部署同时访问一个中文静态详情页、一个英文静态详情页、fallback 和 `/api/player`；
6. Production 采用同一构建设置并执行 smoke test。

Vercel 官方当前列出的 deployment route 上限是 2,048，框架生成的 routes、rewrites、redirects 和 headers 都可能计数。上述检查比“静态 HTML 数量 + 1”更可靠。[Vercel Limits](https://vercel.com/docs/limits)

### 3.4 本地 / Preview / Production 验证

| 环境 | 验证方式 | 必须验证的内容 |
| --- | --- | --- |
| 纯前端日常开发 | `pnpm dev` + mock/fixture 或直接单测 client state | 页面、resolver、loading/error、响应式；不把 Vite dev 当作 Function 集成测试。 |
| 本地 Function 集成 | `vercel dev` | `/api/player` 发现、query、header、超时、错误映射、同源调用；Vercel 官方将其作为本地模拟 Functions 的入口。[Vercel CLI: vercel dev](https://vercel.com/docs/cli/dev) |
| 可重复构建 | `vercel pull` 后 `vercel build` | 静态输出 + Function bundle、route config、环境变量；`vercel build` 会生成 `.vercel/output`。[Vercel CLI deployment](https://vercel.com/docs/cli/deploying-from-cli) |
| Preview | 实际部署 URL | 中英文静态页、`/player?uid=`、角色详情 query 保留、BFF 成功/429/超时、缓存 header、route 数。 |
| Production | 现有 CI-backed production 流程 | 与 Preview 相同的 smoke tests；禁止 Production 首次验证 Function 能否被发现。 |

不建议为 `pnpm dev` 复制一套 BFF。若团队以后明确要求单命令集成开发，可增加一个只在 dev 生效、委托同一 handler 的 Vite middleware；它不应成为第二份实现。

### 3.5 官方文档一致性

- SvelteKit 官方对 `adapter-static` 的定义就是生成整个站点的静态文件，默认输出 `build/`；本方案没有要求它承载动态 SSR。[SvelteKit adapter-static](https://svelte.dev/docs/kit/adapter-static)
- Vercel 官方支持根目录 `api/` 原生 Functions，TypeScript 与 Web `Request` / `Response` handler 可用。[Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json)；[Vercel Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js)

因此两者不是互斥 adapter：SvelteKit 负责静态站，Vercel 原生 Function 负责单一动态边界。

## 4. Proposed Runtime Request Flow

```text
GET /player?uid=168902602
        │
        ├─ adapter-static 返回预渲染 HTML / 本地角色目录
        │
        └─ 浏览器 Player client
             ├─ 校验 UID（trim、非空、仅数字；不假设固定长度）
             ├─ session cache / in-flight dedupe 命中则复用
             └─ GET /api/player?uid=...
                    │
                    ├─ BFF 二次校验 UID
                    ├─ AbortController timeout
                    ├─ User-Agent: HSR-Database-PlayerInfo/1.0 (+https://hsrarchive.cc)
                    └─ GET api.mihomo.me/sr_info_parsed/{uid}
                         ?version=v2&language=cn
                              │
                              ├─ 解析并投影最小 DTO
                              ├─ 忽略未知字段
                              ├─ success: CDN cache headers
                              └─ error: stable code + no-store
```

玩家角色卡链接固定为 `/characters/{characterId}?uid={uid}`；角色页面客户端再从同一 session cache 读取玩家数据，避免从 Player 首页点击每张卡都重新请求 MiHoMo。若 cache miss 才请求 `/api/player`。

不增加 UID path，不增加 `mode` / `source` / `from` query。query 中有 `uid` 时进入 Player mode；无 `uid` 时保持完全原有的 static mode。

## 5. Minimal DTO Audit

### 5.1 建议 DTO

```ts
interface PlayerInfoDto {
  uid: string;
  nickname: string;
  level: number;
  worldLevel: number;
  signature: string;
  avatar: { id: string; icon: string } | null;
  spaceInfo: {
    achievementCount: number | null;
    avatarCount: number | null;
    lightConeCount: number | null;
    relicCount: number | null;
  };
  characters: PlayerCharacterDto[];
}

interface PlayerCharacterDto {
  characterId: string;
  progression: {
    level: number;
    promotion: number;
    rank: number;
    enhanced: boolean;
  };
  skills: Array<{ id: string; level: number }>;
  skillTree: Array<{ pointId: string; level: number }>;
  lightCone: {
    id: string;
    level: number;
    promotion: number;
    rank: number;
  } | null;
  relics: Array<{
    setId: string;
    type: 1 | 2 | 3 | 4 | 5 | 6;
    level: number;
    rarity: number;
    mainAffix: PlayerAffixDto | null;
    subAffixes: PlayerAffixDto[];
  }>;
  stats: Array<{
    field: string;
    value: number;
    display: string;
    percent: boolean;
    base: number | null;
    addition: number | null;
  }>;
}

interface PlayerAffixDto {
  type: string;
  value: number;
  display: string;
  percent: boolean;
}
```

`stats` 以 `statistics` 的顺序为主，再按 `field` 连接 `attributes` 与 `additions`，不能按数组下标连接。某一侧缺失时保留 `null`，不能伪造成 0。

### 5.2 稳定性判断

结论是：**当前 V2 响应可以稳定投影这份窄 DTO，但必须由自有 guard 保护，不能把上游响应直接透传。**

调查时以 `version=v2&language=cn`、自定义 User-Agent、未使用 `force` 实测三个 UID。一个主样本返回 6 个角色，另外两个样本分别返回 8 个和 7 个角色；玩家、角色、光锥、遗器、`statistics`、`attributes`、`additions`、`skills`、`skill_trees` 均可读取。

MiHoMo 官方 API 总说明要求高频调用方在 User-Agent 中加入应用信息；parsed endpoint 文档列出 `uid`、`language=cn`、`version=v2`、`force=false`。[MiHoMo API](https://march7th.xyz/en/api/)；[Parsed API](https://march7th.xyz/en/api/parsed.html)

但存在三个契约注意点：

1. parsed 文档中的 `avatar`、`space_info`、遗器 `main_affix` 是 optional；目标 DTO 不能把它们无条件声明为非空。
2. 官方 OpenAPI 当前对成功响应没有可用的具体 schema，无法可靠 codegen；应手写窄投影。
3. 实际响应已有 `enhanced`、`statistics` 等比公开模型页更新的字段；文档与 live schema 的演进速度不同，fixtures 必须来自当前响应并去隐私化。

### 5.3 Prompt assumption / reality / docs 冲突

| 项目 | Prompt assumption | 当前仓库 / 实测现实 | 官方文档 | 冲突 | 推荐处理 |
| --- | --- | --- | --- | --- | --- |
| 玩家头像 | 最小 DTO 中头像为必填 | 当前本地没有 Player avatar resolver；live 样本有值 | `avatar` 为 Optional | 必填性过强 | DTO 改为 nullable；正常情况用本地头像，缺失/未知用 placeholder。 |
| 空间统计 | 数量字段可直接展示 | live 样本有 `space_info` | `space_info` 为 Optional | 缺失时不能冒充 0 | 每项用 `number | null`，UI 展示“未知/—”。 |
| 遗器主词条 | 每件遗器有 main affix | live 样本有值 | `main_affix` 为 Optional | 上游缺失会破坏非空 DTO | 使用 nullable，卡片保留可读降级。 |
| 技能等级 | 从 `skills` 连接现有技能 | 普通技能可连；忆灵的可见 `SkillVariant.id` 不在 `skills` | 文档只描述上游模型，不了解本站 progression | 对忆灵不完整 | 以 `SkillProgression.id -> skill_trees.point_id` 为主，`skills` 为交叉校验/回退。 |
| 未激活行迹 | 可由 skill tree 判断 | 三个样本没有 level 0，无法区分“缺失”与“未激活” | 历史模型表述与 parsed 行为不够明确 | 行为未验证 | 编码前补低练度角色 fixture；在此之前区分 missing 与 level 0。 |

## 6. Static Resolver Compatibility Matrix

| Player data | MiHoMo key | Existing local resolver / data | Compatible? | Required mapping |
| --- | --- | --- | --- | --- |
| 角色 | `characters[].id` | 角色 catalog / `details/characters/{id}.json` | 是 | 字符串 ID 直接匹配；实测含开拓者 `8006`。未知 ID 显示降级，不应中止整个玩家。 |
| 强化形态 | `characters[].enhanced` | `Character.profiles.base/enhanced` | 是 | `true` 选择 enhanced，否则 base；Player mode 禁用/隐藏手动 enhanced toggle。 |
| 光锥 | `light_cone.id` | 光锥 catalog / detail / portrait helper | 是 | ID 直接匹配；动态 level/promotion/rank 来自 DTO。 |
| 遗器套装 | `relic.set_id` | 60 个 `RelicSet.id` | 是 | 直接匹配本地名称、效果和分类。 |
| 遗器部位 | `relic.type` | `RelicSlot` + 每套 `pieces[]` | 是 | `1 HEAD, 2 HAND, 3 BODY, 4 FOOT, 5 NECK, 6 OBJECT`；再用 `(setId, slot)` 取部件。 |
| 遗器实例 ID | `relic.id` | 本地部件 ID domain 不同 | 否，也不需要 | 不用实例 ID 做解析；用 `set_id + type`。 |
| 主/副词条 | `affix.type` | 21 个 `RelicProperty.propertyType` | 是（当前版本） | 直接连接 property type，取本地名称/icon；未知 type 以原始 ID 降级。 |
| 推荐词条 | `EquipmentRecommendationView` 的 property types | 现有推荐属性与 `RelicProperty.propertyType` 同域 | 是 | 集合包含判断即可高亮；不比较翻译后的展示名。 |
| 普通技能 variant | `skills[].id` | `SkillVariant.id` | 部分 | 普通技能多数直接匹配；忽略上游内部/秘技 ID。 |
| 技能 progression | `skill_trees[].point_id` | `SkillProgression.id` | 是（实测全部角色） | 作为玩家技能 slider 的主连接。 |
| 行迹 | `skill_trees[].point_id` | `Trace.id` | 是（实测全部角色） | level > 0 视为激活；missing 语义待低练度样本验证。 |
| 星魂 | `characters[].rank` | `Eidolon.rank` | 是 | `eidolon.rank <= character.rank` 为已激活。 |
| 角色统计 | `statistics/attributes/additions[].field` | 本地 `RelicProperty` 可解析大部分装备属性；核心字段固定布局 | 是 | 按 field 连接，不按位置；未知统计放右栏通用行。 |
| 玩家头像 | `player.avatar.id/icon` | 当前无 resolver；上游数据中可找到源文件 | **Gap** | `AvatarPlayerIcon.json` 的 ID -> ImagePath -> `StarRailRes/icon/avatar`，新增本地产物/manifest/helper。 |

### 6.1 `set_id + type` 是否足够

足够，且比 `relic.id` 更正确。当前 60 个遗器套装共有 184 个部件，`(setId, slot)` 组合全部唯一：

- 32 个洞窟套装各有 `HEAD/HAND/BODY/FOOT`；
- 28 个位面套装各有 `NECK/OBJECT`。

实测例如 MiHoMo `set_id=119`、`type=1..4` 能连接本地套装 119 的四个部件；MiHoMo 的实例/部件 ID 与本地生成部件 ID 并非同一域，因此不应依赖它。

### 6.2 affix type 是否能匹配推荐属性

当前可行。三个 live 样本出现 17 种 affix type，全部属于本地 21 种 `RelicProperty.propertyType`，没有发现上游-only type。现有推荐逻辑也使用同一个 propertyType 域，因此推荐主/副词条高亮可以直接比较结构化 key。

这是“当前锁定数据版本 + 当前 MiHoMo V2”的兼容证据，不是永久保证。未知 type 必须可降级，并由 contract telemetry/测试暴露，而不是导致整份玩家资料失败。

### 6.3 skill / skill-tree 连接结论

对六个主样本角色逐项比较后：

- MiHoMo `skill_trees[].point_id` 与本地 `SkillProgression.id + Trace.id` 的并集完全一致；
- 普通 progression 可同时由 `skills[].id` 与 `skill_trees` 验证等级；
- 忆灵 progression（例如本地 `1413301`、`1413302`）在 `skill_trees` 有等级，但对应可见的忆灵 `SkillVariant.id` 不在 `skills`；
- MiHoMo `skills` 还可能包含本地有意过滤的内部/秘技 ID。

因此正确算法是：

1. 对每个本地 `SkillProgression.id` 查 `skillTreeLevelByPointId`；
2. 若存在，用该值决定只读 slider；
3. 对普通技能可用 `skills` 交叉检查，并把不一致记录为 contract drift；
4. 不要求每个上游 skill ID 都能映射本地可见 card；
5. `Trace.id` 同样查 skill tree，但 missing 与 level 0 在获得低练度 fixture 前不能静默合并。

### 6.4 静态 metadata 的交付方式

`src/lib/server/generated.ts` 是构建时文件系统 loader，浏览器和 Function 都不应直接使用。建议构建一个小型、按 locale 的 Player equipment resolver 产物，例如：

```text
static/generated/{locale}/player-info/equipment.json
```

包含：

- `lightCones[id]`：名称、稀有度、命途、图片 URL；
- `relicSets[setId]`：名称、效果、`piecesBySlot`；
- `relicProperties[propertyType]`：本地名称、icon URL；
- 必要时 `playerAvatars[id]`：本地 URL。

角色详情本身仍由现有 `+page.server.ts` 在预渲染时加载。不要把全部本地目录塞进 BFF 响应，也不要在每个角色的 page data 中重复整份遗器/光锥索引。

## 7. Existing Component Reuse Matrix

| Existing component | File | Current responsibility / props | Player Info reuse | Required change |
| --- | --- | --- | --- | --- |
| `CharacterOverviewCard` | `src/lib/components/character/CharacterOverviewCard.svelte` | `entry`, `href`, `imageUrl`, `density` | **直接复用**公开角色卡 | 仅由调用方把 href 构造成 `/characters/{id}?uid=...`。 |
| `OverviewGrid` | `src/lib/components/shared/OverviewGrid.svelte` | `variant=default/compact/character` | **直接复用**角色卡网格 | 无。现有移动端两列/一列逻辑适用。 |
| `SectionHeading` | `src/lib/components/shared/SectionHeading.svelte` | section heading 层级与 tone | **直接复用** | 无。 |
| `CompactEntityCard` | `src/lib/components/shared/CompactEntityCard.svelte` | 通用紧凑实体卡 artwork/content | **作为 primitive 直接复用** | 新建 PlayerLightConeCard 组合它，不把动态装备语义塞回 primitive。 |
| `CharacterOverviewCard` 的图片 helper | `src/lib/assets.ts` 及 manifest | 本地角色预览图 | **直接复用** | 无。 |
| `OverviewSearch` / `SearchBar` | `src/lib/components/shared/OverviewSearch.svelte`；`src/lib/components/search/SearchBar.svelte` | 普通搜索表单，无 busy/error 合同 | **新建 sibling 更合适** | 新建 `PlayerUidForm`，沿用视觉 token；需 disabled、busy、数字输入说明和 error linkage。 |
| `OverviewHero` | `src/lib/components/shared/OverviewHero.svelte` | 目录标题、描述、装饰 artwork | **不直接复用** Player Hero | Player Hero 信息密度与语义不同；新建 `PlayerHero`，沿用 overview/detail surface token。 |
| 角色 detail hero | `src/lib/components/shared/DetailPage.svelte` 内联 markup | 角色身份、profile toggle、base stats | **应抽出共享壳层** | 提取角色详情渲染分支/hero，static 与 player 使用同一页面结构。不要复制整页。 |
| `BaseStatsPanel` | `src/lib/components/shared/BaseStatsPanel.svelte` | 内部可交互 level slider，计算静态 hp/atk/def | **不直接用于真实统计** | 新建 `PlayerStatsPanel`；可抽取小型 level slider primitive，或给现有 progression panel 加受控只读能力。 |
| `SkillCardPanel` | `src/lib/components/character/SkillCardPanel.svelte` | 静态技能卡 | **小型 variant** | 传入 progression level map / player state，保持 card 本体。 |
| `SkillProgressionPanel` | `src/lib/components/character/SkillProgressionPanel.svelte` | 内部 slider 选择演示等级 | **小型 variant** | 支持受控等级与 readonly；undefined 时维持原行为。 |
| `TraceCardPanel` | `src/lib/components/character/TraceCardPanel.svelte` | 静态行迹卡 | **小型 variant** | 可选 activation lookup；inactive 需文字/图标 badge，不能只靠颜色。 |
| `EidolonCard` | `src/lib/components/character/EidolonCard.svelte` | 单个星魂说明 | **小型 variant** | `state?: default/active/inactive`，undefined 完全保持 static。 |
| `EquipmentRecommendationSection` | `src/lib/components/character/EquipmentRecommendationSection.svelte` | 静态推荐套装、主/副词条 | **不直接复用整个 section** | Player mode 替换为新 `PlayerEquipmentSection`；其中复用推荐属性数据作高亮。 |
| `LightConeOverviewCard` | `src/lib/components/light-cone/LightConeOverviewCard.svelte` | 目录卡，只含静态 entry/href/image | **不直接复用** | 新建 `PlayerLightConeCard`，展示真实 level/promotion/rank。 |
| `RelicPropertyToken` | `src/lib/components/relic/RelicPropertyToken.svelte` | 本地属性名称/icon chip | **复用语义或小型组合** | 玩家值行需要 display/value/highlight；建议新 `PlayerAffixRow` 组合属性 metadata。 |
| `RelicDetailPage` | `src/lib/components/relic/RelicDetailPage.svelte` | 套装详情与部件视觉 | **仅复用设计语言** | 新建 `PlayerRelicCard`；不要让详情组件承担装备实例状态。 |
| `DetailArtwork`, `RarityStars`, `SemanticIconLabel` | `src/lib/components/shared/*` | 图片降级、星级、命途/属性标签 | **直接复用** | 无或只由调用方传 player 值。 |
| 现有 empty/error CSS | 多个 overview 页面与 error route | 分散的空状态样式 | **复用 token，不强行复用组件** | 新建 `PlayerQueryState` / inline notice，包含 `aria-live` 与 `role=alert`。 |

组件策略的边界是：共享“视觉 primitive 与静态结构”，Player-specific sibling 承担动态状态。这样既避免复制整页，也不会把所有现有组件改造成布尔 prop 集合。

## 8. Player Page Architecture

### 8.1 路由与 server data

新增 `/player` 静态路由，并加入 `scripts/data/routes.ts` 的 route inventory。建议：

- `src/routes/player/+page.server.ts`：预渲染时加载 97 个角色 catalog 与图片映射；不接收 UID，不调用 MiHoMo；
- `src/routes/player/+page.svelte`：把静态 catalog 传给 Player 页面组件；
- `src/lib/components/player/PlayerPage.svelte`：拥有 UID、query state、DTO 和公开角色过滤/渲染状态；
- `src/lib/components/player/PlayerUidForm.svelte`：只处理表单语义和交互；
- `src/lib/components/player/PlayerHero.svelte`：显示玩家资料；
- `CharacterOverviewCard` + `OverviewGrid`：显示当前公开角色，链接携带 UID。

提交搜索时用 `goto(localizedHref('/player') + '?' + params)` 更新 URL，同时触发 client fetch。页面初始化从 `$page.url.searchParams.get('uid')` 派生查询；back/forward 也因此自然工作。不要维护与 URL 相互竞争的第二份“当前 UID”。

### 8.2 查询、loading、error 放置位置

网络状态应由 `PlayerPage.svelte`（或一个页面级 `createPlayerQuery` module）拥有，而不是放在 form、hero 或全局 layout：

```text
idle            没有 uid，只显示搜索引导
loading         有 uid，保留表单并显示 aria-live loading
success         PlayerHero + public character cards
error           stable error notice + 可重试动作
refreshing      有旧成功数据时静默刷新；保留内容，不闪空屏
```

form 只发出 normalized UID；client module 负责 cache/dedupe/fetch；页面决定展示。这样角色 detail 也能复用同一 client cache，而不复用 Player 首页 UI。

### 8.3 Player Hero

`OverviewHero` 的内容模型是“eyebrow + title + description + artwork”，不适合塞入 UID、等级、世界等级、签名、收藏统计。应新建 Player Hero，但复用现有颜色、border、radius、type scale 与 `DetailArtwork` 的 fallback 行为。

推荐 hero 数据策略：

- 头像优先取本地 `avatar.id` resolver；
- 本地未知或 `avatar=null` 时显示 initials/placeholder；
- 不直接加载 MiHoMo 返回的远端相对 icon；
- `spaceInfo` 的 null 显示 `—`，不能显示 0；
- nickname/signature 作为不可信文本正常转义；不使用 HTML 注入。

## 9. Player Character Mode Architecture

### 9.1 不复制 Character Detail

当前 `/characters/{id}` 由 `src/routes/[category=category]/[id]/+page.server.ts` 预渲染本地详情，`+page.svelte` 交给 `DetailPage.svelte`。角色 hero、技能、行迹、星魂和装备 section 都集中在后者。

建议把 `DetailPage.svelte` 中的角色分支提取为共享 `CharacterDetailPage.svelte`，保持一个页面结构：

```ts
interface CharacterDetailPageProps {
  detail: Character;
  specialEffectTargets: CatalogEntry[];
  equipmentRecommendation?: EquipmentRecommendationView;
  playerCharacter?: PlayerCharacterDto; // undefined = 原 static mode
}
```

真正的 mode 判定过程是：

1. 无 `uid`：不加载 Player client，`playerCharacter=undefined`，完全执行当前 static behavior；
2. 有 `uid`：从 session cache / BFF 加载玩家；
3. 成功且角色在公开角色列表中：传入该 `PlayerCharacterDto`；
4. 成功但角色不在玩家公开列表：显示明确“该角色未公开”，不能静默展示为 static mode；
5. 加载或失败：保留静态角色身份信息，但展示 Player-mode loading/error，不伪装为普通详情。

### 9.2 Player mode 的分区替换

| Detail area | Static mode | Player mode |
| --- | --- | --- |
| Profile | 现有 enhanced toggle（有 enhanced profile 时） | 由 `progression.enhanced` 选 base/enhanced；隐藏或禁用手动 toggle。 |
| Character level | 现有可交互 base stat slider | 显示真实 level/promotion，只读。 |
| Skills | 演示 slider | 同一卡片，slider 受控为真实等级且 readonly。 |
| Traces | 全部静态展示 | 同一卡片叠加 active/inactive/unresolved 状态。 |
| Eidolons | 全部静态展示 | rank 小于等于真实 `rank` 为 active，其余 inactive。 |
| Stats | `BaseStatsPanel` 计算静态 hp/atk/def | `PlayerStatsPanel` 展示 statistics/base/addition。 |
| Equipment | `EquipmentRecommendationSection` | `PlayerEquipmentSection`：真实光锥 + 6 遗器；推荐属性仅作为高亮。 |

### 9.3 保证 static mode 不受影响

必须遵守以下实现约束：

- `playerCharacter` 为 optional，所有现有 prop 默认值和分支保持不变；
- 无 `uid` 时不 import/执行 fetch side effect；
- `SkillProgressionPanel`、`TraceCardPanel`、`EidolonCard` 的新增 player prop 为 optional，undefined 的 DOM 与交互快照应保持现状；
- `equipmentRecommendation` 的原 static section 不修改语义，只在 Player mode 选择 sibling section；
- 添加 regression tests：现有典型普通角色、enhanced 角色、光锥/遗器 detail 的静态 HTML 与行为；
- query 中仅有 `enhanced`、筛选或其他现有参数时，不进入 Player mode。

## 10. Relic / Stat UI Feasibility

### 10.1 遗器卡

建议新建 `PlayerRelicCard`，输入是“一件动态遗器 + 已解析的本地套装/部件/属性 metadata + 推荐属性集合”。每张卡显示：

- 本地部件图片与名称；
- 套装名称；
- 部位、稀有度、强化等级；
- 主词条和值；
- 副词条和值；
- 推荐命中状态。

推荐高亮只使用 `affix.type` 与推荐 property type 的结构化匹配。高亮必须同时有文字/图标标记，不能只改变颜色。`mainAffix=null` 或 unknown property 仍要显示可读 placeholder，不应移除整张卡。

MiHoMo `relic_sets` 不需要进入 DTO。套装件数由当前角色的 `relics` 按 `setId` 计数，本地 `RelicSet` 提供 2/4 件套效果。这样避免动态响应重复静态描述。

### 10.2 Stats projection 与固定布局

实现算法：

```text
statistics（保持上游展示顺序）
   ├─ by field join attributes -> base
   └─ by field join additions  -> addition
```

左栏固定字段：HP、ATK、DEF、SPD、CRIT Rate、CRIT DMG；右栏显示其余统计。所有字段按 `field` 判断，不比较中英文 label。

显示规则：

- 总值优先使用 `statistics.display`；
- base/addition 可分别显示分解；
- `percent` 决定格式语义，但不重新推导/四舍五入上游 display；
- 找不到本地翻译/icon 的 field 时显示稳定 fallback label（例如原始 field），但保留值；
- Stats toggle 只切换总值与 base/addition 展示，不改变数据或触发网络请求。

`BaseStatsPanel` 不适合直接承载这一模型：它目前根据本地 progression 和内部 level slider 计算 hp/atk/def，语义与玩家最终统计不同。新建 `PlayerStatsPanel` 是更安全的 sibling。

### 10.3 Level slider

Player mode 仍可沿用现有 slider 视觉，但必须是只读表达：

- 角色 level：真实 `progression.level`；
- skill progression：由 `skill_trees.point_id` 连接出的真实 level；
- 禁止用户拖动造成“看似真实、实际模拟”的状态；
- 保留可访问文本，例如“当前等级 6 / 10”，不要只依赖 disabled range 的视觉。

可以抽一个很小的 `LevelTrack` primitive，static mode 传交互 callback，Player mode 传 readonly；不建议给 `BaseStatsPanel` 堆叠大量 player-only props。

## 11. Cache / Rate Limit / Error Strategy

### 11.1 Browser cache 与请求去重

最小策略：

- module-level `Map<uid, Promise<PlayerInfoDto>>`：同一页面生命周期 in-flight dedupe；
- `Map<uid, {data, fetchedAt}>`：SPA 导航复用；
- 可选 `sessionStorage`：同一 tab reload 后复用，key 包含 DTO schema version；
- success TTL 建议从 5–15 分钟起步；
- 不使用 `localStorage`，不做长期历史，不引入 IndexedDB；
- retry/refresh 更新同一个 UID cache；
- 角色 detail 首先查 cache，避免从 Player 首页进入时再次请求。

### 11.2 BFF cache 与去重

玩家公开展示数据不含本站身份认证，可使用共享 CDN cache。建议初始值：

```http
Cache-Control: public, max-age=0, must-revalidate
Vercel-CDN-Cache-Control: public, s-maxage=300, stale-while-revalidate=600
```

Vercel 仅对合适的 GET 响应缓存，且有专门的 CDN cache header。[Vercel CDN Cache](https://vercel.com/docs/caching/cdn-cache)

BFF 进程内可以用 `Map<uid, Promise>` 做同一 warm instance 的 in-flight dedupe，但不能把它当作全局一致缓存。V1 不需要 Redis/KV/数据库。MiHoMo 自身可能缓存响应，但本站仍应有自己的减压层。

错误响应全部 `Cache-Control: no-store`。429 的 `Retry-After` 可安全归一化后传给前端；不要缓存为玩家不存在。

### 11.3 timeout / 429 / 5xx

- upstream timeout：`AbortController` 6–8 秒；返回本站 `504 UPSTREAM_TIMEOUT`；不做盲目自动重试。
- 429：返回 `429 RATE_LIMITED`，保留合法的 `Retry-After` 秒数；UI 禁用立即重复提交并给出可重试时间。
- upstream 5xx / 网络失败：返回 `503 UPSTREAM_UNAVAILABLE`；UI 可重试。
- 上游 200 但 schema 无法投影：返回 `502 UPSTREAM_INVALID_RESPONSE`，记录不含隐私/响应正文的 server log。
- player not found：只在上游语义明确时映射 `404 PLAYER_NOT_FOUND`；不能把 timeout/5xx 当作不存在。
- 单次用户动作不应同时从 Player 首页与角色卡预取多个 UID；本 scope 永远只查当前 UID。

### 11.4 稳定错误合同

```ts
type PlayerErrorCode =
  | 'INVALID_UID'
  | 'PLAYER_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_INVALID_RESPONSE';

interface PlayerErrorResponse {
  error: {
    code: PlayerErrorCode;
    retryable: boolean;
    retryAfterSeconds?: number;
    requestId?: string;
  };
}
```

| Code | HTTP | Retryable | 前端行为 |
| --- | ---: | --- | --- |
| `INVALID_UID` | 400 | 否 | 聚焦输入框，显示数字 UID 规则。 |
| `PLAYER_NOT_FOUND` | 404 | 否 | 显示未找到/未公开提示。 |
| `RATE_LIMITED` | 429 | 是 | 显示等待时间，之后允许重试。 |
| `UPSTREAM_TIMEOUT` | 504 | 是 | 保留 UID 与旧数据（如有），提供重试。 |
| `UPSTREAM_UNAVAILABLE` | 503 | 是 | 同上。 |
| `UPSTREAM_INVALID_RESPONSE` | 502 | 是（稍后） | 提示服务数据暂不可用；不要暴露 raw response。 |

错误 message 不由 BFF 返回中文或英文；浏览器按 `code` 映射 Paraglide message，避免服务端承担 locale 状态。

### 11.5 User-Agent 与运行时依赖

User-Agent 应集中在 `api/_player/config.ts`，例如：

```text
HSR-Database-PlayerInfo/1.0 (+https://hsrarchive.cc)
```

不要散落在 fetch call，也不要绑定易变 build SHA。产品集成版本可人工升级，联系 URL 可由环境变量覆盖。

不需要新增 server-side runtime dependency：Node runtime 的 `fetch`、`AbortController`、`Request`、`Response` 足够；窄 DTO 的 guard 数量有限，手写能得到更小 bundle 与更明确错误。若未来 endpoints 数量显著增加，再评估 schema library。

## 12. Responsive Design Impact

### 12.1 Player Hero

桌面使用头像 + 身份 +统计的多列布局；在现有详情断点约 820px 下折为单列。签名允许换行，UID 使用等宽/可选复制按钮但不可迫使横向滚动。头像缺失时 placeholder 保留固定尺寸，避免 layout shift。

### 12.2 Character Stats

- 桌面：固定两列，左栏固定六项，右栏其余字段；
- 移动端：一列，完整左栏在前、右栏在后；
- 不用 CSS masonry/自动重排把左右语义混合；
- base/addition toggle 的 label 在窄屏仍可读。

### 12.3 Relics

按需求显式设定：

- 宽屏：3 × 2；
- 中屏：2 × 3；
- 手机：1 × 6。

这里不应依赖 `auto-fit` 得到偶然列数。每张卡的 affix 值允许安全换行，主词条与推荐 badge 不挤占名称。

### 12.4 Skills / Traces / Eidolons

- 现有 detail sections 的 820px 折叠可以沿用；
- inactive 状态同时使用 opacity/边框与明确文字 badge，满足非颜色识别；
- readonly slider 保持足够触控高度，但不响应拖动；
- Player loading/error 不让整个静态角色详情发生大幅 layout shift。

建议在 320、375、768、820、1024、1440px 做视觉回归；重点覆盖长英文属性名、长签名、6 件遗器与未解析 ID。

## 13. Proposed File-Level Change Plan

下表是建议变更清单，不代表本轮已经修改。

| File | Action | Purpose |
| --- | --- | --- |
| `api/player.ts` | **新建** | 唯一公开 GET endpoint；输入校验、调用 upstream、设置 cache/error response。 |
| `api/_player/config.ts` | **新建** | endpoint、`version=v2`、`language=cn`、User-Agent、timeout、cache 常量。 |
| `api/_player/contract.ts` | **新建** | MiHoMo unknown input guard、大小/数组边界和窄类型。 |
| `api/_player/project.ts` | **新建** | 投影 PlayerInfo DTO，按 field 连接 stats。 |
| `api/_player/errors.ts` | **新建** | 六类稳定 error code 与 upstream 状态映射。 |
| `src/lib/player-info/contracts.ts` | **新建** | 浏览器 DTO/error 类型、schema version。 |
| `src/lib/player-info/client.ts` | **新建** | same-origin fetch、session cache、in-flight dedupe、retry。 |
| `src/lib/player-info/resolvers.ts` | **新建** | 角色/光锥/遗器/属性/头像的本地 metadata 连接。 |
| `src/lib/player-info/state.ts`（可选） | **新建** | 若页面与 detail 的 query state 逻辑不能保持小型，再抽纯状态机；不要先过度设计。 |
| `src/routes/player/+page.server.ts` | **新建** | 预渲染本地角色 catalog/asset map。 |
| `src/routes/player/+page.svelte` | **新建** | Player 页面入口。 |
| `src/lib/components/player/PlayerPage.svelte` | **新建** | 页面级 UID/query state、Hero、公开角色 sections。 |
| `src/lib/components/player/PlayerUidForm.svelte` | **新建** | UID validation UI、busy、accessible errors。 |
| `src/lib/components/player/PlayerHero.svelte` | **新建** | 玩家身份、头像、signature、space stats。 |
| `src/lib/components/player/PlayerQueryState.svelte` | **新建** | loading/error/empty + `aria-live` / retry。 |
| `src/lib/components/player/PlayerStatsPanel.svelte` | **新建** | 真实 statistics、base/addition toggle、固定两栏。 |
| `src/lib/components/player/PlayerEquipmentSection.svelte` | **新建** | 真实光锥、遗器与套装计数。 |
| `src/lib/components/player/PlayerLightConeCard.svelte` | **新建** | 基于 `CompactEntityCard` 的动态光锥卡。 |
| `src/lib/components/player/PlayerRelicCard.svelte` | **新建** | 部件、affixes、等级、推荐命中。 |
| `src/lib/components/player/PlayerAffixRow.svelte` | **新建** | property metadata + dynamic value + highlight。 |
| `src/lib/components/character/CharacterDetailPage.svelte` | **新建/从现有提取** | 角色详情唯一共享渲染层，接受 optional player data。 |
| `src/lib/components/shared/DetailPage.svelte` | **修改** | 委托角色分支给共享 CharacterDetailPage；其他 category 不变。 |
| `src/routes/[category=category]/[id]/+page.svelte` | **修改** | 在 characters + uid 时装配 Player mode；无 uid 原路径不变。 |
| `src/lib/components/character/SkillProgressionPanel.svelte` | **小改** | optional controlled/readonly level；默认维持内部 slider。 |
| `src/lib/components/character/SkillCardPanel.svelte` | **小改** | 向 progression 传 player level map。 |
| `src/lib/components/character/TraceCardPanel.svelte` | **小改** | optional activation map / unresolved state。 |
| `src/lib/components/character/EidolonCard.svelte` | **小改** | optional active/inactive/default state。 |
| `scripts/data/routes.ts` | **修改** | 加入 canonical `/player`，不加入 UID query。 |
| `src/lib/navigation.ts` | **修改** | 添加 Player Info 导航项与 icon key。 |
| `src/lib/domain/visual-assets.ts` | **修改** | manifest schema 增加 player avatar / player navigation asset 类别。 |
| `scripts/assets/shared.ts` | **修改** | 读取/生成/校验头像与新导航 icon，升级 manifest schema。 |
| `scripts/assets/paths.ts` | **修改** | 新增 player avatar 输出目录。 |
| `scripts/deployment/prepare.ts` | **修改** | 稀疏同步 `AvatarPlayerIcon.json` 与需要的 `icon/avatar` 源。 |
| `src/lib/assets.ts` | **修改** | `getPlayerAvatarIconUrl` 与 fallback。 |
| `scripts/data/*` | **修改/新增 generator** | 生成 localized player equipment resolver index。具体落点应沿用现有 view compiler 边界。 |
| `src/lib/server/generated.ts` | **小改** | 为 `/player` server load 暴露现有角色目录读取；不用于 runtime Function。 |
| `messages/zh-CN.json`、`messages/en.json`、`messages/contracts.json` | **修改** | Player 页面、字段、错误、状态与可访问文本。 |
| `vercel.json` | **默认不改** | 仅在 Phase 0 证明需要 maxDuration/build override 时做最小变更。 |
| `svelte.config.js` | **不改 adapter** | 只应自然消费更新后的 route manifest。 |

### 测试文件建议

| File | Coverage |
| --- | --- |
| `tests/unit/player-contract.test.ts` | DTO 投影、optional 字段、unknown 字段、大小边界、六类错误。 |
| `tests/unit/player-resolvers.test.ts` | character/LC、`setId+type`、affix、skills/tree、头像 fallback。 |
| `tests/unit/player-cache.test.ts` | TTL、session schema、in-flight dedupe、retry/no-store。 |
| `tests/unit/player-routing.test.ts` | `/player?uid=`、`/characters/{id}?uid=`、locale query/hash 保留。 |
| `tests/components/player-page.test.ts` | idle/loading/success/error、公开角色链接与 a11y。 |
| `tests/components/player-character-mode.test.ts` | static regression、enhanced profile、skills/traces/eidolons/equipment。 |
| `tests/integration/player-function.test.ts` | fake upstream 的 UA、URL、timeout、429/5xx/schema drift/cache header。 |
| `tests/deployment/*` | `/player` 进入 manifest，Function bundle/route config 的 CI audit。 |

## 14. Implementation Phases

### Phase 0 — Deployment proof and fixtures（必须先做）

- 拉取真实 Vercel Project Settings；
- 用最小 probe Function（可在短期分支）运行 `vercel build` / Preview，证明 adapter-static 与 `/api` 并存；
- 记录 route config 数量与 Function bundle；
- 保存去隐私化 fixtures：正常、avatar/space_info/main_affix 缺失、低练度未激活行迹、忆灵、enhanced、429、not found；
- 决定并记录 Player avatar V1 策略。

**Exit criteria：** Preview 同时服务当前静态站与一个原生 Function；route count 明确未接近上限；行迹 missing/zero 语义有样本答案。

### Phase 1 — Contract and BFF

- 实现 `api/player.ts` 与 `_player` helpers；
- 固定 endpoint/query/User-Agent；
- timeout、error envelope、CDN headers、投影 guards；
- 用 fixtures 做纯单元/集成测试；
- 不触碰页面 UI。

### Phase 2 — Static resolver and assets

- 生成 Player equipment resolver index；
- 补 Player avatar 的 pinned sparse data/asset pipeline；
- 增加 local URL helper、manifest validation、unknown fallback；
- 验证所有当前 set/slot/property domains。

### Phase 3 — `/player` page

- 新增静态路由、导航和 i18n；
- 实现 UID form、query state、browser cache、Player Hero；
- 直接复用 `CharacterOverviewCard` / `OverviewGrid`；
- 保证所有角色链接只增加 `uid`。

### Phase 4 — Player-aware Character Detail

- 提取共享角色详情渲染层；
- 实现 optional Player mode；
- 先接 progression / enhanced / eidolon，再接 skill/tree；
- 新建 Player stats 与 equipment siblings；
- 保证无 UID 的 static regression 全绿。

### Phase 5 — Responsive, accessibility, deployment hardening

- 320–1440px 视觉与键盘/读屏检查；
- 429/timeout/stale cache 的实际 Preview 测试；
- `vercel build` route/function audit 加入发布检查；
- Production smoke tests 后再开放入口。

## 15. Risks / Open Questions

### 15.1 风险最高的 5 点

| Risk | Likelihood / impact | Mitigation |
| --- | --- | --- |
| Vercel Project Settings 导致原生 Function 未被打包，或 route config 与推断不同 | 中 / 高 | Phase 0 用真实项目 `vercel build` + Preview 作为硬门槛；不先改 preset。 |
| MiHoMo schema 演进、响应可选字段或队列/限流行为 | 中 / 高 | 窄投影、nullable、大小边界、稳定 error code、短 TTL、去隐私 fixtures。 |
| skill 与 skill tree 域误连，尤其忆灵 | 高 / 高（若按旧假设实现） | progression 以 `point_id` 为主；普通 skills 只交叉校验；unknown 不破坏整页。 |
| 玩家头像资源使静态资产体积/管线复杂度上升 | 中 / 中 | 基于 `AvatarPlayerIcon` 生成需求集合，不盲目复制；测量压缩后产物。当前源目录约 307 文件、8.1 MB。 |
| 本地锁定静态数据与最新玩家角色/装备暂时不同步 | 中 / 中 | unknown ID 可读降级；不要从 MiHoMo 复制静态 metadata；上游更新后由现有 pinned pipeline 收敛。 |

### 15.2 编码前仍需额外样本验证

1. **低练度 / 未点行迹角色**：确认 parsed V2 是返回 `level: 0`、省略条目，还是其他状态。
2. **忆灵角色的多种养成等级**：继续确认 progression point level 与 UI slider 的上下限语义。
3. **可选字段缺失**：寻找或构造 `avatar=null`、`space_info=null`、`main_affix=null` fixture。
4. **not found / invalid / private-like 状态**：记录 MiHoMo 实际 HTTP status/body，确保只在明确语义时返回 404。
5. **429 / queue timeout / 5xx**：用 fake upstream 覆盖全部合同；Preview 中在不施压上游的前提下验证 header 传播。
6. **enhanced 角色**：至少一个 base/enhanced profile 对照，确认 `enhanced` 缺失时的兼容策略。
7. **新版本未知 ID**：character、light cone、set、affix、avatar 各准备一个 synthetic unknown fixture。
8. **真实 Vercel 项目**：Framework Preset、Build Command、Output Directory、Node runtime、route config 与 cache header 的最终行为。

### 15.3 不构成 blocker 的已知限制

- 官方 OpenAPI 没有成功响应 schema：自有窄 guard 足以解决。
- `pnpm dev` 不运行原生 Function：使用 `vercel dev` 与 fake handler tests 即可。
- 角色 query 不参与 prerender：正是目标设计，不需要为每个 UID 生成页面。
- BFF 固定 `language=cn`：按已定调用规范执行；正常 UI 文本来自本地 zh-CN/en metadata，未知 ID 只显示稳定 fallback，不把中文上游描述混入英文页。

## 16. Final Recommendation

### 16.1 对 28 个问题的明确回答

#### A. Deployment

1. **可行。** 当前 repo 可保留 `adapter-static` 并增加一个根目录原生 Vercel Function。
2. **最佳结构**是 `api/player.ts + api/_player/*`，浏览器逻辑放 `src/lib/player-info/*`；Function 不依赖 SvelteKit server loader。
3. **不需要改 Framework Preset。** 先拉取并记录线上实际设置。
4. **Function discovery 不需要 `vercel.json`。** 只有实测需要 runtime/maxDuration override 时才最小修改。
5. **保留静态 adapter，只新增单 endpoint，并用 `.vercel/output/config.json` + Preview 验证 route 数**，不能用源码猜测精确计数。
6. **本地**用 unit tests + `vercel dev`；**Preview** 用真实 `vercel build/deploy` 验证 bundle/routes/cache；**Production** 复用相同流程和 smoke tests。

#### B. Data

7. **能投影，但需 nullable 与自有 schema guard。** 官方 OpenAPI 不足以 codegen。
8. **当前可解析**角色、enhanced profile、光锥、遗器套装/部位、affix/recommendation property、skill progression、trace、eidolon、统计 field。
9. **明确 gap 是 Player avatar。** 另外 MiHoMo relic instance ID 不同域，但实现不需要它。
10. **能。** 当前 `(set_id, type)` 对应本地 `(setId, slot)` 唯一。
11. **能。** 当前样本 affix type 全部匹配 `RelicProperty.propertyType`，并与推荐属性同域；仍需 unknown fallback。
12. **能，但连接规则要修正。** `SkillProgression.id` / `Trace.id` 连接 `skill_trees.point_id`；不能只依赖 `skills.id`。

#### C. UI

13. **直接复用** `CharacterOverviewCard`、`OverviewGrid`、`SectionHeading`、`CompactEntityCard` primitive、图片/星级/语义标签 helpers。
14. **小型 variant** 用于 `SkillProgressionPanel`、`SkillCardPanel`、`TraceCardPanel`、`EidolonCard`。
15. **新建 Player sibling**：UID form、Hero、query state、Stats、Equipment、LightCone、Relic、Affix row。
16. **提取唯一 `CharacterDetailPage` 渲染层并接受 optional `playerCharacter`**；route/page 只装配 mode，不复制页面。
17. **无 UID 不触发 fetch，optional props 为 undefined 时保持现有 DOM/交互，并增加 static regression tests。**

#### D. Runtime

18. **兼容。** 现有 locale routing 能保留 query/hash；`SettingsPopover` 已使用完整 pathname + search + hash，现有测试也覆盖重复 query/hash。新增链接用 `localizedHref` + `URLSearchParams`。
19. **query/loading/error 放在页面级 Player state；** form/hero 只做展示，shared client 管 cache/fetch。
20. **最小缓存**是 browser module/session TTL + Vercel CDN 5 分钟起步；错误 no-store。
21. **减少请求**依靠 in-flight dedupe、SPA/session cache、角色详情复用同 UID、CDN cache；不批量预取。
22. **timeout -> 504、429 -> 429 + Retry-After、5xx/network -> 503、invalid schema -> 502**；不盲目重试。
23. **User-Agent 集中在 `api/_player/config.ts`。**
24. **不需要新增 server-side runtime dependency。**

#### E. Implementation

25. **推荐 6 个 phase**：部署/样本证明、BFF、resolver/assets、Player page、Player Character mode、响应式与发布加固。
26. **文件级清单见第 13 节。**
27. **最高风险**：真实 Vercel 构建行为、MiHoMo schema/限流、skill-tree 连接、头像资源管线、静态数据版本差。
28. **编码前需验证**：未激活行迹、忆灵等级、optional 字段、not found/429/5xx、enhanced、unknown ID 和真实 Vercel 项目设置。

### 16.2 Go / No-Go

**建议 Go，带两个前置 gate：**

1. Phase 0 Preview 证明 `adapter-static` 产物与 `/api/player` Function 能在当前 Vercel 项目设置下并存，route 计数安全；
2. 取得低练度行迹与忆灵 fixture，正式采用 `skill_trees.point_id` 连接规则。

Player avatar 管线应在 Hero 开发前完成；若时间不允许，必须由产品明确接受 V1 placeholder，不能临时直连上游图片路径。

在这两个 gate 通过后，当前方案可以用较小的服务端边界、可控的组件改动和完整的 static-mode 回归保护落地，不需要更换 adapter，也不需要扩大到 Agent、数据库或新服务。

## Appendix A. Evidence and Limitations

### 仓库证据

主要检查文件：

- `svelte.config.js`
- `vercel.json`
- `package.json`
- `vite.config.ts`
- `scripts/deployment/build.ts`
- `scripts/deployment/verify-build.ts`
- `scripts/data/routes.ts`
- `src/routes/+layout.server.ts`
- `src/routes/[category=category]/[id]/+page.server.ts`
- `src/lib/components/shared/DetailPage.svelte`
- 本报告第 7 节所列组件
- `src/lib/domain/types.ts`
- `src/lib/domain/visual-assets.ts`
- `scripts/assets/shared.ts`
- `src/lib/i18n/routing.ts`
- `src/lib/components/layout/SettingsPopover.svelte`
- `tests/unit/localization-correctness.test.ts`

### 上游实测

- 调查日期：2026-09-18；
- endpoint：`sr_info_parsed/{uid}?version=v2&language=cn`；
- 使用自定义 User-Agent；
- 未使用 `force=true`；
- 三个公开 UID 样本仅用于结构核对；live 数据会变化，不能替代 committed fixture；
- 未在报告记录 nickname、signature 等个人展示文本。

### 限制

- 本地没有 `.vercel/` 项目元数据，未在本轮创建 Function 或部署 Preview，因此 Vercel 项目级结论明确标为实施 gate；
- 三个 UID 未提供足够的未激活行迹样本；
- MiHoMo 文档与实际响应存在版本差，结论以“当前实测 + 宽进严出投影”为基础；
- 上游 live probe 只验证可行性，没有做压力测试，也不应对公共服务做压力测试。

## Appendix B. Primary References

- [MiHoMo API overview](https://march7th.xyz/en/api/)
- [MiHoMo parsed API](https://march7th.xyz/en/api/parsed.html)
- [MiHoMo live OpenAPI](https://api.mihomo.me/openapi.json)
- [SvelteKit adapter-static](https://svelte.dev/docs/kit/adapter-static)
- [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Vercel Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel Limits](https://vercel.com/docs/limits)
- [Vercel CLI: vercel dev](https://vercel.com/docs/cli/dev)
- [Vercel CLI deployment / build output](https://vercel.com/docs/cli/deploying-from-cli)
- [Vercel CDN Cache](https://vercel.com/docs/caching/cdn-cache)
