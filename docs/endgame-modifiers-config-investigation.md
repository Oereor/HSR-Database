# Endgame Buff / Debuff / Modifier Config Investigation

- 调查日期：2026-08-22
- 网站仓库提交：`4b4be93a0e6e287b8be71e7708b886fa2e2dfd49`
- 权威结构化数据：`../TurnBasedGameData`，提交 `648b08fbdb2e49739ebbf1210c9a189fcfc5e2d7`
- 视觉资源源：`../StarRailRes`，提交 `b95e75c7e1273d819d20c530c0b7e13a3ef19fb4`
- 调查性质：只读 config investigation；本轮没有修改 Endgame parser、normalized model 或 UI

## 结论摘要

四种模式不能通过一张共同的“Buff 表”直接统一，但最终展示记录可以共享一小组字段。真实关系如下：

| Mode | Modifier / mechanic      | Fixed / Selectable     | Ownership / scope                                        | Relation source                                                                                                   |    Options |
| ---- | ------------------------ | ---------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------: |
| MoC  | 记忆紊流                 | Fixed                  | encounter；现代赛期实际为 cycle 内所有关卡、左右半场共享 | `ChallengeMazeConfig.MazeBuffID → MazeBuff.ID`；`ChallengeGroupConfig.MazeBuffID` 提供 cycle 级重复引用           |          — |
| PF   | 战意基础机制与阶段效果   | Fixed                  | cycle + encounter；同一关卡两个节点共享                  | `ChallengeStoryMazeConfig.MazeBuffID` + `ChallengeStoryGroupExtra.SubMazeBuffList`                                |          — |
| PF   | 荒腔走板                 | Selectable             | cycle 定义 options；每支队伍选择 1 个                    | `ChallengeStoryGroupExtra.BuffList[] → MazeBuff.ID`                                                               | 当前每组 3 |
| AS   | 末法余烬                 | Fixed                  | encounter；两个/三个 boss 节点共享                       | `ChallengeBossMazeConfig.MazeBuffID → MazeBuff.ID`，并由 `StageConfig.StageConfigData[_BindingMazeBuff]` 再次绑定 |          — |
| AS   | 终焉公理                 | Selectable             | cycle + boss slot；每个首领/队伍各有一组                 | `ChallengeBossGroupExtra.BuffList1/2/3[] → MazeBuff.ID`                                                           |     每组 3 |
| AS   | 首领特性、阶段、攻略提示 | Fixed mechanic / guide | concrete `MonsterID`，部分内容 phase-specific            | `ChallengeBossMazeExtra.MonsterID* → MonsterGuideConfig.MonsterID → guide tables`                                 |          — |
| AA   | 骑士/王棋敌人特性        | Fixed                  | encounter；普通王棋和绝境王棋分别定义                    | `ChallengePeakConfig.TagList[]` / `ChallengePeakBossConfig.HardTagList[] → MazeBuff.ID`                           |          — |
| AA   | 回合/召怪 battle event   | Fixed                  | concrete stage / battle                                  | `StageConfig.StageConfigData[_CreateBattleEvent] → BattleEventConfig.BattleEventID`                               |          — |
| AA   | 裁决象限                 | Selectable             | boss encounter；普通/绝境共用同一 boss config 记录       | `ChallengePeakBossConfig.BuffList[] → MazeBuff.ID`                                                                |          3 |

最重要的分类结论：

1. PF 的三个荒腔走板不是同时生效。它们由一个 cycle row 的 `BuffList` 分组；玩法 TextMap 进一步明确“可选择 1 种效果携带”“为每支队伍选择其中一种”。
2. AA 王棋的三个 `BuffList` 项也不是同时生效。玩法 TextMap 明确“可以为队伍选择其中一种增益效果”和“请选择一种增益效果”。
3. `MazeBuff.DisplayType = "Fixed"` 不能用于区分 fixed/selectable：PF 荒腔走板、AS 终焉公理和 AA 裁决象限的 option rows 同样是 `Fixed`。该字段是 MazeBuff 自身的显示类型，不是 Endgame selection semantics。
4. AS 的 boss 特性不能全部归入 stage buff。`MonsterGuideConfig` 以 concrete `MonsterID` 为主键，明确表达首领特性、难度变化、阶段和攻略提示，ownership 应保留在 enemy occurrence / encounter enemy relation。
5. 推荐未来继续扩展现有 Endgame domain，不新建第二套 pipeline；fixed modifiers 与 selectable groups 应保持两个 presentation concepts。

## 1. Scope and investigated sources

### 1.1 Current HSR-Database implementation

实际阅读了：

- `scripts/data/endgame.ts`
- `scripts/data/pure-fiction-hp.ts`
- `scripts/data/localization.ts`
- `scripts/data/text.ts`
- `scripts/data/raw.ts`
- `src/lib/domain/endgame.ts`
- `src/lib/domain/endgame-view.ts`
- `src/lib/domain/game-text.ts`
- `src/lib/server/endgame.ts`
- `src/routes/endgame/**`
- `src/lib/components/endgame/**`
- `tests/unit/endgame.test.ts`
- `tests/unit/endgame-view.test.ts`
- `tests/e2e/endgame.spec.ts`

### 1.2 Endgame and relation configs

实际检查的主要 `ExcelOutput` 表：

- shared：`PlaneEvent.json`、`StageConfig.json`、`BattleEventData.json`、`BattleEventConfig.json`、`MazeBuff.json`
- MoC：`ScheduleDataChallengeMaze.json`、`ChallengeGroupConfig.json`、`ChallengeMazeConfig.json`、`ChallengeMazeGroupExtra.json`、`ChallengeMazeTierce.json`
- PF：`ScheduleDataChallengeStory.json`、`ChallengeStoryGroupConfig.json`、`ChallengeStoryGroupExtra.json`、`ChallengeStoryMazeConfig.json`、`ChallengeStoryMazeExtra.json`、`ChallengeStoryMazeTierce.json`
- AS：`ScheduleDataChallengeBoss.json`、`ChallengeBossGroupConfig.json`、`ChallengeBossGroupExtra.json`、`ChallengeBossMazeConfig.json`、`ChallengeBossMazeExtra.json`、`ChallengeBossMazeTierce.json`、`ChallengeBossTargetConfig.json`、`ChallengeBossConstValue.json`
- AA：`ChallengePeakGroupConfig.json`、`ChallengePeakConfig.json`、`ChallengePeakBossConfig.json`、`ChallengePeakCommonConst.json`
- enemy mechanics：`MonsterConfig.json`、`MonsterTemplateConfig.json`、`MonsterGuideConfig.json`、`MonsterGuideTag.json`、`MonsterTextGuide.json`、`MonsterDifficultyGuide.json`、`MonsterGuidePhase.json`、`MonsterGuideSkill.json`、`MonsterGuideSkillText.json`
- PF/AA spawn chain：`StageInfiniteGroup.json`、`StageInfiniteWaveConfig.json`、`StageInfiniteMonsterGroup.json`
- localization：`TextMap/TextMapCHS.json`

