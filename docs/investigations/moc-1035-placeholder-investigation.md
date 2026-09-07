# MoC Group 1035 Investigation

## 1. Executive summary

调查日期：2026-09-07。GroupID 1035 并不是由网站凭空构造的 12 个关卡。Pinned upstream 有真实的 `ChallengeGroupConfig` 记录及 12 个关联 `ChallengeMazeConfig`，展开后是 **25 个 battle stages、50 个 waves、112 个未去重 enemy occurrences**。它们与 1034 使用同一组 StageID、同一记忆紊流与奖励配置。

1035 的问题集中在元数据：**GroupName absent**；ScheduleDataID 存在，但 `291016` 不在 `ScheduleDataChallengeMaze`；12 个 encounter Name hash 在 CHS/EN 均没有文本。上游没有明确声明这是 placeholder，因此“未完成/复用上一组的占位配置”属于强推断，不能当作已确认的产品定位。

撤掉针对这类数据的容错，真实 `pnpm data:sync` 在 neutral domain 构建期间抛出 `missing-schedule`，没有到达 locale projection。次级强制实验保留日程容错后，可以生成无标题的 1035，且 `data:validate` 仍通过。可生成不等于页面完整。

本轮不决定隐藏、改名或重新定义 1035。实验源码已逐字恢复；正式双语言 group 数据与实验前完全一致。**No production behavior change for GroupID 1035 was retained.** 同轮 Search artwork 修复对包括 1035 在内的现有 enemy card 补齐图片，不改变赛期策略。

## 2. Investigation scope

范围包括 pinned raw tables/TextMaps、lossless reader、neutral domain、localized projection、generated views、overview/detail/Search、真实生成与验证、Git 历史。没有使用 upstream current main，也没有修改两个上游仓库。

文中路径均相对于 `HSR-Database/`；`upstream:` 表示 `../TurnBasedGameData/` 在第 3 节 SHA 的文件。实验输出保存在忽略目录 `data/audit/`，不进入提交；以下原始值、步骤与结论足以独立理解调查，不依赖那些临时文件。

## 3. Pinned upstream versions

权威版本来自 `upstream.lock.json`，本地两仓库 HEAD 均与 lock 一致，调查开始时均无工作区改动。

| Source            | Pinned commit                              |
| ----------------- | ------------------------------------------ |
| TurnBasedGameData | `8cdb905dc2f8e6fffa9be4eb07af3e34435d6091` |
| StarRailRes       | `d226befe3db13f2ec15f4161d5f34b1b607643fe` |

生成器识别数据版本为 `OSPRODWin4.5.0_D16354198_A16307208_L16320302`。StarRailRes 仅是视觉来源，不用于补齐赛期关系或名称。未做 supplementary main 对比。

## 4. Raw upstream evidence

读取使用 `scripts/data/raw.ts::readTable/readRaw`。Hash 保持十进制字符串，没有经过 JavaScript number。Group 1035 的全部 raw keys 如下；额外列出的不存在字段明确标记 absent。

| Field                               | Value                                                            |
| ----------------------------------- | ---------------------------------------------------------------- |
| GroupID                             | `1035`                                                           |
| GroupName / hash                    | **absent**；CHS/EN 无可供查询的 group hash                       |
| ChallengeGroupType                  | `Memory`                                                         |
| ScheduleDataID                      | `291016`；目标 schedule row absent                               |
| MazeBuffID                          | `3030147`                                                        |
| RewardLineGroupID                   | `3`                                                              |
| PreMissionID                        | `4010134`                                                        |
| MapEntranceID                       | `1010201`                                                        |
| MappingInfoID                       | `1220`                                                           |
| WorldID                             | absent                                                           |
| BackGroundPath                      | `SpriteOutput/Abyss/UI3D_SceneBg/AbyssSenceBgl_Red_16.png`       |
| TabPicPath                          | `SpriteOutput/UI/Abyss/Process/TypeIcon/AbyssSwitchLoop_Off.png` |
| TabPicSelectPath                    | `SpriteOutput/UI/Abyss/Process/TypeIcon/AbyssSwitchLoop_On.png`  |
| ThemePicPath                        | `SpriteOutput/DailyMission/Banner/ChallengeAbyssBanner2.png`     |
| TierceID                            | `5413`                                                           |
| ThemePosterBgPicPath on group row   | absent；在 `ChallengeMazeGroupExtra` 存在，见下                  |
| 独立 description / start / end 字段 | absent                                                           |

