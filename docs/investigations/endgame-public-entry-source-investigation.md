# Endgame Public-Entry Source Investigation

调查日期：2026-09-09（Asia/Shanghai）

证据标签：**Config-derived**（静态配置）、**Git-history-derived**（上游历史）、**External technical source**（公开协议/数据工程）、**Official-history validation**（官方结果校验）、**Strong inference**（强推断）、**Unknown**（未知）。

## 1. Executive Summary

结论是：**Partially found / insufficient**。

本轮没有在 pinned `TurnBasedGameData`、`StarRailRes` 或 HSR-Database 已消费的数据中找到一份完整、可跨 MoC / PF / AS / AA 使用、能区分“配置存在”与“正式公开投放”的 per-season authoritative registry。不过调查找到两项重要的新证据：

1. `291015` / `291016` 不是悬空或天然代表 staging/inactive 的 ID。它们是 `ExcelOutput/ScheduleDataGlobal.json` 中真实存在的 schedule rows；`ChallengeGroupConfig[1034/1035].ScheduleDataID` 可以在该表中解析。旧报告中“相对 `ScheduleDataChallengeMaze` dangling”的描述仍成立，但若把它表述为“整个 dump 中不存在”则不成立。
2. 公开 protobuf schema 明确存在由服务器返回的 `GetActivityScheduleConfigScRsp.schedule_data`，其中 `ActivityScheduleData` 带 `activity_id / begin_time / end_time / panel_id`。这证明至少 activity scheduling 存在静态 Excel dump 之外的 runtime/server-owned 数据层；但公开 schema 本身没有提供正式服响应值，因此不能据此重建 public eligibility。

`ScheduleDataGlobal[291015]` 的有效起止边界与 4.4 官方公告中的 MoC “Stormcleanse” 完全一致，故 1034 当前的 schedule binding 已可配置化解释。`291016` 与 orphan `201035` 的时间边界吻合，但没有发现二者之间的显式 FK、映射表或 selector，不能静默重连。

对 108 / 109，仍未找到 config-backed 的不公开理由。它们在 `ScheduleDataChallengeMaze` 中有可解析的 2033 时间，但本轮找到的 global schedule 与 runtime activity schema都没有给出排除它们的记录。

本轮只新增本调查文档；没有修改 public eligibility、schedule classification、recommendation、routing、Search、sitemap、UI 或 generated-data contract。

## 2. Question and scope

本调查回答四个问题：

- 是否有高于 raw group/schedule rows 的 source，负责公开投放选择；
- 正式服 current MoC / PF / AS / AA 的选择依据在哪里；
- `291015/291016` 的配置语义是什么；
- `201034/201035` 存在但 group FK 切走，是否意味着 mode schedule table 只是候选数据。

范围包括 pinned 静态数据、非 Excel client config、上游 Git 历史、公开 protobuf/schema 项目及官方公告校验。明确不包含生产流量抓取、私有接口、公告抓取建库或任何产品策略实现。

## 3. Config-first methodology

调查顺序为：

1. 复用两份既有 MoC 调查已确认的事实；
2. 清点 `ExcelOutput / Config / Stages / Story / StarRailRes / HSR-Database` 数据层；
3. 按字段、类型和语义查找 schedule、availability、entry、activity、server/dynamic value；
4. 对 `291xxx / 201034 / 201035` 做 field-aware reverse reference；
5. 用 Git history 查首次引入及同 commit 关联变化；
6. 用公开协议/数据工程确认 dump 外的数据层；
7. 仅用官方公告验证候选 source 的输出，不用公告反推配置语义。

所有结论均区分直接证据、推断与未知；未以年份、编号前缀、缺名或 GroupID 顺序补齐空白。

## 4. Pinned upstream baseline

`HSR-Database/upstream.lock.json` 固定：

| Source | Commit | Branch/worktree state |
|---|---|---|
| TurnBasedGameData | `8dc7843723cf6f2d6acafee0b3fb152c90994208` | `main`, clean |
| StarRailRes | `d226befe3db13f2ec15f4161d5f34b1b607643fe` | `master`, clean |
| HSR-Database | current `develop` | investigation document only |

前两份调查使用过的 TBGD 基线 `8cdb905dc2f8e6fffa9be4eb07af3e34435d6091` 与当前 lock 之间，本文涉及的 group、mode schedule、global schedule、activity 和 peak 配置无 diff。因此既有 4.5 事实可继续使用，同时本报告以 lock 中的 `8dc784…` 为准。