还检查了 `StrongChallengeStage.json`、`StrongChallengeBossDetail.json` 和 `FantasticStory*.json`。它们分别属于旧活动或另一套活动，不是当前 PF/AS cycle relation 的权威入口，不能因为命名相似而接入 Endgame。

### 1.3 Asset sources

检查了：

- `MazeBuff.BuffIcon` 中的 `SpriteOutput/...` 路径；
- `../StarRailRes/README.md`、`LICENSE`、`icon/`、`image/`；
- 当前 `static/` 和现有 asset sync pipeline。

## 2. Current HSR-Database Endgame Architecture

### 2.1 Mode config entry points

当前 `scripts/data/endgame.ts` 的 mode mapping 为：

| Mode | Schedule                     | Group                       | Encounter config           | Tierce / extra encounter                  |
| ---- | ---------------------------- | --------------------------- | -------------------------- | ----------------------------------------- |
| MoC  | `ScheduleDataChallengeMaze`  | `ChallengeGroupConfig`      | `ChallengeMazeConfig`      | `ChallengeMazeTierce`                     |
| PF   | `ScheduleDataChallengeStory` | `ChallengeStoryGroupConfig` | `ChallengeStoryMazeConfig` | `ChallengeStoryMazeTierce`                |
| AS   | `ScheduleDataChallengeBoss`  | `ChallengeBossGroupConfig`  | `ChallengeBossMazeConfig`  | `ChallengeBossMazeTierce`                 |
| AA   | 无 schedule table 接入       | `ChallengePeakGroupConfig`  | `ChallengePeakConfig`      | `ChallengePeakBossConfig` 的 hard variant |

共同的 stage chain 是：

```text
mode encounter config.EventIDList*
    → PlaneEvent.EventID
    → unique PlaneEvent.StageID
    → StageConfig.StageID
    → fixed MonsterList 或 StageInfiniteGroup spawn chain
    → concrete MonsterConfig.MonsterID
```

### 2.2 Existing normalized hierarchy

当前 schema version 是 `19`：

```text
EndgameModeDataset
  groups: EndgameGroup[]               // cycle / period
    encounters: EndgameEncounter[]     // floor / difficulty / preliminary / boss
      battles: EndgameBattleSlot[]     // left/right/third slot
        stages: EndgameStage[]          // EventID → StageID
          waveModel
            fixed waves
            or spawn-sequence waves
              concrete EnemyOccurrence
```

当前主键及保留的 raw IDs：

| Layer            | Key / retained IDs                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| cycle            | `mode + groupId`                                                                                |
| encounter        | `id`、`configId`；AA 额外使用 `:preliminary` / `:normal` / `:hard` variant suffix               |
| battle           | `slot`                                                                                          |
| stage            | `eventId`、`stageId`、`hardLevelGroup`、`level`、`stageAbilities`、`previewMonsterIds`          |
| PF/AA spawn wave | `waveGroupId`、`waveId`、`monsterGroupId`、wave `ability`、`params`                             |
| enemy occurrence | concrete `monsterId`、`monsterTemplateId`、elite group provenance、HP/Speed/Toughness/mechanics |

生成数据规模为：

| Mode | Groups | Encounters | Battle slots | Stages |
| ---- | -----: | ---------: | -----------: | -----: |
| MoC  |     55 |        603 |         1198 |   1453 |
| PF   |     25 |        100 |          202 |    202 |
| AS   |     20 |         80 |          163 |    163 |
| AA   |      8 |         40 |           40 |     40 |

### 2.3 Modifier-related data already loaded or retained

已有但未用于 modifier UI 的能力：

- `ChallengeGroupRow` 和 `ChallengeConfigRow` 已声明 `MazeBuffID`，但构建 group/encounter 时没有保留它；
- `ChallengeStoryGroupExtra.SubMazeBuffList` 和 `MazeBuff` 已加载。当前只用它们沿 `InBattleBindingKey` 深入验证 PF HP parent-child / kill-transfer runtime mechanic；并未导出 `BuffName`、`BuffDesc`、`BuffIcon` 或 selectable `BuffList`；
- `StageConfig.StageAbilityConfig` 会序列化进 `EndgameStage.stageAbilities`，但本报告的最新四模式 representative stages 均为空数组；
- `StageConfig.StageConfigData` 已读取，但当前只有 `_StageInfiniteGroup` 被正式解析。`_BindingMazeBuff` 和 `_CreateBattleEvent` 尚未规范化；
- `PureFictionWaveMechanic` 和 `PureFictionHpModifier` 是运行时 HP 计算证据，不等于玩家选择的荒腔走板；二者不应复用同一个 `modifier` presentation 字段；
- `ChallengePeakBossConfig` 已加载以构建 AA hard encounter，但只读取 `HardTitle`、`HardEventIDList`，未读取 `BuffList` / `HardTagList`；
- 当前没有加载 `ChallengeBossGroupExtra`、`ChallengeBossMazeExtra` 或 MonsterGuide tables。

未发现 modifier presentation 相关 TODO；缺口表现为已声明字段未消费、相关表未加载，而不是已有未完成 UI。

### 2.4 Existing text and UI path

- `createTextResolver()` 已支持 decimal-string TextMap hash 和 xxHash symbolic key；
- `formatGameMarkup()` / `formatGameText()` 已支持 `#1`、`#1[i]`、`#1[f1]` 与 `%` 参数插值；
- `GameText` renderer 支持 `color`、`i`、`u`、`unbreak` 和合法的 inline `<icon ...>`；
- Endgame UI hierarchy 为 `/endgame` → `/endgame/[mode]` → `/endgame/[mode]/[groupId]` → encounter navigator → battle → stage/waves → enemy occurrence；
- normalized modifier 最自然的消费位置是 group detail page，而不是建立新的 Endgame route tree。

## 3. Terminology and classification rules

### Fixed modifier

由 encounter/cycle/stage config 直接挂载，无 selection group 语义。一个 fixed list 中可以有多个同时展示的 component，例如 AA `TagList` 或 PF `SubMazeBuffList`。

### Selectable modifier group

