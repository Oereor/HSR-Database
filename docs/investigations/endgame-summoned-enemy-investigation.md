# 混沌回忆召唤敌人数值调查（Phase 0）

调查基准日为 2026-11-28（UTC+8）。本文服务于 Endgame 的后续数据和界面设计。

## 1. 执行摘要

上游足以按具体 `MonsterID` 展示召唤候选。当前及历史混沌回忆（Memory of Chaos，MoC）的 6,760 个预置敌人 occurrence 中，有 1,337 个声明了召唤候选。全部 1,913 条原始声明均可解析到具体敌人和模板。这些声明能提供候选身份，实际场上数量、可触发分支和同时出现的组合仍由战斗任务决定。

上游也足以计算明确标注上下文的基础单管 HP 候选值。星启第二波的金血忆灵•雉形使用 Stage Level 95、HardLevelGroup 3 和 EliteGroup 168 时得到 **672,128.774625 HP**，比实测中心 695,000 低 3.29%，是四种配置组合中唯一落入实测区间的一种。该样本无法区分 Stage 上下文与召唤者已经生效的 occurrence 上下文。雉形同时有明确的贪饕三级配置引用，截图估计不能单独验证基础 HP、可回复上限或击杀所需伤害。

有至少两种直接影响数值解释的机制。奎木的任务明确要求继承 `CurrentHP` 和 `MaxHP`。昔在、今在、永在的剧目通过 `DefineHPSharedGroup` 配置共享生命关系。后续可以先支持候选目标入口，对缺少数值依据的目标展示未知。基础单管 HP、独立最大 HP 和有效总 HP 分别保留语义。

## 2. 上游版本与配置来源

| 来源 | 实际值 |
| --- | --- |
| 上游 checkout 与 `upstream.lock.json` | `25cf028e97b54a640c674bd8ce0c8a4d65805c8d` |
| 客户端数据版本 | `OSPRODWin4.7.0_D17300783_A17211182_L17175930` |
| 赛期及战斗入口 | `ChallengeGroupConfig`、`ChallengeMazeConfig`、`ChallengeMazeTierce`、`ScheduleDataChallengeMaze`、`ScheduleDataGlobal`、`PlaneEvent`、`StageConfig` |
| 敌人、属性与技能 | `MonsterConfig`、`MonsterTemplateConfig`、`MonsterSkillConfig`、`HardLevelGroup`、`EliteGroup` |
| 战斗事件与污染 | `BattleEventConfig`、`StageInvasionConfig`、`StageInvasionBuff`、`StageMonsterInvasionParam`、`MazeBuff` |
| 技能和数据绑定 | `Config/ConfigCharacter/Monster/`、`Config/ConfigAbility/`、`Config/ConfigGlobalModifier/`、`Config/ConfigGlobalTaskListTemplate/`、Stage 引用的 `Config/Level/` |

调查数据记录实际读取的配置路径以及 Ability 和 modifier 的 JSON Pointer。中文标签来自同一 pin 的 `TextMapCHS`，仅用于说明。关系通过外键和具体实例 ID 查找。`*.layout.json` 用于定位具名 Ability、modifier 和任务模板，分析以配置正文为准。4.7 已提供贪饕的 Ability 和 modifier 正文，涉及这一点的判断以当前 pin 为准。 [数据架构](../architecture/localization-and-data-generation.md) · [敌方技能详情调查](../enemy-skill-details/enemy-skill-details-investigation.md) · [阶段 HP 审计](endgame-phase-hp-audit.md) · [Endgame modifier 调查](endgame-modifiers-config-investigation.md) · [贪饕机制早期调查](../voracity-effect/voracity-effect-investigation.md)

## 3. MoC 召唤关系全量统计

以 `ChallengeGroupConfig → ChallengeMazeConfig → PlaneEvent → StageConfig.MonsterList` 独立展开预置敌人。星启通过 Group 的 `TierceID` 定位 Tierce，只有 Tierce 的父 ID 匹配当前第十二层 encounter 时才展开第三节点。原始展开与 `buildEndgameDomain` 逐条核对 Group、encounter、slot、Event、Stage、波次、位置和 `MonsterID`，并核对每条原始 `SummonIDList` 及预置敌人的 EliteGroup provenance。