`ChallengeMazeGroupExtra[GroupID=1035].ThemePosterBgPicPath` 为 `SpriteOutput/Abyss/2D_SceneBg/AbyssSenceBgl_Red_16.png`。当前 MoC domain builder 不读取这个表；这里检查它是为核实原始视觉完整性，不能把原始路径等同于网站已经投影的图片。

实际调查关系表为 `ChallengeGroupConfig`、`ChallengeMazeConfig`、`ChallengeMazeTierce`、`ScheduleDataChallengeMaze`、`ChallengeMazeGroupExtra`、`PlaneEvent`、`StageConfig`、`MonsterConfig`、`MonsterTemplateConfig`、`MazeBuff`、`ChallengeMazeRewardLine`、`RewardData`、`TextMapCHS/EN`。生成器另外实际读取并解析 HardLevelGroup、EliteGroup、敌人能力配置等，数值解析结果见第 9 节。

## 5. Comparison with normal MoC groups

1035 是 pinned 表内最大的 MoC GroupID，没有可比较的 1036。选择完整具名、带日程的 1033，以及结构最近但同样缺日程的 1034；不把 1034 误写成元数据完整的正常对照。

| Field                          | 1033                                          | 1034                   | 1035          |
| ------------------------------ | --------------------------------------------- | ---------------------- | ------------- |
| GroupName hash                 | `14627468344272196063`                        | `15647371369237071234` | absent        |
| CHS                            | 学院怪谈                                      | 扫除风暴               | absent        |
| EN                             | Academy Ghost Story                           | Stormcleanse           | absent        |
| ScheduleDataID                 | `201033`                                      | `291015`               | `291016`      |
| Schedule row                   | 存在                                          | absent                 | absent        |
| Begin / End                    | `2026-07-06 04:00:00` / `2026-08-17 04:00:00` | absent                 | absent        |
| MazeBuffID                     | `3030146`                                     | `3030147`              | `3030147`     |
| BackGroundPath / poster suffix | `_Red_15.png`                                 | `_Red_16.png`          | `_Red_16.png` |
| TierceID                       | `5213`                                        | `5313`                 | `5413`        |
| GroupType / RewardLineGroupID  | Memory / 3                                    | Memory / 3             | Memory / 3    |

PreMissionID、MapEntranceID、MappingInfoID、TabPicPath、TabPicSelectPath、ThemePicPath 三组相同，WorldID 三组均 absent。Group raw schema 比较中，1035 相对于 1034 唯一缺失的 key 是 GroupName；其他差异是 GroupID、ScheduleDataID、TierceID 的值。

将 5301–5312 与 5401–5412 按 Floor 配对：第一层只有 `ID/Name/GroupID` 不同；其余层再多一个 `PreChallengeMazeID` 不同。所有 event lists、buff、敌人预览、奖励、倒计时及其他字段完全相同。Tierce 5313 与 5413 的区别仅是主键与父配置 ID，第三路都引用 `30124123`。

## 6. Current HSR-Database processing path