由 owner row 的专用 `BuffList*` 字段表达一组 options，并由该模式的玩法 TextMap 明确进入战斗前选择其中一种。真实配置没有独立的 universal group table，也没有统一的 `selectCount` 字段。

### Scope / ownership

本报告优先以引用字段所在的 owner 为准：cycle row、encounter row、boss slot、concrete stage 或 concrete Monster。描述文本中的“我方/敌方”用于 presentation audience，不改变配置 ownership。

## 4. MoC

### 4.1 Config relation

现代赛期存在两个直接引用层：

```text
ChallengeGroupConfig.GroupID
    └─ MazeBuffID ───────────────┐
ChallengeMazeConfig.ID (floor)   │
    └─ MazeBuffID ───────────────┴→ MazeBuff.ID (Lv=1)
                                      ├─ BuffName.Hash
                                      ├─ BuffDesc.Hash / BuffDescBattle.Hash
                                      ├─ ParamList[].Value
                                      └─ BuffIcon
```

对 `GroupID 101–1034` 的现代记录，组内所有 `ChallengeMazeConfig.MazeBuffID` 都相同，且等于非空的 `ChallengeGroupConfig.MazeBuffID`。早期 legacy `GroupID 100` 和 `900` 没有 group `MazeBuffID`，各 floor 使用不同的 encounter `MazeBuffID`，所以未来 resolver 必须保留 encounter field 为权威来源，不能只读 group field。

同一个 `ChallengeMazeConfig` row 同时拥有 `EventIDList1` 与 `EventIDList2`，但只有一个 `MazeBuffID`，因此左右半场共享该 fixed buff。没有发现 half-specific MoC modifier 字段。

### 4.2 Runtime corroboration

最新 stage `30124121/30124122/30124123` 的 `StageConfigData` 都包含：

```json
{ "BFLIFKBEOPJ": "_CreateBattleEvent", "MNDFOPKBHKP": "30147" }
```

`BattleEventConfig.BattleEventID = 30147`：

- `AbilityList = ["BattleEventAbility_Challenge_Month_47"]`；
- `BattleEventName = "BattleEventName_30147"` → symbolic TextMap → `记忆紊流`；
- `DescrptionText = "BattleEventDesc_30147"` → 与 MazeBuff description 同义；
- `ParamList = [0.8, 1]`，和 MazeBuff `3030147` 相同。

这是 runtime representation 的强佐证，但 `MazeBuff 3030147` 没有显式 `BattleEventID` 字段。未来静态展示应使用 direct `MazeBuffID` relation，不应通过 `30147 ↔ 3030147` 数字后缀猜测。

### 4.3 Representative examples

#### Group 1034 / floor 5312

```text
ChallengeGroupConfig.GroupID 1034 “扫除风暴”
    ├─ MazeBuffID 3030147
    └─ TierceID 5313

ChallengeMazeConfig.ID 5312 “扫除风暴其十二”
    ├─ GroupID 1034
    ├─ MazeBuffID 3030147
    ├─ EventIDList1 [30124121]
    └─ EventIDList2 [30124122]
        → StageConfig 30124121 / 30124122
        → _CreateBattleEvent 30147
```

`MazeBuff.ID 3030147`：

| Field                | Value                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `BuffName.Hash`      | `17710560969208429273` → 记忆紊流                                                                                   |
| `BuffDesc.Hash`      | `1636353907800680509`                                                                                               |
| raw description      | 每个轮开始时，随机使 1 名我方「巡猎」或「智识」命途目标立即行动，并使其造成的伤害提高 `#1[i]%`，持续 `#2[i]` 回合。 |
| `ParamList`          | `[0.8, 1]`                                                                                                          |
| display-ready values | `80%`、`1` 回合                                                                                                     |
| `BuffIcon`           | `SpriteOutput/BuffIcon/Inlevel/IconBuffAttackUp.png`                                                                |
| `Lv / LvMax`         | `1 / 1`                                                                                                             |

Tierce stage `30124123` 也创建 `BattleEvent 30147`，因此该额外 battle 使用同一 runtime buff。

#### Group 1033 / floor 5212

`ChallengeGroupConfig 1033` 与 `ChallengeMazeConfig 5212` 都引用 `MazeBuffID 3030146`；左右事件为 `30123121/30123122`。

| Field                     | Value                                           |
| ------------------------- | ----------------------------------------------- |
| name                      | 记忆紊流 (`BuffName.Hash 12134845965523193828`) |
| description hash          | `8425275830042261848`                           |
| used placeholders         | `#1[i]%`、`#2[i]`、`#3[i]`                      |
| `ParamList`               | `[0.5, 1, 15, 0.12, 0.02, 0.012]`               |
| display-ready used values | `50%`、`1` 段、`15` 段                          |

后三个参数不出现在玩家 description placeholder 中，可能供 runtime ability 使用。静态展示不能因为参数数量大于 placeholder 数量而虚构额外文本。

### 4.4 MoC conclusions

- fixed buff 是 direct MazeBuff record，不是 Skill ID，也没有中间 group table；
- 现代 cycle 同时在 group 和每个 encounter 重复引用同一 ID；legacy 数据证明 encounter fallback 必须存在；
- 每个引用 ID 在当前数据中只有一个 `Lv=1` row，没有多档 display level；
- 可以完整解析 name、description、params、icon path；
- 未找到多个独立 MoC fixed MazeBuff 同时挂载，也未找到左右半场不同 buff；
- actual runtime battle event 可核验，但静态页面无需 reverse engineer Ability。

## 5. PF

### 5.1 Three distinct relations

PF 必须区分三种字段：

```text
ChallengeStoryGroupConfig.MazeBuffID             // cycle-level base reference
ChallengeStoryMazeConfig.MazeBuffID              // encounter active base reference
ChallengeStoryGroupExtra.SubMazeBuffList[]       // fixed displayable components
ChallengeStoryGroupExtra.BuffList[]              // selectable 荒腔走板 options
```

`GroupID 2025` 证明 group `MazeBuffID` 不能替代 encounter field：group 值是 `3031220`，四个 normal encounter 的值是 `3031230`。历史上 `2019`、`2022`、`2024` 等也存在两者不同的记录。

### 5.2 Fixed mechanic: 战意效果

最新 cycle：

```text
ChallengeStoryGroupConfig 2025 “构事生意”
    └─ MazeBuffID 3031220

ChallengeStoryMazeConfig 20254 “构事生意其四”
    ├─ MazeBuffID 3031230
    ├─ EventIDList1 [30323041]
    └─ EventIDList2 [30323042]

ChallengeStoryGroupExtra 2025
    ├─ StoryType "Fever"
    └─ SubMazeBuffList [3031232, 3031233, 3031234]
```