| 统计单位 | 数量 |
| --- | ---: |
| 生产 MoC domain 中的所有 Group / 预置 occurrence | 58 / 7,409 |
| 当前及历史 Group / encounter / Stage occurrence | 53 / 586 / 1,406 |
| 当前及历史预置 occurrence / 有召唤声明的 occurrence | 6,760 / 1,337 |
| 召唤者 Variant / 目标 Variant / 不同 Variant 对 | 60 / 64 / 103 |
| 按不同召唤者 Variant 统计的原表引用 / 按 occurrence 展开后引用 | 115 / 1,913 |
| 按 occurrence 和目标去重后的候选 | 1,746 |
| 1,913 条原始声明中的有效 / 非法 ID / 找不到敌人或模板 | 1,913 / 0 / 0 |
| 同一具体 ID 同时出现在预置与候选范围内的目标 | 19 |

Group `1036` 是调查日的当前赛期。Group `1014` 的 `EndTime` 与 `GlobalEndTime` 有冲突，分别为 2024-06-24 和 2024-06-19，两个候选时间均早于基准日，因此调查统计归入历史赛期，网站的排期状态仍按现有规则处理。常驻 Group `100`、`900`，2033 年配置 `108`、`109`，以及未来 Group `1037` 均保留在全库存数据中，另列于赛期口径表。

### 声明与 Ability 的一致性

调查脚本从 concrete Monster 的技能列表、Character Config 的入口与技能绑定、以及具名的 modifier、嵌入 Ability 和任务模板追踪相关任务。`AAAR` 单常量表达式、有明确读取键的 CustomValue、可解析的 SkillParam 或 BattleEvent 参数能提供具体 ID。只有哈希、没有确定数据绑定的表达式保留为 unresolved。任务条件和命名引用保留出处，脚本未求解运行时 AI 和条件分支。Ability 能提供的外键证据与游戏运行时是否触发是两层结论。

| 1,746 个声明候选的任务证据 | 数量 | 含义 |
| --- | ---: | --- |
| 具体目标也能从具名任务解析 | 87 | 任务正文和声明指向同一 `MonsterID` |
| 有动态生成任务，目标表达式尚未解析 | 1,633 | 声明支持候选身份，动态任务的具体输入仍待核实 |
| 已追踪的任务中缺少匹配 | 26 | 保留缺失证据的状态 |

另外有 14 个 occurrence 与列表外任务目标配对，涉及 3 个 concrete Variant 对。`3014020 → 3012031` 的 5 个配对可解析到敌人配置，路径经过 `MMonster_W3_Death_00_MainLine02_DeathControl`。任务名与条件提示它可能服务于剧情分支，当前材料无法确认 MoC 可达性。`8034010` 和 `803401004` 指向 `9002231` 的 9 个配对来自 `Monster_W3_Aventurine_00_Skill08_Phase02`，该 ID 在所查常规、Unique 和 Test 敌人配置中均未匹配到具体单位。这些配对保持在待调查数据中。 [何物朝向死亡 Ability](../../../TurnBasedGameData/Config/ConfigAbility/Monster/Monster_W3_Death_00_Ability.json) · [诡弈砂金 Ability](../../../TurnBasedGameData/Config/ConfigAbility/Monster/Monster_W3_Aventurine_00_Ability.json)

关卡生成与敌人技能分开计数。`StageConfigData._CreateBattleEvent → BattleEventConfig.AbilityList` 可触发关卡内的独立生成任务。例如 Stage `30105011` 的 BattleEvent `30128` 含 `SummonMonster`，其中常量表达式指向 `800205060`。6 个被引用的 BattleEvent Ability 含召唤任务，其中 5 个提供可读出的具体目标 ID。按不同 Stage、来源和目标统计有 138 个配对，24 个可解析到 `800205060`，114 个指向缺少 `MonsterConfig` 的 `800205000`。BattleEvent `30133` 的目标仍为动态表达式。这些任务在调查数据中归属对应关卡事件。 [关卡通用图](../../../TurnBasedGameData/Config/Level/StageCommonTemplate.json) · [BattleEvent Ability](../../../TurnBasedGameData/Config/ConfigAbility/BattleEventAbility_2.json)

