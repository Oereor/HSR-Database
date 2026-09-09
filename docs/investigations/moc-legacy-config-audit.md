# MoC Legacy Config Audit

调查日期：2026-09-07（Asia/Shanghai）。本文路径均相对于 `HSR-Database/`；`upstream:` 表示 `../TurnBasedGameData/` 的 pinned commit。

## 1. Executive Summary

Pinned `ChallengeGroupConfig` 中共有 **56** 个 `ChallengeGroupType = Memory` group。人工 QA 所见两个 2033 赛期不是 Group 102/103，而是同名的 **Group 108（霜痕旧梦）**和 **Group 109（永冬试炼）**。`2033-02-06`、`2033-02-20`、`2033-03-06` 是 `ScheduleDataChallengeMaze[200108/200109]` 的 upstream raw value；网站没有推算 2033，只把 raw local time 按 UTC+8 解析，并因当前时间早于 begin 将两组分类为 `upcoming`。

Config-first 调查没有找到逐赛期的 `IsShow`、`Release`、active group list 或 public registry。`ChallengeGeneralConfig` 只注册 `Memory` mode 的统一入口和解锁条件；所有常规 MoC group 共用入口/映射。Field-aware reverse reference 也没有发现其他 Endgame 表把 `200108/200109` 当作 schedule 外键使用。因此 pinned config **不能直接声明** 108/109 是 sentinel、inactive 或 public；“它们是保留的 pre-release/legacy configuration”是有力推断，不是字段语义。

Upstream Git history 给出两条重要生命周期证据：

- 108/109 至少从本地可见的最早 ancestor（2.6）起就携带相同 2033 日程，历经 2.6 到 pinned 4.5 未变；仓库历史不足以确定它们首次加入的 commit。
- 1034 在 4.4 中是具名、battle 完整且指向可解析 `201034` 的组；4.5 将其引用改为 dangling `291015`，同时加入无 GroupName、dangling `291016`、复用 1034 battle payload 的 1035。`201034` 和新建的 `201035` schedule rows 仍保留。这直接确认“下一组先复用 battle payload、后续再替换”的工作流形态，但没有字段把 1035 明说为 placeholder。

有限 AS 对照确认了 battle-payload lifecycle：4.4 的最新 AS 3020 已有 GroupName 和可解析 schedule，但复用 3019 stage list；4.5 中 3020 的 metadata/schedule 保持，stage、入口、config、buff 被最终替换。它支持“reuse 可是开发中暂态”，也同时证明 reuse 不能单独决定 public eligibility。

本次没有更改 public eligibility、schedule classification、route、Search、sitemap、recommendation 或 UI；没有实现 placeholder heuristic。

## 2. Scope and methodology

范围是 pinned Memory of Chaos 全 inventory、相关 schedule/TextMap/battle/reward/entry 引用、pinned ancestors 的 upstream Git archaeology，以及现有 HSR-Database pipeline/history。PF、AS、AA 未做全量复审；AS 只验证候选 lifecycle。

方法：

1. 用 lossless JSON 读取 hash，避免 IEEE-754 改写。
2. 按字段语义连接 group、schedule、maze、tierce、PlaneEvent、Stage、Monster、buff、reward 与 TextMap。
3. 对 schedule ID 做 field-aware reverse reference；同值但不同 ID domain 的记录不计为引用。
4. 比较 pinned commit 及 ancestors 的实际 row/payload，而不从 commit message 猜语义。
5. 用生成数据和 `data:validate` 验证网站投影；分类快照固定在调查日。
6. 公开资料只验证时间线，不回填 config。

## 3. Evidence hierarchy

### Config-first principle

结论优先级是 pinned raw config、pinned ancestors 的 config diff、HSR-Database pipeline/history、公开历史、结构推断。报告分别使用 **Config-derived**、**Git-history-derived**、**External-history-derived**、**Strong inference**、**Unknown** 标签。

### What is explicitly not treated as proof

以下均不单独证明 placeholder/inactive：2033、GroupID 大、最后一行、GroupName 缺失、schedule dangling、stage/buff/reward/visual reuse，以及 `Empty` 等字符串。Configuration reuse 只作为上下文，不称为 duplicate group。

## 4. Pinned upstream versions

| Source            | Pinned SHA                                     |
| ----------------- | ---------------------------------------------- |
| TurnBasedGameData | `8cdb905dc2f8e6fffa9be4eb07af3e34435d6091`     |
| StarRailRes       | `d226befe3db13f2ec15f4161d5f34b1b607643fe`     |
| Data version      | `OSPRODWin4.5.0_D16354198_A16307208_L16320302` |

来源是 `upstream.lock.json`。调查未用 pinned 之后的 upstream main 解释当前产品。StarRailRes 未用于赛期语义。

## 5. MoC raw configuration map

```text
ChallengeGeneralConfig[Memory]                 mode entry/unlock only
                 |
ChallengeGroupConfig[ChallengeGroupType=Memory] (56 groups)
  | GroupID                 | ScheduleDataID             | MazeBuffID
  v                         v                            v
ChallengeMazeConfig   ScheduleDataChallengeMaze       MazeBuff
  | EventIDList1/2          BeginTime / EndTime
  | ID <- tierce parent
  v
PlaneEvent.EventID -> StageConfig.StageID -> MonsterConfig
                                      `-> MonsterTemplateConfig