`3031230` 的 `InBattleBindingKey = FantasticStory_BaseAbility_2300`，但 `BuffName.Hash` 和 `BuffDesc.Hash` 都是 `13013349132478528449`，该 hash 在 `TextMapCHS` 中不存在。这种 base row 不是 display-ready 文本记录。

可展示的 fixed components 来自 `SubMazeBuffList`：

|        ID | Name hash → text                  |      Description hash | Params → display                                      | Binding                                       |
| --------: | --------------------------------- | --------------------: | ----------------------------------------------------- | --------------------------------------------- |
| `3031232` | `12849046402215310399` → 追加攻击 |  `207676337105646055` | `[8]` → 每击中 1 个目标积累 8 点战意值                | `FantasticStory_BaseAbility_2310_BaseAddOn`   |
| `3031233` | `8685484360508064882` → 战熄潮平  | `5267720938568572224` | `[0.8,0.4]` → 80% ATK + 40% HP 附加伤害               | `FantasticStory_BaseAbility_2310_BeforeFever` |
| `3031234` | `5857121039531052147` → 战意汹涌  | `6162592122262275198` | `[0.2,0.5,1]` → 20% 能量、50% 易伤、100% 附加伤害提高 | `FantasticStory_BaseAbility_2310_EnterFever`  |

这些字段在 cycle extra row 上，因此定义在整期；同一 encounter 的两个 battle slots 共用。`SubMazeBuffList` 没有选择 UI 语义，且三项分别描述基础触发、普通阶段和战意汹涌阶段，应作为 fixed mechanic components 展示，而不是 selectable options。

### 5.3 荒腔走板 selectable group

真实 group relation：

```json
{
  "GroupID": 2025,
  "SubMazeBuffList": [3031232, 3031233, 3031234],
  "StoryType": "Fever",
  "BuffList": [3031363, 3031364, 3031365]
}
```

`BuffList` 数组顺序就是 option order。当前 25 个 PF groups 的 `BuffList` 都有 3 项。它挂在 cycle，不挂在单独 floor 或 half，因此一期共享同一 option set；玩法说明规定每支队伍独立选择。

完整 options：

| Order | MazeBuff ID | Name hash → name              |              Desc hash | Params → used display values                            | Icon                                     |
| ----: | ----------: | ----------------------------- | ---------------------: | ------------------------------------------------------- | ---------------------------------------- |
|     1 |   `3031363` | `7004442831037595393` → 暴言  | `15426780599087600936` | `[0.3,0.4,0.2]` → 30%、40%、20%                         | `ActivityBattleBuff164.png`              |
|     2 |   `3031364` | `17119140155260955161` → 高论 | `13099500204338367413` | `[0.6,0.2,5]` → 60%、20%；第三参数未被 description 使用 | `ActivityBattleBuff165.png`              |
|     3 |   `3031365` | `6498470773451611570` → 快嘴  |   `628774170471160122` | `[0.2,0.3,3]` → 20%、30%；第三参数未被 description 使用 | `IconChallengePeakBattleAffixes0001.png` |

每个 option 自身就是 actual MazeBuff/effect record，并提供 `InBattleBindingKey`：

- `FantasticStory_PlusAbility_2311`
- `FantasticStory_PlusAbility_2312`
- `FantasticStory_PlusAbility_2313`

没有第二个 separate “display option ID → actual effect ID” relation。

### 5.4 Why the options are not simultaneous

配置证据由两部分组成：

1. relational config 把 fixed components 放在 `SubMazeBuffList`，把另一组 MazeBuff IDs 放在一个专用 `BuffList`；
2. PF 专属 TextMap 明确 selection semantics：
   - hash `4873139567632330291`：“【荒腔走板】将为战斗提供增益效果加成，可选择1种效果携带”；
   - hash `7024976799935081413`：“在战斗前可以选择一种”；
   - hash `1683399141091224336`：“请选择一种增益效果”；
   - hash `12850746782273497480`：“请每队至少选择1名角色和1项增益效果”。

因此结论是 config-confirmed one-of-N group，而不是根据游戏 UI 印象推断。

### 5.5 PF conclusions

- fixed base、fixed components、selectable options 是三条不同关系；
- 最新 selectable group 是 3 选 1，cycle 共享 options，每支队伍分别选择；
- group row 没有 title hash、description hash 或 numeric `selectCount`；“荒腔走板”是 mode-global UI title；
- selectable options 具备完整 name/description/params/icon path；
- `3031200/1205/1210/1215/1220/1225/1230` 七个 PF base IDs 缺本地化，不能把它们直接展示成空卡片；
- current pipeline 已读取 `SubMazeBuffList` 和 MazeBuff binding，但未读取 `BuffList`，可以增量扩展。

## 6. AS

### 6.1 Fixed stage modifier: 末法余烬

最新 `GroupID 3020`：

```text
ChallengeBossGroupConfig 3020 “兵锋骑士”
    ├─ MazeBuffID 3031001               // generic group value
    └─ TierceID 30205

ChallengeBossMazeConfig 30204
    ├─ MazeBuffID 3110006               // actual encounter value
    ├─ EventIDList1 [420474]
    └─ EventIDList2 [420484]

ChallengeBossMazeTierce 30205
    └─ HFIAAGAKFMD [420494]              // third boss slot

StageConfig 420474 / 420484 / 420494
    └─ StageConfigData
       { BFLIFKBEOPJ: "_BindingMazeBuff", MNDFOPKBHKP: "3110006" }
```

这比 group `MazeBuffID=3031001` 更强：encounter row 和三个 concrete stages 都明确绑定 `3110006`。未来 active fixed modifier resolver 应以 encounter field 为主，并验证 stage binding 一致；group field仅保留 provenance，不应覆盖 encounter value。

`MazeBuff 3110006`：

| Field            | Value                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| name             | 末法余烬 (`BuffName.Hash 11385244689469438460`)                                                 |
| description hash | `5455346547928607253`                                                                           |
| raw summary      | 击破拥有【坚防守备】的敌人时解除我方控制、恢复战技点并激活终结技；敌方受到的战技/终结技伤害提高 |
| params           | `[0.25,0.15]` → 25%、15%                                                                        |
| icon             | `SpriteOutput/BuffIcon/Inlevel/IconBuffCommon.png`                                              |
| binding          | `StrongChallengeEX_Environment_StageAbility_006`                                                |

它同时包含 enemy trigger 与 player benefit，presentation 可以标为 mixed audience，但 config ownership 是 encounter/stage。