声明图中有 `8022010 → 8022010`、`8022012 → 8022012` 和 `100402016 → 100402016` 三个自引用见证。`3024030 → 8022012`、真蛰虫各实例 → `8022010` 形成从首层列表进入递归候选的路径。深度优先遍历遇到当前路径上的节点时记录并终止该分支。杰帕德变体 `100402016` 的同一 ID 在原表中重复两次，其 CustomValues 另列 `1002050` 和 `1002030`，无法仅凭图确认这场战斗会召唤杰帕德自身。未发现跨 ID 回边见证。阶段条件在 13 个有结构化证据的 Variant 中出现，阶段分裂和替换需结合 modifier 另行解释。

## 4. 属性上下文与数值候选

### 4.1 当前预置敌人的精确规则

MoC 固定波的每管基础 HP 使用以下四个必需因子，按无损十进制相乘。

$$
H_{\mathrm{base}} = H_{\mathrm{template}} \times R_{\mathrm{monster}} \times R_{\mathrm{hard}} \times R_{\mathrm{elite}}
$$

$H_{\mathrm{template}}$ 取 `MonsterTemplateConfig.HPBase`，$R_{\mathrm{monster}}$ 取具体 `MonsterConfig.HPModifyRatio`。$R_{\mathrm{hard}}$ 通过 `(Stage.HardLevelGroup, Stage.Level)` 查 `HardLevelGroup.HPRatio`，$R_{\mathrm{elite}}$ 优先采用 Stage 的 `EliteGroup.HPRatio`，Stage 缺省时采用当前预置敌人自身组并标记 `monster-fallback`。HP 的四个 `Value` 无隐式 1 倍；缺少包装或必要表行会报诊断。MoC 的每管基础结果在显示时才四舍五入。阶段倍率来自 Character Config 与具体技能参数，按阶段解析器取明示值或允许的默认值，再对精确基础 HP 相乘。阶段倍率不确定时保留 unresolved。 [Endgame domain 生成](../../scripts/data/endgame.ts) · [十进制与阶段 HP 实现](../../scripts/data/enemy-phase-hp.ts)

Speed 和内部 Stance 使用 `((模板基础值 × 实例倍率) + 实例加值) × HardLevel 比率 × Elite 比率`。实例倍率和加值缺省时分别采用 1 和 0，模板基础值缺失时标记不可用，两个组倍率仍需有效。展示韧性由内部 Stance 换算，当前是内部 3 点对应展示 1 点。这里验证的是网站公式及原表值。HP 的实测样本对 Speed 和 Stance 的运行时继承没有验证力。 [配置属性解析](../../scripts/data/enemy-stats.ts) · [Endgame 视图](../../src/lib/domain/endgame-view.ts)

### 4.2 召唤目标的候选解释

| 变量 | 并行计算的配置来源 | 当前证据边界 |
| --- | --- | --- |
| Level | 当前 Stage 的 `Level` | 固定波使用该值，雉形任务未提供其他等级。基准样本支持联合组合，单凭它无法独立验证 Level。 |
| HardLevelGroup | Stage 或召唤者已生效的组，召唤者 MonsterConfig，目标 MonsterConfig | 当前固定波的前两个解释在数值上等价。1,177 个案例中 Stage 与目标 MonsterConfig 的组不同。 |
| EliteGroup | Stage 有值时取 Stage、否则以目标 MonsterConfig 为默认，召唤者 occurrence 的实际组，召唤者 MonsterConfig，目标 MonsterConfig | 776 个案例的召唤者实际组与目标自身组不同。当前声明关系的双方 MonsterConfig 中没有组不同的例子。 |
| 任务覆写 | `OverrideEliteGroup`，`InheritPropertyList`，`OnMonsterCreate` | `TotalAttack_Ability` 明示 `OverrideEliteGroup`，正文中可见 `604` 和 `605`。这个对照证明任务形式支持覆写，尚无证据将它应用到雉形。奎木明示继承当前与最大 HP。创建回调需要按实际引用和目标检查。 |
| 创建后 modifier | 召唤者 AddModifier、目标被动、关卡事件及污染 | 必须逐条确认触发条件、目标和操作。延迟、位置、弱点继承与 HP 分开记录。 |