## 5. What the previous MoC audit already established

既有调查已经证明：

- 108 / 109 的 `200108 / 200109` 时间直接来自 `ScheduleDataChallengeMaze`，网站未推算 2033；
- 当前 pipeline 的基本行为是“schedule 可解析 + 与现在比较”，所以未来时间进入 Upcoming；
- 4.4 的 1034 曾指向 `201034`；首个 4.5 snapshot 中改为 `291015`，并新增 1035 → `291016`；
- `201034 / 201035` 仍留在 `ScheduleDataChallengeMaze`；
- 单凭 `291xxx`、2033、缺 `GroupName`、battle payload reuse 或 orphan row 不能证明隐藏/占位语义。

本轮修正一点：`291015/291016` 只是在 `ScheduleDataChallengeMaze` 中无法解析；它们在 `ScheduleDataGlobal` 中有目标 row。

## 6. Source inventory

| Tree/source | 内容类型 | 与本题的相关性 | 结果 |
|---|---|---|---|
| `TurnBasedGameData/ExcelOutput` | 静态 Excel 表 | group、mode/global schedule、activity、entry 元数据 | 找到真实 `ScheduleDataGlobal`；未找到统一 public registry |
| `TurnBasedGameData/Config` | runtime client config、关卡/UI/server preference schema | 可能揭示 entry、动态值或 server ownership | 找到 challenge/runtime preference schema；未找到正式服取值或 per-season selector |
| `TurnBasedGameData/Stages` | 关卡场景/战斗环境 | 内容存在与玩法载荷 | 未找到 public activation 关系 |
| `TurnBasedGameData/Story` | 剧情/流程配置 | 可能含入口流程 | 未找到 endgame season selector |
| TBGD other trees | text maps、资源/元数据等 | 名称与资源解析 | 可确认完整度，不确认投放 |
| `StarRailRes` | 资源索引与客户端资源 | UI/资源存在性 | 未找到 live-ops authoritative values |
| `HSR-Database` | 当前 ingestion/domain/presentation | 显示项目实际消费哪些表 | 只消费 mode-specific schedule 路径；不消费 `ScheduleDataGlobal` |
| 公开 protobuf/schema | 网络响应的结构 | 可确认 server-owned data layer | 找到 activity schedule response；未取得正式服值 |

体量检查也说明 `Config` 不是可以忽略的小补充：本地约有 126,586 个 JSON（约 1.10 GB）；`ExcelOutput` 约 2,185 个 JSON（约 279 MB），另有 `Stages` 与 `Story`。本轮按类别与语义筛查，并非只 grep 两个 ID。

## 7. Current Endgame scheduling architecture

静态配置呈现的关系如下：

| Mode | Group source | Binding field | Schedule source found | Static public selector |
|---|---|---|---|---|
| MoC | `ChallengeGroupConfig` | `ScheduleDataID` | `ScheduleDataChallengeMaze` **或** `ScheduleDataGlobal` | 未找到 |
| PF | `ChallengeStoryGroupConfig` | `ScheduleDataID` | `ScheduleDataChallengeStory` | 未找到 |
| AS | `ChallengeBossGroupConfig` | `ScheduleDataID` | `ScheduleDataChallengeBoss` | 未找到 |
| AA | `ChallengePeakGroupConfig` | `ActivityModuleID` | `ActivityConfig` 可连到 Activity；静态表中无赛期时间 | 未找到；时间更像由 activity schedule response 提供 |

`ChallengeGeneralConfig` 只有 Memory / Story / Boss 三个模式级条目及入口/解锁信息，不列出 active group，也不覆盖 AA。它是模式入口配置，不是赛期 registry。

这一区分必须保持：group row 证明 **content existence**；名称、关卡、文本和 buff 证明 **content completeness**；schedule FK 证明 **schedule binding**；只有额外证据才可证明 **public activation**。C 不蕴含 D。

## 8. Search for a per-season public/active registry

在 ExcelOutput 中按 `Schedule / Season / Period / Cycle / BeginTime / EndTime / Active / Enable / Release / Open / Available / Show / Hide / Current / GroupList / GroupID / ScheduleID / ActivityID / Registry` 等语义与实际 schema 交叉筛查后：