ChallengeGroupConfig.RewardLineGroupID -> ChallengeMazeRewardLine -> RewardData
ChallengeGroupConfig.TierceID -> ChallengeMazeTierce -> extra StageID
GroupName / maze Name hashes -> TextMapCHS + TextMapEN
ChallengeMazeGroupExtra.GroupID -> poster path
```

Group 100 与 900 是同一 `Memory` enum 下的常驻 Forgotten Hall 类配置，无 schedule；101–1035 是轮换数据。配置表本身没有再给出 `permanent/season/public` discriminator。

## 6. Complete MoC group inventory

完整逐组事实在 Appendix A。汇总：56 groups；52 个 schedule resolved，2 个 absent（100/900），2 个 dangling（1034/1035）；55 个 GroupName 在 CHS/EN resolved，1035 hash absent；除 1035 的 12 个 encounter hashes 在 CHS/EN 均 unresolved 外，其余 encounter text resolved。

产品快照（2026-09-07）：`historical=50`、`upcoming=2`（108/109）、`current=0`、`unknown=4`（100/900/1034/1035）。所有 56 组都有 public detail route 并参与 Endgame Search；55 个具名组 recommendation eligible，1035 不 eligible。默认推荐会选择最新具名且无 schedule 的 1034。

## 7. Historical configuration generations

这些 generation 是 config-derived 聚类，不是 upstream enum：

| Generation           | Groups             | Observable schema/config break                                                                            |
| -------------------- | ------------------ | --------------------------------------------------------------------------------------------------------- |
| Permanent Memory     | 100, 900           | 15/6 floors；无 schedule/MazeBuff；RewardLine 1/21；独立 World/background                                 |
| Legacy 10-floor      | 101–119, 1001–1008 | 10 floors；RewardLine 2；大多 30 battle stages，1007/1008 为 20；主背景/海报多为空；早期 14/28 天 cadence |
| 12-floor overlapping | 1009–1015          | 12 floors/24 stages；有 Red poster/background；42 天 duration、约 28 天开新一期；RewardLine 2             |
| 12-floor rotated     | 1016–1032          | 12/24；42 天顺序 cadence；RewardLine 3                                                                    |
| Tierce extension     | 1033–1035          | 12 floors/25 stages；Tierce 为第 12 层附加第三 battle；1034/1035 schedule dangling                        |

Config 中 1008 为 10 floors，1009 从 2023-12-25 起为 12 floors，是明确结构断点。公开历史可辅助对应 1.6 增加 11/12 层，但 generation 判定本身来自 config。

## 8. Schedule architecture

`ChallengeGroupConfig` 只有 `ScheduleDataID`，日期只存在于 `ScheduleDataChallengeMaze` 的 `ID/BeginTime/EndTime`。Schedule row 没有 Release/Hide/State/Server override 字段。普通轮换组用 `200xxx`/`201xxx`，pinned 仅 1034/1035 使用 `291015/291016`，且 schedule table 没有任何 `291xxx` row。

值得注意：pinned schedule table 仍有 orphan `201034`（2026-08-17 04:00:00 → 2026-09-28 06:00:00）和 `201035`（2026-09-28 06:00:00 → 2026-11-02 04:00:00）。它们没有被 pinned group 引用。不能擅自按序号把它们回接到 1034/1035，但这证明 raw 时间轴与当前 group FK 已分离。

没有 reversed interval；108/109 连续相接。101–119 的 GroupID 顺序并非时间顺序，且包含多组 pre-launch/重叠日期，说明 GroupID 不是 chronology authority。

## 9. Current website schedule classification path

真实路径：

```text
ScheduleDataChallengeMaze raw row
  -> scripts/data/endgame.ts::loadTables
  -> resolveEndgameSchedule (dangling => warning, schedule omitted)
  -> neutral EndgameGroup.schedule
  -> scripts/data/projection/endgame.ts
  -> localized views/{locale}/endgame/moc.json
  -> src/lib/domain/endgame-view.ts::buildPeriodView
  -> current / upcoming / historical / unknown