Stage Level 固定后，1,746 个声明候选的必要数值输入均可读取。710 个候选的各套规则给出相同 HP，469 个给出两种 HP，567 个给出四种 HP。配置中的不同组有时共享同等级同属性倍率，因此按精确结果统计，不以组 ID 个数代替。数值相同的候选保留来源。未对同一敌人构造拟合系数。 [属性候选与来源 JSON](endgame-summoned-enemy-investigation.json) · [任务覆写对照](../../../TurnBasedGameData/Config/ConfigAbility/BattleEvent/TotalAttack_Ability.json)

## 5. 金血忆灵•雉形实测与完整引用链

| 配置 | 定位结果 |
| --- | --- |
| `ChallengeGroupConfig.GroupID` | `1036`，`GroupName.Hash=14811652691374467298`，中文文本为物竞天择 |
| `ScheduleDataChallengeMaze.ID` | `201036`，2026-11-02 04:00 至 2026-12-14 04:00 |
| `ChallengeMazeConfig.ID` | `5512`，`Floor=12`，常规节点 Event 为 `30126121` 和 `30126122` |
| `ChallengeGroupConfig.TierceID` | `5513`，`ChallengeMazeTierce.PHFMCACHFIJ=5513`，`DLCKKJFMJOB=5512`，`HFIAAGAKFMD=[30126123]` |
| `PlaneEvent.EventID → StageConfig.StageID` | `30126123 → 30126123`，基础及 WorldLevel 记录均指向同一 Stage |
| 星启 Stage 属性 | `Level=95`，`HardLevelGroup=3`，`EliteGroup=168` |
| 第二波 `MonsterList[1].Monster0` | `4064010`，金血忆灵•裁定忘却之形，模板 `4064010` |
| `MonsterConfig[4064010].SummonIDList` | `[4062010]`，雉形的 concrete MonsterID 与模板均为 `4062010` |
| 目标数值配置 | `MonsterTemplateConfig[4062010].HPBase=232.5`，`MonsterConfig[4062010].HPModifyRatio=1`，目标与召唤者自身表的 HardLevelGroup 和 EliteGroup 均为 `1` |

召唤者 Skill02 的 `Monster_W4_Serpent_01_Skill02_Phase02` 有四处 `SummonMonster` 任务节点，使用同一个 `AQAR` 动态哈希 `1509106746`，嵌套分支含阶段条件。原始列表只声明雉形，Skill02 文本也指名召唤雉形。任务本身未写出具体数字 ID、Level、HardLevelGroup、EliteGroup 或 `InheritPropertyList`，调查数据保留动态哈希 unresolved。后续对新实体使用 `MCommon_Servant` 和 `MMonster_W4_Serpent_01_Summon_Deathrattle`。前者配置召唤者死亡时的强制清理，后者插入召唤者 Ability，任务包含 `DamageStance`。基准 Variant 的这条召唤路径提供了独立目标和死亡后削韧的证据。 [裁定忘却之形 Character Config](../../../TurnBasedGameData/Config/ConfigCharacter/Monster/Monster_W4_Serpent_01_Config.json) · [裁定忘却之形 Ability](../../../TurnBasedGameData/Config/ConfigAbility/Monster/Monster_W4_Serpent_01_Ability.json) · [通用 Servant modifier](../../../TurnBasedGameData/Config/ConfigGlobalModifier/GlobalModifier_Common_Specific.json)

Stage 同时声明 `_CreateBattleEvent=30149`，对应 `BattleEventAbility_Challenge_Month_49`。已解析的正文包含为我方触发欢愉相关行为的回调，未提供雉形的属性因子。另一条独立配置链为 `StageInvasionConfig[30126123] → InvasionID 3 → StageInvasionBuff → MazeBuff 3034003 → ChallengePeakBattle_GluttonyAbility_LV3`。该 Stage 的污染目标表显式列出 `4062010`，其 `LMEBOHHDIAG` 是 `[1, 0]`。Ability 在 `OnListenCharacterCreate` 中经条件读取五个索引，对 `ParamEntity` 尝试附加 `MCommon_Gluttony_LV3`。modifier 正文包含 `LockTargetHP`、`OnBeforeMortallyWonded`、`OnHPChange` 和 `DirtyHPRatio`，并有 Servant 专用锁血分支。`StageMonsterInvasionParam` 的五值为 `[0.6, 0.8, 1, 3, 1.44]`，`MazeBuff.ParamList` 为 `[0.65, 0.3, 0.5, 1, 0.5]`。实际分支选择、该选择数组的具体含义和五个槽位的运行时来源仍待验证，表中两组参数均保留了原值。 [Stage 污染配置](../../../TurnBasedGameData/ExcelOutput/StageInvasionConfig.json) · [贪饕绑定 Ability](../../../TurnBasedGameData/Config/ConfigAbility/BattleEventAbility_ChallengePeakBattle.json) · [贪饕 modifier](../../../TurnBasedGameData/Config/ConfigGlobalModifier/GlobalModifier_Common_Gluttony.json)