- 找到了各模式 group/schedule 表和 `ScheduleDataGlobal`；
- 找到了模式级 `ChallengeGeneralConfig`、通用 activity/panel/module 关系；
- 没有找到包含“当前公开的 MoC/PF/AS group ID 列表”或等价字段的表；
- 没有找到把 108/109 标记为非公开、把 1034 标记为当前、把 1035 标记为未来/隐藏的静态字段；
- 没有发现其他 mode 的 group FK 指向同一 `291xxx` family。

因此静态 Excel 层能表达候选内容和时间绑定，但不能完整表达 public eligibility。

## 9. Search outside ExcelOutput

`Config` 中重点检查了 `Activity`、`ConfigServerPrefs`、`GlobalConfig`、`GamePlay/GamePlays`、`Level` 以及文件/类型名带 `Entry / Schedule / Challenge / Dynamic / Server / Global / FixedValue / Activity` 的候选。

有效发现只有两类：

1. `Config/ConfigServerPrefs/ServerPrefsConfig.json` 声明服务器/账号持久化状态的名字和类型；
2. 若干 challenge UI、玩法、关卡模板与能力配置，证明客户端会消费 challenge 状态，但没有 season publication 值。

`Config/GameEntryUIConfig.json` 是通用游戏入口/教程 UI 配置，并非 Endgame public-entry selector。`Config/Activity` 当前内容也没有连接到四种目标模式的正式赛期选择。`Stages`、`Story` 中的命中主要属于关卡载荷、流程或数值碰撞，未形成 group → public entry 的字段链。

## 10. Runtime / dynamic / server-owned configuration evidence

### Config-derived

`ServerPrefsConfig.json` 暴露了这些 schema 名称：

- `SeenBuffScheduleChallengeGroupIDs: HashSet<uint32>`
- `SeenAutoUnlockScheduleChallengeGroupIDs: HashSet<uint32>`
- `SeenChallengeMemoryLastUnlockGroupID: uint32`
- `SeenAutoUnlockScheduleChallengeProgress: Dict<uint32,uint32>`
- `ServerChallengeCollectionActivitySeenChallengeGroupIDs`
- `ChallengePeakActivitySeenGroupID`
- `ChallengeTierceOpenGroupIDs`
- Memory / Story / Boss 的 seen unlock progress 字段

这证明运行时存在按 challenge group 保存的 server/player state，但这些字段大多是 `Seen`、progress 或 UI acknowledgement。它们不是全局正式投放 authority；dump 只含 schema，不含可用于构建当前赛期的账号/服务器值。

### External technical source

公开 `hkrpg-go` protobuf（调查时固定到 `ef47e49a233133c46d70ab5a4deb4bc71ae49571`）定义：

- `ActivityScheduleData { activity_id, begin_time, end_time, panel_id }`
- `GetActivityScheduleConfigScRsp.schedule_data`
- `GetChallengeScRsp.challenge_list / challenge_group_list`

这直接证明 activity schedule 可以由服务器响应提供；也证明 challenge 数据有 server-returned 层。但 `GetChallengeScRsp.challenge_group_list` 同时承载玩家进度/奖励状态，单凭 message shape 不能证明它就是“所有公开赛期列表”。没有正式服 response snapshot，因此这条证据只能确认 authority **可能位于 server layer**，不能给出具体 publication decision。

## 11. Field-aware reverse-reference investigation

| Value | True semantic references | Numeric collisions / excluded hits |
|---|---|---|
| `291015` | `ChallengeGroupConfig[1034].ScheduleDataID`; `ScheduleDataGlobal[291015].ID` | Config/Stages/Story 中小数、资源/声音等更长数值片段 |
| `291016` | `ChallengeGroupConfig[1035].ScheduleDataID`; `ScheduleDataGlobal[291016].ID` | 同上 |
| `201034` | `ScheduleDataChallengeMaze[201034].ID`; 4.4 历史中的 `ChallengeGroupConfig[1034].ScheduleDataID` | 当前无 group FK |
| `201035` | `ScheduleDataChallengeMaze[201035].ID` | 当前无 group FK；未发现显式 1035 映射 |

只有字段语义匹配的值被计为引用。字符串包含、hash、浮点数片段、ItemID/Cost 等不同 domain 不用于建立关系。

## 12. The 291xxx namespace