| Layer / file                                             | Function / condition                                                           | Transformation                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `scripts/data/raw.ts`                                    | `readRaw` → `materialize` → `readTable`                                        | lossless-json 解析；Hash 保留字符串                                                               |
| `scripts/data/endgame.ts`                                | `loadTables`                                                                   | 读取 MoC group/config/schedule/tierce 及战斗依赖                                                  |
| 同上                                                     | `buildEndgameDomain` 的 MoC loop、`sortedConfigsByGroup/sortedConfigs`         | 按 GroupID 连接，按 Floor 排序；没有 1035 删除或人工造关分支                                      |
| 同上                                                     | `tierceFor/eventListsFor/buildSlots`                                           | 第 12 层额外附加来自 tierce 的第三个 slot                                                         |
| 同上                                                     | `resolveStage/buildFixedStage`                                                 | EventID → PlaneEvent 唯一 StageID → waves/monster 实例                                            |
| 同上                                                     | `resolveEndgameSchedule`                                                       | 有引用但查无 row 时 warn；省略 group.schedule                                                     |
| 同上                                                     | `groups.push`                                                                  | `recommendationEligible=Boolean(GroupName?.Hash)`；`nameSource=neutralTextSource(GroupName)`      |
| `scripts/data/projection/endgame.ts`                     | `projectEndgame/projectGroup/projectText`                                      | GroupName 和 encounter Name 都为 optional；缺文本保留缺失，不造 upstream 名称                     |
| `scripts/data/sync.ts`                                   | `syncData/writeViewArtifacts`                                                  | 输出 `views/{locale}/endgame/moc.json`；group 数据中无 name/schedule                              |
| `src/lib/domain/endgame-view.ts`                         | `buildPeriodView`                                                              | `group.name                                                                                       |     | presentation.groupName(groupId)`；无 schedule → `dateLabel='-'`、status unknown；count 来自 encounters.length |
| 同上                                                     | `recommendedGroupId/buildModeView`                                             | 优先 recommendationEligible；因此默认推荐 1034，不删掉 1035                                       |
| `src/lib/server/endgame.ts`                              | `getEndgameMode/getEndgameGroup/buildResolvedGroupView/getEndgameGroupEntries` | 读取 locale 数据；period builder 没有显式传 EN presentation，使用中文默认；详情路由遍历所有 group |
| `src/lib/components/endgame/EndgameSeasonCard.svelte`    | `period.name/encounterCount`                                                   | overview 展示标题、`-`、12 stages；链接指向 `/endgame/moc/1035` 的 locale counterpart             |
| `src/lib/components/endgame/EndgameSeasonHero.svelte`    | `GameText text={period.name}`                                                  | 直接展示 server period title                                                                      |
| `src/lib/domain/search-index.ts`                         | `collectEndgameSearchOccurrences/collectEndgameSearchTargets`                  | 按 template ID 建 enemy target，locator 带 group/floor/slot/stage/wave/monster                    |
| `scripts/data/endgame-occurrence-shards.ts`              | `buildEndgameOccurrenceShards`                                                 | 已投影数据 → period 与 enemy card model；使用 locale projection policy                            |
| `src/lib/server/endgame.ts`、`src/lib/search/endgame.ts` | `getEndgameOccurrenceShard/createEndgameSearchExpander`                        | 公共分片响应与按 locator 展开；A 修复只补 portrait，不重写 projected period                       |

同轮 A 修复将英文 occurrence 源分片从 `static/generated/en/endgame-occurrences/` 移至私有 `src/lib/generated/views/en/endgame-occurrences/`，避免静态文件遮蔽图片解析 endpoint。公开 `/generated/{locale}/endgame-occurrences/{targetId}` 不变；此存储迁移不是 1035 policy 变更。

## 7. Existing special handling

在生产代码中没有找到 `if (id === 1035)` 式专用分支。实际行为由以下通用规则共同产生：

1. `resolveEndgameSchedule` 把悬空的 ScheduleDataID 作为 warning，允许生成无 schedule group。1034 也触发该规则。
2. GroupName/encounter Name 的 optional projection 允许缺失；这不是 1035 专有政策。
3. `buildPeriodView` 为没有 group name 的记录构造站点标题，并为无日程记录保留 unknown 分类及 `-`。
4. `recommendationEligible` 和 `recommendedGroupId` 排除无 GroupName 的记录参与通常推荐，但不会过滤 catalog、route 或 Search。
5. encounter 展示使用结构性的 floor/ordinal；12 个缺失 Name 不会减少 encounters。

只搜索数字会遗漏这些机制。已同时搜索“数据组”、unnamed、placeholder、schedule、recommendationEligible、ChallengeGroup 等词，并结合下面的历史提交确认哪些是为 4.5 异常元数据引入的容错。没有发现人工补 12 关、替换敌人、替换 buff 或 1035 专用图片规则。