## 6. 雉形候选公式对拍

用户给出的 2048 × 1152 截图测量摘要为总伤害 148,942、完整血条约 98 px、剩余约 77 px、损失约 21 px。调查按给定摘要复算。若受击前处于满血，且显示伤害全部等于目标实际 HP 下降量，则中心推算为 $148942 \times 98 / 21 \approx 695062.67$。损失宽度在 20–22 px 时估计为约 663,469–729,816。表中采用用户约定的 660,000–730,000 区间及 695,000 中心。

| Level | `HPBase` | `HPModifyRatio` | HardLevelGroup / HPRatio | EliteGroup / HPRatio | 额外已证实的基础 HP 因子 | 精确 HP | 相对中心 | 区间内 |
| ---: | ---: | ---: | --- | --- | --- | ---: | ---: | :---: |
| 95 | 232.5 | 1 | `3` / `375.4385` | `168` / `7.7` | 无 | 672,128.774625 | −3.2908% | 是 |
| 95 | 232.5 | 1 | `3` / `375.4385` | `1` / `1` | 无 | 87,289.45125 | −87.4404% | 否 |
| 95 | 232.5 | 1 | `1` / `294.42172` | `168` / `7.7` | 无 | 527,088.48423 | −24.1599% | 否 |
| 95 | 232.5 | 1 | `1` / `294.42172` | `1` / `1` | 无 | 68,453.0499 | −90.1506% | 否 |

首行显示为 672,129 HP。在它的基础 HP 假设下，148,942 伤害相当于约 21.72 px 的血条宽度，落在像素测量容差内。贪饕配置证明这只雉形有额外的战斗状态来源，尚不足以从右上角伤害数字与单次血条变化反推出可回复上限或击杀所需伤害。四行的静态 Speed 均为 132，内部 Stance 均为 90，展示韧性均为 30。本样本无法验证它们的组来源。

## 7. 跨关卡与代表性案例

| 案例 | 可复核的配置或数值 |
| --- | --- |
| 杰帕德 `1004020` | `Skill12_Phase02` 按位置走多条召唤任务，具体实例的 CustomValues 与声明均列 `1002050`、`1002030`。这两个目标也作为预置敌人出现。`100402016` 的自引用与常规变体不同，保留为声明与任务范围待核查。 |
| 史瓦罗 `1014010` | `Monster_W1_GS_Svarog_Skill07_Phase02` 明载 `1012040`。Stage `30001242` 的静态候选合并为 70,362.78816 HP。Stage `30016182` 的 EliteGroup 倍率相同而 HardLevelGroup 不同，得到 38,264.09391 和 36,096.1027875 HP。后者适合独立检验 HardLevel 来源。 |
| 丰饶玄鹿 `2024010` / `202401008` | `Skill01` 至 `Skill04` 的 `Phase02` 各有生成任务，声明列 `2022070`、`2022080`、`2022090`、`2022100`。`2022070` 与 `2022090` 也有预置 occurrence。各动态哈希到分支的映射保留未决。 |
| 银枝 `3024010` / `302401012` | `Skill03`、`Skill07`、`Skill08` 触发不同组合，CustomValues 和声明列 `3021020`、`3021030`、`3021040`。Stage `30017202` 的 `3021020` 静态候选为 39,684.1060275 和 35,141.6484375 HP。 |
| 天谴先锋 `4013010` | 赛期中出现的 `4013010` 与 `401301003` 声明 `4012010`。`Skill05_Phase02` 的任务根据条件可列 4、2 或 1 项。未进入统计口径的 `401301007` 与 `401301009` 分别显式配置 `401201014`、`401201016`，与基础模板同名也应分别保留实例 ID。 |
| 虫群与碎星王虫 | 已出现的真蛰虫 `8024011` 等实例声明 `8022010`，幼蛰虫 `8022010` 和 `8022012` 仍分别声明自身。碎星王虫 `8025010`、`802501001`、`802501003` 在当前及历史口径缺少召唤者 occurrence，作为配置对照。其中 `802501003` 的候选为 `802203003` 和 `802202006`，与 `8025010` 的 `8022030` 和 `802202001` 不同。 |

