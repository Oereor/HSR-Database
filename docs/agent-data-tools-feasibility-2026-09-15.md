# HSR-Database Agent Data Tools Feasibility

> 调查日期：2026-09-15  
> 仓库分支：`develop`  
> 调查性质：仅调查、分析与设计；未实现 Agent、tool、API route 或部署变更。  
> 事实优先级：当前代码与测试优先；当前生成数据用于规模和字段覆盖快照；历史文档仅用于交叉核对。

## 1. Executive Summary

结论：**HSR-Database 已具备实现小型 Data Agent 的数据基础，但不宜直接把 UI view 当作 Agent API，也不能在当前 Production 静态部署中直接增加运行时 Agent endpoint。** Phase 1 最合适的形态是本地 CLI prototype，在现有生成数据上增加一个很薄的、server-only 的规范化读取层，然后暴露三个只读工具：

1. `search_entities`：复用 Search V2 的文档、归一化、FlexSearch 召回和排名规则，把名称或 alias 解析为稳定实体 ID；
2. `query_endgame`：以明确的“配置 occurrence 行”为粒度，筛选并投影 Endgame 结构化数据；
3. `aggregate_endgame`：在同一规范化行模型上执行有限、确定性的分组与聚合。

候选的三个边界总体合理，但需要以下修正：

- Search V2 的 `endgame` target 不是新的实体类型，而是“Enemy template 在 Endgame 中的 occurrence locator 桶”。Entity Resolution 应以普通 `enemy` document 作为稳定实体身份，避免同一 template 返回 `enemy` 与 `endgame` 两个伪实体。
- `query_endgame` 不应提供含义不清的 `node` 参数。当前模型真实存在的是 `encounter`、`battle slot`、`stage` 和 `wave`；例如 AS 用户口中的“节点 2”通常应解析为 `battleSlot: 2`，而不是在 tool 内暗设一套 node 规则。
- Aggregation 应与 Query 保持两个 tool，但共享同一个内部 row/filter engine。这样模型可以直接取少量明细，也可以让 TypeScript 完成数字运算，不必把任意表达式 DSL 塞进一个大工具。
- Phase 1 支持 `rowCount`、`countDistinct`、`min`、`max`、`avg` 即可。`median` 暂缓；当前更大的风险不是算法实现，而是 PF 行粒度、重复配置以及多阶段 HP 的语义。

当前数据能够可靠回答的典型问题包括：指定模式的当前/历史赛期、最近若干有效赛期的敌人出现情况、实例级每条 HP/速度/韧性、按赛期去重的 Boss 出现频率、具体 MonsterID 的弱点与抗性。不能可靠回答的包括：PF 实际战斗中无限/重复刷怪的整期总 HP、多阶段或共享/回复/锁血 Boss 的有效总 HP、配队与抽卡建议、设计动机。

部署方面，项目使用 `@sveltejs/adapter-static`，所有现有 server load/endpoint 都被预渲染为文件。SvelteKit 本身当然支持运行时 `+server.ts`，Vercel 也支持 SvelteKit Functions，但**当前选定的 adapter 与构建产物不支持未预渲染的 Agent endpoint**。本地验证价值前不应改 adapter；若 prototype 通过 eval，再单独审查改用 `@sveltejs/adapter-vercel` 或部署独立函数的成本。

Agent runtime 建议从最小 direct tool-calling loop 开始：使用 DeepSeek 的 OpenAI-compatible Chat Completions 协议、Zod 本地校验、最多 4 个 model turns / 8 次 tool calls。只抽象一个很薄的 model client 边界，不从第一天建设多 provider registry。OpenAI Agents SDK 与 Vercel AI SDK 都可用，但在“DeepSeek 更现实、当前无任何 Agent 依赖、先本地验证”这一前提下，不是 Phase 1 的最小选择。

## 2. Current Repository Architecture

### 2.1 运行栈快照

当前安装版本由本地 `node_modules` 核对：

| 项目 | 当前值 |
| --- | --- |
| SvelteKit | `2.70.3` |
| Svelte | `5.57.0` |
| Vite | `7.2.4` |
| TypeScript | `5.9.3`，`strict: true`，`moduleResolution: bundler` |
| Adapter | `@sveltejs/adapter-static 3.0.10` |
| Search | `flexsearch 0.8.212` |
| Node / pnpm 约束 | Node `>=22`，pnpm `>=10`；package manager `pnpm@11.9.0` |

关键配置：

- `svelte.config.js` 使用 `adapter-static({ fallback: '404.html' })`；
- `kit.prerender.entries` 为 `['*', ...publicEntries]`，public entries 来自生成 manifest；
- `zh-CN` 为无前缀基础路由，`en` 使用 `/en`；
- `vercel.json` 只允许 `main` 自动部署，其他分支关闭自动部署；
- Preview 由 `.github/workflows/vercel-preview.yml` 手工触发，使用 Vercel CLI；
- Production/Preview 构建都沿用 `pnpm deploy:build`，但 `scripts/deployment/build.ts` 对 Production 使用 CI-backed 路径、Preview 使用完整校验路径；
- `upstream.lock.json` 固定两个外部数据仓库的 commit，部署时准备 `.upstream` checkout，再生成数据和静态资源。

### 2.2 当前 server/browser boundary

仓库已经存在 server-only 代码：

- `src/lib/server/generated.ts`：用 `node:fs/promises` 读取生成 JSON；
- `src/lib/server/endgame.ts`：加载 Endgame dataset、连接 Enemy detail、构建页面 view；
- `src/lib/server/enemies.ts`：生成敌人详情页模型；
- `src/lib/server/enemy-assets.ts`：读取敌人图片 manifest；
- 多个 `+page.server.ts`；
- 三类 `+server.ts`：Endgame 搜索分片、`robots.txt`、`sitemap.xml`。

但这些代码当前都不是 Production 请求时运行的后端：现有 route 均显式或通过全站配置参与 prerender，最终 `build/` 是纯静态输出。`src/routes/generated/[locale]/endgame-occurrences/[targetId]/+server.ts` 虽然写成 endpoint，实际通过 `entries` 枚举并生成静态 JSON 文件。

浏览器端 Search 页面在构建时获得 Search index 和 catalogs，在客户端构造 FlexSearch。命中 Endgame target 后，默认通过 `fetch('/generated/...')` 读取预渲染分片。这是 browser fetch，但 Search 的核心 normalization/ranking/FlexSearch 代码本身并不依赖 DOM。

### 2.3 构建流程

与 Agent 数据有关的主要链路为：

```text
upstream.lock.json
  -> pinned TurnBasedGameData / TextMap
  -> scripts/data/domain/* locale-neutral builders
  -> scripts/data/projection/* per-locale projection
  -> src/lib/generated/views/{locale}/...
  -> static/generated/{locale}/search.json
  -> SvelteKit page/server load at prerender time
  -> adapter-static build/
```

普通开发构建的相关 scripts：

- `data:sync`：完整解析、投影和生成；
- `data:ensure`：确保缓存/生成数据可用；
- `data:validate`、`data:audit`：数据校验与审计；
- `predev` / `prebuild`：先确保数据和资源；
- `build`：`vite build`；
- `deploy:build`：固定 upstream、校验、资源准备、Vite build、最终资源闭包验证。

### 2.4 对运行时 Agent endpoint 的直接回答

**SvelteKit 代码组织可以自然容纳 endpoint；当前部署产物不能自然容纳。**