| ID / range | Table | Field | Referenced by | Resolved target? | Confirmed semantics |
|---|---|---|---|---|---|
| `291001–291008` | `ItemConfigPlayerRoomDynamic`, `ItemConfigTrainDynamic`, `PlayerRoomDynamicConfig`, `TrainPartyDynamicConfig` | item/config `ID` | 对应 dynamic room/train 内容；部分也见于 `RewardData.ItemID` | 在各自 item domain 内解析 | 动态车厢/列车相关 item/config ID；不是 schedule namespace |
| `291008` | `ScheduleDataGlobal` | `ID` | 当前未发现 Endgame group FK | 是 | global schedule row；与 Item `291008` 是跨表数值碰撞 |
| `291014` | `ScheduleDataGlobal` | `ID` | 当前未发现 Endgame group FK | 是 | global schedule row |
| `291015` | `ScheduleDataGlobal` | `ID`, local/global time fields | `ChallengeGroupConfig[1034].ScheduleDataID` | **是** | schedule-domain ID；row 给出 2026-08-17 04:00 至 2026-09-28 06:00 的有效边界 |
| `291016` | `ScheduleDataGlobal` | `ID`, local/global time fields | `ChallengeGroupConfig[1035].ScheduleDataID` | **是** | schedule-domain ID；row 给出 2026-09-28 06:00 至 2026-11-02 04:00 的有效边界 |
| `291745` | `IdleLiveTeamSlotUpgradeCost` | `Cost` | 消耗配置 | 不适用 | cost 数值，不是 ID namespace |

结论：`291xxx` 不是单一 domain。`291015/291016` 的正式可确认语义是 **`ScheduleDataGlobal` 的 schedule identifiers**；不能确认 prefix 自身代表 server/staging/inactive/dynamic placeholder。global row 中 `BeginTime/EndTime/GlobalBeginTime/GlobalEndTime` 混合使用的业务含义没有 schema 文档；“跨版本或跨区域边界覆盖”是强推断，不是 confirmed semantics。

## 13. Git-history origin of 291015 / 291016

精确历史如下：

| Commit | File | Before | After |
|---|---|---|---|
| `a6968fe31fbb0300c01dff8ac60ef18965a1a244`（first 4.4, parent `d5c40c…`） | `ChallengeGroupConfig.json` | 无 1034 | 新增 1034 → `ScheduleDataID=201034`, name=Stormcleanse |
| 同 commit | `ScheduleDataChallengeMaze.json` | 无 `201034` | 新增 `201034`, 2026-08-17 04:00 → 2026-09-28 04:00 |
| 同 commit | `ScheduleDataGlobal.json` | 无 `291015` | 新增 `291015`, Begin=2026-08-17 04:00, GlobalEnd=2026-09-28 04:00 |
| `5d064ec9bdf7b8983957abc6e45494dd76c8a8fa`（first 4.5, parent `b11066…`） | `ChallengeGroupConfig.json` | 1034 → `201034`; 无 1035 | 1034 → `291015`; 新增 1035 → `291016`，无 GroupName |
| 同 commit | `ScheduleDataChallengeMaze.json` | `201034` end 04:00；无 `201035` | `201034` end 改为 06:00；新增 `201035` 2026-09-28 06:00 → 2026-11-02 04:00 |
| 同 commit | `ScheduleDataGlobal.json` | `291015` GlobalEnd 04:00；无 `291016` | `291015` GlobalEnd 改为 06:00；新增 `291016`, GlobalBegin=2026-09-28 06:00, End=2026-11-02 04:00 |

commit-level 关联检查还看到 PF 2026、AS 3020、AA group 9 / activity module `2100901` 的版本内容变化，但没有新增统一 activity registry、schedule selector、server config 或 entry list。`git log -G` 显示 ChallengeGroupConfig 对 `2910xx` 的引用只在首个 4.5 commit 出现。

历史上 `ScheduleDataGlobal` 并非专为 4.5 创建：可见 2.6 snapshot `5e3c0bf598e…` 已有 `291008/291014`，4.2 `02b00aadbf73627920ce07e3254f939008f5fb8e` 新增 `1090027`，4.3 `7c5b24247fea6d9d35e3f87344d9e01fe2578099` 新增 `1090028`，4.4 才加入 `291015`。这再次否定“291 prefix 本身就是某种状态位”的解释。

## 14. Orphan 201034 / 201035

`201034/201035` 是真实、完整的 `ScheduleDataChallengeMaze` rows；其区间分别与 `ScheduleDataGlobal[291015/291016]` 的有效边界一致。Git 历史还显示两套 row 在同一次版本变化中同步调整 2026-09-28 的边界。