同一裁定忘却之形 `4064010` 在五个 MoC occurrence 声明同一雉形。以 Stage 生效上下文计算，Group `1027` 的 Stage `30117122` 也为 Lv.95，EliteGroup `288`，得到 279,326.244 HP。Group `1029`、`1030`、`1032` 的相应 Stage 为 Lv.92、EliteGroup `266`，三个候选均为 149,541.5076 HP。星启为 672,128.774625 HP。相同目标 `4062010` 也在 Group `1029` 第三层 `4803`、Stage `30119032` 第一波预置两次，生产预置规则得 27,331.49565 HP。这个交叉证明同一 concrete ID 能在两种场景中定位，也提供了观察不同数值上下文的对照。现有实测仅覆盖星启样本。 [全量数值与出现记录](endgame-summoned-enemy-investigation.json)

## 8. 特殊 HP 与可能的误判

已追踪的声明图关联 Variant 中，31 个至少命中一项 HP 特殊信号。按 Variant 去重，`DefineHPSharedGroup` 命中 7 个，锁血操作命中 28 个，显式召唤 HP 继承命中 1 个。类别有重叠。扫描信号涵盖召唤者与声明图中的目标，具体操作有可能指向召唤者自身、其他战斗实体或剧情分支。贪饕来自 Stage，另计 1 个声明候选 occurrence。以下为已阅读主体和目标路径的案例。

| 具体召唤者 → 目标 | 机制与证据 | 独立 HP 的展示结论 |
| --- | --- | --- |
| `3004012 → 3003031 / 3003041 / 3003051` | `Monster_W3_FigureBoss_00_Ability` 的 `MMonster_W3_DollElite_Boss_Initiate` 定义共享组，主实体是 modifier owner，子目标为回调提供的 `ParamEntityList`。另有阶段伤害分配与锁血操作。 | 可算配置基础值，例如 `3003031` 在 `30119111` 的 Stage 组合为 657,982.63344 HP。这个值缺少作为独立可耗尽生命池的依据，界面优先标记共享机制。 |
| `2022050 → 2022051` | 奎木 `Monster_W2_Beast01_01_Skill02_Phase02` 左右分支均声明 `InheritPropertyList=[CurrentHP, MaxHP]`，任务使用同一 CustomValue hash。具体 MonsterConfig 另给出 `SummonID01=2022051`。 | Stage `30007211` 上按目标模板得出的 27,530.04972 HP 只是静态候选。生成当刻的属性需读取运行时来源，尤其受召唤者当前 HP 影响的部分。 |
| `4064010 → 4062010` | `MMonster_W4_Serpent_01_Summon_Deathrattle` 触发召唤者任务削减韧性，`MCommon_Servant` 负责召唤者死后的清理。Stage `30126123` 额外绑定贪饕三级。 | 保留可对拍的基础单管候选，另标贪饕和死亡回调。削韧、强制清理与共享生命是不同的配置行为。 |
| `4064012 → 406201002 / 406201007 / 406202002 / 406301003` | 迷惘之渊的裁定者是同系配置对照。`Monster_W4_Serpent_01_Ability_IF` 的 `MMonster_W4_Serpent_01_IF_SkillEX03_ShareHP` 定义共享组，并传入 `MDF_MaxHPAddRatio`。`MMonster_W4_Serpent_01_IF_Summon_SpecialLimboController` 另有锁血，分裂发生于初始/阶段切换路径。 | 假死、合体和共享组使独立击杀 HP 无法用通用公式表达。保留此类来源与具体目标，避免将这套 IF 行为套到 `4064010`。 |
| `1014010 → 1012040` | 本体 Ability 中存在 `SpecialVictory_LockHP`，还含对本体、机械臂和被控制角色的不同目标操作。固定 ID 的机械臂召唤任务本身未显式声明继承 HP。 | 配置足以计算机械臂静态候选。判定其实际战斗 HP 时，需确认生效 modifier 及其目标。 |