## 8. Source of "数据组 1035"

它不是 game-owned title，也不来自 TextMap。

`src/lib/domain/endgame-view.ts::ZH_CN_ENDGAME_VIEW_PRESENTATION.groupName` 返回 `数据组 ${groupId}`。`buildPeriodView` 缺名时使用该函数。EN overview/detail 的 server 调用没有传入英文 presentation，因此读取英文 group 数据之后，仍会产生中文标题。

需要区分另一个已有事实：`scripts/data/projection/policy.ts` 的英文 `endgameView.groupName` **本来就返回** `Data group ${groupId}`。所以修复前 EN Search 的离线 occurrence period 已显示 `Data group 1035`，并不与 EN overview/detail 一致。此次没有添加、改写或删除这条英文 fallback；A 的分片处理刻意保留原始 period 字段。

## 9. Stage relationship and the 12 stages

UI 的 “12 stages” 对应 12 个 **encounters / floors**，并不表示只有 12 条 `StageConfig`。下面的 stage IDs 都是自然上游关系产生的，EventID 与 StageID 在这些关系中相同。

| Floor | ChallengeMazeConfig.ID | Battle StageIDs              | Level | 未去重敌人次数 |
| ----- | ---------------------- | ---------------------------- | ----- | -------------- |
| 1     | 5401                   | 30124011, 30124012           | 68    | 10             |
| 2     | 5402                   | 30124021, 30124022           | 72    | 10             |
| 3     | 5403                   | 30124031, 30124032           | 76    | 10             |
| 4     | 5404                   | 30124041, 30124042           | 80    | 10             |
| 5     | 5405                   | 30124051, 30124052           | 84    | 10             |
| 6     | 5406                   | 30124061, 30124062           | 68    | 10             |
| 7     | 5407                   | 30124071, 30124072           | 72    | 10             |
| 8     | 5408                   | 30124081, 30124082           | 76    | 10             |
| 9     | 5409                   | 30124091, 30124092           | 80    | 10             |
| 10    | 5410                   | 30124101, 30124102           | 90    | 6              |
| 11    | 5411                   | 30124111, 30124112           | 92    | 6              |
| 12    | 5412                   | 30124121, 30124122, 30124123 | 95    | 10             |

基本关系为 `ChallengeMazeConfig.GroupID=1035` → `EventIDList1/2` → `PlaneEvent.EventID` → `StageConfig.StageID`。PlaneEvent 的 WorldLevel 变体引用同一个 StageID，`resolveStage` 去重后要求唯一 ID，不会把 WorldLevel 变体计算为不同楼层。

第 12 层第三路来自 `ChallengeMazeTierce`：`PHFMCACHFIJ=5413`，`DLCKKJFMJOB=5412`，`HFIAAGAKFMD=[30124123]`。不是第 13 层，也没有构造额外难度 group。

完整性检查结果：

- 25 条 StageConfig 均存在、StageType 均为 `Challenge`、Release 均为 true、LevelGraphPath 均为 `Config/Level/StageCommonTemplate.json`，每 stage 2 waves。
- 112 个出现次数涉及 43 个不同 MonsterID；全部 MonsterConfig 与 MonsterTemplateConfig 引用存在；生成的 HP.final、speed、toughness.display 均为 resolved。去重后的 Search 为 43 targets、94 locators。
- 12 个 encounter 的 MazeBuffID 均为 `3030147`，与 group reference 一致。MazeBuff 的 BuffName hash `17710560969208429273`、BuffDesc hash `1636353907800680509` 均在 CHS/EN resolve，params 为 `0.8, 1`；展示为每轮让一名巡猎或智识角色立即行动，增伤 80%、持续 1 回合。
- MazeBuff.ModifierName 为 `ADV_StageAbility_MazeCommon_Empty`，但 **1034 使用完全相同的 buff**；仅凭 Empty 字样不能证明 1035 是测试关卡。25 条 StageAbilityConfig 均为空；游戏运行时效果是否完全由其他系统绑定，超出静态网站展示验证。
- RewardLineGroupID 3 有 12 个星数档（3, 6, …, 36），RewardID 为 101901–101912；floor RewardID 为 101201–101212；tierce reward 为 101913。这 25 个 RewardData 引用均存在。网站当前不投影奖励域，不能把网站“未展示奖励”误当作 upstream 无奖励。
- 12 个 encounter Name hash 均无法在 CHS/EN resolve：5401 `8104310471763397358`；5402 `16019259931035675821`；5403 `17584067565974869630`；5404 `9456830996630424326`；5405 `4709516214880936342`；5406 `12442164547551928967`；5407 `8134198432576760274`；5408 `1350555594116447114`；5409 `4541626006613497075`；5410 `607617925983667711`；5411 `3173421580684812257`；5412 `11795568025445254274`。

