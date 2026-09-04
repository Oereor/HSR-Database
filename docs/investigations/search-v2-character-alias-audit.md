# Search V2 / Character Name Metadata 只读架构调查

调查日期：2026-09-04。任务依据：工作区 `Refactor-15/Search-Engine-Investigation-01.md`。

本文中的网站路径相对 `HSR-Database/`；`TurnBasedGameData/`、`StarRailRes/` 路径相对共享工作区。示例 schema 和迁移步骤均为设计建议，未实施。

## 1. Executive Summary

建议采用 **build-time 名称派生 + 独立人工 player alias 文件 + FlexSearch Document 候选召回 + 业务确定性分类排序 + 现有 catalog/card 与 Endgame 分片展开**。

调查发现以下与初始假设不同的事实：

1. 当前全局页面不调用旧 `searchEntries()`，而调用 `createGlobalSearchService()`。两者都有 `.slice(0, 80)`；只删除旧函数的上限不会改变页面行为。
2. 当前 service 在某一实体种类存在 exact 时，跳过该种类全部 prefix/contains；Endgame 同样存在 exact 优先的排他分支。这是 **80 之外的隐性漏召回**。例如“银鬃尉官”本可匹配 4 个普通敌人，目前只返回 1 个。
3. Endgame 当前是 **173 个原始显示名桶 → name hash → 8,167 个展示 locator → 分片里的展示 occurrence**，不是“名称 → MonsterID 唯一实体”。性能优化有效，但不能将 name hash 误称为稳定游戏身份。
4. Character canonical 的 source of truth 是 **pinned upstream + 网站明确的多命途展示政策**，并非某一个现成名称 JSON。当前合并普通与 LD 表，共 97 个 AvatarID；不能只调查普通表的 93 个角色。
5. 97 个 `AvatarFullName.Hash` 在当前 CHS TextMap 中全部缺失。字段存在不代表可用别名；旧搜索实际上还收录了十个开拓者 ID 的 `{NICKNAME}` 占位符。
6. 没有发现通用、可直接消费的官方角色 alias 表。可确认的有限官方替代标签是 `1001`、`1224` 各自 `AvatarName` 的“三月七”：相对于网站附加命途的 canonical，它们是有同一 AvatarID 证据的官方基础名称。除此之外，本轮不确认新的角色 official alias。
7. 当前 1,139 个规范化标签出现项，平均长 6.188、最大长 18；名称级 `full` 值得采用。主要资源风险是 occurrence 展开与 DOM，而非短名称数目。FlexSearch 自身默认查询上限 100，也必须处理。

### 调查基线与限制

| 对象                    | 本轮实际基线                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| 网站 HEAD / 分支        | `34610c33530d566111c40ce76df308d7063bff4f` / `develop`                                       |
| TurnBasedGameData HEAD  | `8cdb905dc2f8e6fffa9be4eb07af3e34435d6091`                                                   |
| StarRailRes HEAD        | `d226befe3db13f2ec15f4161d5f34b1b607643fe`                                                   |
| `upstream.lock.json`    | 与本地两个 upstream HEAD 一致                                                                |
| 现存 generated manifest | sourceCommit 同上；`generatedAt=2026-09-03T13:16:58.629Z`                                    |
| 数据版本字符串          | `OSPRODWin4.5.0_D16354198_A16307208_L16320302`，是本地 manifest 值，不据此推断正式服发布时间 |

三个仓库初始 tracked/untracked 状态均干净。调查使用文件阅读、Git 只读命令、stdin Python/Node 分析；Python 以任意精度整数读取原始 Hash，再转十进制字符串查 TextMap，未经过 JS number。FlexSearch 不在 `package.json` 中；没有安装、运行 FlexSearch，也没有重建网站或生成数据。本报告反映本地锁定版本及现存产物，不声称验证了线上正在运行的部署。

## 2. Current Search Architecture

### 2.1 实际调用链与构建边界

```text
TurnBasedGameData（普通表 + 指定 LD 表 + TextMapCHS）
  → scripts/data/sync.ts::syncData()
    → 四类 catalog / detail + 临时 SearchEntry seeds
    → hash 回查生成 aliases
    → buildSearchEntityEntries() → static/generated/search.json::entities
    → buildEndgameData() → collectEndgameSearchNames() → endgameEnemies

/search/+page.server.ts::load()（prerender）
  → getSearchIndex() + 四类 catalogs + enemy portraits
  → 页面序列化数据
/search/+page.svelte
  → createGlobalSearchService() 建内存 Maps
  → afterNavigate 读取 URL q → search(query)
  → 四类 catalog models 直接进入成熟 cards
  → expandEndgame() 按需 fetch 预渲染 occurrence shards
```

`SearchBar.svelte` 是提交表单，不是输入即搜索；导航器的 SearchBar 也提交至 `/search`。页面区分 `draftQuery` / `appliedQuery`，提交后 `goto()` 更新 URL，`afterNavigate` 处理刷新及前进后退。service 创建于组件初始化，可能随 SSR 初始化，但实际 URL 查询由浏览器导航回调应用；没有每次查询读取 upstream 的后端搜索服务。

`src/lib/server/generated.ts::getSearchIndex()` 缓存读取 generated JSON 的 Promise。页面一次获得四类 catalog，而不是逐个详情。生产使用静态适配器及预渲染；浏览器不接触 upstream 文件系统。

### 2.2 Types 与构建来源

实际类型是 `EntityKind`、`SearchEntry`、`GlobalSearchEntityEntry`、`GlobalSearchIndex`、`GlobalSearchResults`、`EndgameSearchNameEntry`，没有必要照搬任务示例中的 `SearchEntityType` / `SearchResult` 名字。

| 类型 / 生产者                        | 身份及名称                                                                | 输出 / 时间                                                            |
| ------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `domain/types.ts::SearchEntry`       | `kind,id,name,href,aliases,meta?`                                         | 目前是 sync 临时 seed；旧 API 也接收它                                 |
| Character，`sync.ts` 1294–1372 附近  | 合并后 `AvatarID`；`AvatarName` + 多命途命名                              | build-time，每 ID 一个 seed                                            |
| Light Cone，`sync.ts` 1397–1486 附近 | `EquipmentID`；`EquipmentName`                                            | build-time，每光锥一个 seed                                            |
| Relic，`sync.ts` 1492–1542 附近      | `SetID`；`RelicSetConfig.SetName`                                         | build-time，每套装一个 seed，不是每件遗器                              |
| Enemy，`sync.ts` 1580–1807 附近      | `MonsterTemplateID`；template 名，canonical config 名作 fallback          | build-time，每模板一个 seed；要求对应 `MonsterID == MonsterTemplateID` |
| `buildSearchEntityEntries()`         | 保留 `kind,id,name`，将 canonical/aliases 归一后合并为 `normalizedLabels` | 丢弃 alias provenance、`href/meta`；每 entry 内 label Set 去重         |
| `GlobalSearchResults`                | 四类 catalog 数组 + Endgame 模式/赛期结果                                 | runtime 返回现有 presentation model                                    |
| `EndgameSearchNameEntry`             | 原始 trim 后名称及其 hash `entryId`，非 MonsterID                         | build-time 产生名称到 locators 的倒排关联                              |