直接证据支持：

- 4.4 时 1034 明确使用 `201034`；
- 4.5 时 1034/1035 明确改用 global schedule rows；
- `ScheduleDataChallengeMaze` 不是 MoC schedule binding 的唯一目标表。

但没有配置证明 `291015 → 201034`、`291016 → 201035` 是正式映射，也没有 fallback contract。因此“201034/201035 是 parallel/candidate mode-local timings”是较强解释；“dangling 时按 `201000 + GroupID` 重连”仍不成立。

## 15. Candidate public-entry signals

| Candidate source/signal | Location | What it actually proves | MoC | PF | AS | Public eligibility authority? |
|---|---|---|---:|---:|---:|---|
| Group row | mode group tables | 内容记录存在 | ✓ | ✓ | ✓ | No |
| `GroupName` | group row + TextMap | 名称/本地化完整度 | ✓ | ✓ | ✓ | No |
| Mode schedule tables | `ScheduleDataChallenge*` | 某 schedule row 的时间 | ✓ | ✓ | ✓ | No |
| `ScheduleDataGlobal` | ExcelOutput | global schedule row 和边界 | ✓ | — | — | No；只证明 binding/time |
| Group `ScheduleDataID` | group tables | group 选择哪个 schedule ID | ✓ | ✓ | ✓ | No；C 不等于 D |
| `ChallengeGeneralConfig` | ExcelOutput | 模式入口、解锁、Goto 等 | ✓ | ✓ | ✓ | No per-season list |
| Server prefs schema | `ConfigServerPrefs` | 客户端存在 group-keyed runtime/player state | ✓ | ✓ | ✓ | No，且无值 |
| `GetChallengeScRsp` schema | public protobuf | 服务器返回 challenge/group player data | ✓ | ✓ | ✓ | Insufficient |
| `ActivityScheduleData` response | public protobuf | activity 时间由 server response 下发 | 间接 | 间接 | 间接 | 对 activity timing 有 authority 形态；无正式服值，仍不足 |
| Activity module chain | Peak/Activity config | AA group 与 activity/module 内容关联 | — | — | — | No；AA 适用但无静态时间 |
| GroupID order/latest | all groups | 仅能排序 ID | ✓ | ✓ | ✓ | No |
| Official notices | HoYoLAB | 实际公开结果与时段 | ✓ | ✓ | ✓ | Outcome authority；不是 config architecture |

## 16. Cross-mode validation

### MoC

Pinned latest named group 是 1034 “Stormcleanse”。它绑定 `291015`，可在 `ScheduleDataGlobal` 解析为 2026-08-17 04:00 → 2026-09-28 06:00，与官方 4.4 公告相符。1035 存在、绑定可解析，但缺名且公开公告只预告 4.6 后有新一期 MoC；配置仍未给出 publication flag。

### PF

Pinned latest group 2026 “Domain Genesis / 立界开篇” → `ScheduleDataID=202026` → `ScheduleDataChallengeStory` 2026-09-14 04:00 → 2026-10-19 04:00。官方 4.5 公告吻合。没有发现 global schedule 或额外 selector。

### AS

Pinned latest group 3020 “Celestial Lupine / 仙客天狼” → `ScheduleDataID=203020` → `ScheduleDataChallengeBoss` 2026-08-31 04:00 → 2026-10-05 04:00。官方 4.5 公告吻合。没有发现额外 selector。

### AA

Pinned latest `ChallengePeakGroupConfig[9]` 是 “Return of Legion / 军团再临”，连接 `ActivityModuleID=2100901`；`ActivityConfig` 可连到 activity 21009 / panel 21001，但静态 Excel row 不含实际时段。官方 4.5 公告确认内容已投放。AA 因而采用不同架构，公开 protobuf 的 activity schedule response 是更合理的时间 authority 候选，但缺少正式服响应数据，不能完成验证。

跨模式结论：group → typed schedule row 对 MoC/PF/AS 的“时间绑定”成立，但 MoC 的 target table 已是多态的；AA 是 activity-based。没有一个静态字段跨四模式证明 public eligibility。

## 17. Historical snapshot validation

抽查 first-release ancestors 而非只看 pinned 4.5：