因此战斗关系和网站所需静态数值完整，但赛期标题、日程及关卡文本并不完整。“12”本身不能证明一个正式完整赛期。

## 10. Current-behavior baseline

| Field / behavior                                | Observed baseline                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| Included / mode / group                         | yes / moc / 1035                                                         |
| Neutral nameSource / localized group.name       | absent / absent                                                          |
| Overview/detail title zh-CN                     | 数据组 1035                                                              |
| Overview/detail title EN                        | 数据组 1035                                                              |
| Search period title zh-CN / EN                  | 数据组 1035 / Data group 1035                                            |
| Group description                               | absent；memory turbulence description 单独存在                           |
| Schedule / start / end                          | absent / absent / absent                                                 |
| Period date / status                            | `-` / unknown                                                            |
| Buff                                            | 12 encounters 各有 3030147，双语言可展示                                 |
| Encounter count / IDs                           | 12 / 5401–5412                                                           |
| Battle stage count / IDs                        | 25 / 第 9 节完整列出                                                     |
| recommendationEligible / default recommendation | false / 1034                                                             |
| Group-specific visual in generated domain       | absent；原始视觉路径存在但未投影                                         |
| Overview card                                   | unknown 分组；中文标题、`-`、12 stages；没有赛期专用海报                 |
| Detail routes                                   | `/endgame/moc/1035`、`/en/endgame/moc/1035`，真实页面可访问              |
| Search entry                                    | 没有独立“赛期搜索文档”；43 个 enemy targets 含 1035，合计 94 locators    |
| Validation                                      | data:sync/data:validate 成功；全项目有既有 missing-text 诊断，见第 13 节 |

页面层不读取 GroupName hash；中文标题是在缺名后由站点代码构造。不能用 HTML 中非空 title 证明源数据有名称。

## 11. No-special-case experiment

实验在本站工作区完成，未改 raw data。两个实验文件在 `try/finally` 中备份并逐字恢复；没有提交临时代码。

**Primary：撤去确认作用于 1035 的容错。**

1. 在 `resolveEndgameSchedule` 中，对 GroupID 1035 将 `issues.warn` 改为同一个 Diagnostics 对象的 `issues.fail`，恢复历史的悬空日程致命语义。其他组保持原行为，避免 1034 先失败而遮蔽 1035。
2. 在 MoC group 创建时，1035 不再因无 GroupName 被排除于推荐资格。
3. 在 `buildPeriodView` 两条返回路径中，对 1035 使用原始 `group.name`，不执行 `presentation.groupName` fallback；没有加入任何替代文本。
4. 执行真实 `pnpm data:sync`。

结果 exit 1，第一处实际错误：

```text
Error: [Endgame:missing-schedule] Group.ScheduleDataID 无法解析 (mode=moc, groupId=1035, scheduleId=291016)
    at Diagnostics.fail
    at resolveEndgameSchedule
    at buildEndgameDomain
    at syncData
```

位置是 `scripts/data/endgame.ts` 的 MoC loop 中，`resolveEndgameSchedule` 调用在 `groups.push` 前。raw 记录已读取，12 encounters 的构建已执行，但没有返回完整 neutral domain；没有因为过滤规则自然消失。locale projection、双语言新 views、route/Search 新产物尚未生成。原有 generated cache 不能算作实验成功产物。构建前置生成会失败，未额外运行 build 去重复同一失败。

