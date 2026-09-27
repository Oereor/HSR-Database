# HSR Voracity Effect Investigation

调查日期：2026-09-26。性质：只读数据逆向与架构审计；本次唯一交付为本文，不实施功能。

## 1. Executive Summary

**确认：TurnBasedGameData 明确记录了「贪饕」侵蚀／污染。它是关卡、内容和敌人出场上下文中的附加机制，不应永久乘进 MonsterTemplate 的基础 HP。**

本轮建立了 `Stage/content → InvasionID → 参数表、MazeBuff → Gluttony Ability → MCommon_Gluttony` 的配置关联，并找到了明确描述生命上限压制的 `MCommon_Gluttony_DirtyHp / MDF_AccumDirtyHPRatio`。但中间有两处不能伪装成完整运行时调用链：专用参数读取任务的实现未公开；两个核心 Gluttony modifier 的定义不在当前 dump 中。

主要发现：

1. 六张 Invasion 表、两档 Gluttony Ability、地图污染特效能力和饕噬状态在本地 **4.5 首次提交 `5d064ec9bd`（2026-08-26）** 一起出现。4.4 最后提交为 `b11066beac`。截至 `4ce30f69b3` 的后续七次 4.5 提交未改变所核查的核心记录。
2. `StageMonsterInvasionParam` 的两行确为 `[0.4, 0.2, 1, 1, 0.4]`、`[0.4, 0.4, 1, 1, 0.72]`。**定位五参数入口成功，逐参数数值含义尚未完整还原。**
3. 一个重要反证是：`MazeBuff 3034001/3034002` 自带参数分别为 `[0.4, 0.1, 1, 1, 0.2]`、`[0.4, 0.2, 1, 1, 0.35]`，与 Stage 参数不同，而且这种差异自首个 4.5 提交就存在。不能混用、相乘，或把 `0.35` 悄悄修正成 `0.36`。
4. `DBLDCKODNEN` 可确认关联 **MonsterConfig.MonsterID**，不是统一的 MonsterTemplateID。`LMEBOHHDIAG` 不符合 phase/bar 数量解释；更可能是该 MonsterID 连续出场时使用的污染选择序列，循环、初始下标及重置范围未知。
5. 官方文本描述的是**致命伤害后回复生命、通过伤害持续压制可回复生命上限**。现有数据不能把它等同为“额外独立血池受到两倍伤害”。`0.2/2=0.1` 等式与任务提供的观察值一致，但 **2 倍来源、Param2/Param5 的分支条件、跨阶段 HP 基准均未确认**。
6. HSR-Database 已有 `EndgameStage`、有序 `EnemyOccurrence`、HP 因子与运行时不确定性模型，适合接入；当前数据源清单不包含 Invasion 表，现有 enemy HP 管线也不会自动识别污染。

证据等级：**Confirmed**＝配置、源码或文本直接可见；**Strongly inferred**＝多条独立配置关系支持，但缺执行实现；**Plausible**＝弱推断／可行解释；**Unknown**＝证据不足。等级针对具体命题，而不是整份文件。

## 2. Investigation Scope

### 2.1 固定快照与边界

| 仓库 | 调查时 HEAD | 分支 | 初始 `git status --short` |
|---|---|---|---|
| HSR-Database | `036096f9bcfeee868deda3d9e6fc60cdfda743cf` | develop | 空 |
| TurnBasedGameData | `4ce30f69b32dc259ab9a8da3ba57035485103221` | main | 空 |
| StarRailRes | `d226befe3db13f2ec15f4161d5f34b1b607643fe` | master | 空 |

`HSR-Database/upstream.lock.json` 锁定的两个 upstream SHA 与上述本地快照一致。TurnBasedGameData 不是 shallow repository。共享父目录本身不是 Git 仓库；所有有效状态检查均对三个子仓库执行。

采用 `rg`、本地 `git log/show/diff/ls-tree` 和通过标准输入执行的 Python 只读脚本；未运行数据生成器、构建、测试或包安装。Python 解析 JSON 时保留整数精度，TextMap 查询以十进制字符串为键，避免 64 位 hash 经过 JavaScript `number`。

读取了 HSR-Database/AGENTS.md 与架构文档。所有文件写入仅限本报告目录。Git ownership 检查通过每次命令的 `-c safe.directory=<明确仓库路径>` 处理，没有修改 Git 全局或仓库配置，没有切换 upstream 分支。

### 2.2 证据范围

以本地 dump 和源码为主；补查官方 4.5 更新说明，只用于版本日期和机制定性。没有实机战斗录屏逐帧数据、内存采样、客户端反编译类实现或伤害流水。因此“算术吻合”不算独立实测验证。

全文路径索引见第 14 节；`T/` 表示 TurnBasedGameData，`H/` 表示 HSR-Database。行号对应上述 HEAD；历史结论按 commit 和 JSON 主键复核。

## 3. Version History

### 3.1 4.4 baseline

本地 4.4 最后提交：`b11066beac`，2026-08-17，标题 `OSPRODWin4.4.0_D16085003_A16085003_L16155460`。

该快照没有六张 `Stage*Invasion*.json`，没有 `MazeBuff 3034001/3034002`，没有两档 `ChallengePeakBattle_GluttonyAbility`，没有 `StatusID 66002001`，也没有两个 Invasion 全局常量。这里确认的是本仓库中的引入边界，不推断内部测试服更早是否存在同一机制。

### 3.2 4.5 introduction

紧随其后的首个 4.5 提交：`5d064ec9bd`，2026-08-26，标题 `OSPRODWin4.5.0_D16247584_A16214446_L16214083`。

`git diff --name-status b11066beac 5d064ec9bd -- 'ExcelOutput/Stage*Invasion*.json'` 给出六个 `A`：

| 新增表 | 当前记录数 | 用途 |
|---|---:|---|
| StageMonsterInvasionParam | 2 | 五项参数，按 InvasionID |
| StageInvasionBuff | 2 | MazeBuff 和描述映射 |
| StageInvasionConfig | 5 | 显式关卡与怪物选择配置，合计 12 个列表项 |
| StageInvasionMaterial | 3 | 三类刷取内容、六个 FarmType |
| StageInvasionMaterialWhite | 107 | MonsterID 清单，疑似刷取内容适用白名单 |
| StageInvasionNPCMonster | 3 | 地图 NPC 标记／实例映射 |

同一提交还新增两档 battle ability、地图特效 ability、`NpcMonsterInvasionCommonAbility`、`MonsterInvasionSeq`、MazeBuff 两条记录、饕噬状态，以及 StrongChallenge 计分 ability 的 Gluttony 标记分支。[E01–E10]

**值得注意：4.4 → 4.5 的 `Config/ConfigGlobalModifier` 差分只有 `GlobalModifier_Common_Specific.layout.json` 的三个 offset 调整，没有 modifier JSON 正文变更。** 当前可见全局 modifier 中也没有 Gluttony 定义。因此不能宣称已经从全局 modifier 文件还原核心运算。