当前不搜索技能、材料、普通物品；Endgame **只搜索敌人名称**，不搜索模式名、赛期名、阶段名。不要因计划使用统一 Document 就悄悄扩大产品范围。

### 2.3 匹配、排序、去重及上限

证据：`src/lib/search/search.ts::scoreNormalizedLabels/searchEntries/createGlobalSearchService`。

- label 先 `normalizeSearchLabel()`；query 用 `normalizeSearch()`。
- exact 为 100；prefix 为 `80 - label.length / 100`；contains 为 `50 - label.indexOf(needle) / 100`。取全部 label 最好得分，canonical/alias 无权威级别区别。
- 排序为分数降序，再 `name.localeCompare(other, 'zh-CN')`。完全同名同分无最终 ID tie-break，依赖稳定 sort 保留输入顺序；跨 ICU/runtime 不具备严格字节级确定性保证。
- 旧 `searchEntries()` 全量匹配后截 80，仅见测试调用；真实 service 也是四类合并、排序、截 80，再分组。各分组内部保留结果次序，UI 的角色→光锥→遗器→敌人固定分区不会展示一个全局交错排名。
- service 的 `entitiesByKind` 和 `exactByKind` 初始化一次；exact Map 每个 normalized label 可对应多个 entry。非 exact 才线性扫本类。
- Endgame 的 `endgameExact` 也保留多个目标；`exactEndgame ?? filter(...)` 会在 exact 存在时排除部分匹配；没有 80 数量限制，也没有使用 scorer 对 Endgame 名称排序。
- entry 内标签去重不等于实体去重。普通结果以 `(kind,id)` 为身份，模型 Map 以各类 id 查找；缺失 catalog 会被静默跳过，应在 V2 构建验证中改为错误。
- 实测 954 个 `(kind,id)` 无重复；一个普通实体当前一个 entry。相同显示名可以对应不同 ID，尤其开拓者男女及敌人模板，不能按 name 合并。

### 2.4 Endgame 优化的精确形态

证据：`domain/search-index.ts::collectEndgameSearchNames()`；`domain/endgame-view.ts::presentedStageWaves/occurrenceIdentity/mergeFixedOccurrences/uniqueSpawnOccurrences()`；`server/endgame.ts::getEndgameOccurrenceShard()`。

1. `buildEndgameData()` 先完成领域数据及精确属性预处理。名称收集遍历模式、赛期、encounter、battle、stage、展示 wave。
2. `presentedStageWaves()` 对固定波次按 `occurrenceIdentity` 合并，对 spawn 波次按同一身份去重。身份含 MonsterID、TemplateID、HP 上下文、speed/toughness、mechanics 等，**不是只按怪物 ID**。
3. `collectEndgameSearchNames()` 按原始 trim 后 `name` 聚合；`sync.ts` 用 SHA-256(name) 的前 16 位作 `entryId`。normalizedName 仅用于匹配，原始名称不同但归一碰撞时仍可多桶；当前没有这种碰撞。
4. 每个 locator 是 `mode:groupId:encounterIndex:battleIndex:stageIndex:waveIndex:occurrenceIndex`；8,167 个均唯一。name hash 只定位名称分片，不能替代角色/怪物身份，也不能跨上游改名稳定。
5. `routes/generated/endgame-occurrences/[entryId]/+server.ts` 声明 `prerender=true` 和 `entries=getEndgameOccurrenceEntryIds`。分片在 SvelteKit prerender 生成，**并非 sync 直接写入 `static/generated/endgame-occurrences/`**。
6. server 分片构造先取得相关 group views，直接按 locator 解析 item；group views 及敌人引用已有缓存。browser `expandEndgame()` 只加载命中的名称分片，用 locator key 取 occurrence，不扫描全部 stages。
7. browser 缓存 `Map<entryId,Promise<Shard>>`，按模式、groupId 降序、locator 各索引升序排列。页面 request sequence 防止旧异步结果覆盖新查询。

V2 可以直接消费这些名称桶，将其作为 `endgame-name` search documents；候选 key 回映旧 `EndgameSearchNameEntry` 后沿用展开。保留展示波次归并、精确属性、定位键、group cache、shard cache、失败提示、竞态保护。若日后添加按真实 enemy identity 关联别名，需要单独、明确构建映射，不能以名字相同推断 ID 等价。

## 3. Character Identity and Canonical Name Sources

### 3.1 从 AvatarID 到中文显示名

```text
ExcelOutput/AvatarConfig.json（93）
  + AvatarConfigLD.json（4）
  → character-sources.ts 指定合并，raw.ts::mergeConfigSources 按 AvatarID 去重/拒绝冲突
  → raw.ts::readRaw/readTable 使用 lossless-json，Hash 保持十进制字符串
  → AvatarName.Hash → localization.ts::createTextResolver → TextMap/TextMapCHS.json
  → AvatarBaseType → AvatarBaseType.BaseTypeText.Hash → 同一 TextMap
  → MultiplePathAvatarConfig[AvatarID].BaseAvatarID → 网站命名政策
  → catalog.name / Character.name → gameTextToPlain → 搜索 canonical
```

`sync.ts` 对 baseAvatarId `8001` 使用 `开拓者·${resolvedPathName}`，对 `1001` 使用 `三月七·${resolvedPathName}`，其余使用 rawName。这里的基础中文词是网站显式政策；不能说 canonical 完全等于原始 `AvatarName`。

| AvatarID        | 上游原名 / 关键引用                                                       | 网站 name / 解释                                                             |
| --------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `1001`          | `AvatarName.Hash=6186714091647966180` → 三月七；Knight；BaseAvatarID=1001 | 三月七·存护                                                                  |
| `1224`          | `16417870574330506928` → 三月七；Rogue；BaseAvatarID=1001                 | 三月七·巡猎，独立 AvatarID                                                   |
| `1002`          | `10239807114774791393` → 丹恒                                             | 丹恒，不能与 1213 合并                                                       |
| `1213`          | `12834585016341721411` → 丹恒•饮月                                        | 当前实际保留 `•`，不是示例中的 `·`；搜索归一后均为丹恒饮月                   |
| `8005` / `8006` | 原名 `{NICKNAME}`；Shaman；BaseAvatarID=8001；Gender 分别 MAN/WOMAN       | 都为开拓者·同谐，分别保留 ID 与链接                                          |
| `8001`–`8010`   | 五组男女 ID，Warrior/Knight/Shaman/Memory/Elation                         | 毁灭/存护/同谐/记忆/欢愉；不是一个 ID 的 alias 列表                          |
| `1014` / `1015` | LD 表的 Saber / Archer                                                    | CHS 数据允许拉丁名称，不应采用仅汉字 encoder                                 |
| `1506`          | `银狼LV.<unbreak>999</unbreak>`                                           | UI 用 GameText；搜索 plain canonical 应为 `银狼LV.999`，不可直接索引标签语法 |

97 个 `AvatarFullName.Hash` 均不在当前 TextMapCHS 中。`sync.ts` 虽然解析 fullName 并有 `{NICKNAME}` 替换分支，但这不产生可用 fullName alias。网站 `tr()` 及 resolver 的 fallback/diagnostics 是现状；未来 canonical metadata 生成应检查缺失及占位符，不将 `角色 ${id}` fallback 当成正式名称。