**Secondary forced experiment：只保留日程容错。**

明确绕过 primary failure：把 schedule 行恢复为 warn，保留上述第 2、3 项移除行为。执行 `pnpm data:sync`，exit 0；再执行 `pnpm data:validate`，exit 0。没有补文本、补日程或改上游。

结果：双语言 group 仍无 name/schedule，有 12 encounters 和完整 25 stages，recommendationEligible=true；按照现有推荐算法会选中 1035。EN occurrence period 序列化结果为：

```json
{
  "mode": "moc",
  "period": {
    "groupId": 1035,
    "dateLabel": "-",
    "status": "unknown",
    "encounterCount": 12
  }
}
```

`name` 字段消失而不是自动获得 upstream 标题。manifest routePaths 仍包含 `/endgame/moc/1035`；两语言 Search targets/locators 仍存在。这里证明的是生成数据与路由库存，不是次级实验的 HTML 质量：没有对次级状态运行生产 build 或浏览器测试，也没有再绕过缺标题去声称页面正常。

通用 optional TextMap 投影、ordinal 展示及无 schedule 的 unknown 状态继续属于原有 normal pipeline；没有人为把 optional 字段改成必填来制造另一个失败。若全局恢复历史严格日程逻辑，1034 的 291015 会先失败；primary 特意把实验边界限制在目标组。

## 12. Current vs natural-pipeline comparison

| Field / behavior                | Current special handling | Primary: no tolerance             | Secondary: schedule tolerance only  |
| ------------------------------- | ------------------------ | --------------------------------- | ----------------------------------- |
| Raw group read                  | yes                      | yes                               | yes                                 |
| Complete neutral domain         | yes                      | 未返回，1035 push 前失败          | yes                                 |
| Filtered out                    | no                       | no，属于异常终止                  | no                                  |
| Included in new MoC catalog     | yes                      | not generated                     | yes                                 |
| zh-CN / EN generated group.name | absent / absent          | not generated                     | absent / absent                     |
| Overview/detail title           | 两者为 数据组 1035       | not generated                     | builder 无 title；HTML 未实测       |
| EN Search period title          | Data group 1035          | not generated                     | absent                              |
| Title source                    | site fallback            | 无输出                            | 无 fallback、无 raw title           |
| Schedule / dates                | absent / `-`             | 291016 unresolved 导致失败        | absent / `-`                        |
| Buff                            | 3030147                  | 未发布；前置 encounter 构建已解析 | 3030147                             |
| Floors / IDs                    | 12 / 5401–5412           | 未发布                            | 12 / 5401–5412                      |
| Battle StageIDs                 | 第 9 节的 25 项          | 未发布                            | 与 current 相同                     |
| Search                          | 43 targets / 94 locators | not generated                     | 43 targets / 94 locators            |
| Detail route                    | 双语言可访问             | not generated                     | route inventory 保留；HTML 未测试   |
| Recommendation                  | 1034                     | 不到达此阶段                      | 现有算法选 1035                     |
| data:sync                       | exit 0                   | exit 1                            | exit 0                              |
| data:validate                   | exit 0                   | 无新产物可验证                    | exit 0                              |
| Production build                | 正式恢复状态成功         | 前置生成失败；未另跑              | 未运行                              |
| First failure boundary          | 无核心生成错误           | resolveEndgameSchedule            | 未发现生成/验证错误；title 契约缺口 |

## 13. Validation / generation behavior

实际执行的关键命令：