上述搜索覆盖常见共享、锁血、`SetHP`、属性叠加、阶段分裂和死亡回调。若遇到死亡后向主实体传伤，只有显式的主／从共享组或等价的共同状态证据才归类为共享生命池。静态工具保留这些操作的文件、回调、目标表达式及所需条件，无法证明拥有独立 HP 的机制实体保持未知。 [剧目 Ability](../../../TurnBasedGameData/Config/ConfigAbility/Monster/Monster_W3_FigureBoss_00_Ability.json) · [奎木 Ability](../../../TurnBasedGameData/Config/ConfigAbility/Monster/Monster_W2_Beast01_01_Ability.json) · [迷惘之渊的裁定者 Ability](../../../TurnBasedGameData/Config/ConfigAbility/Monster/Monster_W4_Serpent_01_Ability_IF.json)

## 9. 已确认、待验证与下一批实测

- **配置确认。** concrete `MonsterID` 是需要保留的身份。原始列表允许重复、阶段/分支相关和递归。Ability 可以声明继承生效属性或覆写 EliteGroup，关卡事件可以独立生成目标。预置敌人的 HP、Speed、Stance 配置计算及其 provenance 已由现有代码确认。
- **有实测支持的候选。** 星启雉形支持使用当前关卡已经生效的两个组，四个测试组合中只有这一组符合区间。样本精度不足以给出精确 HP，也缺少跨关卡观测与贪饕血条状态确认。
- **待验证。** Level 的实际生成来源、Stage 与召唤者 occurrence 的优先级、创建时对贪饕或其他 buff 的继承、运行时属性 HP 锁定、以及 Speed 与 Stance 的上下文。就当前 MoC 固定波而言，Stage 与召唤者共享有效组的案例无法区分这两个来源，需要寻到会使两者不同的任务或取得生成时的实际属性记录。
- **实测设计。** 优先对同一雉形追踪同一 Lv.95 下的 Group `1027` 与 `1036`，以及 Group `1029` 的 Lv.92 召唤样本。分别记录普通血条、可回复部分、单目标结算伤害、等级与是否处于污染。若只能验证历史记录，可选 `30016182` 的史瓦罗机械臂，用满血状态下多次独立伤害观测区分 HardLevel 的两组预测。对奎木分别在召唤者满血与已受伤时观察生成的狈影，对照当前 HP 与最大 HP 继承。Speed 用行动值与回合顺序验证，Stance 用已知削韧量验证。

## 10. 下一阶段数据与界面建议

生产模型可在召唤者 occurrence 下附加候选关系，引用精确目标 `MonsterID` 与模板 ID，并携带关系证据、基础单管 HP 的上下文来源和估计状态。可先交付候选身份与特殊机制提示，积累独立证据后再打开可靠的数值。将声明集合、任务目标和关卡机制来源放在各自的归属位置。前端卡片入口打开 Dialog，复用 `EndgameEnemyCard` 和现有 Grid。只有预置 occurrence 参与初始敌人数和波次总 HP。缺少可靠上下文或独立生命语义的目标显示未知。

### 复现

在 `HSR-Database/` 运行以下命令。脚本使用环境变量 `HSR_DATA_ROOT` 或默认的 `../TurnBasedGameData`，读取 checkout 的实际 SHA，与项目 pin 一同写入数据。

```powershell
pnpm exec tsx scripts/investigations/endgame-summoned-enemy.ts
pnpm exec tsx scripts/investigations/endgame-summoned-enemy.ts --check
```

`relationRows` 定位声明候选，`profiles` 提供具体 Variant 的任务与 modifier 证据，`numericProfiles` 按 `目标:等级:HardLevelGroup:EliteGroup` 保存数值，`stageSpawnSources` 和 `stageOnlyTargets` 记录关卡生成。`benchmark` 保存配置链与候选对拍。脚本内校验原始配置与现有 domain 的 occurrence 与原始候选集合一致，并用带重复边、自引用和跨 ID 环的输入检查遍历终止。 [调查脚本](../../scripts/investigations/endgame-summoned-enemy.ts) · [全量调查数据](endgame-summoned-enemy-investigation.json)