### 3.2 稳定身份边界

metadata key 使用 **合并后可展示角色的 `String(AvatarID)`**，与 `/characters/${id}`、catalog、资产映射一致。BaseAvatarID 仅可作为 family 关联，不用作主键；AdventurePlayerID、SourceAvatarID、SpecialAvatarID 也不能代替。

`AvatarConfigEnhanced` 当前 10 行，作为同一角色 `profiles.enhanced`，不额外生成角色搜索条目。`AvatarConfigTrial` 的 7205/7212/7213/7005/7006 与 AdventurePlayerID 有试用关系；不在正常 character merge 清单。`AvatarSourceConfig` 的活动映射（如 6022→1224）不是允许合并全站所有 AvatarID 的一般规则。

`domain/special-effects-presentation.ts` 另有技能关联卡片的 displayAvatarId/name 归一，例如 8001→8002 的展示选择及“三月七”缩写。它是局部 presentation 政策，不是全局角色搜索主键归一。

结论：可以按 stable AvatarID 自动派生 canonical，但必须复用同一领域命名构建逻辑及 CHS resolver，而非新写一套独立映射或把 BaseAvatarID 当角色 ID。

## 4. Official Alias Investigation

### 4.1 检索范围与判断标准

解析扫描了 `ExcelOutput` 的 2,185 个 JSON 顶层 records 中 Alias/Nickname/ShortName/DisplayName 类字段；检查普通/LD/Trial/Enhanced/Activity Avatar、MultiplePath、Atlas、Skin、ItemConfigAvatar、Source/Link、VO、NPC、RogueTalkName 等相关表字段及多条实际记录。另对 Config/Story 中相关字段做文本检索和代表性引用检查，并核对 StarRailRes 中文索引。

这是结构化证据调查，不是穷尽剧情自然语言中的所有称谓。游戏运行时代码未提供，混淆字段的语义不能仅凭数据猜测。没有把全 TextMap 中出现过的中文词自动关联为角色别名。

### 4.2 Confirmed official alias：只有有限的基础名用例

| 名称   | 同一 stable entity 的证据                                                  | 可采用范围                                                              |
| ------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 三月七 | `AvatarConfig[1001].AvatarName` → CHS 三月七，网站 canonical 为三月七·存护 | 1001 的 `officialAliases`；provenance subtype 建议 `official-base-name` |
| 三月七 | `AvatarConfig[1224].AvatarName` → CHS 三月七，网站 canonical 为三月七·巡猎 | 1224 的同类 alias；与 1001 冲突合法，两者都返回                         |

这里确认的是“同一 AvatarID 在官方数据中的基础名称，是网站消歧展示名的替代检索标签”，**不是确认游戏存在专门 nickname/alias 字段**。两条记录的依据均独立成立；不把“三月七·巡猎”设为存护形态的别名，也不向其他形态任意传播名称。

如果产品将 official alias 严格限定为“游戏明确列出的第二名称”，上述应单列 `official-base-name` 而非狭义 alias；在该定义下本轮确认的狭义 official alias 为零。推荐在三类模型中接纳官方基础名并记录 subtype，无需增加第四个检索权威等级。

### 4.3 Possible / ambiguous

| 候选来源                                 | 实际证据                                                  | 结论                                                                           |
| ---------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `AvatarFullName`                         | 字段与 AvatarID 同行，但当前 97 个 CHS 引用全部缺失       | 未来 upstream 可能补齐；届时逐项判断是全名、占位符还是其他语义。现在零条可收录 |
| `NPCData.DefaultNPCName/DefaultNPCTitle` | 有 NPC ID、配置路径、SeriesID；1001 指向 Mar_7th NPC 资源 | 同名/同资源不证明是该 playable AvatarID 的正式替代名，不自动迁移               |
| `RogueTalkNameConfig.Name/SubName`       | 主键 TalkNameID，另有 ImageID/IconPath，非 AvatarID       | 对话展示名/副标题，不足以建立角色 alias 关系                                   |
| `AtlasAvatarChangeInfo`                  | 记录含混淆字段及角色数字，如 1308、1313                   | 无可直接解析的名称关系，保持 uncertain                                         |

### 4.4 Not an alias / false positives

| 来源 / 样本                                                                                | 排除理由                                                                     |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 开拓者 `AvatarName={NICKNAME}`                                                             | 用户自定义名称占位符，不是任何固定官方或玩家俗称                             |
| `AvatarVOTag=mar7th`、`blade`；`Avatar_Ren_00` / `DanHengIL`                               | VO tag、prefab/config/internal naming，不是可直接采用的 official alias       |
| `AvatarConfigTrial[7213]` → 丹恒•饮月，AdventurePlayerID=1213                              | trial copy；不是新角色名，也不把 7213 当 playable 主键                       |
| `AvatarConfigEnhanced[1212]` / `EnhancedID=1`                                              | 同角色增强战斗 profile；不增加另一个 SearchDocument                          |
| `SpecialAvatar[1021213]`、`TYPE_PLOT`、AvatarID=7213                                       | 剧情试用实例及属性配置                                                       |
| `AvatarSkin[1100101].AvatarID=1001` + `ItemConfigAvatarSkin[1100101].ItemName=冬去煦至`    | 同皮肤 ID 的名称，不是三月七别名；其余皮肤有雪绽梅笺、春日手信等，语义一致   |
| `AvatarLinkConfig[1001]` 关联 8001、1002、1213、1003、1004                                 | 一对多不同角色关系，不能当同一身份/名称等价关系                              |
| `MatchThreeOpponent.Nickname` → 自负的赌徒 / 我只是个NPC                                   | 全 Excel 顶层目标字段扫描的唯一命中表；它是小游戏 OpponentID，不是角色 alias |
| `Config/...Alias=Caster/AdvLocalPlayer`；Story `BlockAlias`                                | target selector 或场景块引用，无 TextMap 角色名含义                          |
| `Config/BattleLineupPage/SkillTreePointPreset/SkillTreePointPreset_8007.json::DisplayName` | 最大等级含记忆主特殊行迹点，是预设名                                         |
| `FateAvatarDescription` 的 1014/1015 关联文本                                              | 棋子/队伍机制描述，含角色名不等于名称列表                                    |
| `ItemConfigAvatar` / LD 的 ItemName                                                        | 核对相同角色 ID，当前与 AvatarName 无差异，不提供额外 official alias         |

### 4.5 StarRailRes 名称信息的地位

`StarRailRes/README.md` 声明 index_new 为角色/技能等索引，注明游戏数据来源。`index_new/cn/characters.json` 有 97 个 ID，示例 1001 包含 `name=三月七`、`tag=mar7th`、path、element 及 `icon/character/1001.png`、preview、portrait 路径；还有其他语言目录及 index_min 压缩副本。

- ID 和 name/path 等为 **derived index**，不是网站应新增依赖的第二套权威 structured source。
- icon/image 文件路径为 **resource-only**。ID 可用于资产关联，tag 和资源名称不能成为 official alias。
- 本轮中文 index_new/index_min 相关 alias 字段检索没有发现角色 alias 列表。
- 网站权威结构化来源仍为 TurnBasedGameData；StarRailRes 负责视觉资源。两个版本虽本轮一致，部署仍分别由 lock 固定，不能假设两个索引永远同步。