| Snapshot | Relevant observation | Official outcome check |
|---|---|---|
| 3.6 `6fb7377ac4c022c434c541522f5c7f7345b916d8` | AA/ChallengePeak 架构已进入配置；不走三种 mode schedule table | 官方 3.6 公告确认 AA 作为新 endgame 开放 |
| 4.0 `eedf0009f6b3aec9aab873918c2af3e343698a1b`（first visible 4.0 chain） | MoC/PF 使用各自 group → mode schedule；AA 仍为 activity/module | 官方列出 Cyber Mystery、Wordless Novel、Cyber Crisis |
| 4.2 `02b00aadbf73627920ce07e3254f939008f5fb8e` | mode-local schedules 可解释 Duty Action / Illusory Concepts / Idol of Locusts；global 表独立演进 | 官方 4.2 名称与时段吻合 |
| 4.3 `7c5b24247fea6d9d35e3f87344d9e01fe2578099` | mode-local schedules 可解释当期 PF/AS；global 表增加另一类 row | 官方 4.3 的 Falsehood to Fact / Gale of Forgetting 吻合 |
| 4.4 `a6968fe31fbb0300c01dff8ac60ef18965a1a244` | 1034 同时出现 mode-local `201034` 与 unreferenced global `291015` | 官方 Stormcleanse 时段吻合两者当时边界 |
| 4.5 `5d064ec9bdf7b8983957abc6e45494dd76c8a8fa` | 1034/1035 FK 切到 global rows；PF/AS 继续 mode-local；AA 继续 activity | 官方 4.5 验证 PF/AS/AA 和 1034 尾端 |

稳定 contract 只能概括为“group 绑定某个 typed schedule/activity ID”；无法概括为“只查 mode schedule table”或“最新 group 就公开”。历史抽查没有发现稳定的 per-season publication registry。

## 18. Case study: MoC 108 / 109

108 “Frostscar Reverie / 霜痕旧梦”与 109 “Everwinter Trials / 永冬试炼”仍分别指向 `ScheduleDataChallengeMaze[200108/200109]`，时间为 2033-02-06 → 02-20 与 02-20 → 03-06。

本轮候选机制对它们的覆盖情况：

- `ScheduleDataGlobal`：没有对应 row，也没有 exclusion list；
- `ChallengeGeneralConfig`：只描述模式，不选择 season；
- server prefs：无正式服值，不能判断；
- protobuf：没有可供本地离线判断的 response data；
- official-history：可用于未来逐条 provenance 校验，但本轮未将公告整理成生产数据。

因此，**仍未找到 config-backed reason 证明 108/109 不应进入 Upcoming/public**。2033 不能当 sentinel，且本轮没有改变其分类。

## 19. Case study: MoC 1034 / 1035

| Group | Existence | Completeness | Current binding | Parallel mode row | Publication conclusion |
|---|---|---|---|---|---|
| 1034 | row exists | 有 GroupName、文本/关卡等 | `291015` → `ScheduleDataGlobal`, 2026-08-17 → 09-28 | `201034`, 相同有效区间 | 官方确认 Stormcleanse 公开；config 可解释 schedule，但不是通用 publication flag |
| 1035 | row exists | GroupName 缺失，其他内容不等于完整公开包 | `291016` → `ScheduleDataGlobal`, 2026-09-28 → 11-02 | `201035`, 相同区间 | 有真实 schedule binding；是否最终按该 row 公开仍 Unknown |

“291015/291016 dangling”应改成“对现有 mode-only resolver unresolved”。它们与 201034/201035 的真实关系是：边界相同、同 release commit 同步变化、1034 曾从前者切换；但无显式 row-to-row relationship。不能把 1035 自动接到 201035。

## 20. External technical/data sources investigated