### 6.2 Selectable groups: 终焉公理

`ChallengeBossGroupExtra` 没有独立 group rows，而是按 boss position 提供三个数组：

```json
{
  "GroupID": 3020,
  "BuffList1": [3111077, 3111078, 3111058],
  "BuffList2": [3111083, 3111065, 3111079],
  "BuffList3": [3111082, 3111081, 3111085]
}
```

- `BuffList1` 对应节点一 / boss position 1；
- `BuffList2` 对应节点二 / boss position 2；
- `BuffList3` 对应 tierce 节点 / boss position 3；
- option order 取数组顺序；
- 全部当前 arrays 都是 3 options；第三组只在存在 tierce 的近三期出现；
- 同一个 cycle 的四个 difficulty 共享这三组 options，但每个首领 slot 是独立 group。

PF 之后的 AS 玩法 TextMap 同样明确：“每个首领的挑战中”更新若干种终焉公理，“在首领挑战前，可以为每支队伍选择其中一种增益效果”（hash `7039255158974959772`）；UI title/hash 还包括 `11287258843568391506` → “选择增益效果装配进终焉公理”。

最新三个 groups 的全部 options：

| Slot | Order |        ID | Name     | Params → display                 | Binding   |
| ---: | ----: | --------: | -------- | -------------------------------- | --------- |
|    1 |     1 | `3111077` | 攻心扼吭 | `[0.1,0.05,4]` → 10%、5%、4 次   | `..._077` |
|    1 |     2 | `3111078` | 摧锋陷阵 | `[0.15]` → 15%                   | `..._078` |
|    1 |     3 | `3111058` | 附骨之疽 | `[1,0.4]` → 1 点、40%            | `..._058` |
|    2 |     1 | `3111083` | 以柔克刚 | `[0.15,3]` → 15%、3 笑点         | `..._083` |
|    2 |     2 | `3111065` | 攻无不克 | `[0.2]` → 20%                    | `..._065` |
|    2 |     3 | `3111079` | 聚气化神 | `[0.06,10]` → 6%、10 层          | `..._079` |
|    3 |     1 | `3111082` | 智圆行方 | `[0.25]` → 25%                   | `..._082` |
|    3 |     2 | `3111081` | 疾如旋踵 | `[1,0.25,3]` → 1 个、25%、3 回合 | `..._081` |
|    3 |     3 | `3111085` | 可乘之隙 | `[0.5,0.5]` → 50%、50%           | `..._085` |

所有记录均有 `BuffName`、`BuffDesc`、`ParamList`、`BuffIcon` 与 `InBattleBindingKey`。

### 6.3 Boss mechanics belong to concrete Monster

AS 有一条独立且重要的 player-visible guide chain：

```text
ChallengeBossMazeConfig.ID 30204
    → ChallengeBossMazeExtra.ID 30204
       ├─ MonsterID1 302401304
       ├─ MonsterID2 401401304
       └─ MonsterID3 300402104
           → MonsterGuideConfig.MonsterID
              ├─ TagList[] → MonsterGuideTag
              ├─ PhaseList[] → MonsterGuidePhase
              ├─ DifficultyGuideList[] → MonsterDifficultyGuide
              └─ TextGuideList[] → MonsterTextGuide
```

这不是 `MonsterTemplateID` 关系。`302401304` 是 AS difficulty-4 concrete variant，template 是 `3024013`。

Representative `MonsterID 302401304` “芒寒色正的银骑士”：

```text
MonsterGuideConfig.MonsterID = 302401304
Difficulty = 4
TagList = [100201, 100202, 100203, 100204]
PhaseList = [10021, 10022]
DifficultyGuideList = [10020, 10021, 10022]
TextGuideList = [10060, 10021]
```

代表性 player-visible records：

| Record                    | Text / parameters                                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `MonsterGuideTag 100201`  | `TagName.Hash 6984784887942297564` → 坚防守备；`TagBriefDescription.Hash 4167573754629665616`；params `[0.6,1.25,1]`；links `SkillID 100401410` |
| `MonsterTextGuide 10060`  | hash `165152559695036516` → 击破首领幻影后提高其受到的伤害，并使我方恢复战技点、行动提前                                                        |
| `MonsterTextGuide 10021`  | hash `9174313977508284926` → 优先消灭或击破召唤物以削弱首领幻影                                                                                 |
| `MonsterGuidePhase 10021` | 阶段一：攻防之势；description hash `8364229852576667624`；skills `[100211,100212]`                                                              |
| `MonsterGuidePhase 10022` | 阶段二：荣誉之战；description hash `13797339014755154816`；skills `[100221,100222]`                                                             |

`坚防守备` 的 description 使用前两个 params，display-ready 为 60% damage reduction 和破韧后 125% damage taken；第三参数没有 placeholder。`MonsterGuideTag` 没有 icon field，phase 的 `PhasePic` 在本例为空。

### 6.4 AS conclusions

- explicit stage modifier：`末法余烬`；
- explicit selectable modifier groups：每个 boss slot 的 `终焉公理` 三选一；
- explicit enemy-side / boss mechanics：concrete Monster guide graph，可能随 difficulty 和 phase 改变；
- Monster guide data 不应 flatten 到 stage fixed modifiers；
- 当前 Endgame pipeline 已能找到 concrete Monster，但尚未加载 `ChallengeBossMazeExtra` 或 MonsterGuide graph；
- AS 的 `StageAbilityConfig` 为空，不能拿它替代 `_BindingMazeBuff`；
- 普通 Monster ability/skill 仍属于 enemy domain，只有玩家需要的 AS guide projection 才应在 Endgame encounter 中引用。

## 7. AA

### 7.1 Group and encounter architecture

AA 不使用 challenge schedule/group/maze 三件套：

```text
ChallengePeakGroupConfig.ID 8 “尘世卷中”
    ├─ PreLevelIDList [801, 802, 803]
    └─ BossLevelID 804
       ├─ ChallengePeakConfig 804          // normal boss
       └─ ChallengePeakBossConfig 804      // hard boss + selectable buffs
```

### 7.2 Fixed tags / debuffs

`ChallengePeakConfig.TagList` 是 encounter-owned fixed list。Group 8：

| Encounter             | Fixed IDs                       | Names        |
| --------------------- | ------------------------------- | ------------ |
| `801` 骑士（一）      | `[3033023]`                     | 挑衅         |
| `802` 骑士（二）      | `[3033063,3033038]`             | 破势、失能   |
| `803` 骑士（三）      | `[3033058]`                     | 血嗜         |
| `804` 将杀王棋 normal | `[3033069,3033051]`             | 激怒、均衡   |
| `804` 将杀王棋 hard   | `HardTagList [3033070,3033052]` | 激怒+、均衡+ |