## 5. Existing SearchEntry.aliases Audit

证据：`scripts/data/sync.ts` 各 `searchSeeds.push()` 及 1917–1925 附近的 hash 回查循环。所有 seed 初始 `aliases: []`，随后解析 hashes，非空且不等于原始 `entry.name` 才追加，最后字符串去重。它既无 alias 类型，也无人工维护入口。

| Producer / 实体            | 来源及实测例子                                            | 当前含义                                                       | officialAliases？      | V2 处理                                          |
| -------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- | ---------------------- | ------------------------------------------------ |
| Character / AvatarName     | 1001、1224 → 三月七                                       | 官方基础名 vs 网站加命途 canonical                             | 是，限定为已证实基础名 | generated，附字段/hash/ID 证据                   |
| Character / AvatarName     | 8001–8010 → `{NICKNAME}`                                  | 模板占位符                                                     | 否                     | 排除并诊断，不迁移                               |
| Character / AvatarFullName | 97 个引用均 missing                                       | 目前无 alias 值                                                | 当前否                 | 未来有值也需规则审查                             |
| Light Cone                 | EquipmentName + 对应 ItemConfigEquipment.ItemName；锋镝等 | 当前名称重复，169 个实体仅 169 个 normalized labels            | 不因第二 hash 自动认定 | 仍从领域派生 canonical；仅独立有证据的异名才迁移 |
| Relic                      | SetName；云无留迹的过客                                   | 同 canonical，60 条标签                                        | 不需要                 | generated canonical                              |
| Enemy                      | MonsterTemplateConfig.MonsterName                         | 同 canonical，628 条标签；不是任意 MonsterConfig variant names | 不需要                 | generated canonical，保留模板身份                |
| Endgame                    | occurrence.name                                           | 不是 SearchEntry.aliases；名称桶本身                           | 不适用                 | generated endgame-name document                  |
| normalization              | 丹恒•饮月 / 丹恒-饮月 / 丹恒饮月                          | 标点等价规则，不是存储的三条 alias                             | 否                     | normalization contract，避免膨胀 metadata        |

本轮没有发现现行 producer 维护 player/community alias，也没有代码从玩家知识自动拼外号。多命途 canonical 是代码拼接的展示名，不应与“自动生成玩家别名”混为一谈。

## 6. Searchable Dataset Statistics

统计直接读取 `static/generated/search.json`，非调用会写文件的 sync/build。label 数按 **entry 内 Set 去重之后、跨实体未去重** 计数；长度为 Unicode code point（本批名称没有造成与 JS UTF-16 长度统计分歧的补充平面字符）。P95 使用排序数组下标 `floor(0.95*(n-1))`。

| 领域         | entry 数 | normalized label 数 |   领域内唯一 label 数 | 平均长度 | P50 | P95 | 最大 |
| ------------ | -------: | ------------------: | --------------------: | -------: | --: | --: | ---: |
| Character    |       97 |                 109 |                    94 |    3.633 |   3 |  10 |   10 |
| Light Cone   |      169 |                 169 |                   169 |    5.278 |   6 |   8 |    9 |
| Relic        |       60 |                  60 |                    60 |    6.933 |   7 |   8 |    9 |
| Enemy        |      628 |                 628 |                   375 |    6.785 |   6 |  13 |   18 |
| Endgame name |      173 |                 173 |                   173 |    6.260 |   6 |  12 |   14 |
| 合计         |    1,127 |               1,139 | 695（跨全部领域去重） |    6.188 |   — |   — |   18 |

1–4 字 429 项，5–8 字 478 项，9–12 字 187 项，13 字以上 45 项。角色长度含十个 `{nickname}`（10 字）污染项；移除后更短。最长 normalized label 例：`冥魂渡者,死龙残躯,玻吕刻斯(完整)`（18 字）。

原始 display name 平均/最大：Character 3.381/27、Light Cone 5.290/9、Relic 6.933/9、Enemy 6.978/18、Endgame 6.497/15。角色 raw 最大值由 `银狼LV.<unbreak>999</unbreak>` 的 markup 引起，不应以 27 字估算实际搜索 token。

对全部 label 计算 `Σ L(L+1)/2 = 30,399`，这是按名称出现项枚举全部连续子串位置的理论量级，**不是 FlexSearch 实测 token 数、内存字节或官方内存公式**；实际有 token/posting 去重与实现开销。官方文档也将 full 描述为二次量级。当前几十千级子串位置足以支持原型验证，但不能从此承诺某个毫秒数或 MB 数。

Endgame locators：MoC 5,765、PF 2,079、AS 183、AA 140，共 8,167，覆盖 111 个 mode/group 赛期组合。普通实体 954，最大展开结果宇宙为 **954 + 8,167 = 9,121 张卡片位置**；不是断言存在一个非空查询同时命中全部。

现存 `search.json` 为 1,043,943 bytes，大部分额外负担来自 locators。现存 `build/generated/endgame-occurrences/` 有 173 个预渲染文件，合计 10,524,626 bytes，最大分片 388,635 bytes。这些是未压缩落盘字节，不是网络压缩传输量或 JS 堆大小；build 目录只是现存产物，未在本轮重建，作为参考量级。

## 7. Normalization Audit

当前 `domain/search-index.ts` 的实现确实为：

```ts
value
  .normalize('NFKC')
  .toLocaleLowerCase()
  .replace(/[\s·•・—_\-/]+/g, '');
```

`normalizeSearchLabel(value)` 额外先调用 `gameTextToPlain(value)`。该函数解析游戏 markup、移除样式标签，并通过 `normalizeGameText` 处理字面 `\\n` 等；query 不做 GameText 解析。因此“用户复制原始带标签字符串”与“复制 UI 显示文本”当前行为不同。

| 输入                                                      | 当前归一结果 / 行为                                         |
| --------------------------------------------------------- | ----------------------------------------------------------- |
| 丹恒·饮月 / 丹恒•饮月 / 丹恒・饮月 / 丹恒-饮月 / 丹恒饮月 | 都为丹恒饮月                                                |
| 丹恒—饮月、丹恒_饮月、丹恒/饮月、丹恒 饮月                | 都为丹恒饮月                                                |
| `ＡＢＣ` / `abc`；`March 7th`                             | abc；march7th                                               |
| 全角括号、逗号、冒号、问号、叹号                          | NFKC 转半角，但保留字符                                     |
| `「」`、`、`、`&`、`@`、`.`                               | 保留；实际数据存在这些字符                                  |
| `银狼LV.<unbreak>999</unbreak>`（label）                  | 银狼lv.999；不会删除数字重复                                |
| `{NICKNAME}`                                              | `{nickname}`，不会自动识别成无效占位符                      |
| en dash `–`、减号 `−`、零宽字符                           | 不在显式删除集合中；不可泛称“所有横线/所有不可见字符均忽略” |

建议 HSR 保留独立、版本化的 normalization contract。显示/审计保存原始文字；canonical 检索文本取 GameText plain；query 和 plain label 共用同一 NFKC、case、分隔符处理。V2 可用 `toLowerCase()` 明确避免 ambient locale 影响，视为版本变更并测试。