[官方 4.5 更新说明](https://www.taptap.cn/moment/841375445998898274) 将版本更新列为 2026-08-26，且明确新增「贪饕」侵蚀，与本地边界一致。公告只确认机制定性，不给五项参数和两倍转换公式。

### 3.3 Later 4.5 changes

| 提交 | 日期 |
|---|---|
| `768daeb9d7` | 2026-08-26 |
| `443954672d` | 2026-08-26 |
| `687a47fff4` | 2026-08-27 |
| `014e33e240` | 2026-08-28 |
| `8cdb905dc2` | 2026-09-02 |
| `8dc7843723` | 2026-09-09 |
| `4ce30f69b3` | 2026-09-16 |

六张表的路径历史均只有首次引入提交；battle ability 和地图 ability 也没有后续修改。逐一读取全部八个 4.5 快照，MazeBuff 两行、StatusConfig 的饕噬行、两个 Invasion 全局常量完全一致。GameCoreConstValue 文件后来有其他改动，但上述字段未改。

此结论限于本地历史截至 2026-09-16；不包含未 dump 的服务器热更、客户端原生代码变化，也不外推 4.6。

## 4. Data Files

### 4.1 StageMonsterInvasionParam

| InvasionID | Param1 | Param2 | Param3 | Param4 | Param5 |
|---|---:|---:|---:|---:|---:|
| 1 | 0.4 | 0.2 | 1 | 1 | 0.4 |
| 2 | 0.4 | 0.4 | 1 | 1 | 0.72 |

`Param1` 是报告中的一基编号，JSON 数组索引为 0；后文保持这一约定。表中没有命名参数、单位或针对 phase 的条件。[E01]

### 4.2 StageInvasionConfig

当前五条均为 `InvasionID=2`，并不意味着全游戏只有二级污染；材料内容另有 ID 1 映射。

| StageID | 玩法入口及位置 | DBLDCKODNEN 与 LMEBOHHDIAG |
|---:|---|---|
| 30509012 | ChallengePeakConfig 902，异相仲裁 | 5013010: `[]`；5014010: `[]` |
| 420503 | ChallengeBossMazeConfig 30203，Group 3020，第 3 层上半 | 202206017: `[]`；202303203: `[]` |
| 420504 | ChallengeBossMazeConfig 30204，Group 3020，第 4 层上半 | 202206018: `[]`；202303204: `[]` |
| 30324032 | ChallengeStoryMazeConfig 20263，Group 2026，第 3 层下半 | 2032020: `[1,0,0]`；2002030: `[1,0]`；8012020: `[1,0,0]` |
| 30324042 | ChallengeStoryMazeConfig 20264，Group 2026，第 4 层下半 | 5012100: `[1,0,0]`；4062020: `[1,0]`；2012010: `[1,0,1,0,0]` |

玩法入口经 `EventIDList* → PlaneEvent.EventID → StageID` 关联；这五个 EventID 与 StageID 数值恰好相同，但未来实现应继续正规 join，不能据此建立 ID 恒等假设。[E02、E11]

污染列表不是 StageConfig.MonsterList 的复制。例如 420503 初始只有 Boss 202401603，而污染名单中的 202206017、202303203 在该 Boss 的 `SummonIDList` 中。故污染可以选择**入战后召唤的具体变体**，不能只给初始显示敌人加 badge。

### 4.3 StageInvasionBuff 与 MazeBuff

映射已确认：[E03]

| InvasionID | MazeBuffID | InvasionDesc.Hash（字符串） | InBattleBindingKey |
|---:|---:|---|---|
| 1 | 3034001 | `16261953196955435628` | ChallengePeakBattle_GluttonyAbility_LV1 |
| 2 | 3034002 | `11716047866460329419` | ChallengePeakBattle_GluttonyAbility_LV2 |

两行 MazeBuff 都是 `MazeBuffType=Level`，`InBattleBindingType=StageAbilityBeforeCharacterBorn`，`ModifierName=ADV_StageAbility_MazeCommon_Empty`。战斗逻辑由 binding key 指向，不在这个 Empty 冒险 modifier 名称里。

两条 `InvasionDesc` 均可在 CHS/EN TextMap 精确解析。中文第一条为：

> 被污染的怪物获得了「贪饕」的力量，受到致命伤害后不会被消灭，而是立即回复一定比例的生命值。\n对其造成伤害可不断压制其生命上限，压制到一定比例后，可将敌人彻底消灭。

第二条把“致命伤害”写为“致命攻击”，没有给出不同数值。两个 MazeBuff 自身的 `BuffName.Hash` 分别是 `5917686133654562776`、`5638453568388136063`，`BuffDesc/BuffDescBattle.Hash` 同为 `13013349132478528449`；**这些键在当前 CHS 和 EN TextMap 中均未命中**。不能凭空补写成原文“污染一级／二级”；展示应优先用可解析的 InvasionDesc，并区分项目自写标签。

参数差异必须保留：

| 档位 | StageMonsterInvasionParam | MazeBuff.ParamList |
|---|---|---|
| 1 | `[0.4,0.2,1,1,0.4]` | `[0.4,0.1,1,1,0.2]` |
| 2 | `[0.4,0.4,1,1,0.72]` | `[0.4,0.2,1,1,0.35]` |

专用 reader 很可能按敌人上下文覆盖参数，见第 5 节；但缺 reader 实现时，不能把 MazeBuff 列称为“已证实废弃默认值”。也不能用 `0.72/0.35` 反推倍率，二者来源不同。

### 4.4 StageInvasionMaterial 与新增发现的 MaterialWhite

`MaterialType=1 → COCOON3 / COCOON_AVATAR_EXP / COCOON_COIN / COCOON_EQUIPMENT_EXP`；`2 → RELIC`；`3 → ELEMENT`。三行均映射 `InvasionID=1`。[E04]

Confirmed：这是内容类型到档位的独立映射，结构不同于显式 StageID 表。Strongly inferred：刷取类内容可走通用规则，和显式挑战关卡规则并行。**“进入这些玩法就让每个敌人、每次出场全部污染”并未证实。**

`StageInvasionMaterialWhite` 有 107 个互不重复的 MonsterID，全部能 join 到 MonsterConfig；其行没有其他条件。文件名及范围支持“适用白名单”解释，但调用点未见，仍标为 Strongly inferred。不能据此判定检查的是实例 ID 还是会先归一到模板 ID，也不知道难度、世界等级、随机选择等额外条件。农本自动套用的准确粒度必须与这张表及 `MonsterInvasionSeq` 一起继续验证。

### 4.5 StageInvasionNPCMonster

三行的 `ID=2054131/2054132/2054133`，均为 `InvasionID=2`、`PlaneID=20541`、`FloorID=20541001`、`GroupID=261`，`InstanceID` 分别为 200001/200002/200003。[E05]

`NPCMonsterMark` 中相同三个 ID 的 GroupID/InstanceID 完全相符。因此 **ID 是 NPCMonsterMark 的标记 ID**，不是战斗 MonsterID；它将污染档位关联到世界中的具体实体位置。它支持地图状态／外观和入战上下文的选择，但不能只归类为一份纯特效清单。

精确 ID 2054131 全仓 JSON 搜索只命中上述两张 Excel 表。当前 dump 未找到 `P20541/F20541001/G261` 对应的 RuntimeGroup 或 SharedRuntimeGroup 实体文件；RuntimeFloor 和 FloorCrossMapBriefInfo 也未给出这个精确 GroupID 关联。因此本轮不能继续证明这三个实体的战斗 StageID。地图中其他 Tantao 特效实例不作为该三行的替代证据。

### 4.6 GameCoreConstValue

`NpcMonsterInvasionCommonAbility=MazeMonster_CommonAbility_Gluttony_Effect`。该 ability 的 `OnStart` 只有两次 `RPG.GameCore.TriggerEffect`，分别挂 `Eff_Buff_Common_Tantao_Loop.prefab`、`Eff_Buff_Common_Tantao_Trail01.prefab`，没有 HP 写入、伤害或死亡操作。[E06]

因此**可见 ability 正文是地图视觉表现**；不能由此推断调用它的整个 NPC 系统没有逻辑，也不能用这些 prefab 计算战斗污染。

`MonsterInvasionSeq=["10010","00101","10100","00100"]`，每项五位。全仓只有常量定义，没有可见消费者。二进制形态及其与 Invasion 常量的邻接支持“选怪／出场分配模式”的 Plausible 解释；不足以确认随机权重、排列方向、5 个槽位，或与 `LMEBOHHDIAG` 的优先级。**没有证据将它命名为 phase 序列或灰血显示序列。**

### 4.7 Gluttony abilities、状态与计分

两档 ability 在 `BattleEventAbility_ChallengePeakBattle.json` 的 `AbilityList` 中。`.layout.json` 给出相同 UniqueName，offset 分别 91166、91719；layout 只证明资源定位，不包含参数运算。[E07]

`StatusConfig 66002001` 是额外的强证据：[E08]

| 字段 | 值 |
|---|---|
| ModifierName | `MCommon_Gluttony_DirtyHp` |
| StatusName | 饕噬，hash `17473651224413707329` |
| StatusType | Debuff |
| ReadParamList | `MDF_AccumDirtyHPRatio` |
| StatusDesc | 可回复的生命上限降低 `#1[f1]%`，hash `577611588007700484` |

这确认存在一个可显示的**累计可回复生命上限降低比例**读数；没有确认它与 P2/P5、累计伤害的数学关系。

`GlobalTaskListTemplate_StageUI` 通过混淆判定 `JCBAIKOADID` 和任务 `NGCOKAIKPHC`，解锁 `TantaoInvasion` 教学；`TutorialGuideGroup 10501 → TutorialGuideData 1050101/1050102` 的文本再次描述复生与上限压制。混淆判定的精确语义未知。[E09]

`StrongChallenge_Scoring_Ability.json` 在一个计分回调中先读取 Boss 总／剩余 HP；若 LevelEntity 含 `MCommon_GluttonyTrigger_Mark`，则将 `CurrentBossLeftHP` 置 0，否则走 `SetDynamicValueByBossLeftHP`。**污染已接入计分路径，不只是血条显示**；这里的“剩余 HP=0”是计分变量赋值，不能当作战斗实体真正死亡或灰血公式。[E10]

`Monster_W5_Pam_00_Config` 中的 Rebirth/Hit/Ground/Loop 特效适配，以及 GameCoreUISetting 的 `StageInvasion` 颜色，均为视觉侧佐证，不提供伤害转换系数。

## 5. End-to-End Data Flow

```text
显式 StageID ── StageInvasionConfig ── 怪物实例 ID + 原始选择数组 ─┐
FarmType ── StageInvasionMaterial ── ID 1 ─────────────────────┼─ Invasion 上下文
NPC 标记 ── StageInvasionNPCMonster ── ID 2 ──────────────────┘
            [三路的运行时优先级、合并方式尚未公开]
                       │
          ┌────────────┴──────────────────────┐
          ▼                                   ▼
StageInvasionBuff                     StageMonsterInvasionParam
  └ MazeBuff 3034001/2                     └ 五项参数
      └ InBattleBindingKey                    │
          └ GluttonyAbility_LV1/2              │
              └ OnListenCharacterCreate       │
                  └ DNILHDGHLGL(ParamEntity)   │
                      └ IJJGPIPMNAE × 5 ◀─────┘ 强推断，reader 实现缺失
                          └ MDF_Param1…5
                              └ AddModifier(MCommon_Gluttony_LV1/2)
                                  ╳ 核心 modifier 正文缺失
                                  ? 复生、累计上限压制、phase 分支
                                  ? 本次实际所需伤害 / 等效 HP

旁证：MCommon_Gluttony_DirtyHp → MDF_AccumDirtyHPRatio → 饕噬描述
旁证：MCommon_GluttonyTrigger_Mark → StrongChallenge 计分特殊处理
```

可见执行顺序：ability 的 `OnAdd` 给 Caster 加监听 modifier；监听 `OnListenCharacterCreate`；通过混淆 predicate 后，为 `ParamEntity` 读取五个编号，再给同一实体添加 Gluttony modifier。这里未看见普通 `TargetAllEnemy` 判定；“它会正确筛选被污染敌人”由上下文强推断，不能说 predicate 已经反编译成“敌方且污染”。

读取任务的字段可直接记录：[E07]

| MDF 名称 | IJJGPIPMNAE.DKJFDABPLCO.FixedValue.Value | 动态表达式 hash |
|---|---:|---:|
| MDF_Param1 | 0 | 823197964 |
| MDF_Param2 | 1 | 419913437 |
| MDF_Param3 | 2 | 1985997378 |
| MDF_Param4 | 3 | 1582712851 |
| MDF_Param5 | 4 | -1146170504 |

任务的 `FHLJGDGMMHK` 是 MDF 名称，`OLPAJJAEEHH` 指向 ParamEntity。AddModifier.DynamicValues 的每个表达式都是 `OpCodes=AQAR`、空 FixedValues、一个上述 hash。**这一层是五值传递，没有显式乘 2、除 2、phase 判断或生命写入。**

这里索引 0–4 与 Stage 五参长度一致，任务又要求具体实体，构成“读取该实体 Invasion 参数”的 Strongly inferred 证据；但 JSON 没有直接写表名，不能把 reader 内部查表、默认回退或参数覆盖顺序写成 Confirmed。hash 只是动态变量引用，重复搜索它不会自动恢复生命语义。

## 6. Param1–Param5 Investigation

| 参数 | 两档值 | 已确认部分 | 数值语义及等级 |
|---|---|---|---|
| Param1 | 0.4 / 0.4 | 对应读取索引 0 与 MDF_Param1 | **Unknown**。文本存在复生，因此“每次回复 40%”是 Plausible 假设；也可能参与阈值，未见赋值点，不能正式命名为复生比例。 |
| Param2 | 0.2 / 0.4 | 对应索引 1，两档随强度变化 | **Plausible**：普通／单血条对象的污染预算或相关阈值。与题述 +10%/+20% 满足除 2 关系，但既未证明是 raw HP，也未证明所用 HP 基数。 |
| Param3 | 1 / 1 | 对应索引 2 | **Unknown**：可能是某种系数或开关；没有消费者，不能断言伤害倍率、回复倍率或普通伤害通道。 |
| Param4 | 1 / 1 | 对应索引 3 | **Unknown**：同上；也不能因为两个参数都是 1 就认定它们相加形成 2。 |
| Param5 | 0.4 / 0.72 | 对应索引 4，同档高于 Param2 | **Plausible**：另一类／多血条对象的污染预算或相关阈值。与题述 +20%/+36% 算术吻合，缺分支和消费者证据。 |

五项的原始数值与读入槽位是 Confirmed；“槽位来自 StageMonsterInvasionParam”是 Strongly inferred；**没有任何一项的 HP 运算语义达到 Confirmed**。只有两档、五个槽位的有限样本不足以反推唯一函数。

当前 dump 搜索范围包含全仓 JSON、所有 ConfigGlobalModifier 正文及 layout、battle/adventure ability、Character、GlobalConfig、Excel 和 TextMap。`MCommon_Gluttony_LV1/LV2` 只有 AddModifier 引用；DirtyHp 只有 StatusConfig 引用；Trigger_Mark 只有计分引用。没有可供展开的定义或客户端类实现。相邻 `MCommon_Endurance`、`MCommon_GM_Revive` 也没有连到 Gluttony，不能移植它们的逻辑填补空白。

## 7. MonsterInvasionList Obfuscated Fields

### 7.1 DBLDCKODNEN → MonsterID

**Confirmed（引用对象层面）**：全部 12 项均命中 MonsterConfig.MonsterID。区分 ID 域的决定性例子如下：

| 字段值 | MonsterConfig.MonsterTemplateID | 所属污染 Stage | 上游来源 |
|---:|---:|---:|---|
| 202206017 | 2022060 | 420503 | Boss 202401603 的 SummonIDList |
| 202303203 | 2023032 | 420503 | 同上 |
| 202206018 | 2022060 | 420504 | Boss 202401604 的 SummonIDList |
| 202303204 | 2023032 | 420504 | 同上 |
| 5013010 | 5013010 | 30509012 | 第一波出怪 |
| 5014010 | 5014010 | 30509012 | 第二波出怪 |

例如 202206017 的 HPModifyRatio=2.727273，202206018=4.545455，模板 HPBase 同为 204.6。按模板去重会丢失真实变体及关卡参数。

其他表 `RogueTournCocoonConfig.DisplayMonsterMap`、`RogueMagicArea` 也复用 DBLDCKODNEN，支持“怪物 ID”解释；不同混淆类重用同名字段只能作旁证，主要证明仍是上述精确 ID join。没有证据支持它是 WaveID、InstanceID、部件 ID。

### 7.2 LMEBOHHDIAG → 原始污染选择数组

最有区分力的反例：[E02、E11]

| MonsterID | 数组 | Character 的 MaxMonsterPhase | 对应出怪上下文 |
|---:|---|---|---|
| 2032020 | `[1,0,0]` | 未配置 | 303240321 中多次出现 |
| 2002030 | `[1,0]` | 未配置 | 同波中多次出现 |
| 8012020 | `[1,0,0]` | 未配置 | 303240322 中多次出现 |
| 5012100 | `[1,0,0]` | 未配置 | 303240421 和 303240423 均多次出现 |
| 4062020 | `[1,0]` | 未配置 | 303240421 中多次出现 |
| 2012010 | `[1,0,1,0,0]` | 未配置 | 303240422 中多次出现 |
| 5014010 | `[]` | 2；PhaseList=[1,2] | 305090122，单个 Boss |

这些小怪也没有召唤列表。数组长度既不等于血条数，也不等于总出怪数；同一波内不同小怪长度还不同。故“每项控制一个 phase/bar/body”缺乏支持，尤其不能把数组长度直接写入 UI 的阶段数。

**Strongly inferred**：数组用于按怪物出场序列选择污染；**Plausible**：1 表示开启、0 表示关闭，按重复模式循环；**Unknown**：是循环还是有限前缀、首次是否从 0 开始、是否按怪种累计、跨 wave 是否清零、召唤是否计数、`[]` 是全部适用还是默认策略。

若只是为了提出实验，可以尝试 `[1,0]` 对应同 ID 的第 1、3、5 次出场，[1,0,1,0,0] 对应每五次的第 1、3 次；**这些只是待检验预测，不是本轮解码结果**。5012100 跨两波出现，是验证计数器重置范围的好样本。

## 8. HP Mechanics

### 8.1 Base HP 与关卡 HP

比较 4.4 baseline → 4.5 first，以及 baseline → 当前 HEAD：

| 表 | baseline / 当前记录数 | 两端共有 ID 的关键 HP 字段变化 |
|---|---:|---|
| MonsterTemplateConfig | 613 / 628 | HPBase：0 项 |
| MonsterConfig | 2591 / 2649 | HPModifyRatio：0 项 |
| MonsterTemplateUniqueConfig | 29 / 29 | HPBase：0 项 |
| MonsterUniqueConfig | 35 / 35 | HPModifyRatio：0 项 |

上述表未发现 Invasion/Gluttony/DirtyHp 命名字段。新增怪物正常有自己的基础属性；“共有 ID 无变更”不意味着新增记录没有 HP，也不宣称整个战斗平衡从未变化。

证据共同支持 **Stage/content 层运行时附加机制**：选中具体 Stage 和变体、复用同一模板、Ability 在角色创建时施加 modifier、模板属性没有同步乘倍率。将污染写入 MonsterTemplate 会误伤未污染关卡及同模板其他变体。[E01–E07、E12]

当前 HSR-Database Endgame 的每管基础遭遇 HP 公式为：

```text
B = MonsterTemplate.HPBase
    × MonsterConfig.HPModifyRatio
    × HardLevelGroup[stage.HardLevelGroup, stage.Level].HPRatio
    × contextualEliteGroup.HPRatio
```

固定波使用 stage EliteGroup；连续出怪使用出怪 group EliteGroup；相应玩法选择 EliteGroup 或 InfiniteEliteGroup。缺上下文时退回怪物 EliteGroup，并标 inferred。PF 再经过自己的 wave HP modifier 和取整流程，不能将模板 B 直接作为所有污染计算的基准。[H02–H04]

敌人详情的通用 stat helper 另支持 `((base × instanceRatio) + instanceValue) × levelRatio × eliteRatio`，HP 调用会传 HPModifyValue；Endgame 的专门 HP 路径当前只做四项乘积。当前所查原表没有 HPModifyValue，这不是已证实的当前数据 bug，但未来加入新字段时应统一核查，不能顺手改代码。

### 8.2 Pollution HP、displayed HP 与所需伤害

| 名称 | 本报告定义 | 当前可否确定 |
|---|---|---|
| base HP | 模板 HPBase，或明确标注的未污染遭遇 HP | 可从配置／现有管线算；二者必须区分 |
| phase HP | 某阶段实际使用的未污染生命基数 | 普通情况可估；多阶段覆写不一定相同 |
| raw pollution HP | 假设存在的污染预算，以 HP 单位表达 | 未找到对应存储变量和初始化公式，暂不可确认 |
| displayed HP | 实机当前生命、可回复上限及条形 UI 的显示 | 文本与状态证明可回复上限概念；完整 UI 数值关系未知 |
| effective additional HP | 相同伤害结算口径下，污染多要求的有效伤害 | 需要机制或受控实测，不能直接等同 raw pollution HP |
| damage required to kill | 特定攻击序列最终消灭目标需要的结算伤害 | 会受致死段溢出、复生、转阶段、锁血、回血等影响 |

“灰色额外生命”可以是玩家体验描述，但当前文本强调的是**不能回复的上限份额／压制**。没有证据支持把灰色 UI 区域简单当作一次性外接 HP 条。

### 8.3 Damage / suppression behavior

Confirmed：致命伤害不立即消灭、立即回复部分生命；继续伤害压制生命上限；压到某比例后可彻底消灭；饕噬读出累计可回复生命上限降低比例。

Unknown：压制是否在第一次致命前就累计、复生次数、回复基数、压制阈值、伤害事件顺序、每 hit 上限、溢出如何传递，以及常规伤害、击破、DOT、直接 HP 操作是否相同。

本地配置中没有定位到 Gluttony 路径上的 `×2` 或 `/2`。五参传递表达式没有该常量；P3=P4=1 也不是 `1+1` 被执行的证据。以下三类模型都不能仅凭最终百分比区别：

1. 对独立污染预算以 2 倍扣除；
2. 普通生命扣除与生命上限压制同步起作用，形成近似两倍“进度”；
3. 复生和死亡阈值共同作用，使额外所需伤害恰好约为某参数的一半。

文本更支持“复生＋上限压制”的机制类别，但不能判定其精确数学实现。`MCommon_Gluttony_DirtyHp` 与 `Trigger_Mark` 是重要后续反编译锚点。

### 8.4 Effective HP formula：只给条件模型

设 `H_j` 为第 j 阶段在非污染关卡修正后使用的生命基数；设 `B_ref` 为污染实际采用的参考 HP；设 `p` 是最终生效的污染参数；设 `c` 是将同口径伤害转成污染预算削减的系数。

只有验证“线性污染预算”的前提后，才可用：

```text
R = B_ref × p                         # 假设的 raw pollution budget
ΔH_eff = R / c                        # 假设的等效额外 HP
H_eff = Σ H_j + Σ applicable ΔH_eff,j  # 或一个全体阶段共享的额外预算
```

这不是本轮已证实的引擎公式。若 `c=2` 且 `B_ref=H_j`，才能在相应阶段写 `H_j × (1+p/2)`；如果还有死亡阈值／初始压制，应使用实际待消耗预算，不能直接 R/c。

**多血条的分母问题尤其重要。** 假设两管各 H，仅最后一管额外挂 `0.72H`、c=2，则相对整场 `2H` 的增量为 `0.36H/(2H)=18%`；只有两管各自都加 `0.36H`，或原始预算基于 `2H`，整场才是 +36%。题述“多血条 +36%”并不能单独告诉我们污染在每阶段还是最后阶段触发。

所以上线前不能直接套 `phaseCount × H × 1.36`，也不能把 phaseCount 无条件视为独立血条相乘。

### 8.5 Single-phase vs multi-phase

目前最直接的阶段数据在 `MonsterTemplate.JsonConfig → ConfigCharacter.MaxMonsterPhase / PhaseList`，而不是 MonsterTemplate 本身一个统一的 HP-bar 数字段。5014010 为 2，匹配多阶段敌人的结构；污染名单中的一般小怪未配置该字段。

但 Gluttony 调用层没有读取 MaxMonsterPhase、Rank 或 PhaseList 的可见条件。因此以下候选不能定案：MaxMonsterPhase>1、运行时剩余阶段数、重生标记、Boss 分类、某种生命条组件属性。Character ParentConfigPath 继承也需要处理，不能把直接文件未写字段一律当作强证明的单阶段。

`LMEBOHHDIAG` 不支持血条判定，`MonsterTemplate.StanceCount` 则是韧性条相关字段，尤其不能误当生命条。是否 `Param2=单血条、Param5=多血条` 保持 Plausible。

## 9. Cross-check Against Known In-game Values

### 9.1 与任务提供的观察值比较

| 档位／题述类型 | 候选参数 | 假设 c=2 的额外比例 | 任务给定观察 | 结论 |
|---|---:|---:|---:|---|
| 一级单血条 | P2=0.20 | 10% | 10% | 算术相符，非独立实测 |
| 一级多血条 | P5=0.40 | 20% | 20% | 算术相符，HP 分母未知 |
| 二级单血条 | P2=0.40 | 20% | 20% | 算术相符，非独立实测 |
| 二级多血条 | P5=0.72 | 36% | 36% | 算术相符，跨阶段应用未知 |

反过来用这些观察算 c，四行都得到 2，但这是把观察和参数配对后的**拟合**，不是“发现引擎中有两倍倍率”。如果改用 MazeBuff 参数并同样除 2，将得到 5%、10%、10%、17.5%，不能复现这张表；若直接将 MazeBuff 参数当等效比例，前三项吻合，最后为 35% 而非 36%。这进一步要求先证实 reader 的参数来源。

### 9.2 使用真实配置的条件算例

异相仲裁 Stage 30509012 第一波 MonsterID 5013010：HPBase=1674、HPModifyRatio=1、HardLevelGroup 3/Level 95 的 HPRatio=375.4385、InfiniteEliteGroup 367 的 HPRatio=7.2。

```text
B = 1674 × 1 × 375.4385 × 7.2 = 4,525,085.1528
若 P2=0.4、B_ref=B、c=2：
R = 1,810,034.06112
ΔH_eff = 905,017.03056
H_eff = 5,430,102.18336
```

第一行是现有网站管线的十进制配置值；后三行只是条件演算，不是实机 HP 读数，也不保证客户端浮点与显示取整完全一致。该例可用作后续受控测量的目标。

### 9.3 外部交叉验证的限度

官方更新说明与本地教程共同支持“复生＋上限压制”，未提供任何百分比或两倍系数。检索还发现涉及“三级污染”的社区帖子，超出当前两行参数表覆盖范围，本报告不把其中的伤害类别差异外推到本地 4.5 两档，也未将二手攻略作为参数定义证据。

建议实测至少覆盖：同一怪物污染／不污染对照；一级／二级单阶段；二级两阶段逐阶段记录；小额多段与大额致死段；`[1,0]` 和 `[1,0,1,0,0]` 的连续出场；5012100 的跨 wave 计数。记录每段结算伤害、当前 HP、可回复上限、饕噬比例、复生时刻与最终死亡，才能分开确认预算、压制率和溢出处理。

## 10. Existing HSR-Database Architecture

### 10.1 解析与来源

`scripts/data/source-requirements.ts` 是现有数据源清单；Enemy domain 从 MonsterTemplateConfig 和 MonsterConfig 建索引，以 MonsterID==MonsterTemplateID 的 canonical 配置构造模板入口，再保留变体。Unique 两张表不在本次观察到的普通 Enemy/Endgame 读取清单中；不能因为命名为 Unique 就把它们看作污染覆盖层。[H01、H05]

数据走 pinned upstream → locale-neutral domain → 各语言 projection → generated views／Endgame occurrence shards → server loaders／UI。TextMap 使用 `scripts/data/localization.ts` 的共享 resolver；未来 InvasionDesc 应沿用这个路径，缺失 MazeBuff 文本保留 missing diagnostics。

当前源清单没有六张 Invasion 表，也没有 GlobalConfig 或 ConfigGlobalModifier。动态 Config 目录只列 Monster Character、Monster Ability、`Config/ConfigAbility/BattleEvent/`。**Gluttony 文件是 `Config/ConfigAbility/BattleEventAbility_ChallengePeakBattle.json`，并不在最后这个子目录内。** 若未来生产数据处理需要读取该文件，应显式加入要求；不能因本地全仓存在就假定 sparse checkout 一定有它。

### 10.2 HP、phase 与上下文

`scripts/data/endgame.ts:1066` 起计算 HP 因子，`pure-fiction-hp.ts` 独立处理 PF wave 参数：当前识别 `FantasticStory_Wave_Ability_0001`，用零基参数 1 得到 `1+hpAddedRatio`，HardLevel ratio 经 f32 处理，首领截断、普通敌人 half-up。[H02–H04]

`scanMechanics` 读取 Character.MaxMonsterPhase，并扫描 companion ability 中共享血量、锁血、SetHP 等操作。它按 template 缓存结果，适合模板固有能力，**不适合把关卡污染写进该缓存**。

Enemy 的 `skillPhases` 由 MonsterSkillConfig.PhaseList 组织技能，是技能展示分组；Endgame 的 `phaseCount` 来自 Character.MaxMonsterPhase；`toughness.barCount` 来自 StanceCount。三者不能互换。[H05]

EnemyMechanics 已有 `effectiveTotalHpStatus=static/inferred/runtime-unclear`。多阶段、召唤、共享血量、恢复／锁血或 external mechanics 会使总 HP 不确定；当前未实现基于 Invasion 的判定。UI 的 `formatHpWithPhases` 仅显示 `hp × phaseCount`，并不是已解出所有阶段和污染之后的击杀伤害。[H06]

### 10.3 Endgame occurrence 模型

固定波：StageConfig.MonsterList → FixedWave.enemies。连续出怪：`_StageInfiniteGroup → StageInfiniteGroup.WaveIDList → StageInfiniteWaveConfig.MonsterGroupIDList → StageInfiniteMonsterGroup.MonsterList → orderedEnemies`。[H02]

已有 occurrenceId 编码 mode/group/encounter/stage/wave 或 spawn group/position/monster，适合追加出场污染状态。`EndgameStage` 可容纳规则来源，`EnemyOccurrence` 可容纳该次生效结果，`SpawnWave.pureFictionMechanic` 则是已有 wave 层 modifier 的先例。[H07]

当前 `occurrenceIdentity` 和 `uniqueSpawnOccurrences` 会按属性／机制合并展示；未来必须把污染档位、选择状态、参数来源加入等价性判断，否则同一种怪的污染和不污染出场会合并。[H06]

### 10.4 Potential issue / future work（仅记录）

- 当前污染表未读取，`hp.final.maxHpPerBar` 只能解释为已支持修正后的普通每管 HP；不能让用户误读成污染后击杀预算。
- 只扫 Monster companion ability 会漏掉通过 StageInvasionBuff 施加的系统 modifier；即使 `stageAbilities=[]` 也可能污染，当前 external-mechanics 布尔条件不足以捕捉它。
- 末日幻影污染目标可能是 Boss 的召唤物；主 Boss 卡片不代表污染完整适用范围。
- phaseCount 的简单显示、父 Character 配置继承、HPModifyValue 的两条计算路径差异应在未来验证，不在本轮修复。

## 11. Recommended Future Integration

### 11.1 数据抓取层

| 来源 | Endgame 必需性 | 用途 |
|---|---|---|
| StageInvasionConfig | 必需 | 精确 Stage、MonsterID、原始选择数组 |
| StageMonsterInvasionParam | 必需 | 原始五参数，保留顺序和精度 |
| StageInvasionBuff + MazeBuff | 必需 | 档位绑定、描述、ability 名、两组参数差异 |
| 对应 pinned TextMap | 必需 | InvasionDesc；按现有语言投影处理 |
| Stage/PlaneEvent/Monster/Infinite 表 | 已有且必需 | 变体、召唤、有序出场与 HP 上下文 |
| StageInvasionMaterial + MaterialWhite | 仅扩展刷取内容时必需 | 内容选择规则；不要为 Endgame 顺带恢复材料业务 |
| StageInvasionNPCMonster + NPCMonsterMark | 地图功能／来源审计辅助 | 地图实体 join；不是 Endgame HP 主来源 |
| GameCoreConstValue、Battle Ability、StatusConfig、教程 | 审计辅助；使用哪项就声明哪项 | 机制、参数入口、UI 文本与诊断 |
| 缺失 modifier／reader 实现 | 精确 HP 公式的必要后续证据 | 确定分支、系数、死亡与阶段语义 |

数据抓取只生成小规模规范化结果，不向浏览器打包完整原始配置。将新表纳入 source registry、快照摘要、schema 与缺失引用诊断时，应同步检查 sparse checkout；本轮未做这些修改。

### 11.2 概念模型（仅设计稿）

```ts
type VoracityRule = {
  invasionId: number;              // 不把可扩展的 ID 域永久限制为 1 | 2
  sourceCommit: string;
  source: 'stage' | 'material' | 'npc';
  stageId?: number;
  mazeBuffId: number;
  bindingAbility?: string;
  rawStageParams: string[];        // 十进制字符串，当前恰好 5 项
  rawMazeBuffParams: string[];     // 分开保存，禁止混用
  descriptionHash: string;
  selectors: Array<{
    monsterId: number;
    rawSelection: number[];        // 原 LMEBOHHDIAG；不是 phaseMask
    interpretation: 'unresolved' | 'verified-occurrence-rule';
  }>;
};

type VoracityOccurrence = {
  ruleRef: string;
  eligibility: 'confirmed' | 'inferred' | 'unknown';
  application: 'applied' | 'not-applied' | 'unknown';
  parameterSource: 'stage-reader-verified' | 'unresolved';
  hp: {
    status: 'unresolved' | 'estimated' | 'verified';
    modelVersion?: string;
    referenceHp?: string;
    rawPollutionHp?: string;
    effectiveAdditionalHp?: string;
    effectiveTotalHp?: string;
    assumptions: string[];
    evidence: string[];
  };
};
```

`level` 如需展示，只能基于经过验证的映射（当前 ID 1/2 对应 LV1/LV2），与 invasionId 分开。`eligibility` 与 `application` 区分“规则包含这种怪”和“这一只实际污染”。`[]` 的应用结果在规则未还原前不可默认 false，也不静默默认 true。

参数业务名要等证据充分再命名；暂不引入 `singlePhaseHpRatio`、`multiPhaseHpRatio`、`doubleDamageMultiplier` 等看似确定的字段。多个来源同时命中时应记录冲突，优先级未知就保持 unresolved。

### 11.3 HP 计算层

正确层次是：

```text
基础敌人数据
  + Stage / wave / variant HP 上下文
  + 对该 occurrence 生效的 Invasion 规则
  + 经验证的复生／压制模型
  = 该关卡的污染状态与（可解析时的）等效 HP
```

保留现有 `hp.final.maxHpPerBar` 的普通生命语义，另设污染预算与 effective HP，不覆盖模板 HPBase。阶段 HP、共享池和最后阶段复生必须先独立建模；P2/P5 分支未知时不生成精确数值。

短期可交付“配置已识别、公式未解析”的 metadata。若确需提供观察值估算，必须显式写明来源、假设 c=2、参数选择假设、HP 基数与适用版本，并将状态标 estimated；原始值和估算值不能共享一个字段。取整只在清晰定义的边界进行，不能先将 0.72 四舍五入成其他值。

### 11.4 Endgame UI

建议显示：未污染的关卡每管 HP；污染 badge（含档位）；tooltip 中说明复生和上限压制；适用对象／出场规则是否确定。只有估算被明确授权并标注假设，或公式经过验证，才显示“等效额外 HP”“等效总 HP”。

应避免：把 20%/72% 标作必然额外伤害；把 base HP 改成含污染后的值却仍叫基础生命；把 raw pollution HP 说成屏幕灰条长度；把 `hp × phaseCount` 说成精确击杀伤害；把整个 Stage 的全部单位都标成污染。

有序出怪里同 MonsterID 的污染状态不同时应分开显示或给出可理解的规则；规则未解出时显示“部分出场受影响，具体序列未确认”。召唤物污染要在召唤关系或机制说明中体现。

## 12. Open Questions

按阻塞精确公式的优先级排序：

1. **核心实现**：缺 `MCommon_Gluttony_LV1/LV2`、`MCommon_Gluttony_DirtyHp` 定义，以及 `IJJGPIPMNAE` reader 和 `DNILHDGHLGL` predicate。需要同一版本的完整 modifier dump 或客户端类实现；不能用别的复活效果类替代。
2. **参数覆盖链**：reader 查哪张表、如何选档、是否覆盖 MazeBuff.ParamList、失败回退为何；0.35 和 0.72 的差异是否设计残留。
3. **HP 状态转移**：P1 的 0.4 是复生量还是其他阈值；P2/P5 是预算、下限还是上限；P3/P4 各控制什么；2 倍是否独立系数、双重进度或表象。
4. **多阶段分母与分支**：是否由 MaxMonsterPhase、当前 phase、Rank 或其他运行时属性选择；污染逐管生效还是只在最终阶段触发；HP 参考值是单管、总血量还是污染后的上限。
5. **出场规则**：LMEBOHHDIAG 与 MonsterInvasionSeq 的消费、循环、偏移、跨波重置；`[]` 的默认意义；召唤与重新创建的计数。
6. **内容规则**：MaterialWhite 实际检查字段、农本随机性与世界等级门槛；显式 Stage、材料与 NPC 三路冲突优先级。
7. **地图证据缺口**：缺 G261 实体定义，无法将三个 NPC Mark 精确连到战斗 Stage。
8. **伤害口径**：直接 HP 操作、击破、DOT、多段、过量伤害与致死回调先后；计分中的“剩余 HP=0”与真实死亡不是一回事。

## 13. Confidence Matrix

| Finding | Confidence | Evidence / 边界 |
|---|---|---|
| TurnBasedGameData 记录贪饕污染 | Confirmed | 六张表、绑定 ability、InvasionDesc、教程、饕噬状态 |
| 本地 4.5 首次引入为 5d064ec9bd | Confirmed | 4.4→4.5 历史与同 commit 记录 |
| 后续七个本地 4.5 patch 的核心配置未变化 | Confirmed | 表路径历史、逐快照核心行比较；不包含未 dump 热更 |
| 污染属于 Stage/content 运行时附加层 | Confirmed | Stage/Material/NPC 选择与创建时加 modifier；共有模板 HP 不变 |
| 五参数的数值及 MDF 传入槽位 | Confirmed | 参数表、索引 0–4、AddModifier.DynamicValues |
| IJJGPIPMNAE 从 Stage 参数表按实体取参 | Strongly inferred | 专用实体 reader、连续索引、五参数布局；缺类实现 |
| Param1=40% 复生回复 | Plausible | 仅值与复生文本相容，没有消费者 |
| Param2=单血条污染生命比例 | Plausible | 与任务观察算术相符；分支／单位未证实 |
| Param5=多血条污染生命比例 | Plausible | 同上；还缺多阶段基数 |
| Param3/Param4 的具体用途 | Unknown | 恒为 1 且无消费者 |
| 灰血受到 2 倍伤害 | Unknown | 没有运算证据；文本支持上限压制机制类别 |
| 污染含致死后回复与可回复上限降低 | Confirmed | 两条描述、教程、DirtyHp/AccumDirtyHPRatio |
| DBLDCKODNEN 关联 MonsterID | Confirmed | 12/12 join；变体 ID 与模板不同 |
| LMEBOHHDIAG 是 phase/bar 开关列表 | 不支持 | 无多阶段配置的小怪携带 2/3/5 位数组，多阶段 Boss 反为空 |
| LMEBOHHDIAG 用于按出场选择污染 | Strongly inferred | 重复出怪、每怪不同模式；循环细节未知 |
| MonsterInvasionSeq 是通用选怪模式 | Plausible | 仅四条二进制串定义，没有消费者 |
| MaterialWhite 是刷取污染适用白名单 | Strongly inferred | 命名、107 个 MonsterID；具体使用方式未见 |
| NPC 表 ID 对应 NPCMonsterMark | Confirmed | 三行标记及实例位置逐项一致 |
| Adventure Gluttony ability 正文只做视觉效果 | Confirmed | 两个 TriggerEffect，无 HP 任务 |
| 污染影响计分路径 | Confirmed | StrongChallenge 的 Trigger_Mark 分支 |
| 等效 HP=普通总 HP×(1+P/2) 可普遍使用 | Unknown | P 选择、HP 分母、阈值、phase 和溢出均未闭环 |
| HSR-Database 已自动包含污染 HP | 否，Confirmed | 当前 source registry 和 HP 管线没有 Invasion 接入 |

## 14. Evidence / File Index

### 14.1 原始数据索引

| 编号 | 路径／定位 | 核查内容 |
|---|---|---|
| E01 | `T/ExcelOutput/StageMonsterInvasionParam.json` 全文 | 两档五参 |
| E02 | `T/ExcelOutput/StageInvasionConfig.json` 全文 | 五关卡、12 个 MonsterID 及数组 |
| E03 | `T/ExcelOutput/StageInvasionBuff.json`；`T/ExcelOutput/MazeBuff.json:62365,62406` | 两组参数、binding key、描述 hash |
| E04 | `T/ExcelOutput/StageInvasionMaterial.json`；`StageInvasionMaterialWhite.json` | 内容类型、107 个 ID |
| E05 | `T/ExcelOutput/StageInvasionNPCMonster.json`；`NPCMonsterMark.json:3868` | NPC 标记与位置；缺失 G261 的边界 |
| E06 | `T/Config/GlobalConfig/GameCoreConstValue.json:1568`；`T/Config/ConfigAdventureAbility/LocalPlayer/Adventure_AbilityCommon.json:1478` | 常量、两次 TriggerEffect |
| E07 | `T/Config/ConfigAbility/BattleEventAbility_ChallengePeakBattle.json:24831,25035`；同名 `.layout.json:389` | 回调、reader、五 hash、modifier 引用 |
| E08 | `T/ExcelOutput/StatusConfig.json:45474`；`T/TextMap/TextMapCHS.json` 的 `17473651224413707329`、`577611588007700484` | 饕噬与累计不可回复比例 |
| E09 | `T/Config/ConfigGlobalTaskListTemplate/GlobalTaskListTemplate_StageUI.json`；`TutorialGuideGroup.json` GroupID 10501；`TutorialGuideData.json:10728` | 教程解锁与说明 |
| E10 | `T/Config/ConfigAbility/BattleEvent/StrongChallenge_Scoring_Ability.json:645` | GluttonyTrigger_Mark 计分分支 |
| E11 | `T/ExcelOutput/StageConfig.json:20170,20216,304265,304377,306349`；`StageInfiniteGroup/StageInfiniteWaveConfig/StageInfiniteMonsterGroup.json` | 五个实际 Stage 与出怪顺序 |
| E12 | `T/ExcelOutput/MonsterConfig.json:67800,81526`；`MonsterTemplateConfig/MonsterUniqueConfig/MonsterTemplateUniqueConfig.json` | 202206017 变体、召唤列表及 HP 差分 |
| E13 | `T/Config/ConfigCharacter/Monster/Monster_W5_Vtuber_00_Config.json:475`；正文第 7 节各 MonsterID 对应的 JsonConfig | 真正 phase 字段与小怪反例 |
| E14 | `T/Config/ConfigGlobalModifier/` 的 15 组 JSON/layout | 无核心 Gluttony 定义；版本差分只有一份 layout |
| E15 | `T/TextMap/TextMapCHS.json:20167`；`T/TextMap/TextMapEN.json` 同 hash | 两条 InvasionDesc；MazeBuff 自身文本缺失 |
| E16 | `T/ExcelOutput/ChallengeStoryMazeConfig.json` ID 20263/20264；`ChallengeBossMazeConfig.json` ID 30203/30204；`ChallengePeakConfig.json` ID 902；`PlaneEvent.json` | 玩法入口 join |

TextMap 的原始文本是本地证据，不通过数值 hash 转浮点猜测。`T/README.md` 已读取；本地文件名检索未找到单独 LICENSE。本文仅保留必要配置事实和小段证据，不复制整个原始表或媒体资源；未来数据／资产再分发仍需单独核对上游条件。

### 14.2 HSR-Database 源码索引

| 编号 | 路径／定位 | 内容 |
|---|---|---|
| H01 | `H/scripts/data/source-requirements.ts:52,114` | Endgame 表与 sparse Config 范围 |
| H02 | `H/scripts/data/endgame.ts:650,934,1066,1145,1252,1300,1386` | joins、phase、HP、运行时判断、fixed/spawn occurrence |
| H03 | `H/scripts/data/enemy-stats.ts:28`；`enemy-detail.ts:168` | 通用 configured stat 与加值路径 |
| H04 | `H/scripts/data/pure-fiction-hp.ts:30,76` | PF modifier、浮点与取整 |
| H05 | `H/scripts/data/domain/enemy.ts:175,278`；`enemy-detail.ts:44` | 模板／实例与技能 phase |
| H06 | `H/src/lib/domain/endgame-view.ts:352,369,392` | phase 文本、occurrence 合并 |
| H07 | `H/src/lib/domain/endgame.ts:46,64,172,186,215,234` | HP 因子、机制、Stage/Occurrence 层 |
| H08 | `H/scripts/data/localization.ts:180`；`H/docs/architecture/localization-and-data-generation.md`；`H/upstream.lock.json` | TextMap、分层、固定版本 |

### 14.3 可复核的只读命令

以下从共享父目录执行；若存在 Git ownership 提示，在 `git` 后加当前仓库的临时 `-c safe.directory=<绝对路径>`，无需持久修改配置。

```powershell
git -C TurnBasedGameData log -18 --format='%h %ad %s' --date=iso
git -C TurnBasedGameData diff --name-status b11066beac 5d064ec9bd -- 'ExcelOutput/Stage*Invasion*.json'
git -C TurnBasedGameData log --oneline -- ExcelOutput/StageMonsterInvasionParam.json
git -C TurnBasedGameData diff 5d064ec9bd 4ce30f69b3 -- 'ExcelOutput/Stage*Invasion*.json'
git -C TurnBasedGameData diff --stat b11066beac 5d064ec9bd -- Config/ConfigGlobalModifier
rg -n 'MCommon_Gluttony|MDF_AccumDirtyHPRatio|IJJGPIPMNAE|DNILHDGHLGL' TurnBasedGameData --glob '*.json' --glob '!TextMap*'
rg -n '\b202206017\b|\b2054131\b' TurnBasedGameData --glob '*.json' --glob '!TextMap*'
git -C HSR-Database status --short
git -C TurnBasedGameData status --short
git -C StarRailRes status --short
```

HP 差分复核方法：分别用 `git show <ref>:ExcelOutput/<table>.json` 解析两个快照，以 MonsterID 或 MonsterTemplateID 建索引，对共有键比较 HPBase／HPModifyRatio；不要按行号直接对齐不同版本。数组语义复核则按正文列出的 StageInfiniteGroup → Wave → MonsterGroup 路径展开，而不是只看 StageConfig 的预览怪。

### 14.4 交付检查

本轮未修改源码、配置、现有 JSON、脚本、测试、依赖、upstream lock 或生成数据。已核验 UTF-8、14 个章节、代码围栏配对、原始五参数、记录计数及条件算例。交付时 `git status --short --untracked-files=all` 结果如下，三个仓库的 tracked diff 均为空：

```text
HSR-Database:
?? docs/voracity-effect/voracity-effect-investigation.md

TurnBasedGameData: (clean)
StarRailRes: (clean)
```

符合“仅报告文件发生变化”。没有运行会产生新文件的产品构建来验证纯 Markdown 调查。