normal boss raw chain：

```text
ChallengePeakConfig.ID 804
    ├─ TagList [3033069, 3033051]
    └─ EventIDList [30508021]
        → StageConfig 30508021
```

hard boss raw chain：

```text
ChallengePeakBossConfig.ID 804
    ├─ HardTagList [3033070, 3033052]
    └─ HardEventIDList [30508022]
        → StageConfig 30508022
```

Representative tags：

|        ID | Name hash → name               |             Desc hash | Params → display                                  | Audience                              |
| --------: | ------------------------------ | --------------------: | ------------------------------------------------- | ------------------------------------- |
| `3033069` | `334272821856283626` → 激怒    | `7585721116390203860` | `[0.3,4]` → 每层敌人速度 +30%，4 层               | enemy benefit triggered by player ult |
| `3033051` | `6034648189662371874` → 均衡   | `9580294129565243665` | `[1,0.2,1,0.15]` → 最快 1 人 -20%，最慢 1 人 +15% | player mixed debuff/buff              |
| `3033070` | `16681287598539629265` → 激怒+ | `1996099317544595961` | `[0.5,4]` → 每层 +50%，4 层                       | hard enemy benefit                    |
| `3033052` | `8695876605042558386` → 均衡+  | `1911562055940525137` | `[2,0.2,1,0.15]` → 最快 2 人 -20%，最慢 1 人 +15% | hard player mixed                     |

`TagList` 有时包含多个 ID，且不存在选择 UI relation；这些是同时属于 encounter 的 fixed tags。不要根据描述中的正/负效果把它们拆成“仅 buff”或“仅 debuff”表。

### 7.3 Fixed battle event

AA stage 还通过 `_CreateBattleEvent` 挂载 battle-level 规则：

|                          Stage | `_CreateBattleEvent` | `BattleEventConfig` evidence                                      |
| -----------------------------: | -------------------: | ----------------------------------------------------------------- |
| knight stages `30508011/12/13` |              `30502` | “中盘在即”；召怪 + countdown；从第 3 轮起叠加最终伤害             |
|         boss normal `30508021` |              `30503` | “中盘在即”；相同两项 ability                                      |
|           boss hard `30508022` |              `30504` | 召怪 + countdown + hard boss screen effect；`DescrptionText` 为空 |

这是 concrete stage/battle ownership，与 `TagList` 不是同一 relation。

### 7.4 王棋三选一：裁决象限

真实 config：

```json
{
  "ID": 804,
  "BuffList": [3033066, 3033068, 3033067],
  "HardEventIDList": [30508022],
  "HardTagList": [3033070, 3033052]
}
```

完整 options：

| Order |        ID | Name hash → name                  |              Desc hash | Params → display                             | Icon                                     |
| ----: | --------: | --------------------------------- | ---------------------: | -------------------------------------------- | ---------------------------------------- |
|     1 | `3033066` | `15001982558288419463` → 领航誓言 |  `8716817855956121302` | `[0.5]` → 第一位角色战技/终结技抗性穿透 +50% | `IconChallengePeakBattlePlugins0016.png` |
|     2 | `3033068` | `15416898346825293541` → 落井下石 | `14543835869706011294` | `[0.15,2,3]` → 15%、2 回合、3 层             | `ActivityBattleBuff141.png`              |
|     3 | `3033067` | `1144961268741207686` → 狂欢不息  |  `1083179235023776380` | `[0.2,0.2]` → 全体 20%，欢愉额外 20%         | `IconChallengePeakBattlePlugins0011.png` |

每个 option 都直接是 MazeBuff，带 `InBattleBindingKey`，没有 separate effect ID。

### 7.5 Why AA explicitly means choose one

- `ChallengePeakBossConfig.BuffList` 在一个 boss record 中把 3 个 options 分组；
- AA 玩法规则 TextMap hash `7795447035405450900` 明确：“每个王棋挑战中”更新若干裁决象限，“在挑战王棋前，可以为队伍选择其中一种增益效果”；
- UI TextMap hash `9675546473830902444` 是“请选择一种增益效果”；
- hash `13650936777038848322` 是“选择增益效果装配进裁决象限”。

所以 config 表达的是：

```text
AA boss 804
    → one selectable group “裁决象限”
       ├─ option 3033066
       ├─ option 3033068
       └─ option 3033067
    → choose one
```

不是三个 active fixed buffs。`BuffList` 位于同时承载 hard fields 的 boss row，normal/hard 两个 encounter 又共享 `configId=804`；当前没有 alternate/simplified option representation。最保守的 normalized ownership 是 `boss config 804`，由两个 boss variants 引用同一 group。

## 8. Cross-mode comparison

| Concern                         | MoC                           | PF                                               | AS                                           | AA                                                          |
| ------------------------------- | ----------------------------- | ------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------- |
| fixed display records           | `MazeBuffID`                  | encounter `MazeBuffID` + cycle `SubMazeBuffList` | encounter `MazeBuffID` + stage binding       | `TagList` / `HardTagList` + battle event                    |
| selectable owner                | none                          | cycle `GroupExtra`                               | cycle + boss slot `GroupExtra`               | boss config                                                 |
| option field                    | —                             | `BuffList`                                       | `BuffList1/2/3`                              | `BuffList`                                                  |
| option records                  | MazeBuff                      | MazeBuff                                         | MazeBuff                                     | MazeBuff                                                    |
| select count stored numerically | —                             | no                                               | no                                           | no                                                          |
| selection semantics source      | —                             | PF gameplay/UI TextMap                           | AS gameplay TextMap                          | AA gameplay/UI TextMap                                      |
| enemy-specific guide            | generic enemy domain only     | generic enemy domain only                        | explicit concrete `MonsterGuideConfig` graph | no AA-specific guide relation found in ChallengePeak tables |
| multiple fixed records          | not in modern direct relation | yes, `SubMazeBuffList`                           | stage modifier + Monster guide features      | yes, TagLists + battle event                                |

## 9. Text and parameter resolution

### 9.1 Coverage audit

从以下 Endgame fields 收集了所有 referenced IDs：

```text
MazeBuffID
SubMazeBuffList
BuffList / BuffList1 / BuffList2 / BuffList3
TagList / HardTagList
```

审计结果：