```

`parseSchedule` 把 `YYYY-MM-DD HH:mm:ss` 变成 `${value}+08:00`。判断是 `begin <= now && now < end => current`，否则 `now < begin => upcoming`，否则 historical；无 schedule 才是 unknown。没有 chronology、release version 或 entry gating 参与。因此 108/109 必然显示 2033 并进入 Upcoming。问题不是日期格式解析错误，而是将“存在 schedule row”直接解释为 public period，缺少更上层 eligibility/gating。

## 10. Case study: 霜痕旧梦

同名存在三条独立 group：102（2022-11-14 → 11-28）、105（2022-12-26 → 2023-01-09）、108（2033-02-06 → 02-20）。QA 异常是 108：

| Field                 | Group 108                                                        |
| --------------------- | ---------------------------------------------------------------- |
| GroupName hash        | `6666074415721675313`                                            |
| CHS / EN              | 霜痕旧梦 / Frostscar Reverie                                     |
| ScheduleDataID        | `200108`，resolved                                               |
| ChallengeMaze IDs     | `801`–`810`                                                      |
| Stage payload         | 30 stages，和 102/105 相同；`30002161`–`30002252` 的分段 ID 集合 |
| MazeBuff / RewardLine | `3030104` / `2`                                                  |
| Text                  | group 与 10 encounters 均 CHS/EN resolved                        |

这是 battle payload reuse，不是同一逻辑记录。102、105、108 各有自己的 GroupID、maze rows、name hash 与 schedule row。

## 11. Case study: 永冬试炼

同名存在三条独立 group：103（2022-11-28 → 12-12）、106（2023-01-09 → 01-23）、109（2033-02-20 → 03-06）。QA 异常是 109：

| Field                 | Group 109                                                        |
| --------------------- | ---------------------------------------------------------------- |
| GroupName hash        | `3733786392529329550`                                            |
| CHS / EN              | 永冬试炼 / Everwinter Trials                                     |
| ScheduleDataID        | `200109`，resolved                                               |
| ChallengeMaze IDs     | `901`–`910`                                                      |
| Stage payload         | 30 stages，和 103/106 相同；`30003161`–`30003252` 的分段 ID 集合 |
| MazeBuff / RewardLine | `3030104` / `2`                                                  |
| Text                  | group 与 10 encounters 均 CHS/EN resolved                        |

## 12. Why the 2033 dates exist

**Confirmed, config-derived:** 2033 直接来自 schedule rows 200108/200109。**Confirmed, Git-history-derived:** 在本地可见最早 ancestor 2.6 中已是这些值，此后到 pinned 4.5 未改。**External-history-derived:** 官方 [Honkai: Star Rail Official Release FAQ](https://www.hoyolab.com/article/17901657) 明确正式服务器于 2023-04-26 10:00（UTC+8）开放；因此 102/103 的 2022 日期在正式上线前，而 108/109 的 2033 日期不可能是截至调查日已经发生的正式公开赛期。

**Strong inference:** 101–109 是保留的 pre-release/legacy schedule set；108/109 的远期值用于让配置存在但不在正常历史时间轴触发。**Unknown:** upstream 没有 sentinel enum/comment/flag，故不能确认“2033”的正式语义，也不能把任何年份阈值泛化为产品规则。

## 13. Reverse-reference / public-entry investigation

对 `200108/200109` 的字段级反查只确认：

- `ChallengeGroupConfig.ScheduleDataID`：108 → 200108，109 → 200109；
- `ScheduleDataChallengeMaze.ID`：对应日期行。

其他相同整数出现在 PlayerIcon、Item、Reward、Rogue room、chat 等独立 ID domain，不是 schedule FK。没有 activity、guide、unlock、selector、registry 或 UI mapping 表以 schedule/group foreign-key 语义引用它们。

`ChallengeGeneralConfig[Memory]` 只有 mode-level `GotoID=218`、`FinishMainMission(4010106)` guide condition 和空 preconditions。常规 group 共享 `PreMissionID=4010134`、`MapEntranceID=1010201`、`MappingInfoID=1220`；这些不能区分 108/109。`ChallengeMazeGroupExtra` 为每组提供 poster row，也不是 visibility registry。没有找到 authoritative per-group active/public signal。

## 14. Case study: 1034 → 1035

| Version                  | 1034                                            | 1035                                                     | Schedule rows                         |
| ------------------------ | ----------------------------------------------- | -------------------------------------------------------- | ------------------------------------- |
| 4.3 (`7c5b24247f`)       | absent                                          | absent                                                   | through 201033                        |
| 4.4 (`a6968fe31f`)       | named；201034 resolved；12 floors/25 stages     | absent                                                   | 201034 = 2026-08-17 → 09-28           |
| first 4.5 (`5d064ec9bd`) | same name/battle；FK changed to dangling 291015 | added；name absent；dangling 291016；reuses 1034 payload | 201034 retained/end +2h；201035 added |
| pinned 4.5               | same                                            | same                                                     | 201034/201035 retained                |

1034 GroupName hash `15647371369237071234` resolves为扫除风暴/Stormcleanse。1035 GroupName absent。5301–5312 与 5401–5412 的 battle fields 除 identity/predecessor 外相同；Tierce 5313/5413 都最终引用 stage `30124123`。两组共享 MazeBuff `3030147`、RewardLine `3` 与 Red_16 visuals。

最强证据不是“最新 ID”或“复用”，而是同一 commit 同时发生：1034 从 active schedule FK 脱离、1035 未完成 metadata 加入、下一 schedule row 仍存在。它非常像 staging workflow，但 config 没有给 `291xxx` 命名语义。

## 15. Upstream Git-history evolution

TurnBasedGameData 本地历史对相关文件仅回溯到 2.6（2024-10-21），所以不能回答 108/109 的真实 first appearance。可确认：

- 108/109 在 2.6 已完整存在；日期、maze count、stage payload、buff、reward 到 pinned 不变。
- 其 GroupName hash 表示经历过数据导出/hash schema 变化（早期负整数、后续 64-bit hash，4.3 后又换 hash），当前 CHS/EN 均能解析；不能把 hash 变动误写为赛期名称变化。
- 1033 首见于 4.3；1034 首见于 4.4；1035 首见于 first 4.5 commit。
- 在可见 snapshot 粒度内，没有观察到 1034 自身“无名 → 补名”的阶段；首次出现即具名、有 schedule、有最终 battle payload。
- 1035 在 first 4.5 到 pinned 之间未 finalized。

因此找到了 placeholder-like **battle reuse lifecycle**，没有找到同一 MoC group 在 pinned ancestors 中完整走完“无名/dangling → 具名/resolved → payload finalized”的三步生命周期。

## 16. Configuration reuse analysis

### Important: reuse is not duplicate evidence

| Group A | Group B         | Same StageIDs |         Same buff |    Same reward | Same floor structure | Metadata differences                                      |
| ------- | --------------- | ------------: | ----------------: | -------------: | -------------------: | --------------------------------------------------------- |
| 101     | 104/107/116–119 |           yes |               yes |            yes |                  yes | 独立 name hash/schedule/maze IDs                          |
| 102     | 105/108         |           yes |               yes |            yes |                  yes | 独立 name hash/schedule/maze IDs                          |
| 103     | 106/109         |           yes |               yes |            yes |                  yes | 独立 name hash/schedule/maze IDs                          |
| 1034    | 1035            |           yes |               yes |            yes |                  yes | 1035 缺 GroupName；不同 dangling schedule/Tierce/maze IDs |
| AS 3019 | AS 3020 at 4.4  |           yes | context-dependent | same structure |                  yes | 3020 已有自己的 name/schedule/IDs                         |

正式早期配置中 stage reuse 很普遍，尤其 101/104/107/116–119。因此 `sameStagesAsPreviousGroup` 不具备单独判定力。

## 17. Limited cross-mode comparison

### AS precedent if config-confirmable

**Confirmed:** AS 3020 在 4.4 已有 GroupName hash `5310118120627179371`、ScheduleDataID `203020` 和 resolved schedule，但其 4 个 mazes/8 stages 复用 3019 payload。4.5 保持 group metadata 与 schedule，替换为 stages `420501`–`420514`，同时替换 MapEntrance、config lists、maze buffs 和 encounter names。

多个更早 snapshot 的最新 AS group 也与上一组共享 stage list，但 snapshot 间隔无法证明每次都经历相同开发过程。可确认的 3020 例子支持“new group appears → initially reuses previous battle config → later receives final battle config”。没有确认 AS 的 name absent 或 schedule dangling 阶段。

## 18. TextMap / metadata completeness

- 55/56 group 有 GroupName hash，且 pinned CHS/EN 均 resolved。
- 1035 GroupName hash absent，不是 hash-present-but-missing。
- 1035 的 12 个 encounter Name hashes present，但 CHS/EN 均 missing；hash 列表见既有 `docs/investigations/moc-1035-placeholder-investigation.md`。
- 其余 55 groups 的 encounter names 在 CHS/EN resolved。
- 108/109 的 group/encounter text 完整；文本完整不能证明 public availability，只能证明 metadata completeness。

## 19. Reference integrity

Pinned 数据可成功构建，`data:validate` 通过。对 Memory group 检查了 `ScheduleDataID`、`MazeBuffID`、`RewardLineGroupID`、`ChallengeMazeConfig`、Tierce、PlaneEvent、StageConfig、MonsterConfig、MonsterTemplateConfig：

- 唯一 dangling schedule FK 是 1034→291015、1035→291016；100/900 是字段 absent，不是 dangling。
- 所有存在的 MazeBuff、RewardLine、maze/tierce、PlaneEvent、Stage、Monster/Template 引用可解析。
- 1033–1035 的 tierce extra stage 可解析；1035 battle references 的详细数量为 25 stages、50 waves、112 occurrences。
- Stage/battle 引用完整只说明 raw validity/domain buildability，不说明赛期应公开。

## 20. Raw validity vs domain completeness vs public eligibility

| Concept                    | 108/109                           | 1034                                 | 1035                                                      |
| -------------------------- | --------------------------------- | ------------------------------------ | --------------------------------------------------------- |
| Raw validity               | rows/refs 可读，schedule resolved | battle refs valid；schedule dangling | battle refs valid；schedule/text incomplete               |
| Domain completeness        | 可形成完整具名、有日期对象        | 可形成具名、无日期对象               | 可形成 fallback title、无日期对象                         |
| Public product eligibility | config 未直接确认                 | config 未直接确认                    | config 未直接确认；现有 recommendation false 只是站点规则 |

这三者不能压成 `isPlaceholder()` boolean。

## 21. Candidate authoritative config signals

| Signal                         | Config source                    | Semantics directly confirmed? |          Used by site? | Reliability              | Notes                                     |
| ------------------------------ | -------------------------------- | ----------------------------: | ---------------------: | ------------------------ | ----------------------------------------- |
| Schedule FK resolves           | GroupConfig → ScheduleData       |              是：给出时间绑定 |                     是 | 高（时间），低（public） | 108/109 证明 resolved 不等于已确认 public |
| Explicit FK detachment         | 1034: 201034→291015；1035→291016 |   变化事实是；inactive 语义否 |           仅转 unknown | 中高候选                 | pinned 唯二 291xxx；需 upstream semantics |
| Per-group public registry      | 未找到                           |                            否 |                     否 | 若找到将最高             | 当前最关键缺口                            |
| Mode entry/unlock              | ChallengeGeneralConfig           |                是，mode-level |                     否 | 高（mode），无逐组能力   | 不能筛 season                             |
| GroupName                      | ChallengeGroupConfig/TextMap     |                    是，完整性 |    recommendation only | 中（完整性）             | 不是 visibility flag                      |
| Stage Release                  | StageConfig                      |      是，battle stage release |       builder consumes | 低（season eligibility） | 粒度/语义不同                             |
| Schedule row chronology        | 201034/201035                    |                是，时间轴存在 |             当前未使用 | 中                       | 不得人工重接 dangling FK                  |
| MapEntrance/Mapping/PreMission | group row                        |                            是 | builder mostly ignores | 低                       | 常规组共享，不能区分                      |

## 22. Signals that are only circumstantial

2033、pre-launch chronology、same stage list、same buff/reward/visual、missing GroupName、unresolved encounter TextMap、dangling schedule、highest GroupID 和相邻组 reuse 都只能组合支持 inference。尤其 reuse 在已具名且有真实 schedule 的早期组与 AS 中广泛存在。

## 23. Current HSR-Database assumptions / heuristics

HSR-Database 于 `f9665ef` 首建 Endgame pipeline，dangling schedule 原本是 fatal。数据更新到 4.5 的 commit `c6fc8f6` 将其改为 generic warning，允许 1034/1035 进入 domain；同 commit 调整推荐逻辑。当前：

- `resolveEndgameSchedule`：dangling → warning + omit schedule；
- `buildPeriodView`：无 schedule → unknown；有 schedule 只按 now 比较；
- `recommendationEligible = Boolean(GroupName?.Hash)`：1035 不参与默认推荐；
- route、catalog、Search 没有 eligibility filter；
- `getEndgameGroupEntries`/sitemap 遍历所有生成 groups。

没有 `GroupID===1035` 专用分支，也没有 2033/年份阈值。现状的根本假设是“解析到 schedule 即可作为公开 period 分类”。

## 24. Confirmed facts

1. Pinned Memory groups = 56。
2. 2033 groups 是 108/109；日期来自 raw schedule 200108/200109。
3. 网站只做 UTC+8 parse + now comparison，所以归类 Upcoming。
4. 没有找到逐组 public/active registry 或 visibility flag。
5. 108/109 从最早可见 2.6 到 pinned 日期稳定，且与早期同名组复用 battle payload。
6. 1034 在 4.4 有 resolved 201034；4.5 被切到 dangling 291015，1035 以 dangling 291016 加入。
7. 201034/201035 schedule rows 在 pinned 中仍存在但 orphan。
8. AS 3020 的 reused battle payload 在下一 snapshot 被替换，metadata/schedule 保持完整。

## 25. Strong inferences

- 101–109 属于保留的 pre-release/legacy configuration generation；108/109 的 2033 值很可能用于避免正常历史时间轴触发。
- 291015/291016 很可能是 development/staging schedule namespace 或人为解除 active binding 的手段。
- 1035 很像 unfinished next-group configuration；1034 的 schedule FK 同时被 detachment 可能是同一开发流程的一部分。
- 当前 Upcoming 错误主要是 product interpretation 缺少 eligibility/gating，而不是 parser 篡改 raw date。

## 26. Unknowns

- 108/109 的首次加入 commit，以及 2033 最初作者意图。
- 是否存在未包含在 TurnBasedGameData ExcelOutput 的 server-side schedule/registry override。
- `291xxx` namespace 的正式语义。
- 201035 是否最终 intended for 1035；数字/时间顺序支持猜测，但没有 FK，不可确认。
- 108/109 是否曾在 beta 环境实际 active。
- 哪个上游字段（若存在）是 authoritative public season list。

## 27. Candidate product-policy directions

### Config-backed options only

1. 优先继续寻找/引入真正的 server/public season registry；若可获得，让 schedule 与 registry 联合决定 public projection。
2. 将“raw catalog inclusion”和“public season eligibility”建模为不同概念，但 eligibility 必须来自明确 config/provenance，不由 UI 猜。
3. 若确认 `291xxx` 是 detachment/inactive namespace，按已文档化的 namespace semantics 处理，而非按 dangling 或数字范围泛化。
4. 若 upstream 永远不提供 legacy public history，可由 maintainer 建立显式、reviewable、带官方出处的 override dataset；不要把网页日期写进 parser heuristic。
5. 在做策略前先建立 regression fixture，覆盖 108/109、1034/1035、100/900 与正常 resolved groups。

## 28. Heuristics explicitly not recommended

不推荐并且本轮未实现：`year >= 2030`、same stages、missing GroupName、missing/dangling schedule、latest/large ID、Test/Empty/Debug/Temp 字符串、单独的 Stage.Release，或这些字段的无 provenance 打分器。也不建议把 201034/201035 按序号手工回接。

## 29. Questions requiring maintainer decision

1. 公共页面目标是“raw 数据浏览器”还是“已公开玩家赛期档案”？两者需要分离入口或 eligibility。
2. 在 authoritative registry 缺失时，是否接受 maintainer-owned allow/deny/override data，并要求何种官方出处？
3. 1034/1035 的 orphan 201034/201035 是否只用于调查展示，还是未来作为人工日程修复候选？
4. permanent Memory 100/900 应继续与 MoC seasons 同一 catalog 展示，还是单独建模？
5. Search/sitemap 是否应继承未来 public eligibility，还是保留 raw catalog discoverability？

## 30. Recommended next investigation / implementation step

先做一个窄范围的 **public-entry source investigation**：查找客户端之外的 server schedule/entry 数据来源或上游 schema 文档，重点确认 `291xxx` 和 active season selection。若仍不可得，再由 maintainer 明确选择“显式 provenance override”或“raw catalog 与 public catalog 分层”，随后写 policy specification 和 fixtures；不要先写 heuristic。

## Appendix A. Complete pinned Memory inventory

`Visual` 为完整 group background path 的文件名；`AbyssSenceBgl_Red_*.png` 的前缀是 `SpriteOutput/Abyss/UI3D_SceneBg/`，对应 poster 前缀为 `SpriteOutput/Abyss/2D_SceneBg/`；legacy empty 表示两者均 `""`。所有轮换组的 tab paths 是 `SpriteOutput/UI/Abyss/Process/TypeIcon/AbyssSwitchLoop_{Off,On}.png`；100/900 分别使用 W01/W02；1009+ 的 ThemePicPath 是 `SpriteOutput/DailyMission/Banner/ChallengeAbyssBanner2.png`。

`Text` 是 encounter CHS/EN missing count。`Site` 是 recommendation/public route/Search/status；除 1035 外，所有具名组 recommendation 均 yes。

| Group | GroupName hash       | zh-CN / EN                                           | Schedule (state) | Begin → End             | Floors / stages | Buff / reward / tierce | Visual              | Text  | Site                   |
| ----: | -------------------- | ---------------------------------------------------- | ---------------- | ----------------------- | --------------: | ---------------------- | ------------------- | ----- | ---------------------- |
|   100 | 13535919676396601281 | 永屹之城遗秘 / The Last Vestiges of Towering Citadel | absent           | -                       |         15 / 25 | - / 1 / -              | AbyssSenceBg_01.png | 0/0   | yes/yes/yes/unknown    |
|   101 | 14416847635852499089 | 琥珀恩赐 / Favor of Amber                            | 200101 resolved  | 2023-02-06 → 2023-03-06 |         10 / 30 | 3030104 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|   102 | 5939640946738950311  | 霜痕旧梦 / Frostscar Reverie                         | 200102 resolved  | 2022-11-14 → 2022-11-28 |         10 / 30 | 3030104 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|   103 | 5979535214098150817  | 永冬试炼 / Everwinter Trials                         | 200103 resolved  | 2022-11-28 → 2022-12-12 |         10 / 30 | 3030104 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|   104 | 9902376236766804946  | 琥珀恩赐 / Favor of Amber                            | 200104 resolved  | 2023-03-06 → 2023-03-20 |         10 / 30 | 3030104 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|   105 | 13550862373371504511 | 霜痕旧梦 / Frostscar Reverie                         | 200105 resolved  | 2022-12-26 → 2023-01-09 |         10 / 30 | 3030104 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|   106 | 16892038787425010841 | 永冬试炼 / Everwinter Trials                         | 200106 resolved  | 2023-01-09 → 2023-01-23 |         10 / 30 | 3030104 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|   107 | 16968111650927537551 | 琥珀恩赐 / Favor of Amber                            | 200107 resolved  | 2023-03-20 → 2023-04-03 |         10 / 30 | 3030104 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|   108 | 6666074415721675313  | 霜痕旧梦 / Frostscar Reverie                         | 200108 resolved  | 2033-02-06 → 2033-02-20 |         10 / 30 | 3030104 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/upcoming   |
|   109 | 3733786392529329550  | 永冬试炼 / Everwinter Trials                         | 200109 resolved  | 2033-02-20 → 2033-03-06 |         10 / 30 | 3030104 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/upcoming   |
|   110 | 7989615745152033256  | 寒铁砥砺 / Coldiron Tribulation                      | 200110 resolved  | 2023-06-12 → 2023-06-26 |         10 / 30 | 3030107 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|   111 | 1089868900813764117  | 蹈冰寻火 / Hyperborean Search for Warmth             | 200111 resolved  | 2023-06-26 → 2023-07-10 |         10 / 30 | 3030108 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|   112 | 137949309662145528   | 风暴止息 / Stormquell                                | 200112 resolved  | 2023-07-10 → 2023-07-24 |         10 / 30 | 3030109 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|   113 | 10333552128035740979 | 孤航天海 / Adrift in Astral Seas                     | 200113 resolved  | 2023-07-24 → 2023-08-07 |         10 / 30 | 3030110 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|   114 | 16812001866653106084 | 泪雨长战 / Raintear Strife                           | 200114 resolved  | 2023-08-07 → 2023-08-21 |         10 / 30 | 3030111 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|   115 | 18356797778520058973 | 药王垂迹 / Traces of Sanctus Medicus                 | 200115 resolved  | 2023-08-21 → 2023-09-04 |         10 / 30 | 3030112 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|   116 | 7559459216374530467  | 琥珀恩赐 / Favor of Amber                            | 200116 resolved  | 2023-04-03 → 2023-04-17 |         10 / 30 | 3030104 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|   117 | 13985416906421887662 | 琥珀恩赐 / Favor of Amber                            | 200117 resolved  | 2023-04-17 → 2023-05-15 |         10 / 30 | 3030104 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|   118 | 17285291027415689380 | 琥珀恩赐 / Favor of Amber                            | 200118 resolved  | 2023-05-15 → 2023-05-29 |         10 / 30 | 3030104 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|   119 | 12725504542762354353 | 琥珀恩赐 / Favor of Amber                            | 200119 resolved  | 2023-05-29 → 2023-06-12 |         10 / 30 | 3030104 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|   900 | 17766792828174543395 | 天艟求仙迷航录 / The Voyage of Navis Astrigera       | absent           | -                       |          6 / 12 | - / 21 / -             | AbyssSenceBg_02.png | 0/0   | yes/yes/yes/unknown    |
|  1001 | 10022838606586113877 | 迷梦造舸 / Ethereal Shipcraft                        | 201001 resolved  | 2023-09-04 → 2023-09-18 |         10 / 30 | 3030113 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|  1002 | 15180082550330393895 | 天裂一射 / A Shot From the Sky                       | 201002 resolved  | 2023-09-18 → 2023-10-02 |         10 / 30 | 3030114 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|  1003 | 18312966403206372268 | 魔阴空劫 / Mara and Null                             | 201003 resolved  | 2023-10-02 → 2023-10-16 |         10 / 30 | 3030115 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|  1004 | 4684837189175989172  | 生劫火劫 / Living and Flaming Catastrophes           | 201004 resolved  | 2023-10-16 → 2023-10-30 |         10 / 30 | 3030116 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|  1005 | 2600097136205724361  | 建木降临 / Ambrosial Arbor's Arrival                 | 201005 resolved  | 2023-10-30 → 2023-11-13 |         10 / 30 | 3030117 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|  1006 | 8160951664027758809  | 镇伏玄根 / Divine Root Subdual                       | 201006 resolved  | 2023-11-13 → 2023-11-27 |         10 / 30 | 3030120 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|  1007 | 957906561801015446   | 万载盟誓 / Oath of Eternal Alliance                  | 201007 resolved  | 2023-11-27 → 2023-12-11 |         10 / 20 | 3030119 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|  1008 | 2056783197628659145  | 藏于深空之秘 / Enigma in Deep Space                  | 201008 resolved  | 2023-12-11 → 2023-12-25 |         10 / 20 | 3030118 / 2 / -        | legacy empty        | 0/0   | yes/yes/yes/historical |
|  1009 | 3784588079183027684  | 藏于深空之秘 / Enigma in Deep Space                  | 201009 resolved  | 2023-12-25 → 2024-02-05 |         12 / 24 | 3030121 / 2 / -        | Red_00              | 0/0   | yes/yes/yes/historical |
|  1010 | 367157848832775513   | 重燃之光 / Light of Reignition                       | 201010 resolved  | 2024-01-22 → 2024-03-04 |         12 / 24 | 3030123 / 2 / -        | Red_01              | 0/0   | yes/yes/yes/historical |
|  1011 | 17799126781768125081 | 难舍梦乡 / Dreamland of Longing                      | 201011 resolved  | 2024-02-19 → 2024-04-01 |         12 / 24 | 3030124 / 2 / -        | Red_03_02           | 0/0   | yes/yes/yes/historical |
|  1012 | 11349104322434540656 | 一晌荒宴 / Eve of Wanton Feast                       | 201012 resolved  | 2024-03-18 → 2024-04-29 |         12 / 24 | 3030125 / 2 / -        | Red_03_01           | 0/0   | yes/yes/yes/historical |
|  1013 | 15861311809866073473 | 白夜梦国记 / White Night Chronicles                  | 201013 resolved  | 2024-04-15 → 2024-05-27 |         12 / 24 | 3030126 / 2 / -        | Red_03_03           | 0/0   | yes/yes/yes/historical |
|  1014 | 13414635983289596357 | 梦中之梦 / Dream Within Dream                        | 201014 resolved  | 2024-05-13 → 2024-06-24 |         12 / 24 | 3030127 / 2 / -        | Red_03_01           | 0/0   | yes/yes/yes/historical |
|  1015 | 10740802949618419968 | 弦外之声 / A Song's True Theme                       | 201015 resolved  | 2024-06-10 → 2024-07-22 |         12 / 24 | 3030128 / 2 / -        | Red_05              | 0/0   | yes/yes/yes/historical |
|  1016 | 9472961004682324016  | 曲尽梦散 / Dissipation of Dreams                     | 201016 resolved  | 2024-07-22 → 2024-09-02 |         12 / 24 | 3030129 / 3 / -        | Red_03_02           | 0/0   | yes/yes/yes/historical |
|  1017 | 4029846394777359292  | 长眠不醒 / The Big Sleep                             | 201017 resolved  | 2024-09-02 → 2024-10-14 |         12 / 24 | 3030130 / 3 / -        | Red_03_01           | 0/0   | yes/yes/yes/historical |
|  1018 | 12928258431032346521 | 鳞渊潮动 / Scalegorge Tidalflow                      | 201018 resolved  | 2024-10-14 → 2024-11-25 |         12 / 24 | 3030131 / 3 / -        | Red_06              | 0/0   | yes/yes/yes/historical |
|  1019 | 10574414347114115092 | 与梦共舞 / Dancing with the Dreams                   | 201019 resolved  | 2024-11-25 → 2025-01-06 |         12 / 24 | 3030132 / 3 / -        | Red_07              | 0/0   | yes/yes/yes/historical |
|  1020 | 13180985486561140498 | 舸舰迷津 / Troopship Mayhem                          | 201020 resolved  | 2025-01-06 → 2025-02-17 |         12 / 24 | 3030133 / 3 / -        | Red_08              | 0/0   | yes/yes/yes/historical |
|  1021 | 17860536354424721499 | 创世纷争 / Strife of Creation                        | 201021 resolved  | 2025-02-17 → 2025-03-31 |         12 / 24 | 3030134 / 3 / -        | Red_09              | 0/0   | yes/yes/yes/historical |
|  1022 | 4664674997803100988  | 出故乡记 / Out of Home                               | 201022 resolved  | 2025-03-31 → 2025-05-12 |         12 / 24 | 3030135 / 3 / -        | Red_10              | 0/0   | yes/yes/yes/historical |
|  1023 | 14608497641580311679 | 彼岸之息 / Breath of the Othershore                  | 201023 resolved  | 2025-05-12 → 2025-06-23 |         12 / 24 | 3030136 / 3 / -        | Red_11              | 0/0   | yes/yes/yes/historical |
|  1024 | 14834834291629300469 | 赤月吞狼 / Lupine Moon-Devourer                      | 201024 resolved  | 2025-06-23 → 2025-08-04 |         12 / 24 | 3030137 / 3 / -        | Red_08              | 0/0   | yes/yes/yes/historical |
|  1025 | 5838111705389385705  | 博徒困境 / Gambler's Plight                          | 201025 resolved  | 2025-08-04 → 2025-09-15 |         12 / 24 | 3030138 / 3 / -        | Red_03_03           | 0/0   | yes/yes/yes/historical |
|  1026 | 14644654659964146296 | 创世之柱 / Pillar of Genesis                         | 201026 resolved  | 2025-09-15 → 2025-10-27 |         12 / 24 | 3030139 / 3 / -        | Red_10              | 0/0   | yes/yes/yes/historical |
|  1027 | 10186422714044941476 | 范畴错误 / Category Mistake                          | 201027 resolved  | 2025-10-27 → 2025-12-08 |         12 / 24 | 3030140 / 3 / -        | Red_13              | 0/0   | yes/yes/yes/historical |
|  1028 | 1447424094793353270  | 猴子把戏 / Monkey Business                           | 201028 resolved  | 2025-12-08 → 2026-01-19 |         12 / 24 | 3030141 / 3 / -        | Red_03_03           | 0/0   | yes/yes/yes/historical |
|  1029 | 9679104435871264754  | 堤溃蚁穴 / Breached Nest                             | 201029 resolved  | 2026-01-19 → 2026-03-02 |         12 / 24 | 3030142 / 3 / -        | Red_14              | 0/0   | yes/yes/yes/historical |
|  1030 | 11648723238258514064 | 网络谜踪 / Cyber Mystery                             | 201030 resolved  | 2026-03-02 → 2026-04-13 |         12 / 24 | 3030143 / 3 / -        | Red_15              | 0/0   | yes/yes/yes/historical |
|  1031 | 5843441618914620976  | 演剧终焉 / Grand Finale                              | 201031 resolved  | 2026-04-13 → 2026-05-25 |         12 / 24 | 3030144 / 3 / -        | Red_08              | 0/0   | yes/yes/yes/historical |
|  1032 | 10653275653682866980 | 值日行动 / Duty Action                               | 201032 resolved  | 2026-05-25 → 2026-07-06 |         12 / 24 | 3030145 / 3 / -        | Red_16              | 0/0   | yes/yes/yes/historical |
|  1033 | 14627468344272196063 | 学院怪谈 / Academy Ghost Story                       | 201033 resolved  | 2026-07-06 → 2026-08-17 |         12 / 25 | 3030146 / 3 / 5213     | Red_15              | 0/0   | yes/yes/yes/historical |
|  1034 | 15647371369237071234 | 扫除风暴 / Stormcleanse                              | 291015 dangling  | -                       |         12 / 25 | 3030147 / 3 / 5313     | Red_16              | 0/0   | yes/yes/yes/unknown    |
|  1035 | absent               | unresolved / unresolved                              | 291016 dangling  | -                       |         12 / 25 | 3030147 / 3 / 5413     | Red_16              | 12/12 | no/yes/yes/unknown     |

## Appendix B. Current classification anomalies

- Far-future legacy: 108/109，唯一 Upcoming。
- Missing schedule field: 100/900；dangling schedule: 1034/1035。
- Overlap: 1009–1015 各 42 天但约每 28 天开始下一组，是当时 generation 的正常配置形态；legacy 101–119 也有 chronology overlap/out-of-order。
- Reversed dates: none。
- Exact duplicate schedule intervals: none。
- Surprising recommendation: 1034 因具名且是最大 eligible GroupID、但 schedule 缺失，优先于所有有 schedule 的组。

## Appendix C. Validation and working tree discipline

执行了 pinned config audit、Git archaeology 和现有 `scripts/data/validate.ts`；验证通过。临时 audit script 仅用于生成 inventory/reuse/history 数据，最终删除。TurnBasedGameData 与 StarRailRes 未修改。正式 diff 只有本报告，不含 production behavior change。