| Command                                                                                                            | State / result                                                                    |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `git status --short`、上游 `git -c safe.directory=… -C … status --short/rev-parse HEAD`                            | 初始无改动，HEAD 与 lock 一致                                                     |
| `node --import tsx data/audit/investigate-1035.ts`                                                                 | raw/当前 generated/HTTP 分片证据采集                                              |
| `node --import tsx data/audit/completeness-1035.ts`                                                                | 全部 monster/template/stat/reward 引用与相邻关卡比较                              |
| `node data/audit/experiment-1035.mjs`                                                                              | 调用主实验 sync、次级 sync/validate；finally 恢复文件                             |
| `pnpm data:sync`                                                                                                   | primary exit 1；secondary exit 0；恢复后 exit 0                                   |
| `pnpm data:validate`                                                                                               | secondary、恢复后均 exit 0                                                        |
| `pnpm assets:ensure`                                                                                               | 正式 build 与 baseline check 调用，缓存通过                                       |
| `pnpm check`                                                                                                       | exit 0；1 条既有 unused CSS selector 警告                                         |
| `pnpm test`                                                                                                        | 418 passed / 2 failed；失败为既有 EN rank 文案与首页 tagline fixture，不涉及 1035 |
| `pnpm product:baseline:check`                                                                                      | exit 1；唯一差异是 homepage.localizedText.tagline，无 Endgame 差异                |
| `pnpm build`                                                                                                       | 正式恢复状态成功，包含双语言 occurrence endpoint                                  |
| `pnpm exec playwright test tests/e2e/search-artwork.spec.ts tests/e2e/search-v2.spec.ts tests/e2e/endgame.spec.ts` | 78 passed，桌面与移动端                                                           |

恢复状态数据验证输出为 zh-CN/en 各 1144 条 Search 记录、190 个 English Endgame shards。既有 CHS missing TextHash 警告为 544 项；不代表 1035 有 544 项错误。全局 endgame audit 的 coreErrors.count=0，warnings 只保存有限 samples，不能把 samples 没列到 1035 误读成它没有触发 missing-schedule。

补充执行 `pnpm lint`：因未改动的 `README.md` 不符合 Prettier 而 exit 1，尚未执行到 ESLint。随后单独运行 `pnpm exec eslint .`，exit 0；本轮修改的文件单独通过格式检查。开发服务与生产预览均已实际确认 EN Search 的 Sam portrait 加载正确，且其整个分片去除 portraitUrl 后与修复前相同。

完整测试的两处差异已在未改动的 HEAD 内容中核实：EN message 为 Normal/Elite/Boss，而测试期待 Normal Enemy/Elite Enemy/Boss Enemy；CHS home_tagline 为“——愿此行，终抵群星”，fixture 仍为 “HONKAI: STAR RAIL DATA ARCHIVE”。本轮没有更新那些文案或放宽产品基线。

一次开发服务器运行期间的 sync 曾因 Windows 占用 generated 目录而无法 rename；停止 Vite 后同一正式命令成功。这是环境文件锁，不是 1035 natural-pipeline failure。主实验上述 missing-schedule 错误才是本调查的 primary result。

## 14. Historical archaeology

可确认的 Git 证据：

- `95b7ba8`（Add a fresh new section for endgame modes.）已经在 `buildPeriodView` 中使用 `数据组 ${groupId}`。这是早于当前 EN 流程的通用站点 fallback，不是 upstream 文本。
- `c6fc8f692346d89c6b66f27f557839d32aa169ab`，2026-08-26，**Update data source to v4.5**：把内部 `scheduleFor` 的 `diagnostics.fail('missing-schedule', …)` 替换为导出的 `resolveEndgameSchedule`，后者执行 warn；同时加入优先具名 group 的 recommendation 逻辑。
- 同一提交新增真实数据测试：“真实 4.5 MoC 保留 1034/1035 并默认推荐具名的 1034”，明确断言 1035 name/schedule undefined、12 encounters、fallback 数据组 1035、推荐 1034。这证明维护者当时有意保留它且避免默认选中。
- `470041e` 后续把推荐资格改为 neutral `recommendationEligible`，当前 builder 由 GroupName hash 是否存在决定，避免按本地化文本分类。
- `0b4c40a`（Complete EN data projection）引入独立 presentation policy；现在 server period 默认值与 EN offline projection 不一致，形成第 8 节所述现象。

复查命令包括 `git log -S '数据组'`、`git log -S 'const named = groups.filter'`、`git log -S 'missing-schedule'`、`git log -S '1035'`、`git show c6fc8f6 -- scripts/data/endgame.ts src/lib/domain/endgame-view.ts tests/unit/endgame-view.test.ts`。