- 318 个 distinct MazeBuff IDs；
- 318/318 均解析到恰好一条 MazeBuff row；
- 全部 referenced rows 均为单一 `Lv=1`，未发现引用到多级 rows；
- 318/318 均提供非空 `BuffIcon` path；
- 311/318 同时拥有可解析 name 与 description；
- 7 个缺本地化的记录全部是 PF Fever base IDs：`3031200`、`3031205`、`3031210`、`3031215`、`3031220`、`3031225`、`3031230`。

### 9.2 Reusable helpers

现有 `formatGameMarkup()` 足以把 `#1[i]%` 和 `ParamList[].Value=0.8` 解析为 `80%`，同时保留 safe markup 给 `GameText`。本批 modifier 文本主要出现：

- `#n[i]` / `#n[i]%`；
- `<color=#...>`；
- `<unbreak>`；
- `<u>`；
- escaped `\n`。

以上现有 helper/renderer 均支持。未来 resolver 应记录：

- raw template；
- raw params；
- formatted markup；
- missing/invalid placeholder diagnostics；
- unused trailing params 不作为错误，只作为 audit 信息。

不应直接在 Svelte component 中做参数插值，也不应把 TextMap hash 经过 JavaScript `number`。

## 10. Asset availability

`TurnBasedGameData` 的 MazeBuff rows 只提供 `SpriteOutput/...png` 路径，不包含实际图片文件。

本次对全部 Endgame modifier refs 得到 113 个 distinct `BuffIcon` paths，并按 exact basename 检查：

| Location              | Exact basename matches |
| --------------------- | ---------------------: |
| `../StarRailRes`      |              `0 / 113` |
| `HSR-Database/static` |              `0 / 113` |

因此当前状态是：

```text
config icon path exists
actual redistributable file in current StarRailRes: Not found
current website synced copy: Not found
```

下一阶段不能声称现有 selective sync 能直接复制这些文件。推荐：

1. model 保留 optional upstream icon path/provenance；
2. UI 必须支持 text-only fallback；
3. 只有在 StarRailRes 后续提供可按 path/ID 解析的真实素材后，才扩展 asset requirements 和 selective sync；
4. 不使用 StarRailRes index 文件猜测 MazeBuff data relation，也不按相似图标内容手工映射。

## 11. Recommended normalized architecture

不要建立 universal runtime Buff engine。建议共享 display record，但保留两类 presentation containers：

```ts
type EndgameModifierRecord = {
  id: number; // MazeBuff.ID or other explicit display-record ID
  name?: string;
  description?: string; // formatted GameText markup
  rawDescriptionHash?: string;
  params: DecimalString[];
  icon?: {
    upstreamPath: string;
    localUrl?: string;
  };
  effectBinding?: {
    kind: 'maze-buff-binding';
    key: string;
  };
};

type EndgameFixedModifierRef = {
  modifier: EndgameModifierRecord;
  scope: 'cycle' | 'encounter' | 'battle-slot' | 'stage' | 'enemy' | 'enemy-phase';
  audience?: 'player' | 'enemy' | 'mixed' | 'unknown';
  provenance: EndgameModifierProvenance;
};

type EndgameSelectableModifierGroup = {
  id: string; // derived stable owner key, not claimed as an upstream numeric ID
  title?: string;
  description?: string;
  selectCount: 1; // sourced from mode rule evidence
  scope: 'cycle' | 'battle-slot' | 'boss-encounter';
  options: EndgameModifierRecord[];
  provenance: EndgameModifierProvenance;
};
```

`provenance` 至少应保留 table、owner ID、field 和 array index。推荐 group IDs：

```text
pf:<GroupID>:BuffList
as:<GroupID>:BuffList1
as:<GroupID>:BuffList2
as:<GroupID>:BuffList3
aa:<BossLevelID>:BuffList
```

这些是 normalized stable keys，不应伪装成 upstream `groupId`。

AS MonsterGuide 不应强塞进 `EndgameModifierRecord`。建议作为 enemy occurrence 的可选 guide projection：

```ts
type EndgameEnemyGuide = {
  monsterId: number;
  tags: EnemyGuideTag[];
  phases: EnemyGuidePhase[];
  difficultyGuides: EnemyGuideText[];
  textGuides: EnemyGuideText[];
};
```

## 12. Recommended pipeline integration

最小接入点：

```text
existing raw mode group/encounter config
    ↓
NEW MazeBuff display index + formatter
    ↓
mode-specific explicit relation resolvers
    ↓
extend existing EndgameGroup / Encounter / BattleSlot / Stage
    ↓
existing endgame-view projection
    ↓
group detail UI
```

建议新增：

1. shared `MazeBuff` loader/index，要求 referenced ID 唯一解析；
2. shared display resolver：TextMap + `ParamList` + optional icon path + `InBattleBindingKey`；
3. MoC resolver：encounter `MazeBuffID`，group field只用于 dedupe/cycle summary 与一致性验证；
4. PF resolver：分别解析 encounter base、group fixed components、group selectable options；
5. AS resolver：encounter `MazeBuffID`、stage `_BindingMazeBuff` validation、每个 slot 的 selectable group；
6. AS enemy guide resolver：`ChallengeBossMazeExtra` → concrete MonsterGuide graph；
7. AA resolver：normal `TagList`、hard `HardTagList`、boss `BuffList`、可选 battle-event summary；
8. domain fields 挂在真实 owner：group/encounter/battle slot/stage/enemy occurrence；
9. view layer只做 presentation projection，不再访问 raw table。

现有 `EndgameStage.eventId/stageId`、`EndgameEncounter.configId`、`EndgameGroup.groupId` 和 battle `slot` 已足够作为 relation join context，无需更换现有主键。

## 13. Unsafe heuristics

明确不建议：

- 用 `MazeBuff.DisplayType === "Fixed"` 判断是否 fixed；selectable options 也满足；
- 把任意 `BuffList` flatten 成同时生效；
- 只读 group `MazeBuffID`，忽略 PF/AS encounter value；
- 根据 MazeBuff ID 前缀 `303/311` 推断 mode 或 ownership；
- 根据 `InBattleBindingKey` 字符串含 `FantasticStory` / `StrongChallenge` 决定 inclusion；
- 用名字含“增益/减益/易伤”分类 player/enemy ownership；
- 把 AS `MonsterGuideConfig` 的 concrete Monster relation提升为整个 cycle 的 fixed buff；
- 通过 `30147 ↔ 3030147` 数字后缀建立 runtime event relation；
- 因 options 的 `DisplayType=Fixed` 而将其标为 active；
- 根据 UI 排版推断 group scope；应使用 `GroupID`、`configId`、slot field 和 boss ID；
- 为缺本地化的 PF base row 自动借用相邻 ID 文本；应展示其 `SubMazeBuffList` components 或标为 unresolved；
- 按 icon basename/content 手工映射 StarRailRes 资源。