不要无条件剥掉全部标点：当前敌人 `(完整)/(污染)`、`火花大会@official`、角色 `LV.999` 等有实际意义。要增加等价规则应列举产品需求和回归样本。placeholder、空白、无效 raw reference 由 metadata validation 排除，不能指望 normalization 自动修好。

## 8. FlexSearch Compatibility Assessment

### 8.1 外部依据与版本范围

通过已验证可连接的 `127.0.0.1:7890` 代理，只读访问 FlexSearch 官方仓库文档/源码，未拉取或安装依赖。核查时 master commit 为 `f7ed963096a0792da7b2fd63bb7114b3fbac55ed`，package version `0.8.215`；**这是核查源码版本，不等于承诺下一轮必须选择此 npm 发布版本**。实现时固定明确发布版本并验证 API。

- [官方 README / tokenizer 能力与复杂度](https://github.com/nextapps-de/flexsearch/blob/f7ed963096a0792da7b2fd63bb7114b3fbac55ed/README.md)：full 支持连续部分匹配；forward 不能覆盖任意中间子串。
- [Document Search](https://github.com/nextapps-de/flexsearch/blob/f7ed963096a0792da7b2fd63bb7114b3fbac55ed/doc/document-search.md)：多字段、按字段结果、默认 100 条、独立外部模型时无需 store。
- [Encoder 文档](https://github.com/nextapps-de/flexsearch/blob/f7ed963096a0792da7b2fd63bb7114b3fbac55ed/doc/encoder.md) 与 [CJK preset 源码](https://github.com/nextapps-de/flexsearch/blob/f7ed963096a0792da7b2fd63bb7114b3fbac55ed/src/charset/cjk.js)：支持 custom encode；该 CJK preset 的核心是 `split: ""`。
- [Document add 源码](https://github.com/nextapps-de/flexsearch/blob/f7ed963096a0792da7b2fd63bb7114b3fbac55ed/src/document/add.js)：带 array marker 时逐项 append；否则数组会 join 空格。
- [Resolver](https://github.com/nextapps-de/flexsearch/blob/f7ed963096a0792da7b2fd63bb7114b3fbac55ed/doc/resolver.md)：布尔组合、boost、limit/offset；不能代替名称语义分级。
- [Export/import](https://github.com/nextapps-de/flexsearch/blob/f7ed963096a0792da7b2fd63bb7114b3fbac55ed/doc/export-import.md)：需要一致配置、完整导入所有 key；实验 fast-boot serialize 不支持 Document。

### 8.2 Document vs 多个 Index

推荐单个 **逻辑 Document index**，字段 canonical、officialAliases、playerAliases，key 带实体种类命名空间。Document 内部本就按字段维护索引；返回各字段候选 key 后业务层 union、去重、重新检查匹配证据。

优点是生命周期、实体 namespace、跨领域查询及 schema 集中；名称权威不被 flatten。无需 `store:true` 或 enriched full model，保持 catalogs 和 Endgame 数据在外部。

多个独立 Index 的优势是字段/领域独立加载与专属 tokenizer，但需要自行保证 add/remove、union、计数、limit、metadata 同步。当前 1,127 个 documents 没有足够规模理由为每个领域各建一套架构。若未来按领域延迟加载或 Document 数组语义验证不通过，可在统一 adapter 内换多个 Index，不影响上层模型。

### 8.3 Full 与 CJK/custom encoder

建议 `full` 用于 **每一条完整、已经 HSR 归一化的短名称**。不要索引 descriptions、stage serialized objects 或 8,167 次重复 occurrence 名称。

不默认选 `Charset.CJK`：该 preset 切单字。单字 token 的组合搜索不能自行证明多字 query 在原名称中按顺序连续出现，full 在已拆单字上也无法恢复完整名称子串语义。还要考虑 Saber、Archer、LV.999 等混合内容。

推荐自定义 `encode` 返回包含单个规范化完整 label 的 token 数组，由 full 拆连续子串。不要再套默认的字符去重、音近、词干/停用词处理。即使候选召回存在额外命中，也必须用保存的 normalized label 验证 exact/prefix/contains；但后验验证无法补救漏召回，因此需要完整性测试。

alias 数组必须保留边界：在核查版本中应明确验证 `officialAliases[]` / `playerAliases[]` 逐项 append 路径。若数组先 join，再用“删除全部空格”的 HSR normalization，可能把两个别名拼出不存在的跨 alias 子串。不要依赖默认 join 行为。空数组、同一文档跨字段重复值也要测试。此处是适配设计，未运行安装版 API 原型。

### 8.4 Resolver / boost、runtime 与 export/import

Resolver 可用于候选集合的 OR，但 v1 不需要复杂链式 boost。任何 engine relevance 都不得压过业务 rank class；建议首版完全不使用其分数作为业务排序依据。

优先从可读 SearchDocuments 在浏览器一次建立内存索引，每次 query 只 search。相对于当前 Maps 增加初始化 CPU；当前规模合理，但移动设备耗时/堆内存尚未实测。页面使用状态应明确区分索引初始化、无结果、Endgame 加载失败，不能未就绪时误报空结果。

可后续改为 build-time export / browser import；需要 pin library version、document descriptor、normalizationVersion、metadata hash/source commit，验证所有导出 key 完整且配置一致。导出文件作为 generated artifact，不作为人工 review 的 source of truth。不采用实验 fast-boot Document 路径。没有理由首轮引入数据库、后端搜索或 Worker；有实测主线程问题再考虑 Worker。

### 8.5 无静默截断的适配要求

Document 默认 100，Resolver resolve 也有 limit。建议将 **实际 document 总数 N**（当前 1,127）作为每个字段查询的充分上界，offset=0；若走 Resolver，中间和最终阶段也保证充分上界。每个字段最多返回 N 个不同 document，这与任意固定“1000 条”不同，能随数据增长保持完整。

不要假设 `limit:0`、`Infinity` 或负数代表无限；选定版本必须验证。候选 union 后再 rank/group，任何层不得先 top-k 再分类。也可分页穷尽 engine 结果，但不能将候选第一页当全部结果。alias labels 增长不改变每字段 document 上界；若改成 label-level document，则 N 必须相应改为 label documents 数。

## 9. Proposed Search V2 Data Model

建议区分 **可读名称元数据、检索文档、候选证据、presentation 引用**。当前 `SearchEntry` 实际不是 card presentation model；四类 catalog 与 `EndgameEnemyGridItem` 才是应保留的模型，不必为保留名字而维持旧 SearchEntry。

```ts
type SearchTarget =
  | { kind: 'character' | 'light-cone' | 'relic' | 'enemy'; id: string }
  | { kind: 'endgame-name'; entryId: string };

interface SearchDocument {
  key: string; // character:1001 / enemy:1003010 / endgame-name:<entryId>
  target: SearchTarget;
  canonicalName: string; // plain、可读；不是含游戏 markup 的渲染字符串
  officialAliases: string[];
  playerAliases: string[];
}

interface SearchDocumentBundle {
  schemaVersion: number;
  normalizationVersion: number;
  sourceCommit: string;
  metadataDigest: string;
  documents: SearchDocument[];
}

interface MatchEvidence {
  documentKey: string;
  nameKind: 'canonical' | 'official' | 'player';
  matchKind: 'exact' | 'prefix' | 'contains';
  matchedLabel: string;
}
```

这只是 internal contract 草案，不依赖 FlexSearch type。运行时 adapter 派生并缓存各字段 normalized labels，用 source document 生成 MatchEvidence；name provenance 放可读 metadata 中，不需要全部发往浏览器。用 discriminated target 防止把 Endgame hash 当 entityId。

普通候选经 target id 查 catalogs；Endgame 候选经 entryId 查现有名称桶再 expand。检索文档不携带头像、HP、全部 locators 或完整 card；locators 留在 Endgame domain manifest/association 结构，避免多份复制。

同 document 内按 `(nameKind, normalizedLabel)` 去重；同文本跨 nameKind 可保留来源并选最好证据。不同 document 永不因名称一致而合并。alias A/B 都命中同一目标只返回一张普通卡；一个 alias 对两个目标返回两张。Endgame 多个候选路径指向相同 locator 时以 locator 去重，不能按 MonsterID 去重不同阶段的卡片。

## 10. Proposed Character Name Metadata Format

### 10.1 方案比较与推荐

| 方案                                              | 优点                                                   | 问题                                                              | 结论                                                               |
| ------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| A：统一手工 canonical/official/player JSON        | 一处阅读                                               | canonical 重复维护、upstream 改名易陈旧、生成器容易覆盖人工 alias | 不推荐作为 source of truth                                         |
| B：generated official + manual player，构建 merge | 权威边界清晰，upstream 和 alias PR 分工清楚            | 需校验 generated snapshot 与 pinned inputs 一致                   | 推荐                                                               |
| C：只保留 runtime generated JSON，不提交官方快照  | 最符合目前 ignored generated 惯例，无双份 tracked data | 当前 updater PR 仅 lock diff，难 review 实际改名                  | 可运行，但不满足本任务强调的可见名称 diff；需 PR artifact 才能补齐 |

推荐 **B，加一个小而可提交的官方名称审阅快照**。这是对现有 generated 全 ignored 惯例的有意识、有限扩展：仅约百个角色的可读 metadata 入版本控制，大型搜索索引、全 catalog、FlexSearch export、occurrence shards 仍 ignored。

建议未来布局（本轮未创建这些文件）：

```text
data/search/character-official-names.generated.json  # tracked，禁止手改
data/search/character-player-aliases.json            # tracked，人工维护
static/generated/search-v2.json                     # ignored，构建 merge 的运行时文档
```

### 10.2 Generated 官方快照

```json
{
  "schemaVersion": 1,
  "normalizationVersion": 1,
  "sourceCommit": "8cdb905dc2f8e6fffa9be4eb07af3e34435d6091",
  "namingPolicyVersion": 1,
  "characters": {
    "1001": {
      "canonicalName": "三月七·存护",
      "officialAliases": [
        {
          "value": "三月七",
          "sourceKind": "official-base-name",
          "table": "AvatarConfig",
          "recordId": "1001",
          "field": "AvatarName",
          "textHash": "6186714091647966180"
        }
      ],
      "canonicalSource": {
        "table": "AvatarConfig",
        "recordId": "1001",
        "field": "AvatarName",
        "textHash": "6186714091647966180",
        "policy": "multiple-path-base-1001",
        "baseAvatarId": "1001",
        "pathId": "Knight"
      }
    }
  }
}
```

示例只是报告中的一条已核实样本，未新增正式 alias。完整格式应同时记录 path localization provenance；普通 canonical 无需 multiple-path 字段。只复制白名单、语义确认的官方替代名，不因 future FullName 非空就自动认领全部值。

canonical source of truth 为 pinned tables/CHS + naming policy；official alias 为经白名单规则确认的同 ID upstream 字段与 provenance；generated JSON 是可重现视图，不成为手工 override 的权威。

### 10.3 Manual player 文件

```json
{
  "schemaVersion": 1,
  "characters": {
    "1001": { "playerAliases": [] },
    "1224": { "playerAliases": [] }
  }
}
```

使用真实 AvatarID 的十进制字符串 key；可只列有 alias 的 ID。维护者只改字符串数组，PR 描述解释社区用法和作用范围；本轮不提供、猜测或抓取任何 player alias 内容。无跨角色唯一性约束，可报告 normalized collision 供 review，但不能因合法冲突拒绝构建。禁止空值、纯分隔符、占位符；缺失或删除的 ID 必须明确诊断，不能静默丢弃。跨字段/同一 ID 重复可规范化整理并提示，不应误删跨实体合法对应。

### 10.4 构建与 PR 的可复现性

现状：`.gitignore` 忽略 `src/lib/generated/*`、`static/generated/*`、`data/audit/*`；`sync.ts::writeJson()` 紧凑输出且 manifest 有时间戳。`.github/workflows/update-upstreams.yml` 更新 lock、验证 `deploy:build`，但只 `git add upstream.lock.json`。**目前 upstream update PR 不会自动附带 metadata diff。**

建议下一轮：

1. 提取可复用、确定性的 character naming builder；官方快照 generator 与 catalog 使用它，从 `deploy:build` 已准备好的 pinned data root 派生，不能旁路读取本地 sibling HEAD。
2. 官方快照 2-space pretty JSON、固定 ID/alias/provenance 顺序，无 generatedAt/绝对路径；sourceCommit、policy version 保留。同 input 重跑字节相同。
3. 普通 deploy 在临时/ignored 输出中计算并 **校验 tracked snapshot 一致**，不在生产构建中静默修改 tracked 文件。upstream updater 在 lock 更新后显式刷新官方快照，再验证 deploy 并将 lock+快照同时纳入 PR。
4. runtime docs merge 官方派生结果与 manual aliases；重建条件加入 manual file digest、naming policy/normalization/schema version。当前 `data:ensure` 主要检查 manifest schema/sourceCommit/endgame/homepage，**只改 player alias 不会天然触发重建**；这一点必须迁移。
5. alias-only PR 校验 ID、格式、归一结果和冲突，并给出影响目标及 ranking fixture；不需要网络检索玩家别名。canonical 改名 PR review 看 source hash、policy 和名称 diff，不能手修 generated 快照掩盖错误。

因此建议提交 generated canonical/official metadata，但前提是同时落实 regenerate/check 工作流；若决定完全遵循现有 ignored 惯例，则退为 CI diff artifact，明确它不等同 tracked snapshot。

## 11. Proposed Ranking Model

建议 **match quality 优先、同质量下 name authority 优先**：

| Rank class（越小越优先） | 条件                    |
| -----------------------: | ----------------------- |
|                        0 | canonical exact         |
|                        1 | official alias exact    |
|                        2 | player alias exact      |
|                        3 | canonical prefix        |
|                        4 | official alias prefix   |
|                        5 | player alias prefix     |
|                        6 | canonical contains      |
|                        7 | official alias contains |
|                        8 | player alias contains   |

选择 player exact 高于 canonical prefix，是因为人工维护别名通常表达明确目标；用户完整输入一个维护者认可的 alias，应优先于碰巧以这些字开头的长名字。canonical exact 仍始终最高。若按 authority 全面优先，canonical contains 都可能压过精确俗称，不符合引入 player alias 的目的。

每个 document 取最佳 MatchEvidence；若存在多条相同 rank 证据，按固定 normalized label 次序选一条用于解释。跨 document 建议以 `(rankClass, normalizedCanonicalName 的固定码点顺序, kind 固定序, entityId/key 固定顺序)` 构成 total order，首版不引入 engine relevance、任意连续分或“最短名字加分”。若产品坚持拼音顺序，可 build-time 生成并版本化 sort key，再以 ID 作最终 tie-break；只加 localeCompare 不能保证跨运行时一致。

当前 UI 固定分区，普通实体应在各分区体现该序；不强行用权威顺序打散 Endgame 模式/赛期/定位顺序。Endgame 的名称匹配证据可保存，但卡片按已有领域顺序展示。对于 `三月七`，1001/1224 都是 official exact；对于开拓者同谐，同名男女 canonical exact 都保留。

删除现有 exact shortcut：exact 是优先级而非筛掉 prefix/contains 的规则。保留全部有效候选以后再排序；这样“银鬃尉官”既可优先原名，也能展示 `(完整)` 等匹配。

## 12. Result-Cap Removal Impact

| 限制 / 丢失点                                    | 当前影响                             | V2 要求                                       |
| ------------------------------------------------ | ------------------------------------ | --------------------------------------------- |
| `searchEntries().slice(0,80)`                    | 旧 API 与测试                        | 删除或连 API 一起移除                         |
| service `.slice(0,80)`                           | 页面四类普通结果合并上限             | 删除；不能改为另一个固定 cap                  |
| 每类 exact 分支                                  | exact 存在时漏掉同类 prefix/contains | exact 结果与完整候选 union                    |
| Endgame exact 分支                               | 潜在排除非 exact 的名称桶            | 同样不可排他                                  |
| model lookup 失败                                | 普通结果被静默跳过                   | 构建保证 reference 完整，runtime 显式错误策略 |
| 分片失败/缺 locator                              | partial results + unavailable 提示   | 保留部分可用结果和明确失败状态                |
| FlexSearch 默认 100 / per-field / Resolver limit | 新引入的 hidden caps                 | 全链路以真实 N 充分召回并测试                 |

未发现 `/search` 页面、OverviewGrid 或 EndgameEnemyGrid 的额外 slice、分页或最多 80 的模板假设；均直接 each 全数组。目录页面有其独立分页/筛选机制，不在本次全局 service 调用链内，不能将其页大小误报为全局 cap。

真实查询“的”：普通有效匹配 188，旧 service 截为 80；Endgame 32 个名称桶关联 876 occurrences，完整总计 1,064 张卡片。“者”：71 个普通实体 + 23 个名称桶对应 1,804 occurrences，总计 1,875。在扫描所有现存 normalized labels 的单字符查询时，“者”为最大展开量；这些计数按完整 contains 语义，不依赖旧 scorer 排序。

9,121 为整个结果宇宙上界；空查询产品行为仍为空，不通过“空查询返回所有”制造压力测试捷径。测试中可使用合成数据构造任意大的合法命中。

建议 presentation 分阶段支持分组 load-more 或虚拟化，并明确总命中数、当前已呈现数、加载失败。occurrence locator count 可在下载前计算，加载仅影响展示，不改变搜索完整结果集合。分片 fetch 可限并发，保留所有待加载目标；不能限前几个分片。当前 rejected Promise 会保留在 cache，后续同名查询可能继续失败，V2 应考虑失败缓存清除/重试；它不是数量上限，但影响可用性。

## 13. Migration Impact

### 可以删除 / 替换

- 旧 `SearchEntry` 作为无语义搜索 seed 的结构、`searchEntries()`、`searchMatchScore()` 与连续 scorer（当前只见 tests 使用旧导出；迁移前再全仓查调用）。
- `normalizedLabels` flattened 模型、hash 一概转 aliases 的循环。
- ordinary/Endgame 的 exact-or-partial 排他路径、两个 80 cap。
- 仅为旧 scorer 与 cap 保留的测试预期，不把错误行为当必须兼容的产品 contract。

### 必须保留

- `/search?q=`、表单提交/草稿、刷新/历史导航、空结果、分类 UI。
- CatalogEntry / RelicCatalogEntry / EnemyCatalogEntry、四类 Overview cards、资产路径及 gracefully missing 行为。
- canonical identity、LD merge、游戏文本解析、多命途政策及 hash 精度边界。
- Endgame `presentedStageWaves`、属性预计算、occurrenceIdentity、locator 定位、prerender shard、缓存、领域排序与 stale-request guard。

建议保留 `createGlobalSearchService` 的外部 facade 名称或兼容接口便于切换，但重写内部；这不是要求保留旧抽象。提供新 engine adapter 后，domain builder 不引用 FlexSearch，UI 不引用底层字段索引。

## 14. Testing Strategy

### 14.1 已有测试与盲区

`tests/unit/search.test.ts` 已覆盖 normalization、旧 exact/prefix/contains/alias 次序、旧 80 cap、954/173/8167 数量、返回原 catalog 引用、同 normalized label 多实体、Endgame 名称搜索/模式赛期顺序/缓存。其主要集成 fixture 依赖现存 generated JSON，另有小型手写 collision/shard fixture；还不是三类名称独立测试。

`tests/unit/data.test.ts` 检查 CHS hash、LD/角色数据、多命途显示名及生成索引；`scripts/data/validate.ts` 861 附近校验 schema、数量、normalized label 去重，重新收集 Endgame 名称并校验 locator 顺序/唯一性、entryId 冲突。`tests/e2e/site.spec.ts` 1015 附近起覆盖全局提交/URL/刷新/前进后退、四类 cards、空分类、无结果、实际 Endgame 属性/赛期；`tests/e2e/navigator.spec.ts` 覆盖入口。

本轮未运行 test/check/build：未改可执行代码；check 会执行 svelte-kit sync，build/prebuild 会 ensure/generate，browser tests 可能生成报告/启动构建。调查采用只读统计与源代码核对，不把这些测试称为本轮已通过。

### 14.2 Implementation 最低回归集合

| 测试层              | 必须验证                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| normalization 单测  | NFKC、大小写、空格、所有指定点/横线/斜线、保留标点、数字重复、GameText plain、空/纯分隔符、幂等性；query 与 label 一致性                              |
| metadata 单测       | 普通+LD、AvatarID 唯一、同名男女不合并、1001/1224、1213 原始 •、1506 markup、缺 FullName、不收 `{NICKNAME}`、皮肤/试用/internal tag 不入 alias        |
| rank 单测           | 九类 pairwise 次序、canonical exact 不被压过、player exact 优于 canonical prefix、同文档最佳证据、随机打乱插入顺序仍相同结果                          |
| conflict 单测       | 同 alias→两个角色；同名不同 ID；同文档重复 alias；canonical 与另一目标 alias 冲突；跨领域同名；禁止 alias uniqueness 约束                             |
| engine adapter      | Document 三字段 OR、空 alias 数组、alias 边界不串联、拉丁/CJK/标点 contains；不要仅测 exact                                                           |
| 召回完整性          | >80、>100 及 >1000 合成匹配；每字段/Resolver 无截断；exact 与 prefix/contains 同时存在；与全 label 穷举 oracle 对比 key 集合                          |
| Endgame             | 173 名称→8167 locators 等基线，合成 normalized 碰撞桶、多个 target 共享 locator 去重、不同 stage 同 MonsterID 保留；不扫描全 stage；只 fetch 命中分片 |
| 异步及 presentation | 未就绪状态、部分分片失败/重试、cache、快切 query 不回写旧结果、完整计数与 load-more/虚拟化不损害 engine 完整性                                        |
| 生成/部署集成       | 同 pinned input 生成字节一致；player-only 更改触发新 docs；snapshot stale 检测；export/import 若采用则配置指纹和 round-trip 结果一致                  |
| 浏览器              | 保留现有 URL/导航/card/Endgame 测试，增加真实“的”超过 80 的可访问结果、长列表、键盘及移动布局                                                         |

oracle 是测试用简单穷举，不能退化为生产每次全 occurrence scan。优先用独立小 fixture 检查语义，真实数据集做集成/规模基线，避免所有测试绑定易变的总数量。

## 15. Recommended Architecture

```text
Pinned upstream + versioned HSR naming policy
  → shared domain builders → current catalogs/details/Endgame preprocessing
  → generated official-name review snapshot
Manual player-alias JSON ─────────────┐
                                    ↓
                          validate / merge / build SearchDocuments
                                    ↓
                   versioned HSR normalization + FlexSearch adapter
                                    ↓
                   complete candidate union（按真实 N 召回）
                                    ↓
                   label evidence + deterministic rank + key dedupe
                                    ↓
                catalog references / Endgame name-bucket references
                                    ↓
                  current cards / cached locator-based shard expansion
                                    ↓
                         presentation pagination if needed
```

迁移顺序建议：

1. 先冻结 identity、normalization、rank 和无 cap 的测试 contract；将 exact shortcut 漏召回写成修正预期。
2. 提取共享 naming builder，定义 canonical/official provenance，拒绝 placeholder，加入 manual 文件/schema；不引入玩家别名样本内容。
3. 生成 tracked 官方快照和独立 runtime documents，接通 pinned root、upstream PR diff 与 alias digest invalidation。
4. 固定 FlexSearch 版本，实现 Document adapter；用完整性 oracle 验证 full/custom encoder/数组边界/per-field limit，测一次真实规模的冷启动及内存。
5. 将 service 普通四类查询替换为完整召回+rank，同时保留 catalog/card 接口。
6. 将 Endgame 名称桶纳入同一 engine，继续 locator-based expansion；确认只在构建时遍历全数据。
7. 一次性切换真实页面调用路径，移除旧 API/scorer/caps/扁平 aliases；更新旧 cap 测试，完整跑项目门禁。
8. 根据长列表实测添加 presentation load-more/virtualization；仅在初始化证据需要时采用 export/import 或 Worker，不以引擎截断换性能。

## 16. Open Questions / Decisions Needed

这些是 implementation 前的产品/工程决策，不妨碍本轮只读结论：

- 是否接受将“三月七”这样的官方基础名归入 officialAliases，并用 subtype 标注？推荐接受；狭义第二名称则本轮为零。
- 是否接受小型 generated 官方快照 tracked 的例外，以及 updater 刷新+deploy 校验机制？推荐接受，避免无法 review upstream 改名。
- 是否需要跨 runtime 严格一致的码点排序，还是版本化中文排序 key？推荐首版简单 total order。
- 展示层首期采用分组 load-more 还是虚拟化？engine 完整性不依赖选择；应以 1,875 张真实查询卡片的目标设备测量决策。
- FlexSearch 发布版本、数组 marker、自定义 encoder、所有 limit 路径仍须安装后的契约测试；本轮没有 benchmark 或可执行 prototype。
- 开拓者男女目前是不同结果，需要保持。未来若只展示一张卡，应是单独的 presentation/identity 产品决策，不能由 alias dedupe 暗中实现。

### 任务要求的 17 项最终答案

1. **canonical source of truth？** pinned `AvatarConfig + AvatarConfigLD + TextMapCHS + AvatarBaseType + MultiplePathAvatarConfig`，加网站命名政策；最终检索取同一 name 的 plain text。
2. **stable ID？** 合并后可展示记录的十进制字符串 AvatarID；不要用 BaseAvatarID、name hash 或资源 tag。
3. **本地是否有真正 official alias？** 没有通用 alias 数据集；只有两个三月七 ID 的官方基础名，足以作为相对网站 canonical 的替代标签。没有证据确认更多狭义第二名称。
4. **具体字段？** `AvatarConfig[1001/1224].AvatarName.Hash → TextMapCHS`；不是 `AvatarFullName`，也不是资源名。
5. **不存在的部分是否明确？** 当前 97 个 FullName 缺失，没有发现可直接采用的其他官方角色 alias 表；不制造新 alias。
6. **现有 aliases 装什么？** hash 回查后不同于 name 的字符串；实测有效新增为两条三月七基础名及十条错误占位符，其他领域无额外 normalized labels。
7. **一个还是多个文件？** 官方派生与人工 player 分文件；runtime 可 merge 成一个 SearchDocuments bundle。
8. **generated/manual？** canonical、证实 official aliases、runtime docs generated；player aliases manual；命名政策/白名单规则由代码 review 管理。
9. **generated 官方 metadata 是否 commit？** 推荐提交小型可读审阅快照，并强制再生一致性；完整索引和 occurrence artifacts 不提交。
10. **Document 适合吗？** 适合统一短名称多字段召回；模型及 rerank 不耦合具体库。
11. **full 适合吗？** 当前 1,139 标签/平均 6.188 字的量级值得采用，限制在名称字段；不是已实测性能保证。
12. **normalization 如何分工？** HSR 定义 plain/NFKC/case/分隔符规则；custom encoder 保持单 label 边界，FlexSearch full 提供子串召回；业务复核精确语义。
13. **替换旧 scorer？** 是，替换实际 service 内部及旧 `searchEntries()`，不保留任意连续分和 exact 排他路径。
14. **与 presentation 分离？** 是；SearchDocument 独立，复用现有 catalog/card 和 EndgameGridItem，不把旧 SearchEntry 当成必须保留的 presentation 层。
15. **Endgame 不退化如何接入？** 每个现有名称桶一个 document，命中后按 entryId→locators→预渲染分片；保留 identity-aware wave preprocessing，绝不为每次查询展开所有 stages。
16. **删 80 后还有什么 hidden limits？** 两个 exact shortcut、缺模型的静默跳过、分片失败；FlexSearch 新默认 100 及 per-field/Resolver limit。UI 未发现额外固定 cap。
17. **迁移顺序？** contract/tests → naming/metadata → pinned generation/PR diff → Document 完整性验证 → 普通 service → Endgame 适配 → 页面切换并删旧实现 → 按实测优化展示层。

### 本轮交付边界

唯一新增仓库文件为本报告。未修改代码、依赖、配置、upstream、generated assets、tests、部署脚本或 lock；未 commit/push。适用于实现阶段的检查、生成器与 CI 变更均只是建议。