历史证据足以解释“为什么不再因 missing schedule 阻断 4.5 同步、为什么保留但不默认推荐 1035”。没有找到上游或 maintainer 对其真实游戏用途作出正式定义的记录；不能把这些测试进一步解读为“确认它是官方 placeholder 赛期”。

## 15. Confirmed facts

- GroupName absent；悬空日程 291016；12 个 encounter Name hash 双语言缺失。
- 12 floors、25 battle stages、50 waves 全是自然 upstream relation，不是网站 special case 构造。
- 与 1034 复用全部战斗 StageIDs、buff、奖励和海报路径；战斗引用与静态数值可解析。
- 数据组 1035 是站点默认 presentation 生成；EN Search 原本已有不同的英文 fallback。
- 移除 missing-schedule tolerance 会真实中断生成；仅缺标题不会让当前 data validator 失败。
- 当前测试有意保留 1035 且推荐 1034；本次实验已恢复，没有保留产品策略修改。

## 16. Strong inferences

1035 很可能是尚未完整填充的下一组配置，或复制 1034 后待更新的占位记录。依据是连续 ID、GroupName 缺失、日程悬空、全部 encounter Name 未落 TextMap，以及战斗关系/奖励/主题与 1034 重复。这些证据比单看“12 stages”更有解释力，但依然不是上游明确声明。

## 17. Unknowns

- 1035 最终是否会成为公开赛期、何时开放、名称与日程应该是什么。
- 重复 1034 的战斗是否只是暂存，还是某种内部/特殊用途。
- 游戏运行时是否会通过未纳入网站域的系统过滤该 group 或绑定额外战斗机制。
- 次级无标题产物在所有页面与辅助技术中的表现；本轮没有把无标题状态发布成产品。

## 18. Product-policy options for discussion

| Option                                          | 适用前提                                      | 风险 / 需要同步处理                                               |
| ----------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| A — Remove special handling                     | 接受严格失败，或 upstream 已补全必需元数据    | 当前会因 291016 阻断生成；全局撤销还会影响 1034                   |
| B — Hide 1035 from public product               | 明确 public eligibility，决定是否保留内部数据 | 必须同时覆盖 overview、route、Search 和直达链接，避免只在列表隐藏 |
| C — Preserve explicit placeholder group         | 接受公开不完整记录并清晰解释                  | 需定义站点措辞及 EN/CHS 一致性，不能冒充官方名称                  |
| D — Mostly normal, fallback only missing fields | 希望保留可用战斗数据并接受未知日程            | 需明确 fallback 与推荐规则；不能把缺元数据默认为正常完整赛期      |

本报告不选择其中任何一项，也没有实施对应翻译、隐藏、重命名或路由政策。

## 19. Recommended questions for maintainer decision

1. Public catalog 是否允许展示无 GroupName 且日程悬空的 group，还是只保留其内部结构数据？
2. eligibility 应依据什么稳定上游字段；规则仅针对 1035，还是所有缺名/缺日程组？1034 同样缺日程，应如何处理？
3. 若保留，站点如何说明“可查看战斗数据，但没有正式标题与时间”，并让 overview/detail/Search 两种语言一致？
4. 是否为 period.name 增加独立页面/产物契约，以避免次级实验这种无标题数据通过 validation？
5. 后续 upstream 更新如何重新评估：补齐名称、补齐 schedule、或战斗 StageIDs 与 1034 分离，分别触发什么审查？

恢复检查：`scripts/data/endgame.ts` 与 `src/lib/domain/endgame-view.ts` 实验前后 SHA-256 分别保持 `19fd6f8f7c4e761204a6108ed5878cc850beb6ec003223b9ffad244777b8a20d`、`4df6ef350260f2f5cd8e24cfd6085c71d7e1b8f29d8771e1eb35b70f0002dcc5`。恢复生成后的两语言 1035 group JSON 与 current baseline 深比较相等；Sam 的整个分片去除 portraitUrl 后与任务开始时相等，包含 1035 period。实验修改未进入最终 diff。