- 在开发服务器中新增非 prerendered `+server.ts` 可以运行；
- 在当前 `adapter-static` Production build 中，依赖模型 API、私有 key 和请求体的动态 endpoint 无法被预渲染；
- Vercel 官方的 SvelteKit Functions 路径是采用 Vercel adapter，保留动态 route 为 Node/Edge Function。[Vercel SvelteKit 文档](https://vercel.com/docs/frameworks/full-stack/sveltekit)
- 若将来切换 adapter，现有页面可继续逐路由 prerender，只让 Agent route 动态化；但必须验证动态 `node:fs` 路径所需的 generated JSON 是否进入函数包、函数体积和冷启动，而不能假设静态站构建时可读就等于函数运行时可读。Vercel 说明 SvelteKit Functions 使用 Node File Trace 并支持附加文件，但动态路径仍应做部署验证。[Vercel Functions 文件文档](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions)

因此 Phase 1 不应为了一个尚未验证价值的 Agent 改变整个部署 adapter。

## 3. Existing Data Capabilities

### 3.1 分层与可复用性

| 层 | 代表目录/文件 | 性质 | Agent 复用判断 |
| --- | --- | --- | --- |
| Raw access | `scripts/data/raw.ts`、上游 JSON | 构建期、依赖 sibling repo | 不应在 Agent runtime 读取 |
| Locale-neutral domain build | `scripts/data/domain/*`、`src/lib/domain/neutral.ts` | 稳定解析与关系归一化 | 作为数据生成事实来源，不直接放进运行时 |
| Endgame domain | `src/lib/domain/endgame.ts` | 强类型、保留精确十进制和解析状态 | Phase 1 的主要稳定 domain contract |
| Locale projection | `scripts/data/projection/*` | 把 TextRef 投影为指定 locale 文本 | 继续复用现有生成产物 |
| Generated views | `src/lib/generated/views/{locale}` | 已本地化、route-shaped JSON | Agent runtime 的实际只读数据源 |
| View/presentation | `src/lib/domain/*-view.ts`、components | 页面标签、格式化、卡片合并 | 只复用经确认的纯函数，不把完整 view 当 Agent schema |
| Server loaders | `src/lib/server/*` | 文件读取、缓存、页面 enrichment | 可复用 `getEndgameDataset` / `getSearchIndex`；避免图片 enrichment |

### 3.2 Character

当前投影模型 `Character` 能提供：稳定 Avatar ID、本地化名称/基础名/描述、稀有度、命途、属性、基础属性成长、普通/强化 profile、技能卡和等级描述、行迹、星魂、特殊效果关系、装备推荐。

适合 Agent 的稳定字段是 ID、名称、path、element、rarity 与结构化技能/属性数据。`CatalogEntry` 是轻量展示/检索投影；`CharacterProfile` 等属于可脱离 Svelte 使用的 TypeScript 数据。图片 URL、card density、导航 href 属于 UI。

本次 Phase 1 不建议立即暴露 Character detail tool，因为核心实验问题集中在 Endgame；`search_entities` 先能解析 Character ID 即可。

### 3.3 Light Cone

`LightCone` 包含稳定 ID、名称、描述、稀有度、命途、故事、被动技能叠影等级和基础属性成长。解析位于 `scripts/data/domain/light-cone.ts`，投影位于 `scripts/data/projection/light-cone.ts`。这些模型不依赖 Svelte component。

Phase 1 同样只需让 Entity Resolution 返回稳定 ID 与基础 metadata，不需开放详情分析。

### 3.4 Relic

`RelicSet` / `RelicCatalogEntry` 包含套装 ID、名称、洞穴/位面分类、2/4 件套效果、部件、来源、属性 code，以及 `version`。当前生成快照中 60 个 Relic catalog entry 都带 `version`；Character、Light Cone、Enemy catalog 当前没有逐实体 `version`。

### 3.5 Enemy

Enemy 模型明确区分：

- `MonsterTemplate`：template ID、名称、rank、基础 HP/攻击/防御/速度/韧性等；
- `Monster`：具体 MonsterID、HardLevel/Elite group、实例倍率、逐等级属性、弱点、元素抗性、特殊抗性、召唤和技能；
- `Enemy`：一个 template 加其全部具体 Monster records，并指定 canonical/default Monster。

当前 rank 原始值只有 `Minion`、`MinionLv2`、`Elite`、`LittleBoss`、`BigBoss`。`src/lib/domain/enemy-overview.ts` 已有产品映射：前两者为 `normal`，`Elite` 为 `elite`，后两者为 `boss`。这项映射可复用，但该模块同时 import Paraglide message，未来最好把纯映射抽到不依赖本地化 UI 的 shared domain module。

### 3.6 Shared/common model 与版本信息

- 精确战斗数值使用 branded `DecimalString`，计算链由 BigInt/字符串十进制 helper 完成；Agent tool 不应先转 JavaScript `number` 再计算大 HP。
- TextMap hash 全程保留字符串；runtime Agent 只读已经投影的文本，不需要加载完整 TextMap。
- 当前 `manifest.json` schema 43，数据快照为游戏 `4.5.0` / 简版 `4.5`，source commit `8dc7843723cf6f2d6acafee0b3fb152c90994208`，data revision `6f4dc916...`。
- Manifest 提供全局数据版本、locale、实体数量、Endgame 摘要和各 artifact digest；**没有 season-specific game version**。回答“这个赛期属于哪个版本”不能仅凭现有 season model可靠得出。

当前生成快照规模：97 Character、169 Light Cone、60 Relic、628 Enemy template；Endgame 共 56/26/20/9 个 MoC/PF/AS/AA group。

## 4. Endgame Data Flow

### 4.1 完整链路

```text
TurnBasedGameData tables / Config ability bodies
  -> scripts/data/endgame.ts + pure-fiction-hp.ts + enemy-stats.ts
  -> EndgameDomain（locale-neutral，仅内存，含 TextRef 与 occurrenceId）
  -> scripts/data/projection/endgame.ts
  -> EndgameModeDataset schema 24（zh-CN / en）
  -> src/lib/server/endgame.ts
  -> buildModeView / buildGroupView / buildOccurrenceView
  -> Svelte Endgame components
```

主要原始关系包括 group/config/tierce、schedule、PlaneEvent、Stage、fixed MonsterList、Infinite group/wave/monster group、MonsterConfig、MonsterTemplateConfig、HardLevelGroup、EliteGroup/InfiniteEliteGroup，以及各模式 mechanic 表。

### 4.2 Season / Group

`EndgameGroup` 可靠提供：

- `mode`: `moc | pf | as | aa`；
- `groupId`；
- 可选本地化 `name`；
- 可选 `schedule.begin/end`；
- encounters；
- mode-specific mechanics。

状态规则由 `buildPeriodView()` 定义：按 `+08:00` 解析 schedule，`begin <= now < end` 为 current，未来为 upcoming，已结束为 historical，无 schedule 为 unknown。此状态应在每次 Agent 查询时计算，不应复用构建 Search shard 时冻结的状态。

当前快照的 schedule 覆盖：

| Mode | Groups | 有 schedule | 无 schedule |
| --- | ---: | ---: | ---: |
| MoC | 56 | 54 | 2 |
| PF | 26 | 26 | 0 |
| AS | 20 | 20 | 0 |
| AA | 9 | 0 | 9 |

2026-09-15 快照下，当前赛期分别为 MoC 1034、PF 2026、AS 3020；AA 全部只能标记 unknown。

Raw datasets 按 groupId 升序生成。`buildModeView()` 会计算状态和推荐项，并对 periods 做页面顺序处理，但这不是一个适合分析的通用“最近 N”契约。尤其 MoC 108/109 的配置时间在 2033 年，而 ID 又属于早期组；Agent 应默认从“当前 + 已结束且有有效 schedule”的集合中按 begin 倒序取 latest，只有显式 `includeUpcoming` 才加入未来赛期。AA 无 schedule 时必须标记 `orderingBasis: 'group-id-fallback'`，不能伪称时间排序。

### 4.3 Encounter / Battle Slot / Stage / Wave

当前没有名为 `Node` 的 domain interface。真实层级是：

- `EndgameEncounter`：`id`、`configId`、可选名称/ordinal、`variant`；
- `variant`：`floor | preliminary | boss-normal | boss-hard`；
- `EndgameBattleSlot`：`slot` 与 stages；
- `EndgameStage`：`eventId`、`stageId`、`level`、`hardLevelGroup`、stage abilities、previewMonsterIds、wave model；
- Fixed wave：顺序 wave number 与实际 occurrence 列表；
- Spawn sequence：wave group ID、wave ID、monster group、ordered enemies、max counts、ability/params、PF mechanic。

MoC、AS 使用 fixed stage；PF、AA 使用 spawn-sequence stage。Tierce 可以产生 slot 1/2/3。AA 的 preliminary/boss-normal/boss-hard 是 encounter variant，不是敌人 rank。

`previewMonsterIds` 只用于配置预览；测试明确确认 AA 分析应使用实际 spawn 的 MonsterID，而不能把 preview ID 当 occurrence。

### 4.4 Enemy Instance 可分析字段

当前生成的 `EnemyOccurrence` 直接包含：

- `monsterId`：具体战斗记录 ID；
- `monsterTemplateId`：百科/template 身份；
- 本地化 `name`；
- HP factors：template base、instance ratio、level ratio、elite ratio、base encounter max HP per bar；
- 最终 HP：resolved/unresolved、`maxHpPerBar`、来源与取整策略；
- Elite context：group ID、普通/无限表、stage/spawn/fallback 来源、verified/inferred；
- Speed：resolved factors 与 `configuredValue`，或明确 unavailable reason；
- Toughness：internal stance factors、玩家侧 `perBar`、bar count、static/runtime-unclear；
- Mechanics：phase count、summon MonsterIDs、shared/restores/locks/manipulates HP、ability references、effective total HP 及其状态。

以下字段需要按 `monsterTemplateId -> Enemy detail -> exact monsterId` 连接：

- raw rank 与 `normal | elite | boss` 产品分类；
- 具体实例 weaknesses；
- 元素 resistances；
- special resistances；
- skills/summons 等百科字段。

不能仅用 Enemy catalog 的 canonical weaknesses 替代该连接。真实测试显示同一 template 的 canonical Monster 与 PF concrete Monster 可能弱点不同，现有 `resolveEndgameEnemyReference()` 在找不到具体 MonsterID 时也会显式失败而非回退。

当前生成快照的 occurrence 覆盖：

| Mode | 配置 occurrences | HP resolved | Speed resolved | Toughness resolved |
| --- | ---: | ---: | ---: | ---: |
| MoC | 7,188 | 7,188 | 7,178 | 7,155 |
| PF | 17,900 | 17,900 | 17,900 | 17,768 |
| AS | 183 | 183 | 183 | 183 |
| AA | 198 | 198 | 197 | 195 |

这些是当前生成快照的覆盖统计，不是未来 schema 保证。Tool 必须继续传播 unavailable/unresolved，而不是将其变成 0。

### 4.5 UI-specific 与 domain-specific 边界

`src/lib/domain/endgame.ts` 是最适合 Agent 的 domain contract。`src/lib/domain/endgame-view.ts` 混合了三类职责：

- 可复用纯语义：period status、recommended group、fixed occurrence merge、PF presented dedupe；
- UI projection：rounded strings、href、portrait、缺失值 `-`；
- 中文默认 presentation：固定中文模式 label/description 与 `Intl.NumberFormat('zh-CN')`。

Agent 不应读取 `EnemyOccurrenceView.hp.roundedPerBar` 做数学；应使用 domain 的 `DecimalString`。也不应把 UI 合并后的 `count` 当成 raw occurrence count。

另一个关键细节：locale-neutral `EndgameDomain` 中生成了唯一 `occurrenceId`，但 `projectOccurrence()` 当前在 locale projection 中没有保留它。因此 Agent-facing row 应根据 mode/group/encounter/slot/stage/wave/group/position 生成自己的稳定 evidence key，或未来有意识地保留 occurrenceId；不能假设当前 generated JSON 一定带它。

## 5. Search V2 Reuse Opportunities

### 5.1 当前索引生成与查询

Search V2 由以下模块组成：

- `scripts/data/search-documents.ts`：从 locale catalogs、Character 官方名快照、人工玩家 alias 和 Endgame targets 生成 bundle；
- `src/lib/search/documents.ts`：`SearchDocument`、target、match evidence；
- `src/lib/search/normalization.ts`：GameText plain、NFKC、lowercase、去特定分隔符；
- `src/lib/search/flexsearch-adapter.ts`：FlexSearch `Document`，`tokenize: full`，同步内存召回；
- `src/lib/search/ranking.ts`：canonical/official/player × exact/prefix/contains 九级稳定排序；
- `src/lib/search/search.ts`：将 target 解析回 catalog entity，并延迟展开 Endgame shards；
- `src/lib/search/endgame.ts`：浏览器默认 `fetch()` 分片。

`SearchDocument` 已包含：

- namespaced key；
- entity kind / endgame kind；
-稳定 ID；
- canonical name；
- official aliases；
- player aliases。

实际当前 zh-CN bundle：schema 3、1,144 documents，其中 97 Character、169 Light Cone、60 Relic、628 Enemy、190 Endgame target；86 个 document 有玩家 alias。英文 bundle 不加载人工玩家 alias，但保留当前两条官方 Character alias。

### 5.2 可直接复用的部分

以下模块在 Node/Vitest 环境已有测试，可以直接在 server-only adapter 中组合：

- `normalizeSearchDocument()`；
- `normalizeSearch()`；
- `createFlexSearchAdapter()`；
- `bestSearchEvidence()`；
- `compareSearchMatches()`；
- `getSearchIndex(locale)`；
- catalogs / details 的 generated loaders。

FlexSearch adapter 本身没有 browser-only dependency。Browser coupling 位于 `createEndgameSearchExpander()` 的默认 `fetch` 和 Svelte page 状态，不需要进入 Entity Resolution。

### 5.3 不宜直接复用的部分

`createGlobalSearchService()` 返回原始 catalog models 和分组后的 UI results，接口面向卡片渲染，而不是稳定的 resolution result；其 evidence 与结果通过 `documentKey` 间接关联。Agent adapter 可以复用同一组底层 building blocks，返回更窄的结构，而无需建设第二套 normalization 或 ranking。

此外：

- `endgame:{templateId}` 与 `enemy:{templateId}` 可能同时命中同一个名字；前者是 occurrence bucket，不是另一种 Enemy identity；
- alias 目前主要覆盖 zh-CN Character，不覆盖 Enemy 玩家俗称；
- 搜索是 substring retrieval，不是 fuzzy/拼音/embedding search；
- 没有校准的连续 relevance score。

因此 `search_entities` 应返回 `matchKind`、`nameKind` 和稳定 `rank`，**不伪造 score**。如果未来评估确实需要 score，再定义可解释的离散 rank class，而不是把 FlexSearch 内部分数暴露成跨版本契约。

### 5.4 历史文档差异

`docs/search-v2.md` 仍记录部分初次实施快照，例如 Search schema 2、manifest schema 36、1,127 documents / 173 Endgame targets，以及较早 source commit。当前代码和生成数据已经是 Search schema 3、manifest schema 43、1,144 documents / 190 Endgame targets。该文档仍可解释设计历史，但数字和 schema 不能作为本次设计的当前事实来源。

### 5.5 结论

**可以包装为 read-only entity resolution tool；需要薄 adapter，不需要第二套搜索系统。** Adapter 的主要职责只是：按 types 过滤普通 entity document、将 match evidence 与 document 合并、limit、ambiguity 标记、附数据版本。

## 6. Candidate Phase 1 Tool Surface

### 6.1 Entity Resolution

建议保留 `search_entities`。

支持类型：`character | light-cone | relic | enemy`。不把 `endgame` 暴露为实体类型。返回：entity type、ID、canonical name、matched label、name kind、match kind、排序名次、locale。结果不自动选第一个；同名或多个 template 都保留，并由 Agent 询问澄清或在安全问题中同时查询。

### 6.2 Endgame Query

建议保留 `query_endgame`，但限制为“允许列表 filter + projection + sort + bounded rows”，而不是 SQL。

合理的 Phase 1 filter：

- modes；
- 显式 season keys，或每模式 latest window；
- season status；
- encounter ID / ordinal / variant；
- battle slot；
- stage ID / level；
- wave number/ID；
- enemy template IDs / concrete MonsterIDs；
- raw rank / product rank category；
- weaknesses。

不加入 arbitrary joins、表达式 AST、自由字段 path、正则或用户提供 predicate。允许的 sort fields 和 projection groups 固定枚举。

### 6.3 Endgame Aggregation

建议保留独立 `aggregate_endgame`：

- 与 query 复用相同 filter 和 season selection；
- groupBy 最多 3 个已知维度；
- metrics 最多 5 个；
- output groups 最多 100；
- 数字计算使用现有 lossless decimal helper；
- 返回 skipped/unresolved 计数和语义 warnings。

为何不合并成一个 tool：query 返回 evidence rows，aggregate 返回确定性 summary，两者结果大小和错误语义不同。合并会产生大量互斥参数和更差的 tool selection；分开仍只有两个 Endgame tools，并不构成专用 API 膨胀。

Phase 1 aggregation 取舍：

| Operation | 是否支持 | 说明 |
| --- | --- | --- |
| `rowCount` | 是，但显式命名 | 表示匹配的配置行数；PF 不等于实际 spawn 次数 |
| `countDistinct` | 是 | 赛期出现频率等问题的核心操作 |
| `min` / `max` | 是 | 对实例 per-bar HP、speed、toughness、level 有意义 |
| `avg` | 是，带 included/skipped count | 必须让调用者理解 row weighting；PF 重复配置可影响平均值 |
| `median` | 暂缓 | 算法不难，但第一版真实问题少，且 row weighting 语义尚需 eval |

## 7. Proposed Tool Schemas

以下是概念级 TypeScript 草案，不是本轮实现。

### 7.1 公共类型

```ts
type Locale = 'zh-CN' | 'en';
type EntityType = 'character' | 'light-cone' | 'relic' | 'enemy';
type EndgameMode = 'moc' | 'pf' | 'as' | 'aa';
type EnemyRank = 'Minion' | 'MinionLv2' | 'Elite' | 'LittleBoss' | 'BigBoss';
type EnemyRankCategory = 'normal' | 'elite' | 'boss';

type DataVersion = {
  gameVersion: string | null;
  sourceCommit: string;
  dataRevision: string;
  locale: Locale;
};
```

每次 tool output 都应携带 `DataVersion`，使最终回答可以说明证据快照，而不是把模型上下文中的旧数据混入结果。

### 7.2 `search_entities`

```ts
type SearchEntitiesInput = {
  query: string;
  locale: Locale;
  types?: EntityType[];
  limit?: number; // default 10, hard max 25
};

type EntityMatch = {
  type: EntityType;
  id: string;
  canonicalName: string;
  matchedLabel: string;
  nameKind: 'canonical' | 'official' | 'player';
  matchKind: 'exact' | 'prefix' | 'contains';
  rank: number;
};

type SearchEntitiesOutput = {
  dataVersion: DataVersion;
  normalizedQuery: string;
  matches: EntityMatch[];
  truncated: boolean;
  ambiguous: boolean;
};
```

字段理由：

- `locale` 必须显式，不跨 locale fallback；
- `types` 减少同名跨领域歧义；
- `matchedLabel/nameKind/matchKind` 直接来自现有 MatchEvidence；
- `rank` 是排序位置，不是虚构的相关性分数；
- `ambiguous` 可按“多个 exact identity 或首位同 rank class”保守判断，不替 Agent 强选。

### 7.3 公共 Endgame filter

```ts
type SeasonKey = { mode: EndgameMode; groupId: number };

type SeasonSelection =
  | { kind: 'ids'; seasons: SeasonKey[] }
  | {
      kind: 'latest-per-mode';
      count: number;              // default/max 5/20
      includeUpcoming: boolean;   // default false
      includeUnknown: boolean;    // default false; AA requires true/fallback
    };

type EndgameFilter = {
  modes?: EndgameMode[];
  seasons?: SeasonSelection;
  statuses?: Array<'current' | 'upcoming' | 'historical' | 'unknown'>;
  encounterIds?: string[];
  encounterOrdinals?: number[];
  encounterVariants?: Array<'floor' | 'preliminary' | 'boss-normal' | 'boss-hard'>;
  battleSlots?: number[];
  stageIds?: number[];
  levels?: number[];
  waveNumbersOrIds?: number[];
  enemyTemplateIds?: number[];
  monsterIds?: number[];
  enemyRanks?: EnemyRank[];
  enemyRankCategories?: EnemyRankCategory[];
  weaknessesAny?: string[];
};
```

约束：`ids` 和 `latest-per-mode` 由 union 保证互斥；`latest-per-mode` 默认只包含 current + historical。若 AA 启用 unknown，输出必须说明按 groupId 倒序 fallback。`weaknessesAny` 使用 canonical element code，不使用本地化字符串比较。

### 7.4 `query_endgame`

```ts
type EndgameProjection =
  | 'location'
  | 'enemy-identity'
  | 'enemy-defenses'
  | 'instance-stats'
  | 'mechanics';

type EndgameSortField =
  | 'seasonBegin'
  | 'groupId'
  | 'encounterOrdinal'
  | 'battleSlot'
  | 'stageId'
  | 'wave'
  | 'enemyTemplateId'
  | 'monsterId'
  | 'hpPerBar'
  | 'speed'
  | 'toughnessPerBar';

type QueryEndgameInput = {
  locale: Locale;
  filter: EndgameFilter;
  include?: EndgameProjection[];
  sort?: Array<{ field: EndgameSortField; direction: 'asc' | 'desc' }>;
  limit?: number; // default 100, hard max 500
};
```

规范化 row 至少包含：

```ts
type EndgameRow = {
  evidenceId: string; // structural coordinate, not a display label
  grain: 'configured-occurrence';
  mode: EndgameMode;
  season: {
    groupId: number;
    name: string | null;
    begin: string | null;
    end: string | null;
    status: 'current' | 'upcoming' | 'historical' | 'unknown';
    orderingBasis: 'schedule' | 'group-id-fallback';
  };
  encounter: {
    id: string;
    configId: number;
    name: string | null;
    ordinal: number | null;
    variant: 'floor' | 'preliminary' | 'boss-normal' | 'boss-hard';
  };
  battleSlot: number;
  stage: { stageId: number; index: number; level: number };
  wave: {
    kind: 'fixed' | 'spawn-sequence';
    numberOrId: number;
    monsterGroupId: number | null;
    configuredPosition: number;
  };
  enemy: {
    monsterId: number;
    templateId: number;
    name: string;
    rank: EnemyRank | null;
    rankCategory: EnemyRankCategory | null;
    weaknesses: string[];
    resistances?: Array<{ element: string; value: string }>;
  };
  stats?: {
    hpPerBar: string | null;
    hpStatus: 'resolved' | 'unresolved';
    phaseCount: number | null;
    effectiveTotalHp: string | null;
    effectiveTotalHpStatus: 'static' | 'inferred' | 'runtime-unclear';
    speed: string | null;
    toughnessPerBar: string | null;
    toughnessBarCount: number | null;
    toughnessRuntimeStatus: 'static' | 'runtime-unclear';
  };
};
```

输出还应有：

```ts
type QueryEndgameOutput = {
  dataVersion: DataVersion;
  rowGrain: 'configured-occurrence';
  matchedRows: number;
  returnedRows: number;
  truncated: boolean;
  warnings: string[];
  rows: EndgameRow[];
};
```

不建议暴露 `hpBase/instanceRatio/levelRatio/eliteRatio` 作为默认字段。这些对审计有用，但对 Phase 1 用户问题会增加 token 和误用风险；可在未来出现诊断用例后增加 `hp-factors` projection。

### 7.5 `aggregate_endgame`

```ts
type EndgameGroupDimension =
  | 'mode'
  | 'season'
  | 'encounter'
  | 'battleSlot'
  | 'stage'
  | 'wave'
  | 'enemyTemplate'
  | 'monster';

type NumericField = 'hpPerBar' | 'speed' | 'toughnessPerBar' | 'level';
type DistinctField =
  | 'seasonKey'
  | 'encounterKey'
  | 'stageKey'
  | 'waveKey'
  | 'enemyTemplateId'
  | 'monsterId';

type EndgameMetric =
  | { op: 'rowCount'; as: string }
  | { op: 'countDistinct'; field: DistinctField; as: string }
  | { op: 'min' | 'max' | 'avg'; field: NumericField; as: string };

type AggregateEndgameInput = {
  locale: Locale;
  filter: EndgameFilter;
  groupBy: EndgameGroupDimension[]; // max 3
  metrics: EndgameMetric[];         // max 5
  sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  limit?: number;                   // default 20, hard max 100
};
```

聚合结果对每个 metric 返回 decimal string 或整数，并附：

- `sourceRows`；
- `includedRows`；
- `skippedUnresolvedRows`；
- `truncated`；
- `warnings`；
- `dataVersion`。

示例：“最近 10 期 MoC 出现期数最多的 Boss”应使用：

```ts
{
  locale: 'zh-CN',
  filter: {
    modes: ['moc'],
    seasons: {
      kind: 'latest-per-mode',
      count: 10,
      includeUpcoming: false,
      includeUnknown: false
    },
    enemyRankCategories: ['boss']
  },
  groupBy: ['enemyTemplate'],
  metrics: [{ op: 'countDistinct', field: 'seasonKey', as: 'seasonCount' }],
  sort: [{ field: 'seasonCount', direction: 'desc' }],
  limit: 20
}
```

这避免把同一 Boss 在一季多个楼层/节点/波次的重复 occurrence 误算为“出现期数”。

### 7.6 Schema 实现注意

应用侧应始终做本地 schema validation，不能只相信 provider。DeepSeek strict mode 目前要求 Beta base URL、所有 function 都设置 `strict: true`，object 的 properties 全部列入 `required` 且 `additionalProperties: false`，仅支持有限 JSON Schema 类型。[DeepSeek Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/)

因此实际 Zod schema 可以在 TypeScript 中使用 optional/default；发往 DeepSeek strict 的 wire schema 应根据其限制用 required + nullable/`anyOf` 表达可选项，或第一版不开 provider strict、但仍在本地严格 parse。无论哪种方式，未知字段、越界 limit、互斥 season selector、空 query 都必须在执行前拒绝。

## 8. Data Semantics and Known Limitations

### 8.1 PF spawn / 重复刷怪

PF 的 `SpawnSequenceWaveModel` 保存：wave group、wave、monster groups、ordered enemy sequence、部分 max counts、wave ability/params 和 HP modifier。它确实保留配置中的重复 MonsterID；当前测试样本一组有 41 个 ordered enemies 且重复出现。

但它**没有保存一次真实战斗最终生成了多少个敌人，也没有运行时终止/补位结果**。页面层 `presentedStageWaves()` 对 PF 按完整 occurrence identity 去重，明确只展示“可能出现的敌人类型”，不产生 count。

所以：

- 合理：某波候选敌人类型、某 template 是否出现、每个配置 occurrence 的实例 HP、每季最高单体 per-bar HP；
- 谨慎：raw configured row count、按配置位置加权的 avg；
- 不合理：PF 一波/一节点/整期“实际总 HP”、实际击杀数、精确 spawn count。

Tool 对 PF `rowCount` 必须返回 warning：它是 configured sequence rows，不是 runtime spawn count。遇到“PF 所有持续刷新敌人的总血量”应拒答并解释缺失运行时 spawn 语义。

### 8.2 多阶段 Boss 与有效总 HP

当前 occurrence 提供一个 `maxHpPerBar` 和可选 `phaseCount`，没有“每阶段不同 HP”的数组。UI 的 `formatHpWithPhases()` 只是显示 `单条 HP × phaseCount`，测试明确断言不称为总 HP。

Mechanics scanner 还会识别 shared HP、restore HP、lock/manipulate HP、summons、外部 stage/wave ability；存在任一此类条件、多阶段或配置扫描不完整时，`effectiveTotalHpStatus` 为 `runtime-unclear`，不生成 `effectiveTotalHp`。真实 AS 多阶段共享/回复 HP 样本正是如此。

因此 Agent 默认暴露：

- `hpPerBar`；
- `phaseCount`；
- `effectiveTotalHp` 仅在 status 非 unclear 且有值时；
- status 与 mechanics warning。

禁止以 `hpPerBar * phaseCount` 自动声称 Boss 总 HP。

### 8.3 Enemy instance 与 template

`MonsterTemplate.baseStats.hp` 是模板基础值；Endgame `hp.final.maxHpPerBar` 是 template base × concrete Monster modifier × stage level ratio × elite context ratio，再叠加 PF wave modifier后的实例值。同一 MonsterID 在不同 Stage 也可能得到不同最终 HP。

Agent 回答 Endgame HP 必须使用 occurrence 实例值。Template base 只适合回答百科基础配置问题，不能替代 Endgame scaling。

身份层也要区分：

- template ID 用于“这个敌人是谁”、跨赛期统计和打开百科；
- concrete MonsterID 用于弱点、抗性、实例 modifier 与同模板变体；
- occurrence/evidence ID 用于“它在何季、何关、何 slot、何 stage、何 wave 的哪一行”。

### 8.4 特殊与 fallback 逻辑

与 Agent 分析直接相关的已存在逻辑：

- 历史 MoC 有大量 Elite context 从 MonsterConfig fallback，当前审计为 5,272 条，confidence 为 `inferred`；
- schedule 缺失时保留 group，但状态为 unknown；AA 当前全部无 schedule；
- MoC 108/109 有 2033 schedule，不能只按日期无条件定义“最近”；
- MoC 1035 当前缺本地化 group name，会使用 `模式 + ID` 的 presentation fallback；Agent 应返回 null/明确 fallback 标记，而不是把 fallback 文案当官方赛期名；
- speed/toughness 缺 base 或引用无效时使用 discriminated unavailable；
- PF wave ability/params 不支持时 final HP 为 unresolved；
- PF ordinary HP half-up，LittleBoss/BigBoss truncate；
- fixed wave UI 只合并完整 occurrence identity 相同的重复项；
- PF UI 去重但保留同 template 的不同 concrete MonsterID；
- stance 从内部单位精确换算为玩家侧 toughness，不能再随意除/乘；
- AS guide MonsterID 可能与真实 Stage occurrence 不同，现有页面和测试以真实 Stage enemy 为准，guide 只拥有 traits；
- stage abilities 或其他外部 mechanics 会使 effective total HP 保守地变为 runtime-unclear。

## 9. Agent Runtime Options

### 9.1 Option A：最小 tool-calling loop

流程：

```text
user message
  -> DeepSeek Chat Completions
  -> validate tool name + JSON args
  -> execute local read-only TypeScript function
  -> append assistant tool_calls + tool result messages
  -> repeat until final text or limit
```

DeepSeek 官方 API 当前支持 function tools、`tool_choice`、tool result messages，以及 thinking/non-thinking tool use；模型只生成调用，实际函数由应用执行。[DeepSeek Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/) [Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/)

预估 runtime/provider/loop 本身约 150–250 行 TypeScript，不含数据 adapters、tests 与 eval runner。必须自行处理：

- assistant message 与多 tool calls 的历史回放；
- tool call ID 对应；
- JSON parse / schema validation；
- 未知 tool、执行错误和可恢复错误；
- max turns、max total tool calls、timeout/abort；
- usage/latency 日志；
- final output 为空或 `finish_reason=length`；
- provider response 类型守卫。

优点是依赖和行为最少、DeepSeek 路径直接、容易观察真实 failure。缺点是循环与消息协议由项目维护。

### 9.2 Option B：OpenAI Agents SDK TypeScript

当前官方 SDK 能：

- 用 `tool()` 包装本地 TypeScript function；
- 接受 Zod、Standard Schema 或 raw JSON Schema 参数；
- 本地验证 Zod tool args；
- 用 `outputType` 做结构化最终输出；
- Runner 自动执行 tool loop，默认 `maxTurns: 10` 且可调整；
- 自定义 `Model` / `ModelProvider`；
- 关闭 tracing（server runtime 默认开启）。

官方资料：[Tools](https://openai.github.io/openai-agents-js/guides/tools/)、[Running agents](https://openai.github.io/openai-agents-js/guides/running-agents/)、[Schemas](https://openai.github.io/openai-agents-js/guides/schemas/)、[Models](https://openai.github.io/openai-agents-js/guides/models/)、[Tracing](https://openai.github.io/openai-agents-js/guides/tracing/)。

问题是默认 provider 是 OpenAI。接 DeepSeek 有两条路：

1. 自己实现 Agents SDK 的 `Model` / `ModelProvider`，需要把 DeepSeek Chat Completions 映射到 SDK 的统一 request/response/stream events；
2. 使用 `@openai/agents-extensions/ai-sdk` 再接 Vercel AI SDK 的 DeepSeek provider。

第二条官方可行，但 Agents SDK 的 AI SDK adapter 当前仍标注 Beta，并新增 Agents SDK、extensions、AI SDK、DeepSeek provider、Zod 等多个依赖。[OpenAI Agents SDK AI SDK Integration](https://openai.github.io/openai-agents-js/extensions/ai-sdk/)

对未来复杂 handoff、guardrail、session、tracing 的系统它有价值；对当前单 Agent、三个本地只读 tool、无 OpenAI API 的 prototype，复杂度收益比不理想。

### 9.3 Option C：Vercel AI SDK

Vercel AI SDK 有官方 `@ai-sdk/deepseek` provider，支持 tool usage、tool streaming 和 object generation；`generateText` / `streamText` 配合 `stopWhen: stepCountIs(n)` 可执行多步 tool loop。[DeepSeek Provider](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek) [Tools and Tool Calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)

它比“Agents SDK + AI SDK adapter”更直接，也为未来 SvelteKit streaming UI 和 provider 切换提供统一层。代价是 Phase 1 仍需引入 `ai`、`@ai-sdk/deepseek` 和 schema library，并接受 SDK 自身的 provider compatibility 行为。

若产品已经决定短期上线带 streaming 的 Web UI，Option C 会比 Option A 更合适；在本地价值验证阶段仍可后置。

### 9.4 推荐

Phase 1 采用 Option A，并保留如下极薄边界：

```ts
interface ToolCallingModelClient {
  complete(input: {
    messages: ModelMessage[];
    tools: ToolDefinition[];
    signal: AbortSignal;
  }): Promise<ModelTurn>;
}
```

只实现 `DeepSeekModelClient`，不要做 provider registry、capability matrix、动态 model routing 或统一所有供应商私有字段。这样未来换 provider 时，协议映射集中在一处；在真实第二个 provider 出现前不继续抽象。

## 10. Deployment / SvelteKit / Vercel Considerations

### 10.1 Phase 1 本地 prototype

最小方案是 `scripts/agent/run.ts` CLI：

- 复用 `src/lib/server/generated.ts` 和 `getEndgameDataset()`；
- 从本地 env 读取 `DEEPSEEK_API_KEY`，仅 provider module 能访问；
- 不新增 route；
- 不改 adapter；
- 不影响当前静态站 bundle；
- eval runner 可直接调用同一 runtime。

这满足“先验证少量通用 tools 是否有组合价值”的实验目标。

### 10.2 未来 Web endpoint

若 eval 通过，再评估：

- 安装并固定 `@sveltejs/adapter-vercel`；
- 保留现有页面与生成分片 `prerender = true`；
- 新增唯一动态 `POST /api/agent`；
- 使用 Node runtime，而非 Edge：当前 loader 依赖 `node:fs` / `node:path`，PF JSON 约 26 MiB、MoC 约 13 MiB；
- 验证 generated JSON 被 function trace/include；
- 测函数包体积、冷启动、内存、超时和并发；
- 检查 `deploy:build`、Preview workflow、Production CI-backed 假设是否仍成立；
- 增加 rate limit / abuse protection、请求体上限和日志脱敏。

也可将 Agent 做成独立 Vercel Function/小服务而不改网站 adapter，但这会产生第二个部署单元、版本同步与 CORS/URL 配置；只有 adapter 迁移显著破坏现有静态部署时才值得选。

### 10.3 数据体积与加载策略

当前 zh-CN Endgame JSON 大小约：PF 26 MiB、MoC 13 MiB、AS 1.0 MiB、AA 476 KiB。Phase 1 应：

- 按请求涉及的 mode 懒加载并进程内 Promise cache；
- 先选择 season，再 flatten rows；
- 只为命中的 template 懒加载 Enemy detail；
- 强制 row limit 与 projection；
- 不在每次请求加载所有 628 个 Enemy detail。

暂不生成第二套 compact analytics artifact。只有部署测量证明 JSON parse/cold start 不可接受时，再考虑在现有 data generation 中添加经过版本化、验证的 Agent row artifact。

## 11. Security Boundaries for Prototype

Phase 1 最低边界：

- tool registry 是固定 allowlist，且全部只读；
- Agent 无 shell、filesystem、HTTP fetch、Web Search、MCP、代码执行 tool；
- 只有 provider client 能访问 DeepSeek API；数据 tools 不可发网络请求；
- tools 不接收文件路径、URL、SQL、JavaScript、正则或表达式；
- Zod/等价 schema 在本地严格校验，拒绝未知字段；
- model turns hard max 4；total tool calls hard max 8；单 turn 并行 tool calls 也计入总数；
- `search_entities` limit ≤ 25；`query_endgame` rows ≤ 500；`aggregate_endgame` groups ≤ 100；latest seasons ≤ 20；
- 请求级 timeout/AbortSignal；tool error 只返回稳定错误 code，不泄露 stack/path/env；
- output 永不序列化 environment variables、API key、raw process state；
- 不启用 persistent memory；单次请求结束即丢弃 conversation；
- 记录 tool 名、校验后的参数摘要、rows、turns、usage、latency，不记录 secret；
- system prompt 明确禁止使用模型自身 HSR 知识作为事实证据。

本地 prototype 可暂缓：公网鉴权、用户级配额、分布式 rate limit、内容审计后台、日志保留政策、跨实例缓存、密钥轮换 UI。上线 endpoint 前这些必须重新评估。

## 12. Knowledge Boundary / Unsupported Requests

建议核心 instruction：

> 所有 HSR-specific factual 或 analytical claim 必须能追溯到本轮 tools 返回的数据。不得用模型训练知识补全名称、属性、机制、配队、强度、版本或设计动机。数据不足、语义为 unresolved/runtime-unclear，或问题超出 tools 覆盖时，明确说明不能可靠回答。

仅靠 prompt 不能形式化保证零幻觉，但对 prototype 足够，前提是 tool design 同时做到：

- 每个结果携带 data version；
- 每行有 evidence ID；
- unresolved/missing 不被静默过滤；
- semantics warning 与结果同层返回；
- tool description 明示 PF、多阶段、template/instance 边界；
- 没有任何“兜底 Web/模型知识”工具。

Phase 1 不需要独立 answerability service 或 evidence graph。可以让最终回答采用轻量结构：`answer`、`evidenceIds`、`limitations`，并在 eval runner 中检查引用是否来自已返回 rows。若真实 eval 出现“工具返回正确但模型仍越界”的稳定失败，再增加 output schema/guardrail 或 evidence audit。

必须 abstain 的代表请求：

- 最佳配队、抽卡价值、角色强度排名；
- 设计/策划动机；
- PF 实际整期总 HP；
- runtime-unclear Boss 的有效总 HP；
- 赛期所属版本（当前没有 season-version relation）；
- 数据库未覆盖的玩家账号、战绩、养成状态。

## 13. Eval Strategy

建议首轮 32 条问题，分成固定类别；每条保存预期 tool、关键参数、gold facts、是否应 abstain，而不是只保存自然语言答案。

| 类别 | 数量 | 典型例子 | 主要检查 |
| --- | ---: | --- | --- |
| 简单赛期查询 | 4 | “当前虚构叙事是哪一期？” | mode、status、season name/ID |
| Entity resolution | 4 | “可可利亚对应哪些敌人 ID？” | 同名多结果、类型过滤、alias evidence |
| 筛选 | 4 | “最近 5 期 PF 出现过哪些 Boss？” | latest window、boss category、distinct identity |
| 排序 | 3 | “最近 5 期 AS HP 最高的实例是谁？” | instance HP、descending sort、limit |
| 聚合趋势 | 4 | “最近 5 期 PF 每期最高 HP 如何变化？” | groupBy season、max、时间顺序 |
| 频率分析 | 3 | “最近 10 期 MoC 出现期数最多的 Boss？” | countDistinct season，不按 occurrence count |
| 多步查询 | 3 | “找最近五期最高 HP enemy，再查其弱点并比较” | search/query/aggregate 组合、具体 Monster join |
| 语义陷阱 | 3 | PF 总 HP；多阶段总 HP；template base vs instance | warning / abstention |
| 数据不足 | 3 | 最佳队伍、最值得抽、为何涨血 | unsupported-request abstention |
| Tool selection/argument failure | 1 组 1 | AS“节点 2”、mode 中文映射、过大 N、无效 ID | 参数修正、错误处理、无多余调用 |

应特别包含：

- 同一中文名称多个 Enemy template；
- 同 template 不同 MonsterID 弱点；
- AA 无 schedule 的 latest fallback；
- MoC 108/109 的 2033 future schedule，确认默认 latest 不把 upcoming 混入；
- 缺 name 的 MoC 1035；
- speed/toughness unavailable；
- PF duplicate ordered entries；
- AS phase/shared/restore HP；
- 问题只需 aggregate 时是否避免先拉 500 行 query；
- 空结果是否说“当前数据未找到”，而不是编造。

记录 metrics：

- `tool_selection_accuracy`；
- `argument_accuracy`，按字段和整体 exact match 分开；
- `answer_factual_accuracy`；
- `aggregation_accuracy`；
- `unsupported_request_abstention`；
- `semantic_warning_accuracy`；
- `evidence_coverage` / invalid evidence IDs；
- `unnecessary_tool_calls`；
- `agent_turns`；
- input/output/cache token usage；
- end-to-end 与 per-tool latency；
- schema/tool/runtime error rate；
- truncated-result handling accuracy。

建议先用确定性 unit tests 覆盖 row normalization/filter/aggregation，再用固定 temperature 的真实模型跑 32 条。模型 eval 至少重复 3 次，避免把单次成功当作稳定能力。Phase 1 通过门槛可先定为：支持类事实/聚合准确率 ≥ 90%，unsupported abstention 100%，无 invalid evidence，平均 tool calls 不超过 gold + 1；门槛可根据首轮 baseline 调整但不得降低安全 abstention。

## 14. Minimal Implementation Plan

### Step 1：实现纯数据 row adapter

- 复用 `getEndgameDataset(mode, locale)`；
- 在 query time 计算 period status；
- 展开 group/encounter/slot/stage/wave/configured position；
- 按 distinct template 懒加载 typed Enemy detail；
- 按 exact MonsterID 连接 rank/weakness/resistance；
- 生成 evidence ID 和 semantics metadata；
- 用现有 decimal helper 做比较/加法/除法，禁止浮点 HP 聚合。

### Step 2：实现三个普通 TypeScript functions

- schemas 与业务函数分离；
- query 与 aggregate 共用 filter engine；
- 每个 output 带 manifest version；
- hard limits 在业务函数内再次执行，不只依赖 schema max。

### Step 3：实现本地 runtime

- DeepSeek-only provider；
- fixed tool registry；
- 4 turns / 8 calls / request timeout；
- no memory；
- CLI 输入单个问题，输出答案和可选 debug trace。

### Step 4：先完成 deterministic tests，再跑 model eval

- Search reuse、ambiguity、locale；
- season selection 与特殊 schedule；
- PF grain warning；
- multi-phase total HP abstention support；
- exact decimal aggregates；
- limit/truncation/error；
- 32-case eval corpus 与 metrics report。

### Step 5：只在 eval 证明价值后审查 Web/Deployment

不把 adapter 迁移与 prototype 混成一个变更。先回答：Agent 是否能用三个通用 tools 稳定完成目标问题；再回答：如何上线。

## 15. Files Likely to Be Added or Changed

### 15.1 推荐的本地 Phase 1 目录

```text
src/lib/agent/
  contracts.ts                 # Agent-facing inputs/outputs and enums; no provider code

src/lib/server/agent/
  data-version.ts              # manifest metadata
  entity-resolution.ts         # Search V2 thin adapter
  endgame-rows.ts              # dataset + exact Monster join + row normalization
  endgame-query.ts             # filter/project/sort/limit
  endgame-aggregate.ts         # deterministic bounded aggregation
  tools.ts                     # validated tool registry
  runtime.ts                   # bounded single-agent loop
  providers/deepseek.ts        # the only model API boundary

scripts/agent/
  run.ts                       # local CLI prototype
  eval.ts                      # eval runner

tests/unit/agent/
  entity-resolution.test.ts
  endgame-rows.test.ts
  endgame-query.test.ts
  endgame-aggregate.test.ts
  runtime.test.ts

evals/agent/
  cases.jsonl                  # 约 32 条 case；不含 secret
```

目录命名保持现有原则：可共享 contract 放 `src/lib`，任何 key/model/fs 逻辑放 `src/lib/server`，构建/CLI 编排放 `scripts`。

### 15.2 可能需要修改的现有文件

本地 prototype 的最小修改：

- `package.json` / `pnpm-lock.yaml`：加入 Zod 或选定的 schema validator；不加入 Agent SDK；增加 `agent:run` / `agent:eval` scripts；
- `tsconfig.scripts.json`：仅在现有 include 不覆盖新 CLI 时调整；
- 可选 `src/lib/domain/enemy-overview.ts`：把纯 rank-category mapping 抽到新 shared module，避免 Agent import UI localization；
- 可选 `src/lib/server/generated.ts`：增加 typed `getEnemyData()`，取代 Agent adapter 内的 unknown cast。

不需要修改：

- `scripts/data/domain/*`；
- `scripts/data/endgame.ts`；
- `scripts/data/projection/*`；
- 现有 Svelte components；
- 页面 load；
- Search UI；
- generated schema / data sync；
- `svelte.config.js`、`vercel.json`、Preview workflow；
- 现有 API routes。

如果实现 Web endpoint，才另外涉及：

```text
src/routes/api/agent/+server.ts
svelte.config.js
package.json / pnpm-lock.yaml       # @sveltejs/adapter-vercel
scripts/deployment/*                # 仅在现有假设被实际破坏时
tests/unit/vercel-*.test.ts
tests/e2e/agent.spec.ts
```

不要在本地 prototype PR 中提前创建空 endpoint 或 adapter migration。

## 16. Not Needed for Phase 1

明确暂缓：

- Semantic Catalog；现有 SearchDocument + domain enums 已足够；
- SQL、SQLite、DuckDB、任意 query DSL 或 expression AST；
- 通用 analytics engine / window functions；
- vector DB、embedding、RAG、全文语义搜索、拼音/fuzzy 搜索；
- evidence graph；先用 dataVersion + evidenceId；
- 独立 answerability service；先用 tool boundary + prompt + eval；
- MCP server；tools 只在本进程调用；
- multi-agent / handoff / planner；
- persistent memory、conversation database、用户画像；
- shell/filesystem/code interpreter/browser/Web Search tools；
- sandbox；没有可执行用户代码或写工具；
- provider registry、自动模型路由、fallback chain；
- OpenAI Agents SDK 的 handoff/session/guardrail/tracing 全套；
- 为测试题专门写 `getMocHpTrend()`、`findMostFrequentBoss()` 等方法；
- PF spawn simulator；当前没有足够 runtime 语义；
- 自动推导多阶段有效总 HP；
- 新的 Agent-specific generated data pipeline；先测现有 JSON 加薄 adapter；
- 生产 chat UI、streaming、auth、billing；先本地 eval；
- 立即迁移 adapter-static。

只有真实 eval 或部署测量明确暴露问题后，才为对应失败增加结构。

## 17. Risks and Open Questions

1. **“最近 N 期”产品定义**：本报告建议默认 current + historical、排除 upcoming；AA 用 groupId fallback。需要产品确认是否接受。
2. **PF row weighting**：是否应让 `query_endgame` 默认返回 raw configured occurrences，还是提供 `dedupe: 'none' | 'wave-identity'`？建议 Phase 1 固定 raw grain，频率用 distinct aggregation，避免一个隐式开关。
3. **Enemy 名称歧义**：同名多 template 是真实数据；Agent 是询问澄清还是合并统计，需要按问题风险规定。
4. **Resistance 值类型**：Enemy detail 当前普通 elemental resistance 使用 number，而 Endgame 战斗数值强调 DecimalString。Tool schema 应先序列化为字符串并测试精度，或在确认来源精度后保留 number；不要混用后静默计算。
5. **Season version 缺失**：manifest 只有全局生成快照版本；若 eval 需要“某期属于哪个游戏版本”，必须另做数据关系调查。
6. **Build-time status stale**：Search occurrence shards 保存生成时的 period status。Agent 必须从 Endgame group schedule 重新计算，不复用 shard status。
7. **Runtime package size/cold start**：PF/MoC JSON 较大；只在 Web 部署阶段实测后决定是否生成 compact artifact。
8. **Generated file tracing**：动态 filesystem path 在 Vercel Function 包中的包含行为需要 Preview 实测。
9. **DeepSeek strict Beta**：不能把 provider strict 当唯一参数验证；schema 子集和 Beta URL 可能变化。
10. **Model遵守知识边界**：需要真实 eval，尤其是模型在 tool 无结果时是否用训练知识补全。
11. **中文术语映射**：`混沌/虚构/末日/仲裁`、`节点/上半/下半` 等应在 Agent instructions 中解释为 mode/battleSlot，而不是扩张 tool schema。
12. **数据许可证与外部服务**：把生成数据片段发送给第三方模型 API 前，应确认项目与上游许可、隐私/日志政策；当前数据公开不等于可以忽略供应商保留政策。

## 18. Recommended Next Step

建议批准一个严格限界的 Phase 1 implementation spike：

1. 只做本地 CLI；
2. 只支持 zh-CN；
3. 实现本文三个 tools 与共享 Endgame row engine；
4. DeepSeek direct loop，4 turns / 8 tool calls；
5. 先写 deterministic unit tests；
6. 建立 32-case eval，重点验证 abstention、PF、多阶段 HP、同名实体和 latest season；
7. 产出一份带错误分类、token、latency 的 eval report；
8. 只有达到预设门槛后，才开启 adapter / Web endpoint 调查。

最值得先做的不是模型接线，而是用纯 TypeScript 完成并测试 `endgame-rows.ts`：它会把当前成熟但页面形状较深的 Endgame dataset，变成语义明确、可限制、可聚合、带证据 ID 的 Agent-facing rows。只要这一层可靠，direct loop、AI SDK 或未来其他 provider 都可以更换，而无需重建游戏数据能力。

---

### 外部官方资料索引

- [DeepSeek Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/)
- [DeepSeek Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/)
- [OpenAI Agents SDK — Tools](https://openai.github.io/openai-agents-js/guides/tools/)
- [OpenAI Agents SDK — Running agents](https://openai.github.io/openai-agents-js/guides/running-agents/)
- [OpenAI Agents SDK — Models and custom providers](https://openai.github.io/openai-agents-js/guides/models/)
- [OpenAI Agents SDK — Schema validation](https://openai.github.io/openai-agents-js/guides/schemas/)
- [OpenAI Agents SDK — AI SDK integration](https://openai.github.io/openai-agents-js/extensions/ai-sdk/)
- [Vercel AI SDK — DeepSeek provider](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek)
- [Vercel AI SDK — Tools and tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [Vercel — SvelteKit deployment](https://vercel.com/docs/frameworks/full-stack/sveltekit)