| Source | Quality/use | Finding |
|---|---|---|
| [`gucooing/hkrpg-go` source](https://github.com/gucooing/hkrpg-go) at `ef47e49…` | Public reverse-engineered protobuf/implementation | 找到 `ActivityScheduleData`、`GetActivityScheduleConfigScRsp`、`GetChallengeScRsp`; 私服自带 scheduling JSON/hard-coded values 不作为官方数据 |
| [`hkrpg-go/protocol/proto` docs](https://pkg.go.dev/github.com/gucooing/hkrpg-go/protocol/proto) | Published Go protobuf docs | 交叉确认 message/field shape |
| [Pinned protobuf source file](https://github.com/gucooing/hkrpg-go/blob/ef47e49a233133c46d70ab5a4deb4bc71ae49571/protocol/proto/StarRail_2.7.51_Danheng.pb.go) | Exact source location | 可审查上述字段定义 |
| [`go-reliquary` package docs](https://pkg.go.dev/github.com/Fesaa/go-reliquary) | Later public protocol command inventory | 仍可见 activity schedule、challenge 及 ChallengePeak command family；源码仓库调查时不可 clone，因此只作存在性佐证 |
| [`enka-network-api-go/starrail/excels`](https://pkg.go.dev/github.com/Fesaa/enka-network-api-go/starrail/excels) | Public generated Excel accessor | 镜像静态 Excel schema/accessors；未提供额外 public selector |

没有把第三方数据库网站的“当前赛期”当作 config 证据，也没有访问生产服务器或受保护 endpoint。外部临时 clone 已在调查结束前删除。

## 21. Official-history cross-checks

官方公告只用于校验结果：

- [Version 4.4 Update Details](https://www.hoyolab.com/article/45851903?reply=1)：Stormcleanse 为 2026-08-17 04:00 → 09-28 06:00，精确吻合 `291015` 的有效边界。
- [Version 4.5 Update Details](https://www.hoyolab.com/article/46449452?reply=1)：验证 Celestial Lupine、Domain Genesis、Return of Legion，并说明下一 MoC phase 在 4.6 后。
- [Version 4.3 Update Details](https://www.hoyolab.com/article_pre/18014398241023357)：验证 Gale of Forgetting、Falsehood to Fact、The Humming Laughter。
- [Version 4.2 Update Details](https://www.hoyolab.com/article/44742273)：验证 Duty Action、Illusory Concepts、Idol of Locusts、Happiness Syntax。
- [Version 4.0 Update Details](https://www.hoyolab.com/article/43747924)：验证 Cyber Mystery、Wordless Novel、Cyber Crisis。
- [Version 3.6 Update Details](https://www.hoyolab.com/article/41316670) 与 [AA guide](https://www.hoyolab.com/article/41091494)：验证 AA 的公开引入和运行时资格条件。

这些页面能证明“实际发布了什么”，但不解释 client/server configuration contract，故不被升级为 config authority。

## 22. What config can directly prove

**Config-derived，可直接证明：**

- group row 是否存在；
- 某些内容字段是否齐全；
- group 保存的 schedule/activity binding ID；
- mode/global schedule row 的可用时间字段；
- 1034/1035 的 `291015/291016` 在 global schedule table 中可解析；
- client/server preference schema 存在 group-keyed runtime state；
- AA 通过 activity/module 而非三种 challenge schedule table 组织。

**Git-history-derived，可直接证明：**

- 1034 在 4.4 使用 `201034`，4.5 改用 `291015`；
- 1035、`201035`、`291016` 在同一个 first-4.5 commit 加入；
- global 与 mode-local 边界同步变化；
- 同 commit 没有可识别的统一 public registry。

## 23. What remains inference

**Strong inference：**

- `ScheduleDataGlobal` 的 local/global endpoint 组合用于跨版本、跨发布域或跨区域时间边界覆盖；字段名和成对时间强烈支持“global override”类语义，但无公开 schema 文档确认细节。
- `201034/201035` 是 mode-local parallel/candidate timing，而 4.5 group binding 选择 global timing。
- AA 的公开时段很可能以 `GetActivityScheduleConfigScRsp` 之类 runtime response 为 authoritative source。
- 正式 public activation authority 至少有一部分位于当前 release dump 之外的 server/live-ops 层。

这些推断均不足以生成生产 eligibility 数据。

## 24. Unknowns

- `GlobalBeginTime/GlobalEndTime` 与 local `BeginTime/EndTime` 的正式合并优先级和地区/服务器语义；
- `GetChallengeScRsp.challenge_group_list` 是公开候选集、玩家已解锁集，还是两者混合；
- 是否另有未公开/未 dump 的 challenge schedule response 或 live-ops registry；
- 1035 是否会以当前名称、内容和时段正式发布；
- 108/109 的 2033 rows 是测试、保留、未来计划还是其他用途；
- `291015 ↔ 201034`、`291016 ↔ 201035` 是否存在服务端映射；
- server activity schedule 正式服响应在各历史版本的完整值。

## 25. Does the current data dump contain authoritative public eligibility?

**Partially found / insufficient.**

当前 dump 包含内容、绑定和时间的权威静态片段，并且 `ScheduleDataGlobal` 补全了 MoC 1034/1035 的 schedule target。公开协议又确认 runtime/server-owned activity schedule 层存在。但本地 dump 没有完整的 public activation registry，协议 schema 没有正式服 values；无法对所有 mode 和历史 season 可靠回答“这条配置是否真正公开”。

这是基于多层覆盖的负结论，而不是单次 grep：Excel categories、Config runtime categories、Stages/Story、Git correlated changes、StarRailRes、公开 protobuf/schema、多个历史 snapshot 及官方 outcome 均已检查。

## 26. Implications for HSR-Database

1. 当前 MoC schedule resolver 的 source coverage 不完整：只查 `ScheduleDataChallengeMaze` 会把 1034/1035 误报为 unknown/dangling；正确的静态模型至少允许显式的 typed union（mode table + `ScheduleDataGlobal`）。
2. 这不等于 public eligibility 已解决。schedule target 解析成功仍只能证明 binding，不应自动进入 Public Archive。
3. 当前 `recommendationEligible` 主要依赖 `GroupName`，所以选中 1034；它碰巧与官方当前公开结果一致，也有 `291015` 支撑，但将来 recommendation 应消费独立的 public-entry projection，而不是把 completeness 当 publication。
4. raw/config catalog 与 public archive 是不同产品概念。108/109 展示问题正来自二者尚未分层。

本轮没有实现任何上述变化。

## 27. Config-backed implementation path, if found

只找到部分 config-backed 路径，未来若另开实现任务，可分两步：

1. **Schedule resolution layer**：为每种 binding 明确声明允许的目标表；MoC 当前应按 exact ID 在 `ScheduleDataChallengeMaze` 与 `ScheduleDataGlobal` 中解析，冲突时 fail/diagnose，不做 ID arithmetic，不自动回接 201xxx。
2. **Public-entry layer**：只有在取得有 provenance 的 server response dump 或稳定 registry 后，才建立 `raw group → public entry` projection；记录 source version、mode、group ID、实际 period 与证据。

第一步解决“能否读到时间”，不宣称解决 eligibility。第二步才决定 current/upcoming/history/public。

## 28. Policy options if authoritative source is absent

### Option A — Maintainer-owned provenance dataset

维护 `mode / groupId / publicStatus / actualPeriod / source / notes`，每条 override 都有可审查的官方或技术出处。它是显式产品数据，不是假装来自 config。

### Option B — Raw catalog vs Public archive separation

Raw/config catalog 保留所有 upstream rows；Public Endgame archive 只消费 confirmed public periods。这样 108/109 等未知内容仍可研究，但不会因未来日期自动成为“即将公开”。

### Option C — Preserve current raw behavior with explicit warning

在尚未制定 policy 时保留当前 raw classification，但明确标记“来自未验证 raw schedule，不代表官方发布”。此方案改动小，但不能解决 recommendation/public archive 的语义混淆。

建议优先讨论 A + B，并保留 config raw facts 作为独立层。

## 29. Heuristics explicitly rejected

以下规则均被明确拒绝：

- `year > 2030 → hide`；
- `291xxx → inactive/staging`；
- 缺 `GroupName → hidden`；
- dangling in one table → development；
- latest GroupID → unreleased；
- battle payload reuse → placeholder；
- orphan `201035` → 必然属于 1035；
- `201000 + GroupID` fallback；
- 多个弱信号加权成自创 publication score。

与此不同，`Group 108 → confirmed non-public; source=...` 这种逐条、有 provenance、可审查的数据是 maintainer policy，不是 heuristic；但本轮尚未建立该事实。

## 30. Recommended next step

建议下一个独立任务先做 **产品/数据契约决策**，不要直接改过滤器：

1. 决定是否采用 raw catalog + public archive 双层模型；
2. 定义 provenance dataset 的最小 schema 与审查规则；
3. 若能合法取得并版本化公开的正式服 activity/challenge schedule response，再验证其是否可作为 public-entry authority；
4. 另开纯实现任务补上 `ScheduleDataGlobal` 的 typed schedule resolution，并用 1034/1035 做测试，但不得由此推导 publication；
5. 在取得权威排除证据前，继续把 108/109 的 public status 视为 Unknown，而不是引入年份 heuristic。

最终状态确认：**No public eligibility, schedule classification, routing, Search, sitemap, recommendation, generated-data contract, or UI behavior was changed.**