## 14. Validation / audit requirements

下一阶段建议新增：

- unresolved / duplicate MazeBuff ID；
- referenced MazeBuff 没有唯一 level row；
- group/encounter `MazeBuffID` 冲突而 resolver 未保留 provenance；
- AS encounter MazeBuff 与 stage `_BindingMazeBuff` 不一致；
- selectable owner 缺 `BuffList`、空 options、duplicate options、order 丢失；
- PF/AS/AA option count 不为当前预期 3 时发 warning，不 hard-fail future N；
- select count evidence 缺失；
- fixed list 被写进 selectable groups，或 selectable group 被 flatten；
- TextMap hash invalid/unresolved；
- placeholder 缺参数、参数非法、未使用参数数量异常；
- icon path 缺失、local asset unavailable；
- AS `ChallengeBossMazeExtra` 缺对应 `MonsterGuideConfig`；
- MonsterGuide concrete MonsterID 与 encounter spawned MonsterID 不一致；
- AA normal/hard TagList 错用；
- group derived key 冲突；
- mode-specific relation source 未记录。

## 15. Unknowns / unresolved questions

1. PF Fever base rows的 name/description hash 在当前 TextMap 缺失。它们可以作为 runtime binding provenance，但不能直接生成完整 display card。
2. PF/AS/AA relational tables均没有 numeric `selectCount`。PF/AA 的 one-of semantics由专属玩法 TextMap明确；AS 也由玩法规则“每支队伍选择其中一种”明确，但未来若要完全独立于 UI text，应继续寻找协议层 selection cardinality。
3. AA `ChallengePeakBossConfig.BuffList` 与 normal/hard 两个 variant 共用 ID 的配置形状很强，但没有 separate field 写明 “appliesToNormalAndHard”。应保留 boss-config provenance，不复制为两个假 upstream groups。
4. MazeBuff icon 的实际文件在当前 `StarRailRes` 未找到；本轮不能确认未来资源源。
5. 部分 MazeBuff/MonsterGuide params 多于 description placeholders。额外参数是 runtime evidence，不应展示或解释，除非后续能力配置明确说明。
6. `BattleEventConfig 30504` 没有 description，只有 ability names；可以显示为 provenance/audit，不应凭 ability 名生成玩家文案。
7. AA 未找到类似 AS `ChallengeBossMazeExtra → MonsterGuideConfig` 的 mode-owned enemy guide relation。普通 Monster skills仍应走现有 enemy domain。

## 16. Recommended next implementation phase

优先级建议：

1. 先实现 shared MazeBuff display resolver 与 provenance/audit；
2. 接入 MoC fixed、PF fixed components + selectable group、AS fixed + selectable groups、AA tags + selectable group；
3. 在同一阶段增加 parameter formatting tests，确保 percentage conversion 与 markup 保留；
4. AS MonsterGuide projection 作为独立子任务接入 concrete EnemyOccurrence，不阻塞基本 modifier cards；
5. UI 先支持无图标版本，等待可靠 asset source；
6. 最后增加 mode-specific group presentation，不设计 universal modifier engine。

## 17. Direct answers to the required questions

### 1. MoC 的固定 Buff 如何与 stage 关联？

玩家展示 relation 是 `ChallengeMazeConfig.MazeBuffID → MazeBuff.ID`；现代赛期 `ChallengeGroupConfig.MazeBuffID` 重复相同 cycle buff。实际 concrete stage 还通过 `_CreateBattleEvent → BattleEventConfig` 执行同义机制，但 MazeBuff 与 BattleEvent 之间没有 direct ID field，展示不应依赖后缀 heuristic。

### 2. PF 的荒腔走板结构是什么？

`ChallengeStoryGroupExtra.GroupID` owner 的 `BuffList[]`，数组项直接是 MazeBuff IDs，order 由数组保存；当前每组 3 项。fixed mechanics 位于单独的 `MazeBuffID` 和 `SubMazeBuffList`。

### 3. PF options 是 selectable group 吗？

是。关系字段把它们分在 `BuffList`，PF 专属 TextMap 明确“可选择 1 种”“每支队伍选择其中一种”。不是三项同时生效。

### 4. AS 有哪些显式玩家可见 modifier / mechanic？

encounter/stage fixed `末法余烬`、每个 boss slot 的 selectable `终焉公理`，以及 concrete Monster guide graph 中的首领 tags、difficulty changes、phases 和攻略提示。

### 5. AS mechanics 属于哪里？

`末法余烬` 属于 encounter/stage；`终焉公理` group 属于 cycle + boss slot；首领特性属于 concrete Monster，并可包含 enemy phase scope。

### 6. AA fixed debuff / special mechanic 来自哪里？

普通 encounter 的 `ChallengePeakConfig.TagList`、hard boss 的 `ChallengePeakBossConfig.HardTagList`，以及 concrete stage `_CreateBattleEvent → BattleEventConfig`。

### 7. AA 三选一如何表示？

`ChallengePeakBossConfig.ID 804.BuffList = [3033066,3033068,3033067]`，每项 direct resolve 到 MazeBuff display/effect record。

### 8. AA 是否明确 choose one？

是。AA 专属玩法 TextMap 明确“可以为队伍选择其中一种增益效果”，UI 文本为“请选择一种增益效果”。

### 9. 四模式可共享哪些 normalized fields？

可共享 `id/name/description/params/icon/effectBinding/provenance` 的 display record，以及显式 `scope/audience`。owner relation 和 mode-specific group placement 不应强行统一。

### 10. Fixed 与 selectable 是否应保持独立 presentation concepts？

应保持独立。它们可以复用 option/display record，但 container、scope、select count 和 UI semantics 不同。

### 11. 哪些能完整解析 name/description/params/icon？

MoC fixed、PF `SubMazeBuffList` components 和荒腔走板 options、AS 末法余烬和终焉公理 options、AA TagList/HardTagList 和裁决象限 options均完整提供 config icon path。PF 七个 Fever base IDs缺本地化；AS MonsterGuide records通常有文本/参数但没有 modifier icon；实际 icon 文件当前均未在 StarRailRes/site static 找到。

### 12. 下一轮最小新增内容？

一个 shared MazeBuff loader/display resolver、四个 mode-specific relation resolvers、AS concrete MonsterGuide resolver、少量 owner-correct domain fields、Text/parameter audits，以及可选 icon fallback。现有 Endgame parser、stage/battle/wave/enemy model与 routes均可保留并扩展。
